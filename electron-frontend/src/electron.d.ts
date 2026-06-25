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
}

interface GameCard {
  id: number
  character: string
  romaji: string
  meaning: string
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
}

declare global {
  interface Window {
    jplearnDesktop: DesktopApi
  }
}

export {}
