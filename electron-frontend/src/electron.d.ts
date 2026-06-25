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
}

interface GameCard {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  is_leech: boolean
  meaning_distractor_ids: number[]
  character_distractor_ids: number[]
}

interface ScriptDeckPayload {
  slug: 'hiragana' | 'katakana' | 'kanji_n5'
  name: string
  cards: GameCard[]
}

interface DesktopApi {
  versions: DesktopVersions
  getStudySummary: () => Promise<StudySummary>
  getDeckCards: (slug: 'hiragana' | 'katakana' | 'kanji_n5') => Promise<ScriptDeckPayload>
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
