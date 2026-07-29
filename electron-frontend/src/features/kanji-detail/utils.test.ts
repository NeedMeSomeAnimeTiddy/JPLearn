import { describe, expect, it } from 'vitest'
import {
  extractKanjiCharacters,
  formatKanjiDetailTag,
  formatKanjiReading,
} from './utils'

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
