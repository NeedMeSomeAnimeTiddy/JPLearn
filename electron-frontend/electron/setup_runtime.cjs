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
const { spawn, spawnSync } = require('node:child_process')
const NetworkSpeed = require('network-speed')

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
  },
  balanced: {
    label: 'Balanced (medium, ~1.5 GB)',
    description: 'Good all-around pick: better accuracy than Fast while still responsive.',
    sizeMb: 1500,
  },
  high: {
    label: 'High (distil-large-v3, ~1.9 GB)',
    description: 'Near-Ultra quality with lower latency than Ultra. Great for higher-end PCs.',
    sizeMb: 1900,
  },
  ultra: {
    label: 'Ultra (large-v3, ~3.1 GB)',
    description: 'Highest recognition quality. Best when you prioritize accuracy over speed.',
    sizeMb: 3100,
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
  argos: {
    label: 'Argos Translate',
    badge: 'Default Translation',
    description: 'Offline JA→EN translation using Argos. Smallest footprint and most compatible default.',
    sizeMb: 160,
  },
  opusmt: {
    label: 'ONNX Community OPUS-MT (ONNX)',
    badge: 'Better Translation',
    description: 'ONNX-community OPUS-MT JA→EN backend with maintained ONNX variants.',
    sizeMb: 430,
  },
}
const PIPELINE_MODELS = {
  opusmt_ja_en_onnx: {
    label: 'OPUS-MT JA→EN (ONNX)',
    badge: 'Pipeline Step 1',
    description: 'Primary translator: onnx-community/opus-mt-ja-en (quantized ONNX).',
    sizeMb: 430,
  },
  llmjp_150m_onnx: {
    label: 'LLM-JP 3 150M Instruct3 (ONNX)',
    badge: 'Pipeline Step 2',
    description: 'Post-edit/refinement model: onnx-community/llm-jp-3-150m-instruct3-ONNX.',
    sizeMb: 165,
  },
  jp_reranker_xsmall_onnx: {
    label: 'Japanese Reranker XSmall (ONNX)',
    badge: 'Pipeline Step 3',
    description: 'hotchpotch/japanese-reranker-xsmall-v2 ONNX reranker for best-match selection.',
    sizeMb: 95,
  },
}
const TRANSLATION_PROFILES = {
  ocr_argos_small: {
    label: 'OCR + Argos (Small)',
    badge: 'Smaller',
    description: 'Installs OCR Standard + Argos translation. Smallest footprint.',
    sizeMb: 380,
  },
  ocr_pipeline_full: {
    label: 'OCR + Translation Pipeline (Bigger)',
    badge: 'Higher Quality',
    description: 'Installs OCR Standard + OPUS-MT + LLM-JP 150M + Japanese reranker.',
    sizeMb: 890,
  },
}
const PADDLEOCR_VERSION = '3.7.0'
const PADDLEPADDLE_VERSION = '3.2.0'
const ACTIVE_OCR_MODEL_STATE_FILENAME = 'active-ocr-model.json'
const ACTIVE_TRANSLATION_MODEL_STATE_FILENAME = 'active-translation-model.json'
const PIPELINE_READY_MARKER_FILENAME = 'model.ready'
const SPEED_TEST_TIMEOUT_MS = 12000
const SPEED_TEST_TARGETS = [
  { url: 'https://proof.ovh.net/files/10Mb.dat', bytes: 10485760 },
  { url: 'https://proof.ovh.net/files/100Mb.dat', bytes: 20971520 },
]
const networkSpeed = new NetworkSpeed()
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

function isOfflineDictionaryInstalled(base) {
  return fs.existsSync(getOfflineDictionarySqlitePath(base))
}

// ── Embedder install state (hidden — installed alongside chatbot tiers) ─────

function getEmbedderDir(base, embedderTier) {
  return path.join(base, 'models', 'embedders', embedderTier)
}

function isEmbedderInstalled(base, embedderTier) {
  return fs.existsSync(path.join(getEmbedderDir(base, embedderTier), '.embedder-ready'))
}

function isEmbedderTierStillNeeded(base, embedderTier, excludeChatbotTier) {
  const modelsDir = path.join(base, 'models')
  return Object.entries(MODELS).some(([chatbotTier, model]) => {
    if (chatbotTier === excludeChatbotTier) return false
    if (CHATBOT_TIER_TO_EMBEDDER_TIER[chatbotTier] !== embedderTier) return false
    return fs.existsSync(path.join(modelsDir, model.filename))
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

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_embedder_model.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve) => {
    const child = spawn(pythonCmd, [scriptPath, '--tier', embedderTier], {
      env: { ...process.env, JPLEARN_ASSETS_DIR: base, JPLEARN_DOCUMENTS_DIR: base },
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
      const pctMatch = text.match(/downloading:\s*(\d{1,3})%\s*\((\d+) MB\)/i)
      if (pctMatch) {
        currentPct = Math.max(0, Math.min(99, parseInt(pctMatch[1], 10)))
        emitProgress()
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        currentPct = 100
        emitProgress()
        resolve({ ok: true })
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

function getSpeechModelDir(base, tier) {
  return path.join(base, 'whisper', tier)
}

function isSpeechModelInstalled(base, tier) {
  return fs.existsSync(path.join(getSpeechModelDir(base, tier), 'model.bin'))
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
  return { ok: true, tier }
}

function getOcrModelDir(base, tier) {
  return path.join(base, 'ocr', tier)
}

function getOcrReadyMarkerPath(base, tier) {
  return path.join(getOcrModelDir(base, tier), 'model.ready')
}

function isOcrModelInstalled(base, tier) {
  return fs.existsSync(getOcrReadyMarkerPath(base, tier))
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
  const selection = readActiveOcrModelSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveOcrModelStatePath(base)) } catch { /* ignore */ }
  }
  return { ok: true, tier }
}

function getTranslationModelDir(base, tier) {
  return path.join(base, 'translation', tier)
}

function getTranslationReadyMarkerPath(base, tier) {
  return path.join(getTranslationModelDir(base, tier), 'model.ready')
}

function isTranslationModelInstalled(base, tier) {
  return fs.existsSync(getTranslationReadyMarkerPath(base, tier))
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
    JSON.stringify({ tier, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallTranslationModel(tier) {
  if (!TRANSLATION_MODELS[tier]) throw new Error(`Unknown translation model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const dir = getTranslationModelDir(base, tier)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const selection = readActiveTranslationModelSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveTranslationModelStatePath(base)) } catch { /* ignore */ }
  }
  return { ok: true, tier }
}

function getPipelineModelDir(base, tier) {
  return path.join(base, 'translation-pipeline', tier)
}

function getPipelineReadyMarkerPath(base, tier) {
  return path.join(getPipelineModelDir(base, tier), PIPELINE_READY_MARKER_FILENAME)
}

function isPipelineModelInstalled(base, tier) {
  return fs.existsSync(getPipelineReadyMarkerPath(base, tier))
}

function uninstallPipelineModel(tier) {
  if (!PIPELINE_MODELS[tier]) throw new Error(`Unknown pipeline model tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const dir = getPipelineModelDir(base, tier)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return { ok: true, tier }
}

function isTranslationProfileInstalled(base, profile) {
  if (profile === 'ocr_argos_small') {
    return isOcrModelInstalled(base, 'standard') && isTranslationModelInstalled(base, 'argos')
  }
  if (profile === 'ocr_pipeline_full') {
    return (
      isOcrModelInstalled(base, 'standard')
      && isTranslationModelInstalled(base, 'opusmt')
      && isPipelineModelInstalled(base, 'opusmt_ja_en_onnx')
      && isPipelineModelInstalled(base, 'llmjp_150m_onnx')
      && isPipelineModelInstalled(base, 'jp_reranker_xsmall_onnx')
    )
  }
  return false
}

function resolveActiveTranslationProfile(base) {
  const activeTier = resolveActiveTranslationTier(base)
  if (activeTier === 'argos' && isTranslationProfileInstalled(base, 'ocr_argos_small')) {
    return 'ocr_argos_small'
  }
  if (activeTier === 'opusmt' && isTranslationProfileInstalled(base, 'ocr_pipeline_full')) {
    return 'ocr_pipeline_full'
  }
  return null
}

function resolvePythonCommand(scriptRoot) {
  const resourcesPath = (process.resourcesPath || '').trim()
  if (resourcesPath) {
    const bundled = path.join(resourcesPath, 'python-bundle', 'python', 'python.exe')
    if (fs.existsSync(bundled)) return bundled
  }
  const venvWin = path.join(scriptRoot, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvWin)) return venvWin
  return 'python'
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
    await ensurePythonImport('argostranslate', [['argostranslate']])
    await ensurePythonImport('fasttext', [['fasttext-wheel'], ['fasttext']])
    return
  }
}

async function ensureTranslationPythonRuntime(scriptRoot, base) {
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

  await ensurePythonImport('argostranslate', [['argostranslate']])
  await ensurePythonImport('transformers', [['transformers>=4.44.0']])
  await ensurePythonImport('sentencepiece', [['sentencepiece>=0.2.0']])
  await ensurePythonImport('optimum', [['optimum[onnxruntime]>=1.22.0']])
  await ensurePythonImport('onnxruntime', [['onnxruntime>=1.18.0']])
  await ensurePythonImport('sacremoses', [['sacremoses>=0.1.1']])
  await ensurePythonImport('fasttext', [['fasttext-wheel'], ['fasttext']])
}

// ── System info ──────────────────────────────────────────────────────────────

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function coerceMbps(result) {
  if (!result || typeof result !== 'object') {
    return null
  }
  const candidates = [result.mbs, result.mbps, result.mb]
  for (const value of candidates) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric
    }
  }
  return null
}

async function measureNetworkMbps() {
  for (const target of SPEED_TEST_TARGETS) {
    try {
      const result = await withTimeout(
        networkSpeed.checkDownloadSpeed(target.url, target.bytes),
        SPEED_TEST_TIMEOUT_MS,
      )
      const mbps = coerceMbps(result)
      if (mbps && Number.isFinite(mbps)) {
        return mbps
      }
    } catch {
      // Try next endpoint.
    }
  }
  return null
}

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

function detectGpuNames() {
  if (process.platform !== 'win32') {
    return []
  }
  try {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 },
    )
    if (result.status !== 0 || !result.stdout) {
      return []
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function detectGpuVramGb() {
  if (process.platform !== 'win32') {
    return null
  }
  try {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).AdapterRAM'],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 },
    )
    if (result.status !== 0 || !result.stdout) {
      return null
    }
    const values = result.stdout
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (values.length <= 0) {
      return null
    }
    const maxBytes = Math.max(...values)
    return Math.round((maxBytes / (1024 ** 3)) * 10) / 10
  } catch {
    return null
  }
}

function hasNvidiaDriver() {
  if (process.platform !== 'win32') {
    return false
  }
  try {
    const result = spawnSync('nvidia-smi', ['-L'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

function detectLlamaBackend(gpuNames) {
  const forced = String(process.env.JPLEARN_LLAMA_BACKEND || '').trim().toLowerCase()
  if (forced === 'cuda' || forced === 'hip' || forced === 'vulkan' || forced === 'cpu') {
    return forced
  }

  const names = gpuNames.join(' ').toLowerCase()
  if (names.includes('nvidia') && hasNvidiaDriver()) {
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

async function getSystemInfo() {
  const base = ensureJPLearnDirs()
  const totalRamGb = os.totalmem() / (1024 ** 3)
  const modelsDir = path.join(base, 'models')
  const llamaCppDir = path.join(base, 'tools', 'llama.cpp', 'build', 'bin', 'Release')
  const llamaCppInstalled = fs.existsSync(path.join(llamaCppDir, 'llama-server.exe'))
  const gpuAdapters = detectGpuNames()
  const gpuVramGb = detectGpuVramGb()
  const recommendedTier = recommendTutorTier(totalRamGb, gpuVramGb || 0)
  const llamaCppBackend = detectLlamaBackend(gpuAdapters)
  const networkMbpsRaw = await measureNetworkMbps()
  const networkMbps = typeof networkMbpsRaw === 'number' && Number.isFinite(networkMbpsRaw)
    ? Math.round(networkMbpsRaw * 10) / 10
    : null

  const fontInstallState = getFontInstallState(base)
  const fontsInstalled = fontInstallState.installed
  const dictionaryInstalled = isOfflineDictionaryInstalled(base)
  const speechModels = Object.entries(SPEECH_MODELS).map(([tier, m]) => ({
    tier,
    label: m.label,
    description: m.description,
    sizeMb: m.sizeMb,
    installed: isSpeechModelInstalled(base, tier),
    estimatedDownloadMinutes: estimateDownloadMinutes(m.sizeMb, networkMbps),
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
  const pipelineModels = Object.entries(PIPELINE_MODELS).map(([tier, m]) => ({
    tier,
    label: m.label,
    badge: m.badge,
    description: m.description,
    sizeMb: m.sizeMb,
    installed: isPipelineModelInstalled(base, tier),
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

  const models = Object.entries(MODELS).map(([tier, m]) => {
    const embedderTier = CHATBOT_TIER_TO_EMBEDDER_TIER[tier]
    const embedder = embedderTier ? EMBEDDERS[embedderTier] : null
    const embedderSizeMb = embedder ? embedder.sizeMb : 0
    const combinedSizeMb = m.sizeMb + embedderSizeMb
    return {
      tier,
      filename: m.filename,
      sizeMb: m.sizeMb,
      embedderSizeMb,
      combinedSizeMb,
      label: m.label,
      description: m.description,
      installed: fs.existsSync(path.join(modelsDir, m.filename)),
      estimatedDownloadMinutes: estimateDownloadMinutes(combinedSizeMb, networkMbps),
    }
  })

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
  const activeModelTier = resolveActiveTier(base, modelsDir)
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
    recommendedTranslationTier: 'argos',
    activeTranslationModelTier: resolveActiveTranslationTier(base),
    translationInstalled: translationModels.some((model) => model.installed),
    pipelineModels,
    pipelineInstalled: pipelineModels.some((model) => model.installed),
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

function resolveActiveTier(base, modelsDir) {
  const selection = readActiveModelSelection(base)
  if (selection && MODELS[selection.tier] && fs.existsSync(path.join(modelsDir, selection.filename))) {
    return selection.tier
  }
  for (const [tier, model] of Object.entries(MODELS)) {
    if (fs.existsSync(path.join(modelsDir, model.filename))) {
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
  const modelsDir = path.join(base, 'models')
  if (!fs.existsSync(path.join(modelsDir, model.filename))) {
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
  const modelsDir = path.join(base, 'models')
  const modelPath = path.join(modelsDir, model.filename)
  if (fs.existsSync(modelPath)) {
    fs.unlinkSync(modelPath)
  }
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

/**
 * Follow all HTTP redirects for url, sending Range: bytes=0-0 on the final hop
 * to detect range-request support and the total file size in one round trip.
 */
function probeUrl(url) {
  return new Promise((resolve, reject) => {
    function follow(redirectUrl, hops) {
      if (hops > 8) { reject(new Error('Too many redirects')); return }
      const mod = redirectUrl.startsWith('https') ? https : http
      const req = mod.get(redirectUrl, {
        headers: { 'User-Agent': 'JPLearn/1.0', 'Range': 'bytes=0-0' },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          follow(res.headers.location, hops + 1)
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
      req.on('error', reject)
    }
    follow(url, 0)
  })
}

function tryGetFileSize(filePath) {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
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
        singleConnectionDownload(finalUrl, tmpPath, total, onProgress)
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
          if (pct !== lastReportedPct) { lastReportedPct = pct; onProgress(done, total) }
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
        if (pct !== lastReportedPct) { lastReportedPct = pct; onProgress(done, total) }
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
          singleConnectionDownload(url, tmpPath, total, onProgress)
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
  const modelsDir = path.join(base, 'models')
  const destPath = path.join(base, 'models', model.filename)
  const embedderTier = CHATBOT_TIER_TO_EMBEDDER_TIER[tier]
  const hadActiveTier = resolveActiveTier(base, modelsDir)

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

  if (fs.existsSync(destPath)) {
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

  const onProgress = (done, total) => {
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
      sender.send('setup:download-progress', { id: 'model', percent, mb, totalMb, etaSec: lastEtaSec })
    }
  }

  return ensureLlamaCpp().then((llamaCppDownloaded) => downloadWithProgress(url, destPath, onProgress).then(async () => {
    await ensureEmbedder()
    const selectedAsActive = ensureActiveSelection()
    return { ok: true, llamaCppDownloaded, selectedAsActive }
  }))
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

function downloadLlamaCpp(sender, scriptRoot, requestedBackend) {
  const base = ensureJPLearnDirs()
  const llamaDir = path.join(base, 'tools', 'llama.cpp', 'build', 'bin', 'Release')
  const detectedBackend = detectLlamaBackend(detectGpuNames())
  const llamaBackend = ['cuda', 'hip', 'vulkan', 'cpu'].includes(requestedBackend)
    ? requestedBackend
    : detectedBackend

  if (fs.existsSync(path.join(llamaDir, 'llama-server.exe'))) {
    return Promise.resolve({ alreadyInstalled: true })
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

    // 5 dictionary downloads + 1 SQLite build phase.
    const TOTAL_PHASES = 6
    let currentPhase = 0
    let currentPhasePct = 0

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
      const pctMatch = text.match(/downloading:\s*(\d{1,3})%\s*\((\d+) MB\)/i)
      if (pctMatch) {
        currentPhasePct = Math.max(0, Math.min(100, parseInt(pctMatch[1], 10)))
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

function downloadSpeechModel(tier, sender, scriptRoot) {
  if (!SPEECH_MODELS[tier]) return Promise.reject(new Error(`Unknown speech model tier: ${tier}`))

  const base = ensureJPLearnDirs()

  if (isSpeechModelInstalled(base, tier)) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_whisper_model.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath, '--tier', tier], {
      env: { ...process.env, JPLEARN_ASSETS_DIR: base, JPLEARN_DOCUMENTS_DIR: base },
      windowsHide: true,
    })

    // 4 files per tier: model.bin, config.json, tokenizer.json, vocabulary.txt.
    const TOTAL_PHASES = 4
    let currentPhase = 0
    let currentPhasePct = 0

    const emitProgress = () => {
      const overall = ((currentPhase + currentPhasePct / 100) / TOTAL_PHASES) * 100
      const pct = Math.max(0, Math.min(99, Math.round(overall)))
      if (sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', { id: 'speech', percent: pct, mb: null, totalMb: null, etaSec: null })
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

    child.on('close', (code) => {
      if (code === 0) {
        if (sender && !sender.isDestroyed()) {
          sender.send('setup:download-progress', { id: 'speech', percent: 100, mb: null, totalMb: null, etaSec: null })
        }
        resolve({ ok: true })
      } else {
        reject(new Error(`get_whisper_model.py exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
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
      env: {
        ...process.env,
        JPLEARN_ASSETS_DIR: base,
        JPLEARN_DOCUMENTS_DIR: base,
        PADDLE_PDX_MODEL_SOURCE: process.env.PADDLE_PDX_MODEL_SOURCE || 'BOS',
      },
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

  await ensureTranslationPythonRuntime(scriptRoot, base)

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'translation', percent: 25, mb: null, totalMb: null, etaSec: null })
  }

  const translationDir = getTranslationModelDir(base, tier)
  if (force && fs.existsSync(translationDir)) {
    fs.rmSync(translationDir, { recursive: true, force: true })
  }
  fs.mkdirSync(translationDir, { recursive: true })

  const pythonCmd = resolvePythonCommand(scriptRoot)
  const code = [
    'import sys',
    'from pathlib import Path',
    'tier = sys.argv[1]',
    'dest = Path(sys.argv[2])',
    'dest.mkdir(parents=True, exist_ok=True)',
    'if tier == "opusmt":',
    '  from transformers import AutoTokenizer',
    '  from optimum.onnxruntime import ORTModelForSeq2SeqLM',
    '  model_id = "onnx-community/opus-mt-ja-en"',
    '  AutoTokenizer.from_pretrained(model_id, cache_dir=str(dest))',
    '  ORTModelForSeq2SeqLM.from_pretrained(model_id, cache_dir=str(dest), subfolder="onnx", encoder_file_name="encoder_model_int8.onnx", decoder_file_name="decoder_model_merged_int8.onnx", decoder_with_past_file_name="decoder_with_past_model_int8.onnx")',
    'elif tier == "argos":',
    '  import argostranslate.package, argostranslate.translate',
    '  argostranslate.package.update_package_index()',
    '  packages = argostranslate.package.get_available_packages()',
    '  selected = None',
    '  for p in packages:',
    '    if getattr(p, "from_code", "") == "ja" and getattr(p, "to_code", "") == "en":',
    '      selected = p',
    '      break',
    '  if selected is None:',
    '    raise RuntimeError("No Argos ja->en package found")',
    '  downloaded = selected.download()',
    '  argostranslate.package.install_from_path(downloaded)',
    'else:',
    '  raise RuntimeError(f"Unknown translation tier: {tier}")',
  ].join('\n')

  await runPythonCapture(
    pythonCmd,
    ['-c', code, tier, translationDir],
    {
      ...process.env,
      JPLEARN_ASSETS_DIR: base,
      JPLEARN_DOCUMENTS_DIR: base,
      JPLEARN_TRANSLATION_CACHE_DIR: translationDir,
      TRANSFORMERS_CACHE: translationDir,
      HF_HOME: translationDir,
      HUGGINGFACE_HUB_CACHE: translationDir,
    },
  ).then((result) => {
    if (result.code !== 0) {
      throw new Error(`Failed to download translation model ${tier}: ${(result.stderr || result.stdout || '').trim() || 'unknown error'}`)
    }
  })

  fs.writeFileSync(getTranslationReadyMarkerPath(base, tier), new Date().toISOString(), 'utf8')
  if (!resolveActiveTranslationTier(base)) {
    setActiveTranslationModelTier(tier)
  }

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'translation', percent: 100, mb: null, totalMb: null, etaSec: null })
  }
  return { ok: true }
}

async function downloadPipelineModel(tier, sender, scriptRoot, options = {}) {
  if (!PIPELINE_MODELS[tier]) return Promise.reject(new Error(`Unknown pipeline model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const force = Boolean(options && options.force)

  if (!force && isPipelineModelInstalled(base, tier)) {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'pipeline', percent: 100, mb: null, totalMb: null, etaSec: null })
    }
    return Promise.resolve({ alreadyInstalled: true })
  }

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'pipeline', percent: 5, mb: null, totalMb: null, etaSec: null })
  }

  await ensureTranslationPythonRuntime(scriptRoot, base)

  const modelDir = getPipelineModelDir(base, tier)
  if (force && fs.existsSync(modelDir)) {
    fs.rmSync(modelDir, { recursive: true, force: true })
  }
  fs.mkdirSync(modelDir, { recursive: true })

  const pythonCmd = resolvePythonCommand(scriptRoot)
  const code = [
    'import sys',
    'from pathlib import Path',
    'tier = sys.argv[1]',
    'dest = Path(sys.argv[2])',
    'dest.mkdir(parents=True, exist_ok=True)',
    'if tier == "opusmt_ja_en_onnx":',
    '  from transformers import AutoTokenizer',
    '  from optimum.onnxruntime import ORTModelForSeq2SeqLM',
    '  model_id = "onnx-community/opus-mt-ja-en"',
    '  AutoTokenizer.from_pretrained(model_id, cache_dir=str(dest))',
    '  ORTModelForSeq2SeqLM.from_pretrained(model_id, cache_dir=str(dest), subfolder="onnx", encoder_file_name="encoder_model_int8.onnx", decoder_file_name="decoder_model_merged_int8.onnx", decoder_with_past_file_name="decoder_with_past_model_int8.onnx")',
    'elif tier == "llmjp_150m_onnx":',
    '  from transformers import AutoTokenizer',
    '  from optimum.onnxruntime import ORTModelForCausalLM',
    '  model_id = "onnx-community/llm-jp-3-150m-instruct3-ONNX"',
    '  AutoTokenizer.from_pretrained(model_id, cache_dir=str(dest))',
    '  ORTModelForCausalLM.from_pretrained(model_id, cache_dir=str(dest), subfolder="onnx", file_name="model_int8.onnx")',
    'elif tier == "jp_reranker_xsmall_onnx":',
    '  from transformers import AutoTokenizer',
    '  from optimum.onnxruntime import ORTModelForSequenceClassification',
    '  model_id = "hotchpotch/japanese-reranker-xsmall-v2"',
    '  AutoTokenizer.from_pretrained(model_id, cache_dir=str(dest))',
    '  loaded = False',
    '  for file_name in ("model_quantized.onnx", "model_int8.onnx", "model.onnx"):',
    '    try:',
    '      ORTModelForSequenceClassification.from_pretrained(model_id, cache_dir=str(dest), subfolder="onnx", file_name=file_name)',
    '      loaded = True',
    '      break',
    '    except Exception:',
    '      pass',
    '  if not loaded:',
    '    raise RuntimeError("Unable to load ONNX reranker weights for japanese-reranker-xsmall-v2")',
    'else:',
    '  raise RuntimeError(f"Unknown pipeline tier: {tier}")',
  ].join('\n')

  await runPythonCapture(
    pythonCmd,
    ['-c', code, tier, modelDir],
    {
      ...process.env,
      JPLEARN_ASSETS_DIR: base,
      JPLEARN_DOCUMENTS_DIR: base,
      TRANSFORMERS_CACHE: modelDir,
      HF_HOME: modelDir,
      HUGGINGFACE_HUB_CACHE: modelDir,
    },
  ).then((result) => {
    if (result.code !== 0) {
      throw new Error(`Failed to download pipeline model ${tier}: ${(result.stderr || result.stdout || '').trim() || 'unknown error'}`)
    }
  })

  fs.writeFileSync(getPipelineReadyMarkerPath(base, tier), new Date().toISOString(), 'utf8')

  if (sender && !sender.isDestroyed()) {
    sender.send('setup:download-progress', { id: 'pipeline', percent: 100, mb: null, totalMb: null, etaSec: null })
  }
  return { ok: true }
}

async function applyTranslationProfile(profile, sender, scriptRoot, options = {}) {
  if (!TRANSLATION_PROFILES[profile]) return Promise.reject(new Error(`Unknown translation profile: ${profile}`))

  const base = ensureJPLearnDirs()
  const force = Boolean(options && options.force)

  if (!force && isTranslationProfileInstalled(base, profile)) {
    if (profile === 'ocr_argos_small') {
      setActiveTranslationModelTier('argos')
    } else if (profile === 'ocr_pipeline_full') {
      setActiveTranslationModelTier('opusmt')
    }
    return { ok: true, alreadyInstalled: true, profile }
  }

  await downloadOcrModel('standard', sender, scriptRoot, { force })

  if (profile === 'ocr_argos_small') {
    await downloadTranslationModel('argos', sender, scriptRoot, { force })
    setActiveTranslationModelTier('argos')
    return { ok: true, profile }
  }

  await downloadTranslationModel('opusmt', sender, scriptRoot, { force })
  await downloadPipelineModel('opusmt_ja_en_onnx', sender, scriptRoot, { force })
  await downloadPipelineModel('llmjp_150m_onnx', sender, scriptRoot, { force })
  await downloadPipelineModel('jp_reranker_xsmall_onnx', sender, scriptRoot, { force })
  setActiveTranslationModelTier('opusmt')
  return { ok: true, profile }
}

// ── Factory ───────────────────────────────────────────────────────────────────
function downloadFonts(sender, scriptRoot) {
  const base = ensureJPLearnDirs()
  const scriptPath = path.join(scriptRoot, 'scripts', 'get_fonts.py')
  const fontInstallState = getFontInstallState(base)

  if (fontInstallState.isCurrent) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const pythonCmd = (() => {
    const resourcesPath = (process.resourcesPath || '').trim()
    if (resourcesPath) {
      const bundled = path.join(resourcesPath, 'python-bundle', 'python', 'python.exe')
      if (fs.existsSync(bundled)) return bundled
    }
    const venvWin = path.join(scriptRoot, '.venv', 'Scripts', 'python.exe')
    if (fs.existsSync(venvWin)) return venvWin
    return 'python'
  })()

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
    description: 'JPLearn — Japanese Learning App',
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
    downloadPipelineModel,
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
    uninstallPipelineModel,
  }
}

module.exports = { createSetupRuntime }



