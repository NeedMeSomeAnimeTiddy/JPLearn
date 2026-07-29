/**
 * Filtering for the Overview → Mastery kanji browser.
 *
 * The browser paginates at `KANJI_OVERVIEW_PAGE_SIZE`, which turns N1's 1,192
 * kanji into 27 pages of prev/next clicking. Narrowing the set before it is
 * paged is what makes the view usable: search finds one kanji directly, and the
 * mastery buckets answer "what have I not started yet?" without any paging.
 */

import { CARD_MASTERY_MAX } from '../constants'

/** Where a card sits between untouched and fully mastered. */
export type MasteryBucket = 'new' | 'learning' | 'mastered'

/** A bucket, or `'all'` for the unfiltered set. */
export type MasteryFilter = 'all' | MasteryBucket

/** The card fields the browser filters on — a structural subset of `KanjiCard`. */
export interface BrowsableCard {
  id: number
  character: string
  romaji: string
  meaning: string
  /** The block this card sits in, as the hub labels it. */
  theme: string
}

/** Sentinel for "every theme", so the filter has no null state to guard. */
export const ALL_THEMES = ''

/** Per-card scores, keyed by numeric card id (the `cardScores.kanji_n5` bucket). */
export type ScoreMap = Record<number, number>

/**
 * Bucket a raw score.
 *
 * Scores outside 0..`CARD_MASTERY_MAX` are treated as their nearest bound rather
 * than as their own state — a stored score can exceed the max after the constant
 * is lowered, and such a card is mastered, not unclassifiable.
 */
export function masteryBucket(score: number): MasteryBucket {
  if (score >= CARD_MASTERY_MAX) return 'mastered'
  return score > 0 ? 'learning' : 'new'
}

/**
 * Does the card match a search query?
 *
 * Matches the character raw (so pasting 日 works) and the romaji/meaning
 * case-insensitively. A blank query matches everything, so callers can pass the
 * input value straight through without a guard.
 */
export function matchesQuery(card: BrowsableCard, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return (
    card.character.includes(query.trim()) ||
    card.romaji.toLowerCase().includes(needle) ||
    card.meaning.toLowerCase().includes(needle)
  )
}

/**
 * Themes present in a set of cards, in first-seen order.
 *
 * Deck order, not alphabetical: the themes run in curriculum sequence, and a
 * dropdown that reorders them would stop matching the hub's tracklist.
 */
export function themesIn(cards: readonly BrowsableCard[]): string[] {
  const seen: string[] = []
  for (const card of cards) {
    if (card.theme && !seen.includes(card.theme)) seen.push(card.theme)
  }
  return seen
}

/** Apply the query, the mastery filter and the theme, preserving deck order. */
export function filterKanjiCards<T extends BrowsableCard>(
  cards: readonly T[],
  scores: ScoreMap,
  query: string,
  filter: MasteryFilter,
  theme: string = ALL_THEMES,
): T[] {
  return cards.filter((card) => {
    if (theme !== ALL_THEMES && card.theme !== theme) return false
    if (!matchesQuery(card, query)) return false
    if (filter === 'all') return true
    return masteryBucket(scores[card.id] ?? 0) === filter
  })
}

/**
 * How many cards sit in each bucket, for the filter chips' counts.
 *
 * Counts the whole set the chips are offered against, ignoring the query — a
 * chip reading "Mastered 0" while a search is active would be describing the
 * search, not the level.
 */
export function countByBucket(
  cards: readonly BrowsableCard[],
  scores: ScoreMap,
): Record<MasteryBucket, number> {
  const counts: Record<MasteryBucket, number> = { new: 0, learning: 0, mastered: 0 }
  for (const card of cards) counts[masteryBucket(scores[card.id] ?? 0)] += 1
  return counts
}
