import { describe, it, expect } from 'vitest'
import type {
  MinigameKey,
} from './types'
import {
  buildBalancedRanking,
  MINIGAME_DIFFICULTY,
  type RankedMinigameCard,
} from './constants'

function makeCard(overrides: Partial<RankedMinigameCard> & { key: MinigameKey }): RankedMinigameCard {
  const key = overrides.key
  return {
    key,
    title: `Title ${key}`,
    description: `Desc ${key}`,
    accuracy: overrides.accuracy ?? 50,
    difficulty: overrides.difficulty ?? MINIGAME_DIFFICULTY[key],
    lockReason: overrides.lockReason ?? null,
    minigameLocked: overrides.minigameLocked ?? false,
    stats: overrides.stats ?? { attempted: 10, correct: 5, currentStreak: 1, bestStreak: 3, points: 50 },
    recommendationScore: overrides.recommendationScore ?? 0,
  }
}

describe('buildBalancedRanking', () => {
  it('returns empty array for empty input', () => {
    expect(buildBalancedRanking([])).toEqual([])
  })

  it('returns single card unchanged', () => {
    const card = makeCard({ key: 'romaji_sprint' })
    expect(buildBalancedRanking([card])).toEqual([card])
  })

  it('puts card with higher recommendationScore first when two cards', () => {
    const low = makeCard({ key: 'romaji_sprint', recommendationScore: 10 })
    const high = makeCard({ key: 'meaning_match', recommendationScore: 90 })
    const result = buildBalancedRanking([low, high])
    // High recommendation means more "needs work" — should come first
    expect(result[0].key).toBe('meaning_match')
  })

  it('gives zero-attempt cards high recommendation via unmet need = 100', () => {
    // Simulate what the view would compute: stats.attempted === 0 → unmetNeed = 100
    const fresh = makeCard({
      key: 'romaji_sprint',
      accuracy: 0,
      stats: { attempted: 0, correct: 0, currentStreak: 0, bestStreak: 0, points: 0 },
      recommendationScore: 100 + Math.max(0, 6 - 0), // 106
    })
    const veteran = makeCard({
      key: 'meaning_match',
      accuracy: 90,
      stats: { attempted: 50, correct: 45, currentStreak: 8, bestStreak: 12, points: 500 },
      recommendationScore: Math.max(0, 85 - 90) + Math.max(0, 6 - Math.min(12, 6)), // 0
    })
    const result = buildBalancedRanking([fresh, veteran])
    expect(result[0].key).toBe('romaji_sprint')
  })

  it('interleaves needs-work cards with momentum cards in balanced output', () => {
    const cards: RankedMinigameCard[] = [
      makeCard({ key: 'romaji_sprint', recommendationScore: 80, accuracy: 20, stats: { attempted: 5, correct: 1, currentStreak: 0, bestStreak: 0, points: 10 } }),
      makeCard({ key: 'meaning_match', recommendationScore: 70, accuracy: 30, stats: { attempted: 8, correct: 2, currentStreak: 0, bestStreak: 1, points: 20 } }),
      makeCard({ key: 'character_match', recommendationScore: 40, accuracy: 60, stats: { attempted: 20, correct: 12, currentStreak: 3, bestStreak: 5, points: 120 } }),
      makeCard({ key: 'stroke_order', recommendationScore: 20, accuracy: 80, stats: { attempted: 30, correct: 24, currentStreak: 5, bestStreak: 8, points: 240 } }),
      makeCard({ key: 'typed_recall', recommendationScore: 10, accuracy: 90, stats: { attempted: 40, correct: 36, currentStreak: 7, bestStreak: 10, points: 360 } }),
      makeCard({ key: 'interleave_mix', recommendationScore: 5, accuracy: 95, stats: { attempted: 50, correct: 47, currentStreak: 10, bestStreak: 15, points: 470 } }),
    ]
    const result = buildBalancedRanking(cards)
    // First 2 should be highest recommendation needs-work (romaji_sprint, meaning_match)
    // Next 2 should be highest momentum (interleave_mix, typed_recall)
    // Remaining follow in order
    expect(result[0].key).toBe('romaji_sprint')
    expect(result[1].key).toBe('meaning_match')
    // Momentum picks fill positions 2-3
    const momentumKeys = result.slice(2, 4).map(c => c.key)
    expect(momentumKeys).toContain('interleave_mix')
    expect(momentumKeys).toContain('typed_recall')
    // All original cards are preserved
    expect(result).toHaveLength(6)
    const allKeys = result.map(c => c.key)
    cards.forEach(c => expect(allKeys).toContain(c.key))
  })

  it('locked cards are still sorted normally (locked status does not affect algorithm)', () => {
    const locked = makeCard({
      key: 'speech_recall',
      recommendationScore: 90,
      minigameLocked: true,
      lockReason: 'Speech model not installed',
    })
    const normal = makeCard({ key: 'romaji_sprint', recommendationScore: 10 })
    const result = buildBalancedRanking([normal, locked])
    expect(result[0].key).toBe('speech_recall') // higher rec = earlier
    expect(result).toHaveLength(2)
  })
})

describe('MINIGAME_DIFFICULTY', () => {
  it('has entries for all 13 minigame keys', () => {
    const expectedKeys: MinigameKey[] = [
      'romaji_sprint',
      'meaning_match',
      'character_match',
      'stroke_order',
      'typed_recall',
      'speech_recall',
      'sentence_assembly',
      'particle_cloze',
      'vibe_check',
      'imposter',
      'listening_audio_first',
      'listening_prompt_first',
      'interleave_mix',
    ]
    expectedKeys.forEach(key => {
      expect(MINIGAME_DIFFICULTY[key]).toBeDefined()
      expect(MINIGAME_DIFFICULTY[key].level).toBeDefined()
      expect(['easy', 'medium', 'hard']).toContain(MINIGAME_DIFFICULTY[key].level)
      expect(['Easy', 'Medium', 'Hard']).toContain(MINIGAME_DIFFICULTY[key].label)
    })
    expect(Object.keys(MINIGAME_DIFFICULTY)).toHaveLength(13)
  })
})
