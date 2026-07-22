import { describe, it, expect } from 'vitest'
import {
  SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT,
  buildInterleaveSequence,
  clampWeight,
  chooseUniqueIndices,
  limitRuntimeDeckCards,
  normalizeBlockList,
  normalizeDeckCards,
  normalizeText,
  shuffleArray,
} from './deckUtils'
import type { InterleaveWeights, ScriptDeck } from '../types'

const deckOf = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: i, character: 'x', tags: [] })) as ScriptDeck['cards']

describe('normalizeDeckCards / normalizeBlockList', () => {
  it('passes arrays through and coerces anything else to empty', () => {
    expect(normalizeDeckCards([{ id: 1 }])).toHaveLength(1)
    for (const bad of [null, undefined, 'nope', 42, {}]) {
      expect(normalizeDeckCards(bad)).toEqual([])
      expect(normalizeBlockList(bad)).toEqual([])
    }
  })
})

describe('limitRuntimeDeckCards', () => {
  it('only truncates the sentence_examples deck', () => {
    const big = deckOf(SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT + 50)
    expect(limitRuntimeDeckCards('sentence_examples', big)).toHaveLength(SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT)
    expect(limitRuntimeDeckCards('vocab_n5', big)).toHaveLength(big.length)
  })

  it('leaves a sentence deck at or under the limit untouched', () => {
    const exact = deckOf(SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT)
    expect(limitRuntimeDeckCards('sentence_examples', exact)).toBe(exact)
  })
})

describe('normalizeText', () => {
  it('trims, lowercases and collapses internal whitespace', () => {
    expect(normalizeText('  Hello   World  ')).toBe('hello world')
    expect(normalizeText('A\t\nB')).toBe('a b')
  })
})

describe('chooseUniqueIndices', () => {
  it('never returns the excluded index and never repeats', () => {
    for (let run = 0; run < 50; run += 1) {
      const picks = chooseUniqueIndices(6, 3, 2)
      expect(picks).not.toContain(2)
      expect(new Set(picks).size).toBe(picks.length)
      expect(picks).toHaveLength(3)
    }
  })

  it('cannot ask for more distractors than the deck can supply', () => {
    // length 3 with one excluded leaves at most 2 choices
    expect(chooseUniqueIndices(3, 10, 0)).toHaveLength(2)
    expect(chooseUniqueIndices(1, 3, 0)).toEqual([])
  })
})

describe('shuffleArray', () => {
  it('returns a new array preserving the original contents', () => {
    const source = [1, 2, 3, 4, 5]
    const shuffled = shuffleArray(source)
    expect(shuffled).not.toBe(source)
    expect(source).toEqual([1, 2, 3, 4, 5])
    expect([...shuffled].sort()).toEqual(source)
  })
})

describe('clampWeight', () => {
  it('clamps into 1..5 and floors fractions', () => {
    expect(clampWeight(0)).toBe(1)
    expect(clampWeight(-3)).toBe(1)
    expect(clampWeight(2.9)).toBe(2)
    expect(clampWeight(99)).toBe(5)
  })
})

describe('buildInterleaveSequence', () => {
  const weights: InterleaveWeights = {
    romaji_sprint: 2, meaning_match: 1, character_match: 1, particle_cloze: 1,
  }

  it('repeats each mode according to its weight', () => {
    const sequence = buildInterleaveSequence(weights, ['romaji_sprint', 'meaning_match'])
    expect(sequence).toEqual(['romaji_sprint', 'romaji_sprint', 'meaning_match'])
  })

  it('falls back to the allowed modes when no modes are weighted in', () => {
    expect(buildInterleaveSequence(weights, [])).toEqual([])
  })
})
