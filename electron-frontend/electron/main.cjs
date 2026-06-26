const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
  validateSessionGoalPayload,
  validateSessionId,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
} = require('./ipc_security.cjs')

const repoRoot = path.join(__dirname, '..', '..')
const startupReadyResolvers = new Map()
const startupTelemetryByContentsId = new Map()
const windowExpandedStateById = new Map()
const windowRestoreBoundsById = new Map()
const THEME_STATE_FILENAME = 'jplearn-startup-theme.json'
const STARTUP_TELEMETRY_FILENAME = 'startup-telemetry.json'
const STUDY_JOURNEY_SMOKE_FILENAME = 'study-journey-smoke.json'
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
      bgA: '#ece5d6',
      bgB: '#dfd4be',
      glowA: 'rgba(119, 161, 185, 0.26)',
      glowB: 'rgba(209, 138, 87, 0.2)',
      panelA: 'rgba(255, 252, 245, 0.96)',
      panelB: 'rgba(245, 236, 220, 0.94)',
      border: 'rgba(156, 128, 99, 0.4)',
      spinnerTrack: 'rgba(158, 132, 104, 0.22)',
      spinnerHead: '#d18a57',
      title: '#2f2a24',
      subtitle: 'rgba(92, 79, 68, 0.82)',
      accent: '#d18a57',
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

function runPythonBridge(command) {
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

function runPythonBridgeWithArgs(args) {
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

ipcMain.handle('study:get-summary', async (event) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  try {
    return await runPythonBridge('summary')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch study summary: ${detail}`)
  }
})

ipcMain.handle('study:get-block-progress', async (event, slug) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const validatedSlug = validateDeckSlug(slug)
  try {
    return await runPythonBridgeWithArgs(['block-progress', validatedSlug])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch block progress: ${detail}`)
  }
})

ipcMain.handle('study:get-deck-cards', async (event, slug) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const validatedSlug = validateDeckSlug(slug)
  try {
    return await runPythonBridgeWithArgs(['deck-cards', validatedSlug])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch deck cards: ${detail}`)
  }
})

ipcMain.handle('study:get-overview-character-mastery', async (event) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  try {
    return await runPythonBridge('overview-character-mastery')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch overview character mastery: ${detail}`)
  }
})

ipcMain.handle('study:get-study-queue', async (event, slug) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const validatedSlug = validateDeckSlug(slug)
  try {
    return await runPythonBridgeWithArgs(['study-queue', validatedSlug])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch study queue: ${detail}`)
  }
})

ipcMain.handle('study:reset-db', async (event) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  try {
    return await runPythonBridge('reset-db')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to reset study database: ${detail}`)
  }
})

ipcMain.handle('study:record-game-result', async (event, payload) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const validatedPayload = validateRecordGameResultPayload(payload)
  try {
    const args = [
      'record-result',
      validatedPayload.slug,
      String(validatedPayload.cardId),
      validatedPayload.isCorrect ? '1' : '0',
      validatedPayload.minigame,
    ]
    const curriculumStageArg =
      typeof validatedPayload.curriculumStage === 'number'
        ? String(validatedPayload.curriculumStage)
        : ''
    const sessionIdArg =
      typeof validatedPayload.sessionId === 'string' && validatedPayload.sessionId.trim().length > 0
        ? validatedPayload.sessionId
        : ''
    const confidenceArg =
      typeof validatedPayload.confidenceScore === 'number'
        ? String(validatedPayload.confidenceScore)
        : ''

    if (curriculumStageArg || sessionIdArg || confidenceArg) {
      args.push(curriculumStageArg)
    }
    if (sessionIdArg || confidenceArg) {
      args.push(sessionIdArg)
    }
    if (confidenceArg) {
      args.push(confidenceArg)
    }
    return await runPythonBridgeWithArgs(args)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to record game result: ${detail}`)
  }
})

ipcMain.handle('study:start-session-goal', async (event, payload) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const validatedPayload = validateSessionGoalPayload(payload)
  try {
    const args = ['session-start', String(validatedPayload.targetItems)]
    if (typeof validatedPayload.targetMinutes === 'number') {
      args.push(String(validatedPayload.targetMinutes))
    } else if (typeof validatedPayload.targetAccuracy === 'number' || typeof validatedPayload.sessionId === 'string') {
      args.push('')
    }

    if (typeof validatedPayload.targetAccuracy === 'number') {
      args.push(String(validatedPayload.targetAccuracy))
    } else if (typeof validatedPayload.sessionId === 'string') {
      args.push('')
    }

    if (typeof validatedPayload.sessionId === 'string') {
      args.push(validatedPayload.sessionId)
    }
    return await runPythonBridgeWithArgs(args)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to start session goal: ${detail}`)
  }
})

ipcMain.handle('study:get-session-summary', async (event, sessionId) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const validatedSessionId = validateSessionId(sessionId)
  try {
    return await runPythonBridgeWithArgs(['session-summary', validatedSessionId])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch session summary: ${detail}`)
  }
})

ipcMain.handle('window:minimize', (event) => {
  const win = assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  if (win) win.minimize()
  return { ok: true }
})

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

ipcMain.handle('window:toggle-maximize', async (event) => {
  const win = assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  if (!win) return { ok: false, isMaximized: false }

  const shouldExitExpanded = isWindowExpanded(win) || win.isMinimized()
  const normalBounds = windowRestoreBoundsById.get(win.id) || getSafeRestoreBounds(win)

  if (shouldExitExpanded) {
    if (win.isMinimized()) {
      win.restore()
    }

    if (win.isFullScreen()) {
      win.setFullScreen(false)
    }

    if (win.isMaximized()) {
      win.unmaximize()
    }

    await new Promise((resolve) => setTimeout(resolve, 0))

    if (!win.isDestroyed()) {
      win.setBounds(normalBounds)
    }

    return { ok: true, isMaximized: isWindowExpanded(win) }
  }

  windowRestoreBoundsById.set(win.id, getSafeRestoreBounds(win))
  win.maximize()
  return { ok: true, isMaximized: isWindowExpanded(win) }
})

ipcMain.handle('window:is-maximized', (event) => {
  const win = assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  if (!win) return { isMaximized: false }

  return { isMaximized: isWindowExpanded(win) }
})

ipcMain.handle('window:close', (event) => {
  const win = assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  if (win) win.close()
  return { ok: true }
})

ipcMain.handle('ui:set-startup-theme', (event, theme) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const normalized = saveStartupTheme(validateStartupThemeInput(theme))
  return { ok: true, theme: normalized }
})

ipcMain.handle('ui:startup-ready', (event, telemetryPayload) => {
  assertTrustedIpcSender(event, {
    isDev: process.env.ELECTRON_DEV === '1',
    getWindowFromSender: BrowserWindow.fromWebContents,
  })
  const normalizedTelemetry = normalizeStartupTelemetry(telemetryPayload)
  const currentTelemetry = startupTelemetryByContentsId.get(event.sender.id) || {}
  startupTelemetryByContentsId.set(event.sender.id, {
    ...currentTelemetry,
    renderer: normalizedTelemetry,
  })

  const resolver = startupReadyResolvers.get(event.sender.id)
  if (resolver) {
    resolver()
    startupReadyResolvers.delete(event.sender.id)
  }
  return { ok: true }
})

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const minWidth = Math.min(1024, Math.max(720, workArea.width - 140))
  const minHeight = Math.min(700, Math.max(560, workArea.height - 140))
  const width = Math.min(1260, Math.max(minWidth, workArea.width - 80))
  const height = Math.min(820, Math.max(minHeight, workArea.height - 80))

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
