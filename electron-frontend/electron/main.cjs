const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { registerIpcHandlers } = require('./ipc_handlers.cjs')
const {
  isAllowedRendererUrl,
} = require('./ipc_security.cjs')

const repoRoot = path.join(__dirname, '..', '..')
const startupReadyResolvers = new Map()
const startupTelemetryByContentsId = new Map()
const windowExpandedStateById = new Map()
const windowRestoreBoundsById = new Map()
const bridgeReadCache = new Map()
const bridgeReadInFlight = new Map()
const bridgeWorkerState = {
  child: null,
  nextRequestId: 1,
  buffer: '',
  pending: new Map(),
  stderr: '',
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
}
const BRIDGE_REQUEST_TIMEOUT_MS = 30000
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
const STARTUP_BUDGETS_MS = {
  startupReady: 5000,
  firstSummary: 2500,
}
const FORCED_USER_DATA_DIR = process.env.JPLEARN_USER_DATA_DIR
const DEFAULT_STARTUP_THEME = 'harbor_mist'
const VALID_STARTUP_THEMES = new Set([
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
])

if (FORCED_USER_DATA_DIR) {
  app.setPath('userData', FORCED_USER_DATA_DIR)
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

function getBridgeTelemetrySnapshot() {
  return {
    ...bridgeTelemetry,
    capturedAtUtc: new Date().toISOString(),
    pendingRequests: bridgeWorkerState.pending.size,
    readCacheEntries: bridgeReadCache.size,
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
    firstSummaryMs: toFiniteNumber(payload.firstSummaryMs),
    deferredLoadsQueuedAtMs: toFiniteNumber(payload.deferredLoadsQueuedAtMs),
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
    harbor_mist: {
      bgA: '#0b1620',
      bgB: '#101f2c',
      glowA: 'rgba(126, 184, 234, 0.28)',
      glowB: 'rgba(112, 198, 190, 0.2)',
      panelA: 'rgba(20, 31, 43, 0.95)',
      panelB: 'rgba(13, 22, 31, 0.93)',
      border: 'rgba(133, 186, 255, 0.36)',
      spinnerTrack: 'rgba(158, 212, 255, 0.24)',
      spinnerHead: '#9ed4ff',
      title: '#eef7ff',
      subtitle: 'rgba(217, 235, 255, 0.82)',
      accent: '#7eb8ea',
    },
    sakura_dawn: {
      bgA: '#1a111a',
      bgB: '#241926',
      glowA: 'rgba(245, 150, 159, 0.3)',
      glowB: 'rgba(142, 200, 232, 0.18)',
      panelA: 'rgba(53, 35, 50, 0.95)',
      panelB: 'rgba(42, 28, 39, 0.93)',
      border: 'rgba(255, 177, 191, 0.42)',
      spinnerTrack: 'rgba(255, 212, 219, 0.25)',
      spinnerHead: '#ffb1bf',
      title: '#f9eef3',
      subtitle: 'rgba(237, 204, 219, 0.84)',
      accent: '#ffb1bf',
    },
    forest_ink: {
      bgA: '#0f1714',
      bgB: '#18251f',
      glowA: 'rgba(116, 207, 176, 0.26)',
      glowB: 'rgba(137, 208, 164, 0.2)',
      panelA: 'rgba(30, 48, 40, 0.95)',
      panelB: 'rgba(24, 39, 33, 0.93)',
      border: 'rgba(140, 222, 177, 0.36)',
      spinnerTrack: 'rgba(178, 235, 201, 0.24)',
      spinnerHead: '#89d0a4',
      title: '#edf5ef',
      subtitle: 'rgba(202, 224, 210, 0.82)',
      accent: '#89d0a4',
    },
    sunset_lacquer: {
      bgA: '#211316',
      bgB: '#2d1a1f',
      glowA: 'rgba(255, 171, 115, 0.28)',
      glowB: 'rgba(244, 139, 116, 0.2)',
      panelA: 'rgba(62, 34, 36, 0.95)',
      panelB: 'rgba(48, 28, 32, 0.93)',
      border: 'rgba(255, 188, 125, 0.4)',
      spinnerTrack: 'rgba(255, 214, 180, 0.25)',
      spinnerHead: '#ffbc7d',
      title: '#fff0ea',
      subtitle: 'rgba(243, 204, 191, 0.84)',
      accent: '#ffab73',
    },
    midnight_neon: {
      bgA: '#0d1021',
      bgB: '#151c34',
      glowA: 'rgba(126, 197, 255, 0.3)',
      glowB: 'rgba(111, 212, 220, 0.2)',
      panelA: 'rgba(28, 38, 74, 0.95)',
      panelB: 'rgba(20, 29, 60, 0.93)',
      border: 'rgba(126, 197, 255, 0.42)',
      spinnerTrack: 'rgba(174, 230, 255, 0.24)',
      spinnerHead: '#79d5ff',
      title: '#eaf3ff',
      subtitle: 'rgba(196, 211, 240, 0.84)',
      accent: '#79d5ff',
    },
    paper_crane: {
      bgA: '#13100e',
      bgB: '#1c1713',
      glowA: 'rgba(212, 165, 125, 0.22)',
      glowB: 'rgba(143, 182, 200, 0.2)',
      panelA: 'rgba(47, 37, 30, 0.95)',
      panelB: 'rgba(36, 28, 23, 0.93)',
      border: 'rgba(177, 143, 111, 0.38)',
      spinnerTrack: 'rgba(230, 195, 164, 0.22)',
      spinnerHead: '#d4a57d',
      title: '#f5ece0',
      subtitle: 'rgba(199, 180, 160, 0.82)',
      accent: '#d4a57d',
    },
    matcha_stone: {
      bgA: '#121912',
      bgB: '#1a241b',
      glowA: 'rgba(132, 196, 159, 0.26)',
      glowB: 'rgba(182, 211, 135, 0.2)',
      panelA: 'rgba(35, 48, 35, 0.95)',
      panelB: 'rgba(28, 38, 28, 0.93)',
      border: 'rgba(182, 211, 135, 0.38)',
      spinnerTrack: 'rgba(210, 230, 172, 0.24)',
      spinnerHead: '#b6d387',
      title: '#edf2e7',
      subtitle: 'rgba(203, 215, 192, 0.82)',
      accent: '#b6d387',
    },
    ocean_glass: {
      bgA: '#0b1720',
      bgB: '#122331',
      glowA: 'rgba(142, 200, 241, 0.3)',
      glowB: 'rgba(121, 213, 204, 0.2)',
      panelA: 'rgba(20, 50, 66, 0.94)',
      panelB: 'rgba(16, 39, 52, 0.92)',
      border: 'rgba(126, 212, 208, 0.4)',
      spinnerTrack: 'rgba(175, 233, 227, 0.24)',
      spinnerHead: '#7ed4d0',
      title: '#eaf8ff',
      subtitle: 'rgba(196, 224, 238, 0.82)',
      accent: '#7ed4d0',
    },
    ember_night: {
      bgA: '#170f12',
      bgB: '#22161a',
      glowA: 'rgba(255, 154, 106, 0.3)',
      glowB: 'rgba(240, 140, 124, 0.2)',
      panelA: 'rgba(49, 30, 35, 0.95)',
      panelB: 'rgba(37, 24, 28, 0.93)',
      border: 'rgba(255, 177, 128, 0.4)',
      spinnerTrack: 'rgba(255, 201, 163, 0.25)',
      spinnerHead: '#ff9a6a',
      title: '#fbeeea',
      subtitle: 'rgba(233, 202, 193, 0.83)',
      accent: '#ff9a6a',
    },
    plum_garden: {
      bgA: '#171220',
      bgB: '#231a30',
      glowA: 'rgba(157, 183, 255, 0.28)',
      glowB: 'rgba(206, 151, 232, 0.22)',
      panelA: 'rgba(45, 34, 62, 0.95)',
      panelB: 'rgba(34, 26, 49, 0.93)',
      border: 'rgba(200, 156, 255, 0.4)',
      spinnerTrack: 'rgba(222, 190, 255, 0.24)',
      spinnerHead: '#c89cff',
      title: '#f4eefb',
      subtitle: 'rgba(215, 202, 236, 0.83)',
      accent: '#c89cff',
    },
    harbor_mist_light: {
      bgA: '#ecf4f9',
      bgB: '#dcebf4',
      glowA: 'rgba(105, 171, 196, 0.24)',
      glowB: 'rgba(99, 184, 188, 0.18)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(243, 250, 255, 0.94)',
      border: 'rgba(99, 146, 171, 0.34)',
      spinnerTrack: 'rgba(118, 175, 199, 0.24)',
      spinnerHead: '#69abc4',
      title: '#1f313e',
      subtitle: 'rgba(85, 115, 132, 0.8)',
      accent: '#69abc4',
    },
    sakura_dawn_light: {
      bgA: '#f8edf1',
      bgB: '#f1e2e9',
      glowA: 'rgba(228, 142, 162, 0.24)',
      glowB: 'rgba(134, 185, 207, 0.18)',
      panelA: 'rgba(255, 252, 255, 0.96)',
      panelB: 'rgba(252, 244, 249, 0.94)',
      border: 'rgba(169, 118, 137, 0.34)',
      spinnerTrack: 'rgba(228, 156, 177, 0.24)',
      spinnerHead: '#e48ea2',
      title: '#3b2a35',
      subtitle: 'rgba(124, 95, 111, 0.8)',
      accent: '#e48ea2',
    },
    sunset_lacquer_light: {
      bgA: '#fbf0ea',
      bgB: '#f5e5dc',
      glowA: 'rgba(221, 140, 98, 0.22)',
      glowB: 'rgba(210, 134, 117, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(254, 247, 243, 0.94)',
      border: 'rgba(168, 118, 95, 0.34)',
      spinnerTrack: 'rgba(226, 163, 110, 0.24)',
      spinnerHead: '#dd8c62',
      title: '#3c2b28',
      subtitle: 'rgba(126, 99, 93, 0.8)',
      accent: '#dd8c62',
    },
    midnight_neon_light: {
      bgA: '#edf2fb',
      bgB: '#dfe7f6',
      glowA: 'rgba(102, 168, 214, 0.22)',
      glowB: 'rgba(109, 187, 194, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(245, 248, 255, 0.94)',
      border: 'rgba(103, 132, 182, 0.34)',
      spinnerTrack: 'rgba(110, 174, 216, 0.24)',
      spinnerHead: '#66a8d6',
      title: '#26314b',
      subtitle: 'rgba(95, 112, 150, 0.8)',
      accent: '#66a8d6',
    },
    paper_crane_light: {
      bgA: '#f4efe8',
      bgB: '#ece4d9',
      glowA: 'rgba(184, 144, 109, 0.22)',
      glowB: 'rgba(126, 168, 186, 0.17)',
      panelA: 'rgba(255, 253, 249, 0.96)',
      panelB: 'rgba(249, 244, 236, 0.94)',
      border: 'rgba(149, 124, 102, 0.34)',
      spinnerTrack: 'rgba(194, 157, 120, 0.24)',
      spinnerHead: '#b8906d',
      title: '#352d27',
      subtitle: 'rgba(114, 98, 87, 0.8)',
      accent: '#b8906d',
    },
    ember_night_light: {
      bgA: '#faefea',
      bgB: '#f3e2dc',
      glowA: 'rgba(216, 131, 111, 0.22)',
      glowB: 'rgba(210, 126, 118, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(253, 245, 241, 0.94)',
      border: 'rgba(169, 114, 103, 0.34)',
      spinnerTrack: 'rgba(225, 160, 119, 0.24)',
      spinnerHead: '#d8836f',
      title: '#402b29',
      subtitle: 'rgba(135, 99, 96, 0.8)',
      accent: '#d8836f',
    },
    forest_ink_light: {
      bgA: '#edf5ef',
      bgB: '#e2efe5',
      glowA: 'rgba(116, 181, 145, 0.22)',
      glowB: 'rgba(124, 174, 207, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(244, 250, 246, 0.94)',
      border: 'rgba(103, 145, 122, 0.34)',
      spinnerTrack: 'rgba(126, 173, 149, 0.24)',
      spinnerHead: '#74b591',
      title: '#203126',
      subtitle: 'rgba(86, 114, 97, 0.8)',
      accent: '#74b591',
    },
    ocean_glass_light: {
      bgA: '#eaf7f8',
      bgB: '#ddf0f3',
      glowA: 'rgba(99, 185, 179, 0.22)',
      glowB: 'rgba(116, 183, 204, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(242, 252, 251, 0.94)',
      border: 'rgba(92, 152, 155, 0.34)',
      spinnerTrack: 'rgba(119, 191, 186, 0.24)',
      spinnerHead: '#63b9b3',
      title: '#1d3237',
      subtitle: 'rgba(79, 114, 122, 0.8)',
      accent: '#63b9b3',
    },
    plum_garden_light: {
      bgA: '#f4effa',
      bgB: '#ece5f6',
      glowA: 'rgba(174, 134, 230, 0.22)',
      glowB: 'rgba(137, 171, 216, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(248, 244, 253, 0.94)',
      border: 'rgba(137, 109, 184, 0.34)',
      spinnerTrack: 'rgba(183, 147, 232, 0.24)',
      spinnerHead: '#ae86e6',
      title: '#322748',
      subtitle: 'rgba(114, 97, 143, 0.8)',
      accent: '#ae86e6',
    },
    matcha_stone_light: {
      bgA: '#f0f5e8',
      bgB: '#e8efdd',
      glowA: 'rgba(159, 191, 112, 0.22)',
      glowB: 'rgba(120, 178, 154, 0.17)',
      panelA: 'rgba(255, 255, 255, 0.96)',
      panelB: 'rgba(248, 252, 242, 0.94)',
      border: 'rgba(128, 150, 92, 0.34)',
      spinnerTrack: 'rgba(164, 195, 117, 0.24)',
      spinnerHead: '#9fbf70',
      title: '#2d3522',
      subtitle: 'rgba(105, 118, 87, 0.8)',
      accent: '#9fbf70',
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

function resolvePythonCommand(projectRoot) {
  const explicit = (process.env.JPLEARN_PYTHON || '').trim()
  if (explicit) {
    return explicit
  }

  const candidates = process.platform === 'win32'
    ? [path.join(projectRoot, '.venv', 'Scripts', 'python.exe')]
    : [path.join(projectRoot, '.venv', 'bin', 'python3'), path.join(projectRoot, '.venv', 'bin', 'python')]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return 'python'
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

function rejectPendingBridgeRequests(error) {
  const pending = Array.from(bridgeWorkerState.pending.values())
  bridgeWorkerState.pending.clear()
  for (const request of pending) {
    clearTimeout(request.timeoutId)
    request.reject(error)
  }
}

function stopPythonBridgeWorker() {
  if (!bridgeWorkerState.child) {
    return
  }

  const child = bridgeWorkerState.child
  bridgeWorkerState.child = null
  try {
    child.kill()
  } catch {
    // Ignore termination errors during shutdown/restart.
  }
}

function getOrStartPythonBridgeWorker() {
  if (bridgeWorkerState.child && !bridgeWorkerState.child.killed) {
    return bridgeWorkerState.child
  }

  const bridgeContext = resolvePythonBridgeContext()
  const pythonCmd = resolvePythonCommand(bridgeContext.projectRoot)
  const bridgeScript = bridgeContext.bridgeScript

  const child = spawn(pythonCmd, [bridgeScript, '--server'], {
    cwd: bridgeContext.projectRoot,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  bridgeWorkerState.child = child
  bridgeWorkerState.buffer = ''
  bridgeWorkerState.stderr = ''
  bridgeTelemetry.workerStarts += 1

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    bridgeWorkerState.buffer += chunk
    while (true) {
      const newlineIndex = bridgeWorkerState.buffer.indexOf('\n')
      if (newlineIndex < 0) {
        break
      }

      const line = bridgeWorkerState.buffer.slice(0, newlineIndex).trim()
      bridgeWorkerState.buffer = bridgeWorkerState.buffer.slice(newlineIndex + 1)
      if (!line) {
        continue
      }

      try {
        const envelope = JSON.parse(line)
        const requestId = envelope.id
        const request = bridgeWorkerState.pending.get(requestId)
        if (!request) {
          continue
        }

        bridgeWorkerState.pending.delete(requestId)
        clearTimeout(request.timeoutId)

        if (envelope.code !== 0) {
          bridgeTelemetry.workerFailureCount += 1
          const payload = envelope.payload || {}
          const errorMessage = typeof payload.error === 'string' ? payload.error : `Bridge request failed with code ${envelope.code}`
          bridgeTelemetry.lastWorkerError = errorMessage
          request.reject(new Error(errorMessage))
          continue
        }

        bridgeTelemetry.workerSuccessCount += 1
        request.resolve(envelope.payload)
      } catch (error) {
        console.warn('Ignoring malformed bridge worker output line', {
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    bridgeWorkerState.stderr += chunk
    if (bridgeWorkerState.stderr.length > 20000) {
      bridgeWorkerState.stderr = bridgeWorkerState.stderr.slice(-20000)
    }
  })

  child.on('error', (error) => {
    const wrapped = new Error(`Bridge worker failed to start: ${error.message}`)
    bridgeTelemetry.lastWorkerError = wrapped.message
    rejectPendingBridgeRequests(wrapped)
    stopPythonBridgeWorker()
  })

  child.on('close', (code) => {
    const detail = [
      `Bridge worker exited with code ${code}`,
      `Python command: ${pythonCmd}`,
      `Bridge script: ${bridgeScript}`,
      `Bridge cwd: ${bridgeContext.projectRoot}`,
      `Bridge candidates: ${bridgeContext.candidates.join(' | ')}`,
      `stderr: ${bridgeWorkerState.stderr.trim() || '(empty)'}`,
    ].join('\n')
    bridgeTelemetry.lastWorkerError = detail
    rejectPendingBridgeRequests(new Error(detail))
    stopPythonBridgeWorker()
  })

  return child
}

function runPythonBridgeWorkerRequest(args) {
  return new Promise((resolve, reject) => {
    bridgeTelemetry.workerRequestCount += 1

    let child
    try {
      child = getOrStartPythonBridgeWorker()
    } catch (error) {
      reject(error)
      return
    }

    const requestId = bridgeWorkerState.nextRequestId
    bridgeWorkerState.nextRequestId += 1

    const timeoutId = setTimeout(() => {
      const pending = bridgeWorkerState.pending.get(requestId)
      if (!pending) {
        return
      }
      bridgeTelemetry.workerTimeoutCount += 1
      bridgeTelemetry.workerFailureCount += 1
      bridgeTelemetry.lastWorkerError = `Bridge worker request timed out after ${BRIDGE_REQUEST_TIMEOUT_MS}ms`
      bridgeWorkerState.pending.delete(requestId)
      stopPythonBridgeWorker()
      pending.reject(new Error(`Bridge worker request timed out after ${BRIDGE_REQUEST_TIMEOUT_MS}ms`))
    }, BRIDGE_REQUEST_TIMEOUT_MS)

    bridgeWorkerState.pending.set(requestId, {
      resolve,
      reject,
      timeoutId,
    })

    try {
      child.stdin.write(`${JSON.stringify({ id: requestId, args })}\n`)
    } catch (error) {
      bridgeWorkerState.pending.delete(requestId)
      clearTimeout(timeoutId)
      reject(error)
    }
  })
}

function runPythonBridge(command) {
  return runPythonBridgeWorkerRequest([command]).catch((error) => {
    bridgeTelemetry.fallbackCount += 1
    bridgeTelemetry.lastFallbackAtUtc = new Date().toISOString()
    bridgeTelemetry.lastWorkerError = error instanceof Error ? error.message : String(error)
    bridgeTelemetry.oneShotCount += 1
    return runPythonBridgeOneShot(command)
  })
}

function runPythonBridgeWithArgs(args) {
  return runPythonBridgeWorkerRequest(args).catch((error) => {
    bridgeTelemetry.fallbackCount += 1
    bridgeTelemetry.lastFallbackAtUtc = new Date().toISOString()
    bridgeTelemetry.lastWorkerError = error instanceof Error ? error.message : String(error)
    bridgeTelemetry.oneShotCount += 1
    return runPythonBridgeWithArgsOneShot(args)
  })
}

function getBridgeCacheKey(commandOrArgs) {
  if (Array.isArray(commandOrArgs)) {
    return commandOrArgs.join('\u001f')
  }
  return commandOrArgs
}

function resolveBridgeReadCacheTtlMs(commandOrArgs) {
  const command = Array.isArray(commandOrArgs) ? commandOrArgs[0] : commandOrArgs
  return BRIDGE_READ_CACHE_TTLS_MS[command] || 0
}

function getCachedBridgeRead(commandOrArgs, loader) {
  const ttlMs = resolveBridgeReadCacheTtlMs(commandOrArgs)
  if (ttlMs <= 0) {
    return loader()
  }

  const cacheKey = getBridgeCacheKey(commandOrArgs)
  const cached = bridgeReadCache.get(cacheKey)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.payload)
  }

  const inFlight = bridgeReadInFlight.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((payload) => {
      bridgeReadCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + ttlMs,
      })
      bridgeReadInFlight.delete(cacheKey)
      return payload
    })
    .catch((error) => {
      bridgeReadInFlight.delete(cacheKey)
      throw error
    })

  bridgeReadInFlight.set(cacheKey, promise)
  return promise
}

function runPythonBridgeCached(command) {
  return getCachedBridgeRead(command, () => runPythonBridge(command))
}

function runPythonBridgeWithArgsCached(args) {
  return getCachedBridgeRead(args, () => runPythonBridgeWithArgs(args))
}

function clearBridgeReadCaches() {
  bridgeReadCache.clear()
  bridgeReadInFlight.clear()
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

function isWindowExpanded(win) {
  const isSnapped = typeof win.isSnapped === 'function' ? win.isSnapped() : false
  return win.isMaximized() || win.isFullScreen() || isSnapped
}

registerIpcHandlers({
  ipcMain,
  isDev: process.env.ELECTRON_DEV === '1',
  getWindowFromSender: BrowserWindow.fromWebContents,
  runPythonBridge,
  runPythonBridgeWithArgs,
  runPythonBridgeCached,
  runPythonBridgeWithArgsCached,
  clearBridgeReadCaches,
  saveStartupTheme,
  normalizeStartupTelemetry,
  startupTelemetryByContentsId,
  startupReadyResolvers,
  isWindowExpanded,
  getSafeRestoreBounds,
  windowRestoreBoundsById,
})

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const minWidth = Math.min(1180, Math.max(860, workArea.width - 140))
  const minHeight = Math.min(820, Math.max(640, workArea.height - 140))
  const width = Math.min(1400, Math.max(minWidth, workArea.width - 56))
  const height = Math.min(940, Math.max(minHeight, workArea.height - 56))

  const win = new BrowserWindow({
    title: 'JPLearn',
    frame: false,
    width,
    height,
    minWidth,
    minHeight,
    resizable: true,
    maximizable: true,
    show: false,
    autoHideMenuBar: true,
    transparent: true,
    fullscreenable: false,
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
      windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
      pushWindowState()
    }
  })
  win.on('resize', () => {
    if (win.isNormal()) {
      windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
      pushWindowState()
    }
  })
  win.on('closed', () => {
    windowExpandedStateById.delete(win.id)
    windowRestoreBoundsById.delete(win.id)
  })

  return win
}

function createSplashWindow(themeKey) {
  const palette = getSplashPalette(themeKey)
  const splash = new BrowserWindow({
    width: 440,
    height: 300,
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
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", "Noto Sans", sans-serif;
        background: transparent;
        color: ${palette.title};
        overflow: hidden;
      }
      .stage {
        position: fixed;
        inset: 0;
        border-radius: 24px;
        overflow: hidden;
        background:
          radial-gradient(circle at 12% 8%, ${palette.glowA}, transparent 42%),
          radial-gradient(circle at 82% 84%, ${palette.glowB}, transparent 44%),
          linear-gradient(165deg, ${palette.bgB}, ${palette.bgA});
      }
      .panel {
        position: relative;
        width: min(340px, 88vw);
        padding: 28px 24px;
        border-radius: 18px;
        border: 1px solid ${palette.border};
        background: linear-gradient(160deg, ${palette.panelA}, ${palette.panelB});
        box-shadow:
          0 30px 50px -28px rgba(0, 0, 0, 0.9),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        text-align: center;
        animation: panelIn 260ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
      }
      .spinner {
        width: 44px;
        height: 44px;
        margin: 0 auto 16px;
        border-radius: 999px;
        border: 3px solid ${palette.spinnerTrack};
        border-top-color: ${palette.spinnerHead};
        animation: spin 860ms linear infinite;
      }
      .brand {
        margin: 0 0 8px;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: ${palette.accent};
        font-weight: 700;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.25rem;
        font-weight: 650;
        letter-spacing: 0.02em;
      }
      p {
        margin: 0 0 12px;
        color: ${palette.subtitle};
        font-size: 0.92rem;
      }
      .progress {
        width: 100%;
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }
      .progress::after {
        content: "";
        display: block;
        width: 36%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, transparent, ${palette.accent}, transparent);
        transform: translateX(-120%);
        animation: sweep 1.2s ease-in-out infinite;
      }
      @keyframes panelIn {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes sweep {
        to {
          transform: translateX(320%);
        }
      }
    </style>
  </head>
  <body>
    <div class="stage" aria-hidden="true"></div>
    <section class="panel" aria-label="Startup status">
      <div class="spinner" aria-hidden="true"></div>
      <p class="brand">JPLearn Desktop</p>
      <h1>Starting JPLearn...</h1>
      <p>Loading decks, stats, and bridge services.</p>
      <div class="progress" aria-hidden="true"></div>
    </section>
  </body>
</html>`

  splash.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`)
  splash.once('ready-to-show', () => splash.show())

  return splash
}

function loadMainWindow(win) {
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url, process.env.ELECTRON_DEV === '1')) {
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

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
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

async function createWindowWithSplash() {
  const minSplashMs = 1100
  const maxStartupWaitMs = 30000
  const startupSessionStartedAt = Date.now()
  const startupTheme = readSavedStartupTheme()
  const splash = createSplashWindow(startupTheme)
  const win = createWindow()
  const webContentsId = win.webContents.id

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

  loadMainWindow(win)

  const windowReadyPromise = new Promise((resolve) => {
    win.once('ready-to-show', resolve)
  })

  await Promise.all([
    windowReadyPromise,
    Promise.race([
      startupReadyPromise,
      new Promise((resolve) => setTimeout(resolve, maxStartupWaitMs)),
    ]),
    new Promise((resolve) => setTimeout(resolve, minSplashMs)),
  ])

  const startupSessionCompletedAt = Date.now()
  const startupSessionMs = startupSessionCompletedAt - startupSessionStartedAt
  const telemetryContext = startupTelemetryByContentsId.get(webContentsId) || {}
  const rendererTelemetry = telemetryContext.renderer || null

  writeStartupTelemetry({
    capturedAtUtc: new Date().toISOString(),
    budgetsMs: STARTUP_BUDGETS_MS,
    main: {
      startupSessionStartedAt,
      startupSessionCompletedAt,
      startupSessionMs,
      startupTheme,
    },
    renderer: rendererTelemetry,
    bridge: getBridgeTelemetrySnapshot(),
  })

  if (rendererTelemetry && typeof rendererTelemetry.startupReadyMs === 'number' && rendererTelemetry.startupReadyMs > STARTUP_BUDGETS_MS.startupReady) {
    console.warn(
      `Startup budget exceeded: renderer startup-ready in ${rendererTelemetry.startupReadyMs}ms (budget ${STARTUP_BUDGETS_MS.startupReady}ms)`,
    )
  }
  if (rendererTelemetry && typeof rendererTelemetry.firstSummaryMs === 'number' && rendererTelemetry.firstSummaryMs > STARTUP_BUDGETS_MS.firstSummary) {
    console.warn(
      `Startup budget exceeded: first summary in ${rendererTelemetry.firstSummaryMs}ms (budget ${STARTUP_BUDGETS_MS.firstSummary}ms)`,
    )
  }

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

app.whenReady().then(() => {
  void createWindowWithSplash()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindowWithSplash()
    }
  })
})

app.on('before-quit', () => {
  writeBridgeTelemetry()
  stopPythonBridgeWorker()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
