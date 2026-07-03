/**
 * setup_runtime.cjs — first-run setup wizard backend.
 *
 * Provides system detection, model downloads (with redirect handling and .tmp
 * safety), llama.cpp installation, and qwentts.cpp voice model installation.
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
    filename: 'Qwen3.5-0.8B-Q6_K.gguf',
    repo: 'unsloth/Qwen3.5-0.8B-GGUF',
    sizeMb: 639,
    label: 'Low (0.8B)',
    description: 'Fast on any hardware. Good for everyday questions.',
  },
  medium: {
    filename: 'Qwen3.5-2B-Q6_K.gguf',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    sizeMb: 1570,
    label: 'Medium (2B)',
    description: 'Better Japanese understanding while staying responsive on 16 GB systems.',
  },
  high: {
    filename: 'Qwen3.5-4B-Q6_K.gguf',
    repo: 'unsloth/Qwen3.5-4B-GGUF',
    sizeMb: 3530,
    label: 'High (4B)',
    description: 'Stronger reasoning and nuance. Best with 8 GB VRAM and 16 GB RAM.',
  },
  ultra: {
    filename: 'Qwen3.5-9B-Q6_K.gguf',
    repo: 'unsloth/Qwen3.5-9B-GGUF',
    sizeMb: 7460,
    label: 'Ultra (9B)',
    description: 'Most capable. Best with 12+ GB VRAM and 32 GB RAM.',
  },
  max: {
    filename: 'gemma-4-12b-it-Q6_K.gguf',
    repo: 'unsloth/gemma-4-12b-it-GGUF',
    sizeMb: 9790,
    label: 'Max (12B)',
    description: 'Largest and highest-capacity option. Best when hardware is strong.',
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
  max: 'e5_large',
}

// qwentts.cpp Japanese voice model catalogue. Two GGUFs are required
// together for any synthesis: a per-tier talker (voice/personality-bearing
// weights) and a single shared tokenizer/codec (same for every tier).
// Filenames and sizes verified against https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF.
// Q8_0 is the shipping quant (qwentts.cpp has no Q6 variant; BF16/F32/Q8_0/
// Q4_K_M are the only options -- Q8_0 chosen for quality, see
// patches/qwentts-cpp/0001-speaker-bank.patch for the runtime this targets).
const QWENTTS_MODELS = {
  '0.6b': {
    talkerFilename: 'qwen-talker-0.6b-base-Q8_0.gguf',
    talkerRepo: 'Serveurperso/Qwen3-TTS-GGUF',
    talkerSizeMb: 993,
    label: 'Standard (0.6B)',
    description: 'Default. Fast Japanese voice cloning with the curated preset speaker bank.',
  },
  '1.7b': {
    talkerFilename: 'qwen-talker-1.7b-base-Q8_0.gguf',
    talkerRepo: 'Serveurperso/Qwen3-TTS-GGUF',
    talkerSizeMb: 2080,
    label: 'High Quality (1.7B)',
    description: 'Optional. Stronger voice quality; slower and heavier on RAM.',
  },
}
const QWENTTS_TOKENIZER = {
  filename: 'qwen-tokenizer-12hz-Q8_0.gguf',
  repo: 'Serveurperso/Qwen3-TTS-GGUF',
  sizeMb: 291,
}
const QWENTTS_DEFAULT_TIER = '0.6b'
const ACTIVE_QWENTTS_TIER_STATE_FILENAME = 'active-qwentts-tier.json'
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
  for (const sub of ['models', 'tts', 'data', 'fonts', 'tools', 'whisper']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true })
  }
  return base
}

// ── qwentts (Japanese TTS) install state ─────────────────────────────────────

function getQwenttsDir(base) {
  return path.join(base, 'tts')
}

function getQwenttsModelsDir(base) {
  return path.join(getQwenttsDir(base), 'models')
}

function getQwenttsPresetBankDir(base) {
  return path.join(getQwenttsDir(base), 'preset_bank')
}

function isQwenttsTalkerInstalled(base, tier) {
  const model = QWENTTS_MODELS[tier]
  if (!model) return false
  return fs.existsSync(path.join(getQwenttsModelsDir(base), model.talkerFilename))
}

function isQwenttsTokenizerInstalled(base) {
  return fs.existsSync(path.join(getQwenttsModelsDir(base), QWENTTS_TOKENIZER.filename))
}

function hasAnyQwenttsTalkerInstalled(base) {
  return Object.keys(QWENTTS_MODELS).some((tier) => isQwenttsTalkerInstalled(base, tier))
}

// Copies any curated preset speakers bundled in the repo (data/tts/preset_bank/)
// into the installed assets directory. Called once at every app launch (see
// main.cjs) plus after a fresh model download, so newly bundled presets in a
// future app update get picked up without requiring a full reinstall.
// A no-op (returns {ok:false, reason:'no-bundled-presets'}) until real curated
// speakers exist under data/tts/preset_bank/ (see scripts/build_qwentts_preset_bank.py).
function seedBundledQwenttsPresetSpeakers(scriptRootArg = null) {
  const base = ensureJPLearnDirs()
  const scriptRoot = scriptRootArg || resolveScriptRoot()
  const sourceRoot = path.join(scriptRoot, 'data', 'tts', 'preset_bank')
  const targetRoot = getQwenttsPresetBankDir(base)

  if (!fs.existsSync(sourceRoot)) {
    return { ok: false, reason: 'no-bundled-presets' }
  }

  fs.mkdirSync(targetRoot, { recursive: true })

  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  let copied = 0
  for (const entry of entries) {
    const from = path.join(sourceRoot, entry.name)
    const to = path.join(targetRoot, entry.name)
    if (fs.existsSync(to)) {
      continue
    }
    fs.cpSync(from, to, { recursive: true, force: false })
    copied += 1
  }

  return { ok: true, copied, total: entries.length }
}

function getActiveQwenttsTierStatePath(base) {
  return path.join(getQwenttsDir(base), ACTIVE_QWENTTS_TIER_STATE_FILENAME)
}

function readActiveQwenttsTierSelection(base) {
  try {
    const raw = fs.readFileSync(getActiveQwenttsTierStatePath(base), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.tier === 'string' && typeof parsed.talkerFilename === 'string') {
      return parsed
    }
  } catch {
    // No selection yet, or the file is unreadable; caller falls back to auto-detect.
  }
  return null
}

function resolveActiveQwenttsTier(base) {
  const selection = readActiveQwenttsTierSelection(base)
  if (selection && QWENTTS_MODELS[selection.tier] && isQwenttsTalkerInstalled(base, selection.tier)) {
    return selection.tier
  }
  for (const tier of Object.keys(QWENTTS_MODELS)) {
    if (isQwenttsTalkerInstalled(base, tier)) {
      return tier
    }
  }
  return null
}

function setActiveQwenttsTier(tier) {
  const model = QWENTTS_MODELS[tier]
  if (!model) throw new Error(`Unknown qwentts tier: ${tier}`)
  const base = ensureJPLearnDirs()
  if (!isQwenttsTalkerInstalled(base, tier)) {
    throw new Error(`qwentts tier "${tier}" is not installed`)
  }
  fs.writeFileSync(
    getActiveQwenttsTierStatePath(base),
    JSON.stringify({ tier, talkerFilename: model.talkerFilename, updatedAtUtc: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return { ok: true, tier }
}

function uninstallQwenttsTier(tier) {
  const model = QWENTTS_MODELS[tier]
  if (!model) throw new Error(`Unknown qwentts tier: ${tier}`)
  const base = ensureJPLearnDirs()
  const modelPath = path.join(getQwenttsModelsDir(base), model.talkerFilename)
  if (fs.existsSync(modelPath)) {
    fs.unlinkSync(modelPath)
  }
  const selection = readActiveQwenttsTierSelection(base)
  if (selection && selection.tier === tier) {
    try { fs.unlinkSync(getActiveQwenttsTierStatePath(base)) } catch { /* ignore */ }
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

function resolveScriptRoot() {
  return path.join(__dirname, '..', '..')
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
  if (gpuVramGb >= 16 || totalRamGb >= 16) return 'max'
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

  const qwenttsTokenizerInstalled = isQwenttsTokenizerInstalled(base)
  const qwenttsModels = Object.entries(QWENTTS_MODELS).map(([tier, m]) => {
    const installed = isQwenttsTalkerInstalled(base, tier)
    // Combined size only counts the tokenizer once, and only if it still
    // needs downloading -- mirrors downloadQwentts' own dedupe logic.
    const combinedSizeMb = m.talkerSizeMb + (qwenttsTokenizerInstalled ? 0 : QWENTTS_TOKENIZER.sizeMb)
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
  const qwenttsInstalled = hasAnyQwenttsTalkerInstalled(base) && qwenttsTokenizerInstalled

  return {
    totalRamGb: Math.round(totalRamGb * 10) / 10,
    recommendedTier,
    activeModelTier: resolveActiveTier(base, modelsDir),
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
    isPackaged,
    networkMbps,
    llamaCppEstimatedDownloadMinutes: estimateDownloadMinutes(LLAMA_CPP_SIZE_MB, networkMbps),
    fontsEstimatedDownloadMinutes: estimateDownloadMinutes(FONTS_SIZE_MB, networkMbps),
    dictionaryEstimatedDownloadMinutes: estimateDownloadMinutes(DICTIONARY_SIZE_MB, networkMbps),
    qwenttsInstalled,
    qwenttsModels,
    qwenttsDefaultTier: QWENTTS_DEFAULT_TIER,
    activeQwenttsTier: resolveActiveQwenttsTier(base),
  }
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
  if (selection && fs.existsSync(path.join(modelsDir, selection.filename))) {
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
  const destPath = path.join(base, 'models', model.filename)
  const embedderTier = CHATBOT_TIER_TO_EMBEDDER_TIER[tier]

  const ensureEmbedder = async () => {
    if (!embedderTier || !scriptRoot) return
    try {
      await ensureEmbedderInstalled(embedderTier, sender, scriptRoot)
    } catch (err) {
      console.error(`Embedder install failed for chatbot tier "${tier}": ${err instanceof Error ? err.message : err}`)
    }
  }

  if (fs.existsSync(destPath)) {
    return ensureEmbedder().then(() => ({ alreadyInstalled: true }))
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

  return downloadWithProgress(url, destPath, onProgress).then(async () => {
    await ensureEmbedder()
    return { ok: true }
  })
}

// Downloads the talker GGUF for the requested tier plus the shared tokenizer
// GGUF (once, regardless of how many tiers get installed), then seeds any
// bundled curated preset speakers. Mirrors downloadModel's structure but
// needs two files instead of one, so progress is reported against their
// combined size.
function downloadQwentts(tier, sender, scriptRoot) {
  const model = QWENTTS_MODELS[tier]
  if (!model) return Promise.reject(new Error(`Unknown qwentts tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const modelsDir = getQwenttsModelsDir(base)
  fs.mkdirSync(modelsDir, { recursive: true })
  const talkerDest = path.join(modelsDir, model.talkerFilename)
  const tokenizerDest = path.join(modelsDir, QWENTTS_TOKENIZER.filename)

  const talkerAlready = fs.existsSync(talkerDest)
  const tokenizerAlready = fs.existsSync(tokenizerDest)

  if (talkerAlready && tokenizerAlready) {
    seedBundledQwenttsPresetSpeakers(scriptRoot)
    return Promise.resolve({ alreadyInstalled: true })
  }

  const totalSizeMb = (talkerAlready ? 0 : model.talkerSizeMb) + (tokenizerAlready ? 0 : QWENTTS_TOKENIZER.sizeMb)
  const emitProgress = (percent, doneMb) => {
    if (sender && !sender.isDestroyed()) {
      sender.send('setup:download-progress', { id: 'qwentts', percent, mb: doneMb, totalMb: totalSizeMb, etaSec: null })
    }
  }

  const downloadOne = (repo, filename, dest, doneMbOffset) => {
    if (fs.existsSync(dest)) {
      return Promise.resolve()
    }
    const url = `https://huggingface.co/${repo}/resolve/main/${filename}`
    return downloadWithProgress(url, dest, (done, _total) => {
      const doneMb = Math.round(done / (1024 * 1024)) + doneMbOffset
      const percent = totalSizeMb > 0 ? Math.min(100, Math.round((doneMb / totalSizeMb) * 100)) : 0
      emitProgress(percent, doneMb)
    })
  }

  let chain = Promise.resolve()
  if (!talkerAlready) {
    chain = chain.then(() => downloadOne(model.talkerRepo, model.talkerFilename, talkerDest, 0))
  }
  if (!tokenizerAlready) {
    const offset = talkerAlready ? 0 : model.talkerSizeMb
    chain = chain.then(() => downloadOne(QWENTTS_TOKENIZER.repo, QWENTTS_TOKENIZER.filename, tokenizerDest, offset))
  }

  return chain.then(() => {
    emitProgress(100, totalSizeMb)
    seedBundledQwenttsPresetSpeakers(scriptRoot)
    return { ok: true }
  })
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
    seedBundledQwenttsPresetSpeakers,
    downloadModel,
    downloadLlamaCpp,
    downloadQwentts,
    downloadFonts,
    downloadDictionary,
    downloadSpeechModel,
    createShortcuts,
    setActiveModelTier,
    uninstallModel,
    setActiveQwenttsTier,
    uninstallQwenttsTier,
    setActiveSpeechModelTier,
    uninstallSpeechModel,
  }
}

module.exports = { createSetupRuntime }



