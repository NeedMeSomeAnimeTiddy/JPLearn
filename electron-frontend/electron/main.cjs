const { app, BrowserWindow, ipcMain, screen, Notification, Tray, Menu, nativeImage, dialog, session } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createBridgeWorker, isWorkerRefusal } = require('./bridge_worker.cjs')
const { createBridgeReadCache } = require('./bridge_read_cache.cjs')
// One copy of which Python to launch, shared with the OCR and speech runtimes (audit 11, nit 2).
const { resolvePythonCommand } = require('./python_command.cjs')
const { createAnswerQueue, createUnsavedAnswersQuitGuard } = require('./answer_queue.cjs')
const { registerIpcHandlers } = require('./ipc_handlers.cjs')
const { createTutorChatRuntime } = require('./llm_runtime.cjs')
const { createVoiceRuntime, isVoiceRuntimeInstalled } = require('./voice_runtime.cjs')
const { createSetupRuntime } = require('./setup_runtime.cjs')
const { createSpeechRuntime } = require('./speech_runtime.cjs')
const { createOcrRuntime } = require('./ocr_runtime.cjs')
const { loadFontCSS } = require('./font_loader.cjs')
const { initAutoUpdater } = require('./updater.cjs')
const { getConfigValue } = require('./config_store.cjs')
const { remainingDue } = require('./summary_counts.cjs')
const {
  isAllowedRendererUrl,
  isRendererPermissionAllowed,
} = require('./ipc_security.cjs')

async function reloadLocalFontsForContents(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return { ok: false }
  }
  const fontsDir = path.join(
    process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || process.env.JPLEARN_DOCUMENTS_DIR || '',
    'fonts',
  )
  const fontCSS = loadFontCSS(fontsDir)
  if (!fontCSS) {
    return { ok: false }
  }
  await webContents.insertCSS(fontCSS)
  return { ok: true }
}

const SQUIRREL_EVENTS = new Set([
  '--squirrel-install',
  '--squirrel-updated',
  '--squirrel-uninstall',
  '--squirrel-obsolete',
])

function findSquirrelEventArg(argv) {
  for (const arg of argv || []) {
    if (SQUIRREL_EVENTS.has(arg)) return arg
  }
  return null
}

function appendUninstallHookLog(message) {
  if (process.platform !== 'win32') return
  try {
    const logPath = path.join(os.tmpdir(), 'jplearn-uninstall-hook.log')
    const line = `[${new Date().toISOString()}] ${message}\n`
    fs.appendFileSync(logPath, line, 'utf8')
  } catch {
    // Best effort only.
  }
}

function getUninstallCleanupScriptPath() {
  const resourcesPath = (typeof process !== 'undefined' && process.resourcesPath) || ''
  const candidates = [
    resourcesPath ? path.join(resourcesPath, 'scripts', 'uninstall_cleanup.ps1') : '',
    path.join(__dirname, '..', '..', 'scripts', 'uninstall_cleanup.ps1'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function launchUninstallCleanupHelper() {
  if (process.platform !== 'win32') {
    return
  }

  const scriptPath = getUninstallCleanupScriptPath()
  if (!scriptPath) {
    appendUninstallHookLog('cleanup-helper: uninstall_cleanup.ps1 not found')
    return
  }

  const docsDir = process.env.JPLEARN_DOCUMENTS_DIR || path.join(os.homedir(), 'Documents', 'JPLearn Progress')
  // Downloads live apart from progress; the dialog offers both (audit 6 F2).
  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-JPLearnDir',
    docsDir,
    '-AssetsDir',
    resolveAssetsDataDir(),
  ]

  try {
    appendUninstallHookLog(`cleanup-helper: launching powershell for ${scriptPath}`)
    const child = spawn('powershell.exe', args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    appendUninstallHookLog('cleanup-helper: launch dispatched')
  } catch {
    appendUninstallHookLog('cleanup-helper: launch failed')
    // Best effort only: uninstall flow must never block Squirrel.
  }
}

function getSquirrelInstallRoot() {
  try {
    // process.execPath: ...\AppData\Local\jplearn\app-<version>\JPLearn.exe
    // Install root is one level above app-<version>.
    return path.resolve(path.dirname(process.execPath), '..')
  } catch {
    return null
  }
}

function runSquirrelUpdate(args) {
  const installRoot = getSquirrelInstallRoot()
  if (!installRoot) {
    return false
  }

  const updateExe = path.join(installRoot, 'Update.exe')
  if (!fs.existsSync(updateExe)) {
    appendUninstallHookLog(`squirrel-update: missing Update.exe at ${updateExe}`)
    return false
  }

  try {
    appendUninstallHookLog(`squirrel-update: launching ${updateExe} ${args.join(' ')}`)
    const child = spawn(updateExe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    appendUninstallHookLog('squirrel-update: launch dispatched')
    return true
  } catch {
    appendUninstallHookLog('squirrel-update: launch failed')
    return false
  }
}

function launchSquirrelRootCleanupHelper() {
  if (process.platform !== 'win32') {
    return
  }

  const installRoot = getSquirrelInstallRoot()
  if (!installRoot) {
    appendUninstallHookLog('root-cleanup: install root not resolved')
    return
  }

  const escapedRoot = installRoot.replace(/'/g, "''")
  const command = [
    `$root = '${escapedRoot}'`,
    'for ($i = 0; $i -lt 120; $i++) {',
    '  if (-not (Test-Path -LiteralPath $root)) { exit 0 }',
    '  try {',
    '    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction Stop',
    '  } catch {',
    '    # Best effort; Squirrel can still hold files briefly.',
    '  }',
    '  if (-not (Test-Path -LiteralPath $root)) { exit 0 }',
    '  Start-Sleep -Milliseconds 500',
    '}',
    'exit 0',
  ].join('; ')

  const encoded = Buffer.from(command, 'utf16le').toString('base64')
  try {
    appendUninstallHookLog(`root-cleanup: launching for ${installRoot}`)
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-EncodedCommand',
      encoded,
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    appendUninstallHookLog('root-cleanup: launch dispatched')
  } catch {
    appendUninstallHookLog('root-cleanup: launch failed')
    // Best effort only: uninstall flow must never block Squirrel.
  }
}

// ── Squirrel.Windows lifecycle events ────────────────────────────────────────
// Squirrel re-launches the app with a special arg for install/update/uninstall.
const _squirrelArg = findSquirrelEventArg(process.argv)
if (_squirrelArg) {
  appendUninstallHookLog(`squirrel-event: ${_squirrelArg}; argv=${JSON.stringify(process.argv)}`)
  const exeName = path.basename(process.execPath)
  if (_squirrelArg === '--squirrel-install' || _squirrelArg === '--squirrel-updated') {
    runSquirrelUpdate(['--createShortcut', exeName])
  }
  if (_squirrelArg === '--squirrel-uninstall') {
    runSquirrelUpdate(['--removeShortcut', exeName])
    launchUninstallCleanupHelper()
    launchSquirrelRootCleanupHelper()
  }
  // Clean quit — Squirrel will handle shortcuts/registry
  app.exit(0)
}

function resolveProgressDocumentsDir() {
  const explicit = (process.env.JPLEARN_DOCUMENTS_DIR || '').trim()
  if (explicit) {
    return explicit
  }
  let docsBase
  try {
    docsBase = app.getPath('documents')
  } catch {
    docsBase = path.join(os.homedir(), 'Documents')
  }
  return path.join(docsBase, 'JPLearn Progress')
}

function resolveAssetsDataDir() {
  const explicit = (process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || '').trim()
  if (explicit) {
    return explicit
  }
  if (process.platform === 'win32') {
    const localAppData = (process.env.LOCALAPPDATA || '').trim()
    if (localAppData) {
      return path.join(localAppData, 'JPLearn Assets')
    }
  }
  let appDataBase
  try {
    appDataBase = app.getPath('appData')
  } catch {
    appDataBase = path.join(os.homedir(), '.local', 'share')
  }
  return path.join(appDataBase, 'JPLearn Assets')
}

// Set before creating runtimes so storage-dependent modules resolve consistent paths.
if (!process.env.JPLEARN_DOCUMENTS_DIR) {
  process.env.JPLEARN_DOCUMENTS_DIR = resolveProgressDocumentsDir()
}
if (!process.env.JPLEARN_ASSETS_DIR) {
  process.env.JPLEARN_ASSETS_DIR = resolveAssetsDataDir()
}

const repoRoot = path.join(__dirname, '..', '..')
// The built page the main window loads; IPC senders and navigations must be this page (audit 8 F1).
const APP_PAGE_PATH = path.join(__dirname, '..', 'dist', 'index.html')
const APP_PAGE_URL = pathToFileURL(APP_PAGE_PATH).href
const startupReadyResolvers = new Map()
const startupTelemetryByContentsId = new Map()
const windowExpandedStateById = new Map()
const windowRestoreBoundsById = new Map()
let appTray = null
let isQuitting = false
let localTutorRuntime = createTutorChatRuntime()

function createSelectedVoiceRuntime() {
  if (!isVoiceRuntimeInstalled(repoRoot)) {
    console.warn('voice engine is not fully installed; audio:speak will remain unavailable until setup completes.')
  }
  return createVoiceRuntime({ repoRoot })
}

const localVoiceRuntime = createSelectedVoiceRuntime()
const localSetupRuntime = createSetupRuntime()
const localSpeechRuntime = createSpeechRuntime({ repoRoot })
const localOcrRuntime = createOcrRuntime({ repoRoot })
let tutorRuntimePreloadPromise = null
// the window asked for a tutor warmup this session (the chat while switched on, or scenario practice's AI
// evaluation, which the learner turns on) and has not unloaded since
let tutorWarmupRequested = false
let preloadedAssistantChatHistory = {
  ok: true,
  turns: [],
  runtimeActive: false,
  source: 'startup-none',
}
const THEME_STATE_FILENAME = 'jplearn-startup-theme.json'
const STARTUP_TELEMETRY_FILENAME = 'startup-telemetry.json'
const STUDY_JOURNEY_SMOKE_FILENAME = 'study-journey-smoke.json'
const BRIDGE_TELEMETRY_FILENAME = 'bridge-runtime-telemetry.json'
const BRIDGE_READ_CACHE_TTLS_MS = {
  summary: 30000,
  'deck-cards': 120000,
  'block-progress': 45000,
  'overview-character-mastery': 45000,
  'study-queue': 12000,
  /* The startup preload computes these three; the home screen asks for them moments later and
     takes the preload's result instead of computing them again (audit 11, Robbie: "Keep them,
     reuse results"). Every write that can change them clears them. */
  'xp-progress': 15000,
  recommendations: 15000,
  'learning-path-status': 15000,
}
const bridgeReadCache = createBridgeReadCache({ ttlsMs: BRIDGE_READ_CACHE_TTLS_MS })
const BRIDGE_REQUEST_TIMEOUT_MS = 30000
// A single slow request (fsrs-optimize) timing out should not tear down
// the worker and collaterally reject every unrelated in-flight request. Only
// restart the worker once several requests in a row have timed out with no
// successful response in between -- a real sign the child is wedged.
const BRIDGE_MAX_CONSECUTIVE_TIMEOUTS = 3
const bridgeTelemetry = {
  startedAtUtc: new Date().toISOString(),
  workerStarts: 0,
  workerRequestCount: 0,
  workerSuccessCount: 0,
  workerFailureCount: 0,
  workerTimeoutCount: 0,
  fallbackCount: 0,
  oneShotCount: 0,
  lastWorkerError: null,
  lastFallbackAtUtc: null,
}
const bridgeWorker = createBridgeWorker({
  resolveContext: () => resolvePythonBridgeContext(),
  resolvePythonCommand: (projectRoot) => resolvePythonCommand(projectRoot),
  telemetry: bridgeTelemetry,
  requestTimeoutMs: BRIDGE_REQUEST_TIMEOUT_MS,
  maxConsecutiveTimeouts: BRIDGE_MAX_CONSECUTIVE_TIMEOUTS,
})
const bridgeWorkerState = bridgeWorker.state
const STARTUP_BUDGETS_MS = {
  startupReady: 5000,
  firstSummary: 2500,
}
const STARTUP_PRELOAD_MAX_WAIT_MS = 25000
const STARTUP_PRELOAD_PROGRESS_START_PCT = 70
const STARTUP_PRELOAD_PROGRESS_END_PCT = 90
const STARTUP_PRELOAD_DECK_SLUGS = [
  'hiragana',
  'katakana',
  'vocab_greetings',
]
const STARTUP_PRELOAD_BLOCK_ONLY_SLUGS = []

async function refreshTutorRuntimeAfterSetup() {
  try {
    await localTutorRuntime.unload('setup-complete-refresh')
  } catch {
    // Best effort only.
  }
  localTutorRuntime = createTutorChatRuntime()
  tutorRuntimePreloadPromise = null
  preloadedAssistantChatHistory = {
    ok: true,
    turns: [],
    runtimeActive: false,
    source: 'setup-runtime-refresh-started',
  }
  /* No warmup of its own: the window asks for one when the tutor chat is switched on (audit 11, F3).
     If it has asked this session and not switched the chat off since, the new runtime (a model the
     setup wizard just installed, say) is warmed for it, without the caller waiting (review, finding 3). */
  if (tutorWarmupRequested) {
    void preloadTutorChatStartupData().catch(() => undefined)
  }
}

// voice runtime re-resolves model paths fresh on every
// restart (no cached state across calls the way the tutor runtime has), so
// refreshing after a new voice model download/selection only needs to stop
// any currently running server -- the next speak()/preload() call spawns a
// fresh process against the newly selected model.
async function refreshVoiceRuntimeAfterSetup() {
  try {
    await localVoiceRuntime.unload()
  } catch {
    // Best effort only.
  }
}

// Setup can install or uninstall the OCR model underneath a warm server
// process, which resolved its model directories when it started. Stopping it is
// enough -- the next extraction spawns a fresh process against whatever is
// installed then.
function refreshOcrRuntimeAfterSetup() {
  try {
    localOcrRuntime.unload()
  } catch {
    // Best effort only.
  }
}
const FORCED_USER_DATA_DIR = process.env.JPLEARN_USER_DATA_DIR
const FORCED_SESSION_DATA_DIR = process.env.JPLEARN_SESSION_DATA_DIR
const DEFAULT_STARTUP_THEME = 'crt_cassette'
const VALID_STARTUP_THEMES = new Set([
  'crt_cassette',
  'lofi_dusk',
  'lofi_dusk_light',
  'harbor_mist',
  'sakura_dawn',
  'forest_ink',
  'sunset_lacquer',
  'midnight_neon',
  'paper_crane',
  'matcha_stone',
  'ocean_glass',
  'ember_night',
  'plum_garden',
  'harbor_mist_light',
  'sakura_dawn_light',
  'sunset_lacquer_light',
  'midnight_neon_light',
  'paper_crane_light',
  'ember_night_light',
  'forest_ink_light',
  'ocean_glass_light',
  'plum_garden_light',
  'matcha_stone_light',
  'high_contrast',
  'high_contrast_light',
])
function ensureAppPath(pathKey, targetDir) {
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    app.setPath(pathKey, targetDir)
    return app.getPath(pathKey)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.warn(`Failed to set ${pathKey} path:`, detail)
    return app.getPath(pathKey)
  }
}

if (FORCED_USER_DATA_DIR) {
  ensureAppPath('userData', FORCED_USER_DATA_DIR)
}

const resolvedSessionDataPath = ensureAppPath(
  'sessionData',
  FORCED_SESSION_DATA_DIR || path.join(app.getPath('userData'), 'session-data')
)
const resolvedDiskCachePath = path.join(resolvedSessionDataPath, 'Cache')
try {
  fs.mkdirSync(resolvedDiskCachePath, { recursive: true })
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  console.warn('Failed to configure disk cache dir:', detail)
}

function getThemeStatePath() {
  return path.join(app.getPath('userData'), THEME_STATE_FILENAME)
}

function getStartupTelemetryPath() {
  return path.join(app.getPath('userData'), STARTUP_TELEMETRY_FILENAME)
}

function getStudyJourneySmokePath() {
  return path.join(app.getPath('userData'), STUDY_JOURNEY_SMOKE_FILENAME)
}

function getBridgeTelemetryPath() {
  return path.join(app.getPath('userData'), BRIDGE_TELEMETRY_FILENAME)
}

function answerQueueTelemetry(queue) {
  return { answersWaiting: queue.count, answerQueueHeadAttempts: queue.headAttempts, answerQueueHeadError: queue.headError }
}

function getBridgeTelemetrySnapshot() {
  return {
    ...bridgeTelemetry,
    capturedAtUtc: new Date().toISOString(),
    pendingRequests: bridgeWorkerState.pending.size,
    readCacheEntries: bridgeReadCache.size,
    ...answerQueueTelemetry(answerQueue.snapshot()),
    stderrTail: bridgeWorkerState.stderr.slice(-4000) || null,
  }
}

function normalizeStartupTelemetry(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const toFiniteNumber = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null

  return {
    startupReadyMs: toFiniteNumber(payload.startupReadyMs),
    deferredLoadsQueuedAtMs: toFiniteNumber(payload.deferredLoadsQueuedAtMs),
  }
}

function warnIfFirstSummaryOverBudget(firstSummaryMs) {
  if (typeof firstSummaryMs === 'number' && firstSummaryMs > STARTUP_BUDGETS_MS.firstSummary) {
    console.warn(
      `Startup budget exceeded: first summary in ${firstSummaryMs}ms (budget ${STARTUP_BUDGETS_MS.firstSummary}ms)`,
    )
  }
}

/* THE FIRST SUMMARY ARRIVES ON ITS OWN, BECAUSE IT CANNOT ARRIVE WITH STARTUP-READY (#82). The
   renderer says it is ready as soon as its shell mounts, deliberately before the summary's bridge
   round-trip, so a `firstSummaryMs` carried on that message was null on every run ever recorded and
   the 2500 ms budget was never checked. The renderer now reports it when the summary lands. That can
   be before the telemetry file is written, in which case the write picks it up, or after, in which
   case the file is written again with it -- either way it is checked against the budget once. */
function recordFirstSummary(webContentsId, payload) {
  const context = startupTelemetryByContentsId.get(webContentsId)
  const firstSummaryMs = typeof payload?.firstSummaryMs === 'number' && Number.isFinite(payload.firstSummaryMs)
    ? Math.round(payload.firstSummaryMs)
    : null
  if (!context || firstSummaryMs === null || typeof context.firstSummaryMs === 'number') {
    return
  }
  context.firstSummaryMs = firstSummaryMs
  if (context.written) {
    context.written.renderer = { ...(context.written.renderer || {}), firstSummaryMs }
    writeStartupTelemetry(context.written)
    warnIfFirstSummaryOverBudget(firstSummaryMs)
  }
}

function writeStartupTelemetry(payload) {
  try {
    const telemetryPath = getStartupTelemetryPath()
    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true })
    fs.writeFileSync(telemetryPath, JSON.stringify(payload, null, 2), 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.warn('Failed to write startup telemetry:', detail)
  }
}

function writeStudyJourneySmoke(payload) {
  try {
    const reportPath = getStudyJourneySmokePath()
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.warn('Failed to write study journey smoke report:', detail)
  }
}

function writeBridgeTelemetry() {
  try {
    const reportPath = getBridgeTelemetryPath()
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(getBridgeTelemetrySnapshot(), null, 2), 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.warn('Failed to write bridge telemetry:', detail)
  }
}

function normalizeStartupTheme(theme) {
  if (typeof theme !== 'string') return DEFAULT_STARTUP_THEME
  const normalized = theme.trim().toLowerCase()
  return VALID_STARTUP_THEMES.has(normalized) ? normalized : DEFAULT_STARTUP_THEME
}

function readSavedStartupTheme() {
  try {
    const payload = JSON.parse(fs.readFileSync(getThemeStatePath(), 'utf8'))
    return normalizeStartupTheme(payload.theme)
  } catch {
    return DEFAULT_STARTUP_THEME
  }
}

function saveStartupTheme(theme) {
  const normalized = normalizeStartupTheme(theme)
  const statePath = getThemeStatePath()
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify({ theme: normalized }), 'utf8')
  return normalized
}

function getSplashPalette(theme) {
  const palettes = {
    crt_cassette: {
      bgA: '#0e151c',
      bgB: '#14202a',
      glowA: 'rgba(242, 181, 111, 0.22)',
      glowB: 'rgba(116, 159, 220, 0.18)',
      glowC: 'rgba(104, 187, 205, 0.18)',
      panelA: 'rgba(25, 39, 50, 0.92)',
      panelB: 'rgba(18, 31, 40, 0.9)',
      border: 'rgba(153, 196, 215, 0.32)',
      spinnerTrack: 'rgba(242, 181, 111, 0.2)',
      spinnerHead: '#f2b56f',
      title: '#edf4f7',
      subtitle: 'rgba(168, 188, 198, 0.82)',
      accent: '#f2b56f',
    },
    lofi_dusk: {
      bgA: '#1a1410',
      bgB: '#241d17',
      glowA: 'rgba(212, 165, 106, 0.22)',
      glowB: 'rgba(184, 154, 130, 0.16)',
      glowC: 'rgba(212, 165, 106, 0.20)',
      panelA: 'rgba(42, 33, 26, 0.92)',
      panelB: 'rgba(32, 25, 20, 0.9)',
      border: 'rgba(180, 140, 110, 0.32)',
      spinnerTrack: 'rgba(212, 165, 106, 0.20)',
      spinnerHead: '#d4a56a',
      title: '#f0e6dd',
      subtitle: 'rgba(184, 165, 148, 0.82)',
      accent: '#d4a56a',
    },
    harbor_mist: {
      bgA: '#0c1822',
      bgB: '#142433',
      glowA: 'rgba(123, 197, 223, 0.22)',
      glowB: 'rgba(100, 170, 210, 0.16)',
      glowC: 'rgba(123, 197, 223, 0.18)',
      panelA: 'rgba(22, 44, 60, 0.92)',
      panelB: 'rgba(16, 34, 48, 0.9)',
      border: 'rgba(140, 190, 210, 0.32)',
      spinnerTrack: 'rgba(123, 197, 223, 0.20)',
      spinnerHead: '#7bc5df',
      title: '#e4f0f8',
      subtitle: 'rgba(160, 190, 207, 0.82)',
      accent: '#7bc5df',
    },
    sakura_dawn: {
      bgA: '#1a1118',
      bgB: '#261a23',
      glowA: 'rgba(245, 160, 180, 0.22)',
      glowB: 'rgba(210, 150, 180, 0.16)',
      glowC: 'rgba(245, 160, 180, 0.18)',
      panelA: 'rgba(48, 32, 44, 0.92)',
      panelB: 'rgba(38, 26, 36, 0.9)',
      border: 'rgba(210, 150, 170, 0.32)',
      spinnerTrack: 'rgba(245, 160, 180, 0.20)',
      spinnerHead: '#f5a0b4',
      title: '#f6eef3',
      subtitle: 'rgba(212, 184, 199, 0.82)',
      accent: '#f5a0b4',
    },
    forest_ink: {
      bgA: '#0e1714',
      bgB: '#15241e',
      glowA: 'rgba(126, 201, 154, 0.22)',
      glowB: 'rgba(100, 180, 140, 0.16)',
      glowC: 'rgba(126, 201, 154, 0.18)',
      panelA: 'rgba(26, 46, 38, 0.92)',
      panelB: 'rgba(20, 38, 30, 0.9)',
      border: 'rgba(130, 180, 150, 0.32)',
      spinnerTrack: 'rgba(126, 201, 154, 0.20)',
      spinnerHead: '#7ec99a',
      title: '#e8f5ee',
      subtitle: 'rgba(164, 199, 180, 0.82)',
      accent: '#7ec99a',
    },
    sunset_lacquer: {
      bgA: '#1e1414',
      bgB: '#2a1c1c',
      glowA: 'rgba(240, 148, 92, 0.22)',
      glowB: 'rgba(210, 130, 90, 0.16)',
      glowC: 'rgba(240, 148, 92, 0.18)',
      panelA: 'rgba(48, 32, 30, 0.92)',
      panelB: 'rgba(38, 26, 24, 0.9)',
      border: 'rgba(200, 140, 110, 0.32)',
      spinnerTrack: 'rgba(240, 148, 92, 0.20)',
      spinnerHead: '#f0945c',
      title: '#f8eee8',
      subtitle: 'rgba(212, 184, 168, 0.82)',
      accent: '#f0945c',
    },
    midnight_neon: {
      bgA: '#0d1121',
      bgB: '#151c34',
      glowA: 'rgba(108, 191, 255, 0.22)',
      glowB: 'rgba(90, 160, 230, 0.16)',
      glowC: 'rgba(108, 191, 255, 0.18)',
      panelA: 'rgba(26, 38, 64, 0.92)',
      panelB: 'rgba(20, 30, 52, 0.9)',
      border: 'rgba(130, 180, 220, 0.32)',
      spinnerTrack: 'rgba(108, 191, 255, 0.20)',
      spinnerHead: '#6cbfff',
      title: '#e8f0ff',
      subtitle: 'rgba(164, 184, 216, 0.82)',
      accent: '#6cbfff',
    },
    paper_crane: {
      bgA: '#13100d',
      bgB: '#1c1713',
      glowA: 'rgba(200, 152, 104, 0.22)',
      glowB: 'rgba(180, 140, 100, 0.16)',
      glowC: 'rgba(200, 152, 104, 0.18)',
      panelA: 'rgba(40, 32, 26, 0.92)',
      panelB: 'rgba(30, 24, 20, 0.9)',
      border: 'rgba(175, 138, 108, 0.32)',
      spinnerTrack: 'rgba(200, 152, 104, 0.20)',
      spinnerHead: '#c89868',
      title: '#f4ecde',
      subtitle: 'rgba(196, 180, 158, 0.82)',
      accent: '#c89868',
    },
    matcha_stone: {
      bgA: '#111812',
      bgB: '#1a241b',
      glowA: 'rgba(164, 200, 120, 0.22)',
      glowB: 'rgba(140, 180, 110, 0.16)',
      glowC: 'rgba(164, 200, 120, 0.18)',
      panelA: 'rgba(32, 46, 33, 0.92)',
      panelB: 'rgba(26, 38, 27, 0.9)',
      border: 'rgba(150, 180, 130, 0.32)',
      spinnerTrack: 'rgba(164, 200, 120, 0.20)',
      spinnerHead: '#a4c878',
      title: '#eaf2e6',
      subtitle: 'rgba(176, 193, 166, 0.82)',
      accent: '#a4c878',
    },
    ocean_glass: {
      bgA: '#0b171f',
      bgB: '#122431',
      glowA: 'rgba(108, 200, 196, 0.22)',
      glowB: 'rgba(90, 180, 180, 0.16)',
      glowC: 'rgba(108, 200, 196, 0.18)',
      panelA: 'rgba(22, 44, 56, 0.92)',
      panelB: 'rgba(16, 36, 44, 0.9)',
      border: 'rgba(130, 185, 190, 0.32)',
      spinnerTrack: 'rgba(108, 200, 196, 0.20)',
      spinnerHead: '#6cc8c4',
      title: '#e4f4f8',
      subtitle: 'rgba(164, 202, 216, 0.82)',
      accent: '#6cc8c4',
    },
    ember_night: {
      bgA: '#180f10',
      bgB: '#221618',
      glowA: 'rgba(240, 128, 80, 0.22)',
      glowB: 'rgba(210, 110, 80, 0.16)',
      glowC: 'rgba(240, 128, 80, 0.18)',
      panelA: 'rgba(44, 28, 28, 0.92)',
      panelB: 'rgba(34, 22, 22, 0.9)',
      border: 'rgba(200, 120, 100, 0.32)',
      spinnerTrack: 'rgba(240, 128, 80, 0.20)',
      spinnerHead: '#f08050',
      title: '#f6ece6',
      subtitle: 'rgba(212, 176, 160, 0.82)',
      accent: '#f08050',
    },
    plum_garden: {
      bgA: '#15111e',
      bgB: '#201a2c',
      glowA: 'rgba(184, 140, 240, 0.22)',
      glowB: 'rgba(160, 130, 220, 0.16)',
      glowC: 'rgba(184, 140, 240, 0.18)',
      panelA: 'rgba(38, 30, 58, 0.92)',
      panelB: 'rgba(30, 24, 46, 0.9)',
      border: 'rgba(170, 140, 210, 0.32)',
      spinnerTrack: 'rgba(184, 140, 240, 0.20)',
      spinnerHead: '#b88cf0',
      title: '#f2ecf8',
      subtitle: 'rgba(196, 180, 216, 0.82)',
      accent: '#b88cf0',
    },
    high_contrast: {
      bgA: '#000000',
      bgB: '#0a0a0a',
      glowA: 'rgba(255, 221, 0, 0.14)',
      glowB: 'rgba(255, 221, 0, 0.10)',
      glowC: 'rgba(255, 221, 0, 0.12)',
      panelA: 'rgba(17, 17, 17, 0.92)',
      panelB: 'rgba(13, 13, 13, 0.9)',
      border: 'rgba(255, 255, 255, 0.36)',
      spinnerTrack: 'rgba(255, 221, 0, 0.24)',
      spinnerHead: '#ffdd00',
      title: '#ffffff',
      subtitle: 'rgba(204, 204, 204, 0.82)',
      accent: '#ffdd00',
    },
    lofi_dusk_light: {
      bgA: '#f3e6d3',
      bgB: '#e9d8c1',
      glowA: 'rgba(200, 144, 92, 0.24)',
      glowB: 'rgba(170, 140, 110, 0.18)',
      glowC: 'rgba(200, 144, 92, 0.22)',
      panelA: 'rgba(250, 240, 227, 0.96)',
      panelB: 'rgba(244, 233, 218, 0.94)',
      border: 'rgba(140, 110, 88, 0.34)',
      spinnerTrack: 'rgba(200, 144, 92, 0.24)',
      spinnerHead: '#c8905c',
      title: '#4a3c34',
      subtitle: 'rgba(124, 110, 96, 0.80)',
      accent: '#c8905c',
    },
    harbor_mist_light: {
      bgA: '#eaf4f9',
      bgB: '#dcecf4',
      glowA: 'rgba(90, 160, 188, 0.24)',
      glowB: 'rgba(80, 140, 175, 0.18)',
      glowC: 'rgba(90, 160, 188, 0.22)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(243, 250, 254, 0.94)',
      border: 'rgba(100, 148, 172, 0.34)',
      spinnerTrack: 'rgba(90, 160, 188, 0.24)',
      spinnerHead: '#5aa0bc',
      title: '#2a3a46',
      subtitle: 'rgba(100, 120, 136, 0.80)',
      accent: '#5aa0bc',
    },
    sakura_dawn_light: {
      bgA: '#f8edf1',
      bgB: '#f1e2e9',
      glowA: 'rgba(212, 120, 148, 0.24)',
      glowB: 'rgba(190, 110, 140, 0.18)',
      glowC: 'rgba(212, 120, 148, 0.22)',
      panelA: 'rgba(255, 252, 255, 0.96)',
      panelB: 'rgba(252, 244, 249, 0.94)',
      border: 'rgba(170, 118, 140, 0.34)',
      spinnerTrack: 'rgba(212, 120, 148, 0.24)',
      spinnerHead: '#d47894',
      title: '#422a36',
      subtitle: 'rgba(124, 92, 108, 0.80)',
      accent: '#d47894',
    },
    forest_ink_light: {
      bgA: '#eef5ef',
      bgB: '#e2efe4',
      glowA: 'rgba(104, 168, 122, 0.24)',
      glowB: 'rgba(90, 155, 112, 0.18)',
      glowC: 'rgba(104, 168, 122, 0.22)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(245, 250, 246, 0.94)',
      border: 'rgba(108, 148, 124, 0.34)',
      spinnerTrack: 'rgba(104, 168, 122, 0.24)',
      spinnerHead: '#68a87a',
      title: '#283828',
      subtitle: 'rgba(92, 112, 96, 0.80)',
      accent: '#68a87a',
    },
    sunset_lacquer_light: {
      bgA: '#faf0e8',
      bgB: '#f4e4d8',
      glowA: 'rgba(208, 122, 80, 0.24)',
      glowB: 'rgba(190, 110, 78, 0.18)',
      glowC: 'rgba(208, 122, 80, 0.22)',
      panelA: 'rgba(255, 254, 252, 0.96)',
      panelB: 'rgba(252, 244, 237, 0.94)',
      border: 'rgba(168, 120, 98, 0.34)',
      spinnerTrack: 'rgba(208, 122, 80, 0.24)',
      spinnerHead: '#d07a50',
      title: '#46322a',
      subtitle: 'rgba(128, 106, 90, 0.80)',
      accent: '#d07a50',
    },
    midnight_neon_light: {
      bgA: '#eef3fa',
      bgB: '#e0e8f4',
      glowA: 'rgba(90, 152, 208, 0.24)',
      glowB: 'rgba(80, 130, 190, 0.18)',
      glowC: 'rgba(90, 152, 208, 0.22)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(246, 249, 254, 0.94)',
      border: 'rgba(110, 140, 182, 0.34)',
      spinnerTrack: 'rgba(90, 152, 208, 0.24)',
      spinnerHead: '#5a98d0',
      title: '#2c3858',
      subtitle: 'rgba(96, 112, 144, 0.80)',
      accent: '#5a98d0',
    },
    paper_crane_light: {
      bgA: '#f4efe6',
      bgB: '#ece4d8',
      glowA: 'rgba(184, 128, 88, 0.24)',
      glowB: 'rgba(170, 120, 82, 0.18)',
      glowC: 'rgba(184, 128, 88, 0.22)',
      panelA: 'rgba(255, 253, 249, 0.96)',
      panelB: 'rgba(249, 244, 236, 0.94)',
      border: 'rgba(150, 118, 96, 0.34)',
      spinnerTrack: 'rgba(184, 128, 88, 0.24)',
      spinnerHead: '#b88058',
      title: '#42382c',
      subtitle: 'rgba(120, 104, 88, 0.80)',
      accent: '#b88058',
    },
    ember_night_light: {
      bgA: '#faf0ea',
      bgB: '#f3e4dc',
      glowA: 'rgba(212, 116, 84, 0.24)',
      glowB: 'rgba(192, 104, 80, 0.18)',
      glowC: 'rgba(212, 116, 84, 0.22)',
      panelA: 'rgba(255, 254, 253, 0.96)',
      panelB: 'rgba(252, 245, 240, 0.94)',
      border: 'rgba(174, 118, 98, 0.34)',
      spinnerTrack: 'rgba(212, 116, 84, 0.24)',
      spinnerHead: '#d47454',
      title: '#46322a',
      subtitle: 'rgba(128, 100, 88, 0.80)',
      accent: '#d47454',
    },
    ocean_glass_light: {
      bgA: '#eaf7f8',
      bgB: '#ddf0f3',
      glowA: 'rgba(90, 170, 164, 0.24)',
      glowB: 'rgba(80, 155, 150, 0.18)',
      glowC: 'rgba(90, 170, 164, 0.22)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(242, 252, 251, 0.94)',
      border: 'rgba(100, 158, 154, 0.34)',
      spinnerTrack: 'rgba(90, 170, 164, 0.24)',
      spinnerHead: '#5aaaa4',
      title: '#2a3c40',
      subtitle: 'rgba(92, 116, 120, 0.80)',
      accent: '#5aaaa4',
    },
    plum_garden_light: {
      bgA: '#f4f0fa',
      bgB: '#ece6f6',
      glowA: 'rgba(160, 112, 220, 0.24)',
      glowB: 'rgba(145, 100, 200, 0.18)',
      glowC: 'rgba(160, 112, 220, 0.22)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(248, 244, 253, 0.94)',
      border: 'rgba(138, 114, 184, 0.34)',
      spinnerTrack: 'rgba(160, 112, 220, 0.24)',
      spinnerHead: '#a070dc',
      title: '#38304c',
      subtitle: 'rgba(112, 96, 140, 0.80)',
      accent: '#a070dc',
    },
    matcha_stone_light: {
      bgA: '#f0f5e8',
      bgB: '#e8efdd',
      glowA: 'rgba(142, 172, 90, 0.24)',
      glowB: 'rgba(128, 160, 82, 0.18)',
      glowC: 'rgba(142, 172, 90, 0.22)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(249, 252, 243, 0.94)',
      border: 'rgba(128, 152, 96, 0.34)',
      spinnerTrack: 'rgba(142, 172, 90, 0.24)',
      spinnerHead: '#8eac5a',
      title: '#383e2c',
      subtitle: 'rgba(106, 116, 88, 0.80)',
      accent: '#8eac5a',
    },
    high_contrast_light: {
      bgA: '#ffffff',
      bgB: '#f5f5f5',
      glowA: 'rgba(0, 85, 204, 0.10)',
      glowB: 'rgba(0, 85, 204, 0.07)',
      glowC: 'rgba(0, 85, 204, 0.08)',
      panelA: 'rgba(250, 250, 250, 0.96)',
      panelB: 'rgba(245, 245, 245, 0.94)',
      border: 'rgba(0, 0, 0, 0.34)',
      spinnerTrack: 'rgba(0, 85, 204, 0.24)',
      spinnerHead: '#0055cc',
      title: '#000000',
      subtitle: 'rgba(51, 51, 51, 0.80)',
      accent: '#0055cc',
    },
  }

  return palettes[theme] || palettes[DEFAULT_STARTUP_THEME]
}

function resolvePythonBridgeContext() {
  const candidateScripts = [
    path.join(repoRoot, 'scripts', 'desktop_bridge.py'),
    path.join(process.cwd(), '..', 'scripts', 'desktop_bridge.py'),
    path.join(process.cwd(), 'scripts', 'desktop_bridge.py'),
  ]

  for (const candidate of candidateScripts) {
    if (!fs.existsSync(candidate)) {
      continue
    }
    return {
      bridgeScript: candidate,
      projectRoot: path.resolve(candidate, '..', '..'),
      candidates: candidateScripts,
    }
  }

  return {
    bridgeScript: candidateScripts[0],
    projectRoot: repoRoot,
    candidates: candidateScripts,
  }
}

function runPythonBridgeOneShot(command) {
  const bridgeContext = resolvePythonBridgeContext()
  const pythonCmd = resolvePythonCommand(bridgeContext.projectRoot)
  const bridgeScript = bridgeContext.bridgeScript

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [bridgeScript, command], {
      cwd: bridgeContext.projectRoot,
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

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [
              `Bridge exited with code ${code}`,
              `Python command: ${pythonCmd}`,
              `Bridge script: ${bridgeScript}`,
              `Bridge cwd: ${bridgeContext.projectRoot}`,
              `Bridge candidates: ${bridgeContext.candidates.join(' | ')}`,
              `stderr: ${stderr.trim() || '(empty)'}`,
              `stdout: ${stdout.trim() || '(empty)'}`,
            ].join('\n'),
          ),
        )
        return
      }

      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`Invalid bridge JSON: ${String(error)}`))
      }
    })
  })
}

function runPythonBridgeWithArgsOneShot(args) {
  const bridgeContext = resolvePythonBridgeContext()
  const pythonCmd = resolvePythonCommand(bridgeContext.projectRoot)
  const bridgeScript = bridgeContext.bridgeScript

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [bridgeScript, ...args], {
      cwd: bridgeContext.projectRoot,
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

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            [
              `Bridge exited with code ${code}`,
              `Python command: ${pythonCmd}`,
              `Bridge script: ${bridgeScript}`,
              `Bridge cwd: ${bridgeContext.projectRoot}`,
              `Bridge candidates: ${bridgeContext.candidates.join(' | ')}`,
              `Bridge args: ${args.join(' ')}`,
              `stderr: ${stderr.trim() || '(empty)'}`,
              `stdout: ${stdout.trim() || '(empty)'}`,
            ].join('\n'),
          ),
        )
        return
      }

      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`Invalid bridge JSON: ${String(error)}`))
      }
    })
  })
}

function stopPythonBridgeWorker() {
  bridgeWorker.stop()
}

function getOrStartPythonBridgeWorker() {
  return bridgeWorker.start()
}

function runPythonBridgeWorkerRequest(args, requestOptions) {
  return bridgeWorker.request(args, requestOptions)
}

// Answers are saved through the worker alone: the one-shot fallback below has no timeout and, before
// answers carried ids, re-ran saves that had already committed (audit 1, F1). The answer queue retries.
// requestOptions.timeoutMs: a whole-database job's own, longer limit (see bridge_worker.cjs).
function runPythonBridgeWorkerOnly(args, requestOptions) {
  return runPythonBridgeWorkerRequest(args, requestOptions)
}

const answerQueue = createAnswerQueue({
  send: runPythonBridgeWorkerOnly,
  broadcast: (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    }
  },
  onSaved: () => clearBridgeReadCaches(),
})

function runPythonBridge(command) {
  return runPythonBridgeWorkerRequest([command]).catch((error) => {
    if (isWorkerRefusal(error)) {
      throw error
    }
    bridgeTelemetry.fallbackCount += 1
    bridgeTelemetry.lastFallbackAtUtc = new Date().toISOString()
    bridgeTelemetry.lastWorkerError = error instanceof Error ? error.message : String(error)
    bridgeTelemetry.oneShotCount += 1
    return runPythonBridgeOneShot(command)
  })
}

function runPythonBridgeWithArgs(args) {
  return runPythonBridgeWorkerRequest(args).catch((error) => {
    if (isWorkerRefusal(error)) {
      throw error
    }
    bridgeTelemetry.fallbackCount += 1
    bridgeTelemetry.lastFallbackAtUtc = new Date().toISOString()
    bridgeTelemetry.lastWorkerError = error instanceof Error ? error.message : String(error)
    bridgeTelemetry.oneShotCount += 1
    return runPythonBridgeWithArgsOneShot(args)
  })
}

// For commands known to be slow (fsrs-optimize): always run as a fresh
// one-shot process instead of the shared serial worker, so they can't
// head-of-line-block unrelated study queries (summary, deck-cards, ...)
// queued behind them on the single worker. Pays one-shot interpreter/import
// cost every call -- acceptable since these commands are already slow.
// OCR used to come through here too; it now has a dedicated persistent
// process (ocr_runtime.cjs) because it was paying that cost per image (#74).
function runPythonBridgeIsolated(args) {
  bridgeTelemetry.oneShotCount += 1
  return runPythonBridgeWithArgsOneShot(args)
}

function runPythonBridgeCached(command) {
  return bridgeReadCache.read(command, () => runPythonBridge(command))
}

function runPythonBridgeWithArgsCached(args) {
  return bridgeReadCache.read(args, () => runPythonBridgeWithArgs(args))
}

// With a list of commands, only those reads are forgotten (see bridge_read_cache.cjs).
function clearBridgeReadCaches(commands) {
  bridgeReadCache.clear(commands)
}

function getSafeRestoreBounds(win) {
  const workArea = screen.getDisplayMatching(win.getBounds()).workArea
  const [minWidth, minHeight] = win.getMinimumSize()
  const normalBounds = win.getNormalBounds()

  let width = normalBounds.width
  let height = normalBounds.height
  let x = normalBounds.x
  let y = normalBounds.y

  const nearFullWidth = width >= workArea.width - 2
  const nearFullHeight = height >= workArea.height - 2

  if (nearFullWidth || nearFullHeight) {
    const targetWidth = Math.max(minWidth, Math.min(workArea.width - 120, Math.floor(workArea.width * 0.9)))
    const targetHeight = Math.max(minHeight, Math.min(workArea.height - 120, Math.floor(workArea.height * 0.88)))

    width = Math.min(targetWidth, workArea.width)
    height = Math.min(targetHeight, workArea.height)
    x = Math.round(workArea.x + (workArea.width - width) / 2)
    y = Math.round(workArea.y + (workArea.height - height) / 2)
  }

  return { x, y, width, height }
}

function isWindowBoundsFillingWorkArea(win) {
  // Transparent frameless windows on Windows do not report isMaximized()
  // reliably, so fall back to comparing bounds against the work area.
  const bounds = win.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  return (
    bounds.x <= workArea.x &&
    bounds.y <= workArea.y &&
    bounds.x + bounds.width >= workArea.x + workArea.width - 2 &&
    bounds.y + bounds.height >= workArea.y + workArea.height - 2
  )
}

function isWindowExpanded(win) {
  const isSnapped = typeof win.isSnapped === 'function' ? win.isSnapped() : false
  return win.isMaximized() || win.isFullScreen() || isSnapped || isWindowBoundsFillingWorkArea(win)
}

function isWindowBoundsFillingDisplay(win) {
  // Transparent frameless windows on Windows cannot use real OS fullscreen
  // (isFullScreen()/setFullScreen are unreliable), so fullscreen is emulated
  // with bounds that cover the entire display, including the taskbar area.
  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds).bounds
  return (
    bounds.x <= display.x &&
    bounds.y <= display.y &&
    bounds.x + bounds.width >= display.x + display.width - 1 &&
    bounds.y + bounds.height >= display.y + display.height - 1
  )
}

function toggleWindowFullscreen(win) {
  if (win.isFullScreen()) {
    win.setFullScreen(false)
    return
  }

  if (isWindowBoundsFillingDisplay(win)) {
    const restoreBounds = windowRestoreBoundsById.get(win.id) || getSafeRestoreBounds(win)
    if (win.isMaximized()) {
      win.unmaximize()
    }
    win.setBounds(restoreBounds)
    return
  }

  if (!isWindowExpanded(win)) {
    windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
  }
  if (win.isMaximized()) {
    win.unmaximize()
  }
  win.setBounds(screen.getDisplayMatching(win.getBounds()).bounds)
}

registerIpcHandlers({
  ipcMain,
  answerQueue,
  runPythonBridgeWorkerOnly,
  screen,
  isDev: process.env.ELECTRON_DEV === '1',
  isPackaged: app.isPackaged,
  appPageUrl: APP_PAGE_URL,
  getWindowFromSender: BrowserWindow.fromWebContents,
  runPythonBridge,
  runPythonBridgeWithArgs,
  runPythonBridgeIsolated,
  runPythonBridgeCached,
  runPythonBridgeWithArgsCached,
  clearBridgeReadCaches,
  saveStartupTheme,
  normalizeStartupTelemetry,
  recordFirstSummary,
  startupTelemetryByContentsId,
  startupReadyResolvers,
  isWindowExpanded,
  getSafeRestoreBounds,
  windowRestoreBoundsById,
  getLocalTutorRuntime: () => localTutorRuntime,
  localVoiceRuntime,
  speechRuntime: localSpeechRuntime,
  ocrRuntime: localOcrRuntime,
  setupRuntime: localSetupRuntime,
  repoRoot,
  refreshTutorChatRuntime: refreshTutorRuntimeAfterSetup,
  unloadTutorChatRuntime: async () => {
    try {
      await localTutorRuntime.unload('model-uninstall')
    } catch {
      // Best effort: the delete then reports whatever is still holding the file.
    }
  },
  refreshVoiceRuntime: refreshVoiceRuntimeAfterSetup,
  refreshOcrRuntime: refreshOcrRuntimeAfterSetup,
  getPreloadedAssistantChatHistory: () => preloadedAssistantChatHistory,
  /* The tutor is warmed only when the window asks, and it asks only while the tutor chat is switched
     on (audit 11, F3; Robbie: "Only if chat is on"). The warmup also reads back the saved chat
     history, as the launch warmup used to. */
  preloadTutorChat: () => {
    tutorWarmupRequested = true
    return preloadTutorChatStartupData()
  },
  forgetTutorWarmupRequest: () => {
    tutorWarmupRequested = false
  },
  reloadLocalFontsForContents,
  getBridgeTelemetrySnapshot,
  stopPythonBridgeWorker,
  setIsQuitting: () => { isQuitting = true },
})

/* WARM THE TUTOR AND READ BACK ITS SAVED HISTORY, when the window asks (audit 11, F3). Calls that
   arrive while one is running share it; a later call (the chat switched off and on again, or a new
   model) runs again, so the runtime the learner ends up with is the one that was warmed. */
async function preloadTutorChatStartupData() {
  if (tutorRuntimePreloadPromise) {
    return tutorRuntimePreloadPromise
  }
  const runtime = localTutorRuntime
  const run = (async () => {
    let result
    try {
      result = await runtime.preload('renderer-startup')
    } catch (error) {
      preloadedAssistantChatHistory = {
        ok: true,
        turns: [],
        runtimeActive: false,
        source: 'startup-preload-failed',
      }
      throw error
    }

    const status = runtime.getStatus()
    const runtimeActive = Boolean(
      status
      && status.loaded
      && String(status.activeProvider || '').trim().toLowerCase() === 'llama.cpp',
    )
    if (!runtimeActive) {
      preloadedAssistantChatHistory = {
        ok: true,
        turns: [],
        runtimeActive: false,
        source: 'startup-runtime-inactive',
      }
      return result
    }

    try {
      const payload = await runPythonBridgeWithArgs(['assistant-chat-history', '20'])
      const turns = Array.isArray(payload?.turns) ? payload.turns : []
      preloadedAssistantChatHistory = {
        ok: true,
        turns,
        runtimeActive: true,
        source: 'startup-preloaded',
      }
    } catch {
      preloadedAssistantChatHistory = {
        ok: true,
        turns: [],
        runtimeActive: true,
        source: 'startup-history-failed',
      }
    }
    return result
  })()
  tutorRuntimePreloadPromise = run
  try {
    return await run
  } finally {
    if (tutorRuntimePreloadPromise === run) {
      tutorRuntimePreloadPromise = null
    }
  }
}

function createTray(mainWindowRef) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico')
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.warn('Tray icon failed to load from', iconPath)
  }
  const tray = new Tray(icon.isEmpty() ? iconPath : icon)
  tray.setToolTip('JPLearn')

  const buildContextMenu = (dueCount) => {
    const dueLabel = dueCount > 0 ? ` (${dueCount} due)` : ''
    return Menu.buildFromTemplate([
      { label: 'Open JPLearn', click: () => { if (mainWindowRef() && !mainWindowRef().isDestroyed()) { mainWindowRef().show(); mainWindowRef().focus() } } },
      { label: `Start Review Session${dueLabel}`, click: () => { if (mainWindowRef() && !mainWindowRef().isDestroyed()) { mainWindowRef().show(); mainWindowRef().focus(); mainWindowRef().webContents.send('tray:action', 'start-session') } } },
      { label: 'View Overview', click: () => { if (mainWindowRef() && !mainWindowRef().isDestroyed()) { mainWindowRef().show(); mainWindowRef().focus(); mainWindowRef().webContents.send('tray:action', 'view-overview') } } },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
    ])
  }

  tray.setContextMenu(buildContextMenu(0))
  tray.on('click', () => {
    if (mainWindowRef() && !mainWindowRef().isDestroyed()) {
      mainWindowRef().show()
      mainWindowRef().focus()
    }
  })

  async function refreshDueCount() {
    try {
      // The cached read: it is cleared after every answer save and lives 30 s, so the due count is
      // at most that old, and a refresh no longer rebuilds every deck on the worker (audit 7 nit 1).
      const summary = await runPythonBridgeCached('summary')
      const totalDue = remainingDue(summary)
      tray.setToolTip(totalDue > 0 ? `JPLearn — ${totalDue} cards due` : 'JPLearn')
      tray.setContextMenu(buildContextMenu(totalDue))
    } catch { /* non-fatal */ }
  }

  setTimeout(refreshDueCount, 65_000)
  setInterval(refreshDueCount, 300_000)

  return { tray, refreshDueCount }
}

function createWindow() {
  const winWidth = 1280
  const winHeight = 820

  const win = new BrowserWindow({
    title: 'JPLearn',
    frame: false,
    width: winWidth,
    height: winHeight,
    minWidth: winWidth,
    minHeight: winHeight,
    maxWidth: winWidth,
    maxHeight: winHeight,
    resizable: false,
    maximizable: false,
    show: false,
    autoHideMenuBar: true,
    transparent: true,
    fullscreenable: false,
    center: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn('Blocked window.open request', { url })
    return { action: 'deny' }
  })

  win.webContents.on('before-input-event', (event, input) => {
    const isF11 = input.type === 'keyDown' && input.key === 'F11'
    const isAltEnter = input.type === 'keyDown' && input.key === 'Enter' && input.alt

    if (!isF11 && !isAltEnter) {
      return
    }

    event.preventDefault()
    toggleWindowFullscreen(win)
  })

  const pushWindowState = () => {
    const isExpanded = isWindowExpanded(win)
    windowExpandedStateById.set(win.id, isExpanded)
    if (!win.isDestroyed()) {
      win.webContents.send('window:state-changed', { isMaximized: isExpanded })
    }
  }

  windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
  pushWindowState()
  win.on('maximize', pushWindowState)
  win.on('unmaximize', pushWindowState)
  win.on('enter-full-screen', pushWindowState)
  win.on('leave-full-screen', pushWindowState)
  win.on('move', () => {
    if (win.isNormal()) {
      if (!isWindowExpanded(win)) {
        windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
      }
      pushWindowState()
    }
  })
  win.on('resize', () => {
    if (win.isNormal()) {
      if (!isWindowExpanded(win)) {
        windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
      }
      pushWindowState()
    }
  })
  win.on('closed', () => {
    windowExpandedStateById.delete(win.id)
    windowRestoreBoundsById.delete(win.id)
  })

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  return win
}

function createSplashWindow(themeKey) {
  const palette = getSplashPalette(themeKey)
  if (!palette.glowC) palette.glowC = palette.glowA || 'transparent'
  const splash = new BrowserWindow({
    width: 440,
    height: 340,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const splashHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Starting JPLearn</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: 'Kiwi Maru', 'Segoe UI', 'Noto Sans', sans-serif;
        background: ${palette.bgA};
        color: ${palette.title};
        overflow: hidden;
      }
.stage {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 12% 8%, ${palette.glowA}, transparent 42%),
        radial-gradient(circle at 85% 15%, ${palette.glowC}, transparent 40%),
        radial-gradient(circle at 82% 84%, ${palette.glowB}, transparent 44%),
        linear-gradient(165deg, ${palette.bgB}, ${palette.bgA});
      z-index: 0;
      /* Removed border-radius: 24px; */
    }
      .stage::before {
        content: '';
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, 0.04) 2px,
          rgba(0, 0, 0, 0.04) 3px
        );
        opacity: 0.8;
        pointer-events: none;
        z-index: 10;
      }
      .stage::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse at center,
          transparent 50%,
          rgba(0, 0, 0, 0.03) 100%
        );
        pointer-events: none;
        z-index: 11;
      }
      .content {
        position: relative;
        z-index: 20;
        width: min(360px, 90vw);
        text-align: center;
        padding: 24px;
      }
      .brand {
        font-family: 'IBM Plex Mono', 'Consolas', monospace;
        font-size: 0.52rem;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        font-weight: 700;
        margin: 0 0 12px;
        color: ${palette.accent};
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.35rem;
        font-weight: 650;
        letter-spacing: 0.04em;
        font-family: 'Kiwi Maru', 'Segoe UI', 'Noto Sans', sans-serif;
        color: ${palette.title};
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
      .status-detail {
        font-family: 'IBM Plex Mono', 'Consolas', monospace;
        font-size: 0.68rem;
        letter-spacing: 0.02em;
        color: ${palette.subtitle};
        margin: 0 0 24px;
        min-height: 1.35em;
      }
      .progress {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.06);
        overflow: hidden;
      }
      .progress-fill {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, ${palette.accent} 74%, white),
          ${palette.accent}
        );
        box-shadow: 0 0 14px color-mix(in srgb, ${palette.accent} 46%, transparent);
        transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      /* ── REC indicator dot ── */
      .rec-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ff4444;
        vertical-align: middle;
        margin-right: 6px;
        animation: recPulse 1.2s ease-in-out infinite;
        box-shadow: 0 0 6px rgba(255, 68, 68, 0.6);
      }
      @keyframes recPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      /* ── Corner accents ── */
      .corner {
        position: absolute;
        width: 44px;
        height: 44px;
        z-index: 12;
        opacity: 0.4;
        pointer-events: none;
      }
      .corner::before,
      .corner::after {
        content: '';
        position: absolute;
        background: ${palette.accent};
        border-radius: 1px;
      }
      .corner-tl { top: 10px; left: 10px; }
      .corner-tl::before { top: 0; left: 0; width: 28px; height: 2px; }
      .corner-tl::after  { top: 0; left: 0; width: 2px; height: 28px; }
      .corner-tr { top: 10px; right: 10px; }
      .corner-tr::before { top: 0; right: 0; width: 28px; height: 2px; }
      .corner-tr::after  { top: 0; right: 0; width: 2px; height: 28px; }
      .corner-bl { bottom: 10px; left: 10px; }
      .corner-bl::before { bottom: 0; left: 0; width: 28px; height: 2px; }
      .corner-bl::after  { bottom: 0; left: 0; width: 2px; height: 28px; }
      .corner-br { bottom: 10px; right: 10px; }
      .corner-br::before { bottom: 0; right: 0; width: 28px; height: 2px; }
      .corner-br::after  { bottom: 0; right: 0; width: 2px; height: 28px; }
      /* ── Floating crystals ── */
      .crystal {
        position: absolute;
        pointer-events: none;
        z-index: 1;
        width: 8px;
        height: 8px;
        background: ${palette.accent};
        opacity: 0.25;
        animation: crystalFloat 6s ease-in-out infinite;
      }
      .crystal::after {
        content: '';
        position: absolute;
        inset: -2px;
        border: 1px solid color-mix(in srgb, ${palette.accent} 40%, transparent);
        transform: rotate(45deg);
        opacity: 0.5;
      }
      .crystal-a { top: 18%; right: 12%; }
      .crystal-b { bottom: 22%; left: 8%; animation-delay: -2s; width: 6px; height: 6px; }
      @keyframes crystalFloat {
        0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.25; }
        50% { transform: translateY(-8px) rotate(180deg); opacity: 0.4; }
      }
      /* ── Equalizer bars ── */
      .eq {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 12px;
        margin-top: 16px;
      }
      .eq span {
        width: 3px;
        background: ${palette.accent};
        border-radius: 1px;
        animation: eqBounce 0.6s ease-in-out alternate infinite;
      }
      .eq span:nth-child(1) { height: 5px; animation-delay: 0s; }
      .eq span:nth-child(2) { height: 8px; animation-delay: 0.15s; }
      .eq span:nth-child(3) { height: 4px; animation-delay: 0.3s; }
      .eq span:nth-child(4) { height: 10px; animation-delay: 0.45s; }
      @keyframes eqBounce {
        0% { transform: scaleY(0.4); }
        100% { transform: scaleY(1); }
      }
      /* ── VHS tracking line ── */
      .vhs-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        pointer-events: none;
        z-index: 13;
        background: linear-gradient(90deg, transparent, ${palette.accent}, transparent);
        opacity: 0.18;
        animation: vhsDrift 7s linear infinite;
      }
      @keyframes vhsDrift {
        0% { top: 0%; }
        100% { top: 100%; }
      }
      @keyframes contentIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .content {
        animation: contentIn 260ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
      }
    </style>
  </head>
  <body>
    <div class="stage" aria-hidden="true">
      <div class="corner corner-tl" aria-hidden="true"></div>
      <div class="corner corner-tr" aria-hidden="true"></div>
      <div class="corner corner-bl" aria-hidden="true"></div>
      <div class="corner corner-br" aria-hidden="true"></div>
      <div class="crystal crystal-a" aria-hidden="true"></div>
      <div class="crystal crystal-b" aria-hidden="true"></div>
      <div class="vhs-line" aria-hidden="true"></div>
    </div>
    <section class="content" aria-label="Startup status">
      <p class="brand"><span class="rec-dot" aria-hidden="true"></span>JPLearn Desktop</p>
      <h1 id="startup-title">Starting JPLearn...</h1>
      <p id="startup-detail" class="status-detail" aria-live="polite">Loading decks, stats, and bridge services.</p>
      <div class="progress" aria-hidden="true"><div id="startup-progress-fill" class="progress-fill"></div></div>
      <div class="eq" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    </section>
    <script>
      window.__setSplashStatus = function(title, detail, pct) {
        const heading = document.getElementById('startup-title')
        const bodyEl = document.getElementById('startup-detail')
        const fill = document.getElementById('startup-progress-fill')
        if (heading && typeof title === 'string' && title.trim().length > 0) {
          heading.textContent = title
        }
        if (bodyEl && typeof detail === 'string' && detail.trim().length > 0) {
          bodyEl.textContent = detail
        }
        if (fill) {
          const numericPct = Number.isFinite(Number(pct)) ? Number(pct) : 0
          const clampedPct = Math.max(0, Math.min(100, numericPct))
          fill.style.width = clampedPct + '%'
        }
      }
    </script>
  </body>
</html>`

  splash.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`)
  splash.once('ready-to-show', () => splash.show())

  return splash
}

function updateSplashStatus(splash, title, detail, pct = 0) {
  if (!splash || splash.isDestroyed()) return

  const safeTitle = typeof title === 'string' ? title : 'Starting JPLearn...'
  const safeDetail = typeof detail === 'string' ? detail : 'Loading...'
  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.floor(pct))) : 0

  splash.webContents.executeJavaScript(
    `window.__setSplashStatus(${JSON.stringify(safeTitle)}, ${JSON.stringify(safeDetail)}, ${safePct});`,
    true,
  ).catch(() => undefined)
}

function loadMainWindow(win) {
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url, process.env.ELECTRON_DEV === '1', APP_PAGE_URL)) {
      event.preventDefault()
      console.warn('Blocked renderer navigation', { url })
    }
  })

  if (process.env.ELECTRON_DEV === '1') {
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('Renderer failed to load (dev)', {
        errorCode,
        errorDescription,
        validatedURL,
      })
    })
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
    return
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load (prod)', {
      errorCode,
      errorDescription,
      validatedURL,
      expectedFile: path.join(__dirname, '..', 'dist', 'index.html'),
    })
  })

  win.on('page-title-updated', (event) => {
    event.preventDefault()
    win.setTitle('JPLearn')
  })

  // JPLEARN_VALLEY=off suppresses the 3D menu backdrop. It travels as a query rather than an env
  // read in the renderer because the flag has to be visible to the very first script that runs,
  // which is what makes an honest with/without boot comparison possible from one build.
  //
  // JPLEARN_VALLEY_QUERY carries the rest of them. Every subsystem in the valley has a switch of
  // its own -- `rays=off`, `water=off`, `crowd=off`, `hour=21:30` -- and until now none of them
  // could be reached in a packaged build, which meant the with/without measurement each one exists
  // for could only be taken by editing source and rebuilding. Given as a plain query string
  // ("crowd=off&hour=7.5") and merged under the flag above.
  const valleyQuery = {}
  for (const [k, v] of new URLSearchParams((process.env.JPLEARN_VALLEY_QUERY || '').trim())) {
    valleyQuery[k] = v
  }
  if ((process.env.JPLEARN_VALLEY || '').trim() === 'off') valleyQuery.valley = 'off'
  win.loadFile(
    APP_PAGE_PATH,
    Object.keys(valleyQuery).length ? { query: valleyQuery } : undefined,
  )

  // Inject locally downloaded fonts from the assets store if available.
  // Falls back to system fonts silently — no user action needed.
  win.webContents.on('did-finish-load', () => {
    const fontsDir = path.join(
      process.env.JPLEARN_ASSETS_DIR || process.env.JPLEARN_USER_DATA_DIR || process.env.JPLEARN_DOCUMENTS_DIR || '',
      'fonts',
    )
    try {
      const fontCSS = loadFontCSS(fontsDir)
      if (fontCSS) {
        win.webContents.insertCSS(fontCSS).catch(() => {})
      }
    } catch {
      // Non-fatal: app works with system fonts as fallback
    }
  })
}

async function runStudyJourneySmokeIfEnabled() {
  if (process.env.JPLEARN_SMOKE_JOURNEY !== '1') {
    return
  }

  const slug = (process.env.JPLEARN_SMOKE_DECK || 'hiragana').trim().toLowerCase()
  const minigame = (process.env.JPLEARN_SMOKE_MINIGAME || 'context_cloze').trim().toLowerCase() || 'context_cloze'
  const shouldResetDb = process.env.JPLEARN_SMOKE_RESET_DB !== '0'
  const sessionId = `smoke-${Date.now()}`
  const startedAt = Date.now()
  const steps = []

  const recordStep = (name, detail) => {
    steps.push({
      name,
      detail,
      recordedAtUtc: new Date().toISOString(),
    })
  }

  const report = {
    capturedAtUtc: new Date().toISOString(),
    slug,
    minigame,
    sessionId,
    ok: false,
    durationMs: 0,
    steps,
    error: null,
  }

  try {
    if (shouldResetDb) {
      const resetPayload = await runPythonBridge('reset-db')
      if (!resetPayload || resetPayload.ok !== true) {
        throw new Error(`reset-db returned unexpected payload: ${JSON.stringify(resetPayload)}`)
      }
      recordStep('reset-db', { ok: true })
    }

    const summaryPayload = await runPythonBridge('summary')
    const decks = Array.isArray(summaryPayload?.decks) ? summaryPayload.decks : []
    const deckExists = decks.some((deck) => deck && deck.slug === slug)
    if (!deckExists) {
      throw new Error(`Deck slug not found in summary payload: ${slug}`)
    }
    recordStep('summary', { deckCount: decks.length })

    const cardsPayload = await runPythonBridgeWithArgs(['deck-cards', slug])
    const cards = Array.isArray(cardsPayload?.cards) ? cardsPayload.cards : []
    const firstCard = cards.find((card) => card && Number.isFinite(card.id))
    if (!firstCard) {
      throw new Error(`No playable cards available for slug: ${slug}`)
    }
    recordStep('deck-cards', {
      cardCount: cards.length,
      firstCardId: firstCard.id,
    })

    const startGoalPayload = await runPythonBridgeWithArgs(['session-start', '1', '', '', sessionId])
    if (!startGoalPayload || startGoalPayload.ok !== true) {
      throw new Error(`session-start returned unexpected payload: ${JSON.stringify(startGoalPayload)}`)
    }
    recordStep('session-start', {
      goal: startGoalPayload.goal || null,
    })

    const recordResultPayload = await runPythonBridgeWithArgs([
      'record-result',
      slug,
      String(firstCard.id),
      '1',
      minigame,
      '1',
      sessionId,
      '4',
    ])
    if (!recordResultPayload || recordResultPayload.ok !== true) {
      throw new Error(`record-result returned unexpected payload: ${JSON.stringify(recordResultPayload)}`)
    }
    recordStep('record-result', {
      cardId: recordResultPayload.card_id,
      repetitions: recordResultPayload.repetitions,
      interval: recordResultPayload.interval,
    })

    const sessionSummaryPayload = await runPythonBridgeWithArgs(['session-summary', sessionId])
    if (!sessionSummaryPayload || sessionSummaryPayload.ok !== true) {
      throw new Error(`session-summary returned unexpected payload: ${JSON.stringify(sessionSummaryPayload)}`)
    }
    const summary = sessionSummaryPayload.summary || null
    const completedItems = summary && typeof summary.completed_items === 'number' ? summary.completed_items : 0
    if (completedItems < 1) {
      throw new Error(`Session summary did not record reviewed items for session: ${sessionId}`)
    }
    recordStep('session-summary', {
      completedItems,
      accuracy: summary?.accuracy ?? null,
      goalMet: summary?.goal_met ?? null,
    })

    report.ok = true
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    report.error = detail
    console.error(`Study journey smoke failed: ${detail}`)
  } finally {
    report.durationMs = Date.now() - startedAt
    writeStudyJourneySmoke(report)
  }
}

// taskTimings is filled as each task ends, so a caller that stops waiting still has what finished.
async function preloadStartupBridgeData(splash, taskTimings = []) {
  updateSplashStatus(splash, 'Loading study data...', 'Preparing your decks and stats...', STARTUP_PRELOAD_PROGRESS_START_PCT)

  const startedAt = Date.now()

  /* THE VOICE WARMUP RUNS BESIDE THE BRIDGE TASKS, NOT IN FRONT OF THEM. It starts VOICEVOX, its own
     process that never touches the Python bridge, and it takes 3-8 s. As the first task of a serial
     list it held every bridge read behind it -- the renderer's first summary waited for it too, and
     that summary's time tracked the warmup's run for run (#82's first readings: 4.0 s behind a 3.2 s
     warmup, 7.4 s behind 8.0 s). The splash still waits for it, inside the same time budget. */
  const voiceWarmup = (async () => {
    // Voice warmup is best-effort; listening modes stay locked when unavailable.
    let ready = false
    let error = null
    try {
      ready = (await localVoiceRuntime.preload())?.ready === true
      if (!ready) error = localVoiceRuntime.getStatus?.()?.lastError || 'VOICEVOX did not start'
    } catch (voiceError) {
      error = voiceError instanceof Error ? voiceError.message : String(voiceError)
    }
    return { key: 'voice-runtime-preload', label: 'Voice runtime warmup', durationMs: Date.now() - startedAt, ok: ready, error }
  })()

  const preloadTasks = [
    {
      key: 'summary',
      label: 'Study summary',
      run: () => runPythonBridgeCached('summary'),
    },
    {
      key: 'overview-character-mastery',
      label: 'Character mastery',
      run: () => runPythonBridgeCached('overview-character-mastery'),
    },
    {
      key: 'xp-progress',
      label: 'XP progress',
      run: () => runPythonBridgeCached('xp-progress'),
    },
    {
      key: 'recommendations',
      label: 'Recommendations',
      run: () => runPythonBridgeCached('recommendations'),
    },
    {
      key: 'learning-path-status',
      label: 'Learning path status',
      run: () => runPythonBridgeCached('learning-path-status'),
    },
    {
      key: 'assistant-snapshot',
      label: 'Assistant snapshot',
      run: () => runPythonBridgeCached('assistant-snapshot'),
    },
  ]

  for (const slug of STARTUP_PRELOAD_DECK_SLUGS) {
    preloadTasks.push({
      key: `deck-cards:${slug}`,
      label: `Deck cards: ${slug}`,
      run: () => runPythonBridgeWithArgsCached(['deck-cards', slug]),
    })
    preloadTasks.push({
      key: `block-progress:${slug}`,
      label: `Block progress: ${slug}`,
      run: () => runPythonBridgeWithArgsCached(['block-progress', slug]),
    })
  }

  for (const slug of STARTUP_PRELOAD_BLOCK_ONLY_SLUGS) {
    preloadTasks.push({
      key: `block-progress:${slug}`,
      label: `Block progress: ${slug}`,
      run: () => runPythonBridgeWithArgsCached(['block-progress', slug]),
    })
  }

  const totalTasks = preloadTasks.length

  for (let index = 0; index < totalTasks; index += 1) {
    const task = preloadTasks[index]
    const ordinal = index + 1
    const pctRange = STARTUP_PRELOAD_PROGRESS_END_PCT - STARTUP_PRELOAD_PROGRESS_START_PCT
    const pct = STARTUP_PRELOAD_PROGRESS_START_PCT + Math.floor((ordinal / totalTasks) * pctRange)

    updateSplashStatus(
      splash,
      'Loading study data...',
      `Loading ${task.label} (${ordinal}/${totalTasks})...`,
      pct,
    )

    const taskStartedAt = Date.now()
    let ok = true
    let error = null

    try {
      await task.run()
    } catch (taskError) {
      ok = false
      error = taskError instanceof Error ? taskError.message : String(taskError)
    }

    const durationMs = Date.now() - taskStartedAt
    taskTimings.push({
      key: task.key,
      label: task.label,
      durationMs,
      ok,
      error,
    })

    const completionLabel = ok ? 'Loaded' : 'Skipped'
    updateSplashStatus(
      splash,
      'Loading study data...',
      `${completionLabel} ${task.label} in ${durationMs}ms (${ordinal}/${totalTasks})`,
      pct,
    )

    if (Date.now() - startedAt >= STARTUP_PRELOAD_MAX_WAIT_MS) {
      taskTimings.push({
        key: 'startup-preload-time-budget',
        label: 'Startup preload time budget reached',
        durationMs: Date.now() - startedAt,
        ok: false,
        error: `Exceeded ${STARTUP_PRELOAD_MAX_WAIT_MS}ms before completing all preload tasks`,
      })
      break
    }
  }

  updateSplashStatus(splash, 'Loading study data...', 'Warming up the voice engine...', STARTUP_PRELOAD_PROGRESS_END_PCT)
  const voiceBudgetMs = Math.max(0, STARTUP_PRELOAD_MAX_WAIT_MS - (Date.now() - startedAt))
  let voiceBudgetTimer = null
  const voiceTiming = await Promise.race([
    voiceWarmup,
    new Promise((resolve) => { voiceBudgetTimer = setTimeout(() => resolve({
      key: 'voice-runtime-preload',
      label: 'Voice runtime warmup',
      durationMs: Date.now() - startedAt,
      ok: false,
      error: `Still warming up after the ${STARTUP_PRELOAD_MAX_WAIT_MS}ms preload budget; left running`,
    }), voiceBudgetMs) }),
  ])
  clearTimeout(voiceBudgetTimer)
  taskTimings.unshift(voiceTiming)

  return {
    totalDurationMs: Date.now() - startedAt,
    taskTimings,
  }
}

async function createWindowWithSplash() {
  const minSplashMs = 1100
  const maxStartupWaitMs = 30000
  const startupSessionStartedAt = Date.now()
  const startupTheme = readSavedStartupTheme()
  const splash = createSplashWindow(startupTheme)
  const win = createWindow()
  const webContentsId = win.webContents.id

  updateSplashStatus(splash, 'Starting JPLearn...', 'Preparing desktop window...', 8)

  startupTelemetryByContentsId.set(webContentsId, {
    main: {
      startupSessionStartedAt,
      startupTheme,
      maxStartupWaitMs,
    },
  })

  const startupReadyPromise = new Promise((resolve) => {
    startupReadyResolvers.set(webContentsId, resolve)
  })

  win.on('closed', () => {
    startupReadyResolvers.delete(webContentsId)
    startupTelemetryByContentsId.delete(webContentsId)
  })

  updateSplashStatus(splash, 'Loading interface...', 'Booting renderer and UI shell...', 44)
  loadMainWindow(win)

  const windowReadyPromise = new Promise((resolve) => {
    win.once('ready-to-show', resolve)
  })

  const preloadTaskTimings = []
  const startupBridgePreloadPromise = preloadStartupBridgeData(splash, preloadTaskTimings).catch(() => ({
    totalDurationMs: null,
    taskTimings: [],
  }))

  const rendererStartupPromise = Promise.all([
    windowReadyPromise,
    Promise.race([
      startupReadyPromise,
      new Promise((resolve) => setTimeout(resolve, maxStartupWaitMs)),
    ]),
  ]).then(() => {
    updateSplashStatus(splash, 'Finalizing startup...', 'Preparing your first screen...', 92)
  })

  /* ONE DEADLINE FOR THE WHOLE SPLASH (audit 11, F4). The preload checks its budget only between
     tasks, and a task that falls back to a one-shot process has no time limit, so a hung read could
     keep the splash up for good. Past the deadline the window shows and anything still running is
     left to finish behind it. */
  let startupDeadlineTimer = null
  const startupDeadline = new Promise((resolve) => {
    startupDeadlineTimer = setTimeout(() => resolve(null), maxStartupWaitMs)
  })
  const startupGates = await Promise.race([
    Promise.all([
      rendererStartupPromise,
      startupBridgePreloadPromise,
      new Promise((resolve) => setTimeout(resolve, minSplashMs)),
    ]),
    startupDeadline,
  ])
  clearTimeout(startupDeadlineTimer)
  const preloadTelemetry = startupGates
    ? startupGates[1]
    : {
        totalDurationMs: null,
        // the tasks that finished, then the deadline (audit 11 review, finding 5)
        taskTimings: [...preloadTaskTimings, {
          key: 'startup-deadline',
          label: 'Startup deadline reached',
          durationMs: Date.now() - startupSessionStartedAt,
          ok: false,
          error: `The window was shown after ${maxStartupWaitMs}ms with startup still running`,
        }],
      }

  const startupSessionCompletedAt = Date.now()
  const startupSessionMs = startupSessionCompletedAt - startupSessionStartedAt
  const telemetryContext = startupTelemetryByContentsId.get(webContentsId) || {}
  const rendererTelemetry = (telemetryContext.renderer || typeof telemetryContext.firstSummaryMs === 'number')
    ? { ...(telemetryContext.renderer || {}), firstSummaryMs: telemetryContext.firstSummaryMs ?? null }
    : null

  const startupTelemetry = {
    capturedAtUtc: new Date().toISOString(),
    budgetsMs: STARTUP_BUDGETS_MS,
    main: {
      startupSessionStartedAt,
      startupSessionCompletedAt,
      startupSessionMs,
      startupTheme,
      startupPreloadMs: Number.isFinite(preloadTelemetry?.totalDurationMs)
        ? preloadTelemetry.totalDurationMs
        : null,
    },
    renderer: rendererTelemetry,
    bridge: getBridgeTelemetrySnapshot(),
    preload: {
      maxWaitMs: STARTUP_PRELOAD_MAX_WAIT_MS,
      tasks: Array.isArray(preloadTelemetry?.taskTimings) ? preloadTelemetry.taskTimings : [],
    },
  }
  writeStartupTelemetry(startupTelemetry)
  /* kept, so a first summary that lands after this point can be written into the same file */
  telemetryContext.written = startupTelemetry

  if (rendererTelemetry && typeof rendererTelemetry.startupReadyMs === 'number' && rendererTelemetry.startupReadyMs > STARTUP_BUDGETS_MS.startupReady) {
    console.warn(
      `Startup budget exceeded: renderer startup-ready in ${rendererTelemetry.startupReadyMs}ms (budget ${STARTUP_BUDGETS_MS.startupReady}ms)`,
    )
  }
  warnIfFirstSummaryOverBudget(rendererTelemetry?.firstSummaryMs)

  updateSplashStatus(splash, 'Welcome', 'Ready to study.', 100)

  if (!splash.isDestroyed()) {
    splash.close()
  }
  if (!win.isDestroyed()) {
    win.setOpacity(0)
    win.show()
    win.focus()
    const fadeSteps = 6
    const fadeInterval = 22
    let step = 0
    const timer = setInterval(() => {
      step += 1
      const opacity = Math.min(1, step / fadeSteps)
      if (!win.isDestroyed()) {
        win.setOpacity(opacity)
      }
      if (step >= fadeSteps) {
        clearInterval(timer)
      }
    }, fadeInterval)

  }

  win.on('closed', () => {
    if (!splash.isDestroyed()) {
      splash.close()
    }
  })

  void runStudyJourneySmokeIfEnabled()

  return win
}

/* ONE COPY AT A TIME (audit 7 F4). Closing the window only hides it in the tray, so a launch from
   the Start menu started a second copy: a second tray icon, duplicate notifications and a second
   Python bridge on the same database. Robbie's call: the new launch quits and the running copy
   comes forward. The lock is taken before the bridge spawn below, so a losing copy starts none. */
const hasSingleInstanceLock = _squirrelArg ? true : app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
    if (!win) {
      return
    }
    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
  })
}

/* THE PYTHON BRIDGE STARTS NOW, NOT WHEN THE FIRST SCREEN ASKS FOR IT. Its first answer costs a
   Python start and about a second of imports before any command runs, and the first command is the
   study summary every screen waits on. Spawned from the preload it began 1-3 s into the launch,
   after Electron's own start, so the two costs queued; started here they overlap. The worker only
   reads stdin, so it sits idle until asked, and JPLEARN_DOCUMENTS_DIR is already set above. Not on
   a Squirrel install/update/uninstall run, which exits without a window. */
if (!_squirrelArg && hasSingleInstanceLock) {
  try {
    getOrStartPythonBridgeWorker()
  } catch {
    // The first request starts it instead, as before.
  }
}

function installPermissionHandlers() {
  const isDev = process.env.ELECTRON_DEV === '1'
  // A request names its media types; a check names one (`mediaType`, 'unknown' when it is not yet
  // known, which the request that follows settles).
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isRendererPermissionAllowed({
      permission,
      url: details?.requestingUrl || webContents?.getURL(),
      mediaTypes: details?.mediaTypes,
      isDev,
      appPageUrl: APP_PAGE_URL,
    }))
  })
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details) => {
    const mediaType = details?.mediaType
    return isRendererPermissionAllowed({
      permission,
      url: details?.requestingUrl || webContents?.getURL(),
      mediaTypes: permission === 'media' ? [mediaType === 'unknown' || !mediaType ? 'audio' : mediaType] : undefined,
      isDev,
      appPageUrl: APP_PAGE_URL,
    })
  })
}

app.whenReady().then(async () => {
  installPermissionHandlers()
  // Ensure Documents\JPLearn\ subdirectories exist on every launch
  try { localSetupRuntime.ensureJPLearnDirs() } catch { /* non-fatal */ }
  // If bundled voice profiles are present, seed missing ones into Documents once.
  try {
    localSetupRuntime.seedBundledVoiceProfiles()
  } catch { /* non-fatal */ }
  // Auto-update check (GitHub Releases); safe no-op in dev, unconfigured, or user-disabled.
  try {
    const autoUpdateEnabled = await getConfigValue('autoUpdateEnabled')
    if (autoUpdateEnabled) {
      initAutoUpdater({ isPackaged: app.isPackaged })
    }
  } catch { /* non-fatal */ }

  // Apply auto-start setting
  try {
    const autoStartOnLogin = await getConfigValue('autoStartOnLogin')
    app.setLoginItemSettings({ openAtLogin: autoStartOnLogin })
  } catch { /* non-fatal */ }

  void createWindowWithSplash()

  // Create system tray after window setup
  const getMainWindow = () => {
    const windows = BrowserWindow.getAllWindows()
    return windows.length > 0 ? windows[0] : null
  }
  appTray = createTray(getMainWindow)

  // ── Due-review notification check (fire once per launch) ─────────────────────
  let dueReviewNotified = false
  async function checkAndNotifyDueReviews() {
    if (dueReviewNotified) return
    try {
      const enabled = await getConfigValue('notificationsEnabled')
      if (!enabled) return
    } catch { return }

    let mainWindow = null
    try {
      const windows = BrowserWindow.getAllWindows()
      mainWindow = windows.length > 0 ? windows[0] : null
    } catch { /* continue without window reference */ }

    // Don't notify if the user is actively looking at the app
    if (mainWindow && mainWindow.isFocused()) return

    try {
      const summary = await runPythonBridge('summary')
      const totalDue = remainingDue(summary)
      if (totalDue >= 1) {
        dueReviewNotified = true
        const n = new Notification({
          title: 'JPLearn',
          body: `You have ${totalDue} cards due for review today`,
          silent: false,
        })
        n.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
          }
        })
      }
    } catch { /* non-fatal — bridge may not be ready yet */ }
  }
  setTimeout(checkAndNotifyDueReviews, 60_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindowWithSplash()
    }
  })
})

const mayQuitWithWaitingAnswers = createUnsavedAnswersQuitGuard({
  queue: answerQueue,
  showMessageBox: (options) => dialog.showMessageBox(options),
  quit: () => {
    isQuitting = true
    app.quit()
  },
  cancelQuit: () => { isQuitting = false },
})

app.on('before-quit', (event) => {
  // Answers waiting to save live only in memory (answer_queue.cjs). Ask before losing them; nothing
  // below runs -- the bridge stays up -- until the learner chooses to quit anyway.
  if (!mayQuitWithWaitingAnswers()) {
    event.preventDefault()
    return
  }
  isQuitting = true
  void localTutorRuntime.unload('before-quit').catch(() => undefined)
  void localVoiceRuntime.unload().catch(() => undefined)
  void Promise.resolve(localSpeechRuntime.unload()).catch(() => undefined)
  void Promise.resolve(localOcrRuntime.unload()).catch(() => undefined)
  writeBridgeTelemetry()
  stopPythonBridgeWorker()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !appTray) {
    app.quit()
  }
})
