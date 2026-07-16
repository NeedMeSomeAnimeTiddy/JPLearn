import { describe, expect, it } from 'vitest'
import {
  isHandwritingEligibleCharacter,
  isHandwritingOutcomeCorrect,
  validateHandwritingCharacterData,
} from './utils'

describe('handwriting data utilities', () => {
  it('accepts supported single kana and kanji but excludes multi-character cards', () => {
    expect(isHandwritingEligibleCharacter('あ')).toBe(true)
    expect(isHandwritingEligibleCharacter('ア')).toBe(true)
    expect(isHandwritingEligibleCharacter('日')).toBe(true)
    expect(isHandwritingEligibleCharacter('きゃ')).toBe(false)
  })

  it('requires verified, unassisted completion for a correct session result', () => {
    expect(isHandwritingOutcomeCorrect({
      completed: true,
      mistakeCount: 0,
      usedHint: false,
      usedAnimation: false,
      gaveUp: false,
    })).toBe(true)
    expect(isHandwritingOutcomeCorrect({
      completed: true,
      mistakeCount: 1,
      usedHint: false,
      usedAnimation: false,
      gaveUp: false,
    })).toBe(false)
  })

  it('rejects malformed character data before it reaches Hanzi Writer', () => {
    expect(validateHandwritingCharacterData({ strokes: ['M1'], medians: [[[0, 0]]] })).toBe(true)
    expect(validateHandwritingCharacterData({ strokes: ['M1'], medians: [] })).toBe(false)
  })
})
