interface DesktopVersions {
  chrome: string
  electron: string
  node: string
}

interface DeckSummary {
  slug: string
  name: string
  total: number
  mastered: number
  due_today: number
  completed_today: number
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

interface GameCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  is_leech: boolean
  curriculum_stage: number
  meaning_distractor_ids: number[]
  character_distractor_ids: number[]
}

type DeckSlug =
  | 'hiragana'
  | 'katakana'
  | 'kanji_n5'
  | 'kanji_n4'
  | 'kanji_n3'
  | 'kanji_n2'
  | 'kanji_n1'
  | 'vocab_n5'
  | 'vocab_n4'
  | 'vocab_n3'
  | 'vocab_n2'
  | 'vocab_n1'
  | 'grammar_patterns'
type ScriptCurriculumSlug = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns'

interface ScriptDeckPayload {
  slug: DeckSlug
  name: string
  cards: GameCard[]
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

interface DesktopApi {
  versions: DesktopVersions
  getStudySummary: () => Promise<StudySummary>
  getBlockProgress: (slug: DeckSlug) => Promise<BlockProgressPayload>
  getDeckCards: (slug: DeckSlug) => Promise<ScriptDeckPayload>
  setStartupTheme: (theme: string) => Promise<{ ok: boolean; theme: string }>
  recordGameResult: (payload: {
    slug: DeckSlug
    cardId: number
    isCorrect: boolean
    minigame: string
    curriculumStage?: number
  }) => Promise<{
    ok: boolean
    card_id: number
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
    curriculum_stage?: number | null
  }>
  resetStudyDb: () => Promise<{ ok: boolean }>
  minimizeWindow: () => Promise<{ ok: boolean }>
  toggleMaximizeWindow: () => Promise<{ ok: boolean; isMaximized: boolean }>
  isWindowMaximized: () => Promise<{ isMaximized: boolean }>
  closeWindow: () => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    jplearnDesktop: DesktopApi
  }
}

export {}
