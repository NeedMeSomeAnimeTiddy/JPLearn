import { useCallback, useMemo, useState } from 'react'

import { loadSessionPrefs, mergeSessionPrefs } from '../../lib/appStorage'
import type { BlockInfo, ScriptDeck } from '../../types'
import type { BlockSelectionBySlug } from './types'
import { defaultSelection, normalizeSelection, unionBlockCards } from './utils'

export interface BlockSelection {
  /** Selected block indices, ascending, already filtered to unlocked blocks. */
  selected: number[]
  /** The cards a session should draw from, given the selection. */
  cards: ScriptDeck['cards']
  /**
   * Study exactly one block, replacing whatever was selected.
   *
   * IT USED TO BE THE ODD ONE OUT and now it is the only one. The hook could add, add-all and
   * clear but not *set*, because it was built for a strip of chips you toggled; the menu's deck
   * screen hands ONE block over and needs that to be the one. `clear()` then `toggle()` is not
   * the same thing — both read `selected`, which is memoised from state, so the second call in a
   * tick sees the pre-clear selection.
   */
  select: (index: number) => void
  /** Clear the selection, which studies the whole deck. */
  clear: () => void
}

/**
 * Which block of the active deck is being studied.
 *
 * ONE AT A TIME AGAIN, AND THE STORAGE IS STILL A LIST. Issue #78 made this a multi-select over
 * the script hub's tracklist strip, because kana blocks are five cards and that is too thin for
 * most minigames. The hub is gone and the deck screen offers one block — which is what the chain
 * says anyway: `compute_unlocked_count` stops at the first block under the gate, so exactly one is
 * open and everything before it is revisitable one at a time. `blockSelectionV2` stays an array
 * per deck, and `unionBlockCards` stays a union, because both are on disk in every existing
 * install; what went is the interface that could put more than one thing in it.
 *
 * The selection is *derived*, not synchronised by an effect — a deck with no
 * stored choice reads as the furthest unlocked block, which is exactly where
 * single-select landed on load. Only a deliberate click writes anything, so
 * blocks arriving from the bridge can never race a stored preference.
 */
export function useBlockSelection(
  deckSlug: string,
  blocks: BlockInfo[],
  deckCards: ScriptDeck['cards'],
): BlockSelection {
  const [stored, setStored] = useState<BlockSelectionBySlug>(
    () => loadSessionPrefs()?.blockSelectionV2 ?? {},
  )

  const selected = useMemo(() => {
    const remembered = stored[deckSlug]
    if (remembered === undefined) return defaultSelection(blocks)

    const usable = normalizeSelection(remembered, blocks)
    if (usable.length > 0) return usable

    // Nothing usable survived. Which of the two empties this is matters: an
    // empty stored array is the learner having cleared the selection on purpose,
    // and means "no block filter, study the whole deck". A non-empty one that
    // normalized away is stale — it outlived the deck it was made against, and
    // #78 changed how many blocks these decks have — so fall back to the default
    // rather than silently widening the pool to everything.
    return remembered.length === 0 ? [] : defaultSelection(blocks)
  }, [stored, deckSlug, blocks])

  const commit = useCallback((next: number[]) => {
    setStored((previous) => {
      const merged = { ...previous, [deckSlug]: next }
      // Copied into plain arrays: the state type is readonly, but what goes to
      // storage is JSON and must not alias the state.
      mergeSessionPrefs({
        blockSelectionV2: Object.fromEntries(
          Object.entries(merged).map(([slug, indices]) => [slug, [...indices]]),
        ),
      })
      return merged
    })
  }, [deckSlug])

  const cards = useMemo(
    () => unionBlockCards(deckCards, blocks, selected),
    [deckCards, blocks, selected],
  )

  const select = useCallback(
    (index: number) => commit(normalizeSelection([index], blocks)),
    [commit, blocks],
  )

  const clear = useCallback(() => commit([]), [commit])

  return { selected, cards, select, clear }
}
