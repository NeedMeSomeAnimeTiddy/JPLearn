// Shared typed/spoken answer assessment helpers.
//
// assessTypedAnswer mirrors domain/answer_check.py's assess_typed_answer
// exactly (NFKC normalization, alnum-only compare; when the shorter side is at
// least NEAR_MISS_MIN_LENGTH long, Levenshtein distance <= 1, single
// transposition, or distance == 2 with min length >= 6 counts as a near miss).
// typedAnswerCases.json is the case table both test suites run. Kept in one
// place so both typed-answer input and speech-to-text transcripts are graded
// identically.

/**
 * `near_miss` is counted correct (an English meaning with a typo).
 * `close` is counted WRONG: a Japanese answer one kana away from an accepted
 * spelling, which is a different sound and often a different word (かき/がき,
 * いぬ/いえ), so the learner is only told it was close.
 */
export type TypedAnswerState = 'exact' | 'near_miss' | 'close' | 'incorrect'

/** Words shorter than this must be typed exactly: "do" is not a typo of "go". */
export const NEAR_MISS_MIN_LENGTH = 4

export function normalizeTypedText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function isTransposition(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  const diffs: number[] = []
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) diffs.push(index)
  }
  if (diffs.length !== 2) return false
  const [i, j] = diffs
  return left[i] === right[j] && left[j] === right[i]
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  let previousRow: number[] = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const currentRow: number[] = [i]
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1
      currentRow[j] = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + substitutionCost,
      )
    }
    previousRow = currentRow
  }
  return previousRow[right.length]
}

export function assessTypedAnswer(expected: string, given: string): TypedAnswerState {
  const normalizedExpected = normalizeTypedText(expected)
  const normalizedGiven = normalizeTypedText(given)
  if (!normalizedExpected || !normalizedGiven) return 'incorrect'
  if (normalizedExpected === normalizedGiven) return 'exact'

  const minLength = Math.min(normalizedExpected.length, normalizedGiven.length)
  if (minLength < NEAR_MISS_MIN_LENGTH) return 'incorrect'
  const distance = levenshteinDistance(normalizedExpected, normalizedGiven)
  const nearMiss =
    distance <= 1 ||
    isTransposition(normalizedExpected, normalizedGiven) ||
    (distance === 2 && minLength >= 6)

  return nearMiss ? 'near_miss' : 'incorrect'
}

/**
 * Grade a conjugation drill answer against every accepted spelling.
 *
 * Exact match only, and deliberately so: assessTypedAnswer's near-miss
 * tolerance treats a one-character difference as almost-right, but 食べた and
 * 食べて differ by exactly one character and are different forms — the one the
 * drill exists to separate. Multiple spellings are accepted instead (kanji and
 * kana, 〜じゃない and 〜ではない), which is the correct axis of leniency here.
 */
export function assessConjugationAnswer(
  acceptedAnswers: readonly string[],
  given: string,
): TypedAnswerState {
  const normalizedGiven = normalizeTypedText(given)
  if (!normalizedGiven) return 'incorrect'
  return acceptedAnswers.some((candidate) => normalizeTypedText(candidate) === normalizedGiven)
    ? 'exact'
    : 'incorrect'
}

const KATAKANA_START = 0x30a1 // ァ
const KATAKANA_END = 0x30f6 // ヶ
const KATAKANA_TO_HIRAGANA = 0x60
const LONG_VOWEL_MARK = 'ー'

// The vowel each hiragana ends in, as the vowel kana. ん and っ have none, so a
// ー after them is left as it is.
const KANA_VOWEL_ROWS: ReadonlyArray<readonly [string, string]> = [
  ['あ', 'あぁかがさざただなはばぱまやゃらわゎゕ'],
  ['い', 'いぃきぎしじちぢにひびぴみりゐ'],
  ['う', 'うぅくぐすずつづぬふぶぷむゆゅるゔ'],
  ['え', 'えぇけげせぜてでねへべぺめれゑゖ'],
  ['お', 'おぉこごそぞとどのほぼぽもよょろを'],
]
const KANA_VOWEL = new Map<string, string>(
  KANA_VOWEL_ROWS.flatMap(([vowel, row]) => [...row].map((kana) => [kana, vowel] as const)),
)

/**
 * Fold a Japanese answer so that spellings of the same sound compare equal.
 *
 * Katakana becomes hiragana, each ー becomes the vowel of the kana before it,
 * and う after an お-row kana becomes お. So the stored reading こおひい, the
 * typed こーひー and the IME's コーヒー all fold to こおひい. Expects text that
 * normalizeTypedText has already been through (NFKC, so half-width kana are
 * full-width).
 */
export function foldKana(value: string): string {
  let folded = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    let next = code >= KATAKANA_START && code <= KATAKANA_END
      ? String.fromCodePoint(code - KATAKANA_TO_HIRAGANA)
      : char
    const previousVowel = KANA_VOWEL.get(folded.slice(-1))
    if (next === LONG_VOWEL_MARK && previousVowel) next = previousVowel
    // Deliberate: after an お-row kana, う and お sound the same (こうひい/こおひい), and Dictation
    // grades what was heard, so a listener cannot be expected to tell them apart.
    if (next === 'う' && previousVowel === 'お') next = 'お'
    folded += next
  }
  return folded
}

/** Split a stored reading such as なん・なに or nan/nani into its spellings. */
function splitSpellings(value: string): string[] {
  return value.split(/[/・]/).map((part) => part.trim()).filter((part) => part.length > 0)
}

/** A stored reading as the learner should read it: なん/なに becomes "なん or なに". */
export function formatKanaSpellings(value: string): string {
  const spellings = splitSpellings(value)
  return spellings.length > 0 ? spellings.join(' or ') : value
}

/**
 * Grade an answer written in Japanese script (Dictation) against every
 * accepted spelling.
 *
 * Exact after folding (see foldKana), never a near miss: one kana is a
 * different sound. An answer one kana away from a spelling at least two kana
 * long is `close`, which is graded wrong but lets the feedback say so.
 */
export function assessJapaneseAnswer(
  acceptedAnswers: readonly string[],
  given: string,
): TypedAnswerState {
  const foldedGiven = foldKana(normalizeTypedText(given))
  if (!foldedGiven) return 'incorrect'
  const foldedAccepted = acceptedAnswers
    .flatMap(splitSpellings)
    .map((candidate) => foldKana(normalizeTypedText(candidate)))
    .filter((candidate) => candidate.length > 0)
  if (foldedAccepted.includes(foldedGiven)) return 'exact'
  const close = foldedAccepted.some((candidate) =>
    candidate.length >= 2 && levenshteinDistance(candidate, foldedGiven) <= 1)
  return close ? 'close' : 'incorrect'
}
