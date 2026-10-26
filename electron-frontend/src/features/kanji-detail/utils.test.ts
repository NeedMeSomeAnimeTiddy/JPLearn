import { describe, expect, it } from 'vitest'
import type { KanjiDetailPayload } from '../../generated/types'
import {
  extractKanjiCharacters,
  formatKanjiDetailTag,
  formatKanjiReading,
  kanjiParts,
  kanjiSheetRows,
  missingFromDeck,
} from './utils'

const reading = (r: string) => ({ reading: r, examples: [] })
const compound = (word: string, is_common: boolean) => ({ word, reading: '', meanings: [], is_common })
function payload(overrides: Partial<KanjiDetailPayload> = {}): KanjiDetailPayload {
  return {
    character: '日', meanings: [], on_readings: [], kun_readings: [], radicals: [], components: [],
    jlpt_level: null, jlpt_level_source: null, stroke_count: null, classical_radical_number: null,
    tags: [], categories: [], compounds: [], has_more_compounds: false, source: 'deck_only',
    ...overrides,
  }
}

describe('the middle column budget', () => {
  it('shows one row of each kind before a second of either, and counts what it hides', () => {
    const rows = kanjiSheetRows(payload({
      on_readings: [reading('ニチ'), reading('ジツ')],
      kun_readings: [reading('ひ'), reading('か')],
    }))
    expect(rows.readings.map((r) => `${r.kind}:${r.reading?.reading}`)).toEqual(['ON:ニチ', 'ON:ジツ', 'KUN:ひ'])
    expect(rows.readingsHidden).toBe(1)
  })

  it('gives an absent kind its absence row, and the rest of the budget to compounds, common first', () => {
    const rows = kanjiSheetRows(payload({
      on_readings: [reading('カン')],
      compounds: [compound('a', false), compound('b', true), compound('c', true), compound('d', false), compound('e', true)],
      has_more_compounds: true,
    }))
    expect(rows.readings.map((r) => r.kind)).toEqual(['ON', 'KUN'])
    expect(rows.readings[1].reading).toBeNull()
    expect(rows.compounds.map((c) => c.word)).toEqual(['b', 'c', 'e', 'a'])
    expect(rows.compoundTotal).toBe(5)
    expect(rows.hasMoreCompounds).toBe(true)
  })

  it('names exactly what the deck cannot give, and falls back to radicals for parts', () => {
    expect(missingFromDeck(payload())).toEqual(['READINGS', 'MEANINGS', 'COMPOUNDS', 'STROKE COUNT'])
    expect(missingFromDeck(payload({ meanings: ['day'], stroke_count: 4 }))).toEqual(['READINGS', 'COMPOUNDS'])
    expect(kanjiParts(payload({ components: ['言'] }))).toEqual(['言'])
    expect(kanjiParts(payload({ radicals: [{ position: 0, radical: '日', stroke_count: 4, code: null }] }))).toEqual(['日'])
  })
})

describe('kanji-detail utilities', () => {
  it('extracts unique Han ideographs in their original code-point order', () => {
    expect(extractKanjiCharacters('かな日本日𠮷本々')).toEqual(['日', '本', '𠮷'])
  })

  it('formats displayed readings and deck tags without changing their meaning', () => {
    expect(formatKanjiReading('た.べる')).toBe('た・べる')
    expect(formatKanjiReading('-び')).toBe('-び')
    expect(formatKanjiDetailTag('vocab_greetings')).toBe('Greetings')
  })
})
