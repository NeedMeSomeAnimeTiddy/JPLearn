import { describe, expect, it } from 'vitest'

import {
  LEECH_ELIGIBLE_MODES,
  MULTIPLE_CHOICE_MODES,
  computeMinigameLockReasons,
  type MinigamePoolFacts,
} from './minigameAvailability'

function facts(overrides: Partial<MinigamePoolFacts> = {}): MinigamePoolFacts {
  return {
    size: 10,
    hasCompoundWords: true,
    conjugatableCount: 5,
    leechCount: 3,
    ...overrides,
  }
}

const NO_LEECH_FOCUS = { leechFocusEnabled: false }

describe('computeMinigameLockReasons', () => {
  it('locks nothing when the pool supports everything', () => {
    expect(computeMinigameLockReasons(facts(), NO_LEECH_FOCUS)).toEqual({})
  })

  it('locks nothing for an empty pool, which means the deck is still loading', () => {
    // Locking every mode mid-load reads as breakage rather than as a small pool.
    const reasons = computeMinigameLockReasons(
      facts({ size: 0, hasCompoundWords: false, conjugatableCount: 0, leechCount: 0 }),
      NO_LEECH_FOCUS,
    )
    expect(reasons).toEqual({})
  })

  it('locks multiple-choice modes when a single card is selected', () => {
    const reasons = computeMinigameLockReasons(facts({ size: 1 }), NO_LEECH_FOCUS)
    for (const mode of MULTIPLE_CHOICE_MODES) {
      expect(reasons[mode]).toBe('Not enough cards for this mode')
    }
  })

  it('leaves single-card modes playable with one card', () => {
    const reasons = computeMinigameLockReasons(facts({ size: 1 }), NO_LEECH_FOCUS)
    expect(reasons.romaji_sprint).toBeUndefined()
    expect(reasons.typed_recall).toBeUndefined()
  })

  it('locks the compound builder when the pool has no compound words', () => {
    const reasons = computeMinigameLockReasons(facts({ hasCompoundWords: false }), NO_LEECH_FOCUS)
    expect(reasons.kanji_compound_builder).toBe('No compound words in this selection')
  })

  it('locks the conjugation drill only when nothing is conjugatable', () => {
    expect(computeMinigameLockReasons(facts({ conjugatableCount: 1 }), NO_LEECH_FOCUS).conjugation_drill)
      .toBeUndefined()
    expect(computeMinigameLockReasons(facts({ conjugatableCount: 0 }), NO_LEECH_FOCUS).conjugation_drill)
      .toBe('No verbs or adjectives to conjugate here')
  })

  it('locks leech-eligible modes only while leech focus is on', () => {
    const empty = facts({ leechCount: 0 })
    expect(computeMinigameLockReasons(empty, NO_LEECH_FOCUS).romaji_sprint).toBeUndefined()

    const reasons = computeMinigameLockReasons(empty, { leechFocusEnabled: true })
    for (const mode of LEECH_ELIGIBLE_MODES) {
      expect(reasons[mode]).toBe('No leech cards in this selection')
    }
  })

  it('reports the pool size ahead of the leech reason', () => {
    // Both apply; the size is the one a learner can act on by selecting a block.
    const reasons = computeMinigameLockReasons(
      facts({ size: 1, leechCount: 0 }),
      { leechFocusEnabled: true },
    )
    expect(reasons.meaning_match).toBe('Not enough cards for this mode')
  })

  it('applies pool rules regardless of section', () => {
    // The old code gated these on `activeScript === 'vocab_n5'`, so a mode
    // offered in another section skipped its own precondition entirely.
    const reasons = computeMinigameLockReasons(
      facts({ hasCompoundWords: false, conjugatableCount: 0 }),
      NO_LEECH_FOCUS,
    )
    expect(reasons.kanji_compound_builder).toBe('No compound words in this selection')
    expect(reasons.conjugation_drill).toBe('No verbs or adjectives to conjugate here')
  })
})
