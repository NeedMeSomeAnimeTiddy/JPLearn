import { useCallback, useMemo, useState } from 'react'

import { loadSessionPrefs, mergeSessionPrefs } from '../../lib/appStorage'
import type { BlockInfo, ScriptDeck } from '../../types'
import type { BlockSelectionBySlug } from './types'
import {
  defaultSelection,
  normalizeSelection,
  selectAllUnlocked,
  toggleBlock,
  unionBlockCards,
} from './utils'

export interface BlockSelection {
  /** Selected block indices, ascending, already filtered to unlocked blocks. */
  selected: number[]
  /** The cards a session should draw from, given the selection. */
  cards: ScriptDeck['cards']
  isSelected: (index: number) => boolean
  toggle: (index: number) => void
  /**
   * Study exactly one block, replacing whatever was selected.
   *
   * The verb the hook was missing: it could add, add-all and clear, but not *set*.
   * `clear()` then `toggle()` is not the same thing — both read `selected`, which is
   * memoised from state, so the second call in a tick sees the pre-clear selection.
   * The menu's deck screen hands a specific block over and needs that to be the one.
   */
  select: (index: number) => void
  selectAll: () => void
  /** Clear the selection, which studies the whole deck. */
  clear: () => void
}

/**
 * Which blocks of the active deck are being studied.
 *
 * Replaces the single `activeBlockIndex` that `App.tsx` used to hold: kana blocks
 * are five cards, too thin for most minigames, and issue #78 gave vocabulary and
 * kanji blocks for the first time.
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

  const isSelected = useCallback(
    (index: number) => selected.includes(index),
    [selected],
  )

  const toggle = useCallback(
    (index: number) => commit(normalizeSelection(toggleBlock(selected, index), blocks)),
    [commit, selected, blocks],
  )

  const select = useCallback(
    (index: number) => commit(normalizeSelection([index], blocks)),
    [commit, blocks],
  )

  const selectAll = useCallback(
    () => commit(selectAllUnlocked(blocks)),
    [commit, blocks],
  )

  const clear = useCallback(() => commit([]), [commit])

  return { selected, cards, isSelected, toggle, select, selectAll, clear }
}
