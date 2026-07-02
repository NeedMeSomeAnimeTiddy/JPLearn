const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const DEFAULT_MAX_TEXT_CHARS = 400
const DEFAULT_SPEED = 1.0

function sanitizeSpeechText(text) {
  return typeof text === 'string' ? text.replace(/〜/g, '').trim() : ''
}

function hasOpenVoiceCheckpoints(baseDir) {
  if (!baseDir) return false
  return fs.existsSync(path.join(baseDir, 'checkpoints_v2', 'converter', 'checkpoint.pth'))
    && fs.existsSync(path.join(baseDir, 'checkpoints_v2', 'converter', 'config.json'))
}

function hasOpenVoiceVoices(baseDir) {
  if (!baseDir) return false
  const voiceRoot = path.join(baseDir, 'voices')
  return loadVoiceProfiles(voiceRoot).length > 0
}

function pickFirst(candidates, predicate) {
  for (const candidate of candidates) {
    if (candidate && predicate(candidate)) {
      return candidate
    }
  }
  return ''
}

function resolveOpenVoicePaths(repoRoot) {
  const docsDir = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  const installedDir = docsDir ? path.join(docsDir, 'openvoice') : ''
  const bundledDir = path.join(repoRoot, 'data', 'openvoice')
  const candidates = [installedDir, bundledDir].filter(Boolean)

  const voiceBaseDir = pickFirst(candidates, hasOpenVoiceVoices) || candidates[0] || bundledDir
  const checkpointBaseDir = pickFirst(candidates, hasOpenVoiceCheckpoints) || candidates[0] || bundledDir
  const baseDir = pickFirst(candidates, (dir) => hasOpenVoiceVoices(dir) && hasOpenVoiceCheckpoints(dir))
    || checkpointBaseDir

  return {
    baseDir,
    voiceRoot: path.join(voiceBaseDir, 'voices'),
    checkpointRoot: path.join(checkpointBaseDir, 'checkpoints_v2'),
    scriptPath: path.join(repoRoot, 'scripts', 'openvoice_speak.py'),
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

function runOpenVoiceScript(pythonPath, scriptPath, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, ...args], {
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        ...extraEnv,
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      const message = stderr.trim() || stdout.trim() || `OpenVoice exited with code ${code}`
      reject(new Error(message))
    })
  })
}

function createOpenVoiceRuntime(options = {}) {
  const repoRoot = typeof options.repoRoot === 'string' && options.repoRoot.trim()
    ? options.repoRoot.trim()
    : path.resolve(__dirname, '..', '..')
  const maxTextChars = Number.isFinite(options.maxTextChars) ? Math.max(1, Math.floor(options.maxTextChars)) : DEFAULT_MAX_TEXT_CHARS
  const paths = resolveOpenVoicePaths(repoRoot)
  const voiceProfiles = loadVoiceProfiles(paths.voiceRoot)
  let lastError = null

  function pickModelName(profile) {
    if (!profile) {
      return 'openvoice:unavailable'
    }
    return `openvoice:${profile.voiceId || path.basename(profile.voiceDir)}`
  }

  function getReadyState() {
    return isOpenVoiceInstalled(repoRoot)
  }

  async function synthesize(text, speaker, speed) {
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

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jplearn-openvoice-'))
    const outputPath = path.join(outputDir, 'output.wav')

    try {
      await runOpenVoiceScript(paths.pythonPath, paths.scriptPath, [
        '--repo-root', repoRoot,
        '--voice-id', profile.voiceId || path.basename(profile.voiceDir),
        '--text', boundedText,
        '--output', outputPath,
        '--speed', String(Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : DEFAULT_SPEED),
      ], {
        OPENVOICE_CHECKPOINT_DIR: paths.checkpointRoot,
        OPENVOICE_VOICE_ROOT: paths.voiceRoot,
      })

      const wav = fs.readFileSync(outputPath)
      if (!wav || wav.length < 44) {
        throw new Error('OpenVoice returned empty audio')
      }

      lastError = null
      return {
        ok: true,
        format: 'wav',
        sampleRate: 24000,
        voiceId: profile.voiceId || path.basename(profile.voiceDir),
        audioBase64: wav.toString('base64'),
      }
    } finally {
      try {
        fs.rmSync(outputDir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  const runtime = {
    getStatus() {
      const ready = getReadyState()
      return {
        available: ready && lastError == null,
        modelReady: ready,
        downloading: false,
        downloadProgress: 0,
        modelName: pickModelName(voiceProfiles[0]),
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
        await synthesize('Hello', speaker, DEFAULT_SPEED)
        return { ok: true, ready: true }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        return { ok: false, ready: false }
      }
    },

    async unload() {
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