const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_SPEED = 1.0
const DEFAULT_REQUEST_TIMEOUT_MS = 120000
const DEFAULT_QUALITY_MODE = (process.env.JPLEARN_OPENVOICE_QUALITY_MODE || 'fast').trim() || 'fast'
const DEFAULT_POSTPROCESS_MODE = (process.env.JPLEARN_OPENVOICE_POSTPROCESS || 'off').trim() || 'off'
const DEFAULT_CACHE_ENTRIES = Number.isFinite(Number(process.env.JPLEARN_OPENVOICE_CACHE_ENTRIES))
  ? Math.max(0, Math.floor(Number(process.env.JPLEARN_OPENVOICE_CACHE_ENTRIES)))
  : 24

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

function resolveOpenVoicePaths(repoRoot) {
  const baseDir = path.join(getJPLearnInstallDir(), 'openvoice')
  return {
    baseDir,
    voiceRoot: path.join(baseDir, 'voices'),
    checkpointRoot: path.join(baseDir, 'checkpoints_v2'),
    scriptPath: path.join(repoRoot, 'scripts', 'openvoice_speak.py'),
    serverScriptPath: path.join(repoRoot, 'scripts', 'openvoice_speech_server.py'),
    pythonPath: (process.env.OPENVOICE_PYTHON || process.env.JPLEARN_PYTHON || 'python').trim(),
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function loadVoiceProfiles(voiceRoot) {
  if (!fs.existsSync(voiceRoot)) {
    return []
  }
  const entries = fs.readdirSync(voiceRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const voiceDir = path.join(voiceRoot, entry.name)
      const manifest = readJson(path.join(voiceDir, 'manifest.json'))
      if (!manifest) {
        return null
      }
      return {
        ...manifest,
        voiceDir,
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(left.voiceId || left.voiceDir).localeCompare(String(right.voiceId || right.voiceDir)))
}

function isOpenVoiceInstalled(repoRoot) {
  const { voiceRoot, checkpointRoot, scriptPath } = resolveOpenVoicePaths(repoRoot)
  const converterCheckpoint = path.join(checkpointRoot, 'converter', 'checkpoint.pth')
  const converterConfig = path.join(checkpointRoot, 'converter', 'config.json')
  return Boolean(
    fs.existsSync(scriptPath)
      && fs.existsSync(voiceRoot)
      && fs.existsSync(converterCheckpoint)
      && fs.existsSync(converterConfig)
      && loadVoiceProfiles(voiceRoot).length > 0,
  )
}

function resolveVoiceProfile(voiceProfiles, speaker) {
  if (!voiceProfiles.length) {
    return null
  }
  if (typeof speaker === 'string' && speaker.trim()) {
    const exact = voiceProfiles.find((profile) => profile.voiceId === speaker || path.basename(profile.voiceDir) === speaker)
    if (exact) {
      return exact
    }
  }
  if (Number.isInteger(speaker)) {
    const index = Math.min(Math.max(speaker, 0), voiceProfiles.length - 1)
    return voiceProfiles[index]
  }
  return voiceProfiles[0]
}

function createOpenVoiceRuntime(options = {}) {
  const repoRoot = typeof options.repoRoot === 'string' && options.repoRoot.trim()
    ? options.repoRoot.trim()
    : path.resolve(__dirname, '..', '..')
  const maxTextChars = Number.isFinite(options.maxTextChars) ? Math.max(1, Math.floor(options.maxTextChars)) : DEFAULT_MAX_TEXT_CHARS
  const qualityMode = typeof options.qualityMode === 'string' && options.qualityMode.trim()
    ? options.qualityMode.trim()
    : DEFAULT_QUALITY_MODE
  const postprocessMode = typeof options.postprocessMode === 'string' && options.postprocessMode.trim()
    ? options.postprocessMode.trim()
    : DEFAULT_POSTPROCESS_MODE
  const cacheLimit = Number.isFinite(options.cacheEntries)
    ? Math.max(0, Math.floor(options.cacheEntries))
    : DEFAULT_CACHE_ENTRIES
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(10000, Math.floor(options.requestTimeoutMs))
    : DEFAULT_REQUEST_TIMEOUT_MS
  const audioCache = new Map()
  let child = null
  let startPromise = null
  let stdoutBuffer = ''
  let nextRequestId = 1
  const pending = new Map()
  let lastError = null

  function getCacheKey(text, voiceId, speed) {
    return JSON.stringify({
      text,
      voiceId,
      speed: Number.isFinite(speed) ? Number(speed.toFixed(3)) : DEFAULT_SPEED,
      qualityMode,
      postprocessMode,
    })
  }

  function getCachedAudio(cacheKey) {
    if (!audioCache.has(cacheKey)) {
      return null
    }
    const value = audioCache.get(cacheKey)
    // Move to end for simple LRU behavior.
    audioCache.delete(cacheKey)
    audioCache.set(cacheKey, value)
    return value
  }

  function setCachedAudio(cacheKey, payload) {
    if (cacheLimit <= 0) {
      return
    }
    if (audioCache.has(cacheKey)) {
      audioCache.delete(cacheKey)
    }
    audioCache.set(cacheKey, payload)
    while (audioCache.size > cacheLimit) {
      const oldestKey = audioCache.keys().next().value
      if (oldestKey == null) {
        break
      }
      audioCache.delete(oldestKey)
    }
  }

  function pickModelName(voiceProfiles) {
    const profile = voiceProfiles[0]
    if (!profile) {
      return 'openvoice:unavailable'
    }
    return `openvoice:${profile.voiceId || path.basename(profile.voiceDir)}`
  }

  function getReadyState() {
    return isOpenVoiceInstalled(repoRoot)
  }

  function stopServer() {
    if (child) {
      try { child.kill() } catch { /* ignore */ }
      child = null
    }
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('OpenVoice process exited unexpectedly'))
    }
    pending.clear()
  }

  function handleStdoutData(chunk) {
    stdoutBuffer += chunk.toString('utf8')
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
        entry.resolve(parsed)
      }
    }
  }

  async function ensureStarted() {
    if (child) return
    if (startPromise) return startPromise

    startPromise = new Promise((resolve, reject) => {
      const paths = resolveOpenVoicePaths(repoRoot)
      if (!fs.existsSync(paths.serverScriptPath)) {
        reject(new Error(`OpenVoice server script is missing: ${paths.serverScriptPath}`))
        return
      }

      const proc = spawn(paths.pythonPath, [paths.serverScriptPath, '--repo-root', repoRoot], {
        cwd: path.dirname(paths.serverScriptPath),
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          OPENVOICE_CHECKPOINT_DIR: paths.checkpointRoot,
          OPENVOICE_VOICE_ROOT: paths.voiceRoot,
        },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      proc.stdout.on('data', handleStdoutData)
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim()
        if (text) lastError = text
      })
      proc.on('error', (error) => {
        lastError = error instanceof Error ? error.message : String(error)
        child = null
      })
      proc.on('close', () => {
        stopServer()
      })

      child = proc
      resolve()
    }).finally(() => {
      startPromise = null
    })

    return startPromise
  }

  async function requestServer(payload) {
    await ensureStarted()
    if (!child) {
      throw new Error(lastError || 'OpenVoice process is not running')
    }

    const id = nextRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('OpenVoice request timed out'))
      }, requestTimeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`)
    })
  }

  async function synthesize(text, speaker, speed) {
    const paths = resolveOpenVoicePaths(repoRoot)
    const voiceProfiles = loadVoiceProfiles(paths.voiceRoot)
    const profile = resolveVoiceProfile(voiceProfiles, speaker)
    if (!profile) {
      throw new Error('No OpenVoice voice profiles are configured')
    }
    if (!getReadyState()) {
      throw new Error('OpenVoice checkpoints or voice profiles are missing')
    }

    const normalized = sanitizeSpeechText(text)
    if (!normalized) {
      throw new Error('Speak text must not be empty')
    }
    const boundedText = normalized.length <= maxTextChars ? normalized : normalized.slice(0, maxTextChars)
    const voiceId = profile.voiceId || path.basename(profile.voiceDir)
    const cacheKey = getCacheKey(boundedText, voiceId, speed)
    const cached = getCachedAudio(cacheKey)
    if (cached) {
      lastError = null
      return {
        ...cached,
        ok: true,
      }
    }

    const response = await requestServer({
      type: 'synthesize',
      text: boundedText,
      voiceId,
      speed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : DEFAULT_SPEED,
      qualityMode,
      postprocessMode,
    })

    if (typeof response.audioBase64 !== 'string' || response.audioBase64.length === 0) {
      throw new Error('OpenVoice returned empty audio')
    }

    const payload = {
      format: 'wav',
      sampleRate: Number.isFinite(response.sampleRate) ? response.sampleRate : 24000,
      voiceId: response.voiceId || voiceId,
      audioBase64: response.audioBase64,
    }
    setCachedAudio(cacheKey, payload)
    lastError = null
    return {
      ok: true,
      ...payload,
    }
  }

  const runtime = {
    getStatus() {
      const ready = getReadyState()
      const paths = resolveOpenVoicePaths(repoRoot)
      const voiceProfiles = loadVoiceProfiles(paths.voiceRoot)
      return {
        available: ready && lastError == null,
        modelReady: ready && child != null,
        downloading: false,
        downloadProgress: 0,
        modelName: pickModelName(voiceProfiles),
        lastError,
      }
    },

    async speak(text, speakOptions = {}) {
      try {
        return await synthesize(text, speakOptions.speaker, speakOptions.speed)
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      }
    },

    async preload(speaker) {
      try {
        const paths = resolveOpenVoicePaths(repoRoot)
        const voiceProfiles = loadVoiceProfiles(paths.voiceRoot)
        const profile = resolveVoiceProfile(voiceProfiles, speaker)
        await requestServer({
          type: 'preload',
          voiceId: profile ? (profile.voiceId || path.basename(profile.voiceDir)) : null,
          qualityMode,
          postprocessMode,
        })
        return { ok: true, ready: true }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        return { ok: false, ready: false }
      }
    },

    async unload() {
      audioCache.clear()
      stopServer()
      return { ok: true }
    },
  }

  return runtime
}

module.exports = {
  createOpenVoiceRuntime,
  isOpenVoiceInstalled,
  loadVoiceProfiles,
}