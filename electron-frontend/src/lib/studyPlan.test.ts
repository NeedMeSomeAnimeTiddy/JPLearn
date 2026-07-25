import { describe, expect, it } from 'vitest'
import { buildStudyPlan } from './studyPlan'
import type { ScriptKey, StudyPlanSnapshot, StudyPlanStage, StudySummaryPayload } from '../types'

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

describe('buildStudyPlan learner stage', () => {
  const STAGE_ORDER: StudyPlanStage[] = ['starter', 'building', 'advanced']

  function plan(decks: Deck[]) {
    return buildStudyPlan(decks, [], [], ACTIVITY, 4)
  }

  function row(snapshot: StudyPlanSnapshot, key: ScriptKey) {
    const found = snapshot.coverageRows.find((entry) => entry.key === key)
    if (!found) throw new Error(`${key} coverage row missing`)
    return found
  }

  // Issue #75: the stage used to be a card-count-weighted average, so a track's
  // influence was its deck size. Everything except vocabulary is mastered here;
  // padding the untouched vocabulary decks (#67 grew them from ~2,000 to ~8,031
  // cards) used to drag the average from 0.405 down to 0.057 and demote the
  // learner from `building` to `starter` without any progress being lost.
  const masteredTracks = [
    deck('hiragana', 104, 104),
    deck('katakana', 104, 104),
    deck('kanji_n5', 80, 80),
    deck('grammar_patterns', 100, 100),
    deck('sentence_examples', 100, 100),
  ]

  it('is unaffected by the size of an untouched track', () => {
    const compact = plan([...masteredTracks, deck('vocab_n5', 718, 0)])
    const expanded = plan([
      ...masteredTracks,
      deck('vocab_n5', 718, 0),
      deck('vocab_n4', 666, 0),
      deck('vocab_n3', 2139, 0),
      deck('vocab_n2', 1809, 0),
      deck('vocab_n1', 2699, 0),
    ])

    expect(compact.learnerStage).toBe('advanced')
    expect(expanded.learnerStage).toBe(compact.learnerStage)
    expect(expanded.overallMastery).toBeCloseTo(compact.overallMastery, 10)
  })

  it('never lowers the stage when progress unlocks another track', () => {
    // Katakana unlocks at 35% hiragana. Averaging only the unlocked rows would
    // drop a fresh 0%-mastery row into the mean at exactly that moment, so
    // crossing the line would demote the learner for making progress.
    const belowUnlock = plan([deck('hiragana', 104, 34)])
    const aboveUnlock = plan([deck('hiragana', 104, 42)])

    expect(row(belowUnlock, 'katakana').unlocked).toBe(false)
    expect(row(aboveUnlock, 'katakana').unlocked).toBe(true)
    expect(aboveUnlock.overallMastery).toBeGreaterThan(belowUnlock.overallMastery)
    expect(STAGE_ORDER.indexOf(aboveUnlock.learnerStage))
      .toBeGreaterThanOrEqual(STAGE_ORDER.indexOf(belowUnlock.learnerStage))
  })

  it('routes the weakest untouched track to a recognition drill at building', () => {
    // Equal weighting reaches `building` far sooner than the card-weighted
    // average could — two mastered kana tracks are enough — so pin what the
    // shortcuts do there. Kanji and vocabulary are tied at 0% mastery, so the
    // difficulty tiebreak puts kanji at index 0, which `building` routes to
    // `character_match`. See the test below for the untied case.
    const snapshot = plan([
      deck('hiragana', 104, 104),
      deck('katakana', 104, 104),
      deck('kanji_n5', 80, 0),
      deck('vocab_n5', 718, 0),
      deck('grammar_patterns', 100, 0),
      deck('sentence_examples', 100, 0),
    ])

    expect(snapshot.learnerStage).toBe('building')
    expect(row(snapshot, 'kanji_n5').unlocked).toBe(true)
    expect(snapshot.shortcutRows[0].script).toBe('kanji_n5')
    expect(snapshot.shortcutRows[0].minigame).toBe('character_match')
    expect(snapshot.shortcutRows.map((shortcut) => shortcut.minigame)).not.toContain('typed_recall')
  })

  it('can route an untouched vocabulary track to typed recall at building', () => {
    // Documents a consequence of the #75 fix rather than endorsing it. The old
    // card-weighted average put this learner at 0.027 — `starter`, routing to
    // `meaning_match` — so the `building`/`advanced` branches of
    // `getStudyPlanShortcutMinigame` were effectively unreachable. Now that
    // kana mastery alone reaches `building`, `vocab_n5` at index 0 resolves to
    // `typed_recall` even at 0% mastery. Whether the routing table needs a
    // per-row mastery floor is a separate question from the weighting.
    const snapshot = plan([
      deck('hiragana', 104, 104),
      deck('katakana', 104, 104),
      deck('kanji_n5', 80, 24),
      deck('vocab_n5', 718, 0),
      deck('grammar_patterns', 100, 0),
      deck('sentence_examples', 100, 0),
    ])

    expect(snapshot.learnerStage).toBe('building')
    expect(snapshot.shortcutRows[0].script).toBe('vocab_n5')
    expect(snapshot.shortcutRows[0].minigame).toBe('typed_recall')
  })

  it('stays at starter without a streak regardless of mastery', () => {
    const snapshot = buildStudyPlan([...masteredTracks, deck('vocab_n5', 718, 718)], [], [], ACTIVITY, 1)
    expect(snapshot.overallMastery).toBe(1)
    expect(snapshot.learnerStage).toBe('starter')
  })
})
