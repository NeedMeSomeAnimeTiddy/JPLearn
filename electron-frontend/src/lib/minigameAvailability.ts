/**
 * Which minigames the *live card pool* can actually support.
 *
 * `SCRIPT_MINIGAMES` says which modes a section offers, keyed on the six
 * sections. That was always coarser than reality — the pool comes from the
 * selected blocks, not the section — and multi-select (issue #78) widened the
 * gap: the same section can now yield anything from five cards to a whole deck.
 *
 * The rules are a table rather than a chain of conditions so that adding a mode
 * means adding a row, and so the reasons a learner sees can be tested without
 * rendering the app. Previously each mode was special-cased inline in `App.tsx`
 * and gated on `activeScript === 'vocab_n5'`, which meant a mode offered in a new
 * section silently skipped its own precondition.
 */
import type { MinigameKey } from '../types'

/** What the current pool actually contains. */
export interface MinigamePoolFacts {
  /** Cards a round can draw from. */
  size: number
  /** Multi-kanji words whose every character has a known meaning. */
  hasCompoundWords: boolean
  /**
   * Cards that can be conjugated, counted after the pool tops up from the wider
   * deck — so this is "the section has nothing conjugatable", not "this block
   * has nothing".
   */
  conjugatableCount: number
  /** Cards currently flagged as leeches. */
  leechCount: number
}

/** Modes that present several cards at once and need something to choose between. */
export const MULTIPLE_CHOICE_MODES: MinigameKey[] = [
  'meaning_match', 'character_match', 'particle_cloze', 'vibe_check', 'imposter',
  'listening_audio_first', 'kanji_compound_builder', 'context_cloze',
]

/** Modes that draw a card at a time and so can run against a leech-only pool. */
export const LEECH_ELIGIBLE_MODES: MinigameKey[] = [
  'romaji_sprint', 'meaning_match', 'character_match', 'stroke_order', 'typed_recall',
  'speech_recall', 'sentence_assembly', 'particle_cloze', 'vibe_check', 'imposter',
  'listening_audio_first', 'dictation', 'kanji_compound_builder', 'context_cloze',
  'interleave_mix',
]

interface PoolRule {
  modes: MinigameKey[]
  /** True when the pool *cannot* support these modes. */
  blocks: (facts: MinigamePoolFacts, options: { leechFocusEnabled: boolean }) => boolean
  reason: string
}

const RULES: PoolRule[] = [
  {
    modes: MULTIPLE_CHOICE_MODES,
    blocks: (facts) => facts.size < 2,
    reason: 'Not enough cards for this mode',
  },
  {
    modes: ['kanji_compound_builder'],
    blocks: (facts) => !facts.hasCompoundWords,
    reason: 'No compound words in this selection',
  },
  {
    modes: ['conjugation_drill'],
    blocks: (facts) => facts.conjugatableCount === 0,
    reason: 'No verbs or adjectives to conjugate here',
  },
  {
    modes: LEECH_ELIGIBLE_MODES,
    blocks: (facts, { leechFocusEnabled }) => leechFocusEnabled && facts.leechCount === 0,
    reason: 'No leech cards in this selection',
  },
]

/**
 * Return a lock reason per mode the pool cannot support.
 *
 * An empty pool returns no reasons at all: the deck is still loading, and
 * locking every mode while that happens reads as breakage rather than as a
 * pool that is genuinely too small.
 *
 * The first matching rule wins, so more specific reasons must come before
 * broader ones — a mode that is both under-sized and leech-empty reports the
 * size, which is the one the learner can act on.
 */
export function computeMinigameLockReasons(
  facts: MinigamePoolFacts,
  options: { leechFocusEnabled: boolean },
): Partial<Record<MinigameKey, string>> {
  const reasons: Partial<Record<MinigameKey, string>> = {}
  if (facts.size === 0) return reasons

  for (const rule of RULES) {
    if (!rule.blocks(facts, options)) continue
    for (const mode of rule.modes) {
      if (!reasons[mode]) reasons[mode] = rule.reason
    }
  }
  return reasons
}
