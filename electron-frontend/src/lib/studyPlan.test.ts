import { describe, expect, it } from 'vitest'
import { buildStudyPlan } from './studyPlan'
import type { StudySummaryPayload } from '../types'

type Deck = StudySummaryPayload['decks'][number]

function deck(slug: string, total: number, mastered: number): Deck {
  return { slug, name: slug, total, mastered, due_today: 0, completed_today: 0 } as Deck
}

const ACTIVITY = {
  week: { reviewed: 30, correct: 25, sessions: 5, minutes: 60 },
  month: { reviewed: 90, correct: 75, sessions: 15, minutes: 180 },
} as unknown as StudySummaryPayload['activity']

function grammarRow(decks: Deck[]) {
  const plan = buildStudyPlan(decks, [], [], ACTIVITY, 4)
  const row = plan.coverageRows.find((entry) => entry.key === 'grammar_patterns')
  if (!row) throw new Error('grammar_patterns coverage row missing')
  return row
}

describe('buildStudyPlan grammar readiness', () => {
  // Regression guard for issue #67: vocab level decks stopped being truncated,
  // so the all-levels `vocab_*` aggregate grew from ~2,000 to ~8,200 cards.
  // Gating N5 grammar on that aggregate would have quietly required N2/N1
  // vocabulary before N5 grammar was ever suggested.
  const higherLevels = [
    deck('vocab_n4', 666, 0),
    deck('vocab_n3', 2139, 0),
    deck('vocab_n2', 1809, 0),
    deck('vocab_n1', 2699, 0),
  ]

  it('unlocks grammar from N5 vocabulary alone', () => {
    const decks = [deck('vocab_n5', 718, 400), ...higherLevels]
    expect(grammarRow(decks).unlocked).toBe(true)
  })

  it('is unaffected by the size of the untouched higher-level decks', () => {
    const withoutHigher = grammarRow([deck('vocab_n5', 718, 400)])
    const withHigher = grammarRow([deck('vocab_n5', 718, 400), ...higherLevels])
    expect(withHigher.unlocked).toBe(withoutHigher.unlocked)
  })

  it('keeps grammar locked while N5 vocabulary is below the threshold', () => {
    const decks = [deck('vocab_n5', 718, 100), ...higherLevels]
    expect(grammarRow(decks).unlocked).toBe(false)
  })

  it('falls back to the aggregate when no vocab_n5 deck is reported', () => {
    expect(grammarRow([deck('vocab_n4', 666, 500)]).unlocked).toBe(true)
    expect(grammarRow([deck('vocab_n4', 666, 10)]).unlocked).toBe(false)
  })
})
