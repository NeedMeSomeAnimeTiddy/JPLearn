/**
 * qwentts_runtime.cjs — local Japanese speech synthesis via a persistent
 * qwentts.cpp `tts-server.exe` subprocess (OpenAI-compatible HTTP API).
 *
 * Replaces the OpenVoice runtime (openvoice_runtime.cjs, removed). Unlike
 * OpenVoice's stdin/stdout JSON protocol, qwentts.cpp's server speaks plain
 * HTTP (POST /v1/audio/speech, GET /health, GET /v1/voices), so this module
 * mirrors llm_runtime.cjs's llama-server adapter shape (spawn + findFreePort
 * + poll /health + JSON-over-HTTP) rather than openvoice_runtime.cjs's
 * request-id/stdin-stdout plumbing.
 *
 * Two GGUF files are required together: a talker
 * (models/qwen-talker-*.gguf) and a shared tokenizer/codec
 * (models/qwen-tokenizer-*.gguf). The talker's mode (base/customvoice/
 * voicedesign) is baked into the GGUF; JPLearn ships "base" mode talkers so
 * voice selection works entirely through the curated preset speaker bank
 * (see patches/qwentts-cpp/0001-speaker-bank.patch and
 * scripts/build_qwentts_cpp.ps1 for how --speaker-bank support was added).
 *
 * Because the talker+codec GGUFs load fully during process startup (before
 * tts-server.exe even binds its HTTP port), there is no per-speaker lazy
 * load step the way OpenVoice had -- preload() here just ensures the server
 * process is up and healthy, the "speaker" argument does not change what
 * gets loaded.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')
const { spawn } = require('node:child_process')

const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_STARTUP_TIMEOUT_MS = 120000
const DEFAULT_REQUEST_TIMEOUT_MS = 60000
const HOST = '127.0.0.1'

function sanitizeSpeechText(text) {
  return typeof text === 'string' ? text.replace(/〜/g, '').trim() : ''
}

function getJPLearnInstallDir() {
  const explicit = (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || '').trim()
  if (explicit) {
    return explicit
  }
  const legacyDocs = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (legacyDocs) {
    return legacyDocs
  }
  if (process.platform === 'win32') {
    const localAppData = (process.env.LOCALAPPDATA || '').trim()
    if (localAppData) {
      return path.join(localAppData, 'JPLearn Assets')
    }
  }
  let appData
  try {
    appData = require('electron').app.getPath('appData')
  } catch {
    appData = path.join(os.homedir(), '.local', 'share')
  }
  return path.join(appData, 'JPLearn Assets')
}

function resolveQwenttsBaseDir() {
  return path.join(getJPLearnInstallDir(), 'tts')
}

// Packaged builds bundle the CPU-only tts-server.exe (+ ggml*.dll) as an
// extraResource (see forge.config.cjs); dev/local runs use the build output
// of scripts/build_qwentts_cpp.ps1 directly.
function resolveQwenttsBinaryPath(repoRoot) {
  const resourcesPath = (process.resourcesPath || '').trim()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'qwentts', 'tts-server.exe')
    if (fs.existsSync(bundled)) {
      return bundled
    }
  }
  return path.join(repoRoot, 'tools', 'qwentts.cpp', 'build', 'Release', 'tts-server.exe')
}

function findFirstMatch(dir, pattern) {
  if (!fs.existsSync(dir)) {
    return null
  }
  const entries = fs.readdirSync(dir).filter((name) => pattern.test(name)).sort()
  return entries.length ? path.join(dir, entries[0]) : null
}

function resolveQwenttsModelPaths(baseDir) {
  const modelsDir = path.join(baseDir, 'models')
  return {
    modelsDir,
    talkerPath: findFirstMatch(modelsDir, /^qwen-talker-.*\.gguf$/i),
    tokenizerPath: findFirstMatch(modelsDir, /^qwen-tokenizer-.*\.gguf$/i),
  }
}

function resolvePresetBankDir(baseDir) {
  return path.join(baseDir, 'preset_bank')
}

// Preset folder name is the OAI "voice" name the patched server exposes via
// --speaker-bank; a folder only counts once its required spk.bin exists
// (see patches/qwentts-cpp/0001-speaker-bank.patch).
function loadPresetSpeakerNames(baseDir) {
  const presetRoot = resolvePresetBankDir(baseDir)
  if (!fs.existsSync(presetRoot)) {
    return []
  }
  return fs.readdirSync(presetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(presetRoot, entry.name, 'spk.bin')))
    .map((entry) => entry.name)
    .sort()
}

function isQwenttsInstalled(repoRoot) {
  const binaryPath = resolveQwenttsBinaryPath(repoRoot)
  const baseDir = resolveQwenttsBaseDir()
  const { talkerPath, tokenizerPath } = resolveQwenttsModelPaths(baseDir)
  return Boolean(fs.existsSync(binaryPath) && talkerPath && tokenizerPath)
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, HOST, () => {
      const address = probe.address()
      const resolvedPort = address && typeof address === 'object' ? address.port : 0
      probe.close(() => resolve(resolvedPort))
    })
  })
}

// Binary-safe HTTP helper: qwentts's /v1/audio/speech (response_format=wav)
// returns raw RIFF bytes, not JSON, so responses are collected as a Buffer
// rather than decoded as utf8 (unlike llm_runtime.cjs's JSON-only helper).
function httpRequestBinary(requestOptions, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null
    const req = http.request(requestOptions, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks) }))
    })
    req.on('error', (error) => reject(error))
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => req.destroy(new Error('qwentts request timed out')))
    }
    if (data) {
      req.setHeader('Content-Type', 'application/json')
      req.setHeader('Content-Length', data.length)
      req.write(data)
    }
    req.end()
  })
}

function createQwenttsRuntime(options = {}) {
  const repoRoot = typeof options.repoRoot === 'string' && options.repoRoot.trim()
    ? options.repoRoot.trim()
    : path.resolve(__dirname, '..', '..')
  const maxTextChars = Number.isFinite(options.maxTextChars) ? Math.max(1, Math.floor(options.maxTextChars)) : DEFAULT_MAX_TEXT_CHARS
  const startupTimeoutMs = Number.isFinite(options.startupTimeoutMs)
    ? Math.max(10000, Math.floor(options.startupTimeoutMs))
    : DEFAULT_STARTUP_TIMEOUT_MS
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(5000, Math.floor(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS

  let serverProcess = null
  let port = 0
  let startPromise = null
  let lastError = null
  let exitHandlerRegistered = false

  function stopServer() {
    if (serverProcess && serverProcess.exitCode === null) {
      try { serverProcess.kill() } catch { /* ignore */ }
    }
    serverProcess = null
    port = 0
  }

  async function waitForHealth() {
    const deadline = Date.now() + startupTimeoutMs
    while (Date.now() < deadline) {
      if (serverProcess && serverProcess.exitCode !== null) {
        throw new Error('qwentts server exited before becoming ready')
      }
      try {
        const res = await httpRequestBinary({ host: HOST, port, path: '/health', method: 'GET' }, null, 4000)
        if (res.status === 200) {
          return
        }
      } catch {
        // Not accepting connections yet; keep polling.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
    }
    throw new Error('qwentts server did not become healthy in time')
  }

  async function ensureStarted() {
    if (serverProcess && serverProcess.exitCode === null && port) {
      return
    }
    if (startPromise) {
      return startPromise
    }

    startPromise = (async () => {
      const binaryPath = resolveQwenttsBinaryPath(repoRoot)
      if (!fs.existsSync(binaryPath)) {
        throw new Error(`qwentts server binary not found: ${binaryPath}`)
      }
      const baseDir = resolveQwenttsBaseDir()
      const { modelsDir, talkerPath, tokenizerPath } = resolveQwenttsModelPaths(baseDir)
      if (!talkerPath || !tokenizerPath) {
        throw new Error(`qwentts model files are missing under ${modelsDir}`)
      }
      const presetBankDir = resolvePresetBankDir(baseDir)

      port = await findFreePort()
      const args = ['--model', talkerPath, '--codec', tokenizerPath, '--host', HOST, '--port', String(port)]
      if (fs.existsSync(presetBankDir)) {
        args.push('--speaker-bank', presetBankDir)
      }

      const proc = spawn(binaryPath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim()
        if (text) lastError = text
      })
      proc.on('error', (error) => {
        lastError = error instanceof Error ? error.message : String(error)
        stopServer()
      })
      proc.on('exit', () => {
        if (serverProcess === proc) {
          serverProcess = null
          port = 0
        }
      })
      serverProcess = proc

      if (!exitHandlerRegistered) {
        exitHandlerRegistered = true
        process.once('exit', stopServer)
      }

      await waitForHealth()
      lastError = null
    })()

    try {
      await startPromise
    } finally {
      startPromise = null
    }
  }

  function pickModelName() {
    const { talkerPath } = resolveQwenttsModelPaths(resolveQwenttsBaseDir())
    return talkerPath ? `qwentts:${path.basename(talkerPath)}` : 'qwentts:unavailable'
  }

  function resolveVoiceName(speaker) {
    if (typeof speaker === 'string' && speaker.trim()) {
      return speaker.trim()
    }
    if (Number.isInteger(speaker)) {
      const presets = loadPresetSpeakerNames(resolveQwenttsBaseDir())
      if (!presets.length) {
        return undefined
      }
      const index = Math.min(Math.max(speaker, 0), presets.length - 1)
      return presets[index]
    }
    return undefined
  }

  async function synthesize(text, speaker, speed) {
    if (!isQwenttsInstalled(repoRoot)) {
      throw new Error('qwentts runtime is not fully installed')
    }
    const normalized = sanitizeSpeechText(text)
    if (!normalized) {
      throw new Error('Speak text must not be empty')
    }
    const boundedText = normalized.length <= maxTextChars ? normalized : normalized.slice(0, maxTextChars)

    await ensureStarted()

    const voice = resolveVoiceName(speaker)
    const payload = { input: boundedText, response_format: 'wav' }
    if (voice) {
      payload.voice = voice
    }
    // qwentts.cpp's tts-server parses "speed" but currently ignores it (no
    // time-stretch in the ABI; see src/tts-server.h upstream). Sent anyway
    // for forward API compatibility -- has no audible effect yet.
    if (Number.isFinite(speed)) {
      payload.speed = Math.min(2, Math.max(0.5, speed))
    }

    const response = await httpRequestBinary(
      { host: HOST, port, path: '/v1/audio/speech', method: 'POST' },
      payload,
      requestTimeoutMs,
    )

    if (response.status !== 200) {
      let message = `qwentts server returned status ${response.status}`
      try {
        const parsed = JSON.parse(response.body.toString('utf8'))
        if (parsed && parsed.error && parsed.error.message) {
          message = parsed.error.message
        }
      } catch {
        // Keep the generic status message.
      }
      throw new Error(message)
    }
    if (!response.body.length) {
      throw new Error('qwentts server returned empty audio')
    }

    return {
      format: 'wav',
      sampleRate: 24000,
      voiceId: voice || 'default',
      audioBase64: response.body.toString('base64'),
    }
  }

  return {
    getStatus() {
      const installed = isQwenttsInstalled(repoRoot)
      return {
        available: installed && lastError == null,
        modelReady: installed && serverProcess != null && serverProcess.exitCode === null,
        downloading: false,
        downloadProgress: 0,
        modelName: pickModelName(),
        lastError,
      }
    },

    async speak(text, speakOptions = {}) {
      try {
        const result = await synthesize(text, speakOptions.speaker, speakOptions.speed)
        lastError = null
        return { ok: true, ...result }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      }
    },

    async preload() {
      try {
        await ensureStarted()
        return { ok: true, ready: true }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        return { ok: false, ready: false }
      }
    },

    async unload() {
      stopServer()
      return { ok: true }
    },
  }
}

module.exports = {
  createQwenttsRuntime,
  isQwenttsInstalled,
  loadPresetSpeakerNames,
}
