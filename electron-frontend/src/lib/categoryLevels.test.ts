import { describe, expect, it } from 'vitest'
import {
  CATEGORY_LEVEL_ORDER,
  categoryLevelOf,
  categoryShortLabel,
  levelsPresentIn,
  resolveVisibleLevel,
  rowsForLevel,
} from './categoryLevels'
import { KANJI_CATEGORY_ORDER, VOCAB_CATEGORY_ORDER } from '../constants'

const rows = (...keys: string[]) => keys.map((key) => ({ key }))

describe('categoryLevelOf', () => {
  it('reads the level from a prefixed key', () => {
    expect(categoryLevelOf('n4_school_work')).toBe('n4')
    expect(categoryLevelOf('n1_arts_expression')).toBe('n1')
  })

  it('treats unprefixed keys as N5', () => {
    // The N5 categories predate the prefix convention.
    expect(categoryLevelOf('greetings')).toBe('n5')
    expect(categoryLevelOf('numbers_time')).toBe('n5')
  })

  it('does not mistake a level-like fragment mid-key for a prefix', () => {
    expect(categoryLevelOf('food_n4_drink')).toBe('n5')
    expect(categoryLevelOf('n9_unknown')).toBe('n5')
    expect(categoryLevelOf('n4')).toBe('n5')
  })
})

describe('levelsPresentIn', () => {
  it('returns only levels that have categories, in N5-to-N1 order', () => {
    expect(levelsPresentIn(rows('n1_law_justice', 'greetings', 'n3_emotion_mind')))
      .toEqual(['n5', 'n3', 'n1'])
  })

  it('is empty for no rows', () => {
    expect(levelsPresentIn([])).toEqual([])
  })
})

describe('rowsForLevel', () => {
  it('keeps original order within a level', () => {
    const all = rows('n4_b', 'greetings', 'n4_a')
    expect(rowsForLevel(all, 'n4').map((r) => r.key)).toEqual(['n4_b', 'n4_a'])
  })
})

describe('resolveVisibleLevel', () => {
  it('honours the preferred level when it has categories', () => {
    expect(resolveVisibleLevel(rows('greetings', 'n2_economy_trade'), 'n2')).toBe('n2')
  })

  it('falls back to the first present level so the strip is never blank', () => {
    expect(resolveVisibleLevel(rows('greetings'), 'n1')).toBe('n5')
  })

  it('keeps the preference when there is nothing to show at all', () => {
    expect(resolveVisibleLevel([], 'n3')).toBe('n3')
  })
})

describe('categoryShortLabel', () => {
  it('drops a level prefix the level tab already conveys', () => {
    expect(categoryShortLabel('N4 · School & Work')).toBe('School & Work')
    expect(categoryShortLabel('N1 · Arts & Expression')).toBe('Arts & Expression')
  })

  it('leaves unprefixed labels alone', () => {
    expect(categoryShortLabel('Greetings')).toBe('Greetings')
    expect(categoryShortLabel('Food & Drink')).toBe('Food & Drink')
  })
})

describe('against the real category lists', () => {
  it('splits every vocabulary category into a level, none left over', () => {
    const grouped = CATEGORY_LEVEL_ORDER.flatMap((level) =>
      rowsForLevel(VOCAB_CATEGORY_ORDER.map((key) => ({ key })), level),
    )
    expect(grouped).toHaveLength(VOCAB_CATEGORY_ORDER.length)
  })

  it('keeps every level small enough to render without scrolling', () => {
    // The whole point of the change: no level may be a 28-chip row again.
    for (const list of [VOCAB_CATEGORY_ORDER, KANJI_CATEGORY_ORDER]) {
      for (const level of CATEGORY_LEVEL_ORDER) {
        const count = rowsForLevel(list.map((key) => ({ key })), level).length
        expect(count).toBeLessThanOrEqual(12)
      }
    }
  })

  it('gives both tracks all five levels', () => {
    expect(levelsPresentIn(VOCAB_CATEGORY_ORDER.map((key) => ({ key })))).toEqual(CATEGORY_LEVEL_ORDER)
    expect(levelsPresentIn(KANJI_CATEGORY_ORDER.map((key) => ({ key })))).toEqual(CATEGORY_LEVEL_ORDER)
  })
})
