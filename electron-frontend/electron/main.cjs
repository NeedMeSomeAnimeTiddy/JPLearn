const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..', '..')
const startupReadyResolvers = new Map()
const THEME_STATE_FILENAME = 'jplearn-startup-theme.json'
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

function getThemeStatePath() {
  return path.join(app.getPath('userData'), THEME_STATE_FILENAME)
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

function runPythonBridge(command) {
  const pythonCmd = process.env.JPLEARN_PYTHON || 'python'
  const bridgeScript = path.join(repoRoot, 'scripts', 'desktop_bridge.py')

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [bridgeScript, command], {
      cwd: repoRoot,
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
  const pythonCmd = process.env.JPLEARN_PYTHON || 'python'
  const bridgeScript = path.join(repoRoot, 'scripts', 'desktop_bridge.py')

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCmd, [bridgeScript, ...args], {
      cwd: repoRoot,
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

ipcMain.handle('study:get-summary', async () => {
  try {
    return await runPythonBridge('summary')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch study summary: ${detail}`)
  }
})

ipcMain.handle('study:get-block-progress', async (_event, slug) => {
  try {
    return await runPythonBridgeWithArgs(['block-progress', slug])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch block progress: ${detail}`)
  }
})

ipcMain.handle('study:get-deck-cards', async (_event, slug) => {
  try {
    return await runPythonBridgeWithArgs(['deck-cards', slug])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch deck cards: ${detail}`)
  }
})

ipcMain.handle('study:get-overview-character-mastery', async () => {
  try {
    return await runPythonBridge('overview-character-mastery')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch overview character mastery: ${detail}`)
  }
})

ipcMain.handle('study:reset-db', async () => {
  try {
    return await runPythonBridge('reset-db')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to reset study database: ${detail}`)
  }
})

ipcMain.handle('study:record-game-result', async (_event, payload) => {
  try {
    const args = [
      'record-result',
      payload.slug,
      String(payload.cardId),
      payload.isCorrect ? '1' : '0',
      payload.minigame || '',
    ]
    if (typeof payload.curriculumStage === 'number') {
      args.push(String(payload.curriculumStage))
    }
    return await runPythonBridgeWithArgs(args)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to record game result: ${detail}`)
  }
})

ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.minimize()
  return { ok: true }
})

ipcMain.handle('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, isMaximized: false }
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
  return { ok: true, isMaximized: win.isMaximized() }
})

ipcMain.handle('window:is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return { isMaximized: win ? win.isMaximized() : false }
})

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.close()
  return { ok: true }
})

ipcMain.handle('ui:set-startup-theme', (_event, theme) => {
  const normalized = saveStartupTheme(theme)
  return { ok: true, theme: normalized }
})

ipcMain.handle('ui:startup-ready', (event) => {
  const resolver = startupReadyResolvers.get(event.sender.id)
  if (resolver) {
    resolver()
    startupReadyResolvers.delete(event.sender.id)
  }
  return { ok: true }
})

function createWindow() {
  const win = new BrowserWindow({
    title: 'JPLearn',
    frame: false,
    width: 1260,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

async function createWindowWithSplash() {
  const minSplashMs = 1100
  const maxStartupWaitMs = 30000
  const startupTheme = readSavedStartupTheme()
  const splash = createSplashWindow(startupTheme)
  const win = createWindow()
  const webContentsId = win.webContents.id

  const startupReadyPromise = new Promise((resolve) => {
    startupReadyResolvers.set(webContentsId, resolve)
  })

  win.on('closed', () => {
    startupReadyResolvers.delete(webContentsId)
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
