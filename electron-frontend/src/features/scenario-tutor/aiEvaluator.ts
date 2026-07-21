import { SCENARIO_AI_MIN_CONFIDENCE } from './constants'
import type {
  AiEvaluationRequest,
  AiEvaluationResult,
  EvaluationResult,
  ExpectedIntent,
  ResponseOutcome,
  ScenarioAiEvaluator,
} from './types'

const VALID_OUTCOMES: ReadonlySet<string> = new Set<ResponseOutcome>(['correct', 'partial', 'incorrect', 'unclear'])

/** Pulls the first balanced JSON object out of model output, which commonly
 * arrives wrapped in prose or a ```json fence. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return raw.slice(start, index + 1)
    }
  }
  return null
}

/**
 * Runtime gate on everything a local model returns. Hand-rolled in the
 * ipc_security.cjs validator idiom (the repo has no schema library). Anything
 * malformed, out of vocabulary, or out of range yields null, which callers
 * treat identically to "no model installed": the turn stays uncertain and the
 * authored recovery path runs.
 */
export function parseAiEvaluation(
  raw: unknown,
  allowedIntentIds: readonly string[],
  allowedMissingInfo: readonly string[],
): AiEvaluationResult | null {
  if (typeof raw !== 'string') return null
  const jsonText = extractJsonObject(raw)
  if (!jsonText) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const candidate = parsed as Record<string, unknown>

  const outcome = candidate.outcome
  if (typeof outcome !== 'string' || !VALID_OUTCOMES.has(outcome)) return null

  const matchedIntentId = candidate.matchedIntentId ?? null
  if (matchedIntentId !== null) {
    if (typeof matchedIntentId !== 'string' || !allowedIntentIds.includes(matchedIntentId)) return null
  }
  // A concrete verdict without an intent tells the engine nothing it can act
  // on, so it is not a usable answer.
  if (matchedIntentId === null && (outcome === 'correct' || outcome === 'partial')) return null

  const rawMissingInfo = candidate.missingInfo ?? []
  if (!Array.isArray(rawMissingInfo)) return null
  const missingInfo: string[] = []
  for (const entry of rawMissingInfo) {
    if (typeof entry !== 'string') return null
    if (!allowedMissingInfo.includes(entry)) return null
    missingInfo.push(entry)
  }

  const confidence = candidate.confidence
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null

  const correction = typeof candidate.correction === 'string' && candidate.correction.trim()
    ? candidate.correction.trim()
    : undefined
  const explanation = typeof candidate.explanation === 'string' && candidate.explanation.trim()
    ? candidate.explanation.trim()
    : undefined

  return {
    outcome: outcome as ResponseOutcome,
    matchedIntentId: matchedIntentId as string | null,
    missingInfo,
    correction,
    explanation,
    confidence,
  }
}

/**
 * Maps a validated AI verdict onto the engine's evaluation contract. The
 * engine cannot tell an AI-sourced result from a deterministic one — it only
 * ever picks an authored branch — so this is the full extent of the model's
 * influence. Low-confidence "correct"/"partial" verdicts are demoted to
 * unclear so a hesitant model can never advance the scenario.
 */
export function toAiEvaluationResult(
  result: AiEvaluationResult,
  intents: readonly ExpectedIntent[],
): EvaluationResult {
  const confident = result.confidence >= SCENARIO_AI_MIN_CONFIDENCE
  const outcome: ResponseOutcome = confident ? result.outcome : 'unclear'
  const matchedIntentId = outcome === 'unclear' ? null : result.matchedIntentId
  const intent = intents.find((entry) => entry.id === matchedIntentId) ?? null
  const requiredSlotIds = (intent?.slots ?? []).filter((slot) => slot.required).map((slot) => slot.id)
  const missingRequiredSlots = outcome === 'partial'
    ? requiredSlotIds.filter((slotId) => result.missingInfo.includes(slotId))
    : []

  return {
    outcome,
    matchedIntentId,
    matchedSlots: [],
    missingRequiredSlots,
    mistakeId: null,
    confidence: result.confidence,
    tier: 'none',
    source: 'ai',
    // Shown in the feedback banner only, clearly attributed — never written
    // into an SRS draft and never spoken as NPC dialogue.
    correction: result.correction,
    explanation: result.explanation,
  }
}

/** Used whenever AI evaluation is off, unsupported, or no model is installed.
 * Always returns null so the caller stays on the authored recovery path. */
export const nullScenarioAiEvaluator: ScenarioAiEvaluator = {
  evaluate: async () => null,
}

/**
 * IPC-backed evaluator. This is the only file in the feature that knows AI
 * exists; the hook simply asks it for a verdict and gets null when there
 * isn't one.
 */
export function createScenarioAiEvaluator(): ScenarioAiEvaluator {
  return {
    async evaluate(request: AiEvaluationRequest, signal: AbortSignal): Promise<AiEvaluationResult | null> {
      const evaluate = window.jplearnDesktop?.evaluateScenarioResponse
      if (!evaluate || signal.aborted) return null
      let response: { ok: boolean; text: string } | null = null
      try {
        response = await evaluate(request)
      } catch {
        return null
      }
      if (signal.aborted || !response?.ok) return null
      const allowedIntentIds = request.expectedIntents.map((intent) => intent.id)
      return parseAiEvaluation(response.text, allowedIntentIds, request.requiredSlotIds)
    },
  }
}
