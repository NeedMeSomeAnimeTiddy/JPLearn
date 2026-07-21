import {
  SCENARIO_EXACT_CONFIDENCE,
  SCENARIO_FUZZY_CONFIDENCE,
  SCENARIO_MISTAKE_CONFIDENCE,
  SCENARIO_SLOTS_COMPLETE_CONFIDENCE,
} from './constants'
import type {
  DeterministicEvaluation,
  EvaluateResponseOptions,
  EvaluationResult,
  ExpectedIntent,
  ResponseOutcome,
} from './types'
import { buildNormalizedCandidates, isConservativeFuzzyMatch, normalizeJapaneseAnswer, scanSlots } from './utils'

export interface EvaluationExpectation {
  intents: ExpectedIntent[]
  cancelIntent?: ExpectedIntent
}

interface IntentCandidateResult {
  intentId: string
  outcome: ResponseOutcome
  matchedSlots: string[]
  missingRequiredSlots: string[]
  mistakeId: string | null
  confidence: number
  tier: DeterministicEvaluation['tier']
}

const OUTCOME_RANK: Record<ResponseOutcome, number> = {
  correct: 3,
  partial: 2,
  incorrect: 1,
  unclear: 0,
}

function normalizedPhraseForms(intent: ExpectedIntent): { forms: string[]; exactOnly: boolean }[] {
  return intent.acceptedPhrases.map((phrase) => ({
    forms: [phrase.ja, ...(phrase.variants ?? [])].map(normalizeJapaneseAnswer).filter(Boolean),
    exactOnly: phrase.minMatch === 'exact',
  }))
}

/**
 * Evaluates one intent against the learner's normalised candidate forms using
 * a sequential cascade with early return: (1) exact accepted-phrase match,
 * (2) common-mistake match, (3) slot/phrase-fragment containment match,
 * (4) conservative fuzzy match. Mistake-checking runs BEFORE slot containment
 * — a deliberate ordering choice (see README note in evaluateResponse) so an
 * authored "you forgot the polite marker" mistake can fire instead of being
 * silently satisfied by bare slot-word presence. Returns null when nothing
 * in the cascade matches at all (no signal for this intent).
 */
function evaluateIntent(intent: ExpectedIntent, candidates: string[]): IntentCandidateResult | null {
  const phraseSets = normalizedPhraseForms(intent)
  const slotScan = scanSlots(intent.slots, candidates)
  const hasSlots = (intent.slots?.length ?? 0) > 0

  // 1. Exact accepted-phrase match. A longer utterance that fully contains
  // an accepted phrase (e.g. "ホットコーヒーお願いします" containing the
  // canonical "コーヒーお願いします") counts as a strong match too — this is
  // deliberately containment, not strict equality, so a communicatively
  // complete phrase is never penalised just for extra surrounding words.
  for (const { forms } of phraseSets) {
    if (forms.some((form) => candidates.some((candidate) => candidate.includes(form)))) {
      return {
        intentId: intent.id,
        outcome: 'correct',
        matchedSlots: slotScan.matchedSlotIds,
        missingRequiredSlots: slotScan.missingRequiredSlotIds,
        mistakeId: null,
        confidence: SCENARIO_EXACT_CONFIDENCE,
        tier: 'exact',
      }
    }
  }

  // 2. Common-mistake match (authored known-wrong-or-imperfect phrasing).
  for (const mistake of intent.commonMistakes ?? []) {
    const normalizedMatches = mistake.match.map(normalizeJapaneseAnswer).filter(Boolean)
    const hit = normalizedMatches.some((fragment) => candidates.some((candidate) => candidate.includes(fragment)))
    if (hit) {
      return {
        intentId: intent.id,
        outcome: mistake.classifyAs,
        matchedSlots: slotScan.matchedSlotIds,
        missingRequiredSlots: slotScan.missingRequiredSlotIds,
        mistakeId: mistake.id,
        confidence: SCENARIO_MISTAKE_CONFIDENCE,
        tier: 'mistake',
      }
    }
  }

  // 3. Slot / phrase-fragment containment match.
  if (hasSlots) {
    if (slotScan.matchedSlotIds.length > 0) {
      const outcome: ResponseOutcome = slotScan.missingRequiredSlotIds.length === 0 ? 'correct' : 'partial'
      return {
        intentId: intent.id,
        outcome,
        matchedSlots: slotScan.matchedSlotIds,
        missingRequiredSlots: slotScan.missingRequiredSlotIds,
        mistakeId: null,
        confidence: SCENARIO_SLOTS_COMPLETE_CONFIDENCE,
        tier: 'slots-complete',
      }
    }
  } else {
    const fragmentHit = phraseSets.some(({ forms, exactOnly }) =>
      !exactOnly && forms.some((form) => form.length >= 2 && candidates.some((candidate) => candidate.includes(form))),
    )
    if (fragmentHit) {
      return {
        intentId: intent.id,
        outcome: 'correct',
        matchedSlots: [],
        missingRequiredSlots: [],
        mistakeId: null,
        confidence: SCENARIO_SLOTS_COMPLETE_CONFIDENCE,
        tier: 'slots-complete',
      }
    }
  }

  // 4. Conservative fuzzy match against accepted phrases and slot forms.
  for (const { forms, exactOnly } of phraseSets) {
    if (exactOnly) continue
    for (const form of forms) {
      if (candidates.some((candidate) => isConservativeFuzzyMatch(candidate, form))) {
        const outcome: ResponseOutcome = hasSlots && slotScan.missingRequiredSlotIds.length > 0 ? 'partial' : 'correct'
        return {
          intentId: intent.id,
          outcome,
          matchedSlots: slotScan.matchedSlotIds,
          missingRequiredSlots: slotScan.missingRequiredSlotIds,
          mistakeId: null,
          confidence: SCENARIO_FUZZY_CONFIDENCE,
          tier: 'fuzzy',
        }
      }
    }
  }
  if (hasSlots) {
    for (const slot of intent.slots ?? []) {
      for (const value of slot.values) {
        for (const rawForm of value.forms) {
          const normalizedForm = normalizeJapaneseAnswer(rawForm)
          if (normalizedForm && candidates.some((candidate) => isConservativeFuzzyMatch(candidate, normalizedForm))) {
            const matchedSlots = [...new Set([...slotScan.matchedSlotIds, slot.id])]
            const missingRequiredSlots = slotScan.missingRequiredSlotIds.filter((id) => id !== slot.id)
            const outcome: ResponseOutcome = missingRequiredSlots.length === 0 ? 'correct' : 'partial'
            return {
              intentId: intent.id,
              outcome,
              matchedSlots,
              missingRequiredSlots,
              mistakeId: null,
              confidence: SCENARIO_FUZZY_CONFIDENCE,
              tier: 'fuzzy',
            }
          }
        }
      }
    }
  }

  return null
}

/**
 * Deterministic response evaluator. Pure and synchronous — no IPC, no React.
 * Runs every authored intent (including cancelIntent) through the matching
 * cascade and returns the single best-of result. When nothing matches at all,
 * returns outcome 'unclear' (the "uncertain" state from the issue/plan —
 * ResponseOutcome has no separate value for it), which callers route to the
 * optional AI evaluator or the authored onUnclear recovery.
 */
export function evaluateResponse(
  expectation: EvaluationExpectation,
  rawInput: string,
  _options: EvaluateResponseOptions,
): DeterministicEvaluation {
  const candidates = buildNormalizedCandidates(rawInput)
  if (candidates.length === 0) {
    return { outcome: 'unclear', matchedIntentId: null, matchedSlots: [], missingRequiredSlots: [], mistakeId: null, confidence: 0, tier: 'none' }
  }

  const allIntents = [...expectation.intents, ...(expectation.cancelIntent ? [expectation.cancelIntent] : [])]
  let best: IntentCandidateResult | null = null
  for (const intent of allIntents) {
    const result = evaluateIntent(intent, candidates)
    if (!result) continue
    if (!best || OUTCOME_RANK[result.outcome] > OUTCOME_RANK[best.outcome]
      || (OUTCOME_RANK[result.outcome] === OUTCOME_RANK[best.outcome] && result.confidence > best.confidence)) {
      best = result
    }
  }

  if (!best) {
    return { outcome: 'unclear', matchedIntentId: null, matchedSlots: [], missingRequiredSlots: [], mistakeId: null, confidence: 0, tier: 'none' }
  }

  return {
    outcome: best.outcome,
    matchedIntentId: best.intentId,
    matchedSlots: best.matchedSlots,
    missingRequiredSlots: best.missingRequiredSlots,
    mistakeId: best.mistakeId,
    confidence: best.confidence,
    tier: best.tier,
  }
}

/**
 * Wraps a DeterministicEvaluation into the engine-facing EvaluationResult by
 * looking up the authored correction/explanation text for a matched mistake
 * (if any). The engine only ever sees EvaluationResult, whether it came from
 * here or from the optional AI evaluator.
 */
export function toEvaluationResult(
  deterministic: DeterministicEvaluation,
  expectation: EvaluationExpectation,
): EvaluationResult {
  let correction: string | undefined
  let explanation: string | undefined
  if (deterministic.mistakeId) {
    const allIntents = [...expectation.intents, ...(expectation.cancelIntent ? [expectation.cancelIntent] : [])]
    for (const intent of allIntents) {
      const mistake = intent.commonMistakes?.find((entry) => entry.id === deterministic.mistakeId)
      if (mistake) {
        correction = mistake.correction
        explanation = mistake.explanation
        break
      }
    }
  }
  return { ...deterministic, source: 'deterministic', correction, explanation }
}
