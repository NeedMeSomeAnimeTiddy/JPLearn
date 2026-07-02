const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')

// Text-to-speech via the VOICEVOX engine, a local HTTP server that produces
// highly natural Japanese speech. The runtime connects to an already-running
// engine when available, otherwise launches a downloaded engine binary. The
// engine itself is large (~1 GB) and is fetched separately (scripts/get_voicevox.py).
const DEFAULT_HOST = process.env.JPLEARN_VOICEVOX_HOST || '127.0.0.1'
const DEFAULT_PORT = Number.isFinite(Number(process.env.JPLEARN_VOICEVOX_PORT)) ? Number(process.env.JPLEARN_VOICEVOX_PORT) : 50021
const DEFAULT_SPEAKER = Number.isFinite(Number(process.env.JPLEARN_VOICEVOX_SPEAKER)) ? Number(process.env.JPLEARN_VOICEVOX_SPEAKER) : 13
const DEFAULT_SPEED = Number.isFinite(Number(process.env.JPLEARN_VOICEVOX_SPEED)) ? Number(process.env.JPLEARN_VOICEVOX_SPEED) : 1.0
// Pause-length scale applied to all inter-phrase gaps. VOICEVOX defaults to 1.0
// which produces ~0.8–1.0 s pauses around unknown characters (〜) and spaces.
// 0.25 keeps pauses audible but natural for a study context.
const DEFAULT_PAUSE_SCALE = Number.isFinite(Number(process.env.JPLEARN_VOICEVOX_PAUSE_SCALE)) ? Math.min(2, Math.max(0, Number(process.env.JPLEARN_VOICEVOX_PAUSE_SCALE))) : 0.5
const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const DEFAULT_STARTUP_TIMEOUT_MS = 60000

// Strip characters that cause VOICEVOX to insert long pauses:
//   〜 (wave dash) — used as a grammar-pattern placeholder in the UI, treated
//      as an unknown character by the synthesis engine → ~1 s gap each
//   ASCII spaces and ideographic spaces — VOICEVOX treats them as phrase
//      boundaries; Japanese text doesn't need spaces as word separators
function preprocessForSpeech(text) {
  return text
    .replace(/〜/g, '')       // remove grammar-pattern placeholders
    .replace(/[　 ]+/g, '')   // remove full-width and half-width spaces
    .trim()
}

function resolveAssetsBaseDir() {
  return (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
}

function resolveEnginePath(repoRoot) {
  const candidates = [
    (process.env.JPLEARN_VOICEVOX_ENGINE || '').trim(),
  ]
  // Installed assets path — priority path for the configured app data root.
  const docsDir = resolveAssetsBaseDir()
  if (docsDir) {
    candidates.push(path.join(docsDir, 'voicevox', 'run.exe'))
    candidates.push(path.join(docsDir, 'voicevox', 'run'))
  }
  candidates.push(
    path.join(repoRoot, 'data', 'voicevox', 'run.exe'),
    path.join(repoRoot, 'data', 'voicevox', 'run'),
  )
  try {
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      const userData = app.getPath('userData')
      candidates.push(path.join(userData, 'voicevox', 'run.exe'))
      candidates.push(path.join(userData, 'voicevox', 'run'))
    }
  } catch {
    // Not inside an Electron main process; rely on repo/env candidates.
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(options, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode || 0, buffer: Buffer.concat(chunks) }))
    })
    request.on('error', reject)
    if (body) {
      request.write(body)
    }
    request.end()
  })
}

function createVoiceRuntime(options = {}) {
  const host = typeof options.host === 'string' && options.host.trim() ? options.host.trim() : DEFAULT_HOST
  const port = Number.isFinite(options.port) ? options.port : DEFAULT_PORT
  const repoRoot = typeof options.repoRoot === 'string' && options.repoRoot.trim()
    ? options.repoRoot.trim()
    : path.resolve(__dirname, '..', '..')
  const maxTextChars = Number.isFinite(options.maxTextChars) ? Math.max(1, Math.floor(options.maxTextChars)) : DEFAULT_MAX_TEXT_CHARS
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? Math.max(5000, Math.floor(options.requestTimeoutMs)) : DEFAULT_REQUEST_TIMEOUT_MS
  const startupTimeoutMs = Number.isFinite(options.startupTimeoutMs) ? Math.max(10000, Math.floor(options.startupTimeoutMs)) : DEFAULT_STARTUP_TIMEOUT_MS

  let engineProcess = null
  let ensurePromise = null
  let lastError = null
  let exitHandlerRegistered = false

  async function isEngineReachable() {
    try {
      const res = await httpRequest({ host, port, path: '/version', method: 'GET', timeout: 3000 })
      return res.status === 200
    } catch {
      return false
    }
  }

  async function waitForHealth() {
    const deadline = Date.now() + startupTimeoutMs
    while (Date.now() < deadline) {
      if (engineProcess && engineProcess.exitCode !== null) {
        throw new Error('VOICEVOX engine exited before becoming ready')
      }
      if (await isEngineReachable()) {
        return
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 600))
    }
    throw new Error('VOICEVOX engine did not become healthy in time')
  }

  function stopEngine() {
    if (engineProcess && engineProcess.exitCode === null) {
      try {
        engineProcess.kill()
      } catch {
        // Process may already be gone.
      }
    }
    engineProcess = null
  }

  async function ensureEngine() {
    if (await isEngineReachable()) {
      lastError = null
      return
    }
    if (ensurePromise) {
      return ensurePromise
    }

    ensurePromise = (async () => {
      const enginePath = resolveEnginePath(repoRoot)
      if (!enginePath) {
        throw new Error('VOICEVOX engine is not running and no engine binary was found. Run scripts/get_voicevox.py or start the VOICEVOX app.')
      }
      if (engineProcess && engineProcess.exitCode === null) {
        await waitForHealth()
        return
      }
      engineProcess = spawn(enginePath, ['--host', host, '--port', String(port)], {
        cwd: path.dirname(enginePath),
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      engineProcess.on('error', () => stopEngine())
      if (!exitHandlerRegistered) {
        exitHandlerRegistered = true
        process.once('exit', stopEngine)
      }
      await waitForHealth()
      lastError = null
    })().catch((error) => {
      lastError = error instanceof Error ? error.message : String(error)
      throw error
    }).finally(() => {
      ensurePromise = null
    })

    return ensurePromise
  }

  async function synthesize(text, speaker, speed) {
    const query = await httpRequest({
      host,
      port,
      path: `/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`,
      method: 'POST',
      timeout: requestTimeoutMs,
    })
    if (query.status !== 200) {
      throw new Error(`VOICEVOX audio_query failed with status ${query.status}`)
    }

    let queryObject
    try {
      queryObject = JSON.parse(query.buffer.toString('utf8'))
    } catch {
      throw new Error('VOICEVOX audio_query returned malformed JSON')
    }
    if (Number.isFinite(speed)) {
      queryObject.speedScale = speed
    }
    queryObject.pauseLengthScale = DEFAULT_PAUSE_SCALE

    const queryBody = Buffer.from(JSON.stringify(queryObject), 'utf8')
    const synthesis = await httpRequest(
      {
        host,
        port,
        path: `/synthesis?speaker=${speaker}`,
        method: 'POST',
        timeout: requestTimeoutMs,
        headers: { 'Content-Type': 'application/json', 'Content-Length': queryBody.length, Accept: 'audio/wav' },
      },
      queryBody,
    )
    if (synthesis.status !== 200) {
      throw new Error(`VOICEVOX synthesis failed with status ${synthesis.status}`)
    }
    return synthesis.buffer
  }

  const warmedSpeakers = new Set()

  const runtime = {
    getStatus() {
      return {
        available: lastError == null,
        modelReady: Boolean(engineProcess) && engineProcess.exitCode === null,
        downloading: false,
        downloadProgress: 0,
        modelName: `voicevox:${DEFAULT_SPEAKER}`,
        lastError,
      }
    },

    async speak(text, speakOptions = {}) {
      const normalized = typeof text === 'string' ? text.trim() : ''
      if (!normalized) {
        throw new Error('Speak text must not be empty')
      }
      const preprocessed = preprocessForSpeech(normalized)
      if (!preprocessed) {
        throw new Error('Speak text must not be empty')
      }
      const boundedText = preprocessed.length <= maxTextChars ? preprocessed : preprocessed.slice(0, maxTextChars)

      await ensureEngine()

      const speaker = Number.isInteger(speakOptions.speaker) ? speakOptions.speaker : DEFAULT_SPEAKER
      const speed = Number.isFinite(speakOptions.speed) ? Math.min(2, Math.max(0.5, speakOptions.speed)) : DEFAULT_SPEED

      const wav = await synthesize(boundedText, speaker, speed)
      if (!wav || wav.length < 44) {
        throw new Error('VOICEVOX returned empty audio')
      }

      warmedSpeakers.add(speaker)
      lastError = null
      return {
        ok: true,
        format: 'wav',
        sampleRate: 24000,
        voiceId: speaker,
        audioBase64: wav.toString('base64'),
      }
    },

    // Start (or connect to) the engine ahead of time and warm a speaker so the
    // first real synthesis is fast. Best-effort: failures are swallowed.
    async preload(speaker) {
      try {
        await ensureEngine()
        const target = Number.isInteger(speaker) ? speaker : DEFAULT_SPEAKER
        if (!warmedSpeakers.has(target)) {
          try {
            await synthesize('あ', target, DEFAULT_SPEED)
            warmedSpeakers.add(target)
          } catch {
            // Warmup is best-effort; the engine is still usable on the next call.
          }
        }
        lastError = null
        return { ok: true, ready: true }
      } catch {
        return { ok: false, ready: false }
      }
    },

    async unload() {
      stopEngine()
      return { ok: true }
    },
  }

  return runtime
}

module.exports = {
  createVoiceRuntime,
}
