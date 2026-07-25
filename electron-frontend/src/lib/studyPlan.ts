import type {
  JlptLevelProgress, MinigameKey, ScriptKey, StudyPlanCoverageRow, StudyPlanSnapshot,
  StudyPlanStage, StudySummaryPayload,
} from '../types'
import { MINIGAMES, SCRIPT_LABELS } from '../constants'

// No minimum-tracked-cards condition on purpose. The one that used to live here was
// fed `buildStudyPlan`'s summed deck `total` — installed corpus size, not a reviewed
// count — so it never fired. Restoring it would need a reviewed-card count that
// `buildStudyPlan` is not given; until then `currentStreak >= 2` carries the intent,
// since a learner cannot hold a two-day streak without having reviewed anything. (#75)
export function getStudyPlanStage(overallMastery: number, currentStreak: number): StudyPlanStage {
  if (currentStreak < 2 || overallMastery < 0.25) return 'starter'
  if (overallMastery < 0.65) return 'building'
  return 'advanced'
}

export function getStudyPlanShortcutMinigame(row: StudyPlanCoverageRow, stage: StudyPlanStage, index: number): MinigameKey {
  if (row.key === 'hiragana' || row.key === 'katakana') {
    if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
    if (stage === 'building') return index === 0 ? 'character_match' : 'romaji_sprint'
    return index === 0 ? 'interleave_mix' : 'character_match'
  }

  if (row.key === 'kanji_n5') {
    if (stage === 'starter') return index === 0 ? 'character_match' : 'meaning_match'
    if (stage === 'building') return index === 0 ? 'character_match' : 'typed_recall'
    return index === 0 ? 'typed_recall' : 'stroke_order'
  }

  if (row.key === 'vocab_n5') {
    if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
    if (stage === 'building') return index === 0 ? 'typed_recall' : 'particle_cloze'
    return index === 0 ? 'particle_cloze' : 'imposter'
  }

  if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
  if (stage === 'building') return index === 0 ? 'particle_cloze' : 'typed_recall'
  return index === 0 ? 'imposter' : 'particle_cloze'
}

export function getStudyPlanTargetMastery(script: ScriptKey): number {
  if (script === 'hiragana') return 0.9
  if (script === 'katakana') return 0.85
  if (script === 'kanji_n5') return 0.72
  if (script === 'vocab_n5') return 0.72
  if (script === 'sentence_examples') return 0.68
  return 0.68
}

// `decks` is the bridge `summary` payload, which walks the whole `ALL_DECKS`
// registry in domain/decks.py. That registry holds two parallel corpora per
// track: the five JLPT *level* decks (`vocab_n5`..`vocab_n1`) and the *thematic
// category* decks from issue #68 (`vocab_greetings`, `vocab_n4_school_work`, …).
// Their card ids are disjoint — nothing is double-counted — but only the
// category decks are ever studied. `resultSlug` in
// features/study-session/useStudySession.ts:1159-1164 routes every review from
// the kanji/vocab sections through KANJI_/VOCAB_CATEGORY_TO_DECK_SLUG, so no
// review is ever recorded against a level deck; the level decks are marked
// "kept for backward compatibility" in decks.py and are loaded only to seed
// onboarding scores. Confirmed against data/jplearn.db: every deck holding
// review rows is a category deck or hiragana/grammar, never a level deck.
//
// So a level-deck denominator can never move — it would peg these rows at
// exactly 0 over 8,031 vocab / 2,196 kanji cards forever. Aggregating the
// category decks (545 vocab / 211 kanji cards) measures the content the learner
// can actually reach, which is what `focusRows`/`needsWorkRows` need. Both sets
// still span N5→N1, so these stay whole-track rows.
//
// The negative lookahead excludes only an exact level slug. `vocab_numbers` and
// `vocab_nouns` begin `vocab_n` but are N5 categories, so matching on a bare
// `_n` prefix would silently drop them.
const KANJI_STUDY_DECK = /^kanji_(?!n[1-5]$)/
const VOCAB_STUDY_DECK = /^vocab_(?!n[1-5]$)/

// The N5 slice of the same category decks — the twelve whose slug carries no
// level infix (`vocab_greetings`, not `vocab_n4_home_living`). Only the grammar
// gate needs this scope, so there is no kanji counterpart.
const VOCAB_N5_STUDY_DECK = /^vocab_(?!n[1-5](?:_|$))/

export function aggregateDeckMastery(
  decks: StudySummaryPayload['decks'],
  predicate: (slug: string) => boolean,
): { mastery: number; total: number } {
  const matchingDecks = decks.filter((deck) => predicate(deck.slug))
  const total = matchingDecks.reduce((sum, deck) => sum + deck.total, 0)
  if (total <= 0) {
    return { mastery: 0, total: 0 }
  }
  const mastered = matchingDecks.reduce((sum, deck) => sum + deck.mastered, 0)
  return {
    mastery: mastered / total,
    total,
  }
}

export function aggregateJlptMastery(levels: JlptLevelProgress[]): { mastery: number; total: number } {
  const total = levels.reduce((sum, row) => sum + row.total, 0)
  if (total <= 0) {
    return { mastery: 0, total: 0 }
  }
  const weighted = levels.reduce((sum, row) => sum + (row.mastery * row.total), 0)
  return {
    mastery: weighted / total,
    total,
  }
}

export function buildStudyPlan(
  decks: StudySummaryPayload['decks'],
  kanjiLevels: JlptLevelProgress[],
  vocabLevels: JlptLevelProgress[],
  weeklyActivity: StudySummaryPayload['activity'],
  currentStreak: number,
): StudyPlanSnapshot {
  const hiragana = aggregateDeckMastery(decks, (slug) => slug === 'hiragana')
  const katakana = aggregateDeckMastery(decks, (slug) => slug === 'katakana')
  const grammar = aggregateDeckMastery(decks, (slug) => slug === 'grammar_patterns')
  const sentences = aggregateDeckMastery(decks, (slug) => slug === 'sentence_examples')

  const kanjiFromDecks = aggregateDeckMastery(decks, (slug) => KANJI_STUDY_DECK.test(slug))
  const vocabFromDecks = aggregateDeckMastery(decks, (slug) => VOCAB_STUDY_DECK.test(slug))
  const kanjiFallback = aggregateJlptMastery(kanjiLevels)
  const vocabFallback = aggregateJlptMastery(vocabLevels)

  const kanji = kanjiFromDecks.total > 0 ? kanjiFromDecks : kanjiFallback
  const vocab = vocabFromDecks.total > 0 ? vocabFromDecks : vocabFallback

  // N5 grammar readiness depends on N5 vocabulary, so it is measured against the
  // N5 decks alone rather than the whole-track `vocab` aggregate — which spans
  // N5→N1 and would make N5 grammar wait on N1 words. The distinction became
  // load-bearing once vocab decks stopped being truncated (issue #67).
  //
  // This previously matched `slug === 'vocab_n5'`, the level deck. That deck is
  // reported by `summary` with a nonzero `total` but never receives a review (see
  // the note on VOCAB_STUDY_DECK), so its mastery was pinned at 0 while its
  // nonzero total kept the `.total > 0` branch below selecting it — leaving
  // `grammarReady` permanently false and grammar unreachable in the shipped app.
  // Matching the N5 category decks is what the gate was always meant to measure.
  const vocabN5 = aggregateDeckMastery(decks, (slug) => VOCAB_N5_STUDY_DECK.test(slug))

  const hiraganaReady = hiragana.mastery >= 0.35
  const kanjiReady = hiragana.mastery >= 0.7 && katakana.mastery >= 0.45
  const vocabReady = hiragana.mastery >= 0.7 && katakana.mastery >= 0.55
  const grammarReady = (vocabN5.total > 0 ? vocabN5 : vocab).mastery >= 0.45
  const sentencesReady = grammar.mastery >= 0.45

  // Scope of the `kanji_n5` / `vocab_n5` rows: the whole track, N5→N1 — not N5.
  // The `_n5` in the key is vestigial. `ScriptKey` is the app's six *section*
  // ids, not deck slugs (issue #66: six ScriptKey values against 45+ decks
  // registered in domain/decks.py), and the section these two keys name spans
  // every level — `activeDeckSlug` in App.tsx resolves `vocab_n5` through
  // `VOCAB_CATEGORY_TO_DECK_SLUG`, whose entries reach `vocab_n1_law_justice`.
  // `SCRIPT_LABELS` already reflects that: 'Kanji' and 'Vocabulary', no level.
  // So these rows stay track-wide, and no label rename is needed.
  //
  // Deliberately NOT `vocabN5`: an N5-scoped row whose shortcut launches N1
  // categories would misreport, and `grammarReady` above is the one consumer
  // that genuinely wants N5 alone.
  const coverageRows: StudyPlanCoverageRow[] = [
    {
      key: 'hiragana',
      label: SCRIPT_LABELS.hiragana,
      mastery: hiragana.mastery,
      total: hiragana.total,
      unlocked: true,
      difficulty: 0,
    },
    {
      key: 'katakana',
      label: SCRIPT_LABELS.katakana,
      mastery: katakana.mastery,
      total: katakana.total,
      unlocked: hiraganaReady,
      difficulty: 1,
    },
    {
      key: 'kanji_n5',
      label: SCRIPT_LABELS.kanji_n5,
      mastery: kanji.mastery,
      total: kanji.total,
      unlocked: kanjiReady,
      difficulty: 2,
    },
    {
      key: 'vocab_n5',
      label: SCRIPT_LABELS.vocab_n5,
      mastery: vocab.mastery,
      total: vocab.total,
      unlocked: vocabReady,
      difficulty: 3,
    },
    {
      key: 'grammar_patterns',
      label: SCRIPT_LABELS.grammar_patterns,
      mastery: grammar.mastery,
      total: grammar.total,
      unlocked: grammarReady,
      difficulty: 4,
    },
    {
      key: 'sentence_examples',
      label: SCRIPT_LABELS.sentence_examples,
      mastery: sentences.mastery,
      total: sentences.total,
      unlocked: sentencesReady,
      difficulty: 5,
    },
  ]

  const unlockedRows = coverageRows.filter((row) => row.unlocked)
  const needsWorkRows = unlockedRows.filter((row) => row.mastery < getStudyPlanTargetMastery(row.key))

  const focusRows = (needsWorkRows.length > 0 ? needsWorkRows : unlockedRows)
    .sort((left, right) => {
      if (Math.abs(left.mastery - right.mastery) > 0.06) {
        return left.mastery - right.mastery
      }
      return left.difficulty - right.difficulty
    })
    .slice(0, 3)

  const totalCards = coverageRows.reduce((sum, row) => sum + row.total, 0)
  // `learnerStage` means "how far through the six tracks", so every row counts
  // equally instead of in proportion to its deck size. Card-count weighting let a
  // track's influence be decided by how much content happened to ship: lifting the
  // vocabulary caps (#67) grew the `vocab_*` aggregate from ~2,000 to ~8,200 cards,
  // which handed vocab ~76% of the weight at near-zero mastery and pushed
  // `overallMastery` back under the 0.25 `building` threshold — demoting learners
  // who had not lost any progress, and re-routing their study-plan shortcuts to
  // starter minigames (#75).
  //
  // The denominator is every coverage row, locked ones included, so it is fixed.
  // Averaging only the unlocked rows would reproduce the same bug from the other
  // direction: katakana unlocks at 35% hiragana, so crossing that line would add a
  // 0%-mastery row to the mean and demote the learner for making progress.
  const overallMastery = coverageRows.length > 0
    ? coverageRows.reduce((sum, row) => sum + row.mastery, 0) / coverageRows.length
    : 0
  const learnerStage = getStudyPlanStage(overallMastery, currentStreak)
  const recommendedMinutes = weeklyActivity.week.reviewed >= 24
    ? 20
    : weeklyActivity.week.reviewed >= 10
      ? 15
      : 10

  const sessionNote = focusRows.length > 0
    ? `Start with ${focusRows[0].label} and move to harder tracks after this block feels steady.`
    : currentStreak > 0
      ? `Keep the streak alive with a short mixed review.`
      : 'Build the plan after your first few rounds and it will highlight your weakest active track.'

  const shortcutRows = focusRows.slice(0, 3).map((row, index) => {
    const minigame = getStudyPlanShortcutMinigame(row, learnerStage, index)
    const script: ScriptKey = row.key
    const title = MINIGAMES.find((game) => game.key === minigame)?.title ?? minigame
    const stageLabel = learnerStage === 'starter'
      ? 'Starter-safe'
      : learnerStage === 'building'
        ? 'Build-up'
        : 'Advanced'

    return {
      key: `${row.key}-${minigame}-${index}`,
      label: title,
      note: `${row.label} · ${stageLabel} route`,
      script,
      minigame,
    }
  })

  return {
    coverageRows,
    focusRows,
    overallMastery,
    recommendedMinutes,
    sessionNote,
    learnerStage,
    shortcutRows,
  }
}
