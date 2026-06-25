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
    context_cloze_by_script: Record<'hiragana' | 'katakana' | 'kanji_n5', {
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
    narrative_story_by_script: Record<'hiragana' | 'katakana' | 'kanji_n5', {
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

interface ScriptDeckPayload {
  slug: 'hiragana' | 'katakana' | 'kanji_n5'
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
  getBlockProgress: (slug: 'hiragana' | 'katakana' | 'kanji_n5') => Promise<BlockProgressPayload>
  getDeckCards: (slug: 'hiragana' | 'katakana' | 'kanji_n5') => Promise<ScriptDeckPayload>
  recordGameResult: (payload: {
    slug: 'hiragana' | 'katakana' | 'kanji_n5'
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
