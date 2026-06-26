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

  return {
    slug,
    cardId: payload.cardId,
    isCorrect: payload.isCorrect,
    minigame: payload.minigame || '',
    curriculumStage: payload.curriculumStage,
  }
}

module.exports = {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
}
