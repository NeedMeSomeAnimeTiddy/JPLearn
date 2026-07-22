import { describe, it, expect } from 'vitest'
import {
  PERFORMANCE_GOOD_MS,
  PERFORMANCE_PERFECT_MS,
  calculateAwardedPoints,
  classifyRoundPerformance,
  getRoundRecoveryTip,
} from './roundScoring'
import { POINT_COMBO_THRESHOLDS } from '../constants'

describe('calculateAwardedPoints', () => {
  it('awards a base point with no combo bonus below the first threshold', () => {
    expect(calculateAwardedPoints(0)).toBe(1)
    expect(calculateAwardedPoints(1)).toBe(1)
    expect(calculateAwardedPoints(2)).toBe(1)
  })

  it('adds one bonus point per crossed combo threshold', () => {
    const [first, second, third] = POINT_COMBO_THRESHOLDS
    expect(calculateAwardedPoints(first)).toBe(2)
    expect(calculateAwardedPoints(second)).toBe(3)
    expect(calculateAwardedPoints(third)).toBe(4)
  })

  it('caps at the number of thresholds however long the streak runs', () => {
    expect(calculateAwardedPoints(500)).toBe(1 + POINT_COMBO_THRESHOLDS.length)
  })
})

describe('classifyRoundPerformance', () => {
  it('reports MISS for a wrong answer regardless of speed', () => {
    expect(classifyRoundPerformance(false, 0)).toBe('MISS')
    expect(classifyRoundPerformance(false, 99_999)).toBe('MISS')
  })

  it('grades correct answers by response time', () => {
    expect(classifyRoundPerformance(true, 250)).toBe('PERFECT')
    expect(classifyRoundPerformance(true, 1500)).toBe('GOOD')
    expect(classifyRoundPerformance(true, 5000)).toBe('SLOW')
  })

  it('treats each threshold as inclusive', () => {
    expect(classifyRoundPerformance(true, PERFORMANCE_PERFECT_MS)).toBe('PERFECT')
    expect(classifyRoundPerformance(true, PERFORMANCE_PERFECT_MS + 1)).toBe('GOOD')
    expect(classifyRoundPerformance(true, PERFORMANCE_GOOD_MS)).toBe('GOOD')
    expect(classifyRoundPerformance(true, PERFORMANCE_GOOD_MS + 1)).toBe('SLOW')
  })
})

describe('getRoundRecoveryTip', () => {
  it('returns a mode-specific tip for the newer minigames', () => {
    expect(getRoundRecoveryTip('kanji_compound_builder')).toMatch(/each kanji contributes/i)
    expect(getRoundRecoveryTip('context_cloze')).toMatch(/sentence context/i)
  })

  it('always returns a non-empty tip for every playable mode', () => {
    const modes = [
      'romaji_sprint', 'meaning_match', 'character_match', 'stroke_order', 'handwriting',
      'typed_recall', 'speech_recall', 'sentence_assembly', 'particle_cloze', 'vibe_check',
      'imposter', 'listening_audio_first', 'dictation', 'kanji_compound_builder', 'context_cloze',
    ] as const
    for (const mode of modes) {
      expect(getRoundRecoveryTip(mode).length).toBeGreaterThan(0)
    }
  })
})
