import type {
  EndNode,
  LearnerNode,
  NpcLine,
  NpcNode,
  ScenarioDefinition,
  ScenarioNode,
} from './types'

const LEVELS = ['beginner', 'intermediate'] as const

function levelRecordIssues(
  label: string,
  record: Record<string, NpcLine> | undefined,
): string[] {
  if (!record) return [`${label} is missing`]
  const issues: string[] = []
  for (const level of LEVELS) {
    const line = record[level]
    if (!line || !line.ja.trim() || !line.reading.trim() || !line.en.trim()) {
      issues.push(`${label} is missing a complete '${level}' variant`)
    }
  }
  return issues
}

function isLearnerNode(node: ScenarioNode): node is LearnerNode {
  return node.kind === 'learner'
}

function isNpcNode(node: ScenarioNode): node is NpcNode {
  return node.kind === 'npc'
}

function isEndNode(node: ScenarioNode): node is EndNode {
  return node.kind === 'end'
}

function fallbackAdvanceTarget(node: LearnerNode): string | undefined {
  return node.recovery.fallbackAdvance.advanceNodeId ?? node.intents[0]?.branch.correct
}

/** All forward edges out of a node, including recovery fallback advancement. */
function forwardEdges(node: ScenarioNode): string[] {
  if (isNpcNode(node)) return [node.next]
  if (isEndNode(node)) return []
  const targets = new Set<string>()
  for (const intent of node.intents) {
    targets.add(intent.branch.correct)
    if (intent.branch.partial) targets.add(intent.branch.partial)
  }
  if (node.cancelIntent) {
    targets.add(node.cancelIntent.branch.correct)
    if (node.cancelIntent.branch.partial) targets.add(node.cancelIntent.branch.partial)
  }
  const fallbackTarget = fallbackAdvanceTarget(node)
  if (fallbackTarget) targets.add(fallbackTarget)
  return [...targets]
}

/** Only the "everything went right" edges — used to prove a success path exists. */
function correctPathEdges(node: ScenarioNode): string[] {
  if (isNpcNode(node)) return [node.next]
  if (isEndNode(node)) return []
  return node.intents.map((intent) => intent.branch.correct)
}

function reachableFrom(
  nodes: Record<string, ScenarioNode>,
  startId: string,
  edgesOf: (node: ScenarioNode) => string[],
): Set<string> {
  const visited = new Set<string>()
  const stack = [startId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (visited.has(id) || !nodes[id]) continue
    visited.add(id)
    for (const next of edgesOf(nodes[id])) {
      if (!visited.has(next)) stack.push(next)
    }
  }
  return visited
}

/**
 * Structural validation for an authored ScenarioDefinition. Returns a list of
 * human-readable issues; an empty array means the definition is valid. Pure
 * and synchronous — safe to run in tests and as a dev-mode content assertion.
 */
export function validateScenarioDefinition(definition: ScenarioDefinition): string[] {
  const issues: string[] = []
  const { nodes, objectives, vocabulary, grammarPoints, srsCandidates } = definition

  if (!definition.id.trim()) issues.push('Scenario id is required')
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    issues.push('Scenario version must be a positive integer')
  }
  if (!nodes[definition.startNodeId]) {
    issues.push(`startNodeId '${definition.startNodeId}' does not exist in nodes`)
  }

  const objectiveIds = new Set(objectives.map((objective) => objective.id))
  const allMistakeIds = new Set<string>()
  const allNodeIds = Object.keys(nodes)

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.id !== nodeId) issues.push(`Node keyed '${nodeId}' has mismatched id '${node.id}'`)

    if (isNpcNode(node)) {
      issues.push(...levelRecordIssues(`NPC node '${nodeId}' line`, node.line))
      if (!nodes[node.next]) issues.push(`NPC node '${nodeId}'.next references missing node '${node.next}'`)
    } else if (isEndNode(node)) {
      if (node.outcome !== 'success' && node.outcome !== 'cancelled') {
        issues.push(`End node '${nodeId}' has invalid outcome '${node.outcome as string}'`)
      }
      if (node.closingLine) {
        issues.push(...levelRecordIssues(`End node '${nodeId}' closingLine`, node.closingLine))
      }
    } else if (isLearnerNode(node)) {
      if (node.intents.length === 0) {
        issues.push(`Learner node '${nodeId}' has no intents`)
      }
      for (const objectiveId of node.objectiveIds) {
        if (!objectiveIds.has(objectiveId)) {
          issues.push(`Learner node '${nodeId}' references unknown objective '${objectiveId}'`)
        }
      }
      const allIntents = [...node.intents, ...(node.cancelIntent ? [node.cancelIntent] : [])]
      for (const intent of allIntents) {
        if (intent.acceptedPhrases.length === 0) {
          issues.push(`Intent '${intent.id}' on node '${nodeId}' has no accepted phrases`)
        }
        if (!nodes[intent.branch.correct]) {
          issues.push(`Intent '${intent.id}' on node '${nodeId}' branch.correct references missing node '${intent.branch.correct}'`)
        }
        if (intent.branch.partial && !nodes[intent.branch.partial]) {
          issues.push(`Intent '${intent.id}' on node '${nodeId}' branch.partial references missing node '${intent.branch.partial}'`)
        }
        for (const slot of intent.slots ?? []) {
          if (slot.values.length === 0) {
            issues.push(`Slot '${slot.id}' on intent '${intent.id}' (node '${nodeId}') has no values`)
          }
          for (const value of slot.values) {
            if (value.forms.length === 0) {
              issues.push(`Slot value '${value.id}' on slot '${slot.id}' (node '${nodeId}') has no accepted forms`)
            }
          }
        }
        for (const mistake of intent.commonMistakes ?? []) {
          allMistakeIds.add(mistake.id)
          if (mistake.match.length === 0) {
            issues.push(`Mistake '${mistake.id}' on intent '${intent.id}' (node '${nodeId}') has no match phrases`)
          }
        }
      }
      for (const level of LEVELS) {
        const ladder = node.hints[level]
        if (!ladder || ladder.length === 0) {
          issues.push(`Learner node '${nodeId}' is missing hints for level '${level}'`)
          continue
        }
        ladder.forEach((hint, index) => {
          if (!hint.en.trim()) {
            issues.push(`Learner node '${nodeId}' hint ${index} (${level}) has no English instruction`)
          }
          // A hint that shows a Japanese example must always carry its romaji,
          // otherwise it is unusable for a learner who cannot read kana yet.
          if (hint.ja && !hint.romaji?.trim()) {
            issues.push(`Learner node '${nodeId}' hint ${index} (${level}) shows Japanese without romaji`)
          }
        })
        // Beginners must be able to reach a concrete model answer.
        if (level === 'beginner' && !ladder.some((hint) => Boolean(hint.ja))) {
          issues.push(`Learner node '${nodeId}' beginner hints never show an example answer`)
        }
      }
      if (node.recovery.maxAttempts < 1) {
        issues.push(`Learner node '${nodeId}' recovery.maxAttempts must be >= 1`)
      }
      issues.push(...levelRecordIssues(`Learner node '${nodeId}' recovery.onIncorrect`, node.recovery.onIncorrect))
      issues.push(...levelRecordIssues(`Learner node '${nodeId}' recovery.onUnclear`, node.recovery.onUnclear))
      issues.push(...levelRecordIssues(`Learner node '${nodeId}' recovery.fallbackAdvance.line`, node.recovery.fallbackAdvance.line))
      const fallbackTarget = fallbackAdvanceTarget(node)
      if (!fallbackTarget) {
        issues.push(`Learner node '${nodeId}' recovery.fallbackAdvance has no resolvable advance target (no advanceNodeId and no intents)`)
      } else if (!nodes[fallbackTarget]) {
        issues.push(`Learner node '${nodeId}' recovery.fallbackAdvance target '${fallbackTarget}' does not exist`)
      }
    }
  }

  for (const vocab of vocabulary) {
    for (const nodeId of vocab.nodeIds) {
      if (!nodes[nodeId]) issues.push(`Vocabulary item '${vocab.id}' references missing node '${nodeId}'`)
    }
  }
  for (const grammar of grammarPoints) {
    for (const nodeId of grammar.nodeIds) {
      if (!nodes[nodeId]) issues.push(`Grammar point '${grammar.id}' references missing node '${nodeId}'`)
    }
  }
  const vocabIds = new Set(vocabulary.map((item) => item.id))
  const grammarIds = new Set(grammarPoints.map((item) => item.id))
  for (const candidate of srsCandidates) {
    const { trigger } = candidate
    if (trigger.kind === 'vocabulary' && !vocabIds.has(trigger.vocabId)) {
      issues.push(`SRS candidate '${candidate.id}' references unknown vocabulary '${trigger.vocabId}'`)
    }
    if (trigger.kind === 'grammar' && !grammarIds.has(trigger.grammarId)) {
      issues.push(`SRS candidate '${candidate.id}' references unknown grammar point '${trigger.grammarId}'`)
    }
    if (trigger.kind === 'mistake' && !allMistakeIds.has(trigger.mistakeId)) {
      issues.push(`SRS candidate '${candidate.id}' references unknown mistake '${trigger.mistakeId}'`)
    }
  }

  if (nodes[definition.startNodeId]) {
    const fullyReachable = reachableFrom(nodes, definition.startNodeId, forwardEdges)
    for (const nodeId of allNodeIds) {
      if (!fullyReachable.has(nodeId)) {
        issues.push(`Node '${nodeId}' is orphaned (unreachable from startNodeId '${definition.startNodeId}')`)
      }
    }

    const successPathReachable = reachableFrom(nodes, definition.startNodeId, correctPathEdges)
    const hasSuccessEnd = [...successPathReachable].some((id) => {
      const node = nodes[id]
      return node && isEndNode(node) && node.outcome === 'success'
    })
    if (!hasSuccessEnd) {
      issues.push('No success EndNode is reachable from startNodeId using only correct branches')
    }

    for (const [nodeId, node] of Object.entries(nodes)) {
      if (!isLearnerNode(node)) continue
      const reachableFromNode = reachableFrom(nodes, nodeId, forwardEdges)
      const reachesEnd = [...reachableFromNode].some((id) => isEndNode(nodes[id]))
      if (!reachesEnd) {
        issues.push(`Learner node '${nodeId}' cannot reach any EndNode`)
      }
    }
  }

  return issues
}
