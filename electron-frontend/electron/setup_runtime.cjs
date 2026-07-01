/**
 * setup_runtime.cjs — first-run setup wizard backend.
 *
 * Provides system detection, model downloads (with redirect handling and .tmp
 * safety), llama.cpp installation, and VOICEVOX installation via the existing
 * get_voicevox.py script. All downloads target Documents\JPLearn\ so they
 * survive uninstall/reinstall.
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
    filename: 'qwen2.5-1.5b-instruct-q8_0.gguf',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    sizeMb: 1890,
    label: 'Low-end (1.5B)',
    description: 'Fast on any hardware. Good for everyday questions.',
  },
  high: {
    filename: 'qwen2.5-3b-instruct-q8_0.gguf',
    repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    sizeMb: 3620,
    label: 'High-end (3B)',
    description: 'Stronger Japanese understanding. Recommended for most users.',
  },
  ultra: {
    filename: 'Qwen3.5-9B-Q6_K.gguf',
    repo: 'unsloth/Qwen3.5-9B-GGUF',
    sizeMb: 7460,
    label: 'Ultra (9B)',
    description: 'Most capable. Better for complex grammar and nuanced questions.',
  },
}

const RAM_THRESHOLD_GB = 16
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
const VOICEVOX_SIZE_MB = 1000
const FONTS_SIZE_MB = 100
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
  const explicit = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (explicit) return explicit
  let docs
  try {
    docs = require('electron').app.getPath('documents')
  } catch {
    docs = path.join(os.homedir(), 'Documents')
  }
  return path.join(docs, 'JPLearn')
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
  for (const sub of ['models', 'voicevox', 'data', 'fonts', 'tools']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true })
  }
  return base
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
  const recommendedTier = totalRamGb >= RAM_THRESHOLD_GB ? 'high' : 'low'
  const modelsDir = path.join(base, 'models')
  const llamaCppDir = path.join(base, 'tools', 'llama.cpp', 'build', 'bin', 'Release')
  const voicevoxInstalled = fs.existsSync(path.join(base, 'voicevox', 'run.exe'))
  const llamaCppInstalled = fs.existsSync(path.join(llamaCppDir, 'llama-server.exe'))
  const gpuAdapters = detectGpuNames()
  const gpuVramGb = detectGpuVramGb()
  const llamaCppBackend = detectLlamaBackend(gpuAdapters)
  const networkMbpsRaw = await measureNetworkMbps()
  const networkMbps = typeof networkMbpsRaw === 'number' && Number.isFinite(networkMbpsRaw)
    ? Math.round(networkMbpsRaw * 10) / 10
    : null

  const fontInstallState = getFontInstallState(base)
  const fontsInstalled = fontInstallState.installed

  let isPackaged = false
  try { isPackaged = require('electron').app.isPackaged } catch { /* dev mode */ }

  const models = Object.entries(MODELS).map(([tier, m]) => ({
    tier,
    filename: m.filename,
    sizeMb: m.sizeMb,
    label: m.label,
    description: m.description,
    installed: fs.existsSync(path.join(modelsDir, m.filename)),
    estimatedDownloadMinutes: estimateDownloadMinutes(m.sizeMb, networkMbps),
  }))

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
    voicevoxInstalled,
    fontsInstalled,
    isPackaged,
    networkMbps,
    llamaCppEstimatedDownloadMinutes: estimateDownloadMinutes(LLAMA_CPP_SIZE_MB, networkMbps),
    voicevoxEstimatedDownloadMinutes: estimateDownloadMinutes(VOICEVOX_SIZE_MB, networkMbps),
    fontsEstimatedDownloadMinutes: estimateDownloadMinutes(FONTS_SIZE_MB, networkMbps),
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

/**
 * Download url → destPath, following HTTP redirects.
 * Writes to destPath + '.tmp' first; renames to destPath only on 100% success.
 * Node's https.get does not follow redirects automatically.
 */
function downloadWithProgress(url, destPath, onProgress) {
  const tmpPath = `${destPath}.tmp`

  return new Promise((resolve, reject) => {
    // Remove any leftover partial file from a previous attempt
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }

    function follow(redirectUrl, hops) {
      if (hops > 8) {
        reject(new Error('Too many redirects'))
        return
      }
      const mod = redirectUrl.startsWith('https') ? https : http
      const req = mod.get(redirectUrl, { headers: { 'User-Agent': 'JPLearn/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy()
          follow(res.headers.location, hops + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${redirectUrl}`))
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let done = 0
        let lastReportedPct = -1

        const out = fs.createWriteStream(tmpPath)

        res.on('data', (chunk) => {
          done += chunk.length
          if (total > 0 && onProgress) {
            const pct = Math.round((done / total) * 100)
            // Throttle to avoid flooding the IPC channel
            if (pct !== lastReportedPct) {
              lastReportedPct = pct
              onProgress(done, total)
            }
          }
        })

        res.pipe(out)

        out.on('finish', () => {
          try {
            fs.renameSync(tmpPath, destPath)
            resolve()
          } catch (err) {
            try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
            reject(err)
          }
        })

        const cleanup = (err) => {
          try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
          reject(err)
        }
        out.on('error', cleanup)
        res.on('error', cleanup)
      })
      req.on('error', (err) => {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
        reject(err)
      })
    }

    follow(url, 0)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

function downloadModel(tier, sender) {
  const model = MODELS[tier]
  if (!model) return Promise.reject(new Error(`Unknown model tier: ${tier}`))

  const base = ensureJPLearnDirs()
  const destPath = path.join(base, 'models', model.filename)

  if (fs.existsSync(destPath)) {
    return Promise.resolve({ alreadyInstalled: true })
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

  return downloadWithProgress(url, destPath, onProgress)
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

function downloadVoicevox(sender, scriptRoot) {
  const base = ensureJPLearnDirs()
  const voicevoxDir = path.join(base, 'voicevox')

  if (fs.existsSync(path.join(voicevoxDir, 'run.exe'))) {
    return Promise.resolve({ alreadyInstalled: true })
  }

  const scriptPath = path.join(scriptRoot, 'scripts', 'get_voicevox.py')
  const pythonCmd = resolvePythonCommand(scriptRoot)

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [scriptPath], {
      env: { ...process.env, VOICEVOX_TARGET_DIR: voicevoxDir },
      windowsHide: true,
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const match = text.match(/(\d+)%/)
      if (match && sender && !sender.isDestroyed()) {
        sender.send('setup:download-progress', {
          id: 'voicevox',
          percent: parseInt(match[1], 10),
          mb: null,
          totalMb: 1000,
          etaSec: null,
        })
      }
    })

    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else reject(new Error(`get_voicevox.py exited with code ${code}`))
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
      env: { ...process.env, JPLEARN_DOCUMENTS_DIR: base },
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
    downloadModel,
    downloadLlamaCpp,
    downloadVoicevox,
    downloadFonts,
    createShortcuts,
    setActiveModelTier,
    uninstallModel,
  }
}

module.exports = { createSetupRuntime }



