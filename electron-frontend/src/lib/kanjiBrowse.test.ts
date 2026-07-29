import { describe, expect, it } from 'vitest'
import {
  ALL_THEMES,
  countByBucket,
  filterKanjiCards,
  masteryBucket,
  matchesQuery,
  themesIn,
  type BrowsableCard,
} from './kanjiBrowse'
import { CARD_MASTERY_MAX } from '../constants'

const CARDS: BrowsableCard[] = [
  { id: 1, character: '日', romaji: 'nichi/hi', meaning: 'day, sun', theme: 'Numbers & Time' },
  { id: 2, character: '月', romaji: 'getsu/tsuki', meaning: 'month, moon', theme: 'Numbers & Time' },
  { id: 3, character: '山', romaji: 'san/yama', meaning: 'mountain', theme: 'Nature & World' },
]

describe('masteryBucket', () => {
  it('splits untouched, in-progress and finished cards', () => {
    expect(masteryBucket(0)).toBe('new')
    expect(masteryBucket(1)).toBe('learning')
    expect(masteryBucket(CARD_MASTERY_MAX - 1)).toBe('learning')
    expect(masteryBucket(CARD_MASTERY_MAX)).toBe('mastered')
  })

  it('clamps rather than inventing a fourth state', () => {
    // A stored score can outlive a lowering of CARD_MASTERY_MAX.
    expect(masteryBucket(CARD_MASTERY_MAX + 5)).toBe('mastered')
    expect(masteryBucket(-1)).toBe('new')
  })
})

describe('matchesQuery', () => {
  it('matches a pasted kanji character', () => {
    expect(matchesQuery(CARDS[0], '日')).toBe(true)
    expect(matchesQuery(CARDS[1], '日')).toBe(false)
  })

  it('matches romaji and meaning case-insensitively', () => {
    expect(matchesQuery(CARDS[2], 'YAMA')).toBe(true)
    expect(matchesQuery(CARDS[2], 'Mountain')).toBe(true)
  })

  it('matches one reading of a multi-reading romaji field', () => {
    expect(matchesQuery(CARDS[1], 'tsuki')).toBe(true)
  })

  it('treats a blank or whitespace query as no filter', () => {
    expect(matchesQuery(CARDS[0], '')).toBe(true)
    expect(matchesQuery(CARDS[0], '   ')).toBe(true)
  })
})

describe('filterKanjiCards', () => {
  const scores = { 1: 0, 2: 2, 3: CARD_MASTERY_MAX }

  it('returns everything when unfiltered', () => {
    expect(filterKanjiCards(CARDS, scores, '', 'all')).toHaveLength(3)
  })

  it('filters by bucket', () => {
    expect(filterKanjiCards(CARDS, scores, '', 'new').map((c) => c.id)).toEqual([1])
    expect(filterKanjiCards(CARDS, scores, '', 'learning').map((c) => c.id)).toEqual([2])
    expect(filterKanjiCards(CARDS, scores, '', 'mastered').map((c) => c.id)).toEqual([3])
  })

  it('applies query and bucket together', () => {
    expect(filterKanjiCards(CARDS, scores, 'moon', 'learning').map((c) => c.id)).toEqual([2])
    expect(filterKanjiCards(CARDS, scores, 'moon', 'mastered')).toEqual([])
  })

  it('treats a card with no stored score as new', () => {
    expect(filterKanjiCards(CARDS, {}, '', 'new')).toHaveLength(3)
  })

  it('preserves deck order', () => {
    expect(filterKanjiCards(CARDS, scores, '', 'all').map((c) => c.id)).toEqual([1, 2, 3])
  })
})

describe('countByBucket', () => {
  it('counts every card exactly once', () => {
    const counts = countByBucket(CARDS, { 1: 0, 2: 2, 3: CARD_MASTERY_MAX })
    expect(counts).toEqual({ new: 1, learning: 1, mastered: 1 })
  })

  it('counts an empty score map as all new', () => {
    expect(countByBucket(CARDS, {})).toEqual({ new: 3, learning: 0, mastered: 0 })
  })
})

describe('themesIn', () => {
  it('lists each theme once, in deck order', () => {
    expect(themesIn(CARDS)).toEqual(['Numbers & Time', 'Nature & World'])
  })

  it('skips cards with no theme rather than emitting a blank entry', () => {
    expect(themesIn([{ ...CARDS[0], theme: '' }])).toEqual([])
  })
})

describe('filterKanjiCards by theme', () => {
  const scores = { 1: 0, 2: 2, 3: CARD_MASTERY_MAX }

  it('narrows to one theme', () => {
    expect(filterKanjiCards(CARDS, scores, '', 'all', 'Nature & World').map((c) => c.id)).toEqual([3])
  })

  it('treats the sentinel as no theme filter', () => {
    expect(filterKanjiCards(CARDS, scores, '', 'all', ALL_THEMES)).toHaveLength(3)
  })

  it('combines with search and mastery', () => {
    expect(
      filterKanjiCards(CARDS, scores, 'moon', 'learning', 'Numbers & Time').map((c) => c.id),
    ).toEqual([2])
    expect(filterKanjiCards(CARDS, scores, 'moon', 'learning', 'Nature & World')).toEqual([])
  })
})
