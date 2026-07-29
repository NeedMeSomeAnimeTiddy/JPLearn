import type {
  JlptLevelProgress, StudyPlanCoverageRow, StudyPlanSnapshot, StudySummaryPayload,
} from '../types'
import { SCRIPT_LABELS } from '../constants'

// What this module still does: measure how much of each section the learner has
// mastered, for the cassette carousel's coverage bars and the JLPT Prep
// percentage.
//
// What it no longer does: decide what to study next. That lived here as
// `focusRows`/`shortcutRows`/`learnerStage` alongside a second, independent
// recommender in domain/recommendation_service.py, and the two ranked the same
// six sections from different inputs — deck mastery here, SRS metrics there —
// so Home could show contradictory advice in two adjacent blocks. The decision
// now belongs to the Python engine (domain/study_route.py + the `recommendations`
// bridge command), which is the only thing that reads leech counts, overdue
// backlogs, and 7-day accuracy. The stage/drill logic that used to be here was
// ported to `domain/study_route.py`; its tests live in `tests/test_study_route.py`.

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

// The N5 slice of the same category decks — those whose slug carries no level
// infix (`vocab_greetings`, not `vocab_n4_home_living`). `grammarReady` needs
// this narrower scope because it asks an N5-shaped question that the
// whole-track aggregate answers wrongly: N5 grammar must not wait on N1 words.
//
// The recall floor used to need it too. That gate moved to
// `domain/study_route.py`, which scopes the same way through
// `_section_deck_slugs(..., n5_only=True)` in the bridge.
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

  return { coverageRows }
}
