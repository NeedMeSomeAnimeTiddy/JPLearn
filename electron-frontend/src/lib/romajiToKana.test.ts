import { describe, expect, it } from 'vitest'
import { romajiToKana } from './romajiToKana'

describe('romajiToKana', () => {
  it('converts basic consonant-vowel pairs', () => {
    expect(romajiToKana('kudasai', 'hiragana')).toBe('ください')
    expect(romajiToKana('onegaishimasu', 'hiragana')).toBe('おねがいします')
  })

  it('converts dakuten/handakuten rows', () => {
    expect(romajiToKana('gozaimasu', 'hiragana')).toBe('ございます')
    expect(romajiToKana('arigatou gozaimasu'.replace(' ', ''), 'hiragana')).toBe('ありがとうございます')
  })

  it('converts yoon combinations (kya/sho/ryu) correctly, not as separate mora', () => {
    expect(romajiToKana('kyou', 'hiragana')).toBe('きょう')
    expect(romajiToKana('sensei', 'hiragana')).toBe('せんせい')
    expect(romajiToKana('shukudai', 'hiragana')).toBe('しゅくだい')
    expect(romajiToKana('ryokou', 'hiragana')).toBe('りょこう')
  })

  it('converts sokuon (doubled consonants) to っ/ッ', () => {
    expect(romajiToKana('kitte', 'hiragana')).toBe('きって')
    expect(romajiToKana('chotto', 'hiragana')).toBe('ちょっと')
    expect(romajiToKana('kekkon', 'hiragana').startsWith('けっこ')).toBe(true)
  })

  it('handles ん written as bare n, n-apostrophe, and doubled nn', () => {
    expect(romajiToKana('shinjuku', 'hiragana')).toBe('しんじゅく')
    // "gen'in" (原因, cause): apostrophe disambiguates ん from げに.
    expect(romajiToKana("gen'in", 'hiragana')).toBe('げんいん')
    // "annai" (案内, guidance): doubled n is ん + な, not sokuon.
    expect(romajiToKana('annai', 'hiragana')).toBe('あんない')
  })

  it('converts doubled vowels the same way real chouon text folds (see normalizeJapaneseAnswer)', () => {
    expect(romajiToKana('koohii', 'hiragana')).toBe('こおひい')
  })

  it('supports katakana output', () => {
    expect(romajiToKana('koohii', 'katakana')).toBe('コオヒイ')
    expect(romajiToKana('gozaimasu', 'katakana')).toBe('ゴザイマス')
  })
})
