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
  validateAssistantChatImagePayload,
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
  validateLookupSentencePayload,
  validateGrammarMinigameRequest,
  validateConfigKey,
  validateConfigSetPayload,
} = require('./ipc_security.cjs')
const { getConfigValue, setConfigValue } = require('./config_store.cjs')

function isTransientSetupNetworkError(error) {
  const detail = error instanceof Error ? error.message : String(error)
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE/i.test(detail)
}

async function runWithTransientRetry(fn) {
  try {
    return await fn()
  } catch (error) {
    if (!isTransientSetupNetworkError(error)) {
      throw error
    }
    return await fn()
  }
}

function registerIpcHandlers(options) {
  const transientAssistantChatTurns = []
  const appendTransientAssistantChatTurn = (role, content) => {
    transientAssistantChatTurns.push({
      role,
      content,
      created_at_utc: new Date().toISOString(),
    })
  }
  const readTransientAssistantChatTurns = (limit) => {
    const normalizedLimit = validatePositiveLimit(limit, 20)
    return transientAssistantChatTurns.slice(-normalizedLimit)
  }
  const clearTransientAssistantChatTurns = () => {
    transientAssistantChatTurns.length = 0
  }

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

  options.ipcMain.handle('study:lookup-sentence', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateLookupSentencePayload(payload)
    try {
      return await runPythonBridgeWithArgsRead(['lookup-sentence', validatedPayload.query])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to look up sentence: ${detail}`)
    }
  })

  options.ipcMain.handle('study:get-grammar-minigame-data', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateGrammarMinigameRequest(payload)
    try {
      const args = ['grammar-minigame-data', validatedPayload.gameType]
      if (typeof validatedPayload.sentence === 'string') {
        args.push(validatedPayload.sentence)
      }
      args.push(String(validatedPayload.seed))
      return await runPythonBridgeWithArgsRead(args)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch grammar minigame data: ${detail}`)
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
    appendTransientAssistantChatTurn(validatedPayload.role, validatedPayload.content)
    return { ok: true }
  })

  options.ipcMain.handle('assistant:get-chat-history', async (event, limit) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    return {
      ok: true,
      turns: readTransientAssistantChatTurns(limit),
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
    clearTransientAssistantChatTurns()
    return { ok: true }
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
    appendTransientAssistantChatTurn('user', validatedPayload.message)

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
      appendTransientAssistantChatTurn('assistant', response.text)
      return response
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to send assistant chat message: ${detail}`)
    }
  })

  options.ipcMain.handle('assistant-chat:extract-image-text', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedPayload = validateAssistantChatImagePayload(payload)
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')

    const extensionByMime = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    }
    const extension = extensionByMime[validatedPayload.mimeType] || 'img'
    const tempFile = path.join(
      os.tmpdir(),
      `jplearn-chat-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
    )

    try {
      fs.writeFileSync(tempFile, Buffer.from(validatedPayload.imageBase64, 'base64'))
      return await options.runPythonBridgeWithArgs([
        'assistant-chat-ocr',
        tempFile,
        String(validatedPayload.minConfidence),
      ])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to extract image text: ${detail}`)
    } finally {
      try {
        fs.unlinkSync(tempFile)
      } catch {
        // Best-effort temp cleanup.
      }
    }
  })

  options.ipcMain.handle('assistant-chat:translate-ocr-text', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new Error('OCR text is required for translation.')
    }
    if (text.length > 24000) {
      throw new Error('OCR text exceeds maximum supported length.')
    }
    const sourceLang = typeof payload?.sourceLang === 'string' ? payload.sourceLang.trim().toLowerCase() : 'ja'
    const targetLang = typeof payload?.targetLang === 'string' ? payload.targetLang.trim().toLowerCase() : 'en'
    try {
      if (
        typeof options.localTutorRuntime.translateText !== 'function'
        || sourceLang !== 'ja'
        || targetLang !== 'en'
      ) {
        throw new Error('OCR translation is unavailable: no translation runtime found.')
      }

      return await options.localTutorRuntime.translateText(text, {
        sourceLang,
        targetLang,
        maxOutputTokens: 240,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to translate OCR text: ${detail}`)
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

  options.ipcMain.handle('audio:list-voices', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return options.localVoiceRuntime.listVoices?.() ?? []
    } catch {
      return []
    }
  })

  options.ipcMain.handle('audio:preload', async (event, speaker) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    let requestedSpeaker
    if (typeof speaker === 'string') {
      const normalized = speaker.trim()
      requestedSpeaker = normalized || undefined
    } else if (Number.isInteger(speaker) && speaker >= 0 && speaker <= 100000) {
      requestedSpeaker = speaker
    }
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
      return {
        ok: false,
        format: 'wav',
        sampleRate: 24000,
        voiceId: String(validatedPayload.speaker ?? 'unknown'),
        audioBase64: '',
        error: `Failed to synthesize speech: ${detail}`,
      }
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

  options.ipcMain.handle('ui:inspect-element', (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (!win || win.isDestroyed()) {
      return { ok: false }
    }

    const contents = win.webContents
    if (!contents.isDevToolsOpened()) {
      contents.openDevTools({ mode: 'detach', activate: true })
    }

    const devtools = contents.devToolsWebContents
    if (devtools && typeof devtools.sendInputEvent === 'function') {
      devtools.focus()
      const inspectModifiers = process.platform === 'darwin' ? ['meta', 'alt'] : ['control', 'shift']
      devtools.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: inspectModifiers })
      devtools.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers: inspectModifiers })
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
      if (typeof tier !== 'string' || !['low', 'medium', 'high', 'ultra'].includes(tier)) {
        throw new Error('Invalid model tier')
      }
      try {
        const result = await runWithTransientRetry(() => setupRuntime.downloadModel(tier, event.sender, options.repoRoot))
        const shouldRefreshRuntime = Boolean(
          !result?.alreadyInstalled
          || result?.llamaCppDownloaded
          || result?.selectedAsActive,
        )
        if (shouldRefreshRuntime && typeof options.refreshTutorChatRuntime === 'function') {
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
      if (typeof tier !== 'string' || !['low', 'medium', 'high', 'ultra'].includes(tier)) {
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
      if (typeof tier !== 'string' || !['low', 'medium', 'high', 'ultra'].includes(tier)) {
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

    options.ipcMain.handle('setup:download-voice-engine', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      const safeTier = typeof tier === 'string' && ['0.6b'].includes(tier) ? tier : '0.6b'
      try {
        const result = await runWithTransientRetry(() => setupRuntime.downloadVoiceEngine(safeTier, event.sender, options.repoRoot))
        if (!result?.alreadyInstalled && typeof options.refreshVoiceRuntime === 'function') {
          await options.refreshVoiceRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`voice engine download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:set-active-voice-model', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['0.6b'].includes(tier)) {
        throw new Error('Invalid voice model tier')
      }
      try {
        const result = setupRuntime.setActiveVoiceModel(tier)
        if (typeof options.refreshVoiceRuntime === 'function') {
          await options.refreshVoiceRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to select voice model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:uninstall-voice-model', async (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['0.6b'].includes(tier)) {
        throw new Error('Invalid voice model tier')
      }
      try {
        const result = setupRuntime.uninstallVoiceModel(tier)
        if (typeof options.refreshVoiceRuntime === 'function') {
          await options.refreshVoiceRuntime()
        }
        return result
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to uninstall voice model: ${detail}`)
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

    options.ipcMain.handle('setup:download-speech-model', async (event, tier, downloadOptions) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['fast', 'balanced', 'high', 'ultra'].includes(tier)) {
        throw new Error('Invalid speech model tier')
      }
      try {
        const result = await setupRuntime.downloadSpeechModel(tier, event.sender, options.repoRoot, downloadOptions || {})
        // Restart speech server so it picks up the new model + any newly installed CUDA libs
        options.speechRuntime?.restart()
        return result
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

    options.ipcMain.handle('setup:download-ocr-model', async (event, tier, downloadOptions) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['standard'].includes(tier)) {
        throw new Error('Invalid OCR model tier')
      }
      const force = Boolean(downloadOptions && typeof downloadOptions === 'object' && downloadOptions.force)
      try {
        return await setupRuntime.downloadOcrModel(tier, event.sender, options.repoRoot, { force })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`OCR model download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:set-active-ocr-model', (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['standard'].includes(tier)) {
        throw new Error('Invalid OCR model tier')
      }
      try {
        return setupRuntime.setActiveOcrModelTier(tier)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to select OCR model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:uninstall-ocr-model', (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['standard'].includes(tier)) {
        throw new Error('Invalid OCR model tier')
      }
      try {
        return setupRuntime.uninstallOcrModel(tier)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to uninstall OCR model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:download-translation-model', async (event, tier, downloadOptions) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['qwen_ja_en'].includes(tier)) {
        throw new Error('Invalid translation model tier')
      }
      const force = Boolean(downloadOptions && typeof downloadOptions === 'object' && downloadOptions.force)
      try {
        return await setupRuntime.downloadTranslationModel(tier, event.sender, options.repoRoot, { force })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Translation model download failed: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:set-active-translation-model', (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['qwen_ja_en'].includes(tier)) {
        throw new Error('Invalid translation model tier')
      }
      try {
        return setupRuntime.setActiveTranslationModelTier(tier)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to select translation model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:uninstall-translation-model', (event, tier) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['qwen_ja_en'].includes(tier)) {
        throw new Error('Invalid translation model tier')
      }
      try {
        return setupRuntime.uninstallTranslationModel(tier)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to uninstall translation model: ${detail}`)
      }
    })

    options.ipcMain.handle('setup:apply-translation-profile', async (event, tier, applyOptions) => {
      assertTrustedIpcSender(event, trustedSenderOptions())
      if (typeof tier !== 'string' || !['ocr_qwen_local'].includes(tier)) {
        throw new Error('Invalid translation profile tier')
      }
      const force = Boolean(applyOptions && typeof applyOptions === 'object' && applyOptions.force)
      try {
        return await setupRuntime.applyTranslationProfile(tier, event.sender, options.repoRoot, { force })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Translation profile apply failed: ${detail}`)
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

  options.ipcMain.handle('config:get', async (event, key) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validatedKey = validateConfigKey(key)
    const value = await getConfigValue(validatedKey)
    return { ok: true, key: validatedKey, value }
  })

  options.ipcMain.handle('config:set', async (event, payload) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const { key, value } = validateConfigSetPayload(payload)
    await setConfigValue(key, value)
    return { ok: true, key, value }
  })

  options.ipcMain.handle('debug:bridge-telemetry', (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (!win || win.isDestroyed()) {
      return { ok: false, error: 'Window unavailable' }
    }
    const snapshot = typeof options.getBridgeTelemetrySnapshot === 'function'
      ? options.getBridgeTelemetrySnapshot()
      : null
    if (!snapshot) {
      return { ok: false, error: 'Telemetry unavailable' }
    }
    return { ok: true, ...snapshot }
  })

  options.ipcMain.handle('debug:restart-bridge', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    if (typeof options.stopPythonBridgeWorker === 'function') {
      options.stopPythonBridgeWorker()
    }
    return { ok: true }
  })

  options.ipcMain.handle('debug:clear-caches', (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    clearBridgeReadCaches()
    return { ok: true }
  })

  options.ipcMain.handle('debug:reload-fonts', async (event) => {
    const win = assertTrustedIpcSender(event, trustedSenderOptions())
    if (!win || win.isDestroyed()) {
      return { ok: false }
    }
    if (typeof options.reloadLocalFontsForContents === 'function') {
      return await options.reloadLocalFontsForContents(win.webContents)
    }
    return { ok: false }
  })

  options.ipcMain.handle('debug:diagnostics', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('diagnostics')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to run diagnostics: ${detail}`)
    }
  })

  options.ipcMain.handle('debug:snapshot', async (event) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    try {
      return await runPythonBridgeRead('snapshot')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to run snapshot: ${detail}`)
    }
  })

  options.ipcMain.handle('debug:run-check', async (event, checkName) => {
    assertTrustedIpcSender(event, trustedSenderOptions())
    const validChecks = ['arch', 'db', 'srs']
    if (!validChecks.includes(checkName)) {
      throw new Error(`Invalid check name: ${checkName}. Must be one of: ${validChecks.join(', ')}`)
    }
    try {
      return await options.runPythonBridgeWithArgs(['run-check', checkName])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to run check '${checkName}': ${detail}`)
    }
  })
}

module.exports = {
  registerIpcHandlers,
}
