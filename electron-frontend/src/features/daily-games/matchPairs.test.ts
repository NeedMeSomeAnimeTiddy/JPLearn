/**
 * Dealing Match Pairs (audit 16, F3): two words written the same are never dealt together, and a
 * pool without such a pair deals exactly the board it always did.
 */
import { describe, expect, it } from 'vitest'
import type { DailyGamesWordPayload } from '../../generated/types'
import { MATCH_PAIRS_MAX_WORDS } from './constants'
import { buildMatchPairs } from './utils'

function word(card_id: number, character: string, meaning: string): DailyGamesWordPayload {
  return { deck_slug: 'vocab_n5', deck_name: 'N5 Vocabulary', card_id, character, romaji: '', meaning, source: 'deck' }
}

const plainPool = Array.from({ length: 15 }, (_, index) => word(index, `語${String.fromCodePoint(0x4E00 + index)}`, `word ${index}`))

describe('buildMatchPairs', () => {
  it('deals the same board as before for a pool with no two words written the same', () => {
    const summary = buildMatchPairs(plainPool, 42).map((pair) => pair.id)
    expect(summary).toMatchInlineSnapshot(`
      [
        "3-character",
        "12-character",
        "13-meaning",
        "3-meaning",
        "8-meaning",
        "8-character",
        "2-meaning",
        "7-meaning",
        "1-character",
        "14-meaning",
        "5-character",
        "0-character",
        "4-character",
        "0-meaning",
        "2-character",
        "10-meaning",
        "5-meaning",
        "1-meaning",
        "10-character",
        "7-character",
        "13-character",
        "4-meaning",
        "12-meaning",
        "14-character",
      ]
    `)
  })

  it('never deals both of two words written the same', () => {
    const pool = [
      word(0, '市', 'market'),
      word(1, '市', 'city'),
      word(2, ' 市 ', 'town'),
      ...plainPool.slice(0, 12).map((entry, index) => ({ ...entry, card_id: index + 3 })),
    ]
    for (let seed = 0; seed < 64; seed += 1) {
      const characters = buildMatchPairs(pool, seed).filter((pair) => pair.side === 'character').map((pair) => pair.value.trim())
      expect(characters.filter((value) => value === '市')).toHaveLength(1)
      expect(new Set(characters).size).toBe(characters.length)
    }
  })

  it('deals the words left when dropping a twin leaves fewer than a full board', () => {
    const pool = [word(0, '市', 'market'), word(1, '市', 'city'), word(2, '猫', 'cat'), word(3, '犬', 'dog')]
    for (let seed = 0; seed < 16; seed += 1) {
      const pairs = buildMatchPairs(pool, seed)
      expect(pairs).toHaveLength(6)
      expect(pairs.length / 2).toBeLessThan(MATCH_PAIRS_MAX_WORDS)
      const positions = new Set(pairs.map((pair) => pair.poolPosition))
      expect(positions.has(2) && positions.has(3)).toBe(true)
      expect(positions.has(0) !== positions.has(1)).toBe(true)
    }
  })
})
