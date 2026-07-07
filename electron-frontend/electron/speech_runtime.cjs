/**
 * speech_runtime.cjs — offline Japanese speech-to-text via a persistent
 * faster-whisper subprocess (scripts/speech_recognition_server.py).
 *
 * The Python process is spawned lazily on first use and stays alive so the
 * (multi-second) model load only happens once per app session. Requests are
 * sent as newline-delimited JSON over stdin and matched to responses by an
 * incrementing request id.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const REQUEST_TIMEOUT_MS = 20000
const SPEECH_TIERS = ['fast', 'balanced', 'high', 'ultra']

function resolveAssetsBaseDir() {
  return (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
}

function readActiveSpeechTier(docsBase) {
  try {
    const raw = fs.readFileSync(path.join(docsBase, 'whisper', 'active-speech-model.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string') return parsed.tier
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

// Maps to the model directory layout written by scripts/get_whisper_model.py
// and electron/setup_runtime.cjs: Documents\JPLearn\whisper\<tier>\model.bin.
function resolveModelDir(repoRoot) {
  const docsDir = resolveAssetsBaseDir()
  const candidates = []

  if (docsDir) {
    const activeTier = readActiveSpeechTier(docsDir)
    if (activeTier) candidates.push(path.join(docsDir, 'whisper', activeTier))
    for (const tier of SPEECH_TIERS) candidates.push(path.join(docsDir, 'whisper', tier))
  }
  for (const tier of SPEECH_TIERS) {
    candidates.push(path.resolve(repoRoot, 'data', 'whisper', tier))
  }

  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'model.bin'))) {
      return dir
    }
  }
  return null
}

function resolvePythonCommand(repoRoot) {
  const resourcesPath = (process.resourcesPath || '').trim()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'python-bundle', 'python', 'python.exe')
    if (fs.existsSync(bundled)) return bundled
  }
  const venvWin = path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvWin)) return venvWin
  return 'python'
}

// Rough heuristic mapping faster-whisper's average log-probability per
// segment (typically in the range of about -1.5 to 0, closer to 0 is
// better) onto a 0-1 confidence score for the minigame's confidence
// thresholds. This is intentionally simple; tune later with real usage data.
function estimateConfidence(avgLogprob) {
  if (typeof avgLogprob !== 'number' || !Number.isFinite(avgLogprob)) {
    return 0
  }
  const scaled = 1 + avgLogprob / 1.2
  return Math.max(0, Math.min(1, scaled))
}

function createSpeechRuntime(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..', '..')

  let child = null
  let stdoutBuffer = ''
  let nextRequestId = 1
  const pending = new Map()
  let lastError = null
  let startPromise = null

  function handleStdoutData(chunk) {
    stdoutBuffer += chunk.toString()
    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      newlineIndex = stdoutBuffer.indexOf('\n')
      if (!line) continue

      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      const entry = pending.get(parsed.id)
      if (!entry) continue
      pending.delete(parsed.id)
      clearTimeout(entry.timer)
      if (parsed.error) {
        entry.reject(new Error(parsed.error))
      } else {
        entry.resolve({
          text: typeof parsed.text === 'string' ? parsed.text : '',
          confidence: estimateConfidence(parsed.avg_logprob),
          durationMs: typeof parsed.duration_ms === 'number' ? parsed.duration_ms : null,
          languageProbability: typeof parsed.language_probability === 'number' ? parsed.language_probability : null,
        })
      }
    }
  }

  function ensureStarted() {
    if (child) return Promise.resolve()
    if (startPromise) return startPromise

    startPromise = new Promise((resolve, reject) => {
      const modelDir = resolveModelDir(repoRoot)
      if (!modelDir) {
        startPromise = null
        reject(new Error('No speech recognition model installed. Install one from Settings > Speech Recognition.'))
        return
      }

      const scriptPath = path.join(repoRoot, 'scripts', 'speech_recognition_server.py')
      const pythonCmd = resolvePythonCommand(repoRoot)
      const proc = spawn(pythonCmd, [scriptPath], {
        env: { ...process.env, SPEECH_MODEL_DIR: modelDir },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      proc.stdout.on('data', handleStdoutData)
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim()
        if (text) lastError = text
      })
      proc.on('error', (error) => {
        lastError = error.message
        child = null
      })
      proc.on('close', () => {
        for (const entry of pending.values()) {
          clearTimeout(entry.timer)
          entry.reject(new Error('Speech recognition process exited unexpectedly'))
        }
        pending.clear()
        child = null
      })

      child = proc
      resolve()
    }).finally(() => {
      startPromise = null
    })

    return startPromise
  }

  async function transcribe(audioPath, opts = {}) {
    await ensureStarted()
    if (!child) {
      throw new Error(lastError || 'Speech recognition process is not running')
    }

    const id = nextRequestId++
    const request = { id, audio_path: audioPath, language: opts.language || 'ja' }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Speech recognition timed out'))
      }, REQUEST_TIMEOUT_MS)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify(request)}\n`)
    })
  }

  function getStatus() {
    return {
      available: resolveModelDir(repoRoot) !== null,
      running: child !== null,
      lastError,
    }
  }

  function unload() {
    if (child) {
      try { child.kill() } catch { /* ignore */ }
      child = null
    }
  }

  function restart() {
    unload()
    startPromise = null
  }

  return { transcribe, getStatus, unload, restart }
}

module.exports = { createSpeechRuntime }
