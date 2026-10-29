// Romaji Sprint grading. Kana and kanji rounds keep their rule: the reading split on `/`,
// compared after lower-casing and collapsing spaces. Vocabulary meets this drill only in the
// Daily Games missed-word review, and its readings carry alternatives, brackets and `~`
// ("iku yuku", "benkyou (suru)", "~ku") that the learner's input, letters and spaces only, can
// never type (audit 16, F1). For those, the reading is turned into the forms it means, and no
// form is ever a fragment: a bracket's content counts on its own only when it is a whole other
// word, and a reading splits into pieces only when the written form lists as many alternatives.

import { sectionForDeckSlug } from './cardScores'
import { normalizeText } from './deckUtils'

/** Bracket content that is an optional part of the word: accepted without it and with it in place. */
const OPTIONAL_BRACKET_PARTS = new Set([
  'suru', 'o', 'te', 'ni', 'na', 'taimu', 'maaketto', 'meetoru', 'renzu', 'maru', 'nihon',
])

/** Bracket content that is another word for the same thing: accepted without the bracket, or alone. */
const ALTERNATIVE_BRACKET_WORDS = new Set(['kaapetto', 'owari', 'toriwake', 'izen'])

// Every other bracket content is a label or usage note ("kan" for an interjection, "mizuo~",
// "yoridokoro"): only the form without it is accepted. An unknown content falls here too, the
// stricter grade.

/**
 * Readings whose alternatives the rules above cannot tell apart, reviewed by hand. Keyed by the
 * written form and the reading exactly as the card stores them; the value is every accepted form.
 */
const READING_EXCEPTIONS = new Map<string, readonly string[]>([
  // kanji words listing two readings with no separator in the written form
  [exceptionKey('行く', 'iku yuku'), ['iku', 'yuku', 'iku yuku']],
  [exceptionKey('何', 'nan nani'), ['nan', 'nani', 'nan nani']],
  [exceptionKey('毎月', 'maigetsu maitsuki'), ['maigetsu', 'maitsuki', 'maigetsu maitsuki']],
  [exceptionKey('毎年', 'mainen maitoshi'), ['mainen', 'maitoshi', 'mainen maitoshi']],
  [exceptionKey('お金持ち', 'kanemochi okanemochi'), ['kanemochi', 'okanemochi', 'kanemochi okanemochi']],
  // the bracket runs two alternatives together ("sazoya", "sazokashi")
  [exceptionKey('さぞ (さぞや。さぞかし)', 'sazo (sazoyasazokashi)'), ['sazo', 'sazoya', 'sazokashi']],
])

function exceptionKey(character: string, reading: string): string {
  return `${character.trim()}\u0000${reading.trim()}`
}

const BRACKET_GROUP = /\(([^()]*)\)/g

type BracketKind = 'optional' | 'alternative' | 'label'

function bracketKind(content: string): BracketKind {
  const key = content.trim().toLowerCase()
  if (/[~〜]/.test(key)) return 'label'
  if (OPTIONAL_BRACKET_PARTS.has(key)) return 'optional'
  if (ALTERNATIVE_BRACKET_WORDS.has(key)) return 'alternative'
  return 'label'
}

function tidy(form: string): string {
  return normalizeText(form.replace(/[~〜]/g, ' '))
}

/** How many alternatives the written form lists, split on runs of `;`, `、`, `,` and spaces. */
function writtenAlternativeCount(character: string): number {
  return character.split(/[;、,\s]+/).filter((piece) => piece.length > 0).length
}

function vocabularyPartForms(part: string, character: string): string[] {
  const groups = [...part.matchAll(BRACKET_GROUP)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    content: match[1],
    kind: bracketKind(match[1]),
  }))

  /* `inPlace` holds the groups kept with their content (marks removed); the rest lose their content */
  const build = (inPlace: ReadonlySet<number>): string => {
    let text = ''
    let cursor = 0
    groups.forEach((group, index) => {
      text += part.slice(cursor, group.start)
      text += inPlace.has(index) ? group.content : ' '
      cursor = group.end
    })
    return text + part.slice(cursor)
  }

  const contentRemoved = build(new Set())
  const forms = [contentRemoved]

  const optionalIndices = groups.flatMap((group, index) => (group.kind === 'optional' ? [index] : []))
  for (let mask = 1; mask < 1 << optionalIndices.length; mask += 1) {
    forms.push(build(new Set(optionalIndices.filter((_, bit) => (mask >> bit) & 1))))
  }
  for (const group of groups) {
    if (group.kind === 'alternative') forms.push(group.content)
  }

  const pieces = tidy(contentRemoved).split(' ').filter((piece) => piece.length > 0)
  const written = writtenAlternativeCount(character)
  if (written > 1 && pieces.length === written) forms.push(...pieces)

  return forms
}

/**
 * Every form of `reading` a Romaji Sprint answer may match, normalised (lower case, spaces
 * collapsed), empty forms dropped. Non-vocabulary rounds get today's rule: the reading split
 * on `/`.
 */
export function romajiSprintCandidates(
  reading: string,
  character: string,
  { vocabulary }: { vocabulary: boolean },
): string[] {
  if (!vocabulary) return reading.split('/').map((variant) => normalizeText(variant.trim()))

  const exception = READING_EXCEPTIONS.get(exceptionKey(character, reading))
  const forms = exception
    ? [...exception]
    : reading.split('/').flatMap((part) => vocabularyPartForms(part, character))
  return [...new Set(forms.map(tidy).filter((form) => form.length > 0))]
}

/** Grade a Romaji Sprint answer against its round; vocabulary is told by the card's deck. */
export function assessRomajiSprintAnswer(
  round: { answer: string; focusText: string; deckSlug?: string },
  given: string,
): 'exact' | 'incorrect' {
  const vocabulary = round.deckSlug !== undefined && sectionForDeckSlug(round.deckSlug) === 'vocab_n5'
  const candidates = romajiSprintCandidates(round.answer, round.focusText, { vocabulary })
  const answer = normalizeText(given)
  if (candidates.some((candidate) => candidate === answer)) return 'exact'
  if (!vocabulary) return 'incorrect'
  // vocabulary readings may also be typed with their spaces left out ("benkyousuru", "gomennasai")
  const spaceless = answer.replace(/ /g, '')
  return candidates.some((candidate) => candidate.replace(/ /g, '') === spaceless) ? 'exact' : 'incorrect'
}
