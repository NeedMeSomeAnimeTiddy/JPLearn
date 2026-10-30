import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROGRESSION_OVERRIDES_STORAGE_KEY } from './constants'
import type { ProgressionNode } from './types'
import { useProgression } from './useProgression'

/* audit 17, Q1: Reset all progress forgets the "open anyway" choices, the confirmation waiting on
   one, and any read of the graph still on its way */

const node = (over: Partial<ProgressionNode> = {}): ProgressionNode => ({
  node_id: 'kanji_n5',
  name: 'Kanji N5',
  status: 'locked',
  mastered_ratio: 0,
  is_reachable: false,
  mastered_count: 0,
  total_count: 10,
  is_tracked: true,
  ...over,
} as unknown as ProgressionNode)

describe('useProgression reset', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('forgets every override and the confirmation waiting, and reads the graph again', async () => {
    window.localStorage.setItem(PROGRESSION_OVERRIDES_STORAGE_KEY, JSON.stringify(['grammar_n5']))
    const getProgressionState = vi.fn(async () => ({ nodes: [node()] }))
    window.jplearnDesktop = { getProgressionState } as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useProgression(true))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))
    act(() => { result.current.requestOpen('kanji_n5') })
    expect(result.current.pending?.node_id).toBe('kanji_n5')

    act(() => result.current.resetOverrides())
    expect(result.current.pending).toBeNull()
    expect(window.localStorage.getItem(PROGRESSION_OVERRIDES_STORAGE_KEY)).toBeNull()
    await waitFor(() => expect(getProgressionState).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))
    expect(result.current.nodes[0].isOverridden).toBe(false)
  })

  it('drops a graph read that was on its way when the reset came', async () => {
    const answers: Array<(payload: { nodes: ProgressionNode[] }) => void> = []
    const getProgressionState = vi.fn(() => new Promise<{ nodes: ProgressionNode[] }>((resolve) => { answers.push(resolve) }))
    window.jplearnDesktop = { getProgressionState } as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useProgression(true))
    act(() => result.current.resetOverrides())
    await waitFor(() => expect(answers).toHaveLength(2))
    await act(async () => { answers[0]({ nodes: [node({ node_id: 'stale' } as Partial<ProgressionNode>)] }) })
    expect(result.current.nodes).toEqual([])
    await act(async () => { answers[1]({ nodes: [node()] }) })
    expect(result.current.nodes.map((entry) => entry.node_id)).toEqual(['kanji_n5'])
  })

  it('clears the live overrides even when storage refuses the removal', async () => {
    window.localStorage.setItem(PROGRESSION_OVERRIDES_STORAGE_KEY, JSON.stringify(['kanji_n5']))
    window.jplearnDesktop = { getProgressionState: async () => ({ nodes: [node()] }) } as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useProgression(true))
    await waitFor(() => expect(result.current.nodes[0]?.isOverridden).toBe(true))
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    act(() => result.current.resetOverrides())
    await waitFor(() => expect(result.current.nodes[0]?.isOverridden).toBe(false))
  })
})
