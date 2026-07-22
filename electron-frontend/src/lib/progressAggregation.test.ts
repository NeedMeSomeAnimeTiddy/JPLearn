import { describe, it, expect } from 'vitest'
import { buildCategoryProgress, buildJlptLevelProgress, jlptTagFromCard } from './progressAggregation'
import { CARD_MASTERY_MAX } from '../constants'
import type { JlptProgressCard, ScriptDeck } from '../types'

const card = (id: number, tags: string[], character = 'あ'): JlptProgressCard =>
  ({ id, character, tags }) as JlptProgressCard

/** A fully mastered card contributes CARD_MASTERY_MAX to its level's score. */
const mastered = (ids: number[]): Record<number, number> =>
  Object.fromEntries(ids.map((id) => [id, CARD_MASTERY_MAX]))

describe('jlptTagFromCard', () => {
  it('reads the first JLPT tag present', () => {
    expect(jlptTagFromCard({ tags: ['common', 'n3'] })).toBe('n3')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(jlptTagFromCard({ tags: ['  N2 '] })).toBe('n2')
  })

  it('defaults to n5 when no JLPT tag is present', () => {
    expect(jlptTagFromCard({ tags: [] })).toBe('n5')
    expect(jlptTagFromCard({ tags: ['verb', 'common'] })).toBe('n5')
  })
})

describe('buildJlptLevelProgress', () => {
  it('computes mastery as a fraction of the max score across the level', () => {
    const cards = [card(1, ['n5']), card(2, ['n5'])]
    // one card at full mastery, one untouched -> half of the level's ceiling
    const [n5] = buildJlptLevelProgress(cards, mastered([1]))
    expect(n5.total).toBe(2)
    expect(n5.mastery).toBeCloseTo(0.5)
  })

  it('locks every later level once an earlier one is below 80% mastery', () => {
    const cards = [card(1, ['n5']), card(2, ['n4'])]
    const levels = buildJlptLevelProgress(cards, {})
    const byKey = Object.fromEntries(levels.map((l) => [l.key, l]))
    expect(byKey.n5.unlocked).toBe(true)   // first populated level is always reachable
    expect(byKey.n4.unlocked).toBe(false)  // gated behind unmastered n5
  })

  it('unlocks the next level once the previous clears the 80% gate', () => {
    const cards = [card(1, ['n5']), card(2, ['n4'])]
    const byKey = Object.fromEntries(
      buildJlptLevelProgress(cards, mastered([1])).map((l) => [l.key, l]),
    )
    expect(byKey.n5.mastery).toBe(1)
    expect(byKey.n4.unlocked).toBe(true)
  })

  it('reports empty levels as locked with zero mastery, without gating later levels', () => {
    const byKey = Object.fromEntries(
      buildJlptLevelProgress([card(1, ['n4'])], mastered([1])).map((l) => [l.key, l]),
    )
    expect(byKey.n5.total).toBe(0)
    expect(byKey.n5.unlocked).toBe(false)
    expect(byKey.n5.mastery).toBe(0)
    // an empty n5 must not block n4
    expect(byKey.n4.unlocked).toBe(true)
  })

  it('exposes at most three sample characters per level', () => {
    const cards = [1, 2, 3, 4, 5].map((id) => card(id, ['n5'], String(id)))
    const [n5] = buildJlptLevelProgress(cards, {})
    expect(n5.sampleChars).toEqual(['1', '2', '3'])
    expect(n5.cardIds).toHaveLength(5)
  })
})

describe('buildCategoryProgress', () => {
  type Cat = 'first' | 'second' | 'third'
  const order: Cat[] = ['first', 'second', 'third']
  const labels: Record<Cat, string> = { first: 'First', second: 'Second', third: 'Third' }
  const slugs: Record<Cat, string> = { first: 'c_first', second: 'c_second', third: 'c_third' }
  const deck = (ids: number[]) =>
    ids.map((id) => ({ id, character: 'x', tags: [] })) as unknown as ScriptDeck['cards']

  it('unlocks categories sequentially behind the 70% threshold', () => {
    const decks: Record<Cat, ScriptDeck['cards']> = {
      first: deck([1, 2]), second: deck([3]), third: deck([4]),
    }
    const rows = buildCategoryProgress(order, labels, slugs, decks, {})
    expect(rows.map((r) => r.unlocked)).toEqual([true, false, false])
  })

  it('opens the next category once the previous passes the threshold', () => {
    const decks: Record<Cat, ScriptDeck['cards']> = {
      first: deck([1]), second: deck([2]), third: deck([3]),
    }
    const rows = buildCategoryProgress(order, labels, slugs, decks, mastered([1]))
    expect(rows[0].mastery).toBe(1)
    expect(rows[1].unlocked).toBe(true)
    expect(rows[2].unlocked).toBe(false)
  })

  it('carries the deck slug through so category launches target the right deck', () => {
    const decks: Record<Cat, ScriptDeck['cards']> = {
      first: deck([1]), second: deck([2]), third: deck([3]),
    }
    const rows = buildCategoryProgress(order, labels, slugs, decks, {})
    expect(rows.map((r) => r.slug)).toEqual(['c_first', 'c_second', 'c_third'])
  })
})
