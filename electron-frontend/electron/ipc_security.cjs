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
  'sentence_examples',
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

const MAX_LOOKUP_SENTENCE_QUERY_LENGTH = 200

function validateLookupSentencePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid lookup sentence payload: expected object')
  }
  if (typeof payload.query !== 'string') {
    throw new Error('Invalid lookup sentence payload: query must be a string')
  }
  const query = payload.query.trim().slice(0, MAX_LOOKUP_SENTENCE_QUERY_LENGTH)
  if (!query) {
    throw new Error('Invalid lookup sentence payload: query must not be empty')
  }
  return { query }
}

function validateGrammarMinigameRequest(payload) {
  const allowedGameTypes = new Set(['sentence_assembly', 'particle_cloze', 'vibe_check', 'imposter'])

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid grammar minigame request payload: expected object')
  }

  if (typeof payload.gameType !== 'string' || !allowedGameTypes.has(payload.gameType)) {
    throw new Error(`Invalid grammar minigame gameType: ${String(payload.gameType)}`)
  }

  let sentence
  if (payload.sentence != null) {
    if (typeof payload.sentence !== 'string') {
      throw new Error(`Invalid grammar minigame sentence: ${String(payload.sentence)}`)
    }
    const normalizedSentence = payload.sentence.trim()
    if (normalizedSentence.length > 0) {
      sentence = normalizedSentence
    }
  }

  let seed = 0
  if (payload.seed != null) {
    if (!Number.isInteger(payload.seed) || payload.seed < 0) {
      throw new Error(`Invalid grammar minigame seed: ${String(payload.seed)}`)
    }
    seed = payload.seed
  }

  return {
    gameType: payload.gameType,
    sentence,
    seed,
  }
}

const VALID_DAILY_GAMES_TYPES = new Set(['crossword', 'word_search', 'match_pairs', 'typing_blitz'])
const VALID_DAILY_GAMES_MODES = new Set(['daily', 'practice'])
const VALID_DAILY_GAMES_OUTCOMES = new Set(['correct', 'incorrect'])
const MAX_DAILY_GAMES_POOL_POSITION = 19
const MAX_DAILY_GAMES_SCORE = 1_000_000_000
const MAX_DAILY_GAMES_DURATION_SECONDS = 86_400
const MAX_CROSSWORD_CLUE_ENTRIES = 6
const MAX_CROSSWORD_CLUE_LENGTH = 120

function validateDailyGamesDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid Daily Games day: expected YYYY-MM-DD')
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    throw new Error('Invalid Daily Games day: expected a valid calendar date')
  }
  return value
}

function validateDailyGamesGameType(value) {
  if (typeof value !== 'string' || !VALID_DAILY_GAMES_TYPES.has(value)) {
    throw new Error(`Invalid Daily Games gameType: ${String(value)}`)
  }
  return value
}

function validateDailyGamesPracticeSeedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Daily Games practice seed payload: expected object')
  }
  return {
    day: validateDailyGamesDay(payload.day),
    gameType: validateDailyGamesGameType(payload.gameType),
  }
}

function validateDailyGamesAttemptPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Daily Games attempt payload: expected object')
  }

  if (typeof payload.mode !== 'string' || !VALID_DAILY_GAMES_MODES.has(payload.mode)) {
    throw new Error(`Invalid Daily Games mode: ${String(payload.mode)}`)
  }
  if (!Number.isInteger(payload.score) || payload.score < 0 || payload.score > MAX_DAILY_GAMES_SCORE) {
    throw new Error(`Invalid Daily Games score: ${String(payload.score)}`)
  }
  if (typeof payload.completed !== 'boolean') {
    throw new Error(`Invalid Daily Games completed value: ${String(payload.completed)}`)
  }

  let durationSeconds
  if (payload.durationSeconds !== undefined) {
    if (
      !Number.isInteger(payload.durationSeconds)
      || payload.durationSeconds < 0
      || payload.durationSeconds > MAX_DAILY_GAMES_DURATION_SECONDS
    ) {
      throw new Error(`Invalid Daily Games durationSeconds: ${String(payload.durationSeconds)}`)
    }
    durationSeconds = payload.durationSeconds
  }

  if (!Array.isArray(payload.outcomes) || payload.outcomes.length === 0) {
    throw new Error('Invalid Daily Games outcomes: expected a non-empty array')
  }
  const positions = new Set()
  const outcomes = payload.outcomes.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid Daily Games outcome at index ${index}: expected object`)
    }
    if (
      !Number.isInteger(item.poolPosition)
      || item.poolPosition < 0
      || item.poolPosition > MAX_DAILY_GAMES_POOL_POSITION
    ) {
      throw new Error(`Invalid Daily Games poolPosition at index ${index}: ${String(item.poolPosition)}`)
    }
    if (positions.has(item.poolPosition)) {
      throw new Error(`Invalid Daily Games outcomes: duplicate poolPosition ${item.poolPosition}`)
    }
    if (typeof item.outcome !== 'string' || !VALID_DAILY_GAMES_OUTCOMES.has(item.outcome)) {
      throw new Error(`Invalid Daily Games outcome value at index ${index}: ${String(item.outcome)}`)
    }
    positions.add(item.poolPosition)
    return {
      poolPosition: item.poolPosition,
      outcome: item.outcome,
    }
  })

  return {
    day: validateDailyGamesDay(payload.day),
    gameType: validateDailyGamesGameType(payload.gameType),
    mode: payload.mode,
    score: payload.score,
    completed: payload.completed,
    durationSeconds,
    outcomes,
  }
}

function validateDailyGamesCrosswordClues(value, requireAnswers) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CROSSWORD_CLUE_ENTRIES) {
    throw new Error('Invalid crossword clues: expected a bounded non-empty array')
  }
  const positions = new Set()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid crossword clue at index ${index}`)
    }
    if (!Number.isInteger(item.poolPosition) || item.poolPosition < 0 || item.poolPosition > MAX_DAILY_GAMES_POOL_POSITION || positions.has(item.poolPosition)) {
      throw new Error(`Invalid crossword clue poolPosition at index ${index}`)
    }
    let entry
    if (requireAnswers) {
      const answer = typeof item.answer === 'string' ? item.answer.trim() : ''
      const fallbackClue = typeof item.fallbackClue === 'string' ? item.fallbackClue.trim() : ''
      if (!answer || answer.length > 24 || !fallbackClue || fallbackClue.length > MAX_CROSSWORD_CLUE_LENGTH) {
        throw new Error(`Invalid crossword clue request at index ${index}`)
      }
      entry = { poolPosition: item.poolPosition, answer, fallbackClue }
    } else {
      const clue = typeof item.clue === 'string' ? item.clue.trim() : ''
      if (!clue || clue.length > MAX_CROSSWORD_CLUE_LENGTH) {
        throw new Error(`Invalid crossword clue text at index ${index}`)
      }
      entry = { poolPosition: item.poolPosition, clue }
    }
    positions.add(item.poolPosition)
    return entry
  })
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

const VALID_ASSISTANT_CHAT_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_ASSISTANT_CHAT_IMAGE_BASE64_LENGTH = 44 * 1024 * 1024

function validateAssistantChatImagePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid assistant chat image payload: expected object')
  }
  const imageBase64 = typeof payload.imageBase64 === 'string' ? payload.imageBase64.trim() : ''
  if (!imageBase64) {
    throw new Error('Invalid assistant chat image payload: missing image data')
  }
  if (imageBase64.length > MAX_ASSISTANT_CHAT_IMAGE_BASE64_LENGTH) {
    throw new Error('Invalid assistant chat image payload: image data too large')
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new Error('Invalid assistant chat image payload: image data is not valid base64')
  }
  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.trim().toLowerCase() : ''
  if (!VALID_ASSISTANT_CHAT_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Invalid assistant chat image payload: unsupported mime type ${String(payload.mimeType)}`)
  }
  let minConfidence = 0.3
  if (payload.minConfidence != null) {
    const parsed = Number(payload.minConfidence)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error('Invalid assistant chat image payload: minConfidence must be between 0 and 1')
    }
    minConfidence = parsed
  }
  return {
    imageBase64,
    mimeType,
    minConfidence,
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
    if (typeof rawSpeaker === 'string') {
      const normalizedSpeaker = rawSpeaker.trim()
      if (!normalizedSpeaker) {
        throw new Error('Invalid speaker value: value must not be empty')
      }
      result.speaker = normalizedSpeaker
    } else if (Number.isInteger(rawSpeaker) && rawSpeaker >= 0 && rawSpeaker <= 100000) {
      result.speaker = rawSpeaker
    } else {
      throw new Error(`Invalid speaker value: ${String(rawSpeaker)}`)
    }
  }

  if (rawSpeed != null) {
    if (typeof rawSpeed !== 'number' || !Number.isFinite(rawSpeed) || rawSpeed < 0.5 || rawSpeed > 2) {
      throw new Error(`Invalid speed value: ${String(rawSpeed)}`)
    }
    result.speed = rawSpeed
  }

  return result
}

const VALID_SPEECH_MIME_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/wave', 'audio/x-wav'])
const SPEECH_MIME_EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
}
// Base64 length cap (~6 MB decoded). Generous for a short spoken answer clip
// while bounding memory/disk use per transcription request.
const MAX_SPEECH_AUDIO_BASE64_LENGTH = 8 * 1024 * 1024
const VALID_SPEECH_LANGUAGES = new Set(['ja'])

function validateTranscribeSpeechPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid speech transcription payload: expected object')
  }
  const { audioBase64, mimeType, language } = payload

  if (typeof audioBase64 !== 'string' || !audioBase64) {
    throw new Error('Invalid speech transcription payload: missing audio data')
  }
  if (audioBase64.length > MAX_SPEECH_AUDIO_BASE64_LENGTH) {
    throw new Error('Invalid speech transcription payload: audio data too large')
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) {
    throw new Error('Invalid speech transcription payload: audio data is not valid base64')
  }
  if (typeof mimeType !== 'string' || !VALID_SPEECH_MIME_TYPES.has(mimeType)) {
    throw new Error(`Invalid speech transcription payload: unsupported mime type ${String(mimeType)}`)
  }
  const safeLanguage = typeof language === 'string' && VALID_SPEECH_LANGUAGES.has(language) ? language : 'ja'

  return {
    audioBase64,
    extension: SPEECH_MIME_EXTENSIONS[mimeType],
    language: safeLanguage,
  }
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
  validateLookupSentencePayload,
  validateGrammarMinigameRequest,
  validateDailyGamesDay,
  validateDailyGamesPracticeSeedPayload,
  validateDailyGamesAttemptPayload,
  validateDailyGamesCrosswordClues,
  validateAssistantEventIdsPayload,
  validateAssistantEventInteractionPayload,
  validateAssistantChatAppendPayload,
  validateAssistantChatRuntimePayload,
  validateAssistantChatImagePayload,
  validateStartupThemeInput,
  validateRecordGameResultPayload,
  validateSpeakPayload,
  validateTranscribeSpeechPayload,
  validateJLPTLevel,
  validateJLPTMode,
  validateOptionalJLPTLevel,
  validateOptionalJLPTMode,
  validateJLPTSaveResultPayload,
  validateLearningPathId,
  validateAnalyticsExportType,
  validateConfigKey,
  validateConfigSetPayload,
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

const VALID_CONFIG_KEYS = new Set(['autoUpdateEnabled', 'closeBehavior', 'autoStartOnLogin'])

function validateConfigKey(key) {
  if (typeof key !== 'string' || !VALID_CONFIG_KEYS.has(key)) {
    throw new Error(`Invalid config key: ${String(key)}`)
  }
  return key
}

function validateConfigSetPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid config set payload')
  }
  const key = validateConfigKey(payload.key)
  if (key === 'closeBehavior') {
    if (typeof payload.value !== 'string' || !['ask', 'tray', 'quit'].includes(payload.value)) {
      throw new Error(`Invalid config value for key: ${key}. Must be 'ask', 'tray', or 'quit'.`)
    }
    return { key, value: payload.value }
  }
  if (typeof payload.value !== 'boolean') {
    throw new Error(`Invalid config value for key: ${key}`)
  }
  return { key, value: payload.value }
}
