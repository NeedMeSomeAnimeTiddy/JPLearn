import { describe, expect, it } from 'vitest'
import { getScenarioById } from '../../lib/scenarios'
import { createSession, submitLearnerResponse } from './engine'
import { evaluateResponse, toEvaluationResult } from './evaluation'
import type { ScenarioDefinition, ScenarioSession } from './types'
import {
  heldAnswer, objectiveFoot, objectiveTally, objectiveTickClass, summaryFold, summaryPages, deriveScenarioSummary,
  transcriptPages,
} from './utils'

const cafe = getScenarioById('cafe-order') as ScenarioDefinition

function reply(session: ScenarioSession, text: string): ScenarioSession {
  const node = cafe.nodes[session.currentNodeId]
  if (!node || node.kind !== 'learner') throw new Error('not a learner turn')
  const expectation = { intents: node.intents, cancelIntent: node.cancelIntent }
  const evaluation = toEvaluationResult(evaluateResponse(expectation, text, { inputSource: 'typed' }), expectation)
  return submitLearnerResponse(cafe, session, text, 'typed', evaluation, '2026-10-26T00:00:00Z').session
}

function start(): ScenarioSession {
  return createSession(cafe, 'beginner', 'test-session', '2026-10-26T00:00:00Z').session
}

describe('the conversation sheet’s arithmetic', () => {
  it('counts what is needed before, during and after', () => {
    const before = objectiveTally(cafe, null)
    expect(before.needed).toBeGreaterThan(0)
    expect(objectiveFoot(before, 'before')).toBe(`0 OF ${before.needed} NEEDED · ${before.optional} OPTIONAL`)
    /* optional objectives are hatched; nothing is lit before the conversation starts */
    expect(before.ticks.filter((t) => !t.required).every((t) => objectiveTickClass(t) === 'cv-opt')).toBe(true)
    expect(before.ticks.every((t) => t.mark === 'todo')).toBe(true)

    const during = objectiveTally(cafe, start())
    /* the objective this turn is about is marked as the one you are on */
    expect(during.ticks.some((t) => t.mark === 'here')).toBe(true)
  })

  it('holds the reply, its correction and the next line from where the transcript stood', () => {
    let session = reply(start(), 'こんにちは')
    const from = session.transcript.length
    session = reply(session, 'コーヒー')
    const held = heldAnswer(cafe, session.transcript, from)
    expect(held?.turn.learnerInput).toBe('コーヒー')
    expect(held?.turn.outcome).toBe('partial')
    expect(held?.turn.correction).toBe('コーヒーをください')
    expect(held?.next.length).toBeGreaterThan(0)
    expect(held?.attempt).toBe(1)
    /* nothing after `from` but the reply's own consequences */
    expect(heldAnswer(cafe, session.transcript, session.transcript.length)).toBeNull()
  })

  it('counts a second try at the same line as attempt two', () => {
    let session = reply(start(), 'こんにちは')
    session = reply(session, 'xyz')
    const from = session.transcript.length
    session = reply(session, 'abc')
    const held = heldAnswer(cafe, session.transcript, from)
    expect(held?.attempt).toBe(2)
    expect(held?.maxAttempts).toBeGreaterThanOrEqual(2)
  })

  it('folds the summary to counts and pages the rest', () => {
    let session = reply(start(), 'こんにちは')
    session = reply(session, 'コーヒー')
    const summary = deriveScenarioSummary(cafe, session.transcript, session.objectiveStatus)
    expect(summaryFold(summary)).toMatch(/^1 CORRECTION/)
    const pages = summaryPages(cafe, session.transcript, summary, 3)
    expect(pages.every((page) => page.length <= 3)).toBe(true)
    expect(pages.flat().some((line) => line.cap === 'YOU' && line.text === 'コーヒー')).toBe(true)
  })

  it('pages the earlier turns with their English, how each reply went, and its correction', () => {
    let session = reply(start(), 'こんにちは')
    session = reply(session, 'コーヒー')
    const pages = transcriptPages(cafe, session.transcript, 2)
    expect(pages.every((page) => page.length <= 2)).toBe(true)
    const lines = pages.flat()
    const npc = cafe.npc.name.toUpperCase()
    /* the character's lines carry their English */
    expect(lines.find((line) => line.cap === npc)?.en).toBe('Welcome!')
    /* each reply says how it went, and a partial one is followed by its fix */
    const partial = lines.findIndex((line) => line.cap === 'YOU' && line.text === 'コーヒー')
    expect(lines[partial].en).toBe('PARTIAL')
    expect(lines[partial + 1]).toMatchObject({ cap: 'FIX', text: 'コーヒーをください' })
    expect(transcriptPages(cafe, [], 4)).toEqual([])
  })
})
