import { NODE_DESTINATIONS, UNTRACKED_NODE_LABEL } from './constants'
import type { ProgressionNode, ProgressionNodeView } from './types'

/**
 * Whether the backend considers a node open on its own merits.
 *
 * `locked` is the only closed state — `unlocked`, `active` and `mastered` all
 * mean the learner has reached it.
 */
export function isNodeOpenByProgress(node: ProgressionNode): boolean {
  return node.status !== 'locked'
}

/**
 * The count to show beside a node's name, or nothing.
 *
 * Untracked nodes get an empty string rather than `0/0` — ten of the sixteen
 * have no defensible denominator, and a 0% would read as "you have done none of
 * this" when the truth is "nothing here is measured". They are explained once,
 * in the expanded list's footnote, rather than repeated on every row.
 */
export function progressLabelFor(node: ProgressionNode): string {
  if (!node.is_tracked || node.total_count <= 0) return ''
  return `${node.mastered_count}/${node.total_count}`
}

/** Screen-reader description of a node: name, state, and progress if any. */
export function describeNode(node: ProgressionNodeView): string {
  const state = node.status === 'mastered'
    ? 'finished'
    : node.isOpen ? 'in progress' : 'not unlocked yet'
  const progress = node.is_tracked && node.total_count > 0
    ? `, ${node.mastered_count} of ${node.total_count}`
    : node.is_tracked ? '' : `, ${UNTRACKED_NODE_LABEL.toLowerCase()}`
  return `${node.name} — ${state}${progress}`
}

/** Combine backend state with the learner's own unlock choices. */
export function toNodeViews(
  nodes: ProgressionNode[],
  overrides: ReadonlySet<string>,
): ProgressionNodeView[] {
  return nodes.map((node) => {
    const openByProgress = isNodeOpenByProgress(node)
    const isOverridden = !openByProgress && overrides.has(node.node_id)
    return {
      ...node,
      isOpen: openByProgress || isOverridden,
      isOverridden,
      destination: NODE_DESTINATIONS[node.node_id] ?? { kind: 'none' },
      progressLabel: progressLabelFor(node),
    }
  })
}

/**
 * The node the learner is furthest along in — where the map should draw focus.
 *
 * The first node that is open but not yet mastered; failing that, the last
 * mastered one, so a finished course still highlights something.
 */
export function currentNode(views: ProgressionNodeView[]): ProgressionNodeView | null {
  const inProgress = views.find((view) => view.isOpen && view.status !== 'mastered')
  if (inProgress) return inProgress
  const mastered = views.filter((view) => view.status === 'mastered')
  return mastered.length > 0 ? mastered[mastered.length - 1] : null
}

/** Parse a persisted override list, tolerating anything that is not one. */
export function parseOverrides(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}
