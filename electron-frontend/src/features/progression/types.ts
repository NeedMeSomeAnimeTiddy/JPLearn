import type { ProgressionNodeStatusPayload } from '../../generated/types'
import type { MinigameKey, ScriptKey } from '../../types'

/** Node status as the backend reports it, narrowed from the generated `string`. */
export type ProgressionNodeState = 'locked' | 'unlocked' | 'active' | 'mastered'

export interface ProgressionNode extends Omit<ProgressionNodeStatusPayload, 'status'> {
  status: ProgressionNodeState
}

/**
 * Where a node leads when opened.
 *
 * `script` covers the six studiable sections. The rest of the curriculum lives
 * behind existing entry points (JLPT prep, reading passages, the tutor panel),
 * so a node names one of those instead of a deck.
 */
export type NodeDestination =
  | { kind: 'script'; script: ScriptKey; minigame?: MinigameKey }
  | { kind: 'jlpt' }
  | { kind: 'passages' }
  | { kind: 'scenarios' }
  | { kind: 'tutor' }
  | { kind: 'none' }

/** A node plus everything the map needs to draw and act on it. */
export interface ProgressionNodeView extends ProgressionNode {
  /** Whether the learner may open it without confirming first. */
  isOpen: boolean
  /** True when the backend gate is closed but the learner opened it anyway. */
  isOverridden: boolean
  destination: NodeDestination
  /** `"91/104"`, or empty when the node reports no measurable progress. */
  progressLabel: string
}
