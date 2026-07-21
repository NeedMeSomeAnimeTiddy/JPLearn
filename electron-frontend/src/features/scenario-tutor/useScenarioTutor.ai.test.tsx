import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScenarioTutor } from './useScenarioTutor'
import type { AiEvaluationResult, ScenarioAiEvaluator } from './types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

/** A response no authored phrase, slot, or mistake pattern covers, so the
 * deterministic evaluator returns 'unclear' with tier 'none' — the only case
 * that may consult a model. */
const AMBIGUOUS_RESPONSE = 'あのう、黒いのをひとつもらえたりしますか'

function aiBridge() {
  return {
    evaluateScenarioResponse: vi.fn(async () => ({ ok: false, text: '' })),
    preloadAssistantChatRuntime: vi.fn(async () => ({ ok: true })),
    cancelAssistantChatInference: vi.fn(async () => ({ ok: true, cancelled: true })),
  }
}

function startOrderTurn(
  result: { current: ReturnType<typeof useScenarioTutor> },
) {
  act(() => result.current.selectScenario('cafe-order'))
  act(() => result.current.selectLevel('beginner'))
  act(() => result.current.startScenario())
  act(() => result.current.setLearnerInputValue('こんにちは'))
  act(() => result.current.submitResponse())
  // Now parked on the drink-order node, where an ambiguous phrasing is plausible.
  expect(result.current.session?.currentNodeId).toBe('n-order')
}

/** The n-order node's primary drink-order intent, resolved from the authored
 * content rather than assumed by position. */
function orderIntentId(result: { current: ReturnType<typeof useScenarioTutor> }): string {
  const node = result.current.selectedScenario?.nodes['n-order']
  const intentId = node && node.kind === 'learner'
    ? node.intents.find((intent) => intent.branch.correct === 'n-size')?.id
    : undefined
  expect(intentId).toBeTruthy()
  return intentId as string
}

function evaluatorReturning(verdict: AiEvaluationResult | null): ScenarioAiEvaluator & { evaluate: ReturnType<typeof vi.fn> } {
  return { evaluate: vi.fn(async () => verdict) }
}

afterEach(() => {
  cleanup()
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

describe('useScenarioTutor — optional AI evaluation', () => {
  it('never consults the model when the toggle is off', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const evaluator = evaluatorReturning({ outcome: 'correct', matchedIntentId: 'intent-order-drink', missingInfo: [], confidence: 0.9 })
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluationEnabled: false, aiEvaluator: evaluator }))
    startOrderTurn(result)

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())

    expect(evaluator.evaluate).not.toHaveBeenCalled()
    expect(result.current.aiEvaluationActive).toBe(false)
    // The authored recovery ran instead, and the turn is on screen.
    expect(result.current.session?.transcript.some((turn) => turn.learnerInput === AMBIGUOUS_RESPONSE)).toBe(true)
  })

  it('never consults the model for a response the deterministic rules already classified', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const evaluator = evaluatorReturning(null)
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)

    act(() => result.current.setLearnerInputValue('コーヒーをください'))
    act(() => result.current.submitResponse())

    expect(evaluator.evaluate).not.toHaveBeenCalled()
    expect(result.current.session?.currentNodeId).toBe('n-size-turn')
  })

  it('accepts an ambiguous paraphrase when a confident model recognises the intent', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const evaluator = evaluatorReturning(null)
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)

    // The authored drink-order intent — not the side branch that asks for a
    // recommendation, which legitimately loops back to this same node.
    const intentId = orderIntentId(result)
    evaluator.evaluate.mockResolvedValue({ outcome: 'correct', matchedIntentId: intentId, missingInfo: [], confidence: 0.9 })

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())

    await waitFor(() => expect(result.current.evaluatingResponse).toBe(false))
    expect(evaluator.evaluate).toHaveBeenCalledOnce()
    // The engine — not the model — chose the node this intent branches to.
    expect(result.current.session?.currentNodeId).toBe('n-size-turn')
    const turn = result.current.session?.transcript.find((entry) => entry.learnerInput === AMBIGUOUS_RESPONSE)
    expect(turn?.outcome).toBe('correct')
  })

  it('sends only single-turn context: no transcript, node ids, or scenario graph', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const evaluator = evaluatorReturning(null)
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())
    await waitFor(() => expect(evaluator.evaluate).toHaveBeenCalledOnce())

    const [sentRequest] = evaluator.evaluate.mock.calls[0]
    expect(Object.keys(sentRequest).sort()).toEqual([
      'expectedIntents', 'learnerLevel', 'learnerResponse', 'npcLine', 'objectiveDescription', 'requiredSlotIds', 'scenarioTitle',
    ])
    expect(sentRequest.learnerResponse).toBe(AMBIGUOUS_RESPONSE)
    expect(sentRequest.learnerLevel).toBe('beginner')
    expect(sentRequest.expectedIntents.every((intent: { examplePhrases: string[] }) => intent.examplePhrases.length <= 3)).toBe(true)
    expect(JSON.stringify(sentRequest)).not.toContain('こんにちは') // no earlier turn leaked
    expect(JSON.stringify(sentRequest)).not.toContain('n-order') // no node ids
  })

  it('falls back to the authored recovery when the model declines, and the turn still lands', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const evaluator = evaluatorReturning(null)
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)
    const nodeBefore = result.current.session?.currentNodeId

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())

    await waitFor(() => expect(result.current.evaluatingResponse).toBe(false))
    expect(evaluator.evaluate).toHaveBeenCalledOnce()
    // Unclear keeps the learner on the same node with the authored recovery line,
    // which is pushed as a real NPC transcript turn (no separate feedback channel).
    expect(result.current.session?.currentNodeId).toBe(nodeBefore)
    const lastTurn = result.current.session?.transcript.at(-1)
    expect(lastTurn?.npcLine).not.toBeNull()
  })

  it('treats an evaluator that throws exactly like a decline', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const evaluator: ScenarioAiEvaluator = { evaluate: vi.fn(async () => { throw new Error('inference timed out') }) }
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)
    const nodeBefore = result.current.session?.currentNodeId

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())

    await waitFor(() => expect(result.current.evaluatingResponse).toBe(false))
    expect(result.current.session?.currentNodeId).toBe(nodeBefore)
    expect(result.current.session?.transcript.some((turn) => turn.learnerInput === AMBIGUOUS_RESPONSE)).toBe(true)
  })

  it('blocks a second submission while a judgement is pending', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const pending = deferred<AiEvaluationResult | null>()
    const evaluator: ScenarioAiEvaluator & { evaluate: ReturnType<typeof vi.fn> } = { evaluate: vi.fn(() => pending.promise) }
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())
    expect(result.current.evaluatingResponse).toBe(true)

    act(() => result.current.setLearnerInputValue('コーヒーをください'))
    act(() => result.current.submitResponse())
    expect(evaluator.evaluate).toHaveBeenCalledOnce()

    await act(async () => { pending.resolve(null) })
    await waitFor(() => expect(result.current.evaluatingResponse).toBe(false))
  })

  it('drops a verdict that arrives after the session was abandoned, and cancels the inference', async () => {
    const bridge = aiBridge()
    window.jplearnDesktop = bridge as unknown as Window['jplearnDesktop']
    const pending = deferred<AiEvaluationResult | null>()
    const evaluator: ScenarioAiEvaluator = { evaluate: vi.fn(() => pending.promise) }
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)
    const intentId = orderIntentId(result)

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())
    expect(result.current.evaluatingResponse).toBe(true)

    act(() => result.current.requestAbandon())
    act(() => result.current.confirmPendingAction())
    expect(bridge.cancelAssistantChatInference).toHaveBeenCalledOnce()

    await act(async () => { pending.resolve({ outcome: 'correct', matchedIntentId: intentId, missingInfo: [], confidence: 0.95 }) })

    expect(result.current.session).toBeNull()
    expect(result.current.screen).toBe('select')
    expect(result.current.evaluatingResponse).toBe(false)
  })

  it('drops a verdict that arrives after the scenario was restarted', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const pending = deferred<AiEvaluationResult | null>()
    const evaluator: ScenarioAiEvaluator = { evaluate: vi.fn(() => pending.promise) }
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)
    const intentId = orderIntentId(result)
    const sessionIdBefore = result.current.session?.sessionId

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())
    act(() => result.current.requestRestart())
    act(() => result.current.confirmPendingAction())

    await act(async () => { pending.resolve({ outcome: 'correct', matchedIntentId: intentId, missingInfo: [], confidence: 0.95 }) })

    expect(result.current.session?.sessionId).not.toBe(sessionIdBefore)
    // The fresh session is back at its first learner node, untouched by the verdict.
    expect(result.current.session?.currentNodeId).toBe('n-greeting-turn')
    expect(result.current.session?.transcript.some((turn) => turn.learnerInput === AMBIGUOUS_RESPONSE)).toBe(false)
  })

  it('applies a verdict that arrives while the popup was closed or switched away', async () => {
    window.jplearnDesktop = aiBridge() as unknown as Window['jplearnDesktop']
    const pending = deferred<AiEvaluationResult | null>()
    const evaluator: ScenarioAiEvaluator = { evaluate: vi.fn(() => pending.promise) }
    const { result } = renderHook(() => useScenarioTutor({ aiEvaluator: evaluator }))
    startOrderTurn(result)
    const intentId = orderIntentId(result)

    act(() => result.current.setLearnerInputValue(AMBIGUOUS_RESPONSE))
    act(() => result.current.submitResponse())

    // Back to menu / mode switch / popup close touch no hook state at all.
    await act(async () => { pending.resolve({ outcome: 'correct', matchedIntentId: intentId, missingInfo: [], confidence: 0.9 }) })

    await waitFor(() => expect(result.current.session?.currentNodeId).toBe('n-size-turn'))
  })

  it('preloads the local model when a scenario starts with AI evaluation enabled', () => {
    const bridge = aiBridge()
    window.jplearnDesktop = bridge as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    act(() => result.current.selectScenario('cafe-order'))
    act(() => result.current.selectLevel('beginner'))
    act(() => result.current.startScenario())
    expect(bridge.preloadAssistantChatRuntime).toHaveBeenCalledOnce()

    cleanup()
    const offBridge = aiBridge()
    window.jplearnDesktop = offBridge as unknown as Window['jplearnDesktop']
    const { result: off } = renderHook(() => useScenarioTutor({ aiEvaluationEnabled: false }))
    act(() => off.current.selectScenario('cafe-order'))
    act(() => off.current.selectLevel('beginner'))
    act(() => off.current.startScenario())
    expect(offBridge.preloadAssistantChatRuntime).not.toHaveBeenCalled()
  })

  it('reports AI evaluation inactive when the bridge is missing entirely', () => {
    window.jplearnDesktop = {} as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    expect(result.current.aiEvaluationActive).toBe(false)
  })
})
