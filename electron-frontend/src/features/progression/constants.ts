import type { NodeDestination } from './types'

/** localStorage key for nodes the learner chose to open past their gate. */
export const PROGRESSION_OVERRIDES_STORAGE_KEY = 'jplearn-progression-overrides-v1'

/**
 * Where each of `JPLEARN_GRAPH`'s 16 nodes leads.
 *
 * Six map onto studiable sections. The rest reuse entry points that already
 * exist rather than inventing screens: JLPT prep, the passage hub, and the
 * tutor panel's scenario and free-chat modes.
 *
 * `tutorial` has no destination — onboarding is a one-time flow, and it is
 * skippable, so the map shows it as a completed starting point rather than
 * something to re-enter.
 */
export const NODE_DESTINATIONS: Record<string, NodeDestination> = {
  tutorial: { kind: 'none' },
  hiragana: { kind: 'script', script: 'hiragana' },
  katakana: { kind: 'script', script: 'katakana' },
  vocabulary_n5: { kind: 'script', script: 'vocab_n5' },
  grammar_n5: { kind: 'script', script: 'grammar_patterns' },
  sentence_examples: { kind: 'script', script: 'sentence_examples' },
  scripted_conv: { kind: 'scenarios' },
  listening: { kind: 'script', script: 'hiragana', minigame: 'listening_audio_first' },
  kanji_n5: { kind: 'script', script: 'kanji_n5' },
  free_conv: { kind: 'tutor' },
  reading: { kind: 'passages' },
  jlpt_n5: { kind: 'jlpt' },
  jlpt_n4: { kind: 'jlpt' },
  jlpt_n3: { kind: 'jlpt' },
  jlpt_n2: { kind: 'jlpt' },
  jlpt_n1: { kind: 'jlpt' },
}

/**
 * Why opening a still-gated node is worth a confirmation.
 *
 * The path is advisory: a gated node informs rather than blocks, because
 * onboarding can be skipped and a hard gate on the path would lock out learners
 * who never completed it. The menu is the exception by decision (audit 12): it
 * locks THE WORLD until Conversation Mode unlocks and THE EXAM until the JLPT
 * dashboard unlocks.
 */
export const LOCKED_NODE_REASON =
  'This part of the course builds on earlier steps you have not finished yet. ' +
  'You can start it now. It may just be harder without those foundations.'

/** Shown instead of a progress figure for nodes nothing can measure yet. */
export const UNTRACKED_NODE_LABEL = 'Progress not tracked yet'
