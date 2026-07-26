// Shared typed/spoken answer assessment helpers.
//
// This mirrors domain/answer_check.py's assess_typed_answer exactly (NFKC
// normalization, alnum-only compare, Levenshtein distance <= 1, single
// transposition, or distance == 2 with min length >= 6 counts as a near
// miss). Kept in one place so both typed-answer input and speech-to-text
// transcripts are graded identically.

export type TypedAnswerState = 'exact' | 'near_miss' | 'incorrect'

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

  const distance = levenshteinDistance(normalizedExpected, normalizedGiven)
  const minLength = Math.min(normalizedExpected.length, normalizedGiven.length)
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
