import type { BlockInfo, ScriptDeck } from '../../types'
import type { BlockIndices } from './types'

/**
 * Keep a selection ascending, deduplicated, and limited to selectable blocks.
 *
 * Locked blocks are dropped rather than kept-and-ignored: the chips that render
 * them are `disabled`, so a selection holding one would be a state the UI cannot
 * show or undo. Out-of-range indices are dropped for the same reason — a stored
 * selection outlives the deck it was made against, and issue #78 changed how many
 * blocks a deck has.
 */
export function normalizeSelection(selected: BlockIndices, blocks: BlockInfo[]): number[] {
  const selectable = new Set(
    blocks.filter((block) => block.unlocked).map((block) => block.index),
  )
  return [...new Set(selected)].filter((index) => selectable.has(index)).sort((a, b) => a - b)
}

/**
 * The default selection for a deck the learner has no stored choice for.
 *
 * The furthest unlocked block, which is where single-select used to land on
 * load — so opening a section for the first time behaves as it always has.
 */
export function defaultSelection(blocks: BlockInfo[]): number[] {
  if (blocks.length === 0) return []
  const lastUnlocked = blocks.reduce((best, block) => (block.unlocked ? block.index : best), 0)
  return [lastUnlocked]
}

/**
 * The cards a session should draw from.
 *
 * Falls back to the whole deck when there are no blocks, nothing is selected, or
 * the selection resolves to no loaded cards. That last case is not theoretical:
 * block metadata and deck cards are fetched separately, so a stale cache can
 * briefly pair blocks with cards they do not describe, and studying the whole
 * deck is a better answer there than studying nothing.
 */
export function unionBlockCards(
  deckCards: ScriptDeck['cards'],
  blocks: BlockInfo[],
  selected: BlockIndices,
): ScriptDeck['cards'] {
  if (blocks.length === 0 || selected.length === 0) return deckCards

  const wanted = new Set<number>()
  const chosen = new Set(selected)
  for (const block of blocks) {
    if (!chosen.has(block.index)) continue
    for (const cardId of block.card_ids) wanted.add(cardId)
  }
  if (wanted.size === 0) return deckCards

  const matching = deckCards.filter((card) => wanted.has(card.id))
  return matching.length > 0 ? matching : deckCards
}
