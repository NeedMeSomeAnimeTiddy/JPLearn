import { describe, expect, it } from 'vitest'
import { createSession, hintsForCurrentNode, revealHint, submitLearnerResponse } from './engine'
import { evaluateResponse, toEvaluationResult } from './evaluation'
import { CAFE_ORDER_SCENARIO } from '../../lib/scenarios/cafeOrder'
import { SHINJUKU_DIRECTIONS_SCENARIO } from '../../lib/scenarios/shinjukuDirections'
import type { LearnerNode, ScenarioDefinition, ScenarioSession } from './types'

const NOW = '2026-07-21T00:00:00.000Z'

/** Submits one learner turn against whichever learner node the session is
 * currently at, running the full deterministic evaluator + engine advance —
 * exactly the path the real hook will follow, with no AI evaluator involved. */
function submit(scenario: ScenarioDefinition, session: ScenarioSession, input: string) {
  const node = scenario.nodes[session.currentNodeId]
  if (node.kind !== 'learner') throw new Error(`Session is not at a learner node (${session.currentNodeId})`)
  const expectation = { intents: node.intents, cancelIntent: node.cancelIntent }
  const deterministic = evaluateResponse(expectation, input, { inputSource: 'typed' })
  const evaluation = toEvaluationResult(deterministic, expectation)
  return submitLearnerResponse(scenario, session, input, 'typed', evaluation, NOW)
}

describe('scenario engine — cafe-order full completion (correct path)', () => {
  it('completes successfully through every required objective when the learner answers correctly each time', () => {
    let { session } = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-1', NOW)
    expect(session.currentNodeId).toBe('n-greeting-turn')

    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'こんにちは'))
    expect(session.currentNodeId).toBe('n-order')

    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'コーヒーをください'))
    expect(session.currentNodeId).toBe('n-size-turn')

    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'レギュラーでお願いします'))
    expect(session.currentNodeId).toBe('n-eatin-turn')

    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'ここで食べます'))
    expect(session.currentNodeId).toBe('n-price-turn')

    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'はい、お願いします'))
    expect(session.currentNodeId).toBe('n-thanks-turn')

    const final = submit(CAFE_ORDER_SCENARIO, session, 'ありがとうございます')
    session = final.session

    expect(session.status).toBe('success')
    expect(session.currentNodeId).toBe('n-end-success')
    expect(session.completedAtUtc).toBe(NOW)
    expect(final.effects.some((effect) => effect.type === 'complete-session' && effect.outcome === 'success')).toBe(true)

    for (const objective of CAFE_ORDER_SCENARIO.objectives) {
      if (objective.required) {
        expect(session.objectiveStatus[objective.id]).toBe('met')
      }
    }
  })

  it('takes the authored cancel branch to a cancelled (not success) end', () => {
    let { session } = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-cancel', NOW)
    const result = submit(CAFE_ORDER_SCENARIO, session, 'やめておきます')
    session = result.session
    expect(session.status).toBe('cancelled')
    expect(session.currentNodeId).toBe('n-end-cancelled')
  })

  it('completes via the recovery/fallbackAdvance path alone when every response is unrecognisable, with zero AI involvement', () => {
    let { session } = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-fallback', NOW)
    let guard = 0
    while (session.status === 'active' && guard < 60) {
      const result = submit(CAFE_ORDER_SCENARIO, session, 'ぜんぜんかんけいないはなしです')
      session = result.session
      guard += 1
    }
    expect(session.status).toBe('success')
    // Every required objective should be at least assisted (never silently "met" without input).
    for (const objective of CAFE_ORDER_SCENARIO.objectives) {
      if (objective.required) {
        expect(['met', 'assisted']).toContain(session.objectiveStatus[objective.id])
      }
    }
  })

  it('takes the authored partial branch (missing polite marker) through the follow-up NPC node and back to the same learner node, with an inline correction, without losing progress', () => {
    let { session } = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-partial', NOW)
    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'こんにちは'))
    const result = submit(CAFE_ORDER_SCENARIO, session, 'コーヒー')
    session = result.session
    // The partial branch routes through n-order-followup (an NPC-only node,
    // auto-advanced through and recorded in the transcript) and lands back
    // at n-order, awaiting the next learner turn.
    expect(session.currentNodeId).toBe('n-order')
    expect(session.transcript.some((turn) => turn.nodeId === 'n-order-followup')).toBe(true)
    const lastLearnerTurn = [...session.transcript].reverse().find((turn) => turn.learnerInput !== null)
    expect(lastLearnerTurn?.outcome).toBe('partial')
    expect(lastLearnerTurn?.correction).toContain('ください')
    // obj-order must not be marked met on a partial response.
    expect(session.objectiveStatus['obj-order']).not.toBe('met')
  })

  it('recognises a side intent (recommendation) without marking the order objective met', () => {
    let { session } = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-side', NOW)
    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'こんにちは'))
    const result = submit(CAFE_ORDER_SCENARIO, session, 'おすすめは何ですか')
    session = result.session
    // n-recommend is an NPC-only node whose `next` loops back to n-order;
    // auto-advance passes through it (recorded in the transcript) and stops
    // back at n-order, awaiting the learner's actual order.
    expect(session.currentNodeId).toBe('n-order')
    expect(session.transcript.some((turn) => turn.nodeId === 'n-recommend')).toBe(true)
    expect(session.objectiveStatus['obj-order']).toBeUndefined()
  })
})

describe('scenario engine — shinjuku-directions full completion (correct path)', () => {
  it('completes successfully through every required objective', () => {
    let { session } = createSession(SHINJUKU_DIRECTIONS_SCENARIO, 'intermediate', 'session-2', NOW)
    expect(session.currentNodeId).toBe('n-attention-turn')

    ;({ session } = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'すみません'))
    expect(session.currentNodeId).toBe('n-ask-way-turn')

    ;({ session } = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, '新宿駅の南口はどちらですか'))
    expect(session.currentNodeId).toBe('n-confirm-turn')

    ;({ session } = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'まっすぐ行って信号を右ですね'))
    expect(session.currentNodeId).toBe('n-thanks-turn')

    const final = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'ありがとうございます')
    session = final.session

    expect(session.status).toBe('success')
    for (const objective of SHINJUKU_DIRECTIONS_SCENARIO.objectives) {
      if (objective.required) {
        expect(session.objectiveStatus[objective.id]).toBe('met')
      }
    }
  })

  it('follows the partial (missing-slot) branch through the confirm-followup NPC node and back to n-confirm-turn, then completes once the missing slot is supplied', () => {
    let { session } = createSession(SHINJUKU_DIRECTIONS_SCENARIO, 'beginner', 'session-partial-slot', NOW)
    ;({ session } = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'すみません'))
    ;({ session } = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, '新宿駅の南口はどちらですか'))
    const partialResult = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'まっすぐ行くんですね')
    session = partialResult.session
    expect(session.currentNodeId).toBe('n-confirm-turn')
    expect(session.transcript.some((turn) => turn.nodeId === 'n-confirm-followup')).toBe(true)
    expect(session.objectiveStatus['obj-confirm']).toBeUndefined()

    ;({ session } = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, '信号を右に曲がるんですね'))
    expect(session.objectiveStatus['obj-confirm']).toBe('met')
    expect(session.currentNodeId).toBe('n-thanks-turn')
  })

  it('completes via recovery/fallbackAdvance alone when every response is unrecognisable', () => {
    let { session } = createSession(SHINJUKU_DIRECTIONS_SCENARIO, 'beginner', 'session-fallback-2', NOW)
    let guard = 0
    while (session.status === 'active' && guard < 60) {
      const result = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'まったくちがうはなしをします')
      session = result.session
      guard += 1
    }
    expect(session.status).toBe('success')
  })

  it('escalates the hint ladder across repeated incorrect attempts before falling back', () => {
    let { session } = createSession(SHINJUKU_DIRECTIONS_SCENARIO, 'beginner', 'session-hints', NOW)
    const node = SHINJUKU_DIRECTIONS_SCENARIO.nodes['n-attention-turn'] as LearnerNode
    for (let attempt = 0; attempt < node.recovery.maxAttempts; attempt += 1) {
      const before = session
      const result = submit(SHINJUKU_DIRECTIONS_SCENARIO, session, 'ぜんぜんちがうこと')
      session = result.session
      if (attempt < node.recovery.maxAttempts - 1) {
        expect(session.currentNodeId).toBe(before.currentNodeId)
        expect(session.hintLevels[before.currentNodeId]).toBe(attempt)
      }
    }
    // After maxAttempts, fallbackAdvance should have moved the session on.
    expect(session.currentNodeId).not.toBe('n-attention-turn')
    expect(session.objectiveStatus['obj-attention']).toBe('assisted')
  })
})


describe('revealHint — asking for help is never a wrong answer', () => {
  function startedSession() {
    return createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-hint', NOW).session
  }

  it('reveals the ladder one step at a time and stops at the last step', () => {
    let session = startedSession()
    const nodeId = session.currentNodeId
    const ladderLength = (CAFE_ORDER_SCENARIO.nodes[nodeId] as LearnerNode).hints.beginner.length
    expect(session.hintLevels[nodeId]).toBeUndefined()

    session = revealHint(CAFE_ORDER_SCENARIO, session)
    expect(session.hintLevels[nodeId]).toBe(0)

    for (let step = 1; step < ladderLength; step += 1) {
      session = revealHint(CAFE_ORDER_SCENARIO, session)
      expect(session.hintLevels[nodeId]).toBe(step)
    }

    // Past the end it is a no-op returning the identical session object.
    const exhausted = revealHint(CAFE_ORDER_SCENARIO, session)
    expect(exhausted).toBe(session)
    expect(exhausted.hintLevels[nodeId]).toBe(ladderLength - 1)
  })

  it('never consumes an attempt, changes the node, or touches objectives', () => {
    const before = startedSession()
    const after = revealHint(CAFE_ORDER_SCENARIO, before)

    expect(after.currentNodeId).toBe(before.currentNodeId)
    expect(after.attempts).toEqual(before.attempts)
    expect(after.objectiveStatus).toEqual(before.objectiveStatus)
    expect(after.transcript).toEqual(before.transcript)
    expect(after.status).toBe('active')
  })

  it('exposes the ladder for the current node and nothing off a learner node', () => {
    const session = startedSession()
    expect(hintsForCurrentNode(CAFE_ORDER_SCENARIO, session).length).toBeGreaterThan(0)

    const finished = { ...session, currentNodeId: 'n-end-success' }
    expect(hintsForCurrentNode(CAFE_ORDER_SCENARIO, finished)).toEqual([])
  })

  it('gives beginners a longer ladder than intermediates, ending in a model answer with romaji', () => {
    const node = CAFE_ORDER_SCENARIO.nodes['n-order'] as LearnerNode
    expect(node.hints.beginner.length).toBeGreaterThan(node.hints.intermediate.length)
    const last = node.hints.beginner[node.hints.beginner.length - 1]
    expect(last.ja).toBeTruthy()
    expect(last.reading).toBeTruthy()
    expect(last.romaji).toBeTruthy()
  })

  it('clears the revealed hint level once the turn is answered', () => {
    let session = startedSession()
    const nodeId = session.currentNodeId
    session = revealHint(CAFE_ORDER_SCENARIO, session)
    expect(session.hintLevels[nodeId]).toBe(0)

    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'こんにちは'))
    expect(session.hintLevels[nodeId]).toBeUndefined()
  })
})

describe('partial turns surface a visible correction directly on the transcript turn', () => {
  it('writes the correction with kana and romaji onto the learner turn itself, and still advances', () => {
    let { session } = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-partial', NOW)
    ;({ session } = submit(CAFE_ORDER_SCENARIO, session, 'こんにちは'))
    expect(session.currentNodeId).toBe('n-order')

    // A bare drink name is understood but impolite — the learner must see why.
    const { session: after } = submit(CAFE_ORDER_SCENARIO, session, 'コーヒー')
    const turn = after.transcript.find((entry) => entry.learnerInput === 'コーヒー')
    expect(turn?.outcome).toBe('partial')
    expect(turn?.correction).toBe('コーヒーをください')
    expect(turn?.correctionReading).toBe('こーひーをください')
    expect(turn?.correctionRomaji).toBe('ko-hi- wo kudasai')
    // Partial still moves the conversation forward rather than stalling.
    expect(after.currentNodeId).not.toBe('n-order-followup')
    // There is no separate transient feedback channel any more — the engine
    // only ever emits speak-npc-line / complete-session effects.
  })

  it('writes the model answer with romaji onto the NPC turn when the assisted fallback fires', () => {
    let session = createSession(CAFE_ORDER_SCENARIO, 'beginner', 'session-fallback', NOW).session
    const nodeId = session.currentNodeId
    const maxAttempts = (CAFE_ORDER_SCENARIO.nodes[nodeId] as LearnerNode).recovery.maxAttempts

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      session = submit(CAFE_ORDER_SCENARIO, session, 'あいうえおかきくけこさしすせそ').session
    }

    const assistTurn = session.transcript.find((entry) => entry.assistedAnswer !== null)
    expect(assistTurn?.assistedAnswer).toBe('こんにちは')
    expect(assistTurn?.assistedAnswerRomaji).toBe("kon'nichiwa")
    expect(assistTurn?.npcLine).not.toBeNull()
  })
})
