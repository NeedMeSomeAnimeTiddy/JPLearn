import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScenarioAiEvaluator, nullScenarioAiEvaluator, parseAiEvaluation, toAiEvaluationResult } from './aiEvaluator'
import type { AiEvaluationRequest, ExpectedIntent } from './types'

const INTENT_IDS = ['intent-order', 'intent-recommend']
const SLOT_IDS = ['drink', 'size']

function intent(overrides: Partial<ExpectedIntent> = {}): ExpectedIntent {
  return {
    id: 'intent-order',
    description: 'Order a drink politely',
    acceptedPhrases: [{ ja: 'コーヒーをください' }],
    slots: [
      { id: 'drink', label: 'drink', required: true, values: [{ id: 'coffee', forms: ['コーヒー'] }] },
      { id: 'size', label: 'size', required: true, values: [{ id: 'regular', forms: ['レギュラー'] }] },
    ],
    branch: { correct: 'n-next' },
    ...overrides,
  }
}

function request(): AiEvaluationRequest {
  return {
    scenarioTitle: 'Order at a Cafe',
    npcLine: 'いらっしゃいませ',
    objectiveDescription: 'Order a drink',
    expectedIntents: [{ id: 'intent-order', description: 'Order a drink politely', examplePhrases: ['コーヒーをください'] }],
    requiredSlotIds: ['drink'],
    learnerResponse: 'ホットのやつをひとつ',
    learnerLevel: 'beginner',
  }
}

afterEach(() => {
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

describe('parseAiEvaluation', () => {
  it('accepts a well-formed verdict, including one wrapped in prose or a code fence', () => {
    const body = '{"outcome":"correct","matchedIntentId":"intent-order","missingInfo":[],"confidence":0.82}'
    expect(parseAiEvaluation(body, INTENT_IDS, SLOT_IDS)).toEqual({
      outcome: 'correct',
      matchedIntentId: 'intent-order',
      missingInfo: [],
      correction: undefined,
      explanation: undefined,
      confidence: 0.82,
    })
    expect(parseAiEvaluation('Sure! ```json\n' + body + '\n``` hope that helps', INTENT_IDS, SLOT_IDS)?.outcome).toBe('correct')
  })

  it('keeps optional correction and explanation text when present', () => {
    const parsed = parseAiEvaluation(
      '{"outcome":"partial","matchedIntentId":"intent-order","missingInfo":["size"],"correction":" コーヒーをください ","explanation":" add ください ","confidence":0.7}',
      INTENT_IDS,
      SLOT_IDS,
    )
    expect(parsed?.correction).toBe('コーヒーをください')
    expect(parsed?.explanation).toBe('add ください')
    expect(parsed?.missingInfo).toEqual(['size'])
  })

  it.each([
    ['not a string', 42],
    ['no JSON at all', 'I think that was fine!'],
    ['unbalanced JSON', '{"outcome":"correct"'],
    ['an unknown outcome', '{"outcome":"excellent","matchedIntentId":"intent-order","missingInfo":[],"confidence":0.9}'],
    ['an invented intent id', '{"outcome":"correct","matchedIntentId":"intent-invented","missingInfo":[],"confidence":0.9}'],
    ['a correct verdict with no intent', '{"outcome":"correct","matchedIntentId":null,"missingInfo":[],"confidence":0.9}'],
    ['missingInfo outside the slot list', '{"outcome":"partial","matchedIntentId":"intent-order","missingInfo":["temperature"],"confidence":0.9}'],
    ['non-string missingInfo', '{"outcome":"partial","matchedIntentId":"intent-order","missingInfo":[3],"confidence":0.9}'],
    ['a non-array missingInfo', '{"outcome":"partial","matchedIntentId":"intent-order","missingInfo":"size","confidence":0.9}'],
    ['confidence above 1', '{"outcome":"correct","matchedIntentId":"intent-order","missingInfo":[],"confidence":4}'],
    ['confidence below 0', '{"outcome":"correct","matchedIntentId":"intent-order","missingInfo":[],"confidence":-0.2}'],
    ['a non-numeric confidence', '{"outcome":"correct","matchedIntentId":"intent-order","missingInfo":[],"confidence":"high"}'],
    ['a JSON array', '[{"outcome":"correct"}]'],
  ])('rejects %s', (_label, raw) => {
    expect(parseAiEvaluation(raw, INTENT_IDS, SLOT_IDS)).toBeNull()
  })

  it('allows a null intent for unclear and incorrect verdicts', () => {
    expect(parseAiEvaluation('{"outcome":"unclear","matchedIntentId":null,"missingInfo":[],"confidence":0.3}', INTENT_IDS, SLOT_IDS)?.outcome).toBe('unclear')
    expect(parseAiEvaluation('{"outcome":"incorrect","matchedIntentId":null,"missingInfo":[],"confidence":0.8}', INTENT_IDS, SLOT_IDS)?.outcome).toBe('incorrect')
  })
})

describe('toAiEvaluationResult', () => {
  it('marks the result as AI-sourced and keeps the correction as feedback only', () => {
    const result = toAiEvaluationResult(
      { outcome: 'correct', matchedIntentId: 'intent-order', missingInfo: [], correction: 'コーヒーをください', confidence: 0.9 },
      [intent()],
    )
    expect(result.source).toBe('ai')
    expect(result.outcome).toBe('correct')
    expect(result.matchedIntentId).toBe('intent-order')
    expect(result.correction).toBe('コーヒーをください')
    // The engine branches on outcome + intent alone; AI never supplies a node.
    expect(result.mistakeId).toBeNull()
    expect(result.tier).toBe('none')
  })

  it('maps a partial verdict onto the intent\'s own required slots', () => {
    const result = toAiEvaluationResult(
      { outcome: 'partial', matchedIntentId: 'intent-order', missingInfo: ['size', 'drink'], confidence: 0.8 },
      [intent()],
    )
    expect(result.outcome).toBe('partial')
    expect(result.missingRequiredSlots.sort()).toEqual(['drink', 'size'])
  })

  it('demotes a low-confidence verdict to unclear so the model cannot advance the scenario', () => {
    const result = toAiEvaluationResult(
      { outcome: 'correct', matchedIntentId: 'intent-order', missingInfo: [], confidence: 0.4 },
      [intent()],
    )
    expect(result.outcome).toBe('unclear')
    expect(result.matchedIntentId).toBeNull()
    expect(result.missingRequiredSlots).toEqual([])
  })
})

describe('createScenarioAiEvaluator', () => {
  it('returns null when the bridge is absent', async () => {
    const evaluator = createScenarioAiEvaluator()
    expect(await evaluator.evaluate(request(), new AbortController().signal)).toBeNull()
  })

  it('returns null when the runtime reports it could not evaluate', async () => {
    window.jplearnDesktop = {
      evaluateScenarioResponse: vi.fn(async () => ({ ok: false, text: '' })),
    } as unknown as Window['jplearnDesktop']
    expect(await createScenarioAiEvaluator().evaluate(request(), new AbortController().signal)).toBeNull()
  })

  it('returns null when the bridge call throws', async () => {
    window.jplearnDesktop = {
      evaluateScenarioResponse: vi.fn(async () => { throw new Error('runtime exploded') }),
    } as unknown as Window['jplearnDesktop']
    expect(await createScenarioAiEvaluator().evaluate(request(), new AbortController().signal)).toBeNull()
  })

  it('returns null once the turn has been aborted, before and after the call', async () => {
    const evaluateScenarioResponse = vi.fn(async () => ({
      ok: true,
      text: '{"outcome":"correct","matchedIntentId":"intent-order","missingInfo":[],"confidence":0.9}',
    }))
    window.jplearnDesktop = { evaluateScenarioResponse } as unknown as Window['jplearnDesktop']
    const controller = new AbortController()
    controller.abort()

    expect(await createScenarioAiEvaluator().evaluate(request(), controller.signal)).toBeNull()
    expect(evaluateScenarioResponse).not.toHaveBeenCalled()
  })

  it('validates the runtime text against the intents it actually sent', async () => {
    window.jplearnDesktop = {
      evaluateScenarioResponse: vi.fn(async () => ({
        ok: true,
        text: '{"outcome":"correct","matchedIntentId":"intent-recommend","missingInfo":[],"confidence":0.9}',
      })),
    } as unknown as Window['jplearnDesktop']
    // 'intent-recommend' was never offered for this turn, so the verdict is discarded.
    expect(await createScenarioAiEvaluator().evaluate(request(), new AbortController().signal)).toBeNull()

    window.jplearnDesktop = {
      evaluateScenarioResponse: vi.fn(async () => ({
        ok: true,
        text: '{"outcome":"partial","matchedIntentId":"intent-order","missingInfo":["drink"],"confidence":0.75}',
      })),
    } as unknown as Window['jplearnDesktop']
    expect(await createScenarioAiEvaluator().evaluate(request(), new AbortController().signal)).toEqual(
      expect.objectContaining({ outcome: 'partial', matchedIntentId: 'intent-order', missingInfo: ['drink'] }),
    )
  })
})

describe('nullScenarioAiEvaluator', () => {
  it('always declines, which is what "no model installed" looks like', async () => {
    expect(await nullScenarioAiEvaluator.evaluate(request(), new AbortController().signal)).toBeNull()
  })
})
