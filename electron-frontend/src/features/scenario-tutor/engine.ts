import type {
  EvaluationResult,
  LearnerLevel,
  NpcLine,
  ObjectiveStatus,
  ScenarioAdvanceResult,
  ScenarioDefinition,
  ScenarioEngineEffect,
  ScenarioHint,
  ScenarioNode,
  ScenarioSession,
  ScenarioTurnRecord,
} from './types'

function resolveNode(scenario: ScenarioDefinition, nodeId: string): ScenarioNode {
  const node = scenario.nodes[nodeId]
  if (!node) throw new Error(`Scenario '${scenario.id}' has no node '${nodeId}'`)
  return node
}

function fallbackAdvanceTarget(node: Extract<ScenarioNode, { kind: 'learner' }>): string {
  const target = node.recovery.fallbackAdvance.advanceNodeId ?? node.intents[0]?.branch.correct
  if (!target) throw new Error(`Learner node '${node.id}' has no resolvable fallback advance target`)
  return target
}

/** A mutable working copy of a ScenarioSession, used internally while advancing. */
type SessionDraft = ScenarioSession & {
  transcript: ScenarioTurnRecord[]
  attempts: Record<string, number>
  hintLevels: Record<string, number>
  objectiveStatus: Record<string, ObjectiveStatus>
}

function draftOf(session: ScenarioSession): SessionDraft {
  return {
    ...session,
    transcript: [...session.transcript],
    attempts: { ...session.attempts },
    hintLevels: { ...session.hintLevels },
    objectiveStatus: { ...session.objectiveStatus },
  }
}

interface AssistedAnswer {
  answer: string
  reading?: string
  romaji?: string
}

function pushNpcTurn(draft: SessionDraft, line: NpcLine, nowIso: string, assist?: AssistedAnswer): void {
  draft.transcript.push({
    turnIndex: draft.transcript.length,
    nodeId: draft.currentNodeId,
    npcLine: line,
    learnerInput: null,
    inputSource: null,
    outcome: null,
    matchedIntentId: null,
    correction: null,
    correctionReading: null,
    correctionRomaji: null,
    hintLevel: 0,
    mistakeId: null,
    assisted: false,
    assistedAnswer: assist?.answer ?? null,
    assistedAnswerReading: assist?.reading ?? null,
    assistedAnswerRomaji: assist?.romaji ?? null,
    createdAtUtc: nowIso,
  })
}

interface LearnerTurnInput {
  nodeId: string
  learnerInput: string | null
  inputSource: ScenarioTurnRecord['inputSource']
  outcome: ScenarioTurnRecord['outcome']
  matchedIntentId: string | null
  correction: string | null
  correctionReading: string | null
  correctionRomaji: string | null
  mistakeId: string | null
  hintLevel: number
  assisted: boolean
}

function pushLearnerTurn(draft: SessionDraft, input: LearnerTurnInput, nowIso: string): void {
  draft.transcript.push({
    turnIndex: draft.transcript.length,
    npcLine: null,
    assistedAnswer: null,
    assistedAnswerReading: null,
    assistedAnswerRomaji: null,
    createdAtUtc: nowIso,
    ...input,
  })
}

/**
 * Advances the draft session forward from `startNodeId` through any number
 * of consecutive NPC nodes, pushing an npc transcript turn (and a
 * speak-npc-line effect) for each, until it reaches a LearnerNode (session
 * stops there, awaiting the next response) or an EndNode (session completes).
 * This is the engine's only traversal logic — the sole authority over which
 * node the conversation is in.
 */
function autoAdvance(
  scenario: ScenarioDefinition,
  draft: SessionDraft,
  startNodeId: string,
  level: LearnerLevel,
  nowIso: string,
  effects: ScenarioEngineEffect[],
): void {
  let currentId = startNodeId
  // Cap traversal to guard against an authoring error creating a cycle of
  // NPC-only nodes (validateScenarioDefinition should catch this earlier).
  const maxSteps = Object.keys(scenario.nodes).length * 4 + 10
  for (let guard = 0; guard < maxSteps; guard += 1) {
    const node = resolveNode(scenario, currentId)
    if (node.kind === 'npc') {
      draft.currentNodeId = node.id
      const npcLine = node.line[level]
      pushNpcTurn(draft, npcLine, nowIso)
      effects.push({ type: 'speak-npc-line', line: npcLine })
      currentId = node.next
      continue
    }
    if (node.kind === 'end') {
      draft.currentNodeId = node.id
      draft.status = node.outcome
      draft.completedAtUtc = nowIso
      if (node.closingLine) {
        const closingLine = node.closingLine[level]
        pushNpcTurn(draft, closingLine, nowIso)
        effects.push({ type: 'speak-npc-line', line: closingLine })
      }
      effects.push({ type: 'complete-session', outcome: node.outcome })
      return
    }
    // LearnerNode: stop here and await the next response.
    draft.currentNodeId = node.id
    return
  }
}

export function createSession(
  scenario: ScenarioDefinition,
  level: LearnerLevel,
  sessionId: string,
  nowIso: string,
): ScenarioAdvanceResult {
  const draft: SessionDraft = {
    sessionId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    level,
    currentNodeId: scenario.startNodeId,
    status: 'active',
    attempts: {},
    hintLevels: {},
    objectiveStatus: {},
    transcript: [],
    startedAtUtc: nowIso,
    completedAtUtc: null,
  }
  const effects: ScenarioEngineEffect[] = []
  autoAdvance(scenario, draft, scenario.startNodeId, level, nowIso, effects)
  return { session: draft, effects }
}

/**
 * Reveals the next authored hint for the node the session is parked on.
 * Pure, like everything else here: it only moves the node's hint level up the
 * authored ladder (never past the last step) and never touches attempts,
 * objectives, or the current node — asking for help is not a wrong answer.
 * Returns the session unchanged when there is nothing more to reveal.
 */
export function revealHint(scenario: ScenarioDefinition, session: ScenarioSession): ScenarioSession {
  const node = resolveNode(scenario, session.currentNodeId)
  if (node.kind !== 'learner') return session
  const ladder = node.hints[session.level]
  if (!ladder || ladder.length === 0) return session

  const current = session.hintLevels[node.id]
  const next = current === undefined ? 0 : Math.min(current + 1, ladder.length - 1)
  if (current === next) return session
  return { ...session, hintLevels: { ...session.hintLevels, [node.id]: next } }
}

/** The hint ladder for the node the session is parked on (empty off a learner node). */
export function hintsForCurrentNode(scenario: ScenarioDefinition, session: ScenarioSession): ScenarioHint[] {
  const node = scenario.nodes[session.currentNodeId]
  if (!node || node.kind !== 'learner') return []
  return node.hints[session.level] ?? []
}

/**
 * Advances the session in response to one learner turn. `evaluation` may
 * come from the deterministic evaluator or (only when deterministic
 * evaluation was uncertain) the optional AI evaluator — the engine cannot
 * tell which, and it doesn't matter: it only ever maps outcome +
 * matchedIntentId onto authored branches it already knows about. This is
 * the sole authority over node progression and completion; nothing else in
 * the codebase may branch scenario state.
 *
 * Everything the learner needs to see about a turn (the NPC's recovery line,
 * a partial answer's correction, the fallback model answer) is written
 * directly onto the ScenarioTurnRecord pushed here — there is no separate
 * transient "feedback" channel. The transcript is the only place this
 * information lives, so nothing is ever shown twice.
 */
export function submitLearnerResponse(
  scenario: ScenarioDefinition,
  session: ScenarioSession,
  rawInput: string,
  inputSource: ScenarioTurnRecord['inputSource'],
  evaluation: EvaluationResult,
  nowIso: string,
): ScenarioAdvanceResult {
  const node = resolveNode(scenario, session.currentNodeId)
  if (node.kind !== 'learner') {
    throw new Error(`Cannot submit a learner response while session is at non-learner node '${node.id}'`)
  }

  const draft = draftOf(session)
  const effects: ScenarioEngineEffect[] = []
  const nodeId = node.id

  const isCancel = node.cancelIntent && evaluation.matchedIntentId === node.cancelIntent.id
  const matchedIntent = isCancel
    ? node.cancelIntent
    : node.intents.find((intent) => intent.id === evaluation.matchedIntentId)

  if ((evaluation.outcome === 'correct' || evaluation.outcome === 'partial') && matchedIntent) {
    const target = evaluation.outcome === 'partial'
      ? (matchedIntent.branch.partial ?? matchedIntent.branch.correct)
      : matchedIntent.branch.correct

    const correction = evaluation.outcome === 'partial' ? (evaluation.correction ?? null) : null
    // A partial turn is understood but imperfect — the mistake pattern (when
    // there is one) carries the reading/romaji shown alongside the
    // correction so the learner can act on it without reading kana yet.
    const mistake = evaluation.outcome === 'partial'
      ? matchedIntent.commonMistakes?.find((entry) => entry.id === evaluation.mistakeId)
      : undefined

    pushLearnerTurn(draft, {
      nodeId,
      learnerInput: rawInput,
      inputSource,
      outcome: evaluation.outcome,
      matchedIntentId: matchedIntent.id,
      correction,
      correctionReading: mistake?.correctionReading ?? null,
      correctionRomaji: mistake?.correctionRomaji ?? null,
      mistakeId: evaluation.mistakeId,
      hintLevel: draft.hintLevels[nodeId] ?? 0,
      assisted: false,
    }, nowIso)

    if (!isCancel && evaluation.outcome === 'correct' && matchedIntent.satisfiesObjectives !== false) {
      for (const objectiveId of node.objectiveIds) {
        draft.objectiveStatus[objectiveId] = 'met'
      }
    }

    delete draft.attempts[nodeId]
    delete draft.hintLevels[nodeId]

    autoAdvance(scenario, draft, target, session.level, nowIso, effects)
    return { session: draft, effects }
  }

  // 'incorrect' or 'unclear' (including no matched intent at all): count the
  // attempt, show authored recovery, and — once maxAttempts is exhausted —
  // fall back to the authored model-answer advance so the scenario always
  // remains completable.
  const attempts = (draft.attempts[nodeId] ?? 0) + 1
  draft.attempts[nodeId] = attempts
  const hintLevel = Math.min(attempts - 1, node.hints[session.level].length - 1)
  draft.hintLevels[nodeId] = hintLevel

  pushLearnerTurn(draft, {
    nodeId,
    learnerInput: rawInput,
    inputSource,
    outcome: evaluation.outcome === 'incorrect' ? 'incorrect' : 'unclear',
    matchedIntentId: evaluation.matchedIntentId,
    correction: null,
    correctionReading: null,
    correctionRomaji: null,
    mistakeId: evaluation.mistakeId,
    hintLevel,
    assisted: false,
  }, nowIso)

  if (attempts >= node.recovery.maxAttempts) {
    const fallback = node.recovery.fallbackAdvance
    const fallbackLine = fallback.line[session.level]
    pushNpcTurn(draft, fallbackLine, nowIso, {
      answer: fallback.modelAnswer,
      reading: fallback.modelAnswerReading,
      romaji: fallback.modelAnswerRomaji,
    })
    effects.push({ type: 'speak-npc-line', line: fallbackLine })
    for (const objectiveId of node.objectiveIds) {
      if (draft.objectiveStatus[objectiveId] !== 'met') {
        draft.objectiveStatus[objectiveId] = 'assisted'
      }
    }
    delete draft.attempts[nodeId]
    delete draft.hintLevels[nodeId]
    autoAdvance(scenario, draft, fallbackAdvanceTarget(node), session.level, nowIso, effects)
    return { session: draft, effects }
  }

  const recoveryLine = evaluation.outcome === 'incorrect' ? node.recovery.onIncorrect[session.level] : node.recovery.onUnclear[session.level]
  pushNpcTurn(draft, recoveryLine, nowIso)
  effects.push({ type: 'speak-npc-line', line: recoveryLine })
  draft.currentNodeId = nodeId
  return { session: draft, effects }
}
