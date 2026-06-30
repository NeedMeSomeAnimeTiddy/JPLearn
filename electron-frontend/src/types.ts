// Shared primitive types extracted from App.tsx for use across components and views.

export type MinigameKey =
  | 'romaji_sprint'
  | 'meaning_match'
  | 'character_match'
  | 'stroke_order'
  | 'typed_recall'
  | 'context_cloze'
  | 'narrative_story'
  | 'interleave_mix'

export type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>

export type ScriptKey =
  | 'hiragana'
  | 'katakana'
  | 'kanji_n5'
  | 'vocab_n5'
  | 'grammar_patterns'

export type JlptLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'

export type KanjiDeckSlug = 'kanji_n5' | 'kanji_n4' | 'kanji_n3' | 'kanji_n2' | 'kanji_n1'
export type VocabDeckSlug = 'vocab_n5' | 'vocab_n4' | 'vocab_n3' | 'vocab_n2' | 'vocab_n1'

export type FeedbackTone = 'success' | 'error' | null

export type NavDirection = 'forward' | 'back'

export type AppView = 'home' | 'script_hub' | 'minigame' | 'overview'

export interface RoundOption {
  id: string
  label: string
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
  promptLabel: string
  focusText: string
  answer: string
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
