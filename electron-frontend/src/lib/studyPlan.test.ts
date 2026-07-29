import { describe, expect, it } from 'vitest'
import { buildStudyPlan } from './studyPlan'
import type { ScriptKey, StudySummaryPayload } from '../types'

type Deck = StudySummaryPayload['decks'][number]

function deck(slug: string, total: number, mastered: number): Deck {
  return { slug, name: slug, total, mastered, due_today: 0, completed_today: 0 } as Deck
}


function planRow(decks: Deck[], key: ScriptKey) {
  const plan = buildStudyPlan(decks, [], [])
  const row = plan.coverageRows.find((entry) => entry.key === key)
  if (!row) throw new Error(`${key} coverage row missing`)
  return row
}

function grammarRow(decks: Deck[]) {
  return planRow(decks, 'grammar_patterns')
}

// The JLPT level decks (`vocab_n5`..`vocab_n1`) are registered and reported by
// the bridge `summary` command, but never studied — every review from the
// kanji/vocab sections is recorded against a thematic category deck. They appear
// in these fixtures with `mastered: 0`, which is the only state they can hold.
const VOCAB_LEVEL_DECKS = [
  deck('vocab_n5', 718, 0),
  deck('vocab_n4', 666, 0),
  deck('vocab_n1', 2699, 0),
]
const KANJI_LEVEL_DECKS = [
  deck('kanji_n5', 103, 0),
  deck('kanji_n1', 1136, 0),
]

// N5 vocab categories carry no level infix; `vocab_numbers` and `vocab_nouns`
// begin `vocab_n` without being level decks, so they double as parser traps.
const VOCAB_N5_CATEGORIES = (mastered: [number, number, number]) => [
  deck('vocab_greetings', 20, mastered[0]),
  deck('vocab_numbers', 15, mastered[1]),
  deck('vocab_nouns', 12, mastered[2]),
]
const VOCAB_HIGHER_CATEGORIES = [
  deck('vocab_n4_school_work', 45, 0),
  deck('vocab_n3_work_business', 30, 0),
  deck('vocab_n1_law_justice', 25, 0),
]

describe('buildStudyPlan grammar readiness', () => {
  // Regression guard for issue #67: gating N5 grammar on the whole-track vocab
  // aggregate would quietly require N2/N1 vocabulary before N5 grammar was ever
  // suggested. The gate is scoped to the N5 category decks instead.
  it('unlocks grammar from N5 vocabulary alone', () => {
    const decks = [...VOCAB_N5_CATEGORIES([20, 10, 0]), ...VOCAB_HIGHER_CATEGORIES, ...VOCAB_LEVEL_DECKS]
    expect(grammarRow(decks).unlocked).toBe(true)
  })

  it('is unaffected by the size of the untouched higher-level decks', () => {
    const n5Only = VOCAB_N5_CATEGORIES([20, 10, 0])
    const withHigher = grammarRow([...n5Only, ...VOCAB_HIGHER_CATEGORIES, ...VOCAB_LEVEL_DECKS])
    expect(withHigher.unlocked).toBe(grammarRow(n5Only).unlocked)
  })

  it('keeps grammar locked while N5 vocabulary is below the threshold', () => {
    const decks = [...VOCAB_N5_CATEGORIES([5, 0, 0]), ...VOCAB_HIGHER_CATEGORIES, ...VOCAB_LEVEL_DECKS]
    expect(grammarRow(decks).unlocked).toBe(false)
  })

  it('falls back to the whole-track aggregate when no N5 category deck is reported', () => {
    expect(grammarRow([deck('vocab_n4_school_work', 45, 40)]).unlocked).toBe(true)
    expect(grammarRow([deck('vocab_n4_school_work', 45, 2)]).unlocked).toBe(false)
  })

  // The live bug this scoping fixes: `vocab_n5` is reported with a nonzero total
  // and permanently zero mastered, so gating on it selected the `.total > 0`
  // branch and pinned `grammarReady` to false no matter how much the learner
  // studied. Grammar was unreachable in the shipped app.
  it('is not pinned false by the never-reviewed vocab_n5 level deck', () => {
    const decks = [...VOCAB_N5_CATEGORIES([20, 15, 12]), ...VOCAB_LEVEL_DECKS]
    expect(grammarRow(decks).unlocked).toBe(true)
  })
})

// The `kanji_n5` / `vocab_n5` coverage rows are whole-track (N5→N1), not N5:
// `ScriptKey` names the app's six sections, not deck slugs (issue #66), and the
// section `vocab_n5` names reaches N1 decks via VOCAB_CATEGORY_TO_DECK_SLUG.
describe('buildStudyPlan track coverage rows', () => {
  const vocabCategories = [...VOCAB_N5_CATEGORIES([20, 15, 12]), ...VOCAB_HIGHER_CATEGORIES]
  const kanjiCategories = [
    deck('kanji_numbers_time', 30, 30),
    deck('kanji_nature_world', 25, 0),
    deck('kanji_n4_daily_life', 20, 0),
    deck('kanji_n3_governance', 15, 0),
  ]

  it('pools every vocabulary category, N5 through N1, into the vocab_n5 row', () => {
    const row = planRow([...vocabCategories, ...VOCAB_LEVEL_DECKS], 'vocab_n5')
    expect(row.total).toBe(147)
    expect(row.mastery).toBeCloseTo(47 / 147, 6)
  })

  it('pools every kanji category, N5 through N1, into the kanji_n5 row', () => {
    const row = planRow([...kanjiCategories, ...KANJI_LEVEL_DECKS], 'kanji_n5')
    expect(row.total).toBe(90)
    expect(row.mastery).toBeCloseTo(30 / 90, 6)
  })

  // Guards the intent against a "fix" that rescopes the row to the N5 decks to
  // match its key: the row is whole-track, the grammar gate stays N5-only.
  it('reports whole-track mastery on the row while grammar gates on N5 alone', () => {
    const decks = [...VOCAB_N5_CATEGORIES([20, 15, 12]), ...VOCAB_HIGHER_CATEGORIES]
    const plan = buildStudyPlan(decks, [], [])
    const vocabRow = plan.coverageRows.find((row) => row.key === 'vocab_n5')!
    const grammar = plan.coverageRows.find((row) => row.key === 'grammar_patterns')!

    // N5 is fully mastered (47/47) but only ~32% of the track is.
    expect(vocabRow.mastery).toBeCloseTo(47 / 147, 6)
    expect(grammar.unlocked).toBe(true)
  })
})

// The level decks are registered in ALL_DECKS and reported by `summary`, but
// `resultSlug` (useStudySession.ts:1159-1164) routes every review through the
// category maps, so a level deck can never accumulate mastery. Including them
// would peg both rows at 0 over ~8,031 vocab / ~2,196 kanji cards forever.
describe('buildStudyPlan excludes the never-reviewed level decks', () => {
  const vocabCategories = VOCAB_N5_CATEGORIES([20, 15, 12])
  const kanjiCategories = [deck('kanji_numbers_time', 30, 30)]

  it('leaves the vocabulary row untouched by level decks', () => {
    const withLevels = planRow([...vocabCategories, ...VOCAB_LEVEL_DECKS], 'vocab_n5')
    const categoriesOnly = planRow(vocabCategories, 'vocab_n5')

    expect(withLevels.total).toBe(categoriesOnly.total)
    expect(withLevels.mastery).toBe(categoriesOnly.mastery)
    expect(withLevels.total).toBe(47)
    expect(withLevels.mastery).toBe(1)
  })

  it('leaves the kanji row untouched by level decks', () => {
    const withLevels = planRow([...kanjiCategories, ...KANJI_LEVEL_DECKS], 'kanji_n5')
    const categoriesOnly = planRow(kanjiCategories, 'kanji_n5')

    expect(withLevels.total).toBe(categoriesOnly.total)
    expect(withLevels.mastery).toBe(categoriesOnly.mastery)
    expect(withLevels.mastery).toBe(1)
  })

  it('reports zero rather than a level-deck denominator when nothing is studied', () => {
    const row = planRow(VOCAB_LEVEL_DECKS, 'vocab_n5')
    expect(row.total).toBe(0)
    expect(row.mastery).toBe(0)
  })

  // The point of the change: under a level-deck denominator the vocabulary row
  // was a constant near zero and could never clear its target, however much the
  // learner studied. It must be able to reach 1 while a genuinely partial track
  // stays below it — that difference is what the engine now ranks on.
  it('lets a fully-mastered vocabulary row read as complete beside a partial one', () => {
    const plan = buildStudyPlan(
      [
        deck('hiragana', 104, 100),
        deck('katakana', 104, 80),
        ...VOCAB_N5_CATEGORIES([20, 15, 12]),
        deck('kanji_numbers_time', 90, 30),
        ...VOCAB_LEVEL_DECKS,
        ...KANJI_LEVEL_DECKS,
      ],
      [], [],
    )
    const vocabRow = plan.coverageRows.find((row) => row.key === 'vocab_n5')!
    const kanjiRow = plan.coverageRows.find((row) => row.key === 'kanji_n5')!

    expect(vocabRow.unlocked).toBe(true)
    expect(vocabRow.mastery).toBe(1)
    expect(kanjiRow.mastery).toBeCloseTo(30 / 90, 6)
  })
})

// The stage, recall-floor and drill-routing tests that used to close this file
// moved to tests/test_study_route.py along with the logic they cover — see the
// note at the top of studyPlan.ts. What remains is the coverage half, which is
// still built here for the cassette carousel and the JLPT Prep percentage.
