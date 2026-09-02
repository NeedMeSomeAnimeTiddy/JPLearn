import { describe, expect, it } from 'vitest'

import type { BlockInfo, ScriptDeck } from '../../types'
import { defaultSelection, normalizeSelection, unionBlockCards } from './utils'

function block(index: number, cardIds: number[], unlocked = true): BlockInfo {
  return {
    index,
    name: `Block ${index}`,
    card_ids: cardIds,
    sample_chars: [],
    characters: [],
    meanings: [],
    romajis: [],
    mastery: 0,
    unlocked,
  } as unknown as BlockInfo
}

function card(id: number): ScriptDeck['cards'][number] {
  return { id, character: `c${id}`, romaji: `r${id}`, meaning: `m${id}`, tags: [] } as unknown as ScriptDeck['cards'][number]
}

const BLOCKS = [
  block(0, [1, 2, 3]),
  block(1, [4, 5]),
  block(2, [6, 7], false),
]
const DECK = [1, 2, 3, 4, 5, 6, 7].map(card)

describe('normalizeSelection', () => {
  it('sorts and deduplicates', () => {
    expect(normalizeSelection([1, 0, 1], BLOCKS)).toEqual([0, 1])
  })

  it('drops locked blocks, which the UI renders as disabled chips', () => {
    expect(normalizeSelection([0, 2], BLOCKS)).toEqual([0])
  })

  it('drops indices the deck no longer has', () => {
    // A stored selection outlives the deck it was made against; issue #78
    // changed how many blocks vocabulary and kanji decks have.
    expect(normalizeSelection([0, 99], BLOCKS)).toEqual([0])
  })
})

describe('defaultSelection', () => {
  it('is the furthest unlocked block, matching pre-#78 single-select', () => {
    expect(defaultSelection(BLOCKS)).toEqual([1])
  })

  it('is empty when the deck has no blocks', () => {
    expect(defaultSelection([])).toEqual([])
  })
})

describe('unionBlockCards', () => {
  it('unions the cards of every selected block', () => {
    expect(unionBlockCards(DECK, BLOCKS, [0, 1]).map((c) => c.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('returns one block’s cards when only one is selected', () => {
    expect(unionBlockCards(DECK, BLOCKS, [1]).map((c) => c.id)).toEqual([4, 5])
  })

  it('falls back to the whole deck when nothing is selected', () => {
    expect(unionBlockCards(DECK, BLOCKS, [])).toEqual(DECK)
  })

  it('falls back to the whole deck when the deck has no blocks', () => {
    expect(unionBlockCards(DECK, [], [0])).toEqual(DECK)
  })

  it('falls back when block ids match no loaded card', () => {
    // Blocks and cards are fetched separately, so a stale cache can pair blocks
    // with cards they do not describe. Studying everything beats studying nothing.
    expect(unionBlockCards(DECK, [block(0, [900, 901])], [0])).toEqual(DECK)
  })

  it('keeps deck order rather than selection order', () => {
    expect(unionBlockCards(DECK, BLOCKS, [1, 0]).map((c) => c.id)).toEqual([1, 2, 3, 4, 5])
  })
})

