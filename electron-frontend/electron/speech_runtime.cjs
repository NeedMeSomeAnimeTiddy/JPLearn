/**
 * speech_runtime.cjs — offline Japanese speech-to-text via a persistent
 * faster-whisper subprocess (scripts/speech_recognition_server.py).
 *
 * Same shape as ocr_runtime.cjs (audit 5, F5): the Python process is spawned
 * lazily, requests are newline-delimited JSON over stdin matched back by an
 * incrementing id, and calls are queued one at a time because the server
 * handles one at a time. A timed-out request kills the process, the first
 * request on a new process gets the longer cold budget (the server loads the
 * Whisper model before it reads stdin), and the process is unloaded after a
 * spell of inactivity once nothing is in flight or queued.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { resolvePythonCommand } = require('./python_command.cjs')

// A warm transcription of a spoken answer takes well under a second; twenty
// seconds means something is wrong.
const DEFAULT_REQUEST_TIMEOUT_MS = 20000
// The first request on a fresh process also waits for the Python import, the
// GPU probe and the model load. Measured 2026-10-28: the `fast` tier on CUDA
// loads in 6-12 s; larger tiers and CPU take longer and were not measured, so
// this is generous. It stops a wedged process, not honest work.
const DEFAULT_COLD_REQUEST_TIMEOUT_MS = 3 * 60 * 1000
const DEFAULT_INACTIVITY_UNLOAD_MS = 5 * 60 * 1000
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
  const scriptPath = options.scriptPath || path.join(repoRoot, 'scripts', 'speech_recognition_server.py')
  const spawnFn = typeof options.spawnFn === 'function' ? options.spawnFn : spawn
  const resolveModel = typeof options.resolveModelDir === 'function'
    ? options.resolveModelDir
    : () => resolveModelDir(repoRoot)
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(1000, Math.floor(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS
  const coldRequestTimeoutMs = Number.isFinite(options.coldRequestTimeoutMs)
    ? Math.max(requestTimeoutMs, Math.floor(options.coldRequestTimeoutMs))
    : Math.max(requestTimeoutMs, DEFAULT_COLD_REQUEST_TIMEOUT_MS)
  const inactivityUnloadMs = Number.isFinite(options.inactivityUnloadMs)
    ? Math.max(15000, Math.floor(options.inactivityUnloadMs))
    : DEFAULT_INACTIVITY_UNLOAD_MS

  let child = null
  let stdoutBuffer = ''
  let stderrTail = ''
  let nextRequestId = 1
  let pending = null
  let queueTail = Promise.resolve()
  let unloadTimer = null
  let lastError = null
  let inFlightCount = 0
  // Whether the current child has answered anything yet, i.e. whether its model is loaded.
  let childHasResponded = false

  function clearUnloadTimer() {
    if (unloadTimer) {
      clearTimeout(unloadTimer)
      unloadTimer = null
    }
  }

  // Armed only once every request has settled, including ones still queued, so it never fires
  // mid-request.
  function scheduleInactivityUnload() {
    clearUnloadTimer()
    if (inFlightCount > 0 || !child) {
      return
    }
    unloadTimer = setTimeout(() => {
      unloadTimer = null
      stopChild()
    }, inactivityUnloadMs)
  }

  // Only the request sent to `proc` is settled by `proc`'s failure: a killed process's late
  // 'close' must not reject the request a fresh process is already answering.
  function rejectPendingFor(proc, error) {
    if (!pending || pending.proc !== proc) return
    const entry = pending
    pending = null
    clearTimeout(entry.timer)
    entry.reject(error)
  }

  function stopChild() {
    const current = child
    child = null
    stdoutBuffer = ''
    childHasResponded = false
    if (!current) return
    try {
      current.kill()
    } catch {
      // Process may already be gone.
    }
  }

  function handleStdoutData(proc, chunk) {
    if (child !== proc) return
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
      if (!pending || parsed.id !== pending.id) {
        continue
      }
      const entry = pending
      pending = null
      clearTimeout(entry.timer)
      childHasResponded = true
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
    if (child) return

    const modelDir = resolveModel()
    if (!modelDir) {
      throw new Error('No speech recognition model installed. Install one from Settings > Speech Recognition.')
    }

    const pythonCmd = resolvePythonCommand(repoRoot)
    stderrTail = ''
    const proc = spawnFn(pythonCmd, [scriptPath], {
      env: { ...process.env, SPEECH_MODEL_DIR: modelDir },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout.on('data', (chunk) => handleStdoutData(proc, chunk))
    // a write to a process that has just died fails later on stdin (EPIPE); unheard, it would crash
    // the main process. Its 'close' settles the requests.
    proc.stdin.on('error', (error) => {
      lastError = lastError || error.message
    })
    proc.stderr.on('data', (chunk) => {
      if (child !== proc) return
      const text = chunk.toString().trim()
      if (!text) return
      stderrTail = `${stderrTail}${stderrTail ? '\n' : ''}${text}`.slice(-4000)
    })
    proc.on('error', (error) => {
      lastError = error.message
      if (child === proc) {
        child = null
        childHasResponded = false
      }
      rejectPendingFor(proc, new Error(`Speech recognition failed to start: ${error.message}`))
    })
    proc.on('close', () => {
      const tail = child === proc ? stderrTail : ''
      if (child === proc) {
        child = null
        stdoutBuffer = ''
        childHasResponded = false
      }
      rejectPendingFor(proc, new Error(
        `Speech recognition process exited unexpectedly${tail ? `: ${tail}` : ''}`,
      ))
    })

    child = proc
  }

  function sendRequest(audioPath, language) {
    ensureStarted()
    const proc = child
    const id = nextRequestId++
    const timeoutMs = childHasResponded ? requestTimeoutMs : coldRequestTimeoutMs

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending || pending.id !== id) return
        pending = null
        lastError = `Speech recognition timed out after ${timeoutMs}ms`
        // The server is single-threaded and still working on this clip, so a surviving
        // process would start the next request's clock against a busy engine. Kill it;
        // the next call spawns a fresh one.
        stopChild()
        reject(new Error(lastError))
      }, timeoutMs)

      pending = { id, proc, resolve, reject, timer }

      try {
        proc.stdin.write(`${JSON.stringify({ id, audio_path: audioPath, language })}\n`)
      } catch (error) {
        pending = null
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    /**
     * Transcribe one audio file. Calls are serialized: the Python server handles one request
     * at a time, so queueing here keeps each request's timeout about its own clip instead of
     * counting time spent waiting behind another.
     */
    async transcribe(audioPath, opts = {}) {
      const language = typeof opts.language === 'string' && opts.language ? opts.language : 'ja'

      clearUnloadTimer()
      inFlightCount += 1
      // queueTail never rejects, so the next request always gets its turn.
      const run = queueTail.then(() => sendRequest(audioPath, language))
      queueTail = run.then(() => undefined, () => undefined)

      try {
        const result = await run
        lastError = null
        return result
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        inFlightCount -= 1
        scheduleInactivityUnload()
      }
    },

    getStatus() {
      return {
        available: resolveModel() !== null,
        running: child !== null,
        lastError,
      }
    },

    unload() {
      clearUnloadTimer()
      stopChild()
      return { ok: true }
    },

    // A new model was installed, chosen or removed: the next request spawns a process that
    // loads the one now selected.
    restart() {
      clearUnloadTimer()
      stopChild()
    },
  }
}

module.exports = { createSpeechRuntime, SPEECH_TIERS }
