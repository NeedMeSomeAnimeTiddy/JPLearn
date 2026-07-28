// Shared primitive types extracted from App.tsx for use across components and views.

import type { ThemeMode, ThemeKey, ThemeScope, CustomTheme } from './features/theme/types'

export type MinigameKey =
  | 'romaji_sprint'
  | 'meaning_match'
  | 'character_match'
  | 'stroke_order'
  | 'handwriting'
  | 'typed_recall'
  | 'speech_recall'
  | 'sentence_assembly'
  | 'particle_cloze'
  | 'vibe_check'
  | 'imposter'
  | 'listening_audio_first'
  | 'dictation'
  | 'kanji_compound_builder'
  | 'context_cloze'
  | 'conjugation_drill'
  | 'interleave_mix'

export type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>

export type ScriptKey =
  | 'hiragana'
  | 'katakana'
  | 'kanji_n5'
  | 'vocab_n5'
  | 'grammar_patterns'
  | 'sentence_examples'

export type JlptLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'

export type KanjiDeckSlug = 'kanji_n5' | 'kanji_n4' | 'kanji_n3' | 'kanji_n2' | 'kanji_n1'
export type VocabDeckSlug = 'vocab_n5' | 'vocab_n4' | 'vocab_n3' | 'vocab_n2' | 'vocab_n1'

// ── Thematic category types ───────────────────────────────────────────────────

export type VocabCategory =
  | 'greetings'
  | 'numbers'
  | 'time_days'
  | 'family'
  | 'body'
  | 'food_drink'
  | 'school_study'
  | 'places'
  | 'transport'
  | 'adjectives'
  | 'verbs'
  | 'nouns'
  // N4 thematic categories
  | 'n4_school_work'
  | 'n4_home_living'
  | 'n4_travel_places'
  | 'n4_feelings_character'
  // N3 thematic categories
  | 'n3_work_business'
  | 'n3_emotion_mind'
  | 'n3_society_people'
  | 'n3_nature_science'
  // N2 thematic categories
  | 'n2_economy_trade'
  | 'n2_government_society'
  | 'n2_measure_analysis'
  | 'n2_land_construction'
  // N1 thematic categories
  | 'n1_law_justice'
  | 'n1_thought_reason'
  | 'n1_conflict_crisis'
  | 'n1_arts_expression'

export type KanjiCategory =
  | 'numbers_time'
  | 'nature_world'
  | 'people_body'
  | 'study_language'
  | 'actions_travel'
  // N4 thematic categories
  | 'n4_society_roles'
  | 'n4_mind_thought'
  | 'n4_daily_life'
  | 'n4_time_action'
  // N3 thematic categories
  | 'n3_governance'
  | 'n3_communication'
  | 'n3_movement'
  | 'n3_achievement'
  // N2 thematic categories
  | 'n2_professionalism'
  | 'n2_economics'
  | 'n2_analysis'
  // N1 thematic categories
  | 'n1_law_order'
  | 'n1_ideology'
  | 'n1_literary'

export type VocabCategorySlug =
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
  // N4 thematic categories
  | 'vocab_n4_school_work'
  | 'vocab_n4_home_living'
  | 'vocab_n4_travel_places'
  | 'vocab_n4_feelings_character'
  // N3 thematic categories
  | 'vocab_n3_work_business'
  | 'vocab_n3_emotion_mind'
  | 'vocab_n3_society_people'
  | 'vocab_n3_nature_science'
  // N2 thematic categories
  | 'vocab_n2_economy_trade'
  | 'vocab_n2_government_society'
  | 'vocab_n2_measure_analysis'
  | 'vocab_n2_land_construction'
  // N1 thematic categories
  | 'vocab_n1_law_justice'
  | 'vocab_n1_thought_reason'
  | 'vocab_n1_conflict_crisis'
  | 'vocab_n1_arts_expression'

export type KanjiCategorySlug =
  | 'kanji_numbers_time'
  | 'kanji_nature_world'
  | 'kanji_people_body'
  | 'kanji_study_language'
  | 'kanji_actions_travel'
  | 'kanji_n4_society_roles'
  | 'kanji_n4_mind_thought'
  | 'kanji_n4_daily_life'
  | 'kanji_n4_time_action'
  | 'kanji_n3_governance'
  | 'kanji_n3_communication'
  | 'kanji_n3_movement'
  | 'kanji_n3_achievement'
  | 'kanji_n2_professionalism'
  | 'kanji_n2_economics'
  | 'kanji_n2_analysis'
  | 'kanji_n1_law_order'
  | 'kanji_n1_ideology'
  | 'kanji_n1_literary'

export interface CategoryProgress {
  key: string
  label: string
  slug: string
  cardIds: number[]
  sampleChars: string[]
  mastery: number
  unlocked: boolean
  total: number
}

export type FeedbackTone = 'success' | 'error' | null

export type NavDirection = 'forward' | 'back'

export type AppView = 'home' | 'script_hub' | 'minigame' | 'jlpt_prep' | 'passage_hub' | 'daily_games'

export interface RoundOption {
  id: string
  label: string
}

export interface RoundDictionaryNote {
  title: string
  copy: string
  character: string
  reading: string
  primaryGloss: string
  secondaryGlosses: string[]
  source: string
}

export interface RoundState {
  cardId: number
  deckSlug?: DeckSlugInput
  mode: PlayableMinigame
  audioText: string
  exampleSentenceAudioText: string | null
  surprisePrompt: boolean
  curriculumStage: 1 | 2 | 3
  chapterNumber: 1 | 2 | 3 | null
  chapterLabel: string | null
  hintText: string | null
  dictionarySeedQuery: string | null
  dictionaryNote: RoundDictionaryNote | null
  promptLabel: string
  focusText: string
  answer: string
  answerDisplay?: string | null
  /**
   * Every spelling a typed answer may match. Set only by modes where one
   * question has several correct written forms — a conjugation drill accepts
   * both 食べて and たべて — and graded by exact match, not near-miss.
   */
  acceptedAnswers?: string[]
  options: RoundOption[]
  isMastered?: boolean
}

export interface SessionRunReport {
  script: ScriptKey
  minigame: MinigameKey
  sectionName: string | null
  completedAt: string
  rounds: number
  correct: number
  wrong: number
  accuracy: number
  points: number
  targetItems: number
  goalCompletionPct: number
  goalDelta: number
  livesEnabled: boolean
  livesRemaining: number
  livesLost: number
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  confidenceCapturedCount: number
  averageConfidenceScore: number | null
  wrongCardIds: number[]
  nearMissCardIds: number[]
}

export interface LastSessionPrefs {
  script: ScriptKey
  game: MinigameKey
  livesEnabled: boolean
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  sessionTargetItems: number
  updatedAt: string
  /**
   * Selected block indices per deck slug (issue #78). Optional because prefs
   * written before multi-select existed do not carry it, and a deck with no
   * stored entry falls back to the furthest unlocked block.
   */
  blockSelection?: Record<string, number[]>
}

export interface ScriptStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
}

export interface MinigameStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
  points: number
}

export type StatsByScript = Record<ScriptKey, ScriptStats>
export type MinigameStatsByScript = Record<ScriptKey, Record<MinigameKey, MinigameStats>>

// ── Learning path / guided system ─────────────────────────────────────────

export type SectionReadiness =
  | 'completed'
  | 'suggested_next'
  | 'recommended'
  | 'challenging'
  | 'advanced'

export interface LearningPathStep {
  section_id: string
  label: string
  readiness: SectionReadiness
  mastery_pct: number
}

export interface LearningPathStatus {
  onboarding_complete: boolean
  suggested_next: string | null
  steps: LearningPathStep[]
}

export type CardScores = Record<ScriptKey, Record<number, number>>

export interface JlptLevelProgress {
  key: JlptLevel
  label: string
  cardIds: number[]
  sampleChars: string[]
  mastery: number
  unlocked: boolean
  total: number
}

export interface StudyPlanShortcut {
  key: string
  label: string
  note: string
  script: ScriptKey
  minigame: MinigameKey
}

export type StudyPlanStage = 'starter' | 'building' | 'advanced'

export interface StudyPlanCoverageRow {
  key: ScriptKey
  label: string
  mastery: number
  total: number
  unlocked: boolean
  difficulty: number
}

export interface StudyPlanSnapshot {
  coverageRows: StudyPlanCoverageRow[]
  focusRows: StudyPlanCoverageRow[]
  overallMastery: number
  recommendedMinutes: number
  sessionNote: string
  learnerStage: StudyPlanStage
  shortcutRows: StudyPlanShortcut[]
}

// ── Bridge payload aliases ────────────────────────────────────────────────
// Derived from the desktop API surface (src/electron.d.ts) rather than
// hand-written, so they track scripts/generate_ts_types.py output automatically.

export type StudySummaryPayload = Awaited<ReturnType<typeof window.jplearnDesktop.getStudySummary>>
export type DeckSlugInput = Parameters<typeof window.jplearnDesktop.getDeckCards>[0]
export type ScriptDeck = Awaited<ReturnType<typeof window.jplearnDesktop.getDeckCards>>
export type BlockProgressPayload = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>
export type BlockInfo = BlockProgressPayload['blocks'][number]
export type StudyQueueResponse = Awaited<ReturnType<typeof window.jplearnDesktop.getStudyQueue>>
export type OverviewCharacterMasteryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getOverviewCharacterMastery>
>
export type OverviewKanjiCard = OverviewCharacterMasteryPayload['kanji_cards'][number]
export type OverviewCategoryBlocks = OverviewCharacterMasteryPayload['category_blocks']
export type GrammarMinigameResponse = Awaited<
  ReturnType<NonNullable<typeof window.jplearnDesktop.getGrammarMinigameData>>
>
export type SessionGoalStartResponse = Awaited<ReturnType<typeof window.jplearnDesktop.startSessionGoal>>
export type SessionSummaryResponse = Awaited<ReturnType<typeof window.jplearnDesktop.getSessionSummary>>
export type SessionSummaryPayload = NonNullable<SessionSummaryResponse['summary']>
export type XPProgress = Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getXpProgress>>>
export type RecommendationItem =
  Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getRecommendations>>>['recommendations'][number]
export type JlptProgressCard = Pick<ScriptDeck['cards'][number], 'id' | 'character' | 'tags'>

// ── App shell / settings ──────────────────────────────────────────────────

export type ShortcutSubmenuKey = 'all_maps' | ScriptKey | 'dev_tools' | 'dev_checks'
export type InterleaveWeights = Record<
  'romaji_sprint' | 'meaning_match' | 'character_match' | 'particle_cloze',
  number
>
export type FontSize = 'small' | 'medium' | 'large'
export type AppFontPreset =
  | 'kiwi_maru'
  | 'bizin_gothic'
  | 'kaisei_decol'
  | 'noto_sans_jp'
  | 'shippori_mincho'
  | 'zen_old_mincho'
  | 'reggae_one'
  | 'system_ui'
export type AnimationStyle = 'calm_fade' | 'glide' | 'lively'
export type ExpertiseLevel =
  | 'total_beginner'
  | 'know_hiragana'
  | 'know_kana'
  | 'jlpt_n5_foundation'
  | 'jlpt_n4_foundation'
  | 'jlpt_n3_foundation'
  | 'jlpt_n2_foundation'
  | 'jlpt_n1_foundation'
export type SettingsTabKey = 'appearance' | 'assistant' | 'system'
export type OverviewSectionKey =
  | 'studyActivity'
  | 'sessionHistory'
  | 'mistakeBreakdown'
  | 'minigamePerformance'
  | 'deckSnapshot'
  | 'achievements'

export interface AppSettings {
  reducedMotion: boolean
  fontSize: FontSize
  appFont: AppFontPreset
  themeMode: ThemeMode
  theme: ThemeKey
  themeScope: ThemeScope
  activeCustomThemeId: string | null
  customThemes: CustomTheme[]
  motionStyle: AnimationStyle
  assistantToastLimit: 0 | 1
  assistantChatEnabled: boolean
  assistantChatAudioEnabled: boolean
  assistantChatOcrMinConfidence: number
  scenarioAiEvaluationEnabled: boolean
  romajiConversionEnabled: boolean
  showKeyboardPrompts: boolean
  furiganaEnabled: boolean
  furiganaAutoHideMastered: boolean
  voiceEnabled: boolean
  voiceSpeaker: string
  voiceSpeed: number
  ambientAudioEnabled: boolean
  cursor: { mode: string; theme: string; size: number; color: string | null }
  pomodoroEnabled: boolean
  pomodoroWorkMinutes: number
  pomodoroBreakMinutes: number
  pomodoroLongBreakMinutes: number
  pomodoroSessionsBeforeLongBreak: number
  pomodoroShowTimerInHud: boolean
}

// ── Session persistence ───────────────────────────────────────────────────

export interface ExplicitReviewItem {
  deckSlug: DeckSlugInput
  cardId: number
  card: ScriptDeck['cards'][number]
}

export interface PersistedSessionRestore {
  sessionScore: number
  sessionRounds: number
  sessionPoints: number
  sessionStreak: number
  sessionBestStreak: number
  sessionConfidenceCount: number
  sessionConfidenceTotal: number
  livesRemaining: number
}

export interface PersistedSession {
  activeScript: ScriptKey
  activeGame: MinigameKey
  livesEnabled: boolean
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  sessionTargetItems: number
  seenCardIds: number[]
  sessionStartedAt: string
  restore: PersistedSessionRestore
}
