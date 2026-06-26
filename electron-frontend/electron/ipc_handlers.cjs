const {
  assertTrustedIpcSender,
  validateDeckSlug,
  validateSessionGoalPayload,
  validateSessionId,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
} = require('./ipc_security.cjs')

function registerIpcHandlers(options) {
  const trustedSenderOptions = () => ({
    isDev: options.isDev,
    getWindowFromSender: options.getWindowFromSender,
  })

  options.ipcMain.handle('study:get-summary', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.runPythonBridge('summary')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch study summary: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-block-progress', async (event, slug) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSlug = validateDeckSlug(slug)
    try {
      return await options.runPythonBridgeWithArgs(['block-progress', validatedSlug])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch block progress: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-deck-cards', async (event, slug) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSlug = validateDeckSlug(slug)
    try {
      return await options.runPythonBridgeWithArgs(['deck-cards', validatedSlug])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch deck cards: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-overview-character-mastery', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.runPythonBridge('overview-character-mastery')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch overview character mastery: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-study-queue', async (event, slug) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSlug = validateDeckSlug(slug)
    try {
      return await options.runPythonBridgeWithArgs(['study-queue', validatedSlug])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch study queue: ${detail}`)
    }
  })

  options.ipcMain.handle('study:reset-db', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.runPythonBridge('reset-db')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to reset study database: ${detail}`)
    }
  })

  options.ipcMain.handle('study:record-game-result', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
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
      return await options.runPythonBridgeWithArgs(args)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to record game result: ${detail}`)
    }
  })

  options.ipcMain.handle('study:start-session-goal', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
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
      return await options.runPythonBridgeWithArgs(args)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to start session goal: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-session-summary', async (event, sessionId) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSessionId = validateSessionId(sessionId)
    try {
      return await options.runPythonBridgeWithArgs(['session-summary', validatedSessionId])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch session summary: ${detail}`)
    }
  })

  options.ipcMain.handle('window:minimize', (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (win) win.minimize()
    return { ok: true }
  })

  options.ipcMain.handle('window:toggle-maximize', async (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (!win) return { ok: false, isMaximized: false }

    const shouldExitExpanded = options.isWindowExpanded(win) || win.isMinimized()
    const normalBounds = options.windowRestoreBoundsById.get(win.id) || options.getSafeRestoreBounds(win)

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

      return { ok: true, isMaximized: options.isWindowExpanded(win) }
    }

    options.windowRestoreBoundsById.set(win.id, options.getSafeRestoreBounds(win))
    win.maximize()
    return { ok: true, isMaximized: options.isWindowExpanded(win) }
  })

  options.ipcMain.handle('window:is-maximized', (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (!win) return { isMaximized: false }

    return { isMaximized: options.isWindowExpanded(win) }
  })

  options.ipcMain.handle('window:close', (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (win) win.close()
    return { ok: true }
  })

  options.ipcMain.handle('ui:set-startup-theme', (event, theme) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const normalized = options.saveStartupTheme(validateStartupThemeInput(theme))
    return { ok: true, theme: normalized }
  })

  options.ipcMain.handle('ui:startup-ready', (event, telemetryPayload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const normalizedTelemetry = options.normalizeStartupTelemetry(telemetryPayload)
    const currentTelemetry = options.startupTelemetryByContentsId.get(event.sender.id) || {}
    options.startupTelemetryByContentsId.set(event.sender.id, {
      ...currentTelemetry,
      renderer: normalizedTelemetry,
    })

    const resolver = options.startupReadyResolvers.get(event.sender.id)
    if (resolver) {
      resolver()
      options.startupReadyResolvers.delete(event.sender.id)
    }
    return { ok: true }
  })
}

module.exports = {
  registerIpcHandlers,
}