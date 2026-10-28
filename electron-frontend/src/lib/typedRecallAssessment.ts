import { assessTypedAnswer, type TypedAnswerState } from './answerAssessment'
import type { RoundDictionaryNote, ScriptKey } from '../types'

interface AssessTypedRecallParams {
  script: ScriptKey
  expectedAnswer: string
  givenAnswer: string
  dictionaryNote: RoundDictionaryNote | null
}

const ANSWER_DELIMITER_REGEX = /(?:\s*\/\s*|\s*;\s*|\s*\|\s*|\s*,\s*|\s+or\s+)/i

function addCandidate(store: Set<string>, candidate: string): void {
  // One letter is a real answer: a kana card's meaning is its romaji, and あ is "a", を is "o".
  // assessTypedAnswer grades words under four letters exactly, so it cannot be matched loosely.
  const compact = candidate.trim().replace(/\s+/g, ' ')
  if (!compact) return
  store.add(compact)

  if (/^to\s+/i.test(compact)) {
    const withoutTo = compact.replace(/^to\s+/i, '').trim()
    if (withoutTo) {
      store.add(withoutTo)
    }
  }
}

function collectDelimitedVariants(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  const variants = [trimmed]
  const noParens = trimmed.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (noParens && noParens !== trimmed) {
    variants.push(noParens)
  }

  const pieces = variants
    .flatMap((value) => value.split(ANSWER_DELIMITER_REGEX))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return [...variants, ...pieces]
}

function assessAgainstCandidates(candidates: readonly string[], given: string): TypedAnswerState {
  let bestAssessment: TypedAnswerState = 'incorrect'
  for (const candidate of candidates) {
    const assessment = assessTypedAnswer(candidate, given)
    if (assessment === 'exact') return 'exact'
    if (assessment === 'near_miss') {
      bestAssessment = 'near_miss'
    }
  }
  return bestAssessment
}

/** Every answer the meaning grader accepts for this round, as the learner would type it. */
export function typedRecallCandidates(expectedAnswer: string, dictionaryNote: RoundDictionaryNote | null): string[] {
  const rawCandidates = [
    expectedAnswer,
    dictionaryNote?.primaryGloss,
    ...(dictionaryNote?.secondaryGlosses ?? []),
  ]
    .filter((value): value is string => typeof value === 'string')

  const candidates = new Set<string>()
  for (const raw of rawCandidates) {
    for (const variant of collectDelimitedVariants(raw)) {
      addCandidate(candidates, variant)
    }
  }

  return [...candidates]
}

export function assessTypedRecallAnswer({
  script: _script,
  expectedAnswer,
  givenAnswer,
  dictionaryNote,
}: AssessTypedRecallParams): TypedAnswerState {
  const candidates = typedRecallCandidates(expectedAnswer, dictionaryNote)
  if (candidates.length === 0) {
    return 'incorrect'
  }
  return assessAgainstCandidates(candidates, givenAnswer)
}
