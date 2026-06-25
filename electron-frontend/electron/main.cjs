const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..', '..')

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

ipcMain.handle('study:get-deck-cards', async (_event, slug) => {
  try {
    return await runPythonBridgeWithArgs(['deck-cards', slug])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch deck cards: ${detail}`)
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
