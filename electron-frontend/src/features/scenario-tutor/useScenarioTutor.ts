import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createSession,
  hintsForCurrentNode,
  revealHint as engineRevealHint,
  submitLearnerResponse as engineSubmitLearnerResponse,
} from './engine'
import { evaluateResponse, toEvaluationResult } from './evaluation'
import { createScenarioAiEvaluator, toAiEvaluationResult } from './aiEvaluator'
import { deriveScenarioSummary, generateSrsDrafts } from './utils'
import { SCENARIO_COPY, SCENARIO_MIC_MAX_DURATION_MS, SCENARIO_STT_MIN_CONFIDENCE, SCENARIO_TTS_SPEED_SCALE } from './constants'
import { getScenarioById, SCENARIOS } from '../../lib/scenarios'
import { useMicRecorder } from '../../hooks/useMicRecorder'
import { blobToBase64, normalizeSpeechMimeType } from '../../lib/audioEncoding'
import type { MicRecorderErrorReason, MicRecorderState } from '../../hooks/useMicRecorder'
import type {
  AiEvaluationRequest,
  AiEvaluationResult,
  EvaluationResult,
  ExpectedIntent,
  LearnerLevel,
  NpcLine,
  ScenarioActivityScreen,
  ScenarioAiEvaluator,
  ScenarioConfirmAction,
  ScenarioDefinition,
  ScenarioEngineEffect,
  ScenarioHint,
  ScenarioHistoryEntry,
  ScenarioSession,
  ScenarioSummary,
  ScenarioTranscription,
  ScenarioTurnRecord,
  SrsDraftState,
  UseScenarioTutorOptions,
} from './types'

export interface UseScenarioTutorReturn {
  scenarios: ScenarioDefinition[]
  screen: ScenarioActivityScreen
  selectedScenario: ScenarioDefinition | null
  selectedLevel: LearnerLevel | null
  session: ScenarioSession | null
  summary: ScenarioSummary | null
  learnerInputValue: string
  confirmAction: ScenarioConfirmAction
  error: string | null
  persistenceNote: string | null

  selectScenario: (scenarioId: string) => void
  selectLevel: (level: LearnerLevel) => void
  startScenario: () => void
  setLearnerInputValue: (value: string) => void
  submitResponse: () => void
  requestAbandon: () => void
  requestRestart: () => void
  confirmPendingAction: () => void
  cancelPendingAction: () => void
  replayScenario: () => void
  returnToSelect: () => void

  // SRS draft review (Phase 5)
  srsDrafts: SrsDraftState[]
  srsReviewError: string | null
  goToSrsReview: () => void
  editSrsDraft: (id: string, changes: Partial<Pick<SrsDraftState, 'front' | 'back' | 'reading' | 'notes'>>) => void
  acceptSrsDraft: (id: string) => void
  dismissSrsDraft: (id: string) => void
  skipAllSrsDrafts: () => void

  // Completed-session history (Phase 5)
  historyEntries: ScenarioHistoryEntry[] | null
  historyLoading: boolean
  historyError: string | null
  openHistory: () => void
  closeHistory: () => void
  deleteHistoryEntry: (id: string) => void
  clearHistory: () => void

  // Voice (Phase 6) — every field below is additive: the scenario is fully
  // playable with none of it available.
  npcAudioAvailable: boolean
  npcSpeaking: boolean
  replayNpcLine: (line: NpcLine) => void
  speechInputAvailable: boolean
  micState: MicRecorderState
  micErrorReason: MicRecorderErrorReason | null
  micElapsedMs: number
  micMaxDurationMs: number
  sttError: string | null
  heardTranscript: string | null
  startRecording: () => void
  stopRecording: () => void
  cancelRecording: () => void

  // Optional local-AI evaluation (Phase 7)
  aiEvaluationActive: boolean
  evaluatingResponse: boolean

  /** Authored hint ladder for the turn in progress, and the deepest step the
   * learner has revealed. Revealing costs nothing — no attempt, no state
   * change beyond the hint level itself. */
  currentHints: ScenarioHint[]
  revealHint: () => void
}

/** Session identity captured when an async voice operation starts. The result
 * is applied only while both halves still match: the session token changes on
 * abandon/restart, the turn epoch on every submitted turn. Back to menu, mode
 * switches, and closing the popup change neither, so work started before them
 * still lands on the preserved session. */
interface TurnGuard {
  sessionToken: number
  turnEpoch: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function newSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function currentLearnerNodeExpectation(scenario: ScenarioDefinition, session: ScenarioSession) {
  const node = scenario.nodes[session.currentNodeId]
  if (!node || node.kind !== 'learner') return null
  return { intents: node.intents, cancelIntent: node.cancelIntent }
}

/** Builds the single-turn context handed to a local model. Deliberately
 * minimal: the current NPC line, the authored intent list, the required slot
 * ids, and the learner's own words. No transcript, no node ids, no memory. */
function buildAiEvaluationRequest(
  scenario: ScenarioDefinition,
  session: ScenarioSession,
  expectation: { intents: ExpectedIntent[]; cancelIntent?: ExpectedIntent },
  learnerResponse: string,
): AiEvaluationRequest {
  const node = scenario.nodes[session.currentNodeId]
  const lastNpcLine = [...session.transcript].reverse().find((turn) => turn.npcLine !== null)?.npcLine
  const objectiveIds = node && node.kind === 'learner' ? node.objectiveIds : []
  const objectiveDescription = scenario.objectives
    .filter((objective) => objectiveIds.includes(objective.id))
    .map((objective) => objective.label)
    .join('; ')
  const requiredSlotIds = new Set<string>()
  for (const intent of expectation.intents) {
    for (const slot of intent.slots ?? []) {
      if (slot.required) requiredSlotIds.add(slot.id)
    }
  }
  return {
    scenarioTitle: scenario.title,
    npcLine: lastNpcLine?.ja ?? '',
    objectiveDescription,
    expectedIntents: expectation.intents.map((intent) => ({
      id: intent.id,
      description: intent.description,
      examplePhrases: intent.acceptedPhrases.slice(0, 3).map((phrase) => phrase.ja),
    })),
    requiredSlotIds: [...requiredSlotIds],
    learnerResponse,
    learnerLevel: session.level,
  }
}

/**
 * Orchestration hook for the Scenario Practice activity: screen/session
 * lifecycle, learner-turn submission, explicit abandon/restart with
 * confirmation, completed-session persistence, SRS draft review, and
 * session history. All learning logic (branching, evaluation, completion)
 * lives in engine.ts/evaluation.ts — this hook only sequences calls into
 * them, talks to window.jplearnDesktop.* directly (the repo's IPC pattern),
 * and holds UI-facing state. Voice (TTS playback + mic/STT) is injected by
 * App.tsx and is entirely optional — every audio failure leaves the typed
 * path untouched. AI evaluation is added in a later phase.
 */
export function useScenarioTutor({
  voice,
  audioEnabled = true,
  aiEvaluationEnabled = true,
  aiEvaluator,
}: UseScenarioTutorOptions = {}): UseScenarioTutorReturn {
  const [screen, setScreen] = useState<ScenarioActivityScreen>('select')
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [selectedLevel, setSelectedLevel] = useState<LearnerLevel | null>(null)
  const [session, setSession] = useState<ScenarioSession | null>(null)
  const [learnerInputValue, setLearnerInputValue] = useState('')
  const [confirmAction, setConfirmAction] = useState<ScenarioConfirmAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [persistenceNote, setPersistenceNote] = useState<string | null>(null)

  const [srsDrafts, setSrsDrafts] = useState<SrsDraftState[]>([])
  const [srsReviewError, setSrsReviewError] = useState<string | null>(null)

  const [historyEntries, setHistoryEntries] = useState<ScenarioHistoryEntry[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [evaluatingResponse, setEvaluatingResponse] = useState(false)
  const [npcSpeaking, setNpcSpeaking] = useState(false)
  const [speechRuntimeAvailable, setSpeechRuntimeAvailable] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const [heardTranscript, setHeardTranscript] = useState<string | null>(null)

  // Bumped on explicit abandon/restart so in-flight async work (persistence,
  // STT, AI) started against a superseded session can detect it's stale and
  // drop its result instead of applying it.
  // Back/mode-switch/close do NOT bump this — the session is preserved.
  const sessionTokenRef = useRef(0)
  // Bumped on every submitted turn: a transcription for the turn the learner
  // has already moved past must never overwrite the current input.
  const turnEpochRef = useRef(0)
  const historyRequestTokenRef = useRef(0)
  // Null while no recording is in flight, or after an explicit cancel — a
  // recorder that still delivers its buffer afterwards is discarded.
  const recordingGuardRef = useRef<TurnGuard | null>(null)
  // Set only from a transcription that passed the confidence pre-gate. The
  // turn counts as spoken input while the learner submits it unedited.
  const lastTranscriptionRef = useRef<ScenarioTranscription | null>(null)

  // Aborts an in-flight model judgement when the session it belongs to is
  // abandoned, restarted, or left.
  const aiAbortRef = useRef<AbortController | null>(null)

  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const audioEnabledRef = useRef(audioEnabled)
  audioEnabledRef.current = audioEnabled
  const aiEvaluationEnabledRef = useRef(aiEvaluationEnabled)
  aiEvaluationEnabledRef.current = aiEvaluationEnabled
  const defaultAiEvaluatorRef = useRef<ScenarioAiEvaluator | null>(null)
  if (!defaultAiEvaluatorRef.current) {
    defaultAiEvaluatorRef.current = createScenarioAiEvaluator()
  }
  const aiEvaluatorRef = useRef<ScenarioAiEvaluator>(aiEvaluator ?? defaultAiEvaluatorRef.current)
  aiEvaluatorRef.current = aiEvaluator ?? defaultAiEvaluatorRef.current

  const isGuardCurrent = useCallback((guard: TurnGuard | null): boolean => (
    guard !== null && guard.sessionToken === sessionTokenRef.current && guard.turnEpoch === turnEpochRef.current
  ), [])

  const selectedScenario = useMemo(
    () => (selectedScenarioId ? getScenarioById(selectedScenarioId) ?? null : null),
    [selectedScenarioId],
  )

  const summary = useMemo(() => {
    if (!selectedScenario || !session || session.status === 'active') return null
    return deriveScenarioSummary(selectedScenario, session.transcript, session.objectiveStatus)
  }, [selectedScenario, session])

  // --- Voice: NPC playback -------------------------------------------------
  // Text is always rendered by ScenarioPlayer; audio is decoration. A failed
  // or unavailable playback returns false and is ignored — it can never block
  // or alter progression.

  const npcAudioAvailable = Boolean(voice) && audioEnabled && !voice?.voiceUnavailable

  // Whether an uncertain response may be sent to a local model at all. Says
  // nothing about a model being installed — the runtime answers ok:false when
  // there isn't one, which lands on the same authored recovery.
  const aiEvaluationActive = aiEvaluationEnabled && typeof window.jplearnDesktop?.evaluateScenarioResponse === 'function'

  const speakLines = useCallback((lines: NpcLine[], level: LearnerLevel) => {
    const activeVoice = voiceRef.current
    if (!activeVoice || !audioEnabledRef.current || activeVoice.voiceUnavailable || lines.length === 0) return
    // One shared audio channel with tutor chat: taking the run id cancels
    // whatever was speaking before.
    const runId = activeVoice.assistantSpeechRunIdRef.current + 1
    activeVoice.assistantSpeechRunIdRef.current = runId
    const sessionToken = sessionTokenRef.current
    setNpcSpeaking(true)
    void (async () => {
      try {
        for (const line of lines) {
          if (activeVoice.assistantSpeechRunIdRef.current !== runId) return
          if (sessionTokenRef.current !== sessionToken) return
          await activeVoice.playVoiceRuntimeAudio(line.ja, runId, SCENARIO_TTS_SPEED_SCALE[level])
        }
      } catch {
        // Playback problems are cosmetic: the line is already on screen and
        // the learner's turn is unaffected.
      } finally {
        if (activeVoice.assistantSpeechRunIdRef.current === runId) setNpcSpeaking(false)
      }
    })()
  }, [])

  const speakEffects = useCallback((effects: ScenarioEngineEffect[], level: LearnerLevel) => {
    speakLines(
      effects.flatMap((effect) => (effect.type === 'speak-npc-line' ? [effect.line] : [])),
      level,
    )
  }, [speakLines])

  const replayNpcLine = useCallback((line: NpcLine) => {
    speakLines([line], session?.level ?? selectedLevel ?? 'beginner')
  }, [speakLines, session?.level, selectedLevel])

  // --- Voice: mic + speech-to-text -----------------------------------------

  const micResetRef = useRef<() => void>(() => {})

  useEffect(() => {
    const getSpeechStatus = window.jplearnDesktop?.getSpeechStatus
    if (!window.jplearnDesktop?.transcribeSpeech || !getSpeechStatus) return
    let disposed = false
    void (async () => {
      try {
        const status = await getSpeechStatus()
        if (!disposed) setSpeechRuntimeAvailable(Boolean(status?.available))
      } catch {
        if (!disposed) setSpeechRuntimeAvailable(false)
      }
    })()
    return () => { disposed = true }
  }, [])

  const handleRecordingComplete = useCallback(async ({ blob, mimeType }: { blob: Blob; mimeType: string }) => {
    const guard = recordingGuardRef.current
    recordingGuardRef.current = null
    if (!guard) return // recording was cancelled — the buffer is discarded unused
    const transcribe = window.jplearnDesktop?.transcribeSpeech
    if (!transcribe) {
      if (isGuardCurrent(guard)) setSttError(SCENARIO_COPY.sttUnavailable)
      micResetRef.current()
      return
    }
    try {
      const audioBase64 = await blobToBase64(blob)
      const result = await transcribe({
        audioBase64,
        mimeType: normalizeSpeechMimeType(mimeType),
        language: 'ja',
      })
      if (!isGuardCurrent(guard)) return // abandoned/restarted or a newer turn began
      const text = typeof result?.text === 'string' ? result.text.trim() : ''
      const confidence = typeof result?.confidence === 'number' ? result.confidence : 0
      if (!text || confidence < SCENARIO_STT_MIN_CONFIDENCE) {
        // Unusable transcription is never graded, so the node's attempt
        // counter is untouched — the learner simply tries again or types.
        lastTranscriptionRef.current = null
        setHeardTranscript(null)
        setSttError(SCENARIO_COPY.sttUnusable)
        return
      }
      lastTranscriptionRef.current = { text, confidence }
      setHeardTranscript(text)
      setSttError(null)
      setLearnerInputValue(text)
    } catch (transcribeError) {
      if (!isGuardCurrent(guard)) return
      const detail = transcribeError instanceof Error ? transcribeError.message : 'Speech recognition failed.'
      setSttError(`${detail} ${SCENARIO_COPY.sttFallbackSuffix}`)
    } finally {
      micResetRef.current()
    }
  }, [isGuardCurrent])

  const {
    state: micState,
    errorReason: micErrorReason,
    elapsedMs: micElapsedMs,
    start: micStart,
    stop: micStop,
    reset: micReset,
  } = useMicRecorder({
    maxDurationMs: SCENARIO_MIC_MAX_DURATION_MS,
    onComplete: (result) => { void handleRecordingComplete(result) },
  })
  micResetRef.current = micReset

  /** Drops every piece of in-flight turn work: recording, transcription,
   * NPC playback, and any model judgement. Called only on the destructive
   * paths (start, abandon, restart, leave) — never on Back, mode switch, or
   * closing the popup, which preserve the session. */
  const resetTurnAsyncState = useCallback(() => {
    recordingGuardRef.current = null
    lastTranscriptionRef.current = null
    setSttError(null)
    setHeardTranscript(null)
    setNpcSpeaking(false)
    setEvaluatingResponse(false)
    voiceRef.current?.cancelAssistantSpeech()
    micResetRef.current()
    if (aiAbortRef.current) {
      aiAbortRef.current.abort()
      aiAbortRef.current = null
      // Free the runtime's single-flight lease as well, so the next turn
      // isn't refused because a superseded judgement still holds it.
      void window.jplearnDesktop?.cancelAssistantChatInference?.().catch(() => {})
    }
  }, [])

  const startRecording = useCallback(() => {
    setSttError(null)
    setHeardTranscript(null)
    lastTranscriptionRef.current = null
    recordingGuardRef.current = { sessionToken: sessionTokenRef.current, turnEpoch: turnEpochRef.current }
    voiceRef.current?.cancelAssistantSpeech()
    setNpcSpeaking(false)
    void micStart()
  }, [micStart])

  const stopRecording = useCallback(() => {
    micStop()
  }, [micStop])

  const cancelRecording = useCallback(() => {
    recordingGuardRef.current = null
    setSttError(null)
    setHeardTranscript(null)
    micReset()
  }, [micReset])

  const persistCompletedSession = useCallback(async (
    scenario: ScenarioDefinition,
    completedSession: ScenarioSession,
    summaryValue: ScenarioSummary,
    token: number,
  ) => {
    const save = window.jplearnDesktop?.saveScenarioSession
    if (!save) {
      if (sessionTokenRef.current === token) {
        setPersistenceNote('Scenario history is unavailable in this build — this session was not saved.')
      }
      return
    }
    try {
      await save({
        sessionId: completedSession.sessionId,
        scenarioId: completedSession.scenarioId,
        scenarioVersion: completedSession.scenarioVersion,
        learnerLevel: completedSession.level,
        startedAtUtc: completedSession.startedAtUtc,
        transcript: completedSession.transcript as unknown[],
        summary: summaryValue as unknown as Record<string, unknown>,
      })
      if (sessionTokenRef.current !== token) return // superseded by abandon/restart while saving
      setPersistenceNote(null)
      const drafts = generateSrsDrafts(scenario, completedSession.transcript)
      setSrsDrafts(drafts.map((draft) => ({ ...draft, status: 'pending' as const })))
    } catch (saveError) {
      if (sessionTokenRef.current !== token) return
      const detail = saveError instanceof Error ? saveError.message : 'Unknown error'
      setPersistenceNote(`This session could not be saved (${detail}), so no SRS drafts are available for it.`)
      setSrsDrafts([])
    }
  }, [])

  const selectScenario = useCallback((scenarioId: string) => {
    const scenario = getScenarioById(scenarioId)
    if (!scenario) {
      setError(`Unknown scenario '${scenarioId}'.`)
      return
    }
    setError(null)
    setSelectedScenarioId(scenarioId)
    setSelectedLevel(null)
    setScreen('intro')
  }, [])

  const selectLevel = useCallback((level: LearnerLevel) => {
    setSelectedLevel(level)
  }, [])

  const beginSession = useCallback((scenario: ScenarioDefinition, level: LearnerLevel) => {
    sessionTokenRef.current += 1
    turnEpochRef.current += 1
    resetTurnAsyncState()
    const { session: newSession, effects } = createSession(scenario, level, newSessionId(), nowIso())
    setSession(newSession)
    setLearnerInputValue('')
    setConfirmAction(null)
    setPersistenceNote(null)
    setSrsDrafts([])
    setSrsReviewError(null)
    setScreen('session')
    speakEffects(effects, level)
  }, [resetTurnAsyncState, speakEffects])

  const startScenario = useCallback(() => {
    if (!selectedScenario || !selectedLevel) return
    beginSession(selectedScenario, selectedLevel)
    if (aiEvaluationEnabledRef.current) {
      // Warm the local model so the first uncertain turn isn't paying for a
      // cold start. A failure here changes nothing — evaluation is optional.
      void window.jplearnDesktop?.preloadAssistantChatRuntime?.().catch(() => {})
    }
  }, [selectedScenario, selectedLevel, beginSession])

  /** Hands one finished evaluation to the engine and renders whatever it
   * decides. The engine is the only thing that picks a branch, so this is
   * identical whether the verdict came from the deterministic evaluator or
   * from a local model. */
  const applyTurn = useCallback((
    scenario: ScenarioDefinition,
    activeSession: ScenarioSession,
    input: string,
    inputSource: 'typed' | 'stt',
    evaluation: EvaluationResult,
  ) => {
    const { session: nextSession, effects } = engineSubmitLearnerResponse(
      scenario,
      activeSession,
      input,
      inputSource,
      evaluation,
      nowIso(),
    )

    setSession(nextSession)
    setLearnerInputValue('')
    speakEffects(effects, activeSession.level)

    if (effects.some((effect) => effect.type === 'complete-session')) {
      setScreen('summary')
      if (nextSession.status === 'success') {
        const summaryValue = deriveScenarioSummary(scenario, nextSession.transcript, nextSession.objectiveStatus)
        void persistCompletedSession(scenario, nextSession, summaryValue, sessionTokenRef.current)
      }
    }
  }, [persistCompletedSession, speakEffects])

  const submitResponse = useCallback(() => {
    if (!selectedScenario || !session || session.status !== 'active' || evaluatingResponse) return
    const input = learnerInputValue.trim()
    if (!input) return

    const expectation = currentLearnerNodeExpectation(selectedScenario, session)
    if (!expectation) return

    // A transcription the learner submitted unedited is graded as speech (so
    // the STT confidence informs evaluation and the transcript records how the
    // turn was produced); anything they retyped or edited is typed input.
    const transcription = lastTranscriptionRef.current
    const spoken = transcription !== null && transcription.text === input
    const inputSource = spoken ? 'stt' : 'typed'

    const deterministic = evaluateResponse(
      expectation,
      input,
      spoken ? { inputSource: 'stt', sttConfidence: transcription.confidence } : { inputSource: 'typed' },
    )
    const deterministicResult = toEvaluationResult(deterministic, expectation)

    // The turn is committed from here on: an STT result still in flight for it
    // is now stale and will be dropped when it resolves.
    turnEpochRef.current += 1
    lastTranscriptionRef.current = null
    setHeardTranscript(null)
    setSttError(null)

    const canAskAi = aiEvaluationEnabledRef.current
      && deterministic.tier === 'none'
      && deterministic.outcome === 'unclear'
      && typeof window.jplearnDesktop?.evaluateScenarioResponse === 'function'

    if (!canAskAi) {
      // Deterministic-only path — also exactly what happens with no model
      // installed, with the toggle off, or for any confidently-classified
      // response. Nothing here ever blocks on AI.
      applyTurn(selectedScenario, session, input, inputSource, deterministicResult)
      return
    }

    const guard: TurnGuard = { sessionToken: sessionTokenRef.current, turnEpoch: turnEpochRef.current }
    const controller = new AbortController()
    aiAbortRef.current = controller
    setEvaluatingResponse(true)
    setLearnerInputValue('')

    void (async () => {
      let verdict: AiEvaluationResult | null = null
      try {
        verdict = await aiEvaluatorRef.current.evaluate(
          buildAiEvaluationRequest(selectedScenario, session, expectation, input),
          controller.signal,
        )
      } catch {
        verdict = null
      }
      // Abandoned, restarted, or superseded while the model was thinking:
      // the verdict belongs to a session that no longer exists.
      if (!isGuardCurrent(guard)) return
      if (aiAbortRef.current === controller) aiAbortRef.current = null
      setEvaluatingResponse(false)
      // A null verdict — no model, timeout, abort, malformed or low-signal
      // output — leaves the deterministic 'unclear' in place, so the engine
      // runs its authored recovery line.
      const evaluation = verdict ? toAiEvaluationResult(verdict, expectation.intents) : deterministicResult
      applyTurn(selectedScenario, session, input, inputSource, evaluation)
    })()
  }, [selectedScenario, session, learnerInputValue, evaluatingResponse, applyTurn, isGuardCurrent])

  const requestAbandon = useCallback(() => setConfirmAction('abandon'), [])
  const requestRestart = useCallback(() => setConfirmAction('restart'), [])
  const cancelPendingAction = useCallback(() => setConfirmAction(null), [])

  const confirmPendingAction = useCallback(() => {
    if (confirmAction === 'abandon') {
      sessionTokenRef.current += 1
      turnEpochRef.current += 1
      resetTurnAsyncState()
      setSession(null)
      setLearnerInputValue('')
      setConfirmAction(null)
      setPersistenceNote(null)
      setSrsDrafts([])
      setScreen('select')
      return
    }
    if (confirmAction === 'restart' && selectedScenario && selectedLevel) {
      beginSession(selectedScenario, selectedLevel)
    }
  }, [confirmAction, selectedScenario, selectedLevel, beginSession, resetTurnAsyncState])

  const replayScenario = useCallback(() => {
    if (!selectedScenario || !selectedLevel) return
    beginSession(selectedScenario, selectedLevel)
  }, [selectedScenario, selectedLevel, beginSession])

  const returnToSelect = useCallback(() => {
    sessionTokenRef.current += 1
    turnEpochRef.current += 1
    resetTurnAsyncState()
    setSelectedScenarioId(null)
    setSelectedLevel(null)
    setSession(null)
    setLearnerInputValue('')
    setConfirmAction(null)
    setError(null)
    setPersistenceNote(null)
    setSrsDrafts([])
    setSrsReviewError(null)
    setScreen('select')
  }, [resetTurnAsyncState])

  const currentHints = useMemo(
    () => (selectedScenario && session ? hintsForCurrentNode(selectedScenario, session) : []),
    [selectedScenario, session],
  )

  const revealHint = useCallback(() => {
    if (!selectedScenario || !session || session.status !== 'active') return
    setSession((previous) => (previous ? engineRevealHint(selectedScenario, previous) : previous))
  }, [selectedScenario, session])

  const goToSrsReview = useCallback(() => setScreen('srs-review'), [])

  const editSrsDraft = useCallback((id: string, changes: Partial<Pick<SrsDraftState, 'front' | 'back' | 'reading' | 'notes'>>) => {
    setSrsDrafts((previous) => previous.map((draft) => (
      draft.id === id && draft.status === 'pending' ? { ...draft, ...changes } : draft
    )))
  }, [])

  const acceptSrsDraft = useCallback((id: string) => {
    const draft = srsDrafts.find((entry) => entry.id === id)
    if (!draft || draft.status !== 'pending' || !session || !selectedScenario) return
    const save = window.jplearnDesktop?.saveScenarioSrsCard
    if (!save) {
      setSrsReviewError('SRS drafts are unavailable in this build.')
      return
    }
    const token = sessionTokenRef.current
    const { sessionId } = session
    const scenarioId = selectedScenario.id
    void (async () => {
      try {
        await save({
          id: `${sessionId}-${draft.id}`.slice(0, 64),
          sessionId,
          scenarioId,
          front: draft.front,
          back: draft.back,
          reading: draft.reading,
          notes: draft.notes,
        })
        if (sessionTokenRef.current !== token) return
        setSrsReviewError(null)
        setSrsDrafts((previous) => previous.map((entry) => (entry.id === id ? { ...entry, status: 'accepted' as const } : entry)))
      } catch (saveError) {
        if (sessionTokenRef.current !== token) return
        setSrsReviewError(saveError instanceof Error ? saveError.message : 'Failed to save this SRS draft.')
      }
    })()
  }, [srsDrafts, session, selectedScenario])

  const dismissSrsDraft = useCallback((id: string) => {
    setSrsDrafts((previous) => previous.map((draft) => (draft.id === id ? { ...draft, status: 'dismissed' as const } : draft)))
  }, [])

  const skipAllSrsDrafts = useCallback(() => {
    setSrsDrafts((previous) => previous.map((draft) => (draft.status === 'pending' ? { ...draft, status: 'dismissed' as const } : draft)))
  }, [])

  const loadHistory = useCallback(async () => {
    const list = window.jplearnDesktop?.listScenarioSessions
    const token = ++historyRequestTokenRef.current
    if (!list) {
      setHistoryError('Scenario history is unavailable in this build.')
      setHistoryEntries([])
      return
    }
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const response = await list()
      if (historyRequestTokenRef.current !== token) return
      const entries: ScenarioHistoryEntry[] = response.sessions.map((entry) => ({
        id: entry.id,
        scenarioId: entry.scenario_id,
        scenarioTitle: getScenarioById(entry.scenario_id)?.title ?? entry.scenario_id,
        learnerLevel: entry.learner_level as LearnerLevel,
        completedAtUtc: entry.completed_at_utc,
        summary: entry.summary as unknown as ScenarioSummary,
        transcript: entry.transcript as unknown as ScenarioTurnRecord[],
      }))
      setHistoryEntries(entries)
    } catch (loadError) {
      if (historyRequestTokenRef.current !== token) return
      setHistoryError(loadError instanceof Error ? loadError.message : 'Failed to load scenario history.')
      setHistoryEntries([])
    } finally {
      if (historyRequestTokenRef.current === token) setHistoryLoading(false)
    }
  }, [])

  const openHistory = useCallback(() => {
    setScreen('history')
    void loadHistory()
  }, [loadHistory])

  const closeHistory = useCallback(() => setScreen('select'), [])

  const deleteHistoryEntry = useCallback((id: string) => {
    const del = window.jplearnDesktop?.deleteScenarioSession
    if (!del) return
    void (async () => {
      try {
        await del(id)
        setHistoryEntries((previous) => (previous ? previous.filter((entry) => entry.id !== id) : previous))
      } catch (deleteError) {
        setHistoryError(deleteError instanceof Error ? deleteError.message : 'Failed to delete this session.')
      }
    })()
  }, [])

  const clearHistory = useCallback(() => {
    const clear = window.jplearnDesktop?.clearScenarioSessions
    if (!clear) return
    void (async () => {
      try {
        await clear()
        setHistoryEntries([])
      } catch (clearError) {
        setHistoryError(clearError instanceof Error ? clearError.message : 'Failed to clear scenario history.')
      }
    })()
  }, [])

  return {
    scenarios: SCENARIOS,
    screen,
    selectedScenario,
    selectedLevel,
    session,
    summary,
    learnerInputValue,
    confirmAction,
    error,
    persistenceNote,

    selectScenario,
    selectLevel,
    startScenario,
    setLearnerInputValue,
    submitResponse,
    requestAbandon,
    requestRestart,
    confirmPendingAction,
    cancelPendingAction,
    replayScenario,
    returnToSelect,

    srsDrafts,
    srsReviewError,
    goToSrsReview,
    editSrsDraft,
    acceptSrsDraft,
    dismissSrsDraft,
    skipAllSrsDrafts,

    historyEntries,
    historyLoading,
    historyError,
    openHistory,
    closeHistory,
    deleteHistoryEntry,
    clearHistory,

    npcAudioAvailable,
    npcSpeaking,
    replayNpcLine,
    speechInputAvailable: speechRuntimeAvailable,
    micState,
    micErrorReason,
    micElapsedMs,
    micMaxDurationMs: SCENARIO_MIC_MAX_DURATION_MS,
    sttError,
    heardTranscript,
    startRecording,
    stopRecording,
    cancelRecording,

    aiEvaluationActive,
    evaluatingResponse,

    currentHints,
    revealHint,
  }
}
