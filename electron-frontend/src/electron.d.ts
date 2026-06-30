// Core payload types are generated from Python dataclasses in desktop_bridge.py.
// Run: python scripts/generate_ts_types.py
import type {
  DeckSummary,
  FeatureStatusPayload,
  GameCard,
  OverviewCharacterCard,
  ProgressionNodeStatusPayload,
  RecommendationPayload,
  SessionGoalPayload,
  SessionSummaryPayload,
  TutorReactionPayload,
  XPProgressPayload,
} from './generated/types'

interface DesktopVersions {
  chrome: string
  electron: string
  node: string
}

interface StudySummary {
  decks: DeckSummary[]
  streak: {
    current_days: number
    best_days: number
  }
  activity: {
    week: {
      days: number
      reviewed: number
      correct: number
      incorrect: number
      accuracy: number
      points_earned: number
      active_days: number
    }
    month: {
      days: number
      reviewed: number
      correct: number
      incorrect: number
      accuracy: number
      points_earned: number
      active_days: number
    }
  }
  mistakes: Array<{
    key: string
    attempts: number
    mistakes: number
    error_rate: number
  }>
  item_history: Array<{
    key: string
    script_tag: string
    deck: string
    card_id: number
    prompt: string
    trend: 'improving' | 'stable' | 'declining'
    events: Array<{
      reviewed_at_utc: string
      outcome: 'correct' | 'incorrect'
      points_delta: number
    }>
  }>
  curriculum: {
    context_cloze: {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      accuracy_7d: number
      stage_distribution: {
        1: number
        2: number
        3: number
      }
    }
    context_cloze_by_script: Record<ScriptCurriculumSlug, {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      accuracy_7d: number
      stage_distribution: {
        1: number
        2: number
        3: number
      }
    }>
    narrative_story: {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      chapters: Record<'1' | '2' | '3', {
        attempts: number
        accuracy: number
        completion_rate: number
      }>
    }
    narrative_story_by_script: Record<ScriptCurriculumSlug, {
      mode: string
      script_tag: string
      attempts: number
      accuracy: number
      chapters: Record<'1' | '2' | '3', {
        attempts: number
        accuracy: number
        completion_rate: number
      }>
    }>
  }
}

type DeckSlug =
  | 'hiragana'
  | 'katakana'
  // Kanji — JLPT levels
  | 'kanji_n5'
  | 'kanji_n4'
  | 'kanji_n3'
  | 'kanji_n2'
  | 'kanji_n1'
  // Kanji — thematic categories
  | 'kanji_numbers_time'
  | 'kanji_nature_world'
  | 'kanji_people_body'
  | 'kanji_study_language'
  | 'kanji_actions_travel'
  // Vocabulary — JLPT levels
  | 'vocab_n5'
  | 'vocab_n4'
  | 'vocab_n3'
  | 'vocab_n2'
  | 'vocab_n1'
  // Vocabulary — thematic categories
  | 'vocab_greetings'
  | 'vocab_numbers'
  | 'vocab_time_days'
  | 'vocab_family'
  | 'vocab_body'
  | 'vocab_food_drink'
  | 'vocab_school_study'
  | 'vocab_places'
  | 'vocab_transport'
  | 'vocab_adjectives'
  | 'vocab_verbs'
  | 'vocab_nouns'
  // Grammar / Conversational
  | 'grammar_patterns'
type ScriptCurriculumSlug = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns'
type ExpertiseLevel = 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation'

interface ScriptDeckPayload {
  slug: string
  name: string
  cards: GameCard[]
}

interface StudyQueuePayload {
  slug: string
  card_ids: number[]
  indices: number[]
}

interface StudyQueueResponse {
  ok: boolean
  queue: StudyQueuePayload
}

interface BlockInfo {
  index: number
  name: string
  card_ids: number[]
  sample_chars: string[]
  characters: string[]
  meanings: string[]
  romajis: string[]
  mastery: number
  unlocked: boolean
}

interface BlockProgressPayload {
  slug: string
  blocks: BlockInfo[]
}

interface OverviewCharacterMasteryPayload {
  blocks: {
    hiragana: BlockInfo[]
    katakana: BlockInfo[]
  }
  category_blocks: {
    vocab_n5: BlockInfo[]
    grammar_patterns: BlockInfo[]
  }
  kanji_cards: OverviewCharacterCard[]
}

interface SessionGoalStartResponse {
  ok: boolean
  goal: SessionGoalPayload
}

interface SessionSummaryResponse {
  ok: boolean
  summary?: SessionSummaryPayload
  error?: string
}

interface AssistantProfile {
  persona_style: string
  popup_cadence: string
  emotion_persistence: string
  llm_backend: string
  chat_retention: string
  updated_at_utc: string
}

interface AssistantStatePayload {
  mood: string
  momentum: number
  confidence_level: number
  focus_area: string
  last_major_event: string
}

interface AssistantEventPayload {
  id?: number
  event_type: string
  priority: 'info' | 'coaching' | 'critical' | 'celebration'
  message_key: string
  metadata: Record<string, string>
}

interface AssistantSnapshotResponse {
  ok: boolean
  snapshot: {
    profile: AssistantProfile
    state: AssistantStatePayload
    events: AssistantEventPayload[]
  }
}

interface AssistantEventsResponse {
  ok: boolean
  events: Array<AssistantEventPayload & { id: number }>
}

interface AssistantChatTurn {
  role: 'user' | 'assistant'
  content: string
  created_at_utc: string
}

interface AssistantChatHistoryResponse {
  ok: boolean
  turns: AssistantChatTurn[]
}

interface AssistantPreloadedChatHistoryResponse {
  ok: boolean
  turns: AssistantChatTurn[]
  runtimeActive: boolean
  source?: string
}

interface AssistantChatRuntimeStatus {
  loaded: boolean
  loadedAtUtc: string | null
  lastUsedAtUtc: string | null
  inactivityUnloadMs: number
  configuredProvider?: string
  activeProvider?: string
  activeModel?: string
  lastError?: string | null
}

interface AssistantChatRuntimeResponse {
  ok: boolean
  text: string
  provider: string
  model: string
  coldStart: boolean
  elapsedMs: number
}

interface DesktopApi {
  versions: DesktopVersions
  getStudySummary: () => Promise<StudySummary>
  getBlockProgress: (slug: DeckSlug) => Promise<BlockProgressPayload>
  getDeckCards: (slug: DeckSlug) => Promise<ScriptDeckPayload>
  getStudyQueue: (slug: DeckSlug) => Promise<StudyQueueResponse>
  getOverviewCharacterMastery: () => Promise<OverviewCharacterMasteryPayload>
  notifyStartupReady: (payload?: {
    startupReadyMs?: number
    firstSummaryMs?: number | null
    deferredLoadsQueuedAtMs?: number
  }) => Promise<{ ok: boolean }>
  setStartupTheme: (theme: string) => Promise<{ ok: boolean; theme: string }>
  recordGameResult: (payload: {
    slug: DeckSlug
    cardId: number
    isCorrect: boolean
    minigame: string
    curriculumStage?: number
    sessionId?: string
    confidenceScore?: number
  }) => Promise<{
    ok: boolean
    card_id: number
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
    confidence_score?: number | null
    curriculum_stage?: number | null
  }>
  startSessionGoal: (payload: {
    targetItems: number
    targetMinutes?: number
    targetAccuracy?: number
    sessionId?: string
  }) => Promise<SessionGoalStartResponse>
  getSessionSummary: (sessionId: string) => Promise<SessionSummaryResponse>
  applyExpertiseLevel: (level: ExpertiseLevel) => Promise<{
    ok: boolean
    level: ExpertiseLevel
    seeded_cards: number
    decks: string[]
  }>
  getAssistantSnapshot?: (sessionId?: string) => Promise<AssistantSnapshotResponse>
  getAssistantEvents?: (limit?: number) => Promise<AssistantEventsResponse>
  consumeAssistantEvents?: (eventIds: number[]) => Promise<{ ok: boolean; consumed: number }>
  trackAssistantEvent?: (payload: {
    eventId: number
    interactionType: 'clicked' | 'ignored' | 'expired'
    metadata?: Record<string, string>
  }) => Promise<{ ok: boolean }>
  appendAssistantChatTurn?: (payload: {
    role: 'user' | 'assistant'
    content: string
  }) => Promise<{ ok: boolean }>
  getAssistantChatHistory?: (limit?: number) => Promise<AssistantChatHistoryResponse>
  getPreloadedAssistantChatHistory?: () => Promise<AssistantPreloadedChatHistoryResponse>
  clearAssistantChatHistory?: () => Promise<{ ok: boolean; removed: number }>
  getAssistantChatRuntimeStatus?: () => Promise<AssistantChatRuntimeStatus>
  preloadAssistantChatRuntime?: () => Promise<{ ok: boolean; reason: string; coldStart: boolean; loaded: boolean }>
  sendAssistantChatMessage?: (payload: {
    message: string
    context?: Record<string, string>
  }) => Promise<AssistantChatRuntimeResponse>
  unloadAssistantChatRuntime?: () => Promise<{ ok: boolean; reason: string }>
  cancelAssistantChatInference?: () => Promise<{ ok: boolean; cancelled: boolean; reason: string }>
  speakText?: (payload: string | { text: string; speaker?: number; speed?: number }) => Promise<VoiceSpeakResponse>
  getVoiceStatus?: () => Promise<VoiceStatus>
  preloadVoice?: (speaker?: number) => Promise<{ ok: boolean; ready: boolean }>
  resetStudyDb: () => Promise<{ ok: boolean }>
  minimizeWindow: () => Promise<{ ok: boolean }>
  toggleMaximizeWindow: () => Promise<{ ok: boolean; isMaximized: boolean }>
  isWindowMaximized: () => Promise<{ isMaximized: boolean }>
  onWindowStateChanged?: (listener: (state: { isMaximized: boolean }) => void) => () => void
  closeWindow: () => Promise<{ ok: boolean }>
  getProgressionState?: () => Promise<ProgressionStatePayload>
  getFeatureState?: () => Promise<FeatureStatePayload>
  getXpProgress?: () => Promise<XPProgress>
  getRecommendations?: () => Promise<RecommendationsPayload>
  getTutorReactions?: () => Promise<TutorReactionsPayload>
  dismissTutorReaction?: (dedupKey: string) => Promise<{ ok: boolean }>
  getJLPTReadiness?: () => Promise<JLPTReadinessPayload>
  buildJLPTExamQueue?: (level: JLPTLevel, mode: JLPTExamMode, count?: number) => Promise<JLPTExamQueuePayload>
  saveJLPTExamResult?: (payload: JLPTSaveResultPayload) => Promise<{ ok: boolean; id: number }>
  getJLPTExamHistory?: (level?: JLPTLevel | '', mode?: JLPTExamMode | '') => Promise<JLPTExamHistoryPayload>
}

interface VoiceStatus {
  available: boolean
  modelReady: boolean
  downloading: boolean
  downloadProgress: number
  modelName: string
  lastError: string | null
}

interface VoiceSpeakResponse {
  ok: boolean
  format: 'wav'
  sampleRate: number
  voiceId: number
  audioBase64: string
}

// ---- JLPT preparation types ----
type JLPTLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'
type JLPTExamMode = 'mock_exam' | 'diagnostic' | 'adaptive_review' | 'weak_area_drill'

interface JLPTLevelReadiness {
  level: JLPTLevel
  mastered_vocab: number
  total_vocab: number
  mastered_kanji: number
  total_kanji: number
  readiness_pct: number
  is_ready: boolean
  pass_mark: number
  vocab_grammar_section_max: number
  vocab_grammar_pass_mark: number
}

interface JLPTReadinessPayload {
  recommended_target: JLPTLevel
  levels: Record<JLPTLevel, JLPTLevelReadiness>
}

interface JLPTExamCardData {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence: string | null
}

interface JLPTExamQuestion {
  card_id: number
  deck: string
  question_type: string
  level: JLPTLevel
  card: JLPTExamCardData
  distractor_meanings: string[]
  distractor_card_ids: number[]
}

interface JLPTExamQueuePayload {
  level: JLPTLevel
  mode: JLPTExamMode
  questions: JLPTExamQuestion[]
}

interface JLPTSaveResultPayload {
  level: JLPTLevel
  mode: JLPTExamMode
  questionsAnswered: number
  correct: number
  accuracy: number
  projectedScore: number | null
}

interface JLPTExamResultRecord {
  id: number
  level: JLPTLevel
  mode: JLPTExamMode
  questions_answered: number
  correct: number
  accuracy: number
  projected_score: number | null
  completed_at_utc: string
}

interface JLPTExamHistoryPayload {
  results: JLPTExamResultRecord[]
}

// ProgressionNodeStatus keeps a narrow status union; the generated type uses string.
interface ProgressionNodeStatus extends Omit<ProgressionNodeStatusPayload, 'status'> {
  status: 'locked' | 'unlocked' | 'active' | 'mastered'
}

interface ProgressionStatePayload {
  nodes: ProgressionNodeStatus[]
}

// FeatureStatus, XPProgress, RecommendationItem — identical to generated; use aliases.
type FeatureStatus = FeatureStatusPayload
type XPProgress = XPProgressPayload
type RecommendationItem = RecommendationPayload

interface FeatureStatePayload {
  features: FeatureStatus[]
}

interface RecommendationsPayload {
  recommendations: RecommendationItem[]
}

// TutorReactionItem keeps narrow priority/message_type unions; the generated type uses string.
interface TutorReactionItem extends Omit<TutorReactionPayload, 'priority' | 'message_type'> {
  priority: 'low' | 'normal' | 'high'
  message_type: 'congratulation' | 'encouragement' | 'guidance' | 'acknowledgement'
}

interface TutorReactionsPayload {
  reactions: TutorReactionItem[]
}

declare global {
  interface Window {
    jplearnDesktop: DesktopApi
  }
}

export {}
