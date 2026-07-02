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
  validateSpeakPayload,
  validateTranscribeSpeechPayload,
  validateJLPTLevel,
  validateJLPTMode,
  validateOptionalJLPTLevel,
  validateOptionalJLPTMode,
  validateJLPTSaveResultPayload,
  validateLearningPathId,
  validateAnalyticsExportType,
  validateDictionarySearchQuery,
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

  options.ipcMain.handle('study:search-dictionary', async (event, query) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedQuery = validateDictionarySearchQuery(query)
    try {
      return await runPythonBridgeWithArgsRead(['dictionary-search', validatedQuery])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to search dictionary: ${detail}`)
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

  options.ipcMain.handle('assistant:get-chat-history-preloaded', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    if (typeof options.getPreloadedAssistantChatHistory === 'function') {
      return options.getPreloadedAssistantChatHistory()
    }
    return {
      ok: true,
      turns: [],
      runtimeActive: false,
      source: 'not-configured',
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
        // Prefer the embedding-aware context (ranks assistant memory facts/
        // summaries by similarity to the message); fall back to the plain
        // keyword-matched context if the v2 path errors for any reason.
        let contextResponse
        try {
          contextResponse = await options.runPythonBridgeWithArgs([
            'assistant-chat-context-v2',
            requestedSessionId,
            validatedPayload.message,
          ])
        } catch {
          contextResponse = await options.runPythonBridgeWithArgs([
            'assistant-chat-context',
            requestedSessionId,
            validatedPayload.message,
          ])
        }
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

  options.ipcMain.handle('audio:voice-status', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    return options.localVoiceRuntime.getStatus()
  })

  options.ipcMain.handle('audio:preload', async (event, speaker) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const requestedSpeaker = Number.isInteger(speaker) && speaker >= 0 && speaker <= 100000 ? speaker : undefined
    try {
      return await options.localVoiceRuntime.preload(requestedSpeaker)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to preload voice: ${detail}`)
    }
  })

  options.ipcMain.handle('audio:speak', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateSpeakPayload(payload)
    try {
      return await options.localVoiceRuntime.speak(validatedPayload.text, {
        speaker: validatedPayload.speaker,
        speed: validatedPayload.speed,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to synthesize speech: ${detail}`)
    }
  })

  options.ipcMain.handle('audio:speech-status', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const speechRuntime = options.speechRuntime
    return speechRuntime
      ? speechRuntime.getStatus()
      : { available: false, running: false, lastError: 'Speech recognition runtime is not available' }
  })

  options.ipcMain.handle('audio:transcribe', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validated = validateTranscribeSpeechPayload(payload)
    const speechRuntime = options.speechRuntime
    if (!speechRuntime) {
      throw new Error('Speech recognition runtime is not available')
    }
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const crypto = require('crypto')
    const tempPath = path.join(os.tmpdir(), `jplearn-speech-${crypto.randomUUID()}.${validated.extension}`)
    try {
      fs.writeFileSync(tempPath, Buffer.from(validated.audioBase64, 'base64'))
      return await speechRuntime.transcribe(tempPath, { language: validated.language })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Speech transcription failed: ${detail}`)
    } finally {
      try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
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

  options.ipcMain.handle('ui:reload-local-fonts', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    if (typeof options.reloadLocalFontsForContents !== 'function') {
      return { ok: false }
    }
    return await options.reloadLocalFontsForContents(event.sender)
  })

  // ---- Progression, features, XP, recommendations, tutor ----

  options.ipcMain.handle('progression:get-state', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('progression')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch progression state: ${detail}`)
    }
  })

  options.ipcMain.handle('features:get-state', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('feature-unlocks')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch feature state: ${detail}`)
    }
  })

  options.ipcMain.handle('xp:get-progress', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('xp-progress')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch XP progress: ${detail}`)
    }
  })

  options.ipcMain.handle('recommendations:get', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('recommendations')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch recommendations: ${detail}`)
    }
  })

  options.ipcMain.handle('tutor:get-reactions', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('tutor-reactions')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch tutor reactions: ${detail}`)
    }
  })

  options.ipcMain.handle('tutor:dismiss-reaction', async (event, dedupKey) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const safeKey = typeof dedupKey === 'string' ? dedupKey.slice(0, 256) : ''
    if (!safeKey) return { ok: false, error: 'Invalid dedup key' }
    try {
      return await options.runPythonBridgeWithArgs(['tutor-dismiss', safeKey])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to dismiss tutor reaction: ${detail}`)
    }
  })

  // ---- JLPT preparation ----

  options.ipcMain.handle('jlpt:get-readiness', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeWithArgsRead(['jlpt-readiness'])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch JLPT readiness: ${detail}`)
    }
  })

  options.ipcMain.handle('jlpt:build-exam-queue', async (event, level, mode, count) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validLevel = validateJLPTLevel(level)
    const validMode = validateJLPTMode(mode)
    const safeCount = (typeof count === 'number' && Number.isFinite(count) && count > 0)
      ? String(Math.min(count, 60))
      : '30'
    try {
      return await options.runPythonBridgeWithArgs(['jlpt-exam-queue', validLevel, validMode, safeCount])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to build JLPT exam queue: ${detail}`)
    }
  })

  options.ipcMain.handle('jlpt:save-exam-result', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const p = validateJLPTSaveResultPayload(payload)
    try {
      const args = [
        'jlpt-save-result',
        p.level,
        p.mode,
        String(p.questionsAnswered),
        String(p.correct),
        String(p.accuracy),
      ]
      if (p.projectedScore !== null) args.push(String(p.projectedScore))
      const response = await options.runPythonBridgeWithArgs(args)
      clearBridgeReadCaches()
      return response
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to save JLPT exam result: ${detail}`)
    }
  })

  options.ipcMain.handle('jlpt:get-exam-history', async (event, level, mode) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validLevel = validateOptionalJLPTLevel(level) ?? ''
    const validMode = validateOptionalJLPTMode(mode) ?? ''
    try {
      return await runPythonBridgeWithArgsRead(['jlpt-exam-history', validLevel, validMode])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch JLPT exam history: ${detail}`)
    }
  })

  // ---- Learning path / guided system ----

  options.ipcMain.handle('learning-path:get-status', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('learning-path-status')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch learning path status: ${detail}`)
    }
  })

  options.ipcMain.handle('learning-path:set', async (event, pathId) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validPathId = validateLearningPathId(pathId)
    try {
      const response = await options.runPythonBridgeWithArgs(['set-learning-path', validPathId])
      clearBridgeReadCaches()
      return response
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to set learning path: ${detail}`)
    }
  })

  options.ipcMain.handle('learning-path:complete-onboarding', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const goal = typeof payload?.goal === 'string' ? payload.goal.slice(0, 32) : ''
    const dailyMinutes = typeof payload?.dailyMinutes === 'number' ? String(payload.dailyMinutes) : ''
    const targetLevel = typeof payload?.targetLevel === 'string' ? payload.targetLevel.slice(0, 8) : ''
    try {
      const response = await options.runPythonBridgeWithArgs(['complete-onboarding', goal, dailyMinutes, targetLevel])
      clearBridgeReadCaches()
      return response
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to complete onboarding: ${detail}`)
    }
  })

  options.ipcMain.handle('analytics:export-and-save-csv', async (event, type) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedType = validateAnalyticsExportType(type)
    try {
      const response = await runPythonBridgeWithArgsRead(['analytics-export', validatedType])
      if (!response || typeof response.csv !== 'string') {
        throw new Error('Invalid analytics export response from bridge')
      }
      const { dialog, app } = require('electron')
      const defaultFilename = `jplearn-${validatedType}-${new Date().toISOString().slice(0, 10)}.csv`
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: require('path').join(app.getPath('downloads'), defaultFilename),
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      })
      if (canceled || !filePath) {
        return { ok: false, cancelled: true }
      }
      require('fs').writeFileSync(filePath, response.csv, 'utf-8')
      return { ok: true, path: filePath }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to export analytics CSV: ${detail}`)
    }
  })
  // ── Setup wizard ────────────────────────────────────────────────────────────────────
  const setupRuntime = options.setupRuntime
  if (setupRuntime) {
    options.ipcMain.handle('setup:is-first-run', (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      return setupRuntime.isFirstRun()
    })

    options.ipcMain.handle('setup:system-info', (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      return setupRuntime.getSystemInfo()
    })

    options.ipcMain.handle('setup:download-model', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['low', 'medium', 'high', 'ultra', 'max'].includes(tier)) {
        throw new Error('Invalid model tier')
      }
      try {
        const result = await setupRuntime.downloadModel(tier, event.sender, options.repoRoot)
        if (!result?.alreadyInstalled && typeof options.refreshTutorChatRuntime === 'function') {
          await options.refreshTutorChatRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Model download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:set-active-model', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['low', 'medium', 'high', 'ultra', 'max'].includes(tier)) {
        throw new Error('Invalid model tier')
      }
      try {
        const result = setupRuntime.setActiveModelTier(tier)
        if (typeof options.refreshTutorChatRuntime === 'function') {
          await options.refreshTutorChatRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to select model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:uninstall-model', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['low', 'medium', 'high', 'ultra', 'max'].includes(tier)) {
        throw new Error('Invalid model tier')
      }
      try {
        const result = setupRuntime.uninstallModel(tier)
        if (typeof options.refreshTutorChatRuntime === 'function') {
          await options.refreshTutorChatRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to uninstall model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:download-llama', async (event, backend) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      const safeBackend = typeof backend === 'string' && ['cuda', 'hip', 'vulkan', 'cpu'].includes(backend)
        ? backend
        : undefined
      try {
        return await setupRuntime.downloadLlamaCpp(event.sender, options.repoRoot, safeBackend)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`llama.cpp download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:download-voicevox', async (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      try {
        return await setupRuntime.downloadVoicevox(event.sender, options.repoRoot)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`VOICEVOX download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:download-fonts', async (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      try {
        return await setupRuntime.downloadFonts(event.sender, options.repoRoot)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Font download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:download-dictionary', async (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      try {
        const result = await setupRuntime.downloadDictionary(event.sender, options.repoRoot)
        if (!result?.alreadyInstalled && typeof options.refreshTutorChatRuntime === 'function') {
          await options.refreshTutorChatRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Dictionary download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:download-speech-model', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['fast', 'balanced', 'high', 'ultra'].includes(tier)) {
        throw new Error('Invalid speech model tier')
      }
      try {
        return await setupRuntime.downloadSpeechModel(tier, event.sender, options.repoRoot)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Speech model download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:set-active-speech-model', (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['fast', 'balanced', 'high', 'ultra'].includes(tier)) {
        throw new Error('Invalid speech model tier')
      }
      try {
        return setupRuntime.setActiveSpeechModelTier(tier)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to select speech model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:uninstall-speech-model', (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['fast', 'balanced', 'high', 'ultra'].includes(tier)) {
        throw new Error('Invalid speech model tier')
      }
      try {
        return setupRuntime.uninstallSpeechModel(tier)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to uninstall speech model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:create-shortcuts', (event, opts) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      const safeOpts = opts && typeof opts === 'object' ? opts : {}
      return setupRuntime.createShortcuts({
        desktop: Boolean(safeOpts.desktop),
        startMenu: Boolean(safeOpts.startMenu),
      })
    })

    options.ipcMain.handle('setup:complete', async (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      await options.runPythonBridgeWithArgs(['mark-onboarding-pending'])
      clearBridgeReadCaches()
      setupRuntime.writeSentinel()
      if (typeof options.refreshTutorChatRuntime === 'function') {
        await options.refreshTutorChatRuntime()
      }
      return { ok: true }
    })

    options.ipcMain.handle('setup:skip', async (event) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      await options.runPythonBridgeWithArgs(['mark-onboarding-pending'])
      clearBridgeReadCaches()
      setupRuntime.writeSentinel()
      return { ok: true }
    })
  }
}

module.exports = {
  registerIpcHandlers,
}
