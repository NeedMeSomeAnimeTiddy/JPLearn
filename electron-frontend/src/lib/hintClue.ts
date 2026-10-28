// What the hint popover may show before the answer is revealed.
//
// Robbie's rule (audit 9): the clue never contains anything the round's grader
// would accept. Each piece of the clue (the hint line and the dictionary
// chips: written form, reading, glosses) is checked against the round's
// accepted answers, and a piece that gives the answer away is left out while
// the rest of the clue stays.

import { toHiragana } from 'wanakana'
import type { PlayableMinigame, RoundState } from '../types'
import { foldKana, normalizeTypedText } from './answerAssessment'
import { typedRecallCandidates } from './typedRecallAssessment'

/** How many dictionary glosses the popover prints. */
export const HINT_GLOSS_LIMIT = 2

export interface HintClue {
  text: string | null
  character: string | null
  reading: string | null
  glosses: string[]
}

/**
 * Modes whose popover is a ladder (clue, then the full answer). Every other mode shows its clue at
 * once and never prints the answer, so its hint step can never count as a full reveal.
 */
const LADDER_MODES: ReadonlySet<PlayableMinigame> = new Set([
  'romaji_sprint', 'typed_recall', 'speech_recall', 'listening_audio_first', 'dictation',
])

export function usesHintLadder(mode: PlayableMinigame): boolean {
  return LADDER_MODES.has(mode)
}

/** Modes whose answer is the card's reading: a reading chip is the answer in another script. */
const READING_ANSWER_MODES: ReadonlySet<PlayableMinigame> = new Set(['romaji_sprint', 'dictation'])

/**
 * Modes whose answer, when written in English, is the card's meaning, so any dictionary gloss
 * names it. Particle Cloze and Imposter also have grammar variants whose answer is Japanese; those
 * keep their glosses unless a gloss matches the answer itself.
 */
const MEANING_ANSWER_MODES: ReadonlySet<PlayableMinigame> = new Set([
  'typed_recall', 'speech_recall', 'meaning_match', 'listening_audio_first', 'particle_cloze', 'imposter',
])

const JAPANESE_SCRIPT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u

function splitSpellings(value: string): string[] {
  return value.split(/[/・]/).map((part) => part.trim()).filter((part) => part.length > 0)
}

/** Every text the round's grader accepts, as the learner would read it. */
export function acceptedAnswerTexts(round: RoundState): string[] {
  const note = round.dictionaryNote
  const texts =
    round.mode === 'sentence_assembly' ? [round.answerDisplay ?? '']
      : round.mode === 'conjugation_drill' ? (round.acceptedAnswers ?? [round.answer])
        : round.mode === 'romaji_sprint' || round.mode === 'dictation' ? splitSpellings(round.answer)
          : round.mode === 'typed_recall' || round.mode === 'speech_recall'
            // the grader's own candidates: each meaning and gloss, split, with and without "to "
            ? typedRecallCandidates(round.answer, note)
            : [round.answer]
  return texts.map((text) => text.trim()).filter((text) => text.length > 0)
}

function words(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function containsWordRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true
  }
  return false
}

function foldedKanaOf(value: string): string {
  return foldKana(normalizeTypedText(value))
}

/**
 * Does `piece` contain `answer`? Japanese is compared as folded kana with no spaces (so コーヒー
 * contains こおひい), and romaji in the piece counts too: Dictation's field turns typed romaji into
 * kana, so a gloss "kanji" is the answer かんじ. Each word is converted on its own and the whole
 * piece run together, which can over-hide (an English word that spells the kana) but never leak.
 * Anything else is compared word by word, so the answer "at" is not found in "what".
 */
function contains(piece: string, answer: string): boolean {
  if (JAPANESE_SCRIPT.test(answer)) {
    const folded = foldedKanaOf(answer)
    if (!folded) return false
    const asKana = [piece, ...words(piece), words(piece).join('')].map((part) => foldedKanaOf(toHiragana(part)))
    return foldedKanaOf(piece).includes(folded) || asKana.some((part) => part.includes(folded))
  }
  return containsWordRun(words(piece), words(answer))
}

function givesAway(piece: string, accepted: readonly string[]): boolean {
  return accepted.some((answer) => contains(piece, answer))
}

/** The popover's clue for `round` with every piece that gives the answer away left out. */
export function buildHintClue(round: RoundState): HintClue {
  const accepted = acceptedAnswerTexts(round)
  const note = round.dictionaryNote
  const text = round.hintText && !givesAway(round.hintText, accepted) ? round.hintText : null
  if (!note) return { text, character: null, reading: null, glosses: [] }

  const characterIsAnswer = givesAway(note.character, accepted)
    // Dictation wants the kana, so any kana in the written form gives part of it away; a form
    // written wholly in kanji does not.
    || (round.mode === 'dictation' && /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(note.character))
  // The reading of a written form that is the answer is that answer's pronunciation.
  const readingIsAnswer = READING_ANSWER_MODES.has(round.mode)
    || characterIsAnswer
    || givesAway(note.reading, accepted)
  const glossesNameTheMeaning = MEANING_ANSWER_MODES.has(round.mode) && !JAPANESE_SCRIPT.test(round.answer)
  const glosses = glossesNameTheMeaning
    ? []
    : [note.primaryGloss, ...note.secondaryGlosses]
      .slice(0, HINT_GLOSS_LIMIT)
      .filter((gloss) => gloss && !givesAway(gloss, accepted) && !accepted.some((answer) => contains(answer, gloss)))

  return {
    text,
    character: characterIsAnswer || !note.character ? null : note.character,
    reading: readingIsAnswer || !note.reading ? null : note.reading,
    glosses,
  }
}

export function hintClueIsEmpty(clue: HintClue): boolean {
  return !clue.text && !clue.character && !clue.reading && clue.glosses.length === 0
}
