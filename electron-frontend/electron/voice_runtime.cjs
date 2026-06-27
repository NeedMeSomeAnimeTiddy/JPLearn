const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { spawn } = require('node:child_process')

// Kokoro-82M text-to-speech with proper Japanese g2p via misaki[ja] (OpenJTalk).
// Synthesis runs in a persistent Python worker (scripts/tts_worker.py) that loads
// the model once. The model files are downloaded on first use into the user's
// local cache so the installer stays small.
const DEFAULT_MODEL_URL =
  process.env.JPLEARN_TTS_MODEL_URL
  || 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.fp16.onnx'
const DEFAULT_VOICES_URL =
  process.env.JPLEARN_TTS_VOICES_URL
  || 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin'
const DEFAULT_MODEL_FILE = process.env.JPLEARN_TTS_MODEL_FILE || 'kokoro-v1.0.fp16.onnx'
const DEFAULT_VOICES_FILE = 'voices-v1.0.bin'
const DEFAULT_VOICE = process.env.JPLEARN_TTS_VOICE || 'jf_alpha' // Japanese female
const DEFAULT_LANG = process.env.JPLEARN_TTS_LANG || 'ja'
const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_REQUEST_TIMEOUT_MS = 60000
const MAX_REDIRECTS = 5

function defaultModelRootDir() {
  const override = typeof process.env.JPLEARN_TTS_MODEL_DIR === 'string' ? process.env.JPLEARN_TTS_MODEL_DIR.trim() : ''
  if (override) {
    return override
  }
  try {
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'voice-models')
    }
  } catch {
    // Not running inside an Electron main process; fall back to a repo-local cache.
  }
  return path.join(__dirname, '..', '..', 'data', 'voice-models')
}

function clampText(value, maxChars) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return ''
  }
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars)
}

function downloadToFile(url, destination, onProgress, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects while downloading voice model'))
          return
        }
        const nextUrl = new URL(response.headers.location, url).toString()
        resolve(downloadToFile(nextUrl, destination, onProgress, redirectsLeft - 1))
        return
      }
      if (status !== 200) {
        response.resume()
        reject(new Error(`Voice model download failed with HTTP ${status}`))
        return
      }

      const totalBytes = Number(response.headers['content-length']) || 0
      let receivedBytes = 0
      const fileStream = fs.createWriteStream(destination)
      response.on('data', (chunk) => {
        receivedBytes += chunk.length
        if (totalBytes > 0 && typeof onProgress === 'function') {
          onProgress(receivedBytes / totalBytes)
        }
      })
      response.pipe(fileStream)
      fileStream.on('finish', () => fileStream.close((closeError) => (closeError ? reject(closeError) : resolve())))
      fileStream.on('error', reject)
      response.on('error', reject)
    })
    request.on('error', reject)
  })
}

function createVoiceRuntime(options = {}) {
  const modelRootDir = typeof options.modelRootDir === 'string' && options.modelRootDir.trim()
    ? options.modelRootDir.trim()
    : defaultModelRootDir()
  const modelDir = path.join(modelRootDir, 'kokoro')
  const modelPath = path.join(modelDir, DEFAULT_MODEL_FILE)
  const voicesPath = path.join(modelDir, DEFAULT_VOICES_FILE)
  const maxTextChars = Number.isFinite(options.maxTextChars) ? Math.max(1, Math.floor(options.maxTextChars)) : DEFAULT_MAX_TEXT_CHARS
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(5000, Math.floor(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS
  const workerScript = typeof options.workerScript === 'string' && options.workerScript.trim()
    ? options.workerScript.trim()
    : path.resolve(__dirname, '..', '..', 'scripts', 'tts_worker.py')
  const cwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : path.resolve(__dirname, '..', '..')
  const resolvePython = typeof options.resolvePython === 'function'
    ? options.resolvePython
    : () => (typeof options.pythonCommand === 'string' && options.pythonCommand.trim() ? options.pythonCommand.trim() : 'python')

  let downloading = false
  let downloadProgress = 0
  let lastError = null
  let ensurePromise = null

  let workerProcess = null
  let workerReady = false
  let startPromise = null
  let stdoutBuffer = ''
  let nextRequestId = 1
  const pending = new Map()
  let exitHandlerRegistered = false

  function isModelReady() {
    return fs.existsSync(modelPath) && fs.existsSync(voicesPath)
  }

  async function ensureModelDownloaded() {
    if (isModelReady()) {
      return
    }
    if (ensurePromise) {
      return ensurePromise
    }

    ensurePromise = (async () => {
      downloading = true
      downloadProgress = 0
      lastError = null
      try {
        fs.mkdirSync(modelDir, { recursive: true })
        if (!fs.existsSync(voicesPath)) {
          await downloadToFile(DEFAULT_VOICES_URL, `${voicesPath}.part`, () => {})
          fs.renameSync(`${voicesPath}.part`, voicesPath)
        }
        // The model is the large file; surface its download as the visible progress.
        if (!fs.existsSync(modelPath)) {
          await downloadToFile(DEFAULT_MODEL_URL, `${modelPath}.part`, (ratio) => {
            downloadProgress = ratio
          })
          fs.renameSync(`${modelPath}.part`, modelPath)
        }
        if (!isModelReady()) {
          throw new Error('Voice model download did not produce the expected files')
        }
      } finally {
        downloading = false
      }
    })().catch((error) => {
      lastError = error instanceof Error ? error.message : String(error)
      throw error
    }).finally(() => {
      ensurePromise = null
    })

    return ensurePromise
  }

  function rejectAllPending(error) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function teardownWorker() {
    workerReady = false
    startPromise = null
    if (workerProcess && workerProcess.exitCode === null) {
      try {
        workerProcess.kill()
      } catch {
        // Process may already be gone.
      }
    }
    workerProcess = null
  }

  function handleWorkerLine(line) {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    let message
    try {
      message = JSON.parse(trimmed)
    } catch {
      return
    }

    if (message.event === 'ready') {
      workerReady = true
      if (startPromise && startPromise.resolveReady) {
        startPromise.resolveReady()
      }
      return
    }
    if (message.event === 'error') {
      const detail = typeof message.error === 'string' ? message.error : 'voice worker failed to start'
      lastError = detail
      if (startPromise && startPromise.rejectReady) {
        startPromise.rejectReady(new Error(detail))
      }
      return
    }

    const entry = message.id != null ? pending.get(message.id) : undefined
    if (!entry) {
      return
    }
    pending.delete(message.id)
    clearTimeout(entry.timer)
    if (message.ok) {
      entry.resolve(message)
    } else {
      entry.reject(new Error(typeof message.error === 'string' ? message.error : 'voice synthesis failed'))
    }
  }

  function startWorker() {
    if (workerReady && workerProcess && workerProcess.exitCode === null) {
      return Promise.resolve()
    }
    if (startPromise && startPromise.promise) {
      return startPromise.promise
    }

    const pythonCommand = resolvePython()
    let resolveReady
    let rejectReady
    const promise = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    startPromise = { promise, resolveReady, rejectReady }

    try {
      workerProcess = spawn(pythonCommand, [workerScript, '--model', modelPath, '--voices', voicesPath], {
        cwd,
        windowsHide: true,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      lastError = detail
      startPromise = null
      return Promise.reject(new Error(detail))
    }

    workerProcess.stdout.setEncoding('utf8')
    workerProcess.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk
      let newlineIndex = stdoutBuffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex)
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        handleWorkerLine(line)
        newlineIndex = stdoutBuffer.indexOf('\n')
      }
    })
    workerProcess.on('error', (error) => {
      const detail = error instanceof Error ? error.message : String(error)
      lastError = detail
      rejectReady(new Error(detail))
      rejectAllPending(new Error(detail))
      teardownWorker()
    })
    workerProcess.on('exit', () => {
      if (!workerReady) {
        rejectReady(new Error(lastError || 'voice worker exited before becoming ready'))
      }
      rejectAllPending(new Error('voice worker exited'))
      teardownWorker()
    })

    if (!exitHandlerRegistered) {
      exitHandlerRegistered = true
      process.once('exit', teardownWorker)
    }

    return promise
  }

  function sendRequest(payload) {
    return new Promise((resolve, reject) => {
      if (!workerProcess || workerProcess.exitCode !== null) {
        reject(new Error('voice worker is not running'))
        return
      }
      const id = nextRequestId
      nextRequestId += 1
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('voice synthesis timed out'))
      }, requestTimeoutMs)
      pending.set(id, { resolve, reject, timer })
      try {
        workerProcess.stdin.write(`${JSON.stringify({ id, ...payload })}\n`)
      } catch (error) {
        pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  const runtime = {
    getStatus() {
      return {
        available: lastError == null,
        modelReady: isModelReady(),
        downloading,
        downloadProgress,
        modelName: DEFAULT_MODEL_FILE,
        lastError,
      }
    },

    async speak(text, speakOptions = {}) {
      const boundedText = clampText(text, maxTextChars)
      if (!boundedText) {
        throw new Error('Speak text must not be empty')
      }

      await ensureModelDownloaded()
      await startWorker()

      const voice = typeof speakOptions.voice === 'string' && speakOptions.voice.trim() ? speakOptions.voice.trim() : DEFAULT_VOICE
      const speed = Number.isFinite(speakOptions.speed) ? Math.min(2, Math.max(0.5, speakOptions.speed)) : 1.0
      const lang = typeof speakOptions.lang === 'string' && speakOptions.lang.trim() ? speakOptions.lang.trim() : DEFAULT_LANG

      const response = await sendRequest({ text: boundedText, voice, speed, lang })
      const sampleRate = Number.isFinite(response.sampleRate) ? response.sampleRate : 0
      if (!response.audioBase64 || !sampleRate) {
        throw new Error('voice worker returned empty audio')
      }

      lastError = null
      return {
        ok: true,
        format: 'wav',
        sampleRate,
        voiceId: 0,
        audioBase64: response.audioBase64,
      }
    },

    async unload() {
      teardownWorker()
      return { ok: true }
    },
  }

  return runtime
}

module.exports = {
  createVoiceRuntime,
}
