// Shared primitive types extracted from App.tsx for use across components and views.

export type MinigameKey =
  | 'romaji_sprint'
  | 'meaning_match'
  | 'character_match'
  | 'stroke_order'
  | 'typed_recall'
  | 'speech_recall'
  | 'sentence_assembly'
  | 'particle_cloze'
  | 'vibe_check'
  | 'imposter'
  | 'listening_audio_first'
  | 'listening_prompt_first'
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

export type AppView = 'home' | 'script_hub' | 'minigame' | 'jlpt_prep'

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
  options: RoundOption[]
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
  path_id: string | null
  path_name: string | null
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
