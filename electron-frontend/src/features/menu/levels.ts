import type { JlptLevel, JlptLevelProgress } from '../../types'

/* ==================================================================================================
   WHICH RUNG OF A LADDERED DECK YOU ARE STANDING ON.

   TWO OF THE SIX DECKS ARE FIVE DECKS. Kanji and vocabulary each run N5 through N1, and the
   curriculum has ONE node for each of them -- `kanji_n5` and `vocabulary_n5` -- because the path is
   about reaching the deck, not about walking its ladder afterwards. So the level is not a milestone
   and cannot be chosen on the path screen; it is a property of the deck screen you are already on.

   IT USED TO LIVE IN THE SCRIPT HUB and nowhere else. `activeDeckSlug` is built from
   `activeKanjiLevel`/`activeVocabLevel`, which only the hub's level row ever wrote -- so with the
   hub gone, N4 through N1 would have become 3,400 kanji and 11,000 words that no press in the app
   could reach. This is the row that keeps them reachable.

   THE DIGIT IS PRINTED ON THE CHIP, which is the menu's own idiom -- level one's rows carry 01..05
   and answer to them. It also avoids spending an axis: the deck screen's arrows already choose
   between its cards and the feed's already read today's queue, and a level row that had to share one
   of those would be the third thing on it.
   ================================================================================================== */

/**
 * The level a printed digit names, or null when that digit names nothing.
 *
 * Bounded by the row that is actually drawn rather than by `CATEGORY_LEVEL_ORDER`, so a build whose
 * bridge answered with three levels cannot be asked for a fourth.
 */
export function levelForKey(levels: readonly JlptLevelProgress[], key: string): JlptLevel | null {
  if (!/^[1-9]$/.test(key)) return null
  return levels[Number(key) - 1]?.key ?? null
}

/**
 * The step-by-step move, for a screen that would rather offer an axis than five digits.
 *
 * Clamped rather than wrapped: N5 to N1 is an ascent, and arriving at N1 by pressing up from N5
 * would be the one move on this row that skips four decks.
 */
export function levelStep(
  levels: readonly JlptLevelProgress[], at: JlptLevel, direction: 1 | -1,
): JlptLevel {
  const here = levels.findIndex((level) => level.key === at)
  if (here < 0) return levels[0]?.key ?? at
  return levels[Math.max(0, Math.min(levels.length - 1, here + direction))]?.key ?? at
}
