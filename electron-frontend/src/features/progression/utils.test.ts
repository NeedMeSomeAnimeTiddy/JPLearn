import { describe, expect, it } from 'vitest'

import { UNTRACKED_NODE_LABEL } from './constants'
import type { ProgressionNode } from './types'
import {
  currentNode,
  describeNode,
  isNodeOpenByProgress,
  parseOverrides,
  progressLabelFor,
  toNodeViews,
} from './utils'

function node(overrides: Partial<ProgressionNode> = {}): ProgressionNode {
  return {
    node_id: 'hiragana',
    name: 'Hiragana',
    category: 'hiragana',
    status: 'locked',
    mastered_ratio: 0,
    is_reachable: false,
    mastered_count: 0,
    total_count: 104,
    is_tracked: true,
    ...overrides,
  }
}

describe('isNodeOpenByProgress', () => {
  it.each(['unlocked', 'active', 'mastered'] as const)('treats %s as open', (status) => {
    expect(isNodeOpenByProgress(node({ status }))).toBe(true)
  })

  it('treats locked as closed', () => {
    expect(isNodeOpenByProgress(node({ status: 'locked' }))).toBe(false)
  })
})

describe('progressLabelFor', () => {
  it('shows the count for a tracked node', () => {
    expect(progressLabelFor(node({ mastered_count: 91 }))).toBe('91/104')
  })

  it('shows nothing at all for an untracked node', () => {
    // Ten of the sixteen have no defensible denominator. A 0% would read as
    // "you have done none of this" rather than "this is not measured" — and
    // repeating the explanation on every row was what made the first version
    // of the map unreadable. It is said once, in the expanded list's footnote.
    const untracked = node({ is_tracked: false, total_count: 0, node_id: 'reading' })
    expect(progressLabelFor(untracked)).toBe('')
  })

  it('is blank when a tracked node has nothing to count', () => {
    expect(progressLabelFor(node({ total_count: 0 }))).toBe('')
  })
})

describe('describeNode', () => {
  it('names the stage, its state and its progress', () => {
    const [view] = toNodeViews([node({ status: 'unlocked', mastered_count: 91 })], new Set())
    expect(describeNode(view)).toBe('Hiragana — in progress, 91 of 104')
  })

  it('says a finished stage is finished', () => {
    const [view] = toNodeViews([node({ status: 'mastered' })], new Set())
    expect(describeNode(view)).toContain('finished')
  })

  it('says a gated stage is not unlocked, without claiming zero progress', () => {
    const [view] = toNodeViews([node({ status: 'locked' })], new Set())
    expect(describeNode(view)).toContain('not unlocked yet')
  })

  it('explains an untracked stage instead of reading out a count', () => {
    const [view] = toNodeViews(
      [node({ node_id: 'reading', name: 'Reading', is_tracked: false, total_count: 0 })],
      new Set(),
    )
    expect(describeNode(view)).toContain(UNTRACKED_NODE_LABEL.toLowerCase())
    expect(describeNode(view)).not.toContain(' 0 ')
  })
})

describe('toNodeViews', () => {
  it('opens a node the backend has unlocked', () => {
    const [view] = toNodeViews([node({ status: 'unlocked' })], new Set())
    expect(view.isOpen).toBe(true)
    expect(view.isOverridden).toBe(false)
  })

  it('opens a gated node the learner confirmed, and marks it overridden', () => {
    const [view] = toNodeViews([node({ status: 'locked' })], new Set(['hiragana']))
    expect(view.isOpen).toBe(true)
    expect(view.isOverridden).toBe(true)
  })

  it('does not mark an already-open node as overridden', () => {
    const [view] = toNodeViews([node({ status: 'mastered' })], new Set(['hiragana']))
    expect(view.isOverridden).toBe(false)
  })

  it('resolves each node to a destination', () => {
    const views = toNodeViews(
      [node({ node_id: 'kanji_n5' }), node({ node_id: 'reading' }), node({ node_id: 'jlpt_n3' })],
      new Set(),
    )
    expect(views[0].destination).toEqual({ kind: 'script', script: 'kanji_n5' })
    expect(views[1].destination).toEqual({ kind: 'passages' })
    expect(views[2].destination).toEqual({ kind: 'jlpt' })
  })

  it('falls back to no destination for an unknown node', () => {
    const [view] = toNodeViews([node({ node_id: 'invented_node' })], new Set())
    expect(view.destination).toEqual({ kind: 'none' })
  })
})

describe('currentNode', () => {
  it('is the first open node that is not finished', () => {
    const views = toNodeViews([
      node({ node_id: 'tutorial', status: 'mastered' }),
      node({ node_id: 'hiragana', status: 'unlocked' }),
      node({ node_id: 'katakana', status: 'locked' }),
    ], new Set())
    expect(currentNode(views)?.node_id).toBe('hiragana')
  })

  it('falls back to the last finished node when everything is done', () => {
    const views = toNodeViews([
      node({ node_id: 'tutorial', status: 'mastered' }),
      node({ node_id: 'hiragana', status: 'mastered' }),
    ], new Set())
    expect(currentNode(views)?.node_id).toBe('hiragana')
  })

  it('is null when there are no nodes', () => {
    expect(currentNode([])).toBeNull()
  })
})

describe('parseOverrides', () => {
  it('reads a stored list', () => {
    expect(parseOverrides('["reading","jlpt_n5"]')).toEqual(new Set(['reading', 'jlpt_n5']))
  })

  it.each([null, '', 'not json', '{"a":1}', '[1,2,3]'])(
    'returns an empty set for %j rather than throwing',
    (raw) => {
      expect(parseOverrides(raw).size).toBe(0)
    },
  )
})
