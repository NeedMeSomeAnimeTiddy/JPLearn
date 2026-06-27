const {
  assertTrustedIpcSender,
  validateDeckSlug,
  validateSessionGoalPayload,
  validateSessionId,
  validateOptionalSessionId,
  validatePositiveLimit,
  validateAssistantEventIdsPayload,
  validateAssistantEventInteractionPayload,
  validateAssistantChatAppendPayload,
  validateAssistantChatRuntimePayload,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
  validateExpertiseLevelInput,
} = require('./ipc_security.cjs')

function registerIpcHandlers(options) {
  const trustedSenderOptions = () => ({
    isDev: options.isDev,
    getWindowFromSender: options.getWindowFromSender,
  })
  const runPythonBridgeRead = (command) =>
    (options.runPythonBridgeCached || options.runPythonBridge)(command)
  const runPythonBridgeWithArgsRead = (args) =>
    (options.runPythonBridgeWithArgsCached || options.runPythonBridgeWithArgs)(args)
  const clearBridgeReadCaches = () => {
    if (typeof options.clearBridgeReadCaches === 'function') {
      options.clearBridgeReadCaches()
    }
  }

  options.ipcMain.handle('study:get-summary', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('summary')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch study summary: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-block-progress', async (event, slug) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSlug = validateDeckSlug(slug)
    try {
      return await runPythonBridgeWithArgsRead(['block-progress', validatedSlug])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch block progress: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-deck-cards', async (event, slug) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSlug = validateDeckSlug(slug)
    try {
      return await runPythonBridgeWithArgsRead(['deck-cards', validatedSlug])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch deck cards: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-overview-character-mastery', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('overview-character-mastery')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch overview character mastery: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-study-queue', async (event, slug) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSlug = validateDeckSlug(slug)
    try {
      return await runPythonBridgeWithArgsRead(['study-queue', validatedSlug])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch study queue: ${detail}`)
    }
  })

  options.ipcMain.handle('study:reset-db', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      const response = await options.runPythonBridge('reset-db')
      clearBridgeReadCaches()
      return response
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
      const response = await options.runPythonBridgeWithArgs(args)
      clearBridgeReadCaches()
      return response
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

  options.ipcMain.handle('study:apply-expertise-level', async (event, level) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedLevel = validateExpertiseLevelInput(level)
    try {
      const response = await options.runPythonBridgeWithArgs(['apply-expertise-level', validatedLevel])
      clearBridgeReadCaches()
      return response
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to apply expertise level: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:get-snapshot', async (event, sessionId) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedSessionId = validateOptionalSessionId(sessionId)
    try {
      if (validatedSessionId) {
        return await options.runPythonBridgeWithArgs(['assistant-snapshot', validatedSessionId])
      }
      return await options.runPythonBridge('assistant-snapshot')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch assistant snapshot: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:get-events', async (event, limit) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedLimit = validatePositiveLimit(limit, 8)
    try {
      return await options.runPythonBridgeWithArgs(['assistant-events', String(validatedLimit)])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch assistant events: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:consume-events', async (event, eventIds) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedIds = validateAssistantEventIdsPayload(eventIds)
    try {
      return await options.runPythonBridgeWithArgs(['assistant-events-consume', validatedIds.join(',')])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to consume assistant events: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:track-event', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateAssistantEventInteractionPayload(payload)
    try {
      return await options.runPythonBridgeWithArgs([
        'assistant-events-track',
        String(validatedPayload.eventId),
        validatedPayload.interactionType,
        JSON.stringify(validatedPayload.metadata),
      ])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to track assistant event interaction: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:append-chat-turn', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateAssistantChatAppendPayload(payload)
    try {
      return await options.runPythonBridgeWithArgs([
        'assistant-chat-append',
        validatedPayload.role,
        validatedPayload.content,
      ])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to append assistant chat turn: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:get-chat-history', async (event, limit) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedLimit = validatePositiveLimit(limit, 20)
    try {
      return await options.runPythonBridgeWithArgs(['assistant-chat-history', String(validatedLimit)])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch assistant chat history: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant:clear-chat-history', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.runPythonBridgeWithArgs(['assistant-chat-clear'])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to clear assistant chat history: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant-chat:status', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    return options.localTutorRuntime.getStatus()
  })

  options.ipcMain.handle('assistant-chat:preload', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.localTutorRuntime.preload('renderer-startup')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to preload assistant chat runtime: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant-chat:send-message', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateAssistantChatRuntimePayload(payload)

    try {
      // Chat transcript persistence is best-effort and isolated from inference lifecycle.
      await options.runPythonBridgeWithArgs([
        'assistant-chat-append',
        'user',
        validatedPayload.message,
      ])
    } catch {
      // Keep chat runtime responsive even if persistence fails.
    }

    try {
      let assembledContext = {}
      try {
        const requestedSessionId =
          typeof validatedPayload.context?.session_id === 'string'
            ? validatedPayload.context.session_id.trim()
            : ''
        const contextResponse = await options.runPythonBridgeWithArgs([
          'assistant-chat-context',
          requestedSessionId,
          validatedPayload.message,
        ])
        if (contextResponse && contextResponse.ok && contextResponse.context && typeof contextResponse.context === 'object') {
          assembledContext = contextResponse.context
        }
      } catch {
        // Fallback to renderer-provided context when context assembly fails.
      }

      const runtimeContext = {
        ...assembledContext,
        ...validatedPayload.context,
      }
      const response = await options.localTutorRuntime.sendMessage(validatedPayload.message, runtimeContext)
      try {
        await options.runPythonBridgeWithArgs([
          'assistant-chat-append',
          'assistant',
          response.text,
        ])
      } catch {
        // Best-effort persistence only.
      }
      return response
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to send assistant chat message: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant-chat:unload', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.localTutorRuntime.unload('manual')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to unload assistant chat runtime: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant-chat:cancel', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await options.localTutorRuntime.cancelActiveInference('renderer-cancel')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to cancel assistant chat inference: ${detail}`)
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