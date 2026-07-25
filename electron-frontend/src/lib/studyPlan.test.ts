import { describe, expect, it } from 'vitest'
import {
  buildStudyPlan, getStudyPlanRecallFloor, getStudyPlanShortcutMinigame, getStudyPlanStage,
  getStudyPlanTargetMastery,
} from './studyPlan'
import type {
  ScriptKey, StudyPlanCoverageRow, StudyPlanSnapshot, StudyPlanStage, StudySummaryPayload,
} from '../types'

type Deck = StudySummaryPayload['decks'][number]

function deck(slug: string, total: number, mastered: number): Deck {
  return { slug, name: slug, total, mastered, due_today: 0, completed_today: 0 } as Deck
}

const ACTIVITY = {
  week: { reviewed: 30, correct: 25, sessions: 5, minutes: 60 },
  month: { reviewed: 90, correct: 75, sessions: 15, minutes: 180 },
} as unknown as StudySummaryPayload['activity']

function planRow(decks: Deck[], key: ScriptKey) {
  const plan = buildStudyPlan(decks, [], [], ACTIVITY, 4)
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
    const plan = buildStudyPlan(decks, [], [], ACTIVITY, 4)
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

  // The point of the change: under a level-deck denominator the row was a
  // constant near zero, so it sorted first in `focusRows` permanently and could
  // never clear its 0.72 target. It must now be able to leave `needsWorkRows`.
  it('lets a fully-mastered vocabulary row drop out of the focus list', () => {
    const plan = buildStudyPlan(
      [
        deck('hiragana', 104, 100),
        deck('katakana', 104, 80),
        ...VOCAB_N5_CATEGORIES([20, 15, 12]),
        deck('kanji_numbers_time', 90, 30),
        ...VOCAB_LEVEL_DECKS,
        ...KANJI_LEVEL_DECKS,
      ],
      [], [], ACTIVITY, 4,
    )
    const vocabRow = plan.coverageRows.find((row) => row.key === 'vocab_n5')!

    expect(vocabRow.unlocked).toBe(true)
    expect(vocabRow.mastery).toBe(1)
    expect(plan.focusRows.map((row) => row.key)).not.toContain('vocab_n5')
    expect(plan.focusRows.map((row) => row.key)).toContain('kanji_n5')
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

  // Fixtures use *category* slugs throughout: #76 established that the JLPT level
  // decks never receive a review, so they no longer feed the kanji/vocab rows at
  // all. Padding a level deck is therefore ignored for a different reason than the
  // one under test here — see the "excludes the never-reviewed level decks" block
  // above for that. What this block pins is that among the decks that *do* count,
  // deck size still carries no weight.
  const masteredTracks = [
    deck('hiragana', 104, 104),
    deck('katakana', 104, 104),
    deck('kanji_numbers_time', 45, 45),
    deck('grammar_patterns', 88, 88),
    deck('sentence_examples', 64, 64),
  ]

  // Issue #75: the stage used to be a card-count-weighted average, so a track's
  // influence was its deck size. Everything except vocabulary is mastered here, so
  // growing the untouched vocabulary track used to drag the average from 0.447 down
  // to 0.052 and demote the learner from `building` to `starter` without any
  // progress being lost.
  it('is unaffected by the size of an untouched track', () => {
    const compact = plan([...masteredTracks, deck('vocab_greetings', 40, 0)])
    const expanded = plan([
      ...masteredTracks,
      deck('vocab_greetings', 40, 0),
      deck('vocab_n4_school_work', 666, 0),
      deck('vocab_n3_media_arts', 2139, 0),
      deck('vocab_n2_business', 1809, 0),
      deck('vocab_n1_law_justice', 2699, 0),
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
      deck('kanji_numbers_time', 45, 0),
      deck('vocab_greetings', 40, 0),
      deck('grammar_patterns', 88, 0),
      deck('sentence_examples', 64, 0),
    ])

    expect(snapshot.learnerStage).toBe('building')
    expect(row(snapshot, 'kanji_n5').unlocked).toBe(true)
    expect(snapshot.shortcutRows[0].script).toBe('kanji_n5')
    expect(snapshot.shortcutRows[0].minigame).toBe('character_match')
    expect(snapshot.shortcutRows.map((shortcut) => shortcut.minigame)).not.toContain('typed_recall')
  })

  it('holds an untouched vocabulary track on recognition even at building', () => {
    // The #75 fix made `building` reachable from kana mastery alone, which exposed
    // the routing table's `building` branch for the first time and sent `vocab_n5`
    // at index 0 to `typed_recall` at 0% mastery — a production drill on unseen
    // cards. The per-row recall floor is what now catches that: the stage still
    // says `building`, but the shortcut falls back to recognition.
    const snapshot = plan([
      deck('hiragana', 104, 104),
      deck('katakana', 104, 104),
      deck('kanji_numbers_time', 45, 14),
      deck('vocab_greetings', 40, 0),
      deck('grammar_patterns', 88, 0),
      deck('sentence_examples', 64, 0),
    ])

    expect(snapshot.learnerStage).toBe('building')
    expect(snapshot.shortcutRows[0].script).toBe('vocab_n5')
    expect(snapshot.shortcutRows[0].minigame).toBe('meaning_match')
  })

  it('stays at starter without a streak regardless of mastery', () => {
    const snapshot = buildStudyPlan([...masteredTracks, deck('vocab_greetings', 40, 40)], [], [], ACTIVITY, 1)
    expect(snapshot.overallMastery).toBe(1)
    expect(snapshot.learnerStage).toBe('starter')
  })
})

describe('getStudyPlanStage', () => {
  it('holds a learner at starter until the streak reaches two days', () => {
    expect(getStudyPlanStage(0.9, 0)).toBe('starter')
    expect(getStudyPlanStage(0.9, 1)).toBe('starter')
    expect(getStudyPlanStage(0.9, 2)).toBe('advanced')
  })

  it('holds a learner at starter below 25% mastery however long the streak', () => {
    expect(getStudyPlanStage(0, 40)).toBe('starter')
    expect(getStudyPlanStage(0.24, 40)).toBe('starter')
  })

  it('promotes to building at 25% mastery and to advanced at 65%', () => {
    expect(getStudyPlanStage(0.25, 2)).toBe('building')
    expect(getStudyPlanStage(0.64, 2)).toBe('building')
    expect(getStudyPlanStage(0.65, 2)).toBe('advanced')
  })
})

// Guards the intent behind the removed `trackedCards < 12` gate — keeping a
// brand-new learner at 'starter' — now carried by mastery and streak alone.
describe('buildStudyPlan learner stage without the trackedCards gate', () => {
  // Mirrors real deck sizes so the corpus-scale reasoning above stays honest.
  // Category slugs, not level slugs: per #76 the level decks are excluded from the
  // kanji/vocab aggregates, so a fixture built on them would hold those two rows at
  // 0 and never reach `advanced` however high the ratio went.
  function corpus(masteredRatio: number, extraDecks: Deck[] = []): Deck[] {
    const sizes: Array<[string, number]> = [
      ['hiragana', 104], ['katakana', 104], ['kanji_numbers_time', 45],
      ['vocab_greetings', 40], ['grammar_patterns', 88], ['sentence_examples', 64],
    ]
    return [
      ...sizes.map(([slug, total]) => deck(slug, total, Math.round(total * masteredRatio))),
      ...extraDecks,
    ]
  }

  function stage(decks: Deck[], streak = 4) {
    return buildStudyPlan(decks, [], [], ACTIVITY, streak).learnerStage
  }

  it('reports starter for a full corpus the learner has never touched', () => {
    expect(stage(corpus(0))).toBe('starter')
  })

  it('reports starter for a full corpus with only a handful of cards mastered', () => {
    const decks = [
      deck('hiragana', 104, 8), deck('katakana', 104, 0), deck('kanji_numbers_time', 45, 0),
      deck('vocab_greetings', 40, 0), deck('grammar_patterns', 88, 0), deck('sentence_examples', 64, 0),
    ]
    expect(stage(decks)).toBe('starter')
  })

  it('progresses through building to advanced as mastery grows', () => {
    expect(stage(corpus(0.4))).toBe('building')
    expect(stage(corpus(0.8))).toBe('advanced')
  })

  // The regression guard: stage keys off the mastery ratio, not the number of cards
  // installed. Since 89208f7 each row also carries equal weight regardless of its
  // size, so adding same-ratio decks to a track cannot move the stage at all.
  it('does not depend on corpus size at a fixed mastery ratio', () => {
    const higherLevels = [
      deck('vocab_n4_school_work', 666, 533), deck('vocab_n3_media_arts', 2139, 1711),
      deck('kanji_n1_abstract', 1259, 1007),
    ]
    expect(stage(corpus(0.8, higherLevels))).toBe(stage(corpus(0.8)))
  })

  it('reports starter without a streak no matter how high mastery is', () => {
    expect(stage(corpus(0.8), 1)).toBe('starter')
  })
})

function coverageRow(key: ScriptKey, mastery: number): StudyPlanCoverageRow {
  return { key, label: key, mastery, total: 100, unlocked: true, difficulty: 0 }
}

const SCRIPTS: ScriptKey[] = [
  'hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns', 'sentence_examples',
]

describe('getStudyPlanShortcutMinigame recall floor', () => {
  // `learnerStage` is a whole-account average, so a learner can reach `building` or
  // `advanced` on the strength of tracks other than the one being routed. Without a
  // per-track floor that sends them into a production drill on a track they have
  // never opened.
  it('routes an untouched vocabulary track to recognition at building', () => {
    expect(getStudyPlanShortcutMinigame(coverageRow('vocab_n5', 0), 'building', 0)).toBe('meaning_match')
  })

  it('routes an untouched kanji track to recognition at advanced', () => {
    expect(getStudyPlanShortcutMinigame(coverageRow('kanji_n5', 0), 'advanced', 0)).toBe('meaning_match')
    expect(getStudyPlanShortcutMinigame(coverageRow('kanji_n5', 0), 'advanced', 1)).toBe('character_match')
  })

  it('gates grammar and sentence tracks off particle cloze while untouched', () => {
    expect(getStudyPlanShortcutMinigame(coverageRow('grammar_patterns', 0), 'building', 0)).toBe('meaning_match')
    expect(getStudyPlanShortcutMinigame(coverageRow('sentence_examples', 0), 'advanced', 1)).toBe('character_match')
  })

  // The floor must sit strictly below the target mastery that decides which rows
  // become shortcuts in the first place. Shortcut rows are drawn from `focusRows`,
  // which — whenever any unlocked row is below target — contains only rows with
  // `mastery < target`. A floor equal to the target would make every gated drill
  // dead code on this path.
  it('leaves every gated drill reachable below its track target', () => {
    const reachable = (key: ScriptKey) => {
      const mastery = (getStudyPlanRecallFloor(key) + getStudyPlanTargetMastery(key)) / 2
      expect(mastery).toBeLessThan(getStudyPlanTargetMastery(key))
      return mastery
    }

    expect(getStudyPlanShortcutMinigame(coverageRow('kanji_n5', reachable('kanji_n5')), 'building', 1)).toBe('typed_recall')
    expect(getStudyPlanShortcutMinigame(coverageRow('kanji_n5', reachable('kanji_n5')), 'advanced', 1)).toBe('stroke_order')
    expect(getStudyPlanShortcutMinigame(coverageRow('vocab_n5', reachable('vocab_n5')), 'building', 0)).toBe('typed_recall')
    expect(getStudyPlanShortcutMinigame(coverageRow('vocab_n5', reachable('vocab_n5')), 'advanced', 0)).toBe('particle_cloze')
  })

  it('keeps the floor below the target for every track', () => {
    for (const key of SCRIPTS) {
      expect(getStudyPlanRecallFloor(key)).toBeLessThan(getStudyPlanTargetMastery(key))
      expect(getStudyPlanRecallFloor(key)).toBeGreaterThan(0)
    }
  })

  // Regression guard: the coverage row keyed `vocab_n5` actually carries the
  // all-levels vocab aggregate, so gating on `row.mastery` would measure N5
  // progress against a ~8,200-card N5→N1 denominator. A learner who has mastered
  // the entire N5 deck reads as ~9% there and would be pinned to recognition
  // drills forever. Same defect class as the #67 grammar-readiness fix above.
  it('gates the vocabulary shortcut on N5 progress, not the N5→N1 aggregate', () => {
    // Proportions mirror the real corpus: the N5 vocabulary categories are 145 of
    // the 545 reachable cards, so a learner who has mastered every N5 word reads as
    // 0.266 whole-track — under the 0.36 floor. Scoping to N5 is what keeps them
    // from being stranded on recognition drills.
    const decks = [
      deck('hiragana', 104, 104),
      deck('katakana', 104, 104),
      deck('vocab_greetings', 40, 40),
      deck('vocab_numbers', 35, 35),
      deck('vocab_family', 40, 40),
      deck('vocab_body', 30, 30),
      deck('vocab_n4_school_work', 100, 0),
      deck('vocab_n3_media_arts', 150, 0),
      deck('vocab_n1_law_justice', 150, 0),
    ]
    const plan = buildStudyPlan(decks, [], [], ACTIVITY, 4)
    expect(plan.learnerStage).toBe('building')

    const vocabRow = plan.coverageRows.find((entry) => entry.key === 'vocab_n5')
    if (!vocabRow) throw new Error('vocab_n5 coverage row missing')
    const vocabShortcut = plan.shortcutRows.find((entry) => entry.script === 'vocab_n5')
    if (!vocabShortcut) throw new Error('vocab_n5 shortcut missing')

    // The row itself still reports the diluted aggregate — that is the display
    // contract, and this test is not trying to change it.
    expect(vocabRow.mastery).toBeLessThan(getStudyPlanRecallFloor('vocab_n5'))

    // ...but the shortcut must not be gated by it, because N5 is fully mastered.
    // Gating on `row.mastery` would downgrade this to a recognition drill.
    expect(vocabShortcut.minigame).toBe('particle_cloze')
  })

  // The floor is target/2, so clearing it takes a specific share of the track. Pins
  // that full N5 actually clears it on both tracks against the real proportions —
  // a future content import that shifts the N5 share back under the floor would
  // strand learners on recognition drills, and this is what would catch it.
  // Kanji has only 0.07 of margin: 91 of 211 cards is 0.431 against a 0.36 floor.
  it('lets a learner who has finished N5 out of recognition drills on both tracks', () => {
    const plan = buildStudyPlan([
      deck('hiragana', 104, 104),
      deck('katakana', 104, 104),
      deck('vocab_greetings', 40, 40),
      deck('vocab_numbers', 35, 35),
      deck('vocab_family', 40, 40),
      deck('vocab_body', 30, 30),
      deck('vocab_n4_school_work', 100, 0),
      deck('vocab_n3_media_arts', 150, 0),
      deck('vocab_n1_law_justice', 150, 0),
      deck('kanji_numbers_time', 30, 30),
      deck('kanji_nature_world', 31, 31),
      deck('kanji_people_body', 30, 30),
      deck('kanji_n4_society_roles', 60, 0),
      deck('kanji_n3_governance', 60, 0),
    ], [], [], ACTIVITY, 4)

    for (const key of ['kanji_n5', 'vocab_n5'] as const) {
      const shortcut = plan.shortcutRows.find((entry) => entry.script === key)
      if (!shortcut) throw new Error(`${key} shortcut missing`)
      expect(['meaning_match', 'character_match']).not.toContain(shortcut.minigame)
    }
  })

  it('leaves the starter routes and the kana tracks untouched', () => {
    for (const key of SCRIPTS) {
      expect(getStudyPlanShortcutMinigame(coverageRow(key, 0), 'starter', 0))
        .toBe(key === 'kanji_n5' ? 'character_match' : 'meaning_match')
    }
    expect(getStudyPlanShortcutMinigame(coverageRow('hiragana', 0), 'building', 1)).toBe('romaji_sprint')
    expect(getStudyPlanShortcutMinigame(coverageRow('katakana', 0), 'advanced', 0)).toBe('interleave_mix')
  })
})
