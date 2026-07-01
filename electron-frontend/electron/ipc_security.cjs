const VALID_DECK_SLUGS = new Set([
  'hiragana',
  'katakana',
  // Kanji — JLPT levels
  'kanji_n5',
  'kanji_n4',
  'kanji_n3',
  'kanji_n2',
  'kanji_n1',
  // Kanji — thematic categories
  'kanji_numbers_time',
  'kanji_nature_world',
  'kanji_people_body',
  'kanji_study_language',
  'kanji_actions_travel',
  // Kanji — N4 thematic categories
  'kanji_n4_society_roles',
  'kanji_n4_mind_thought',
  'kanji_n4_daily_life',
  'kanji_n4_time_action',
  // Kanji — N3 thematic categories
  'kanji_n3_governance',
  'kanji_n3_communication',
  'kanji_n3_movement',
  'kanji_n3_achievement',
  // Kanji — N2 thematic categories
  'kanji_n2_professionalism',
  'kanji_n2_economics',
  'kanji_n2_analysis',
  // Kanji — N1 thematic categories
  'kanji_n1_law_order',
  'kanji_n1_ideology',
  'kanji_n1_literary',
  // Vocabulary — JLPT levels
  'vocab_n5',
  'vocab_n4',
  'vocab_n3',
  'vocab_n2',
  'vocab_n1',
  // Vocabulary — thematic categories
  'vocab_greetings',
  'vocab_numbers',
  'vocab_time_days',
  'vocab_family',
  'vocab_body',
  'vocab_food_drink',
  'vocab_school_study',
  'vocab_places',
  'vocab_transport',
  'vocab_adjectives',
  'vocab_verbs',
  'vocab_nouns',
  // Grammar / Conversational
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

function validateExpertiseLevelInput(level) {
  const allowed = new Set(['total_beginner', 'know_hiragana', 'know_kana', 'jlpt_n5_foundation', 'jlpt_n4_foundation', 'jlpt_n3_foundation', 'jlpt_n2_foundation', 'jlpt_n1_foundation'])
  if (typeof level !== 'string' || !allowed.has(level)) {
    throw new Error(`Invalid expertise level value: ${String(level)}`)
  }
  return level
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

function validateOptionalSessionId(value) {
  if (value == null) {
    return undefined
  }
  return validateSessionId(value)
}

function validatePositiveLimit(value, fallback) {
  if (value == null) {
    return fallback
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid positive limit value: ${String(value)}`)
  }
  return value
}

function validateDictionarySearchQuery(value) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid dictionary search query: ${String(value)}`)
  }
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Invalid dictionary search query: value must not be empty')
  }
  return normalized
}

function validateAssistantEventIdsPayload(payload) {
  if (!Array.isArray(payload)) {
    throw new Error('Invalid assistant event ids payload: expected array')
  }
  const uniqueIds = []
  const seen = new Set()
  for (const value of payload) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid assistant event id: ${String(value)}`)
    }
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    uniqueIds.push(value)
  }
  return uniqueIds
}

function validateAssistantChatAppendPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid assistant chat append payload: expected object')
  }
  const role = typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : ''
  if (role !== 'user' && role !== 'assistant') {
    throw new Error(`Invalid assistant chat role: ${String(payload.role)}`)
  }
  const content = typeof payload.content === 'string' ? payload.content.trim() : ''
  if (!content) {
    throw new Error('Invalid assistant chat content: value must not be empty')
  }
  if (content.length > 4000) {
    throw new Error('Invalid assistant chat content: maximum length exceeded')
  }
  return {
    role,
    content,
  }
}

function validateAssistantChatRuntimePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid assistant chat runtime payload: expected object')
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : ''
  if (!message) {
    throw new Error('Invalid assistant chat runtime message: value must not be empty')
  }
  if (message.length > 4000) {
    throw new Error('Invalid assistant chat runtime message: maximum length exceeded')
  }

  let context = {}
  if (payload.context != null) {
    if (typeof payload.context !== 'object' || Array.isArray(payload.context)) {
      throw new Error('Invalid assistant chat runtime context: expected object')
    }
    context = payload.context
  }

  return {
    message,
    context,
  }
}

function validateAssistantEventInteractionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid assistant event interaction payload: expected object')
  }

  const eventId = payload.eventId
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new Error(`Invalid assistant event id: ${String(eventId)}`)
  }

  const interactionType =
    typeof payload.interactionType === 'string'
      ? payload.interactionType.trim().toLowerCase()
      : ''
  if (!new Set(['clicked', 'ignored', 'expired']).has(interactionType)) {
    throw new Error(`Invalid assistant interaction type: ${String(payload.interactionType)}`)
  }

  let metadata = {}
  if (payload.metadata != null) {
    if (typeof payload.metadata !== 'object' || Array.isArray(payload.metadata)) {
      throw new Error('Invalid assistant interaction metadata: expected object')
    }
    const normalized = {}
    for (const [key, value] of Object.entries(payload.metadata)) {
      const normalizedKey = String(key).trim()
      if (!normalizedKey) {
        continue
      }
      normalized[normalizedKey] = String(value)
    }
    metadata = normalized
  }

  return {
    eventId,
    interactionType,
    metadata,
  }
}

function validateSpeakPayload(payload) {
  let rawText
  let rawSpeaker
  let rawSpeed
  if (typeof payload === 'string') {
    rawText = payload
  } else if (payload && typeof payload === 'object') {
    rawText = payload.text
    rawSpeaker = payload.speaker
    rawSpeed = payload.speed
  } else {
    throw new Error('Invalid speak payload: expected string or object')
  }

  if (typeof rawText !== 'string') {
    throw new Error(`Invalid speak text: ${String(rawText)}`)
  }
  const text = rawText.trim()
  if (!text) {
    throw new Error('Invalid speak text: value must not be empty')
  }

  const result = { text: text.slice(0, 400) }

  if (rawSpeaker != null) {
    if (!Number.isInteger(rawSpeaker) || rawSpeaker < 0 || rawSpeaker > 100000) {
      throw new Error(`Invalid speaker value: ${String(rawSpeaker)}`)
    }
    result.speaker = rawSpeaker
  }

  if (rawSpeed != null) {
    if (typeof rawSpeed !== 'number' || !Number.isFinite(rawSpeed) || rawSpeed < 0.5 || rawSpeed > 2) {
      throw new Error(`Invalid speed value: ${String(rawSpeed)}`)
    }
    result.speed = rawSpeed
  }

  return result
}

const VALID_JLPT_LEVELS = new Set(['n5', 'n4', 'n3', 'n2', 'n1'])
const VALID_JLPT_MODES = new Set(['mock_exam', 'diagnostic', 'adaptive_review', 'weak_area_drill'])

function validateJLPTLevel(value) {
  if (typeof value !== 'string' || !VALID_JLPT_LEVELS.has(value)) {
    throw new Error(`Invalid JLPT level: ${String(value)}`)
  }
  return value
}

function validateJLPTMode(value) {
  if (typeof value !== 'string' || !VALID_JLPT_MODES.has(value)) {
    throw new Error(`Invalid JLPT exam mode: ${String(value)}`)
  }
  return value
}

function validateOptionalJLPTLevel(value) {
  if (value == null || value === '') return null
  return validateJLPTLevel(value)
}

function validateOptionalJLPTMode(value) {
  if (value == null || value === '') return null
  return validateJLPTMode(value)
}

function validateJLPTSaveResultPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JLPT save result payload: expected object')
  }
  const level = validateJLPTLevel(payload.level)
  const mode = validateJLPTMode(payload.mode)
  const questionsAnswered = Number(payload.questionsAnswered)
  const correct = Number(payload.correct)
  const accuracy = Number(payload.accuracy)
  if (!Number.isFinite(questionsAnswered) || questionsAnswered < 0) {
    throw new Error('Invalid questionsAnswered')
  }
  if (!Number.isFinite(correct) || correct < 0) {
    throw new Error('Invalid correct count')
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) {
    throw new Error('Invalid accuracy value')
  }
  const projectedScore = payload.projectedScore != null ? Number(payload.projectedScore) : null
  if (projectedScore !== null && !Number.isFinite(projectedScore)) {
    throw new Error('Invalid projectedScore')
  }
  return { level, mode, questionsAnswered, correct, accuracy, projectedScore }
}

module.exports = {
  assertTrustedIpcSender,
  isAllowedRendererUrl,
  validateDeckSlug,
  validateExpertiseLevelInput,
  validateSessionGoalPayload,
  validateSessionId,
  validateOptionalSessionId,
  validatePositiveLimit,
  validateDictionarySearchQuery,
  validateAssistantEventIdsPayload,
  validateAssistantEventInteractionPayload,
  validateAssistantChatAppendPayload,
  validateAssistantChatRuntimePayload,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
  validateSpeakPayload,
  validateJLPTLevel,
  validateJLPTMode,
  validateOptionalJLPTLevel,
  validateOptionalJLPTMode,
  validateJLPTSaveResultPayload,
  validateLearningPathId,
  validateAnalyticsExportType,
}

const VALID_LEARNING_PATH_IDS = new Set(['complete_beginner'])

function validateLearningPathId(value) {
  if (typeof value !== 'string' || !VALID_LEARNING_PATH_IDS.has(value)) {
    throw new Error(`Invalid learning path id: ${String(value)}`)
  }
  return value
}

const VALID_ANALYTICS_EXPORT_TYPES = new Set(['review_history', 'accuracy_trends', 'mastery_snapshot'])

function validateAnalyticsExportType(type) {
  if (typeof type !== 'string' || !VALID_ANALYTICS_EXPORT_TYPES.has(type)) {
    throw new Error(`Invalid analytics export type: ${String(type)}`)
  }
  return type
}
