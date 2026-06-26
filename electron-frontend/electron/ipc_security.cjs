const VALID_DECK_SLUGS = new Set([
  'hiragana',
  'katakana',
  'kanji_n5',
  'kanji_n4',
  'kanji_n3',
  'kanji_n2',
  'kanji_n1',
  'vocab_n5',
  'vocab_n4',
  'vocab_n3',
  'vocab_n2',
  'vocab_n1',
  'grammar_patterns',
])

function isAllowedRendererUrl(rawUrl, isDev) {
  try {
    const parsed = new URL(rawUrl)
    if (isDev) {
      return parsed.protocol === 'http:' && parsed.hostname === 'localhost' && parsed.port === '5173'
    }
    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

function assertTrustedIpcSender(event, options) {
  const sender = event?.sender
  if (!sender) {
    throw new Error('Rejected IPC request: missing sender webContents')
  }

  const win = options.getWindowFromSender(sender)
  if (!win || win.isDestroyed()) {
    throw new Error('Rejected IPC request: unknown or destroyed BrowserWindow sender')
  }

  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== sender.mainFrame) {
    throw new Error('Rejected IPC request: non-main-frame sender')
  }

  const senderUrl = senderFrame.url
  if (!isAllowedRendererUrl(senderUrl, options.isDev)) {
    throw new Error(`Rejected IPC request from untrusted URL: ${senderUrl || '(empty)'}`)
  }

  return win
}

function validateDeckSlug(slug) {
  if (typeof slug !== 'string' || !VALID_DECK_SLUGS.has(slug)) {
    throw new Error(`Invalid deck slug: ${String(slug)}`)
  }
  return slug
}

function validateStartupThemeInput(theme) {
  if (typeof theme !== 'string') {
    throw new Error(`Invalid startup theme value: ${String(theme)}`)
  }
  return theme
}

function validateRecordGameResultPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid record game result payload: expected object')
  }

  const slug = validateDeckSlug(payload.slug)
  if (typeof payload.cardId !== 'number' || !Number.isFinite(payload.cardId)) {
    throw new Error(`Invalid cardId: ${String(payload.cardId)}`)
  }
  if (typeof payload.isCorrect !== 'boolean') {
    throw new Error(`Invalid isCorrect flag: ${String(payload.isCorrect)}`)
  }

  if (payload.minigame != null && typeof payload.minigame !== 'string') {
    throw new Error(`Invalid minigame value: ${String(payload.minigame)}`)
  }

  if (payload.curriculumStage != null) {
    if (!Number.isInteger(payload.curriculumStage) || payload.curriculumStage < 1 || payload.curriculumStage > 3) {
      throw new Error(`Invalid curriculumStage value: ${String(payload.curriculumStage)}`)
    }
  }

  let confidenceScore
  if (payload.confidenceScore != null) {
    if (!Number.isInteger(payload.confidenceScore) || payload.confidenceScore < 1 || payload.confidenceScore > 5) {
      throw new Error(`Invalid confidenceScore value: ${String(payload.confidenceScore)}`)
    }
    confidenceScore = payload.confidenceScore
  }

  let sessionId
  if (payload.sessionId != null) {
    sessionId = validateSessionId(payload.sessionId)
  }

  return {
    slug,
    cardId: payload.cardId,
    isCorrect: payload.isCorrect,
    minigame: payload.minigame || '',
    curriculumStage: payload.curriculumStage,
    sessionId,
    confidenceScore,
  }
}

function validateSessionId(value) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid session id: ${String(value)}`)
  }
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Invalid session id: value must not be empty')
  }
  return normalized
}

function validateSessionGoalPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid session goal payload: expected object')
  }

  const targetItems = payload.targetItems
  if (!Number.isInteger(targetItems) || targetItems <= 0) {
    throw new Error(`Invalid targetItems value: ${String(targetItems)}`)
  }

  let targetMinutes
  if (payload.targetMinutes != null) {
    if (!Number.isInteger(payload.targetMinutes) || payload.targetMinutes <= 0) {
      throw new Error(`Invalid targetMinutes value: ${String(payload.targetMinutes)}`)
    }
    targetMinutes = payload.targetMinutes
  }

  let targetAccuracy
  if (payload.targetAccuracy != null) {
    if (!Number.isInteger(payload.targetAccuracy) || payload.targetAccuracy < 0 || payload.targetAccuracy > 100) {
      throw new Error(`Invalid targetAccuracy value: ${String(payload.targetAccuracy)}`)
    }
    targetAccuracy = payload.targetAccuracy
  }

  let sessionId
  if (payload.sessionId != null) {
    sessionId = validateSessionId(payload.sessionId)
  }

  return {
    targetItems,
    targetMinutes,
    targetAccuracy,
    sessionId,
  }
}

function validatePronunciationPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid pronunciation payload: expected object')
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) {
    throw new Error('Invalid pronunciation text: value must not be empty')
  }
  if (text.length > 120) {
    throw new Error('Invalid pronunciation text: max length is 120 characters')
  }

  let provider
  if (payload.provider != null) {
    if (typeof payload.provider !== 'string') {
      throw new Error(`Invalid pronunciation provider: ${String(payload.provider)}`)
    }
    const normalizedProvider = payload.provider.trim()
    if (!['edge_tts', 'kokoro_tts'].includes(normalizedProvider)) {
      throw new Error(`Invalid pronunciation provider: ${String(payload.provider)}`)
    }
    provider = normalizedProvider
  }

  let voice
  if (payload.voice != null) {
    if (typeof payload.voice !== 'string') {
      throw new Error(`Invalid pronunciation voice: ${String(payload.voice)}`)
    }
    const normalizedVoice = payload.voice.trim()
    if (!normalizedVoice) {
      throw new Error('Invalid pronunciation voice: value must not be empty')
    }
    if (normalizedVoice.length > 64) {
      throw new Error('Invalid pronunciation voice: max length is 64 characters')
    }
    if (!/^[A-Za-z0-9_:-]+$/.test(normalizedVoice)) {
      throw new Error('Invalid pronunciation voice: unsupported characters')
    }
    voice = normalizedVoice
  }

  let audioRate
  if (payload.audioRate != null) {
    if (typeof payload.audioRate !== 'number' || !Number.isFinite(payload.audioRate)) {
      throw new Error(`Invalid pronunciation audioRate: ${String(payload.audioRate)}`)
    }
    if (payload.audioRate < 0.8 || payload.audioRate > 1.2) {
      throw new Error(`Invalid pronunciation audioRate: ${String(payload.audioRate)}`)
    }
    audioRate = payload.audioRate
  }

  return {
    text,
    provider,
    voice,
    audioRate,
  }
}

module.exports = {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
  validatePronunciationPayload,
  validateSessionGoalPayload,
  validateSessionId,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
}
