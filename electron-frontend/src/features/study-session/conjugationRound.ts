// Conjugation drill round construction (issue #22).
//
// Sits beside grammarRound.ts and follows the same contract: return null when
// this card cannot produce a round, and buildRoundWithBridge falls back to an
// ordinary round for it. That fallback is what lets the drill live in the
// per-section minigame catalog at all — SCRIPT_MINIGAMES is keyed on the six
// ScriptKey sections, not deck slugs, so a noun card will be handed to this
// builder and simply has to decline.

import type { RoundDictionaryNote, RoundState, ScriptDeck } from '../../types'

const VERB_TAIL = /[うくぐすつぬぶむる]$/

/**
 * Cheap renderer-side guess at whether a card can be conjugated at all.
 *
 * The tokenizer behind the bridge is the authority, but a section deck is
 * mostly nouns — 24% of the N5 vocabulary deck is drillable — and picking the
 * card index before asking would leave three rounds in four silently falling
 * back to meaning-match. Filtering the pool first lands ~91% of the time, and
 * the bridge still declines the rest. Same pattern the handwriting and compound
 * builder modes use.
 *
 * Deliberately one-sided: it misses na-adjectives (好き, 有名), whose part of
 * speech is not recoverable from the card's own fields. Those cards simply do
 * not get drilled rather than being drilled wrongly.
 */
export function isConjugationDrillCandidate(character: string, meaning: string): boolean {
  const word = character.trim()
  if (!word) return false
  const gloss = meaning.trim().toLowerCase()
  // JMdict-derived glosses start verbs with "to ".
  if (gloss.startsWith('to ') && VERB_TAIL.test(word)) return true
  return word.endsWith('い') && !gloss.startsWith('to ')
}

export async function buildConjugationDrillRound(
  card: ScriptDeck['cards'][number],
  options: {
    curriculumStage: 1 | 2 | 3
    surprisePrompt: boolean
    surpriseLabel: string
    promptSeed: number
    dictionarySeedQuery: string | null
    dictionaryNote: RoundDictionaryNote | null
  },
): Promise<RoundState | null> {
  const {
    curriculumStage,
    surprisePrompt,
    surpriseLabel,
    promptSeed,
    dictionarySeedQuery,
    dictionaryNote,
  } = options

  const getDrillData = window.jplearnDesktop?.getConjugationDrillData
  if (!getDrillData) return null

  const word = card.character?.trim()
  if (!word) return null

  let response
  try {
    response = await getDrillData({
      word,
      stage: curriculumStage,
      seed: promptSeed,
    })
  } catch {
    // The bridge rejects anything it cannot classify — a noun, an inflected
    // form, a kana-only る-verb of ambiguous class. Not an error worth
    // surfacing: the card just gets a different minigame this round.
    return null
  }

  const data = response?.data
  if (!data || typeof data.expected !== 'string' || data.expected.length === 0) return null

  const accepted = Array.isArray(data.accepted)
    ? data.accepted.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
  if (accepted.length === 0) return null

  const formLabel = typeof data.form_label === 'string' ? data.form_label : 'requested form'
  const ruleHint = typeof data.rule_hint === 'string' && data.rule_hint.length > 0
    ? data.rule_hint
    : null

  return {
    cardId: card.id,
    mode: 'conjugation_drill',
    audioText: data.expected,
    exampleSentenceAudioText: null,
    surprisePrompt,
    curriculumStage,
    chapterNumber: null,
    chapterLabel: null,
    hintText: ruleHint,
    dictionarySeedQuery,
    dictionaryNote,
    promptLabel: surprisePrompt ? surpriseLabel : `Write the ${formLabel} of this word.`,
    focusText: data.word,
    answer: data.expected,
    answerDisplay: data.expected_reading && data.expected_reading !== data.expected
      ? `${data.expected}（${data.expected_reading}）`
      : data.expected,
    acceptedAnswers: accepted,
    options: [],
  }
}
