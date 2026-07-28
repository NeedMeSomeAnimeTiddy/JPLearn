import { useCallback, useEffect, useMemo, useState } from 'react'

import { PROGRESSION_OVERRIDES_STORAGE_KEY } from './constants'
import type { ProgressionNode, ProgressionNodeView } from './types'
import { currentNode, parseOverrides, toNodeViews } from './utils'

export interface ProgressionApi {
  nodes: ProgressionNodeView[]
  /** Where the map should draw the learner's attention. */
  current: ProgressionNodeView | null
  loading: boolean
  /** Node awaiting confirmation because its gate is still closed. */
  pending: ProgressionNodeView | null
  /**
   * Ask to open a node. Returns the node when it can be opened immediately;
   * returns null and raises a confirmation when its gate is still closed.
   */
  requestOpen: (nodeId: string) => ProgressionNodeView | null
  /** Accept the confirmation: records the override and returns the node. */
  confirmOpen: () => ProgressionNodeView | null
  cancelOpen: () => void
  refresh: () => void
}

/**
 * The 16-node curriculum graph, and the learner's position in it.
 *
 * `JPLEARN_GRAPH` has been defined, persisted and exposed over the bridge for a
 * long time without anything rendering it (issue #78 Phase 4). This is the
 * renderer side.
 *
 * Gating is **soft**: a locked node is never unreachable. Opening one asks for
 * confirmation the same way jumping into an advanced section already does, and
 * the choice is remembered so it is asked once per node. That matters because
 * onboarding is skippable — a hard gate would shut out anyone who skipped it.
 */
export function useProgression(enabled: boolean): ProgressionApi {
  const [nodes, setNodes] = useState<ProgressionNode[]>([])
  const [loading, setLoading] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return parseOverrides(window.localStorage.getItem(PROGRESSION_OVERRIDES_STORAGE_KEY))
  })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = window.jplearnDesktop?.getProgressionState
    if (!load) return

    setLoading(true)
    void (async () => {
      try {
        const payload = await load()
        if (!cancelled) setNodes(payload?.nodes ?? [])
      } catch {
        // The map degrades to empty rather than blocking the home screen.
        if (!cancelled) setNodes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [enabled, revision])

  const views = useMemo(() => toNodeViews(nodes, overrides), [nodes, overrides])
  const current = useMemo(() => currentNode(views), [views])
  const pending = useMemo(
    () => views.find((view) => view.node_id === pendingId) ?? null,
    [views, pendingId],
  )

  const requestOpen = useCallback((nodeId: string): ProgressionNodeView | null => {
    const view = views.find((entry) => entry.node_id === nodeId)
    if (!view) return null
    if (view.isOpen) return view
    setPendingId(nodeId)
    return null
  }, [views])

  const confirmOpen = useCallback((): ProgressionNodeView | null => {
    if (pendingId === null) return null
    const view = views.find((entry) => entry.node_id === pendingId) ?? null
    setOverrides((previous) => {
      const next = new Set(previous).add(pendingId)
      try {
        window.localStorage.setItem(
          PROGRESSION_OVERRIDES_STORAGE_KEY, JSON.stringify([...next]),
        )
      } catch { /* ignore — the override degrades to session-only */ }
      return next
    })
    setPendingId(null)
    return view
  }, [pendingId, views])

  const cancelOpen = useCallback(() => setPendingId(null), [])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  return { nodes: views, current, loading, pending, requestOpen, confirmOpen, cancelOpen, refresh }
}
