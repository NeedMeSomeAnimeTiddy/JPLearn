import type { VocabFeedPayload, VocabFeedWord } from '../../generated/types'

export type { VocabFeedPayload, VocabFeedWord }

/** What the hook hands the view. */
export interface VocabFeed {
  /** Today's words, in teaching order. Empty while loading, or if the deck has blocks. */
  words: VocabFeedWord[]
  /** How many new words a day the learner has asked for. */
  budget: number
  /** Cards in the level, however many are readable today. */
  total: number
  /** How much of the level the learner's kanji already unlocks. */
  readable: number
  /** The number the whole ordering turns on — clearing a kanji block moves it. */
  knownKanji: number
  /** Cards already begun, which is what the budget is measured against. */
  started: number
  loading: boolean
  /** Set when the bridge refused or is too old to answer; the view stays silent. */
  error: string | null
  /** Change the daily budget. Persists, then refetches. */
  setBudget: (count: number) => void
}
