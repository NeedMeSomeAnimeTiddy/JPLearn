/**
 * setup_runtime.cjs — first-run setup wizard backend.
 *
 * Provides system detection, model downloads (with redirect handling and .tmp
 * safety), llama.cpp installation, and Japanese voice model installation.
 * Large downloads target the assets data directory so they stay writable
 * without elevation.
 */

const fs = require('node:fs')
const https = require('node:https')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { execFile, spawn } = require('node:child_process')
const { resolvePythonCommand, bundledPythonCommand } = require('./python_command.cjs')
const { isLocalTranslationReady } = require('./llm_runtime.cjs')
const {
  featurePackagesReady,
  envWithFeaturePackages,
  installFeaturePackages,
  featurePackageDirs,
  PADDLEOCR_VERSION,
  PADDLEPADDLE_VERSION,
} = require('./python_packages.cjs')

// ── Model catalogue ──────────────────────────────────────────────────────────

const MODELS = {
  low: {
    filename: 'shisa-v2.1-lfm2-1.2b.Q4_K_M.gguf',
    repo: 'mradermacher/shisa-v2.1-lfm2-1.2b-GGUF',
    sizeMb: 980,
    label: 'Low (1.2B Shisa)',
    description: 'Fastest option for Japanese practice and everyday coaching.',
  },
  medium: {
    filename: 'Llama-3.2-3B-Instruct-UD-Q4_K_XL.gguf',
    repo: 'dahara1/shisa-v2.1-llama3.2-3b-UD-japanese-imatrix',
    sizeMb: 2150,
    label: 'Medium (3B Shisa)',
    description: 'Balanced Japanese quality and speed for most 16 GB systems.',
  },
  high: {
    filename: 'shisa-v2.1-qwen3-8B-UD-Q4_K_XL.gguf',
    repo: 'dahara1/shisa-v2.1-qwen3-8b-UD-japanese-imatrix',
    sizeMb: 5200,
    label: 'High (8B Shisa)',
    description: 'Stronger Japanese nuance and reasoning. Best with 8 GB VRAM and 16 GB RAM.',
  },
  ultra: {
    filename: 'shisa-v2.1-unphi4-14b.Q4_K_M.gguf',
    repo: 'mradermacher/shisa-v2.1-unphi4-14b-GGUF',
    sizeMb: 9100,
    label: 'Ultra (14B Shisa)',
    description: 'Most capable Japanese tier. Best with 12+ GB VRAM and 24+ GB RAM.',
  },
}

// Local retrieval embedder catalogue. Not exposed as a separate choice in
// Setup — each chatbot tier below silently installs its mapped embedder in
// the background (see CHATBOT_TIER_TO_EMBEDDER_TIER and downloadModel()).
// Sizes reflect the quantized ONNX weights (Xenova mirrors) + tokenizer
// files fetched by scripts/get_embedder_model.py, not the raw PyTorch
// checkpoints (which are 3-4x larger).
const EMBEDDERS = {
  e5_small: {
    repo: 'Xenova/multilingual-e5-small',
    sizeMb: 140,
    label: 'Embedder Small',
  },
  e5_base: {
    repo: 'Xenova/multilingual-e5-base',
    sizeMb: 300,
    label: 'Embedder Base',
  },
  e5_large: {
    repo: 'Xenova/multilingual-e5-large',
    sizeMb: 585,
    label: 'Embedder Large',
  },
}
const CHATBOT_TIER_TO_EMBEDDER_TIER = {
  low: 'e5_small',
  medium: 'e5_base',
  high: 'e5_base',
  ultra: 'e5_large',
}

// Japanese voice setup profile.
// The active runtime uses VOICEVOX (local HTTP engine). We keep a tiny
// marker-based setup state so first-run onboarding can track whether the user
// has completed the optional voice step.
const VOICE_MODELS = {
  '0.6b': {
    talkerFilename: 'voice-model-0.6b.marker',
    talkerRepo: 'local',
    // Approximate installer footprint for ETA only.
    talkerSizeMb: 1200,
    label: 'VOICEVOX Local Engine',
    description: 'Use a locally running VOICEVOX engine (default: 127.0.0.1:50021).',
  },
}
const VOICE_TOKENIZER = {
  filename: 'voice-engine-shared.marker',
  repo: 'local',
  sizeMb: 0,
}
const VOICE_DEFAULT_TIER = '0.6b'
const VOICEVOX_HOST = (process.env.JPLEARN_VOICEVOX_HOST || '127.0.0.1').trim()
const VOICEVOX_PORT = Number(process.env.JPLEARN_VOICEVOX_PORT || 50021)
const ACTIVE_VOICE_MODEL_STATE_FILENAME = 'active-voice-model.json'
const SENTINEL_NAME = '.setup-done'
const ACTIVE_MODEL_STATE_FILENAME = 'active-model.json'
const FONT_READY_MARKER = '.fonts-ready'
const FONT_MANIFEST_FILENAME = '.fonts-manifest.json'
const FONT_BUNDLE_VERSION = 2
const EXPECTED_FONT_FAMILIES = [
  'kiwi-maru',
  'biz-udpgothic',
  'kaisei-decol',
  'noto-sans-jp',
  'shippori-mincho',
  'zen-old-mincho',
  'reggae-one',
  'ibm-plex-mono',
]
const EXPECTED_FONT_WEIGHT_COUNT = 17
const LLAMA_CPP_SIZE_MB = 250
const FONTS_SIZE_MB = 100
const DICTIONARY_SIZE_MB = 30
const VOICEVOX_PORTABLE_RELEASE = '0.25.2'
const VOICEVOX_PORTABLE_DOWNLOAD_URL = `https://github.com/VOICEVOX/voicevox/releases/download/${VOICEVOX_PORTABLE_RELEASE}/voicevox-windows-cpu-${VOICEVOX_PORTABLE_RELEASE}.zip`

// Offline Japanese speech recognition (faster-whisper). Used by the speech-
// answer minigame mode. Downloaded via scripts/get_whisper_model.py, which
// fetches the CTranslate2 model files for the selected tier.
const SPEECH_MODELS = {
  fast: {
    label: 'Fast (small, ~500 MB)',
    description: 'Fastest startup and lowest resource use. Best for older laptops or quick rounds.',
    sizeMb: 500,
    repo: 'Systran/faster-whisper-small',
    files: ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'],
  },
  balanced: {
    label: 'Balanced (medium, ~1.5 GB)',
    description: 'Good all-around pick: better accuracy than Fast while still responsive.',
    sizeMb: 1500,
    repo: 'Systran/faster-whisper-medium',
    files: ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'],
  },
  high: {
    label: 'High (distil-large-v3, ~1.9 GB)',
    description: 'Near-Ultra quality with lower latency than Ultra. Great for higher-end PCs.',
    sizeMb: 1900,
    repo: 'distil-whisper/distil-large-v3',
    files: ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'],
  },
  ultra: {
    label: 'Ultra (large-v3, ~3.1 GB)',
    description: 'Highest recognition quality. Best when you prioritize accuracy over speed.',
    sizeMb: 3100,
    repo: 'Systran/faster-whisper-large-v3',
    files: ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt'],
  },
}
const ACTIVE_SPEECH_MODEL_STATE_FILENAME = 'active-speech-model.json'
const OCR_MODELS = {
  standard: {
    label: 'Standard OCR (PaddleOCR, ~220 MB+)',
    description: 'Offline OCR package for Japanese text extraction from images.',
    sizeMb: 220,
  },
}
const TRANSLATION_MODELS = {
  qwen_ja_en: {
    label: 'Qwen3.5-0.8B-JP (GGUF)',
    badge: 'Qwen Translation',
    description: 'Local Qwen JA->EN translation model fallback for OCR.',
    sizeMb: 528,
    filename: 'Qwen3.5-0.8B-JP-Q4_K_M.gguf',
    repo: 'mmnga-o/Holy-fox-Qwen3.5-0.8B-JP-gguf',
  },
}
const TRANSLATION_PROFILES = {
  ocr_qwen_local: {
    label: 'OCR + Qwen3.5-0.8B-JP',
    badge: 'Recommended',
    // sizeMb leaves out llama.cpp, which is downloaded only when missing and varies by backend
    description: 'Installs OCR Standard + local Qwen3.5-0.8B-JP GGUF translation model, and the llama.cpp runner if it is missing.',
    sizeMb: 748,
  },
}
const ACTIVE_OCR_MODEL_STATE_FILENAME = 'active-ocr-model.json'
const ACTIVE_TRANSLATION_MODEL_STATE_FILENAME = 'active-translation-model.json'
const SPEED_TEST_TIMEOUT_MS = 12000
const REMOTE_SIZE_PROBE_TIMEOUT_MS = 8000
// The speed test reads the start of a model the wizard offers, from the host the models come
// from, rather than a third-party test file (audit 6 F1, Robbie's choice). Enough bytes to get
// past TCP slow start; a slow line that cannot finish them in time is measured on what arrived.
const SPEED_TEST_BYTES = 4 * 1024 * 1024
const SPEED_TEST_MIN_BYTES = 256 * 1024
// url -> createDeferredValue holding the asset's exact byte size.
const REMOTE_SIZE_CACHE = new Map()
const LLAMA_BACKEND_LABELS = {
  cuda: 'CUDA (NVIDIA)',
  hip: 'ROCm/HIP (AMD)',
  vulkan: 'Vulkan',
  cpu: 'CPU',
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function getJPLearnDir() {
  const explicit = (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || '').trim()
  if (explicit) return explicit
  const legacyDocs = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (legacyDocs) return legacyDocs
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

function getFontInstallState(base) {
  const fontsDir = path.join(base, 'fonts')
  const markerPath = path.join(fontsDir, FONT_READY_MARKER)
  const manifestPath = path.join(fontsDir, FONT_MANIFEST_FILENAME)

  if (!fs.existsSync(fontsDir) || !fs.existsSync(markerPath) || !fs.existsSync(manifestPath)) {
    return { installed: false, isCurrent: false }
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(raw)
    const manifestVersion = typeof manifest?.version === 'number' ? manifest.version : null
    const families = Array.isArray(manifest?.families) ? manifest.families : []
    const familyNames = families
      .map((entry) => (entry && typeof entry.name === 'string' ? entry.name : null))
      .filter(Boolean)
    const weightCount = families.reduce((sum, entry) => (
      sum + (Array.isArray(entry?.weights) ? entry.weights.length : 0)
    ), 0)
    const hasAllFamilies = EXPECTED_FONT_FAMILIES.every((family) => familyNames.includes(family))
    const directoriesPresent = EXPECTED_FONT_FAMILIES.every((family) => fs.existsSync(path.join(fontsDir, family)))
    const isCurrent = manifestVersion === FONT_BUNDLE_VERSION
      && hasAllFamilies
      && directoriesPresent
      && weightCount === EXPECTED_FONT_WEIGHT_COUNT
    return { installed: isCurrent, isCurrent }
  } catch {
    return { installed: false, isCurrent: false }
  }
}

function ensureJPLearnDirs() {
  const base = getJPLearnDir()
  for (const sub of ['models', 'tts', 'data', 'fonts', 'tools', 'whisper', 'ocr']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true })
  }
  return base
}

function getTutorModelsDir(base) {
  return path.join(base, 'models', 'llama')
}

function getTutorModelPath(base, filename) {
  const preferredPath = path.join(getTutorModelsDir(base), filename)
  if (fs.existsSync(preferredPath)) {
    return preferredPath
  }
  const legacyPath = path.join(base, 'models', filename)
  if (fs.existsSync(legacyPath)) {
    return legacyPath
  }
  return preferredPath
}

// ── Voice model install state ─────────────────────────────────────────────────

function getVoiceDir(base) {
  return path.join(base, 'tts')
}

function getVoiceModelsDir(base) {
  return path.join(getVoiceDir(base), 'models')
}

function getVoicevoxAssetsInstallDir(base) {
  return path.join(base, 'tools', 'voicevox')
}

function getVoicevoxAssetsExecutableCandidates(base) {
  const installDir = getVoicevoxAssetsInstallDir(base)
  return [
    path.join(installDir, 'VOICEVOX.exe'),
    path.join(installDir, 'vv-engine', 'run.exe'),
    path.join(installDir, 'VOICEVOX', 'VOICEVOX.exe'),
    path.join(installDir, 'VOICEVOX', 'vv-engine', 'run.exe'),
  ]
}

function isVoicevoxInstalledInAssets(base) {
  return getVoicevoxAssetsExecutableCandidates(base).some((candidate) => fs.existsSync(candidate))
}

function isVoiceTalkerInstalled(base, tier) {
  const model = VOICE_MODELS[tier]
  if (!model) return false
  return fs.existsSync(path.join(getVoiceModelsDir(base), model.talkerFilename))
}

function isVoiceTokenizerInstalled(base) {
  return fs.existsSync(path.join(getVoiceModelsDir(base), VOICE_TOKENIZER.filename))
}

function getVoicevoxExecutableCandidates() {
  const candidates = []
  const explicit = (process.env.JPLEARN_VOICEVOX_EXECUTABLE || '').trim()
  if (explicit) {
    candidates.push(explicit)
  }

  const base = getJPLearnDir()
  candidates.push(...getVoicevoxAssetsExecutableCandidates(base))

  const localAppData = (process.env.LOCALAPPDATA || '').trim()
  const programFiles = (process.env.ProgramFiles || '').trim()
  const programFilesX86 = (process.env['ProgramFiles(x86)'] || '').trim()

  if (localAppData) {
    candidates.push(path.join(localAppData, 'Programs', 'VOICEVOX', 'VOICEVOX.exe'))
    candidates.push(path.join(localAppData, 'Programs', 'VOICEVOX Engine', 'run.exe'))
  }
  if (programFiles) {
    candidates.push(path.join(programFiles, 'VOICEVOX', 'VOICEVOX.exe'))
    candidates.push(path.join(programFiles, 'VOICEVOX Engine', 'run.exe'))
  }
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, 'VOICEVOX', 'VOICEVOX.exe'))
    candidates.push(path.join(programFilesX86, 'VOICEVOX Engine', 'run.exe'))
  }

  // winget portable installs can live under LocalAppData\Microsoft\WinGet\Packages.
  if (localAppData) {
    const wingetPackagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
    try {
      if (fs.existsSync(wingetPackagesDir)) {
        const packageDirs = fs.readdirSync(wingetPackagesDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name.startsWith('HiroshibaKazuyuki.VOICEVOX'))
          .map((entry) => path.join(wingetPackagesDir, entry.name))
        for (const packageDir of packageDirs) {
          candidates.push(path.join(packageDir, 'VOICEVOX', 'VOICEVOX.exe'))
          candidates.push(path.join(packageDir, 'VOICEVOX', 'vv-engine', 'run.exe'))
        }
      }
    } catch {
      // Best-effort path discovery only.
    }
  }

  return [...new Set(candidates)]
}

function resolvePortableExtractRoot(extractDir) {
  const direct = path.join(extractDir, 'VOICEVOX.exe')
  if (fs.existsSync(direct)) {
    return extractDir
  }
  const nested = path.join(extractDir, 'VOICEVOX', 'VOICEVOX.exe')
  if (fs.existsSync(nested)) {
    return path.join(extractDir, 'VOICEVOX')
  }
  const entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  for (const entry of entries) {
    const dir = path.join(extractDir, entry.name)
    if (fs.existsSync(path.join(dir, 'VOICEVOX.exe'))) {
      return dir
    }
    if (fs.existsSync(path.join(dir, 'VOICEVOX', 'VOICEVOX.exe'))) {
      return path.join(dir, 'VOICEVOX')
    }
  }
  return null
}

function expandZipArchive(zipPath, destinationDir) {
  const escapedZip = zipPath.replace(/'/g, "''")
  const escapedDest = destinationDir.replace(/'/g, "''")

  const runExtractionCommand = (command, args, label) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 4000) output = output.slice(-4000)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 4000) output = output.slice(-4000)
    })
    child.on('error', (error) => reject(new Error(`${label} failed to start: ${error.message}`)))
    child.on('close', (code) => {
      if (Number(code || 0) === 0) {
        resolve()
      } else {
        reject(new Error(`${label} exited with code ${code}${output ? `: ${output.trim()}` : ''}`))
      }
    })
  })

  const resetDestinationDir = () => {
    fs.rmSync(destinationDir, { recursive: true, force: true })
    fs.mkdirSync(destinationDir, { recursive: true })
  }

  const extractionAttempts = [
    {
      label: 'ZipFile.ExtractToDirectory',
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        [
          `$zip='${escapedZip}'`,
          `$dest='${escapedDest}'`,
          'Add-Type -AssemblyName System.IO.Compression.FileSystem',
          '[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)',
        ].join('; '),
      ],
    },
    {
      label: 'tar -xf',
      command: 'tar.exe',
      args: ['-xf', zipPath, '-C', destinationDir],
    },
    {
      label: 'Expand-Archive',
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
      ],
    },
  ]

  return (async () => {
    const failures = []
    for (const attempt of extractionAttempts) {
      try {
        resetDestinationDir()
        await runExtractionCommand(attempt.command, attempt.args, attempt.label)
        return
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    throw new Error(`Archive extraction failed. ${failures.join(' | ')}`)
  })()
}

function installVoicevoxPortableToAssets(base, sender) {
  const installDir = getVoicevoxAssetsInstallDir(base)
  fs.mkdirSync(installDir, { recursive: true })

  const zipPath = path.join(installDir, `voicevox-windows-cpu-${VOICEVOX_PORTABLE_RELEASE}.zip`)
  const extractDir = path.join(installDir, '_extract')
  const targetDir = path.join(installDir, 'VOICEVOX')

  let lastEtaSec = null
  let lastDone = 0
  let lastTime = Date.now()

  const emit = (percent, mb = null, totalMb = null, etaSec = null) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', {
        id: 'voice',
        percent,
        mb,
        totalMb,
        etaSec,
      })
    }
  }

  emit(0)

  return downloadWithProgress(VOICEVOX_PORTABLE_DOWNLOAD_URL, zipPath, (done, total) => {
    const now = Date.now()
    const elapsed = (now - lastTime) / 1000
    if (elapsed > 0) {
      const bytesPerSec = (done - lastDone) / elapsed
      lastDone = done
      lastTime = now
      if (bytesPerSec > 0) {
        lastEtaSec = Math.round((total - done) / bytesPerSec)
      }
    }
    const rawPercent = Math.round((done / total) * 100)
    const mappedPercent = Math.max(1, Math.min(92, rawPercent))
    emit(mappedPercent, Math.round(done / (1024 * 1024)), Math.round(total / (1024 * 1024)), lastEtaSec)
  }).then(async () => {
    emit(94)
    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.mkdirSync(extractDir, { recursive: true })

    await expandZipArchive(zipPath, extractDir)
    emit(97)

    const extractedRoot = resolvePortableExtractRoot(extractDir)
    if (!extractedRoot) {
      throw new Error('VOICEVOX archive extracted, but executable was not found')
    }

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    fs.cpSync(extractedRoot, targetDir, { recursive: true, force: true })

    fs.rmSync(extractDir, { recursive: true, force: true })
    try { fs.unlinkSync(zipPath) } catch { /* ignore */ }

    const installedExe = path.join(targetDir, 'VOICEVOX.exe')
    if (!fs.existsSync(installedExe)) {
      throw new Error('VOICEVOX install completed, but executable validation failed')
    }

    emit(100)
    return { ok: true, mode: 'assets-portable', installDir: targetDir }
  })
}

function resolveInstalledVoicevoxExecutable() {
  return getVoicevoxExecutableCandidates().find((candidate) => fs.existsSync(candidate)) || null
}

function ensureVoiceSetupMarkers(base, tier) {
  const model = VOICE_MODELS[tier]
  if (!model) {
    return
  }
  const modelsDir = getVoiceModelsDir(base)
  fs.mkdirSync(modelsDir, { recursive: true })
  const talkerDest = path.join(modelsDir, model.talkerFilename)
  const tokenizerDest = path.join(modelsDir, VOICE_TOKENIZER.filename)
  if (!fs.existsSync(talkerDest)) {
    fs.writeFileSync(talkerDest, 'voice-model-ready\n', 'utf8')
  }
  if (!fs.existsSync(tokenizerDest)) {
    fs.writeFileSync(tokenizerDest, 'voice-engine-shared-ready\n', 'utf8')
  }
}

function probeVoicevoxReachable(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.request(
      {
        host: VOICEVOX_HOST,
        port: VOICEVOX_PORT,
        method: 'GET',
        path: '/version',
      },
      (response) => {
        const status = response.statusCode || 0
        resolve(status >= 200 && status < 300)
      },
    )
    request.setTimeout(timeoutMs, () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
    request.end()
  })
}

function hasAnyVoiceTalkerInstalled(base) {
  return Object.keys(VOICE_MODELS).some((tier) => isVoiceTalkerInstalled(base, tier))
}

// The active voice runtime does not require bundled local speaker banks.
// Keep this entry point for compatibility with existing startup/setup wiring.
function seedBundledVoicePresetSpeakers(scriptRootArg = null) {
  void scriptRootArg
  return { ok: true, skipped: true, reason: 'voice-runtime-does-not-use-preset-banks' }
}

function getActiveVoiceModelStatePath(base) {
  return path.join(getVoiceDir(base), ACTIVE_VOICE_MODEL_STATE_FILENAME)
}

function pruneDeprecatedVoiceAssets(base) {
  void base
}

function readActiveVoiceModelSelection(base) {
  try {
    const raw = fs.readFileSync(getActiveVoiceModelStatePath(base), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string' && typeof parsed.talkerFilename === 'string') {
      return parsed
    }
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

function resolveActiveVoiceModel(base) {
  const selection = readActiveVoiceModelSelection(base)
  if (selection && VOICE_MODELS[selection.tier] && isVoiceTalkerInstalled(base, selection.tier)) {
    return selection.tier
  }
  for (const tier of Object.keys(VOICE_MODELS)) {
    if (isVoiceTalkerInstalled(base, tier)) {
      return tier
    }
  }
  return null
}

function setActiveVoiceModelSelection(tier) {
  const model = VOICE_MODELS[tier]
  if (!model) throw new Error(`Unknown voice model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  fs.mkdirSync(getVoiceModelsDir(base), { recursive: true })
  fs.writeFileSync(
    getActiveVoiceModelStatePath(base),
    JSON.stringify({ tier, talkerFilename: model.talkerFilename, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallVoiceModelTier(tier) {
  const model = VOICE_MODELS[tier]
  if (!model) throw new Error(`Unknown voice model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const modelPath = path.join(getVoiceModelsDir(base), model.talkerFilename)
  if (fs.existsSync(modelPath)) {
    fs.unlinkSync(modelPath)
  }
  const tokenizerPath = path.join(getVoiceModelsDir(base), VOICE_TOKENIZER.filename)
  if (fs.existsSync(tokenizerPath)) {
    fs.unlinkSync(tokenizerPath)
  }
  const selection = readActiveVoiceModelSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveVoiceModelStatePath(base)) } catch { /* ignore */ }
  }
  return { ok: true, tier }
}

function getOfflineDictionarySqlitePath(base) {
  return path.join(base, 'data', 'external_sources', 'offline_dictionary', 'jmdict_lookup.sqlite')
}

function getOfflineDictionaryReadyPath(base) {
  return path.join(base, 'data', 'external_sources', 'offline_dictionary', '.pitch-accent-ready')
}

const OFFLINE_DICTIONARY_SCHEMA_VERSION = 4

function isOfflineDictionaryInstalled(base) {
  const sqlitePath = getOfflineDictionarySqlitePath(base)
  const readyPath = getOfflineDictionaryReadyPath(base)
  if (!fs.existsSync(sqlitePath) || !fs.existsSync(readyPath)) {
    return false
  }
  try {
    const marker = JSON.parse(fs.readFileSync(readyPath, 'utf8'))
    return marker?.schema_version === OFFLINE_DICTIONARY_SCHEMA_VERSION
  } catch {
    return false
  }
}

// ── Embedder install state (hidden — installed alongside chatbot tiers) ─────

function getEmbedderDir(base, embedderTier) {
  return path.join(base, 'models', 'embedders', embedderTier)
}

// The model files and, in the installed app, the packages that load them (audit 13, F1/F4).
function isEmbedderInstalled(base, embedderTier) {
  return fs.existsSync(path.join(getEmbedderDir(base, embedderTier), '.embedder-ready'))
    && featurePackagesReady(base, 'embedder')
}

/** Removes a feature's downloaded packages; a folder a running server still holds is left. */
function removeFeaturePackages(base, features) {
  for (const feature of features) {
    for (const dir of featurePackageDirs(base, feature)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch (error) {
        console.error(`[setup] Could not remove ${dir} (still in use?):`, error)
      }
    }
  }
}

function isEmbedderTierStillNeeded(base, embedderTier, excludeChatbotTier) {
  return Object.entries(MODELS).some(([chatbotTier, model]) => {
    if (chatbotTier === excludeChatbotTier) return false
    if (CHATBOT_TIER_TO_EMBEDDER_TIER[chatbotTier] !== embedderTier) return false
    return fs.existsSync(getTutorModelPath(base, model.filename))
  })
}

/**
 * Ensures the embedder mapped to a chatbot tier is installed, downloading it
 * in the background if needed. Best-effort: failures are logged but do not
 * fail the caller's chatbot install/select flow.
 */
function ensureEmbedderInstalled(embedderTier, sender, scriptRoot) {
  const embedder = EMBEDDERS[embedderTier]
  if (!embedder) return Promise.resolve({ ok: false, reason: `Unknown embedder tier: ${embedderTier}` })

  const base = ensureJPLearnDirs()
  if (isEmbedderInstalled(base, embedderTier)) {
    return Promise.resolve({ alreadyInstalled: true })
  }
  // The files may be here from before the packages had a home of their own (audit 13, F4).
  if (fs.existsSync(path.join(getEmbedderDir(base, embedderTier), '.embedder-ready'))) {
    return ensureEmbedderPackages(base, embedderTier)
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_embedder_model.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve) => {
    const child = spawn(pythonCmd, [scriptPath, '--tier', embedderTier], {
      env: {
        ...process.env,
        JPLEARN_ASSETS_DIR: base,
        JPLEARN_DOCUMENTS_DIR: base,
        JPLEARN_DOWNLOAD_BACKEND: process.env.JPLEARN_DOWNLOAD_BACKEND || 'auto',
      },
      windowsHide: true,
    })

    let currentPct = 0
    const emitProgress = () => {
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', { id: 'embedder', percent: currentPct, mb: null, totalMb: null, etaSec: null })
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const pctMatch = text.match(/downloading:\s*(\d{1,3})%\s*(?:\[[^\]]+\])?\s*\((\d+) MB\)/i)
      if (pctMatch) {
        currentPct = Math.max(0, Math.min(99, parseInt(pctMatch[1], 10)))
        emitProgress()
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        currentPct = 100
        emitProgress()
        resolve(ensureEmbedderPackages(base, embedderTier))
      } else {
        console.error(`get_embedder_model.py (${embedderTier}) exited with code ${code}`)
        resolve({ ok: false, reason: `exit code ${code}` })
      }
    })

    child.on('error', (err) => {
      console.error(`get_embedder_model.py (${embedderTier}) failed to start: ${err.message}`)
      resolve({ ok: false, reason: err.message })
    })
  })
}

// Best-effort, like the rest of the embedder install: without the packages, chat retrieval keeps
// using the hashed fallback.
async function ensureEmbedderPackages(base, embedderTier) {
  if (featurePackagesReady(base, 'embedder')) return { ok: true }
  try {
    await installFeaturePackages({ assetsDir: base, feature: 'embedder' })
    return { ok: true }
  } catch (error) {
    console.error(`[setup] embedder packages for ${embedderTier}:`, error)
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

function getSpeechModelDir(base, tier) {
  return path.join(base, 'whisper', tier)
}

// Every file, not just model.bin: model.bin downloads first, so a failure on a later file used
// to leave the tier "installed" and active with no tokenizer (audit 6 F4). Each file lands by
// rename once complete, so a present file is a whole one.
function isSpeechModelInstalled(base, tier) {
  const model = SPEECH_MODELS[tier]
  if (!model) return false
  const dir = getSpeechModelDir(base, tier)
  return model.files.every((filename) => fs.existsSync(path.join(dir, filename)))
    // In the installed app, faster-whisper must load too; it was never installed there (audit 13, F1).
    && featurePackagesReady(base, 'speech')
}

function getActiveSpeechModelStatePath(base) {
  return path.join(base, 'whisper', ACTIVE_SPEECH_MODEL_STATE_FILENAME)
}

function readActiveSpeechModelSelection(base) {
  try {
    const raw = fs.readFileSync(getActiveSpeechModelStatePath(base), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string') {
      return parsed
    }
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

function resolveActiveSpeechTier(base) {
  const selection = readActiveSpeechModelSelection(base)
  if (selection && SPEECH_MODELS[selection.tier] && isSpeechModelInstalled(base, selection.tier)) {
    return selection.tier
  }
  for (const tier of Object.keys(SPEECH_MODELS)) {
    if (isSpeechModelInstalled(base, tier)) {
      return tier
    }
  }
  return null
}

function setActiveSpeechModelTier(tier) {
  if (!SPEECH_MODELS[tier]) throw new Error(`Unknown speech model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  if (!isSpeechModelInstalled(base, tier)) {
    throw new Error(`Speech model tier "${tier}" is not installed`)
  }
  fs.writeFileSync(
    getActiveSpeechModelStatePath(base),
    JSON.stringify({ tier, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallSpeechModel(tier) {
  if (!SPEECH_MODELS[tier]) throw new Error(`Unknown speech model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const dir = getSpeechModelDir(base, tier)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const selection = readActiveSpeechModelSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveSpeechModelStatePath(base)) } catch { /* ignore */ }
  }
  const anyTierLeft = Object.keys(SPEECH_MODELS).some((other) => fs.existsSync(getSpeechModelDir(base, other)))
  if (!anyTierLeft) removeFeaturePackages(base, ['speech', 'speech-cuda'])
  return { ok: true, tier }
}

function getOcrModelDir(base, tier) {
  return path.join(base, 'ocr', tier)
}

function getOcrReadyMarkerPath(base, tier) {
  return path.join(getOcrModelDir(base, tier), 'model.ready')
}

// PaddleX's cache inside the assets folder, where the OCR weights live (audit 6 F7); the same
// groups as REQUIRED_MODEL_GROUPS in scripts/ocr_model_cache.py.
function getOcrWeightsDir(base) {
  return path.join(base, 'ocr', 'paddlex', 'official_models')
}

const OCR_REQUIRED_MODEL_GROUPS = [
  ['PP-OCRv6_medium_det', 'PP-OCRv6_medium_det_onnx'],
  ['PP-OCRv6_medium_rec', 'PP-OCRv6_medium_rec_onnx'],
]

function hasOcrWeightsIn(weightsDir) {
  return OCR_REQUIRED_MODEL_GROUPS.every((group) => group.some((name) => fs.existsSync(path.join(weightsDir, name))))
}

// The marker says setup finished; the weights decide. Installs before audit 6 left them in
// PaddleX's default cache, which the OCR server copies into the assets folder on first use.
function isOcrModelInstalled(base, tier) {
  if (!fs.existsSync(getOcrReadyMarkerPath(base, tier))) return false
  // In the installed app its packages must be in JPLearn Assets: in the version folder, every
  // update threw them away (audit 13, F2).
  if (!featurePackagesReady(base, 'ocr')) return false
  return hasOcrWeightsIn(getOcrWeightsDir(base))
    || hasOcrWeightsIn(path.join(os.homedir(), '.paddlex', 'official_models'))
}

function getActiveOcrModelStatePath(base) {
  return path.join(base, 'ocr', ACTIVE_OCR_MODEL_STATE_FILENAME)
}

function readActiveOcrModelSelection(base) {
  try {
    const raw = fs.readFileSync(getActiveOcrModelStatePath(base), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string') {
      return parsed
    }
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

function resolveActiveOcrTier(base) {
  const selection = readActiveOcrModelSelection(base)
  if (selection && OCR_MODELS[selection.tier] && isOcrModelInstalled(base, selection.tier)) {
    return selection.tier
  }
  for (const tier of Object.keys(OCR_MODELS)) {
    if (isOcrModelInstalled(base, tier)) {
      return tier
    }
  }
  return null
}

function setActiveOcrModelTier(tier) {
  if (!OCR_MODELS[tier]) throw new Error(`Unknown OCR model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  if (!isOcrModelInstalled(base, tier)) {
    throw new Error(`OCR model tier "${tier}" is not installed`)
  }
  fs.writeFileSync(
    getActiveOcrModelStatePath(base),
    JSON.stringify({ tier, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallOcrModel(tier) {
  if (!OCR_MODELS[tier]) throw new Error(`Unknown OCR model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const dir = getOcrModelDir(base, tier)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  // One OCR tier exists, so its weights go with it.
  const paddlexCache = path.join(base, 'ocr', 'paddlex')
  if (fs.existsSync(paddlexCache)) {
    fs.rmSync(paddlexCache, { recursive: true, force: true })
  }
  const selection = readActiveOcrModelSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveOcrModelStatePath(base)) } catch { /* ignore */ }
  }
  removeFeaturePackages(base, ['ocr'])
  return { ok: true, tier }
}

function getTranslationModelDir(base, tier) {
  return path.join(base, 'translation', tier)
}

function getTranslationReadyMarkerPath(base, tier) {
  return path.join(getTranslationModelDir(base, tier), 'model.ready')
}

function isTranslationModelInstalled(base, tier) {
  const translationModel = TRANSLATION_MODELS[tier]
  return fs.existsSync(getTranslationReadyMarkerPath(base, tier))
    && Boolean(translationModel)
    && fs.existsSync(path.join(base, 'models', 'llama', translationModel.filename))
}

function getActiveTranslationModelStatePath(base) {
  return path.join(base, 'translation', ACTIVE_TRANSLATION_MODEL_STATE_FILENAME)
}

function readActiveTranslationModelSelection(base) {
  try {
    const raw = fs.readFileSync(getActiveTranslationModelStatePath(base), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string') {
      return parsed
    }
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

function resolveActiveTranslationTier(base) {
  const selection = readActiveTranslationModelSelection(base)
  if (selection && TRANSLATION_MODELS[selection.tier] && isTranslationModelInstalled(base, selection.tier)) {
    return selection.tier
  }
  for (const tier of Object.keys(TRANSLATION_MODELS)) {
    if (isTranslationModelInstalled(base, tier)) {
      return tier
    }
  }
  return null
}

function setActiveTranslationModelTier(tier) {
  if (!TRANSLATION_MODELS[tier]) throw new Error(`Unknown translation model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  if (!isTranslationModelInstalled(base, tier)) {
    throw new Error(`Translation model tier "${tier}" is not installed`)
  }
  fs.writeFileSync(
    getActiveTranslationModelStatePath(base),
    // filename: the tutor runtime picks this model when no tutor model is active (llm_runtime.cjs)
    JSON.stringify({ tier, filename: TRANSLATION_MODELS[tier].filename, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallTranslationModel(tier) {
  if (!TRANSLATION_MODELS[tier]) throw new Error(`Unknown translation model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const dir = getTranslationModelDir(base, tier)
  const translationModel = TRANSLATION_MODELS[tier]
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  if (translationModel && translationModel.filename) {
    const modelPath = path.join(base, 'models', 'llama', translationModel.filename)
    if (fs.existsSync(modelPath)) {
      fs.rmSync(modelPath, { force: true })
    }
    removeTutorDownloadLeftovers(path.join(base, 'models', 'llama'), translationModel.filename)
  }
  const selection = readActiveTranslationModelSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveTranslationModelStatePath(base)) } catch { /* ignore */ }
  }
  return { ok: true, tier }
}

function isLlamaCppInstalled(base) {
  return fs.existsSync(path.join(base, 'tools', 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe'))
}

// Image Translation is OCR, a translation model and the runner that runs it (audit 14, F4; Robbie:
// "Install the runner too"): without llama.cpp the screen would open and every translation fail.
function isTranslationProfileInstalled(base, profile) {
  if (profile === 'ocr_qwen_local') {
    return isOcrModelInstalled(base, 'standard')
      && isTranslationModelInstalled(base, 'qwen_ja_en')
      && isLlamaCppInstalled(base)
  }
  return false
}

function resolveActiveTranslationProfile(base) {
  const activeTier = resolveActiveTranslationTier(base)
  if (activeTier === 'qwen_ja_en' && isTranslationProfileInstalled(base, 'ocr_qwen_local')) {
    return 'ocr_qwen_local'
  }
  return null
}

function runPythonCapture(pythonCmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, args, {
      env,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

async function ensureOcrPythonRuntime(scriptRoot, base) {
  // The installed app: into JPLearn Assets, which updates leave alone (audit 13, F2).
  if (bundledPythonCommand()) {
    await installFeaturePackages({ assetsDir: base, feature: 'ocr' })
    return
  }
  const pythonCmd = resolvePythonCommand(scriptRoot)
  const env = {
    ...process.env,
    JPLEARN_ASSETS_DIR: base,
    JPLEARN_DOCUMENTS_DIR: base,
    PADDLE_PDX_MODEL_SOURCE: process.env.PADDLE_PDX_MODEL_SOURCE || 'BOS',
  }

  const ensurePythonImport = async (importName, installCandidates) => {
    const initialProbe = await runPythonCapture(pythonCmd, ['-c', `import ${importName}`], env)
    if (initialProbe.code === 0) {
      return
    }

    let lastInstallResult = initialProbe
    for (const candidate of installCandidates) {
      lastInstallResult = await runPythonCapture(
        pythonCmd,
        ['-m', 'pip', 'install', '--disable-pip-version-check', ...candidate],
        env,
      )
      const probeAfterInstall = await runPythonCapture(pythonCmd, ['-c', `import ${importName}`], env)
      if (lastInstallResult.code === 0 && probeAfterInstall.code === 0) {
        return
      }
    }

    throw new Error(
      [
        `Failed to install Python runtime for '${importName}'.`,
        `Python command: ${pythonCmd}`,
        `Probe error: ${(initialProbe.stderr || initialProbe.stdout).trim() || '(empty)'}`,
        `Last install stderr: ${(lastInstallResult.stderr || '').trim() || '(empty)'}`,
        `Last install stdout: ${(lastInstallResult.stdout || '').trim() || '(empty)'}`,
      ].join('\n'),
    )
  }

  const ensureOcrImport = async () => {
    const probe = await runPythonCapture(pythonCmd, ['-c', 'import paddleocr'], env)
    if (probe.code === 0) {
      return { ok: true, probe }
    }

    // Keep OCR runtime deterministic across Windows machines.
    const installPaddle = await runPythonCapture(
      pythonCmd,
      ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', `paddlepaddle==${PADDLEPADDLE_VERSION}`],
      env,
    )
    const installPaddleOcr = await runPythonCapture(
      pythonCmd,
      ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', `paddleocr==${PADDLEOCR_VERSION}`],
      env,
    )
    const finalProbe = await runPythonCapture(pythonCmd, ['-c', 'import paddleocr'], env)
    if (installPaddle.code === 0 && installPaddleOcr.code === 0 && finalProbe.code === 0) {
      return { ok: true, probe: finalProbe }
    }

    const parts = [
      `Python command: ${pythonCmd}`,
      `Probe error: ${(probe.stderr || probe.stdout).trim() || '(empty)'}`,
      `Pinned paddlepaddle install stderr: ${installPaddle.stderr.trim() || '(empty)'}`,
      `Pinned paddlepaddle install stdout: ${installPaddle.stdout.trim() || '(empty)'}`,
      `Pinned paddleocr install stderr: ${installPaddleOcr.stderr.trim() || '(empty)'}`,
      `Pinned paddleocr install stdout: ${installPaddleOcr.stdout.trim() || '(empty)'}`,
      `Final probe error: ${(finalProbe.stderr || finalProbe.stdout).trim() || '(empty)'}`,
    ]
    throw new Error(`Failed to install OCR runtime packages.\n${parts.join('\n')}`)
  }

  const status = await ensureOcrImport()
  if (status.ok) {
    await ensurePythonImport('onnxruntime', [['onnxruntime']])
    await ensurePythonImport('numpy', [['numpy']])
    await ensurePythonImport('PIL', [['Pillow']])
    await ensurePythonImport('cv2', [['opencv-python-headless']])
    await ensurePythonImport('fasttext', [['fasttext-wheel'], ['fasttext']])
    return
  }
}

// ── System info ──────────────────────────────────────────────────────────────

/**
 * Measure download throughput in Mbps, resolving null on any failure.
 *
 * Hand-rolled rather than delegating to `network-speed`, because that library
 * left socket-level `error` events unlistened. Those are emitter errors, not
 * promise rejections, so `await`/`try` around the call could not catch them —
 * they reached Electron's default handler and popped a modal "A JavaScript error
 * occurred in the main process" dialog on every launch for anyone whose DNS
 * cannot resolve the probe host (`read ECONNRESET` at `TLSWrap.onStreamRead`,
 * `getaddrinfo ENOTFOUND proof.ovh.net`). This is a cosmetic download-time
 * estimate for the setup screen, so it must never be able to interrupt startup.
 *
 * Every stream that can emit `error` gets a listener, and the request is
 * destroyed once settled so a late event cannot arrive after resolution.
 */
function measureDownloadMbps(url, byteLimit, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    let request = null
    let timer = null
    let startedAt = Date.now()
    let received = 0

    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try {
        request?.destroy()
      } catch {
        // Already torn down.
      }
      resolve(value)
    }

    const throughput = () => {
      const seconds = (Date.now() - startedAt) / 1000
      if (seconds <= 0 || received <= 0) return null
      return (received * 8) / (seconds * 1_000_000)
    }
    // A slow line is still measured on what arrived; too little to judge is no estimate.
    const finishWithWhatArrived = () => finish(received >= SPEED_TEST_MIN_BYTES ? throughput() : null)

    timer = setTimeout(finishWithWhatArrived, timeoutMs)

    const follow = (currentUrl, hops) => {
      if (hops > 8) { finish(null); return }
      try {
        const mod = currentUrl.startsWith('https') ? https : http
        request = mod.get(currentUrl, {
          headers: { 'User-Agent': 'JPLearn/1.0', 'Range': `bytes=0-${byteLimit - 1}` },
        }, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.resume()
            follow(new URL(response.headers.location, currentUrl).toString(), hops + 1)
            return
          }
          if (response.statusCode !== 200 && response.statusCode !== 206) {
            response.destroy()
            finish(null)
            return
          }
          // Time the body only: redirects and TLS handshakes are not throughput.
          startedAt = Date.now()
          response.on('data', (chunk) => {
            received += chunk.length
            if (received >= byteLimit) {
              const mbps = throughput()
              response.destroy()
              finish(mbps)
            }
          })
          response.on('end', finishWithWhatArrived)
          response.on('error', () => finish(null))
        })
        request.on('error', () => finish(null))
      } catch {
        finish(null)
      }
    }
    follow(url, 0)
  })
}

async function measureNetworkMbps() {
  const model = Object.values(MODELS)[0]
  const mbps = await measureDownloadMbps(
    toHfResolveUrl(model.repo, model.filename),
    SPEED_TEST_BYTES,
    SPEED_TEST_TIMEOUT_MS,
  )
  return mbps && Number.isFinite(mbps) ? mbps : null
}

/**
 * A value that is slow to compute and that most callers can do without.
 *
 * `get(false)` returns whatever has already been computed -- null on a cold
 * cache -- and starts nothing, so the caller is never blocked and never causes
 * the computation. `get(true)` starts it (or joins one in flight) and awaits it.
 * Concurrent callers share one computation, and a computation that fails or
 * yields null is retried on the next waiting call rather than caching the
 * failure forever.
 *
 * Both network probes behind the setup screen use this. They exist only for the
 * cosmetic "about N minutes to download" hints and exact byte sizes, but
 * `getSystemInfo` also carries the install flags the renderer gates features on
 * (Image Translation checks `ocrInstalled`), and awaiting the probes meant those
 * flags read false for as long as the network took -- up to ~20 seconds after
 * launch, or forever on a stalled connection. Starting them from a non-waiting
 * call meant every launch contacted the network without the learner asking
 * (audit 6 F1): only the setup wizard, which the learner opened in order to
 * download something, waits, so only the wizard starts them.
 */
function createDeferredValue(compute) {
  let value = null
  let inFlight = null

  return {
    async get(wait = false) {
      if (value !== null) {
        return value
      }
      if (!wait) {
        return null
      }
      if (!inFlight) {
        inFlight = Promise.resolve()
          .then(compute)
          .catch(() => null)
          .then((result) => {
            value = result
            inFlight = null
            return result
          })
      }
      return await inFlight
    },
    reset() {
      value = null
      inFlight = null
    },
  }
}

const networkMbpsValue = createDeferredValue(measureNetworkMbps)

function estimateDownloadMinutes(sizeMb, networkMbps) {
  if (!networkMbps || !Number.isFinite(networkMbps) || networkMbps <= 0) {
    return null
  }
  const minutes = (sizeMb * 8) / (networkMbps * 60)
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null
  }
  return Math.max(1, Math.round(minutes))
}

function recommendTutorTier(totalRamGb, gpuVramGb) {
  if (gpuVramGb >= 12 || totalRamGb >= 14) return 'ultra'
  if (gpuVramGb >= 6 || totalRamGb >= 8) return 'high'
  if (gpuVramGb >= 4 || totalRamGb >= 6) return 'medium'
  return 'low'
}

function recommendSpeechTier(totalRamGb, gpuVramGb) {
  if (gpuVramGb >= 12 || totalRamGb >= 24) return 'ultra'
  if (gpuVramGb >= 8 || totalRamGb >= 16) return 'high'
  if (totalRamGb >= 10) return 'balanced'
  return 'fast'
}

function runQuiet(command, args, timeoutMs) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
        resolve({ ok: !error, stdout: typeof stdout === 'string' ? stdout : '' })
      })
    } catch {
      resolve({ ok: false, stdout: '' })
    }
  })
}

/**
 * The graphics adapters, their largest memory and whether an NVIDIA driver answers.
 *
 * Asynchronous and computed once per process: it used to be three `spawnSync` calls on every
 * install-state read, about 1.4-1.7 s of a frozen main process each time, twice per launch
 * (audit 6 F6). The adapter list does not change while the app runs, so the cache needs no
 * invalidation; a failed detection is cached too, as the empty result it always was.
 */
let gpuInfoPromise = null

function detectGpuInfo() {
  if (!gpuInfoPromise) {
    gpuInfoPromise = (async () => {
      if (process.platform !== 'win32') {
        return { names: [], vramGb: null, nvidiaDriver: false }
      }
      const listing = await runQuiet('powershell', [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.AdapterRAM)|$($_.Name)" }',
      ], 10000)
      const names = []
      const ramValues = []
      for (const line of listing.ok ? listing.stdout.split(/\r?\n/) : []) {
        const separator = line.indexOf('|')
        if (separator < 0) continue
        const ram = Number(line.slice(0, separator).trim())
        const name = line.slice(separator + 1).trim()
        if (name) names.push(name)
        if (Number.isFinite(ram) && ram > 0) ramValues.push(ram)
      }
      const vramGb = ramValues.length > 0
        ? Math.round((Math.max(...ramValues) / (1024 ** 3)) * 10) / 10
        : null
      const nvidiaDriver = names.join(' ').toLowerCase().includes('nvidia')
        ? (await runQuiet('nvidia-smi', ['-L'], 5000)).ok
        : false
      return { names, vramGb, nvidiaDriver }
    })()
  }
  return gpuInfoPromise
}

function detectLlamaBackend(gpuInfo) {
  const forced = String(process.env.JPLEARN_LLAMA_BACKEND || '').trim().toLowerCase()
  if (forced === 'cuda' || forced === 'hip' || forced === 'vulkan' || forced === 'cpu') {
    return forced
  }

  const names = gpuInfo.names.join(' ').toLowerCase()
  if (names.includes('nvidia') && gpuInfo.nvidiaDriver) {
    return 'cuda'
  }
  if (names.includes('amd') || names.includes('radeon')) {
    return 'hip'
  }
  if (names.includes('intel') || names.includes('arc')) {
    return 'vulkan'
  }
  return 'cpu'
}

/**
 * Snapshot of what is installed, what is recommended, and (when available) how
 * long downloads would take.
 *
 * `waitForNetworkEstimate` exists because the two callers want opposite things:
 * the setup wizard is choosing what to download and shows its own spinner, so it
 * waits for a real estimate; the running app only wants the install flags that
 * gate features like Image Translation, and used to spend up to ~20s reporting
 * everything as uninstalled while a speed probe ran.
 */
async function getSystemInfo(options = {}) {
  const waitForNetworkEstimate = Boolean(options && options.waitForNetworkEstimate)
  const base = ensureJPLearnDirs()
  const totalRamGb = os.totalmem() / (1024 ** 3)
  const llamaCppDir = path.join(base, 'tools', 'llama.cpp', 'build', 'bin', 'Release')
  const llamaCppInstalled = fs.existsSync(path.join(llamaCppDir, 'llama-server.exe'))
  const gpuInfo = await detectGpuInfo()
  const gpuAdapters = gpuInfo.names
  const gpuVramGb = gpuInfo.vramGb
  const recommendedTier = recommendTutorTier(totalRamGb, gpuVramGb || 0)
  const llamaCppBackend = detectLlamaBackend(gpuInfo)
  const networkMbpsRaw = await networkMbpsValue.get(waitForNetworkEstimate)
  const networkMbps = typeof networkMbpsRaw === 'number' && Number.isFinite(networkMbpsRaw)
    ? Math.round(networkMbpsRaw * 10) / 10
    : null

  const fontInstallState = getFontInstallState(base)
  const fontsInstalled = fontInstallState.installed
  const dictionaryInstalled = isOfflineDictionaryInstalled(base)
  const speechModels = await Promise.all(Object.entries(SPEECH_MODELS).map(async ([tier, m]) => {
    const exactSizeMb = await getSpeechModelSizeMb(m, waitForNetworkEstimate)
    return {
      tier,
      label: m.label,
      description: m.description,
      sizeMb: exactSizeMb,
      installed: isSpeechModelInstalled(base, tier),
      estimatedDownloadMinutes: estimateDownloadMinutes(exactSizeMb, networkMbps),
    }
  }))
  const ocrModels = Object.entries(OCR_MODELS).map(([tier, m]) => ({
    tier,
    label: m.label,
    description: m.description,
    sizeMb: m.sizeMb,
    installed: isOcrModelInstalled(base, tier),
    estimatedDownloadMinutes: estimateDownloadMinutes(m.sizeMb, networkMbps),
  }))
  const translationModels = Object.entries(TRANSLATION_MODELS).map(([tier, m]) => ({
    tier,
    label: m.label,
    badge: m.badge,
    description: m.description,
    sizeMb: m.sizeMb,
    installed: isTranslationModelInstalled(base, tier),
    estimatedDownloadMinutes: estimateDownloadMinutes(m.sizeMb, networkMbps),
  }))
  const translationProfiles = Object.entries(TRANSLATION_PROFILES).map(([tier, m]) => ({
    tier,
    label: m.label,
    badge: m.badge,
    description: m.description,
    sizeMb: m.sizeMb,
    installed: isTranslationProfileInstalled(base, tier),
    estimatedDownloadMinutes: estimateDownloadMinutes(m.sizeMb, networkMbps),
  }))

  let isPackaged = false
  try { isPackaged = require('electron').app.isPackaged } catch { /* dev mode */ }

  const models = await Promise.all(Object.entries(MODELS).map(async ([tier, m]) => {
    const exactModelSizeMb = await getTutorModelSizeMb(m, waitForNetworkEstimate)
    const embedderTier = CHATBOT_TIER_TO_EMBEDDER_TIER[tier]
    const embedder = embedderTier ? EMBEDDERS[embedderTier] : null
    const embedderSizeMb = embedder ? embedder.sizeMb : 0
    const combinedSizeMb = exactModelSizeMb + embedderSizeMb
    return {
      tier,
      filename: m.filename,
      sizeMb: exactModelSizeMb,
      embedderSizeMb,
      combinedSizeMb,
      label: m.label,
      description: m.description,
      installed: fs.existsSync(getTutorModelPath(base, m.filename)),
      estimatedDownloadMinutes: estimateDownloadMinutes(combinedSizeMb, networkMbps),
    }
  }))

  const voiceTokenizerInstalled = isVoiceTokenizerInstalled(base)
  const voicevoxInstalled = Boolean(resolveInstalledVoicevoxExecutable())
  const voiceEngineReachable = await probeVoicevoxReachable()
  const voiceModels = Object.entries(VOICE_MODELS).map(([tier, m]) => {
    const installed = isVoiceTalkerInstalled(base, tier) || voicevoxInstalled || voiceEngineReachable
    // Combined size only counts the tokenizer once, and only if it still
    // needs downloading -- mirrors downloadVoiceModel' own dedupe logic.
    const combinedSizeMb = m.talkerSizeMb + (voiceTokenizerInstalled ? 0 : VOICE_TOKENIZER.sizeMb)
    return {
      tier,
      filename: m.talkerFilename,
      sizeMb: m.talkerSizeMb,
      combinedSizeMb,
      label: m.label,
      description: m.description,
      installed,
      estimatedDownloadMinutes: estimateDownloadMinutes(combinedSizeMb, networkMbps),
    }
  })
  const voiceInstalled = (hasAnyVoiceTalkerInstalled(base) && voiceTokenizerInstalled)
    || voicevoxInstalled
    || voiceEngineReachable
  const voiceDefaultModel = VOICE_DEFAULT_TIER
  const activeVoiceModel = resolveActiveVoiceModel(base)
  const activeModelTier = resolveActiveTier(base)
  const activeEmbedderTier = activeModelTier ? CHATBOT_TIER_TO_EMBEDDER_TIER[activeModelTier] || null : null
  const activeEmbedderInstalled = activeEmbedderTier ? isEmbedderInstalled(base, activeEmbedderTier) : false
  const activeEmbedder = activeEmbedderTier ? EMBEDDERS[activeEmbedderTier] || null : null

  return {
    totalRamGb: Math.round(totalRamGb * 10) / 10,
    recommendedTier,
    activeModelTier,
    activeEmbedderTier,
    activeEmbedderLabel: activeEmbedder ? activeEmbedder.label : null,
    activeEmbedderInstalled,
    activeEmbedderEnabled: Boolean(activeModelTier && activeEmbedderInstalled),
    models,
    llamaCppInstalled,
    gpuAdapters,
    gpuVramGb,
    llamaCppBackend,
    llamaCppBackendLabel: LLAMA_BACKEND_LABELS[llamaCppBackend] || LLAMA_BACKEND_LABELS.cpu,
    fontsInstalled,
    dictionaryInstalled,
    speechModels,
    recommendedSpeechTier: recommendSpeechTier(totalRamGb, gpuVramGb || 0),
    activeSpeechModelTier: resolveActiveSpeechTier(base),
    ocrModels,
    recommendedOcrTier: 'standard',
    activeOcrModelTier: resolveActiveOcrTier(base),
    ocrInstalled: ocrModels.some((model) => model.installed),
    translationModels,
    recommendedTranslationTier: 'qwen_ja_en',
    activeTranslationModelTier: resolveActiveTranslationTier(base),
    translationInstalled: translationModels.some((model) => model.installed),
    // what the screenshot route needs: the tutor runtime would run a real model (audit 14, F4)
    translationReady: isLocalTranslationReady(),
    translationProfiles,
    activeTranslationProfileTier: resolveActiveTranslationProfile(base),
    isPackaged,
    networkMbps,
    llamaCppEstimatedDownloadMinutes: estimateDownloadMinutes(LLAMA_CPP_SIZE_MB, networkMbps),
    fontsEstimatedDownloadMinutes: estimateDownloadMinutes(FONTS_SIZE_MB, networkMbps),
    dictionaryEstimatedDownloadMinutes: estimateDownloadMinutes(DICTIONARY_SIZE_MB, networkMbps),
    voiceInstalled,
    voiceModels,
    voiceDefaultModel,
    activeVoiceModel,
  }
}

function downloadVoiceEngine(tier, sender, scriptRoot) {
  return downloadVoiceModel(tier, sender, scriptRoot)
}

function setActiveVoiceModel(tier) {
  return setActiveVoiceModelSelection(tier)
}

function uninstallVoiceModel(tier) {
  return uninstallVoiceModelTier(tier)
}

function seedBundledVoiceProfiles(scriptRootArg = null) {
  return seedBundledVoicePresetSpeakers(scriptRootArg)
}
function isFirstRun() {
  const sentinel = path.join(getJPLearnDir(), 'models', SENTINEL_NAME)
  return !fs.existsSync(sentinel)
}

// ── Active model selection ───────────────────────────────────────────────────
// The active tier is persisted as the exact filename llm_runtime.cjs should
// load, so both sides agree without either needing to know the other's tier
// catalogue. If no selection has been made (or the selected file was removed),
// callers fall back to the first installed tier in catalogue order.

function getActiveModelStatePath(base) {
  return path.join(base, 'models', ACTIVE_MODEL_STATE_FILENAME)
}

function readActiveModelSelection(base) {
  try {
    const raw = fs.readFileSync(getActiveModelStatePath(base), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.filename === 'string' && typeof parsed.tier === 'string') {
      return parsed
    }
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

function resolveActiveTier(base) {
  const selection = readActiveModelSelection(base)
  if (selection && MODELS[selection.tier] && fs.existsSync(getTutorModelPath(base, selection.filename))) {
    return selection.tier
  }
  for (const [tier, model] of Object.entries(MODELS)) {
    if (fs.existsSync(getTutorModelPath(base, model.filename))) {
      return tier
    }
  }
  return null
}

function setActiveModelTier(tier) {
  const model = MODELS[tier]
  if (!model) throw new Error(`Unknown model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  pruneDeprecatedVoiceAssets(base)
  if (!fs.existsSync(getTutorModelPath(base, model.filename))) {
    throw new Error(`Model tier "${tier}" is not installed`)
  }
  fs.writeFileSync(
    getActiveModelStatePath(base),
    JSON.stringify({ tier, filename: model.filename, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallModel(tier) {
  const model = MODELS[tier]
  if (!model) throw new Error(`Unknown model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const modelPaths = [
    path.join(getTutorModelsDir(base), model.filename),
    path.join(base, 'models', model.filename),
  ]
  for (const modelPath of modelPaths) {
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath)
    }
  }
  removeTutorDownloadLeftovers(getTutorModelsDir(base), model.filename)
  const selection = readActiveModelSelection(base)
  if (selection && selection.filename === model.filename) {
    try { fs.unlinkSync(getActiveModelStatePath(base)) } catch { /* ignore */ }
  }

  // Clean up the mapped embedder only if no other installed chatbot tier
  // still depends on it (embedders can be shared across tiers).
  const embedderTier = CHATBOT_TIER_TO_EMBEDDER_TIER[tier]
  if (embedderTier && !isEmbedderTierStillNeeded(base, embedderTier, tier)) {
    const embedderDir = getEmbedderDir(base, embedderTier)
    if (fs.existsSync(embedderDir)) {
      try { fs.rmSync(embedderDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  }

  return { ok: true, tier }
}

/**
 * The pieces a failed or abandoned download of `filename` leaves beside it: the HTTP downloader's
 * `.tmp` and `.partN` files, and the Hugging Face CLI's bookkeeping under `--local-dir`. Nothing
 * else removes them, and they can add up to a whole model (audit 6 F2).
 */
function removeTutorDownloadLeftovers(modelsDir, filename) {
  const leftovers = [`${filename}.tmp`]
  for (let index = 0; index < PARALLEL_CONNECTIONS; index += 1) {
    leftovers.push(`${filename}.part${index}`)
  }
  for (const leftover of leftovers) {
    try { fs.rmSync(path.join(modelsDir, leftover), { force: true }) } catch { /* best effort */ }
  }
  const hfDownloadDir = path.join(modelsDir, '.cache', 'huggingface', 'download')
  let entries = []
  try { entries = fs.readdirSync(hfDownloadDir) } catch { /* no CLI download was made here */ }
  for (const entry of entries) {
    if (entry.startsWith(filename)) {
      try { fs.rmSync(path.join(hfDownloadDir, entry), { recursive: true, force: true }) } catch { /* best effort */ }
    }
  }
}

function writeSentinel() {
  const base = getJPLearnDir()
  fs.mkdirSync(path.join(base, 'models'), { recursive: true })
  fs.writeFileSync(
    path.join(base, 'models', SENTINEL_NAME),
    new Date().toISOString(),
    'utf8',
  )
}

// ── Download helpers ─────────────────────────────────────────────────────────

// Number of parallel TCP connections used when the server supports Range requests.
// CDNs (HuggingFace/S3/Cloudflare) throttle individual connections; 8 parallel
// connections saturates the available bandwidth on fast lines.
const PARALLEL_CONNECTIONS = 8
// A download connection that stays open but sends nothing for this long fails, rather than
// holding setup on an endless progress bar (audit 6 F5). The partial files stay and resume.
const DOWNLOAD_IDLE_TIMEOUT_MS = 60000

function failWhenIdle(req, what) {
  req.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
    req.destroy(new Error(`${what} stalled: no data for ${DOWNLOAD_IDLE_TIMEOUT_MS / 1000} s`))
  })
}

/**
 * Follow all HTTP redirects for url, sending Range: bytes=0-0 on the final hop
 * to detect range-request support and the total file size in one round trip.
 */
function probeUrl(url) {
  return new Promise((resolve, reject) => {
    // Without this the request can hang indefinitely on a stalled connection,
    // and anything awaiting it (getSystemInfo, and so every install flag the
    // renderer gates features on) hangs with it.
    let activeRequest = null
    const timer = setTimeout(() => {
      try {
        activeRequest?.destroy()
      } catch {
        // Already gone.
      }
      reject(new Error(`Size probe timed out: ${url}`))
    }, REMOTE_SIZE_PROBE_TIMEOUT_MS)
    const settle = (fn) => (value) => {
      clearTimeout(timer)
      fn(value)
    }
    resolve = settle(resolve)
    reject = settle(reject)

    function follow(redirectUrl, hops) {
      if (hops > 8) { reject(new Error('Too many redirects')); return }
      const mod = redirectUrl.startsWith('https') ? https : http
      activeRequest = mod.get(redirectUrl, {
        headers: { 'User-Agent': 'JPLearn/1.0', 'Range': 'bytes=0-0' },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          const nextUrl = new URL(res.headers.location, redirectUrl).toString()
          follow(nextUrl, hops + 1)
          return
        }
        res.resume() // drain the 1-byte probe body
        const supportsRanges = res.statusCode === 206
        let total = 0
        if (supportsRanges && res.headers['content-range']) {
          const m = res.headers['content-range'].match(/\/(\d+)$/)
          if (m) total = parseInt(m[1], 10)
        } else {
          total = parseInt(res.headers['content-length'] || '0', 10)
        }
        resolve({ finalUrl: redirectUrl, total, supportsRanges })
      })
      activeRequest.on('error', reject)
    }
    follow(url, 0)
  })
}

function toHfResolveUrl(repo, filename, revision = 'main') {
  return `https://huggingface.co/${repo}/resolve/${revision}/${filename}`
}

/**
 * Exact download size for a remote asset, or null when it isn't known yet.
 *
 * Same opt-in shape as the throughput probe: with `wait: false` this returns
 * only what has already been fetched and contacts nothing, so callers that just
 * want install flags never reach huggingface.co.
 */
async function getCachedUrlSizeBytes(url, wait = false) {
  let entry = REMOTE_SIZE_CACHE.get(url)
  if (!entry) {
    entry = createDeferredValue(async () => {
      const { total } = await probeUrl(url)
      return total > 0 ? total : null
    })
    REMOTE_SIZE_CACHE.set(url, entry)
  }
  return await entry.get(wait)
}

// A null exact size falls back to the hardcoded model.sizeMb, so the setup
// screen shows an approximate number rather than nothing.
async function getTutorModelSizeMb(model, wait = false) {
  const sizeBytes = await getCachedUrlSizeBytes(toHfResolveUrl(model.repo, model.filename), wait)
  if (!sizeBytes || sizeBytes <= 0) return model.sizeMb
  return Math.max(1, Math.round(sizeBytes / (1024 * 1024)))
}

async function getSpeechModelSizeMb(model, wait = false) {
  if (!model.repo || !Array.isArray(model.files) || model.files.length === 0) {
    return model.sizeMb
  }

  const sizes = await Promise.all(
    model.files.map((filename) => getCachedUrlSizeBytes(toHfResolveUrl(model.repo, filename), wait)),
  )

  if (sizes.some((value) => !value || value <= 0)) {
    return model.sizeMb
  }

  const totalBytes = sizes.reduce((sum, value) => sum + (value || 0), 0)
  return Math.max(1, Math.round(totalBytes / (1024 * 1024)))
}

function tryGetFileSize(filePath) {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

function parseHfResolveUrl(url) {
  try {
    const parsed = new URL(url)
    if ((parsed.hostname || '').toLowerCase() !== 'huggingface.co') return null
    const pathName = (parsed.pathname || '').replace(/^\/+/, '')
    const marker = '/resolve/'
    const markerIndex = pathName.indexOf(marker)
    if (markerIndex <= 0) return null
    const repoId = pathName.slice(0, markerIndex)
    const rest = pathName.slice(markerIndex + marker.length)
    const slash = rest.indexOf('/')
    if (slash <= 0) return null
    const revision = rest.slice(0, slash)
    const filePath = rest.slice(slash + 1)
    if (!repoId || !revision || !filePath) return null
    return { repoId, revision, filePath }
  } catch {
    return null
  }
}

/**
 * The Hugging Face CLI to download with, or null to use the built-in HTTP downloader.
 *
 * Asynchronous and bounded: these checks used to be `spawnSync` calls with no time limit on the
 * main process, ending in a `pip install huggingface-hub` that froze the window for as long as
 * pip took (forever-ish offline) and changed the bundled Python (audit 6 F6). Nothing is
 * installed here now; without a CLI, `downloadWithProgress` does the job.
 */
async function resolveHfCliCommand(pythonCmd) {
  if ((await runQuiet('hf', ['--help'], 10000)).ok) return ['hf']
  if ((await runQuiet('huggingface-cli', ['--help'], 10000)).ok) return ['huggingface-cli']
  if (pythonCmd && (await runQuiet(pythonCmd, ['-c', 'import huggingface_hub.commands.huggingface_cli'], 15000)).ok) {
    return [pythonCmd, '-m', 'huggingface_hub.commands.huggingface_cli']
  }
  return null
}

async function downloadWithHfCli(url, destPath, pythonCmd, onProgress, expectedTotalBytes) {
  const parsed = parseHfResolveUrl(url)
  const cliCommand = parsed ? await resolveHfCliCommand(pythonCmd) : null
  if (!parsed || !cliCommand) {
    return { ok: false, reason: 'HF CLI not available (no hf executable and no python huggingface-hub CLI).' }
  }

  const outputDir = path.dirname(destPath)
  const expectedPath = path.join(outputDir, ...parsed.filePath.split('/'))
  fs.mkdirSync(path.dirname(expectedPath), { recursive: true })

  const executable = cliCommand[0]
  const baseArgs = cliCommand.slice(1)
  const args = [
    ...baseArgs,
    'download',
    parsed.repoId,
    parsed.filePath,
    '--revision',
    parsed.revision,
    '--local-dir',
    outputDir,
  ]

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        PYTHONUTF8: process.env.PYTHONUTF8 || '1',
        PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
      },
      windowsHide: true,
    })

    let stderrTail = ''
    let stdoutTail = ''
    let lastPercentFromOutput = -1
    let lastEmittedPercent = -1
    const startedAt = Date.now()
    const appendTail = (prev, chunk) => {
      const text = `${prev}${chunk.toString()}`
      const MAX_TAIL = 2000
      return text.length > MAX_TAIL ? text.slice(-MAX_TAIL) : text
    }

    const emitProgress = (percent) => {
      if (!onProgress) return
      const bounded = Math.max(0, Math.min(100, percent))
      if (bounded <= lastEmittedPercent) return
      lastEmittedPercent = bounded
      const done = Math.round((bounded / 100) * total)
      onProgress(done, total, 'hf-cli')
    }

    const emitPercentProgress = (text) => {
      if (!onProgress) return
      // Accept both tqdm-like "12%|" and plain "12%" forms.
      const matches = [...text.matchAll(/(\d{1,3})%/g)]
      if (matches.length <= 0) return
      const raw = parseInt(matches[matches.length - 1][1], 10)
      if (!Number.isFinite(raw)) return
      const percent = Math.max(0, Math.min(100, raw))
      if (percent <= lastPercentFromOutput) return
      lastPercentFromOutput = percent
      emitProgress(percent)
    }

    child.stderr.on('data', (chunk) => {
      stderrTail = appendTail(stderrTail, chunk)
      emitPercentProgress(chunk.toString())
    })

    child.stdout.on('data', (chunk) => {
      stdoutTail = appendTail(stdoutTail, chunk)
      emitPercentProgress(chunk.toString())
    })

    const total = Math.max(1, expectedTotalBytes || 1)
    const poll = setInterval(() => {
      if (!onProgress) return
      const size = Math.min(total, tryGetFileSize(expectedPath))
      const measuredPercent = Math.round((size / total) * 100)

      if (measuredPercent > 0) {
        emitProgress(measuredPercent)
        return
      }

      // Some hf-cli runs don't expose intermediate bytes for --local-dir.
      // Show smooth, bounded progress instead of a 0% -> 100% jump.
      const elapsedSec = (Date.now() - startedAt) / 1000
      const syntheticPercent = Math.min(92, Math.floor(2 + elapsedSec * 7))
      emitProgress(syntheticPercent)
    }, 120)

    const finish = (ok, reason = null) => {
      clearInterval(poll)
      if (ok) {
        if (expectedPath !== destPath && fs.existsSync(expectedPath)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          try { fs.unlinkSync(destPath) } catch { /* ignore */ }
          fs.renameSync(expectedPath, destPath)
        }
        if (onProgress) {
          const finalSize = Math.min(total, tryGetFileSize(destPath))
          const finalPercent = finalSize > 0 ? Math.round((finalSize / total) * 100) : 100
          emitProgress(Math.max(finalPercent, 100))
        }
      }
      resolve({ ok, reason })
    }

    child.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`hf-cli failed to start; falling back to HTTP: ${message}`)
      finish(false, `hf-cli failed to start: ${message}`)
    })
    child.on('close', (code) => {
      const succeeded = code === 0 && fs.existsSync(expectedPath)
      if (!succeeded) {
        const detail = (stderrTail || stdoutTail || '').trim()
        console.warn(`hf-cli exited with code ${code}; falling back to HTTP${detail ? `\n${detail}` : ''}`)
        const reason = detail
          ? `hf-cli exited with code ${code}: ${detail}`
          : `hf-cli exited with code ${code}`
        finish(false, reason)
        return
      }
      finish(true, null)
    })
  })
}

/**
 * Download a single byte range [start, end] from finalUrl to partPath.
 * Calls onBytes(n) for each received chunk for aggregate progress tracking.
 */
function downloadRange(finalUrl, start, end, partPath, onBytes, append = false) {
  return new Promise((resolve, reject) => {
    const mod = finalUrl.startsWith('https') ? https : http
    const out = fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' })
    const req = mod.get(finalUrl, {
      headers: { 'User-Agent': 'JPLearn/1.0', 'Range': `bytes=${start}-${end}` },
    }, (res) => {
      if (res.statusCode !== 206) {
        out.destroy()
        try { fs.unlinkSync(partPath) } catch { /* ignore */ }
        reject(new Error(`HTTP ${res.statusCode} for range ${start}-${end}`))
        return
      }
      res.on('data', (chunk) => onBytes(chunk.length))
      res.pipe(out)
      out.on('finish', resolve)
      const cleanup = (err) => {
        out.destroy()
        reject(err)
      }
      out.on('error', cleanup)
      res.on('error', cleanup)
    })
    failWhenIdle(req, `Download of range ${start}-${end}`)
    req.on('error', (err) => {
      out.destroy()
      reject(err)
    })
  })
}

/**
 * Stream-assemble ordered part files into tmpPath, then atomically rename to destPath.
 * Each part file is deleted immediately after its bytes are written.
 */
function assembleParts(parts, tmpPath, destPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath)
    let i = 0

    const writeNext = () => {
      if (i >= parts.length) { out.end(); return }
      const { partPath } = parts[i++]
      const src = fs.createReadStream(partPath)
      src.pipe(out, { end: false })
      src.on('end', () => { try { fs.unlinkSync(partPath) } catch { /* ignore */ } writeNext() })
      src.on('error', (err) => { out.destroy(); reject(err) })
    }

    out.on('finish', () => {
      try { fs.renameSync(tmpPath, destPath); resolve() }
      catch (err) { try { fs.unlinkSync(tmpPath) } catch { /* ignore */ } reject(err) }
    })
    out.on('error', reject)
    writeNext()
  })
}

/**
 * Single-connection fallback for servers that do not support Range requests.
 */
function singleConnectionDownload(finalUrl, tmpPath, knownTotal, onProgress) {
  return new Promise((resolve, reject) => {
    let existing = tryGetFileSize(tmpPath)
    if (knownTotal > 0 && existing > knownTotal) {
      try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      existing = 0
    }

    if (knownTotal > 0 && existing === knownTotal) {
      if (onProgress) onProgress(knownTotal, knownTotal)
      resolve()
      return
    }

    const requestWithRedirects = (urlToGet, hops) => {
      if (hops > 8) {
        reject(new Error('Too many redirects downloading model'))
        return
      }

      const headers = { 'User-Agent': 'JPLearn/1.0' }
      if (existing > 0) {
        headers.Range = `bytes=${existing}-`
      }

      const mod = urlToGet.startsWith('https') ? https : http
      const req = mod.get(urlToGet, { headers }, (res) => {
        const status = res.statusCode || 0
        const isRedirect = status >= 300 && status < 400 && !!res.headers.location
        if (isRedirect) {
          const nextUrl = new URL(res.headers.location, urlToGet).toString()
          res.resume()
          requestWithRedirects(nextUrl, hops + 1)
          return
        }

        const resIsFull = status === 200
        const resIsRange = status === 206
        if (!resIsFull && !resIsRange) {
          reject(new Error(`HTTP ${status} downloading ${urlToGet}`))
          return
        }

        let total = knownTotal || 0
        if (resIsRange && res.headers['content-range']) {
          const m = res.headers['content-range'].match(/\/(\d+)$/)
          if (m) total = parseInt(m[1], 10)
        }
        if (total === 0) {
          const contentLen = parseInt(res.headers['content-length'] || '0', 10)
          total = resIsRange ? existing + contentLen : contentLen
        }

        const shouldAppend = resIsRange && existing > 0
        if (!shouldAppend && existing > 0) {
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          existing = 0
        }

        let done = existing
        let lastReportedPct = -1
        const out = fs.createWriteStream(tmpPath, { flags: shouldAppend ? 'a' : 'w' })
        res.on('data', (chunk) => {
          done += chunk.length
          if (total > 0 && onProgress) {
            const pct = Math.round((done / total) * 100)
            if (pct !== lastReportedPct) { lastReportedPct = pct; onProgress(done, total) }
          }
        })
        res.pipe(out)
        out.on('finish', resolve)
        const cleanup = (err) => { reject(err) }
        out.on('error', cleanup)
        res.on('error', cleanup)
      })
      failWhenIdle(req, 'Download')
      req.on('error', reject)
    }

    requestWithRedirects(finalUrl, 0)
  })
}

/**
 * Download url → destPath using parallel Range requests for maximum throughput.
 * Probes the final CDN URL first; falls back to a single connection if the server
 * does not support Range headers. Writes .tmp and .partN files during download;
 * atomically renames to destPath only on full success.
 */
function downloadWithProgress(url, destPath, onProgress) {
  const tmpPath = `${destPath}.tmp`

  return new Promise((resolve, reject) => {
    probeUrl(url).then(({ finalUrl, total, supportsRanges }) => {
      if (!supportsRanges || total === 0) {
        singleConnectionDownload(finalUrl, tmpPath, total, (done, totalBytes) => onProgress(done, totalBytes, 'http'))
          .then(() => { fs.renameSync(tmpPath, destPath); resolve() })
          .catch(reject)
        return
      }

      const chunkSize = Math.ceil(total / PARALLEL_CONNECTIONS)
      const parts = Array.from({ length: PARALLEL_CONNECTIONS }, (_, i) => ({
        start: i * chunkSize,
        end: Math.min((i + 1) * chunkSize - 1, total - 1),
        partPath: `${destPath}.part${i}`,
      }))

      let done = 0
      let lastReportedPct = -1
      const onBytes = (n) => {
        done += n
        if (total > 0 && onProgress) {
          const pct = Math.round((done / total) * 100)
          if (pct !== lastReportedPct) { lastReportedPct = pct; onProgress(done, total, 'http-range') }
        }
      }

      const downloads = []
      for (const part of parts) {
        const expectedSize = part.end - part.start + 1
        let existingSize = tryGetFileSize(part.partPath)

        if (existingSize < 0) existingSize = 0
        if (existingSize > expectedSize) {
          try { fs.unlinkSync(part.partPath) } catch { /* ignore */ }
          existingSize = 0
        }

        if (existingSize === expectedSize) {
          done += existingSize
          continue
        }

        done += existingSize
        downloads.push(downloadRange(
          finalUrl,
          part.start + existingSize,
          part.end,
          part.partPath,
          onBytes,
          existingSize > 0,
        ))
      }

      if (total > 0 && onProgress) {
        const pct = Math.round((done / total) * 100)
        if (pct !== lastReportedPct) { lastReportedPct = pct; onProgress(done, total, 'http-range') }
      }

      Promise.all(downloads)
        .then(() => assembleParts(parts, tmpPath, destPath).then(resolve).catch(reject))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          const shouldFallbackToSingle = /HTTP\s+403\s+for\s+range/i.test(message)

          if (!shouldFallbackToSingle) {
            reject(err)
            return
          }

          // Some CDN edges reject individual ranged chunk requests mid-download.
          // Retry once with a resumable single stream against the canonical URL.
          singleConnectionDownload(url, tmpPath, total, (done, totalBytes) => onProgress(done, totalBytes, 'http'))
            .then(() => { fs.renameSync(tmpPath, destPath); resolve() })
            .catch(reject)
        })
    }).catch(reject)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

function downloadModel(tier, sender, scriptRoot) {
  const model = MODELS[tier]
  if (!model) return Promise.reject(new Error(`Unknown model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const modelsDir = getTutorModelsDir(base)
  fs.mkdirSync(modelsDir, { recursive: true })
  const legacyPath = path.join(base, 'models', model.filename)
  const destPath = path.join(modelsDir, model.filename)
  const embedderTier = CHATBOT_TIER_TO_EMBEDDER_TIER[tier]
  const hadActiveTier = resolveActiveTier(base)

  const ensureEmbedder = async () => {
    if (!embedderTier || !scriptRoot) return
    try {
      await ensureEmbedderInstalled(embedderTier, sender, scriptRoot)
    } catch (err) {
      console.error(`Embedder install failed for chatbot tier "${tier}": ${err instanceof Error ? err.message : err}`)
    }
  }

  const ensureLlamaCpp = async () => {
    if (!scriptRoot) {
      return false
    }
    const result = await downloadLlamaCpp(sender, scriptRoot)
    return !result?.alreadyInstalled
  }

  const ensureActiveSelection = () => {
    if (hadActiveTier) {
      return false
    }
    setActiveModelTier(tier)
    return true
  }

  const hasInstalledModel = fs.existsSync(destPath) || fs.existsSync(legacyPath)

  if (hasInstalledModel) {
    if (fs.existsSync(legacyPath) && !fs.existsSync(destPath)) {
      try {
        fs.renameSync(legacyPath, destPath)
      } catch {
        // Fall back to using legacy location if move fails.
      }
    }
    return ensureLlamaCpp().then(async (llamaCppDownloaded) => {
      await ensureEmbedder()
      const selectedAsActive = ensureActiveSelection()
      return { alreadyInstalled: true, llamaCppDownloaded, selectedAsActive }
    })
  }

  const url = `https://huggingface.co/${model.repo}/resolve/main/${model.filename}`
  let lastEtaSec = null

  const startTime = Date.now()
  let lastDone = 0
  let lastTime = startTime

  const onProgress = (done, total, method = null) => {
    const now = Date.now()
    const elapsed = (now - lastTime) / 1000
    if (elapsed > 0) {
      const bytesPerSec = (done - lastDone) / elapsed
      lastDone = done
      lastTime = now
      if (bytesPerSec > 0) {
        lastEtaSec = Math.round((total - done) / bytesPerSec)
      }
    }
    const percent = Math.round((done / total) * 100)
    const mb = Math.round(done / (1024 * 1024))
    const totalMb = Math.round(total / (1024 * 1024))
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', {
        id: 'model',
        percent,
        mb,
        totalMb,
        etaSec: lastEtaSec,
        logMessage: method ? `downloading: ${percent}% [${method}]` : undefined,
      })
    }
  }

  return ensureLlamaCpp().then(async (llamaCppDownloaded) => {
    const pythonCmd = scriptRoot ? resolvePythonCommand(scriptRoot) : null
    // The learner started this download, so the host may be asked for its exact size.
    const exactTotalBytes = await getCachedUrlSizeBytes(url, true)
    const expectedTotalBytes = exactTotalBytes && exactTotalBytes > 0
      ? exactTotalBytes
      : Math.round((model.sizeMb || 0) * 1024 * 1024)

    const hfResult = await downloadWithHfCli(url, destPath, pythonCmd, onProgress, expectedTotalBytes)
    if (!hfResult.ok) {
      if (sender && !sender.isDestroyed()) {
        const percent = Math.round((lastDone / Math.max(1, expectedTotalBytes || 1)) * 100)
        sender.send('setup:download-progress', {
          id: 'model',
          percent: Math.max(0, Math.min(99, percent)),
          mb: Math.round(lastDone / (1024 * 1024)),
          totalMb: expectedTotalBytes > 0 ? Math.round(expectedTotalBytes / (1024 * 1024)) : null,
          etaSec: lastEtaSec,
          logMessage: hfResult.reason ? `hf-cli fallback: ${hfResult.reason}` : 'hf-cli fallback: unknown reason',
        })
      }
      await downloadWithProgress(url, destPath, onProgress)
    }

    await ensureEmbedder()
    const selectedAsActive = ensureActiveSelection()
    return { ok: true, llamaCppDownloaded, selectedAsActive }
  })
}

// Marks the optional voice setup step as completed. Voice synthesis itself is
// provided by a locally running VOICEVOX engine.
function downloadVoiceModel(tier, sender, scriptRoot) {
  void scriptRoot
  const model = VOICE_MODELS[tier]
  if (!model) return Promise.reject(new Error(`Unknown voice model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  pruneDeprecatedVoiceAssets(base)

  const voicevoxAlreadyInstalled = isVoicevoxInstalledInAssets(base)
  if (voicevoxAlreadyInstalled) {
    ensureVoiceSetupMarkers(base, tier)
    return Promise.resolve({ alreadyInstalled: true })
  }

  const emitProgress = (percent) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'voice', percent, mb: null, totalMb: null, etaSec: null })
    }
  }

  emitProgress(0)

  return (async () => {
    const portableResult = await installVoicevoxPortableToAssets(base, sender)
    ensureVoiceSetupMarkers(base, tier)
    emitProgress(100)
    return portableResult
  })()
}

// The wizard starts the tutor model download (which ensures llama.cpp) and the llama.cpp step at
// the same time; two get_llama_cpp.py runs then shared one folder (audit 6 nit 3). A second
// caller joins the install already running.
let llamaCppInstall = null

function downloadLlamaCpp(sender, scriptRoot, requestedBackend) {
  if (!llamaCppInstall) {
    llamaCppInstall = installLlamaCpp(sender, scriptRoot, requestedBackend)
      .finally(() => { llamaCppInstall = null })
  }
  return llamaCppInstall
}

async function installLlamaCpp(sender, scriptRoot, requestedBackend) {
  const base = ensureJPLearnDirs()
  const llamaDir = path.join(base, 'tools', 'llama.cpp', 'build', 'bin', 'Release')
  const detectedBackend = detectLlamaBackend(await detectGpuInfo())
  const llamaBackend = ['cuda', 'hip', 'vulkan', 'cpu'].includes(requestedBackend)
    ? requestedBackend
    : detectedBackend

  if (fs.existsSync(path.join(llamaDir, 'llama-server.exe'))) {
    return { alreadyInstalled: true }
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_llama_cpp.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath], {
      env: {
        ...process.env,
        JPLEARN_ASSETS_DIR: base,
        JPLEARN_DOCUMENTS_DIR: base,
        JPLEARN_LLAMA_BACKEND: llamaBackend,
      },
      windowsHide: true,
    })

    let totalMb = null

    const emitProgress = (percent, doneMb) => {
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'llama',
          percent,
          mb: doneMb,
          totalMb,
          etaSec: null,
        })
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const foundMatch = text.match(/Found:[^(]+\((\d+) MB\)/i)
      if (foundMatch) {
        totalMb = parseInt(foundMatch[1], 10)
      }

      const progressMatch = text.match(/downloading:\s*(\d{1,3})%\s*\((\d+) MB\)/i)
      if (progressMatch) {
        const percent = Math.max(0, Math.min(100, parseInt(progressMatch[1], 10)))
        const doneMb = parseInt(progressMatch[2], 10)
        emitProgress(percent, doneMb)
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        emitProgress(100, totalMb)
        resolve({ ok: true })
      } else {
        reject(new Error(`get_llama_cpp.py exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

function downloadDictionary(sender, scriptRoot) {
  const base = ensureJPLearnDirs()

  if (isOfflineDictionaryInstalled(base)) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_offline_dictionary.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath], {
      env: { ...process.env, JPLEARN_ASSETS_DIR: base, JPLEARN_DOCUMENTS_DIR: base },
      windowsHide: true,
    })

    // 5 dictionary downloads + pitch accent data + 1 SQLite build phase.
    const TOTAL_PHASES = 7
    let currentPhase = 0
    let currentPhasePct = 0

    let lastMethod = null

    const emitProgress = () => {
      const overall = ((currentPhase + currentPhasePct / 100) / TOTAL_PHASES) * 100
      const pct = Math.max(0, Math.min(99, Math.round(overall)))
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'dictionary',
          percent: pct,
          mb: null,
          totalMb: null,
          etaSec: null,
          logMessage: lastMethod ? `downloading: ${pct}% [${lastMethod}]` : undefined,
        })
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const phaseMatch = text.match(/PHASE (\d+)\/(\d+):/)
      if (phaseMatch) {
        currentPhase = Math.max(0, parseInt(phaseMatch[1], 10) - 1)
        currentPhasePct = 0
        emitProgress()
      }
      const pctMatch = text.match(/downloading:\s*(\d{1,3})%\s*(?:\[([^\]]+)\])?\s*\((\d+) MB\)/i)
      if (pctMatch) {
        currentPhasePct = Math.max(0, Math.min(100, parseInt(pctMatch[1], 10)))
        lastMethod = pctMatch[2] ? pctMatch[2].trim() : lastMethod
        emitProgress()
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        if (sender && !sender.isDestroyed()) {
          sender.send('setup:download-progress', { id: 'dictionary', percent: 100, mb: null, totalMb: null, etaSec: null })
        }
        resolve({ ok: true })
      } else {
        reject(new Error(`get_offline_dictionary.py exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

function downloadSpeechModel(tier, sender, scriptRoot, downloadOptions = {}) {
  if (!SPEECH_MODELS[tier]) return Promise.reject(new Error(`Unknown speech model tier: ${tier}`))

  const base = ensureJPLearnDirs()

  if (!downloadOptions.force && isSpeechModelInstalled(base, tier)) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_whisper_model.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  // faster-whisper itself, which the installed app never had (audit 13, F1). From source it comes
  // from the environment, as before.
  const packagesStep = bundledPythonCommand() && !featurePackagesReady(base, 'speech')
    ? installFeaturePackages({ assetsDir: base, feature: 'speech' })
    : Promise.resolve()

  return packagesStep.then(() => new Promise((resolve, reject) => {
    const args = [scriptPath, '--tier', tier, ...(downloadOptions.force ? ['--force'] : [])]
    const child = spawn(pythonCmd, args, {
      env: {
        ...process.env,
        JPLEARN_ASSETS_DIR: base,
        JPLEARN_DOCUMENTS_DIR: base,
        JPLEARN_DOWNLOAD_BACKEND: process.env.JPLEARN_DOWNLOAD_BACKEND || 'auto',
      },
      windowsHide: true,
    })

    // 4 files per tier: model.bin, config.json, tokenizer.json, vocabulary.txt.
    const TOTAL_PHASES = 4
    let currentPhase = 0
    let currentPhasePct = 0

    let lastMethod = null

    const emitProgress = () => {
      const overall = ((currentPhase + currentPhasePct / 100) / TOTAL_PHASES) * 100
      const pct = Math.max(0, Math.min(99, Math.round(overall)))
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'speech',
          percent: pct,
          mb: null,
          totalMb: null,
          etaSec: null,
          logMessage: lastMethod ? `downloading: ${pct}% [${lastMethod}]` : undefined,
        })
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const phaseMatch = text.match(/PHASE (\d+)\/(\d+):/)
      if (phaseMatch) {
        currentPhase = Math.max(0, parseInt(phaseMatch[1], 10) - 1)
        currentPhasePct = 0
        emitProgress()
      }
      const pctMatch = text.match(/downloading:\s*(\d{1,3})%\s*(?:\[([^\]]+)\])?\s*\((\d+) MB\)/i)
      if (pctMatch) {
        currentPhasePct = Math.max(0, Math.min(100, parseInt(pctMatch[1], 10)))
        lastMethod = pctMatch[2] ? pctMatch[2].trim() : lastMethod
        emitProgress()
      }
    })

    child.on('close', async (code) => {
      if (code === 0) {
        if (sender && !sender.isDestroyed()) {
          sender.send('setup:download-progress', { id: 'speech', percent: 100, mb: null, totalMb: null, etaSec: null })
        }

        // Post-download: check GPU CUDA runtime dependencies
        try {
          const checkScript = [
            '-c',
            [
              'import subprocess as s, json, sys, os, site',
              // the installed app's downloaded packages (audit 13); nothing to add from source
              'for d in os.environ.get("JPLEARN_PYTHON_PACKAGES", "").split(os.pathsep):',
              '  if d: site.addsitedir(d)',
              'gpu = s.run(["nvidia-smi"], capture_output=True).returncode == 0',
              'result = {"gpu_detected": gpu, "cuda_ready": False, "cuda_error": None}',
              'if gpu:',
              '  try:',
              '    from ctranslate2 import get_cuda_device_count',
              '    n = get_cuda_device_count()',
              '    result["cuda_ready"] = n > 0',
              '  except Exception as e:',
              '    result["cuda_error"] = str(e)',
              'print(json.dumps(result))',
            ].join('\n'),
          ]

          const speechEnv = envWithFeaturePackages({ ...process.env }, base, ['speech', 'speech-cuda'])
          const { stdout } = await runPythonCapture(pythonCmd, checkScript, speechEnv)
          const status = JSON.parse(stdout.trim())

          if (status.gpu_detected && !status.cuda_ready) {
            // GPU available but CUDA runtime libs missing — try install
            // In the installed app, into JPLearn Assets beside faster-whisper (audit 13, F2).
            const { code: pipCode } = bundledPythonCommand()
              ? await installFeaturePackages({ assetsDir: base, feature: 'speech-cuda' })
                .then(() => ({ code: 0 }), (error) => {
                  console.error('[setup] CUDA runtime packages:', error)
                  return { code: 1 }
                })
              : await runPythonCapture(pythonCmd, [
                '-m', 'pip', 'install', '--quiet', 'nvidia-cublas-cu12',
              ], { ...process.env })

            if (pipCode === 0 && sender && !sender.isDestroyed()) {
              sender.send('setup:download-progress', {
                id: 'speech', percent: 100, mb: null, totalMb: null, etaSec: null,
                logMessage: 'CUDA runtime installed, GPU acceleration ready',
              })
            } else if (sender && !sender.isDestroyed()) {
              sender.send('setup:download-progress', {
                id: 'speech', percent: 100, mb: null, totalMb: null, etaSec: null,
                logMessage: 'GPU found but CUDA runtime missing. Speech will use CPU (install CUDA Toolkit 12 for GPU speed).',
              })
            }
          }
        } catch {
          // non-fatal — GPU check itself failed, speech server handles fallback
        }

        resolve({ ok: true })
      } else {
        reject(new Error(`get_whisper_model.py exited with code ${code}`))
      }
    })

    child.on('error', reject)
  }))
}

async function downloadOcrModel(tier, sender, scriptRoot, options = {}) {
  if (!OCR_MODELS[tier]) return Promise.reject(new Error(`Unknown OCR model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const force = Boolean(options && options.force)

  if (!force && isOcrModelInstalled(base, tier)) {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'ocr', percent: 100, mb: null, totalMb: null, etaSec: null })
    }
    return Promise.resolve({ alreadyInstalled: true })
  }

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'ocr', percent: 4, mb: null, totalMb: null, etaSec: null })
  }

  await ensureOcrPythonRuntime(scriptRoot, base)

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'ocr', percent: 12, mb: null, totalMb: null, etaSec: null })
  }

  if (!force && isOcrModelInstalled(base, tier)) {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'ocr', percent: 100, mb: null, totalMb: null, etaSec: null })
    }
    return Promise.resolve({ alreadyInstalled: true })
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_paddleocr_model.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)
  const modelDir = getOcrModelDir(base, tier)

  if (force && fs.existsSync(modelDir)) {
    fs.rmSync(modelDir, { recursive: true, force: true })
  }
  fs.mkdirSync(modelDir, { recursive: true })

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath, '--tier', tier, '--dest', modelDir], {
      // It imports paddleocr, which the installed app keeps in JPLearn Assets (audit 13, F2).
      env: envWithFeaturePackages({
        ...process.env,
        JPLEARN_ASSETS_DIR: base,
        JPLEARN_DOCUMENTS_DIR: base,
        PADDLE_PDX_MODEL_SOURCE: process.env.PADDLE_PDX_MODEL_SOURCE || 'BOS',
      }, base, ['ocr']),
      windowsHide: true,
    })

    const TOTAL_PHASES = 3
    let currentPhase = 0
    let currentPhasePct = 0
    let stderrBuffer = ''

    const emitProgress = () => {
      const overall = ((currentPhase + currentPhasePct / 100) / TOTAL_PHASES) * 100
      const pct = Math.max(0, Math.min(99, Math.round(overall)))
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', { id: 'ocr', percent: pct, mb: null, totalMb: null, etaSec: null })
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const phaseMatch = text.match(/PHASE (\d+)\/(\d+):/)
      if (phaseMatch) {
        currentPhase = Math.max(0, parseInt(phaseMatch[1], 10) - 1)
        currentPhasePct = 0
        emitProgress()
      }
      const pctMatch = text.match(/downloading:\s*(\d{1,3})%\s*\((\d+) MB\)/i)
      if (pctMatch) {
        currentPhasePct = Math.max(0, Math.min(100, parseInt(pctMatch[1], 10)))
        emitProgress()
      }
    })

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        try {
          fs.writeFileSync(getOcrReadyMarkerPath(base, tier), new Date().toISOString(), 'utf8')
        } catch {
          reject(new Error('OCR model finished but ready marker could not be written'))
          return
        }
        try {
          if (!resolveActiveOcrTier(base)) {
            setActiveOcrModelTier(tier)
          }
        } catch {
          // Best effort; download still succeeded.
        }
        if (sender && !sender.isDestroyed()) {
          sender.send('setup:download-progress', { id: 'ocr', percent: 100, mb: null, totalMb: null, etaSec: null })
        }
        resolve({ ok: true })
      } else {
        const detail = stderrBuffer.trim()
        reject(new Error(
          `get_paddleocr_model.py exited with code ${code}${detail ? `: ${detail}` : ''}`,
        ))
      }
    })

    child.on('error', reject)
  })
}

async function downloadTranslationModel(tier, sender, scriptRoot, options = {}) {
  if (!TRANSLATION_MODELS[tier]) return Promise.reject(new Error(`Unknown translation model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const force = Boolean(options && options.force)

  if (!force && isTranslationModelInstalled(base, tier)) {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'translation', percent: 100, mb: null, totalMb: null, etaSec: null })
    }
    return Promise.resolve({ alreadyInstalled: true })
  }

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'translation', percent: 4, mb: null, totalMb: null, etaSec: null })
  }

  const translationModel = TRANSLATION_MODELS[tier]
  const modelsDir = path.join(base, 'models', 'llama')
  fs.mkdirSync(modelsDir, { recursive: true })
  const destPath = path.join(modelsDir, translationModel.filename)

  // A forced reinstall downloads over the working model: downloadWithProgress writes `.tmp` and
  // replaces the file only once complete, so a failed Reapply leaves the old model working
  // (audit 6 F3).
  if (force || !fs.existsSync(destPath)) {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'translation', percent: 20, mb: null, totalMb: null, etaSec: null })
    }
    const url = `https://huggingface.co/${translationModel.repo}/resolve/main/${translationModel.filename}`
    await downloadWithProgress(url, destPath, (done, total, method = null) => {
      const percent = total > 0 ? Math.round((done / total) * 100) : 0
      const mb = Math.round(done / (1024 * 1024))
      const totalMb = total > 0 ? Math.round(total / (1024 * 1024)) : null
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'translation',
          percent,
          mb,
          totalMb,
          etaSec: null,
          logMessage: method ? `downloading: ${percent}% [${method}]` : undefined,
        })
      }
    })
  }

  const translationDir = getTranslationModelDir(base, tier)
  fs.mkdirSync(translationDir, { recursive: true })

  fs.writeFileSync(getTranslationReadyMarkerPath(base, tier), new Date().toISOString(), 'utf8')
  if (!resolveActiveTranslationTier(base)) {
    setActiveTranslationModelTier(tier)
  }

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'translation', percent: 100, mb: null, totalMb: null, etaSec: null })
  }
  return { ok: true }
}

async function applyTranslationProfile(profile, sender, scriptRoot, options = {}) {
  if (!TRANSLATION_PROFILES[profile]) return Promise.reject(new Error(`Unknown translation profile: ${profile}`))

  const base = ensureJPLearnDirs()
  const force = Boolean(options && options.force)

  if (!force && isTranslationProfileInstalled(base, profile)) {
    if (profile === 'ocr_qwen_local') {
      setActiveTranslationModelTier('qwen_ja_en')
    }
    return { ok: true, alreadyInstalled: true, profile }
  }

  await downloadOcrModel('standard', sender, scriptRoot, { force })

  await downloadTranslationModel('qwen_ja_en', sender, scriptRoot, { force })
  setActiveTranslationModelTier('qwen_ja_en')
  // last, so a runner failure leaves OCR and the model installed and says what is missing
  let llamaCppDownloaded = false
  if (!isLlamaCppInstalled(base)) {
    try {
      const runner = await downloadLlamaCpp(sender, scriptRoot)
      llamaCppDownloaded = !runner?.alreadyInstalled
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`OCR and the translation model are installed, but the model runner (llama.cpp) is not: ${detail}`)
    }
  }
  return { ok: true, profile, llamaCppDownloaded }
}

// ── Factory ───────────────────────────────────────────────────────────────────
function downloadFonts(sender, scriptRoot) {
  const base = ensureJPLearnDirs()
  const scriptPath = path.join(scriptRoot, 'scripts', 'get_fonts.py')
  const fontInstallState = getFontInstallState(base)

  if (fontInstallState.isCurrent) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve, reject) => {
    const args = fontInstallState.installed ? [scriptPath] : [scriptPath, '--force']
    const child = spawn(pythonCmd, args, {
      env: { ...process.env, JPLEARN_ASSETS_DIR: base, JPLEARN_DOCUMENTS_DIR: base },
      windowsHide: true,
    })

    const TOTAL_WEIGHTS = EXPECTED_FONT_WEIGHT_COUNT
    let completedWeights = 0
    let currentWeightPct = 0

    const emitFontProgress = () => {
      const overall = ((completedWeights + currentWeightPct / 100) / TOTAL_WEIGHTS) * 100
      const pct = Math.max(0, Math.min(99, Math.round(overall)))
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'fonts',
          percent: pct,
          mb: null,
          totalMb: 100,
          etaSec: null,
        })
      }
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const currentMatch = text.match(/(\d{1,3})%\s*\(\d+\/\d+\s+files\)/)
      if (currentMatch) {
        currentWeightPct = Math.max(0, Math.min(100, parseInt(currentMatch[1], 10)))
        emitFontProgress()
      }

      const completedMatches = text.match(/woff2 files\s*[\u2013\u2014-]/g)
      if (completedMatches && completedMatches.length > 0) {
        completedWeights += completedMatches.length
        currentWeightPct = 0
        emitFontProgress()
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        if (sender && !sender.isDestroyed()) {
          sender.send('setup:download-progress', { id: 'fonts', percent: 100, mb: null, totalMb: 100, etaSec: null })
        }
        resolve({ ok: true })
      } else {
        reject(new Error(`get_fonts.py exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

function createShortcuts({ desktop, startMenu }) {
  let electronApp, shell
  try {
    const electron = require('electron')
    electronApp = electron.app
    shell = electron.shell
  } catch {
    return { ok: false, reason: 'electron not available' }
  }

  if (!electronApp.isPackaged) {
    return { ok: true, skipped: true }
  }

  const execPath = process.execPath
  const shortcutConfig = {
    target: execPath,
    description: 'JPLearn: Japanese Learning App',
    icon: execPath,
    iconIndex: 0,
  }
  const results = {}

  if (desktop) {
    const dest = path.join(os.homedir(), 'Desktop', 'JPLearn.lnk')
    try { results.desktop = shell.writeShortcutLink(dest, 'create', shortcutConfig) } catch { results.desktop = false }
  }
  if (startMenu) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const dest = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'JPLearn.lnk')
    try { results.startMenu = shell.writeShortcutLink(dest, 'create', shortcutConfig) } catch { results.startMenu = false }
  }

  return { ok: true, ...results }
}
function createSetupRuntime() {
  return {
    getSystemInfo,
    isFirstRun,
    writeSentinel,
    ensureJPLearnDirs,
    seedBundledVoiceProfiles,
    downloadVoiceEngine,
    downloadModel,
    downloadLlamaCpp,
    downloadFonts,
    downloadDictionary,
    downloadSpeechModel,
    downloadOcrModel,
    downloadTranslationModel,
    applyTranslationProfile,
    createShortcuts,
    setActiveVoiceModel,
    setActiveModelTier,
    uninstallModel,
    uninstallVoiceModel,
    setActiveSpeechModelTier,
    uninstallSpeechModel,
    setActiveOcrModelTier,
    uninstallOcrModel,
    setActiveTranslationModelTier,
    uninstallTranslationModel,
  }
}

module.exports = {
  createSetupRuntime,
  isOfflineDictionaryInstalled,
  // Exported for tests. This is the primitive that keeps the setup screen's
  // network probes off the path that reports what is installed.
  createDeferredValue,
  // Exported for tests: what "installed" means, and what an uninstall clears (audit 6).
  isSpeechModelInstalled,
  isOcrModelInstalled,
  isTranslationModelInstalled,
  removeTutorDownloadLeftovers,
}



