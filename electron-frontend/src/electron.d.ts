// Core payload types are generated from Python dataclasses in desktop_bridge.py.
// Run: python scripts/generate_ts_types.py
import type {
  CardMasteryImportPayload,
  CardMasteryScoresPayload,
  CardNoteDeletePayload,
  CardNoteLookupPayload,
  CardNotePayload,
  ScenarioSessionPayload,
  ScenarioSessionListPayload,
  ScenarioSessionLookupPayload,
  ScenarioSessionDeletePayload,
  ScenarioSessionsClearPayload,
  ScenarioSrsCardPayload,
  DeckSummary,
  DailyGamesPracticeSeedPayload,
  DailyGamesStatePayload,
  FeatureStatusPayload,
  GameCard,
  KanjiDetailPayload,
  OverviewCharacterCard,
  PitchAccent,
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

interface DictionaryLookupItem {
  id: number
  source_id: string | null
  note_key: string
  character: string
  romaji: string
  meaning: string
  tags: string[]
  example_sentence: string | null
  pitch_accents: PitchAccent[]
}

interface DictionaryLookupPayload {
  query: string
  source: 'loaded_cards' | 'offline_dictionary'
  results: DictionaryLookupItem[]
}

interface StudySummary {
  decks: DeckSummary[]
  streak: {
    current_days: number
    best_days: number
    freezes_available: number
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
  minigame_performance: Array<{
    minigame: string
    attempts: number
    correct: number
    accuracy: number
  }>
  session_history: Array<{
    session_id: string
    started_at_utc: string
    target_items: number
    reviewed: number
    correct: number
    accuracy: number
    goal_met: boolean
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
    particle_cloze: {
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
    particle_cloze_by_script: Record<ScriptCurriculumSlug, {
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
    imposter: {
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
    imposter_by_script: Record<ScriptCurriculumSlug, {
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
  // Kanji — N5 thematic categories
  | 'kanji_numbers_time'
  | 'kanji_nature_world'
  | 'kanji_people_body'
  | 'kanji_study_language'
  | 'kanji_actions_travel'
  // Kanji — N4 thematic categories
  | 'kanji_n4_society_roles'
  | 'kanji_n4_mind_thought'
  | 'kanji_n4_daily_life'
  | 'kanji_n4_time_action'
  // Kanji — N3 thematic categories
  | 'kanji_n3_governance'
  | 'kanji_n3_communication'
  | 'kanji_n3_movement'
  | 'kanji_n3_achievement'
  // Kanji — N2 thematic categories
  | 'kanji_n2_professionalism'
  | 'kanji_n2_economics'
  | 'kanji_n2_analysis'
  // Kanji — N1 thematic categories
  | 'kanji_n1_law_order'
  | 'kanji_n1_ideology'
  | 'kanji_n1_literary'
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
  // Vocabulary — N4 thematic categories
  | 'vocab_n4_school_work'
  | 'vocab_n4_home_living'
  | 'vocab_n4_travel_places'
  | 'vocab_n4_feelings_character'
  // Vocabulary — N3 thematic categories
  | 'vocab_n3_work_business'
  | 'vocab_n3_emotion_mind'
  | 'vocab_n3_society_people'
  | 'vocab_n3_nature_science'
  // Vocabulary — N2 thematic categories
  | 'vocab_n2_economy_trade'
  | 'vocab_n2_government_society'
  | 'vocab_n2_measure_analysis'
  | 'vocab_n2_land_construction'
  // Vocabulary — N1 thematic categories
  | 'vocab_n1_law_justice'
  | 'vocab_n1_thought_reason'
  | 'vocab_n1_conflict_crisis'
  | 'vocab_n1_arts_expression'
  // Grammar / Conversational
  | 'grammar_patterns'
  | 'sentence_examples'
type ScriptCurriculumSlug = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns'
type ExpertiseLevel = 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation' | 'jlpt_n4_foundation' | 'jlpt_n3_foundation' | 'jlpt_n2_foundation' | 'jlpt_n1_foundation'

interface ScriptDeckPayload {
  slug: string
  name: string
  cards: GameCard[]
}

interface StudyQueuePayload {
  slug: string
  card_ids: number[]
  indices: number[]
  buckets_due: number
  buckets_leech: number
  buckets_new: number
  buckets_review: number
}

interface StudyQueueResponse {
  ok: boolean
  queue: StudyQueuePayload
}

type GrammarMinigameType = 'sentence_assembly' | 'particle_cloze' | 'vibe_check' | 'imposter'

type DailyGamesGameType = 'crossword' | 'word_search' | 'match_pairs' | 'typing_blitz'
type DailyGamesMode = 'daily' | 'practice'

interface DailyGamesAttemptOutcomeInput {
  poolPosition: number
  outcome: 'correct' | 'incorrect'
}

interface CardNoteSaveRequest {
  noteKey: string
  noteText: string
}

interface ScenarioSessionSaveRequest {
  sessionId: string
  scenarioId: string
  scenarioVersion: number
  learnerLevel: 'beginner' | 'intermediate'
  startedAtUtc: string
  transcript: unknown[]
  summary: Record<string, unknown>
}

interface ScenarioSrsCardSaveRequest {
  id: string
  sessionId: string
  scenarioId: string
  front: string
  back: string
  reading?: string
  notes?: string
}

/** Single-turn context for an uncertain learner response. No transcript, no
 * node ids, no scenario graph — the local model only judges this one utterance
 * against the authored intent list. */
interface ScenarioEvaluationRequest {
  scenarioTitle: string
  npcLine: string
  objectiveDescription: string
  expectedIntents: Array<{ id: string; description: string; examplePhrases: string[] }>
  requiredSlotIds: string[]
  learnerResponse: string
  learnerLevel: 'beginner' | 'intermediate'
}

/** Raw model output plus an ok flag; every failure mode (no model, busy,
 * timeout, abort, stub adapter) arrives as ok:false and is treated by the
 * renderer as "stay uncertain". */
interface ScenarioEvaluationResponse {
  ok: boolean
  text: string
  coldStart?: boolean
}

interface DailyGamesPracticeSeedRequest {
  day: string
  gameType: DailyGamesGameType
}

interface DailyGamesAttemptRequest extends DailyGamesPracticeSeedRequest {
  mode: DailyGamesMode
  score: number
  completed: boolean
  durationSeconds?: number
  outcomes: DailyGamesAttemptOutcomeInput[]
}

interface DailyGamesCrosswordClue {
  poolPosition: number
  clue: string
}

interface DailyGamesCrosswordClueRequest {
  poolPosition: number
  answer: string
  fallbackClue: string
}

interface GrammarMinigameRequest {
  gameType: GrammarMinigameType
  sentence?: string
  seed?: number
}

interface GrammarMinigameResponse {
  ok: boolean
  game_type: GrammarMinigameType
  sentence: string
  seed: number
  data: Record<string, unknown>
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
  activeModelTier?: 'low' | 'medium' | 'high' | 'ultra' | null
  activeModel?: string
  activePromptAdapter?: string
  adapterManifestPath?: string | null
  lastError?: string | null
}

interface AssistantChatRuntimeResponse {
  ok: boolean
  text: string
  provider: string
  model: string
  adapter?: string
  coldStart: boolean
  elapsedMs: number
}

interface AssistantChatImageOcrPayload {
  imageBase64: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  minConfidence?: number
}

interface AssistantChatImageOcrResponse {
  ok: boolean
  text: string
  lineCount: number
  lines: Array<{
    text: string
    confidence: number
  }>
}

interface AssistantChatOcrTranslationPayload {
  text: string
  sourceLang?: 'ja'
  targetLang?: 'en'
  fastMode?: boolean
}

interface AssistantChatOcrTranslationResponse {
  ok: boolean
  text: string
  backend?: 'llama.cpp' | 'llama.cpp+fallback' | 'llama.cpp-tutor' | 'remote'
  provider?: string
  model?: string
  elapsedMs?: number
  coldStart?: boolean
  languageGate: {
    model: string
    detectedLanguage: string
    confidence: number
    containsJapaneseScript: boolean
    passed: boolean
    threshold: number
  }
}

interface OptimizeFSRSResult {
  ok: boolean
  error?: string
  previous_weights?: number[]
  new_weights?: number[]
  loss_before?: number
  loss_after?: number
  log_count?: number
  card_count?: number
}

interface DesktopApi {
  versions: DesktopVersions
  getStudySummary: () => Promise<StudySummary>
  getDailyActivity?: (days?: number) => Promise<{
    ok: boolean
    days: Array<{ date: string; count: number; accuracy: number }>
  }>
  getBlockProgress: (slug: DeckSlug) => Promise<BlockProgressPayload>
  // Per-card mastery counters, keyed by deck slug (issue #66). Optional so a
  // renderer running against an older bridge falls back rather than throwing.
  getCardScores?: () => Promise<CardMasteryScoresPayload>
  importCardScores?: (legacyScores: Record<string, Record<number, number>>) => Promise<CardMasteryImportPayload>
  getDeckCards: (slug: DeckSlug) => Promise<ScriptDeckPayload>
  getStudyQueue: (slug: DeckSlug) => Promise<StudyQueueResponse>
  getGrammarMinigameData?: (payload: GrammarMinigameRequest) => Promise<GrammarMinigameResponse>
  getDailyGamesState?: (day: string) => Promise<DailyGamesStatePayload>
  createDailyGamesPracticeSeed?: (payload: DailyGamesPracticeSeedRequest) => Promise<DailyGamesPracticeSeedPayload>
  recordDailyGamesAttempt?: (payload: DailyGamesAttemptRequest) => Promise<DailyGamesStatePayload>
  getDailyGamesCrosswordClues?: (day: string) => Promise<DailyGamesCrosswordClue[]>
  saveDailyGamesCrosswordClues?: (day: string, clues: DailyGamesCrosswordClue[]) => Promise<DailyGamesCrosswordClue[]>
  generateDailyGamesCrosswordClues?: (entries: DailyGamesCrosswordClueRequest[]) => Promise<{ ok: boolean; text: string }>
  getOverviewCharacterMastery: () => Promise<OverviewCharacterMasteryPayload>
  notifyStartupReady: (payload?: {
    startupReadyMs?: number
    firstSummaryMs?: number | null
    deferredLoadsQueuedAtMs?: number
  }) => Promise<{ ok: boolean }>
  openInspectElement?: () => Promise<{ ok: boolean }>
  setStartupTheme: (theme: string) => Promise<{ ok: boolean; theme: string }>
  getConfigValue?: {
    (key: 'autoStartOnLogin'): Promise<{ ok: boolean; key: string; value: boolean }>
    (key: 'autoUpdateEnabled'): Promise<{ ok: boolean; key: string; value: boolean }>
    (key: 'closeBehavior'): Promise<{ ok: boolean; key: string; value: string }>
    (key: string): Promise<{ ok: boolean; key: string; value: unknown }>
  }
  setConfigValue?: {
    (key: 'autoStartOnLogin', value: boolean): Promise<{ ok: boolean; key: string; value: boolean }>
    (key: 'autoUpdateEnabled', value: boolean): Promise<{ ok: boolean; key: string; value: boolean }>
    (key: 'closeBehavior', value: string): Promise<{ ok: boolean; key: string; value: string }>
    (key: string, value: unknown): Promise<{ ok: boolean; key: string; value: unknown }>
  }
    reloadLocalFonts?: () => Promise<{ ok: boolean }>
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
    // Stored per-card mastery counter after this answer (issue #66). Optional so
    // a renderer running against an older bridge keeps its local step.
    mastery_score?: number
    confidence_score?: number | null
    curriculum_stage?: number | null
    xp_gained?: number
    level_before?: number
    level_after?: number
    milestones_reached?: string[]
  }>
  lookupSentence?: (payload: { query: string }) => Promise<{
    jp: string | null
    en: string | null
    romaji: string | null
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
  trackAssistantToastInteraction?: (payload: {
    id: number
    priority: string
    messageKey: string
    eventType: string
    targetMode?: string
    focusArea?: string
    actionKind?: string
    interactionType?: 'clicked' | 'ignored' | 'expired'
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
  extractAssistantChatImageText?: (payload: AssistantChatImageOcrPayload) => Promise<AssistantChatImageOcrResponse>
  translateAssistantChatOcrText?: (payload: AssistantChatOcrTranslationPayload) => Promise<AssistantChatOcrTranslationResponse>
  unloadAssistantChatRuntime?: () => Promise<{ ok: boolean; reason: string }>
  cancelAssistantChatInference?: () => Promise<{ ok: boolean; cancelled: boolean; reason: string }>
  speakText?: (payload: string | {
    text: string
    speaker?: string | number
    speed?: number
  }) => Promise<VoiceSpeakResponse>
  getVoiceStatus?: () => Promise<VoiceStatus>
  listVoices?: () => Promise<VoiceOption[]>
  preloadVoice?: (speaker?: string | number) => Promise<{ ok: boolean; ready: boolean }>
  resetStudyDb: () => Promise<{ ok: boolean }>
  minimizeWindow: () => Promise<{ ok: boolean }>
  toggleMaximizeWindow: () => Promise<{ ok: boolean; isMaximized: boolean }>
  isWindowMaximized: () => Promise<{ isMaximized: boolean }>
  onWindowStateChanged?: (listener: (state: { isMaximized: boolean }) => void) => () => void
  startWindowDrag?: () => Promise<{ ok: boolean; dragging: boolean }>
  endWindowDrag?: () => Promise<{ ok: boolean }>
  closeWindow: () => Promise<{ ok: boolean }>
  minimizeToTray?: () => Promise<{ ok: boolean }>
  quitApp?: () => Promise<{ ok: boolean }>
  onTrayAction?: (listener: (action: string) => void) => () => void
  moveWindow?: (dx: number, dy: number) => Promise<{ ok: boolean }>
  getProgressionState?: () => Promise<ProgressionStatePayload>
  getFeatureState?: () => Promise<FeatureStatePayload>
  getAchievementMilestones?: () => Promise<AchievementMilestonesPayload>
  getPassages?: () => Promise<PassagesPayload>
  getXpProgress?: () => Promise<XPProgress>
  getRecommendations?: () => Promise<RecommendationsPayload>
  getTutorReactions?: () => Promise<TutorReactionsPayload>
  dismissTutorReaction?: (dedupKey: string) => Promise<{ ok: boolean }>
  getJLPTReadiness?: () => Promise<JLPTReadinessPayload>
  buildJLPTExamQueue?: (level: JLPTLevel, mode: JLPTExamMode, count?: number) => Promise<JLPTExamQueuePayload>
  saveJLPTExamResult?: (payload: JLPTSaveResultPayload) => Promise<{ ok: boolean; id: number }>
  getJLPTExamHistory?: (level?: JLPTLevel | '', mode?: JLPTExamMode | '') => Promise<JLPTExamHistoryPayload>
  getLearningPathStatus?: () => Promise<LearningPathStatusPayload>
  setLearningPath?: (pathId: string) => Promise<LearningPathStatusPayload>
  completeOnboarding?: (payload: OnboardingCompletionPayload) => Promise<LearningPathStatusPayload>
  getDailyGoal?: () => Promise<{ target: number; current: number; goal_met: boolean; presets: number[] }>
  setDailyGoal?: (target: number) => Promise<{ target: number; current: number; goal_met: boolean; presets: number[] }>
  getWordOfDay?: () => Promise<WordOfDayPayload>
  exportAnalyticsCSV?: (
    type: 'review_history' | 'accuracy_trends' | 'mastery_snapshot',
  ) => Promise<{ ok: boolean; cancelled?: boolean; path?: string }>
  exportAnalyticsJSON?: () => Promise<{ ok: boolean; cancelled?: boolean; path?: string }>
  importAnalyticsJSON?: () => Promise<{ ok: boolean; cancelled?: boolean; imported?: Record<string, number>; conflict_mode?: string }>
  // ─ Debug / Dev Tools ─────────────────────────────────────────────────
  getBridgeTelemetry?: () => Promise<BridgeTelemetry | { ok: false; error: string }>
  restartBridge?: () => Promise<{ ok: boolean }>
  clearBridgeCaches?: () => Promise<{ ok: boolean }>
  runDiagnostics?: () => Promise<DiagnosticsReport>
  getSnapshot?: () => Promise<SnapshotData>
  runCheck?: (name: 'arch' | 'db' | 'srs') => Promise<CheckResult>
  testNotification?: () => Promise<{ ok: boolean; error?: string }>
  // ─ FSRS Optimization ─────────────────────────────────────────────────
  getFSRSWeights?: () => Promise<{ weights: number[]; is_custom: boolean }>
  optimizeFSRS?: () => Promise<OptimizeFSRSResult>
  resetFSRSWeights?: () => Promise<{ ok: boolean; weights: number[] }>
  searchDictionary?: (query: string) => Promise<DictionaryLookupPayload>
  getCardNote: (noteKey: string) => Promise<CardNoteLookupPayload>
  saveCardNote: (payload: CardNoteSaveRequest) => Promise<CardNotePayload>
  deleteCardNote: (noteKey: string) => Promise<CardNoteDeletePayload>
  // ─ Scenario Conversation Tutor persistence ───────────────────────────
  saveScenarioSession?: (payload: ScenarioSessionSaveRequest) => Promise<ScenarioSessionPayload>
  listScenarioSessions?: () => Promise<ScenarioSessionListPayload>
  getScenarioSession?: (sessionId: string) => Promise<ScenarioSessionLookupPayload>
  deleteScenarioSession?: (sessionId: string) => Promise<ScenarioSessionDeletePayload>
  clearScenarioSessions?: () => Promise<ScenarioSessionsClearPayload>
  saveScenarioSrsCard?: (payload: ScenarioSrsCardSaveRequest) => Promise<ScenarioSrsCardPayload>
  evaluateScenarioResponse?: (payload: ScenarioEvaluationRequest) => Promise<ScenarioEvaluationResponse>
  getKanjiDetail?: (character: string) => Promise<KanjiDetailPayload>
  // ─ Setup wizard ────────────────────────────────────────────────────
  isFirstRun?: () => Promise<boolean>
  getSetupSystemInfo?: () => Promise<SetupSystemInfo>
  downloadModel?: (tier: 'low' | 'medium' | 'high' | 'ultra') => Promise<{ alreadyInstalled?: boolean }>
  setActiveTutorModel?: (tier: 'low' | 'medium' | 'high' | 'ultra') => Promise<{ ok: boolean; tier: string }>
  uninstallTutorModel?: (tier: 'low' | 'medium' | 'high' | 'ultra') => Promise<{ ok: boolean; tier: string }>
  downloadLlama?: (backend?: 'cuda' | 'hip' | 'vulkan' | 'cpu') => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  downloadVoiceEngine?: (tier?: '0.6b') => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  setActiveVoiceModel?: (tier: '0.6b') => Promise<{ ok: boolean; tier: string }>
  uninstallVoiceModel?: (tier: '0.6b') => Promise<{ ok: boolean; tier: string }>
  completeSetup?: () => Promise<{ ok: boolean }>
  skipSetup?: () => Promise<{ ok: boolean }>
  onSetupProgress?: (listener: (evt: SetupProgressEvent) => void) => () => void
  downloadFonts?: () => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  downloadDictionary?: () => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  downloadSpeechModel?: (tier: 'fast' | 'balanced' | 'high' | 'ultra', options?: { force?: boolean }) => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  setActiveSpeechModel?: (tier: 'fast' | 'balanced' | 'high' | 'ultra') => Promise<{ ok: boolean; tier: string }>
  uninstallSpeechModel?: (tier: 'fast' | 'balanced' | 'high' | 'ultra') => Promise<{ ok: boolean; tier: string }>
  downloadOcrModel?: (tier: 'standard', options?: { force?: boolean }) => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  setActiveOcrModel?: (tier: 'standard') => Promise<{ ok: boolean; tier: string }>
  uninstallOcrModel?: (tier: 'standard') => Promise<{ ok: boolean; tier: string }>
  downloadTranslationModel?: (tier: 'qwen_ja_en', options?: { force?: boolean }) => Promise<{ ok?: boolean; alreadyInstalled?: boolean }>
  setActiveTranslationModel?: (tier: 'qwen_ja_en') => Promise<{ ok: boolean; tier: string }>
  uninstallTranslationModel?: (tier: 'qwen_ja_en') => Promise<{ ok: boolean; tier: string }>
  applyTranslationProfile?: (
    tier: 'ocr_qwen_local',
    options?: { force?: boolean },
  ) => Promise<{ ok?: boolean; alreadyInstalled?: boolean; profile?: string }>
  transcribeSpeech?: (payload: SpeechTranscribePayload) => Promise<SpeechTranscriptionResult>
  getSpeechStatus?: () => Promise<SpeechRuntimeStatus>
  createShortcuts?: (opts: { desktop?: boolean; startMenu?: boolean }) => Promise<{ ok: boolean }>
}

interface OnboardingCompletionPayload {
  goal?: string
  dailyMinutes?: number
  targetLevel?: string
}

interface SetupModelOption {
  tier: 'low' | 'medium' | 'high' | 'ultra'
  filename: string
  sizeMb: number
  embedderSizeMb?: number
  combinedSizeMb?: number
  label: string
  description: string
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SetupSpeechModelOption {
  tier: 'fast' | 'balanced' | 'high' | 'ultra'
  label: string
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SetupVoiceModelOption {
  tier: '0.6b'
  filename: string
  sizeMb: number
  combinedSizeMb: number
  label: string
  description: string
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SetupOcrModelOption {
  tier: 'standard'
  label: string
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SetupTranslationModelOption {
  tier: 'qwen_ja_en'
  label: string
  badge?: 'Qwen Translation'
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SetupTranslationProfileOption {
  tier: 'ocr_qwen_local'
  label: string
  badge?: 'Recommended'
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SpeechTranscribePayload {
  audioBase64: string
  mimeType: 'audio/webm' | 'audio/ogg' | 'audio/wav' | 'audio/wave' | 'audio/x-wav'
  language?: 'ja'
}

interface SpeechTranscriptionResult {
  text: string
  confidence: number
  durationMs: number | null
  languageProbability?: number | null
}

interface SpeechRuntimeStatus {
  available: boolean
  running: boolean
  lastError: string | null
}

interface SetupSystemInfo {
  totalRamGb: number
  recommendedTier: 'low' | 'medium' | 'high' | 'ultra'
  activeModelTier?: 'low' | 'medium' | 'high' | 'ultra' | null
  activeEmbedderTier?: 'e5_small' | 'e5_base' | 'e5_large' | null
  activeEmbedderLabel?: string | null
  activeEmbedderInstalled?: boolean
  activeEmbedderEnabled?: boolean
  models: SetupModelOption[]
  llamaCppInstalled: boolean
  gpuAdapters?: string[]
  gpuVramGb?: number | null
  llamaCppBackend?: 'cuda' | 'hip' | 'vulkan' | 'cpu'
  llamaCppBackendLabel?: string
  fontsInstalled: boolean
  dictionaryInstalled: boolean
  speechModels: SetupSpeechModelOption[]
  recommendedSpeechTier?: 'fast' | 'balanced' | 'high' | 'ultra'
  activeSpeechModelTier?: 'fast' | 'balanced' | 'high' | 'ultra' | null
  ocrModels?: SetupOcrModelOption[]
  recommendedOcrTier?: 'standard'
  activeOcrModelTier?: 'standard' | null
  ocrInstalled?: boolean
  translationModels?: SetupTranslationModelOption[]
  recommendedTranslationTier?: 'qwen_ja_en'
  activeTranslationModelTier?: 'qwen_ja_en' | null
  translationInstalled?: boolean
  translationProfiles?: SetupTranslationProfileOption[]
  activeTranslationProfileTier?: 'ocr_qwen_local' | null
  isPackaged: boolean
  networkMbps?: number | null
  llamaCppEstimatedDownloadMinutes?: number | null
  fontsEstimatedDownloadMinutes?: number | null
  dictionaryEstimatedDownloadMinutes?: number | null
  voiceInstalled?: boolean
  voiceModels?: SetupVoiceModelOption[]
  voiceDefaultModel?: '0.6b'
  activeVoiceModel?: '0.6b' | null
}

interface SetupProgressEvent {
  id: 'model' | 'llama' | 'voice' | 'fonts' | 'dictionary' | 'speech' | 'ocr' | 'translation'
  percent: number
  mb: number | null
  totalMb: number | null
  etaSec: number | null
  filesDone?: number | null
  filesTotal?: number | null
  logMessage?: string
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
  voiceId: string
  audioBase64: string
  synthesis?: {
    mode: 'single' | 'mixed_stitched'
    profile: 'main' | 'jp' | 'en'
    mixedSegmentCount: number
    streamingAttempted: boolean
    streamingFallbackUsed: boolean
    elapsedMs: number
  }
}

interface VoiceOption {
  voiceId: string
  displayName: string
  description: string
  gender?: string
  searchTerms: string[]
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

interface AchievementMilestoneStatus {
  descriptor: string
  threshold: number
  earned: boolean
}

interface NodeMasteryBadgeStatus {
  descriptor: string
  node_id: string
  earned: boolean
}

interface AchievementMilestonesPayload {
  total_reviews: number
  best_streak_days: number
  milestones: AchievementMilestoneStatus[]
  streak_milestones: AchievementMilestoneStatus[]
  node_mastery_badges: NodeMasteryBadgeStatus[]
}

interface WordOfDayPayload {
  character: string
  romaji: string
  meaning: string
  deck_name: string
  reason: string
  example_sentence: string | null
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

// ---- Guided learning path types ----
type SectionReadiness =
  | 'completed'
  | 'suggested_next'
  | 'recommended'
  | 'challenging'
  | 'advanced'

interface LearningPathStep {
  section_id: string
  label: string
  readiness: SectionReadiness
  mastery_pct: number
}

interface LearningPathStatusPayload {
  path_id: string | null
  path_name: string | null
  onboarding_complete: boolean
  suggested_next: string | null
  steps: LearningPathStep[]
}

interface PassageItem {
  id: string
  title: string
  title_reading: string
  author: string
  source: string
  source_url: string
  original_publication: string
  difficulty: number
  difficulty_label: 'beginner' | 'elementary'
  word_count: number
  text_jp: string
  raw_text: string
  vocabulary: { word: string; reading: string }[]
}

interface PassagesPayload {
  passages: PassageItem[]
}

// ─ Debug / Dev Tools ──────────────────────────────────────────────────

export interface BridgeTelemetry {
  startedAtUtc: string
  capturedAtUtc: string
  workerStarts: number
  workerRequestCount: number
  workerSuccessCount: number
  workerFailureCount: number
  workerTimeoutCount: number
  fallbackCount: number
  oneShotCount: number
  lastWorkerError: string | null
  lastFallbackAtUtc: string | null
  pendingRequests: number
  readCacheEntries: number
  stderrTail?: string
}

export interface QueueCompositionItem {
  deck: string
  total: number
  due: number
}

interface SessionCompletionItem {
  session_id: string
  target_items: number
  completed_items: number
  reviewed: number
  accuracy: number
  goal_met: boolean
}

interface TypedOutcomes {
  attempts: number
  correct: number
  incorrect: number
  accuracy: number
}

export interface DiagnosticsReport {
  queue_composition: QueueCompositionItem[]
  session_completion: SessionCompletionItem[]
  typed_outcomes: TypedOutcomes
}

interface SnapshotFileEntry {
  path: string
  lines: number
}

export interface SnapshotData {
  cwd: string
  python: string
  branch: string
  commit: string
  dirty: boolean
  changed_count: number
  changed_files: string[]
  changed_files_omitted: number
  python_file_count: number
  test_file_count: number
  largest_python_files: SnapshotFileEntry[]
}

export interface CheckResult {
  check: string
  passed: boolean
  exitCode: number
  output: string
  error?: string
}

declare global {
  interface Window {
    jplearnDesktop: DesktopApi
  }
}

