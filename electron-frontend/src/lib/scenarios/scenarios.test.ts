import { describe, expect, it } from 'vitest'
import { validateScenarioDefinition } from '../../features/scenario-tutor/validation'
import type { ScenarioDefinition } from '../../features/scenario-tutor/types'
import { CAFE_ORDER_SCENARIO, SHINJUKU_DIRECTIONS_SCENARIO, SCENARIOS, getScenarioById } from './index'

describe('authored scenarios', () => {
  it.each([
    ['cafe-order', CAFE_ORDER_SCENARIO],
    ['shinjuku-directions', SHINJUKU_DIRECTIONS_SCENARIO],
  ])('%s passes structural validation', (_label, scenario) => {
    const issues = validateScenarioDefinition(scenario)
    expect(issues).toEqual([])
  })

  it('registers both MVP scenarios', () => {
    expect(SCENARIOS.map((scenario) => scenario.id).sort()).toEqual(['cafe-order', 'shinjuku-directions'])
  })

  it('getScenarioById finds a registered scenario and returns undefined otherwise', () => {
    expect(getScenarioById('cafe-order')?.id).toBe('cafe-order')
    expect(getScenarioById('does-not-exist')).toBeUndefined()
  })

  it.each([
    ['cafe-order', CAFE_ORDER_SCENARIO],
    ['shinjuku-directions', SHINJUKU_DIRECTIONS_SCENARIO],
  ])('%s has at least one required and one optional objective', (_label, scenario) => {
    expect(scenario.objectives.some((objective) => objective.required)).toBe(true)
    expect(scenario.objectives.some((objective) => !objective.required)).toBe(true)
  })

  it.each([
    ['cafe-order', CAFE_ORDER_SCENARIO],
    ['shinjuku-directions', SHINJUKU_DIRECTIONS_SCENARIO],
  ])('%s has an authored cancellation path to a cancelled end', (_label, scenario) => {
    const cancelledEnds = Object.values(scenario.nodes).filter(
      (node) => node.kind === 'end' && node.outcome === 'cancelled',
    )
    expect(cancelledEnds.length).toBeGreaterThan(0)
  })
})

describe('validateScenarioDefinition', () => {
  const base = CAFE_ORDER_SCENARIO

  function clone(): ScenarioDefinition {
    return JSON.parse(JSON.stringify(base)) as ScenarioDefinition
  }

  it('flags a missing startNodeId', () => {
    const broken = clone()
    broken.startNodeId = 'does-not-exist'
    const issues = validateScenarioDefinition(broken)
    expect(issues.some((issue) => issue.includes('startNodeId'))).toBe(true)
  })

  it('flags a dangling branch reference', () => {
    const broken = clone()
    const orderNode = broken.nodes['n-order']
    if (orderNode.kind === 'learner') {
      orderNode.intents[1].branch.correct = 'nonexistent-node'
    }
    const issues = validateScenarioDefinition(broken)
    expect(issues.some((issue) => issue.includes('missing node'))).toBe(true)
  })

  it('flags an orphaned node unreachable from startNodeId', () => {
    const broken = clone()
    broken.nodes['orphan-node'] = {
      id: 'orphan-node',
      kind: 'end',
      outcome: 'success',
    }
    const issues = validateScenarioDefinition(broken)
    expect(issues.some((issue) => issue.includes('orphaned'))).toBe(true)
  })

  it('flags a learner node with no intents', () => {
    const broken = clone()
    const orderNode = broken.nodes['n-order']
    if (orderNode.kind === 'learner') {
      orderNode.intents = []
    }
    const issues = validateScenarioDefinition(broken)
    expect(issues.some((issue) => issue.includes('no intents'))).toBe(true)
  })

  it('flags a missing level variant on an NPC line', () => {
    const broken = clone()
    const greeting = broken.nodes['n-greeting']
    if (greeting.kind === 'npc') {
      // @ts-expect-error intentionally corrupting a required level variant for the test
      delete greeting.line.intermediate
    }
    const issues = validateScenarioDefinition(broken)
    expect(issues.some((issue) => issue.includes("missing a complete 'intermediate' variant"))).toBe(true)
  })

  it('flags an unresolved SRS candidate trigger', () => {
    const broken = clone()
    broken.srsCandidates.push({
      id: 'srs-bad',
      trigger: { kind: 'vocabulary', vocabId: 'does-not-exist' },
      front: 'x',
      back: 'y',
    })
    const issues = validateScenarioDefinition(broken)
    expect(issues.some((issue) => issue.includes('unknown vocabulary'))).toBe(true)
  })

  it('accepts a valid minimal scenario with a single learner turn', () => {
    const minimal: ScenarioDefinition = {
      id: 'minimal',
      version: 1,
      title: 'Minimal',
      titleJa: 'ミニマル',
      description: 'Minimal test scenario.',
      npc: { name: 'NPC', role: 'test' },
      objectives: [{ id: 'obj-1', label: 'Say hi', required: true }],
      startNodeId: 'npc-1',
      nodes: {
        'npc-1': { id: 'npc-1', kind: 'npc', next: 'learner-1', line: { beginner: { ja: 'a', reading: 'a', en: 'a' }, intermediate: { ja: 'a', reading: 'a', en: 'a' } } },
        'learner-1': {
          id: 'learner-1',
          kind: 'learner',
          objectiveIds: ['obj-1'],
          intents: [{ id: 'it-1', description: 'say hi', acceptedPhrases: [{ ja: 'こんにちは' }], branch: { correct: 'end-1' } }],
          hints: { beginner: [{ en: 'Say hello', ja: 'こんにちは', reading: 'こんにちは', romaji: 'konnichiwa' }], intermediate: [{ en: 'Greet them' }] },
          recovery: {
            maxAttempts: 1,
            onIncorrect: { beginner: { ja: 'a', reading: 'a', en: 'a' }, intermediate: { ja: 'a', reading: 'a', en: 'a' } },
            onUnclear: { beginner: { ja: 'a', reading: 'a', en: 'a' }, intermediate: { ja: 'a', reading: 'a', en: 'a' } },
            fallbackAdvance: {
              modelAnswer: 'こんにちは',
              countsAsObjective: false,
              line: { beginner: { ja: 'a', reading: 'a', en: 'a' }, intermediate: { ja: 'a', reading: 'a', en: 'a' } },
            },
          },
        },
        'end-1': { id: 'end-1', kind: 'end', outcome: 'success' },
      },
      vocabulary: [],
      grammarPoints: [],
      srsCandidates: [],
      suggestedNextSteps: [],
    }
    expect(validateScenarioDefinition(minimal)).toEqual([])
  })
})
