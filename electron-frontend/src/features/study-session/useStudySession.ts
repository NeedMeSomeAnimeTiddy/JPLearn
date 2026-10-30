/**
 * Owns the study-session state machine that `App.tsx` used to hold inline
 * (issue #69 phase 4b): the live round, session counters, lives, combo/streak,
 * confidence capture, the round queue cycle, explicit (missed-word) review, and
 * session persistence/resume.
 *
 * Everything it touches outside itself arrives through `StudySessionDeps`. In
 * particular `studyQueueCacheRef` deliberately stayed in App — it is owned by
 * deck loading, and this hook invalidates it through `invalidateStudyQueue`
 * rather than holding a second reference to the same cache.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DeckSlugInput,
  ExplicitReviewItem,
  FeedbackTone,
  InterleaveWeights,
  MinigameKey,
  PersistedSessionRestore,
  PlayableMinigame,
  RoundState,
  ScriptDeck,
  ScriptKey,
  SessionGoalStartResponse,
  SessionRunReport,
  SessionSummaryPayload,
  StudyQueueResponse,
} from '../../types'
import type { GameCard, DailyGamesMissedWordPayload } from '../../generated/types'
import type { HandwritingOutcome } from '../handwriting'
import {
  formatHandwritingAttemptValue,
  isHandwritingEligibleCharacter,
  isHandwritingOutcomeCorrect,
} from '../handwriting'
import type { StudySessionApi, StudySessionDeps, StudySessionSlice } from './types'
import { parseResumableSession, resumableTargetItems } from './persistedSession'
import type { PersistedStudySession } from './persistedSession'
import { assessConjugationAnswer, assessJapaneseAnswer, formatKanaSpellings } from '../../lib/answerAssessment'
import { buildConjugationPool } from './conjugationRound'
import { assessTypedRecallAnswer } from '../../lib/typedRecallAssessment'
import { assessRomajiSprintAnswer } from '../../lib/romajiSprintAssessment'
import { HINT_STEP_FULL_ANSWER, type SubmitAnswerOptions } from '../../context/SessionContext'
import { isGrammarCurriculumMode } from '../../utils'
import { KANJI_MEANINGS } from '../../lib/kanjiMeanings'
import {
  PERFORMANCE_GOOD_MS,
  buildRoundCoachToast,
  calculateAwardedPoints,
  classifyRoundPerformance,
} from '../../lib/roundScoring'
import { SESSION_STORAGE_KEY, loadSessionPrefs, mergeSessionPrefs } from '../../lib/appStorage'
import { buildInterleaveSequence, normalizeText, shuffleArray } from '../../lib/deckUtils'
import {
  PARTICLE_EXPLANATIONS,
  isImposterMode,
  isParticleClozeMode,
  narrativePriorityCards,
  normalizeCurriculumStage,
} from '../../lib/roundContent'
import { CARD_MASTERY_MAX } from '../../constants'
import { mergeStoredScores, sectionForDeckSlug, toSectionScores } from '../../lib/cardScores'
import type { AnswerSavedEvent, PendingAnswersSnapshot } from '../../electron'
import { answerCardKey, newAnswerIdentity } from '../pending-answers/answerIdentity'
import { hasNewerPendingAnswer, useAnswerOutcomes } from '../pending-answers/useAnswerOutcomes'
import { reportSkippedAnswer } from '../pending-answers/skippedAnswers'
import type { AnswerContext } from './types'
import {
  DEFAULT_INTERLEAVE_WEIGHTS,
  DEFAULT_LIVES,
  DEFAULT_SESSION_LENGTH_PRESET,
  SCRIPT_INTERLEAVE_MODES,
  SESSION_LENGTH_PRESETS,
} from '../../constants'

/** Round startup stays responsive even if queue IPC is temporarily slow. */
const ROUND_QUEUE_TIMEOUT_MS = 1200

export function useStudySession(deps: StudySessionDeps): StudySessionApi {
  const {
    view,
    activeScript,
    activeGame,
    activeDeckSlug,
    activeBlockCards,
    deckCards,
    scriptStats,
    gameLoading,
    navigate,
    setActiveScript,
    setActiveGame,
    setGameError,
    setDeckCards,
    setCardScores,
    setScriptStats,
    setMinigameStats,
    setXpProgress,
    setXpToasts,
    setMilestoneToasts,
    resolveScriptMinigame,
    buildRound,
    buildRoundWithBridge,
    getStudyQueue,
    invalidateStudyQueue,
  } = deps

  // Pomodoro and tutor return unstable function identities, and
  // `queueAssistantToast` is the one backwards edge in App's wiring order (the
  // tutor hook is constructed *after* this one because it consumes session
  // state). Reading them through a latest-value ref keeps every callback below
  // free of their identity churn, and matches how App calls them today: none of
  // these appear in the original dependency arrays.
  const collaboratorsRef = useRef(deps)
  collaboratorsRef.current = deps

  // ── State ──────────────────────────────────────────────────────────────────

  const [sessionActive, setSessionActive] = useState<boolean>(false)
  const [roundState, setRoundState] = useState<RoundState | null>(null)
  const [roundInput, setRoundInput] = useState<string>('')
  const [roundFeedback, setRoundFeedback] = useState<string | null>(null)
  const [roundFeedbackTone, setRoundFeedbackTone] = useState<FeedbackTone>(null)
  const [roundFeedbackPoints, setRoundFeedbackPoints] = useState<number | null>(null)
  const [roundFeedbackAnswer, setRoundFeedbackAnswer] = useState<string | null>(null)
  const [roundPerformanceLabel, setRoundPerformanceLabel] = useState<'PERFECT' | 'GOOD' | 'SLOW' | 'MISS' | null>(null)
  const [isRoundResolving, setIsRoundResolving] = useState<boolean>(false)
  const [roundAdvancePending, setRoundAdvancePending] = useState(false)
  const [roundAdvanceError, setRoundAdvanceError] = useState(false)
  const [roundResponseMs, setRoundResponseMs] = useState<number | null>(null)
  const [roundSrsResult, setRoundSrsResult] = useState<{
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
  } | null>(null)
  const [roundExampleSentence, setRoundExampleSentence] = useState<{
    jp: string
    en: string
    romaji: string
  } | null>(null)
  const [sessionScore, setSessionScore] = useState<number>(0)
  const [sessionRounds, setSessionRounds] = useState<number>(0)
  const [sessionPoints, setSessionPoints] = useState<number>(0)
  const [sessionStreak, setSessionStreak] = useState<number>(0)
  const [sessionBestStreak, setSessionBestStreak] = useState<number>(0)
  const [roundComboBonus, setRoundComboBonus] = useState<number>(0)
  const [roundMilestoneStreak, setRoundMilestoneStreak] = useState<number | null>(null)
  const [sessionTargetItems, setSessionTargetItems] = useState<number>(() => loadSessionPrefs()?.sessionTargetItems ?? DEFAULT_SESSION_LENGTH_PRESET.items)
  const [retryTargetItems, setRetryTargetItems] = useState<number | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [lastSessionSummary, setLastSessionSummary] = useState<SessionSummaryPayload | null>(null)
  const [sessionRunReport, setSessionRunReport] = useState<SessionRunReport | null>(null)
  /** A start waiting for its deck; `deckSlug`, `targetItems` and `restore` are set only by a resume. */
  const [resumeRequest, setResumeRequest] = useState<{
    script: ScriptKey
    minigame: MinigameKey
    deckSlug?: DeckSlugInput
    targetItems?: number
    restore?: PersistedSessionRestore
    /** Session-only leech focus (audit 3, Q2); absent means the learner's own setting. */
    leechFocus?: boolean
  } | null>(null)
  const [sessionStartPending, setSessionStartPending] = useState<boolean>(false)
  const [sessionSummaryLoading, setSessionSummaryLoading] = useState<boolean>(false)
  const [sessionGoalError, setSessionGoalError] = useState<string | null>(null)
  const [explicitReviewItems, setExplicitReviewItems] = useState<ExplicitReviewItem[] | null>(null)
  const [showResumeToast, setShowResumeToast] = useState<boolean>(false)
  const [resumeData, setResumeData] = useState<PersistedStudySession | null>(null)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(() => loadSessionPrefs()?.livesEnabled ?? false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)
  /* THE LEARNER'S OWN FOCUS SETTING IS THE ONLY ONE SAVED (audit 3, Q2). "Up next" can turn focus
     on for the one session it starts. The override travels with that start and lives here,
     unsaved: every start sets it (to null when it carries none) and a session's end clears it. */
  const [savedLeechFocus, setSavedLeechFocus] = useState<boolean>(() => loadSessionPrefs()?.leechFocusEnabled ?? false)
  const [leechFocusOverride, setLeechFocusOverride] = useState<boolean | null>(null)
  const leechFocusEnabled = leechFocusOverride ?? savedLeechFocus
  const [interleaveWeights] = useState<InterleaveWeights>({ ...DEFAULT_INTERLEAVE_WEIGHTS })
  const [interleaveSurpriseEnabled] = useState<boolean>(true)
  const [interleaveSurpriseEvery] = useState<number>(5)
  const [confidenceCaptureEnabled, setConfidenceCaptureEnabled] = useState<boolean>(() => loadSessionPrefs()?.confidenceCaptureEnabled ?? false)
  const [roundConfidenceScore, setRoundConfidenceScore] = useState<number>(3)
  const [sessionConfidenceCount, setSessionConfidenceCount] = useState<number>(0)
  const [sessionConfidenceTotal, setSessionConfidenceTotal] = useState<number>(0)
  const [queueRevision, setQueueRevision] = useState(0)

  // ── Refs ───────────────────────────────────────────────────────────────────

  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const roundPresentedAtRef = useRef<number>(0)
  const localToastIdRef = useRef(-1)
  const previousSessionActiveRef = useRef(false)
  const wrongCardIdsRef = useRef<number[]>([])
  const nearMissCardIdsRef = useRef<number[]>([])
  const retryCardsRef = useRef<GameCard[] | null>(null)
  const retryTargetItemsRef = useRef<number | null>(null)
  const explicitReviewItemsRef = useRef<ExplicitReviewItem[] | null>(null)
  const explicitReviewCursorRef = useRef(0)
  const explicitReviewPersistenceRequestRef = useRef(0)
  const feedbackAdvanceRef = useRef<(() => void) | null>(null)
  /** What each answer still waiting for its outcome needs to reconcile it, by answer id. */
  const answerContextsRef = useRef(new Map<string, AnswerContext>())
  const applyRejectedAnswerRef = useRef<(answerId: string) => void>(() => undefined)
  const currentRoundRef = useRef<RoundState | null>(null)
  /** the session whose end-of-session summary is on screen, so a late save can refresh it */
  const summarySessionIdRef = useRef<string | null>(null)
  const needsStoredScoresRefreshRef = useRef(false)
  /** the queue as last reported; null until the main process has said */
  const pendingSnapshotRef = useRef<PendingAnswersSnapshot | null>(null)
  /** bumped whenever a save sets a card's counter, so a database read begun earlier leaves it alone */
  const scoreVersionsRef = useRef(new Map<string, number>())
  const roundCycleRef = useRef<number[]>([])
  /** the cards `roundCycleRef`'s indices point into: the leech, retry or mode pool, not always the block */
  const roundCyclePoolRef = useRef<ScriptDeck['cards']>([])
  const roundCursorRef = useRef<number>(0)
  /** set by a missed-word review, whose end has no run report and no save to clear */
  const explicitReviewRunRef = useRef(false)
  const interleaveCursorRef = useRef<number>(0)
  /** Monotonic per-round seed; see nextRoundMode. */
  const promptSeedRef = useRef<number>(0)

  // ── Resume detection ───────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return
      const parsed = parseResumableSession(raw)
      if (!parsed) {
        // A save that cannot be resumed (from before audit 2 F7, or damaged) is dropped rather
        // than left to be reconsidered on every launch.
        localStorage.removeItem(SESSION_STORAGE_KEY)
        return
      }
      const timer = setTimeout(() => {
        if (localStorage.getItem(SESSION_STORAGE_KEY) !== raw) return
        setResumeData(parsed)
        setShowResumeToast(true)
      }, 2000)
      return () => clearTimeout(timer)
    } catch { /* ignore */ }
  }, [])

  // ── Round cycle ────────────────────────────────────────────────────────────

  const resetRoundCycle = useCallback(() => {
    roundCycleRef.current = []
    roundCyclePoolRef.current = []
    roundCursorRef.current = 0
    interleaveCursorRef.current = 0
    promptSeedRef.current = 0
  }, [])

  const availableInterleaveModes = useMemo(() => SCRIPT_INTERLEAVE_MODES[activeScript], [activeScript])
  const interleaveSequence = useMemo(
    () => buildInterleaveSequence(interleaveWeights, availableInterleaveModes),
    [interleaveWeights, availableInterleaveModes],
  )

  const nextRoundMode = useCallback((selectedMode: MinigameKey): { mode: PlayableMinigame; surprisePrompt: boolean; promptSeed: number } => {
    if (selectedMode !== 'interleave_mix') {
      // The seed picks which variant a generated round asks for — which
      // conjugation form, which particle gets blanked. A constant 0 meant a
      // card was asked the identical question every time it came round again.
      const seed = promptSeedRef.current
      promptSeedRef.current += 1
      return { mode: selectedMode, surprisePrompt: false, promptSeed: seed }
    }

    const cursor = interleaveCursorRef.current
    interleaveCursorRef.current += 1
    return {
      mode: interleaveSequence[cursor % interleaveSequence.length],
      surprisePrompt: interleaveSurpriseEnabled && cursor % Math.max(interleaveSurpriseEvery, 1) === 0,
      promptSeed: cursor,
    }
  }, [interleaveSequence, interleaveSurpriseEnabled, interleaveSurpriseEvery])

  const buildQueueCycle = useCallback((queue: StudyQueueResponse, sourceCards: ScriptDeck['cards']): number[] => {
    const idToIndex = new Map<number, number>()
    sourceCards.forEach((card, index) => {
      idToIndex.set(card.id, index)
    })

    const ordered: number[] = []
    const seen = new Set<number>()
    for (const cardId of queue.queue.card_ids) {
      const sourceIndex = idToIndex.get(cardId)
      if (sourceIndex === undefined || seen.has(sourceIndex)) continue
      ordered.push(sourceIndex)
      seen.add(sourceIndex)
    }

    for (let index = 0; index < sourceCards.length; index += 1) {
      if (seen.has(index)) continue
      ordered.push(index)
    }

    return ordered
  }, [])

  const hydrateRoundCycle = useCallback(async (sourceCards: ScriptDeck['cards']): Promise<void> => {
    if (sourceCards.length <= 0) {
      resetRoundCycle()
      return
    }

    try {
      // Keep round startup responsive even if queue IPC is temporarily slow.
      const queuePromise = getStudyQueue(activeDeckSlug)
        .catch(() => null)
      const queue = await Promise.race<StudyQueueResponse | null>([
        queuePromise,
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), ROUND_QUEUE_TIMEOUT_MS)
        }),
      ])
      roundCycleRef.current = queue
        ? buildQueueCycle(queue, sourceCards)
        : shuffleArray([...Array(sourceCards.length).keys()])
    } catch {
      roundCycleRef.current = shuffleArray([...Array(sourceCards.length).keys()])
    }
    roundCyclePoolRef.current = sourceCards
    roundCursorRef.current = 0
    setQueueRevision((prev) => prev + 1)
  }, [activeDeckSlug, buildQueueCycle, getStudyQueue, resetRoundCycle])

  const nextCardIndex = useCallback((cardsLength: number): number | null => {
    if (cardsLength <= 0) return null

    if (roundCycleRef.current.length !== cardsLength || roundCursorRef.current >= roundCycleRef.current.length) {
      return null
    }

    const index = roundCycleRef.current[roundCursorRef.current]
    roundCursorRef.current += 1
    setQueueRevision((prev) => prev + 1)
    return index
  }, [])

  // ── Resets ─────────────────────────────────────────────────────────────────

  /** Tears down active minigame session state — core pattern. */
  const resetSessionCore = useCallback((): void => {
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setRoundAdvancePending(false)
    setRoundAdvanceError(false)
    explicitReviewPersistenceRequestRef.current += 1
    feedbackAdvanceRef.current = null
    retryCardsRef.current = null
    retryTargetItemsRef.current = null
    setRetryTargetItems(null)
    explicitReviewItemsRef.current = null
    explicitReviewCursorRef.current = 0
    setExplicitReviewItems(null)
    resetRoundCycle()
  }, [resetRoundCycle])

  /** Core + lives reset. Used when starting a new run. */
  const resetSessionWithLives = useCallback((): void => {
    resetSessionCore()
    setLivesRemaining(DEFAULT_LIVES)
  }, [resetSessionCore])

  /** Full session wipe including score/counters/input. Used when loading new deck cards. */
  const resetSessionFull = useCallback((): void => {
    resetSessionWithLives()
    setRoundInput('')
    setSessionScore(0)
    setSessionRounds(0)
    setSessionPoints(0)
    setSessionStreak(0)
    setSessionBestStreak(0)
    setRoundComboBonus(0)
    setRoundMilestoneStreak(null)
    setRoundPerformanceLabel(null)
    setSessionConfidenceCount(0)
    setSessionConfidenceTotal(0)
    setSessionGoalError(null)
  }, [resetSessionWithLives])

  /** End-of-session reset: core without cycle reset + per-round state + optional error message. */
  const resetSessionEnd = useCallback((options?: { errorMessage?: string }): void => {
    setSessionActive(false)
    collaboratorsRef.current.onSessionEnd()
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setRoundResponseMs(null)
    setRoundSrsResult(null)
    setRoundExampleSentence(null)
    if (options?.errorMessage) {
      setGameError(options.errorMessage)
    }
  }, [setGameError])

  const resetSessionForDbReset = useCallback((): void => {
    resetSessionFull()
    setSessionStartPending(false)
    setSessionSummaryLoading(false)
    setLastSessionSummary(null)
    summarySessionIdRef.current = null
    setSessionRunReport(null)
    setActiveSessionId(null)
  }, [resetSessionFull])

  const clearLastRunReport = useCallback((): void => {
    setLastSessionSummary(null)
    summarySessionIdRef.current = null
    setSessionRunReport(null)
  }, [])

  const requestResumeSession = useCallback((request: { script: ScriptKey; minigame: MinigameKey; leechFocus?: boolean }): void => {
    setResumeRequest(request)
  }, [])

  function saveSessionPrefs(): void {
    // Merged rather than written whole: block selection shares this blob and is
    // owned by a different hook, so rebuilding the object here would drop it.
    mergeSessionPrefs({
      script: activeScript,
      game: activeGame,
      livesEnabled,
      leechFocusEnabled: savedLeechFocus,
      confidenceCaptureEnabled,
      sessionTargetItems,
    })
  }

  useEffect(() => {
    saveSessionPrefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScript, activeGame, livesEnabled, savedLeechFocus, confidenceCaptureEnabled, sessionTargetItems])

  // The override belongs to the session it started: once that session ends, the learner's own
  // setting applies again. A start that has set an override but not yet gone live is exempt, so a
  // drill launched while another was still live (one handler ends the old, starts the new) keeps it.
  const overrideSessionWasActiveRef = useRef(false)
  const overrideStartPendingRef = useRef(false)
  useEffect(() => {
    const wasActive = overrideSessionWasActiveRef.current
    overrideSessionWasActiveRef.current = sessionActive
    if (sessionActive) {
      overrideStartPendingRef.current = false
      return
    }
    if (wasActive && !overrideStartPendingRef.current) setLeechFocusOverride(null)
  }, [sessionActive])

  // ── Focus the answer input whenever a fresh round is live ──────────────────

  useEffect(() => {
    if (
      view !== 'minigame' ||
      !sessionActive ||
      !roundState ||
      isRoundResolving
    ) {
      return
    }

    const focusHandle = window.setTimeout(() => {
      answerInputRef.current?.focus()
    }, 60)

    return () => window.clearTimeout(focusHandle)
  }, [isRoundResolving, roundState, roundInput, sessionActive, view])

  // ── Session persistence + end-of-session report ────────────────────────────

  const clearPersistedSession = useCallback(() => {
    wrongCardIdsRef.current = []
    nearMissCardIdsRef.current = []
    try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const previouslyActive = previousSessionActiveRef.current
    previousSessionActiveRef.current = sessionActive

    // A session whose goal never started still ends here: its save is cleared and its run report
    // built, and only the backend summary needs the session id (audit 4 F8). A missed-word review
    // has neither, and nor does a session cut short by a start in the same update
    // (`continueLastSession`); one reset first and started later, as a block start is, ends here.
    if (!previouslyActive || sessionActive || sessionStartPending || explicitReviewRunRef.current) return

    const capturedWrongCardIds = [...wrongCardIdsRef.current]
    const capturedNearMissCardIds = [...nearMissCardIdsRef.current]
    clearPersistedSession()

    const completedRounds = sessionRounds
    // Nothing was answered (a database reset mid-session, a deck reload): no report of zeros.
    if (completedRounds === 0) return
    const completedCorrect = sessionScore
    const completedWrong = Math.max(0, completedRounds - completedCorrect)
    const accuracy = completedRounds > 0 ? Math.round((completedCorrect / completedRounds) * 100) : 0
    const effectiveTargetItems = retryTargetItems ?? sessionTargetItems
    const goalCompletionPct = effectiveTargetItems > 0
      ? Math.min(999, Math.round((completedRounds / effectiveTargetItems) * 100))
      : 0
    const goalDelta = completedRounds - effectiveTargetItems
    const livesLost = livesEnabled ? Math.max(0, DEFAULT_LIVES - livesRemaining) : 0
    const averageConfidenceScore =
      sessionConfidenceCount > 0
        ? Number((sessionConfidenceTotal / sessionConfidenceCount).toFixed(2))
        : null

    setSessionRunReport({
      script: activeScript,
      minigame: activeGame,
      sectionName: null,
      completedAt: new Date().toLocaleTimeString(),
      rounds: completedRounds,
      correct: completedCorrect,
      wrong: completedWrong,
      accuracy,
      points: sessionPoints,
      targetItems: effectiveTargetItems,
      goalCompletionPct,
      goalDelta,
      livesEnabled,
      livesRemaining,
      livesLost,
      leechFocusEnabled,
      confidenceCaptureEnabled,
      confidenceCapturedCount: sessionConfidenceCount,
      averageConfidenceScore,
      wrongCardIds: capturedWrongCardIds,
      nearMissCardIds: capturedNearMissCardIds,
    })

    if (activeSessionId) {
      setSessionSummaryLoading(true)
      setSessionGoalError(null)
      summarySessionIdRef.current = activeSessionId
      const fetchSummary = async () => {
        try {
          const response = await window.jplearnDesktop?.getSessionSummary(activeSessionId)
          if (!response.ok || !response.summary) {
            setSessionGoalError(response.error ?? 'Unable to load session summary.')
            setLastSessionSummary(null)
            return
          }
          setLastSessionSummary(response.summary)
        } catch (error: unknown) {
          setSessionGoalError(error instanceof Error ? error.message : 'Unable to load session summary.')
          setLastSessionSummary(null)
        } finally {
          setSessionSummaryLoading(false)
        }
      }
      void fetchSummary()
    }

    // Refresh XP after each session so the titlebar badge stays current (Q1-A: pull after session end).
    const getXpProgress = window.jplearnDesktop?.getXpProgress
    if (getXpProgress) {
      const refreshXp = async () => {
        try {
          const xp = await getXpProgress()
          if (xp) setXpProgress(xp)
        } catch { /* ignore */ }
      }
      void refreshXp()
    }
  }, [
    activeGame,
    activeScript,
    activeSessionId,
    confidenceCaptureEnabled,
    leechFocusEnabled,
    livesEnabled,
    livesRemaining,
    sessionActive,
    sessionConfidenceCount,
    sessionConfidenceTotal,
    sessionPoints,
    sessionRounds,
    sessionScore,
    sessionStartPending,
    sessionTargetItems,
    retryTargetItems,
    clearPersistedSession,
    setXpProgress,
  ])

  // ── Derived ────────────────────────────────────────────────────────────────

  const upcomingCards = useMemo((): GameCard[] => {
    if (!sessionActive) return []
    const explicitItems = explicitReviewItemsRef.current
    if (explicitItems) {
      return explicitItems.slice(explicitReviewCursorRef.current, explicitReviewCursorRef.current + 5).map((item) => item.card)
    }
    // The cycle's indices name cards in the pool it was built from -- the leech pool, a retry list,
    // a mode's filter -- which is the block only when none of those applied (audit 4 F4).
    const cursor = roundCursorRef.current
    const cycle = roundCycleRef.current
    const pool = roundCyclePoolRef.current
    const result: GameCard[] = []
    for (let index = cursor; index < cycle.length && result.length < 5; index += 1) {
      const cardIndex = cycle[index]
      if (cardIndex < pool.length) {
        result.push(pool[cardIndex])
      }
    }
    return result
    // queueRevision is a state counter bumped when the queue or cursor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionActive, explicitReviewItems, queueRevision])

  const activeSessionLengthPreset = useMemo(
    () => SESSION_LENGTH_PRESETS.find((preset) => preset.items === sessionTargetItems) ?? null,
    [sessionTargetItems],
  )

  useEffect(() => {
    if (activeSessionLengthPreset) return
    setSessionTargetItems(DEFAULT_SESSION_LENGTH_PRESET.items)
  }, [activeSessionLengthPreset])

  // ── Flow ───────────────────────────────────────────────────────────────────

  async function startMissedWordReview(missedWords: DailyGamesMissedWordPayload[]): Promise<void> {
    const uniqueMisses = missedWords.filter((miss, index) => {
      const identity = `${miss.word.deck_slug}:${miss.word.card_id}`
      return missedWords.findIndex((candidate) => `${candidate.word.deck_slug}:${candidate.word.card_id}` === identity) === index
    })
    if (uniqueMisses.length === 0) return

    setSessionStartPending(true)
    try {
      const getDeckCards = window.jplearnDesktop?.getDeckCards
      if (!getDeckCards) throw new Error('Deck cards API unavailable')
      const deckSlugs = [...new Set(uniqueMisses.map((miss) => miss.word.deck_slug as DeckSlugInput))]
      const decks = await Promise.all(deckSlugs.map(async (slug) => [slug, await getDeckCards(slug)] as const))
      const cardsByDeck = new Map(decks.map(([slug, deck]) => [slug, new Map(deck.cards.map((card) => [card.id, card]))]))
      const items = uniqueMisses.flatMap((miss) => {
        const deckSlug = miss.word.deck_slug as DeckSlugInput
        const card = cardsByDeck.get(deckSlug)?.get(miss.word.card_id)
        return card ? [{ deckSlug, cardId: miss.word.card_id, card }] : []
      })
      if (items.length === 0) throw new Error('Missed words are no longer available for review.')

      clearPersistedSession()
      setShowResumeToast(false)
      setResumeData(null)
      resetSessionFull()
      explicitReviewItemsRef.current = items
      explicitReviewCursorRef.current = 1
      setExplicitReviewItems(items)
      retryTargetItemsRef.current = items.length
      setRetryTargetItems(items.length)
      setLastSessionSummary(null)
      summarySessionIdRef.current = null
      setSessionRunReport(null)
      setActiveSessionId(null)
      explicitReviewRunRef.current = true
      wrongCardIdsRef.current = []
      nearMissCardIdsRef.current = []

      const firstItem = items[0]
      const firstRound = buildRound([firstItem.card], 'romaji_sprint', 0, false, 0)
      if (!firstRound) throw new Error('Missed-word review could not prepare a question.')

      setSessionActive(true)
      collaboratorsRef.current.onSessionStart()
      setRoundState({ ...firstRound, deckSlug: firstItem.deckSlug })
      roundPresentedAtRef.current = performance.now()
      setRoundInput('')
      setRoundFeedback(null)
      setRoundFeedbackTone(null)
      setRoundFeedbackPoints(null)
      setRoundFeedbackAnswer(null)
      setRoundPerformanceLabel(null)
      setIsRoundResolving(false)
      setRoundAdvancePending(false)
      setRoundAdvanceError(false)
      setGameError(null)
      setRoundConfidenceScore(3)
      navigate('minigame', 'forward')
    } finally {
      setSessionStartPending(false)
    }
  }

  const returnToDailyGames = useCallback((): void => {
    resetSessionEnd()
    explicitReviewPersistenceRequestRef.current += 1
    feedbackAdvanceRef.current = null
    setRoundAdvancePending(false)
    setRoundAdvanceError(false)
    explicitReviewItemsRef.current = null
    explicitReviewCursorRef.current = 0
    setExplicitReviewItems(null)
    retryCardsRef.current = null
    retryTargetItemsRef.current = null
    setRetryTargetItems(null)
    /* THE ROAD, NOT THE PUZZLE. `daily_games` used to be the hub, so coming back from a missed-word
       review landed on the four tiles; it is one puzzle now and cannot be opened without naming
       which, so this goes home and the menu path is still standing on DAILY. */
    navigate('home', 'back')
  }, [resetSessionEnd, navigate])

  const startSession = useCallback(async (selectedGame: MinigameKey = activeGame, customCards?: GameCard[], customTargetItems?: number, restore?: PersistedSessionRestore, leechFocus?: boolean) => {
    // Every start says whether it carries a session-only override, so one never outlives its session.
    setLeechFocusOverride(leechFocus ?? null)
    overrideStartPendingRef.current = true
    const focusLeeches = leechFocus ?? savedLeechFocus
    setSessionStartPending(true)
    resetRoundCycle()
    setSessionGoalError(null)
    setLastSessionSummary(null)
    summarySessionIdRef.current = null
    setSessionRunReport(null)
    setActiveSessionId(null)
    explicitReviewRunRef.current = false
    wrongCardIdsRef.current = []
    nearMissCardIdsRef.current = []
    if (!customCards) {
      retryCardsRef.current = null
      retryTargetItemsRef.current = null
      setRetryTargetItems(null)
    }

    setSessionScore(restore?.sessionScore ?? 0)
    setSessionRounds(restore?.sessionRounds ?? 0)
    setSessionPoints(restore?.sessionPoints ?? 0)
    setSessionStreak(restore?.sessionStreak ?? 0)
    setSessionBestStreak(restore?.sessionBestStreak ?? 0)
    setSessionConfidenceCount(restore?.sessionConfidenceCount ?? 0)
    setSessionConfidenceTotal(restore?.sessionConfidenceTotal ?? 0)
    setLivesRemaining(restore?.livesRemaining ?? DEFAULT_LIVES)

    try {
      const sourceCards = customCards
        ?? (focusLeeches && activeBlockCards.filter((card) => card.is_leech).length > 0
          ? activeBlockCards.filter((card) => card.is_leech)
          : activeBlockCards)
      const modeSelection = nextRoundMode(selectedGame)
      let modeCards = isImposterMode(modeSelection.mode)
        ? narrativePriorityCards(sourceCards)
        : sourceCards

      if (modeSelection.mode === 'kanji_compound_builder') {
        modeCards = modeCards.filter((c) => {
          const kanjiChars = [...c.character].filter((ch) => /\p{Script=Han}/u.test(ch))
          return kanjiChars.length >= 2 && !kanjiChars.some((ch) => !(ch in KANJI_MEANINGS))
        })
      }
      if (modeSelection.mode === 'handwriting') {
        modeCards = modeCards.filter((card) => isHandwritingEligibleCharacter(card.character))
      }
      if (modeSelection.mode === 'conjugation_drill') {
        modeCards = buildConjugationPool(modeCards, deckCards)
      }
      const goalTargetItems = Math.max(1, Math.floor(customTargetItems ?? sessionTargetItems))

      await hydrateRoundCycle(modeCards)
      const index = nextCardIndex(modeCards.length)
      const nextRound = index === null
        ? null
        : await buildRoundWithBridge(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
      if (!nextRound) {
    setSessionActive(false)
    setRoundState(null)
        if (focusLeeches && activeBlockCards.filter((card) => card.is_leech).length === 0) {
          setGameError('No cards flagged for review. Disable Leech Focus to play normally.')
        } else {
          setGameError('This block has too few cards for this minigame. Try a different block.')
        }
        return
      }

      // Only a start that has a round to play is recorded as a session: a goal sent before the
      // round was built left a zero-answer row in the session history when it failed (audit 4 F7).
      // The goal is awaited before the round can be answered, so the first answer is saved with
      // its session id.
      try {
        const goalResponse: SessionGoalStartResponse = await window.jplearnDesktop?.startSessionGoal({
          targetItems: goalTargetItems,
        })
        if (!goalResponse.ok) {
          setSessionGoalError('Unable to start session goal.')
        } else {
          setActiveSessionId(goalResponse.goal.session_id)
        }
      } catch (error: unknown) {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session goal.')
      }

      setSessionActive(true)
      collaboratorsRef.current.onSessionStart()
      saveSessionPrefs()
      setRoundState(nextRound)
      roundPresentedAtRef.current = performance.now()
      setRoundInput('')
      setRoundFeedback(null)
      setRoundFeedbackTone(null)
      setRoundFeedbackPoints(null)
      setRoundFeedbackAnswer(null)
      setRoundPerformanceLabel(null)
      setIsRoundResolving(false)
      setGameError(null)
      setRoundConfidenceScore(3)
    } catch (error: unknown) {
      resetSessionCore()
      setGameError(error instanceof Error ? error.message : 'Could not start the session. Try again or restart the app.')
      setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session.')
    } finally {
      setSessionStartPending(false)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- saveSessionPrefs is intentionally re-read per call, matching the pre-extraction inline function
  }, [
    activeBlockCards,
    activeGame,
    buildRoundWithBridge,
    hydrateRoundCycle,
    nextCardIndex,
    nextRoundMode,
    resetRoundCycle,
    savedLeechFocus,
    resetSessionCore,
    sessionTargetItems,
    setGameError,
  ])

  const skipFeedback = useCallback(() => {
    feedbackAdvanceRef.current?.()
    feedbackAdvanceRef.current = null
  }, [])

  const continueLastSession = useCallback(() => {
    if (!sessionRunReport) return

    const script = sessionRunReport.script
    const minigame = resolveScriptMinigame(script, sessionRunReport.minigame)

    setActiveGame(minigame)
    navigate('minigame', 'forward')
    resetSessionWithLives()

    if (script !== activeScript) {
      setActiveScript(script)
      setResumeRequest({ script, minigame })
      return
    }

    void startSession(minigame)
  }, [
    activeScript,
    resetSessionWithLives,
    resolveScriptMinigame,
    sessionRunReport,
    startSession,
    setActiveGame,
    setActiveScript,
    navigate,
  ])

  useEffect(() => {
    if (!resumeRequest) return
    if (activeScript !== resumeRequest.script) return
    if (resumeRequest.deckSlug !== undefined && activeDeckSlug !== resumeRequest.deckSlug) return
    if (gameLoading || sessionStartPending) return

    const { minigame, targetItems, restore, leechFocus } = resumeRequest
    setResumeRequest(null)
    void startSession(minigame, undefined, targetItems, restore, leechFocus)
  }, [activeScript, activeDeckSlug, gameLoading, resumeRequest, sessionStartPending, startSession])

  /* RESUME IS AN ORDINARY START ON THE SAVED DECK. It reopens the level the session was on and
     queues the same start the deck and feed screens make, so the round draws from the block
     selection (or the whole fed level) through the study queue. The run's counters come back,
     and since `sessionRounds` is restored the session ends after the saved length's remaining
     rounds; the backend goal is asked for only those. */
  const handleResume = useCallback(async () => {
    if (!resumeData) return
    const data = resumeData
    setShowResumeToast(false)
    setResumeData(null)
    clearPersistedSession()

    const targetItems = resumableTargetItems(data.sessionTargetItems)
    const minigame = resolveScriptMinigame(data.activeScript, data.activeGame)
    collaboratorsRef.current.openStudyDeck(data.activeScript, data.deckSlug)
    setActiveGame(minigame)
    setLivesEnabled(data.livesEnabled)
    setConfidenceCaptureEnabled(data.confidenceCaptureEnabled)
    setSessionTargetItems(targetItems)
    resetSessionWithLives()
    navigate('minigame', 'forward')
    setResumeRequest({
      script: data.activeScript,
      minigame,
      deckSlug: data.deckSlug,
      targetItems: Math.max(1, targetItems - (Number.isFinite(data.restore.sessionRounds) ? data.restore.sessionRounds : 0)),
      restore: data.restore,
      // The resumed run plays as it was played, without rewriting the learner's saved setting.
      leechFocus: data.leechFocusEnabled,
    })
  }, [
    resumeData,
    clearPersistedSession,
    resetSessionWithLives,
    resolveScriptMinigame,
    setActiveGame,
    navigate,
  ])

  const handleDismissResume = useCallback(() => {
    setShowResumeToast(false)
    setResumeData(null)
    clearPersistedSession()
  }, [clearPersistedSession])

  const handleRetry = useCallback((cardIds: number[]) => {
    const retryCards = deckCards.filter((c) => cardIds.includes(c.id))
    if (retryCards.length > 0) {
      retryCardsRef.current = retryCards
      retryTargetItemsRef.current = retryCards.length
      setRetryTargetItems(retryCards.length)
      startSession(activeGame, retryCards, retryCards.length)
    }
  }, [activeGame, deckCards, startSession])

  const nextRound = useCallback(async () => {
    const explicitItems = explicitReviewItemsRef.current
    if (explicitItems) {
      const nextItem = explicitItems[explicitReviewCursorRef.current]
      explicitReviewCursorRef.current += 1
      if (!nextItem) {
        returnToDailyGames()
        return
      }
      const candidate = buildRound([nextItem.card], 'romaji_sprint', 0, false, 0)
      if (!candidate) {
        returnToDailyGames()
        return
      }

      setRoundState({ ...candidate, deckSlug: nextItem.deckSlug })
      roundPresentedAtRef.current = performance.now()
      setRoundInput('')
      setRoundFeedback(null)
      setRoundFeedbackTone(null)
      setRoundFeedbackPoints(null)
      setRoundFeedbackAnswer(null)
      setRoundPerformanceLabel(null)
      setRoundComboBonus(0)
      setRoundMilestoneStreak(null)
      setQueueRevision((previous) => previous + 1)
      return
    }

    const retryPool = retryCardsRef.current
    const leechPool = activeBlockCards.filter((card) => card.is_leech)
    const sourceCards = retryPool
      ?? (leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards)
    const modeSelection = nextRoundMode(activeGame)
    let modeCards = isImposterMode(modeSelection.mode)
      ? narrativePriorityCards(sourceCards)
      : sourceCards

    if (modeSelection.mode === 'kanji_compound_builder') {
      modeCards = modeCards.filter((c) => {
        const kanjiChars = [...c.character].filter((ch) => /\p{Script=Han}/u.test(ch))
        return kanjiChars.length >= 2 && !kanjiChars.some((ch) => !(ch in KANJI_MEANINGS))
      })
    }
    if (modeSelection.mode === 'handwriting') {
      modeCards = modeCards.filter((card) => isHandwritingEligibleCharacter(card.character))
    }
    if (modeSelection.mode === 'conjugation_drill') {
      modeCards = buildConjugationPool(modeCards, deckCards)
    }
    let index = nextCardIndex(modeCards.length)
    if (index === null) {
      await hydrateRoundCycle(modeCards)
      index = nextCardIndex(modeCards.length)
    }
    const candidate = index === null
      ? null
      : await buildRoundWithBridge(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
    if (!candidate) {
      resetSessionCore()
      return
    }

    setRoundState(candidate)
    roundPresentedAtRef.current = performance.now()
    setRoundInput('')
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setRoundPerformanceLabel(null)
      setRoundComboBonus(0)
      setRoundMilestoneStreak(null)
  }, [
    activeBlockCards,
    activeGame,
    buildRound,
    buildRoundWithBridge,
    deckCards,
    hydrateRoundCycle,
    leechFocusEnabled,
    nextCardIndex,
    nextRoundMode,
    resetSessionCore,
    returnToDailyGames,
  ])

  const submitAnswer = useCallback(
    (
      answer: string,
      options: SubmitAnswerOptions = {},
      correctnessOverride?: boolean,
      handwritingOutcome?: HandwritingOutcome,
    ) => {
      if (!roundState || isRoundResolving) return
      if (answer.trim().length === 0) return
      // The score belongs to the section of the deck the card came from, which a missed-word review
      // can leave different from the active section (audit 2, F1).
      const scoreSection = (roundState.deckSlug ? sectionForDeckSlug(roundState.deckSlug) : null) ?? activeScript

      setIsRoundResolving(true)
      const completedRoundsAfterAnswer = sessionRounds + 1
      const targetRounds = Math.max(1, Math.floor(retryTargetItemsRef.current ?? sessionTargetItems))

      const typedAssessment =
        roundState.mode === 'typed_recall'
          ? assessTypedRecallAnswer({
            script: activeScript,
            expectedAnswer: roundState.answer,
            givenAnswer: answer,
            dictionaryNote: roundState.dictionaryNote,
          })
          : roundState.mode === 'speech_recall'
            // The round shows the word and asks for its meaning, so it is graded on the English
            // meanings only, like Typed Recall; saying (or typing) the shown word is not the
            // meaning (audit 9, F2).
            ? assessTypedRecallAnswer({
              script: activeScript,
              expectedAnswer: roundState.answer,
              givenAnswer: answer,
              dictionaryNote: roundState.dictionaryNote,
            })
            : roundState.mode === 'dictation'
              ? assessJapaneseAnswer([roundState.answer], answer)
              : roundState.mode === 'romaji_sprint'
                ? assessRomajiSprintAnswer(roundState, answer)
                : roundState.mode === 'conjugation_drill'
                  ? assessConjugationAnswer(
                    roundState.acceptedAnswers ?? [roundState.answer],
                    answer,
                  )
                  : null
      // Once the hint has printed the answer, typing it is not recall: saved as wrong, as
      // Handwriting's Give up is (audit 9, F4). The clue step alone still allows a right answer.
      const answerWasRevealed = (options.hintStep ?? 0) >= HINT_STEP_FULL_ANSWER
      const isCorrect = correctnessOverride
        ?? (!answerWasRevealed && (typedAssessment !== null
          ? typedAssessment === 'exact' || typedAssessment === 'near_miss'
          : normalizeText(answer) === normalizeText(roundState.answer)))
      const responseMs =
        roundPresentedAtRef.current > 0
          ? Math.max(0, performance.now() - roundPresentedAtRef.current)
          : PERFORMANCE_GOOD_MS
      setRoundResponseMs(responseMs)
      const performanceLabel = classifyRoundPerformance(isCorrect, responseMs)
      const previousScript = scriptStats[activeScript]
      const nextStreak = isCorrect ? previousScript.currentStreak + 1 : 0
      const awardedPoints = isCorrect ? calculateAwardedPoints(nextStreak) : 0
      const comboBonus = Math.max(0, awardedPoints - 1)
      const isMilestone = nextStreak === 3 || nextStreak === 6 || nextStreak === 9
      const pointsCopy = `+${awardedPoints} ${awardedPoints === 1 ? 'point' : 'points'}`
      const comboCopy = comboBonus > 0 ? ` (streak bonus +${comboBonus})` : ''
      let nextLives = livesRemaining

      setScriptStats((previous) => {
        return {
          ...previous,
          [activeScript]: {
            attempted: previous[activeScript].attempted + 1,
            correct: isCorrect ? previous[activeScript].correct + 1 : previous[activeScript].correct,
            currentStreak: nextStreak,
            bestStreak: Math.max(previous[activeScript].bestStreak, nextStreak),
          },
        }
      })

      setMinigameStats((previous) => {
        const previousGameStats = previous[activeScript][activeGame]
        const nextGameStreak = isCorrect ? previousGameStats.currentStreak + 1 : 0
        return {
          ...previous,
          [activeScript]: {
            ...previous[activeScript],
            [activeGame]: {
              attempted: previousGameStats.attempted + 1,
              correct: isCorrect ? previousGameStats.correct + 1 : previousGameStats.correct,
              currentStreak: nextGameStreak,
              bestStreak: Math.max(previousGameStats.bestStreak, nextGameStreak),
              points: isCorrect ? previousGameStats.points + awardedPoints : previousGameStats.points,
            },
          },
        }
      })

      setSessionRounds((value) => value + 1)
      setSessionStreak(nextStreak)
      setSessionBestStreak((value) => Math.max(value, nextStreak))
      setRoundComboBonus(comboBonus)
      setRoundMilestoneStreak(isMilestone ? nextStreak : null)
      setRoundPerformanceLabel(performanceLabel)
      if (isCorrect) {
        setSessionScore((value) => value + 1)
        setSessionPoints((value) => value + awardedPoints)
        if ((roundState.mode === 'typed_recall' || roundState.mode === 'speech_recall') && typedAssessment === 'near_miss') {
          setRoundFeedback(`Close enough. We’ll count it! ${pointsCopy}${comboCopy}.`)
        } else if (isImposterMode(roundState.mode)) {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage + 1)
          setRoundFeedback(`Nice work! ${pointsCopy}${comboCopy}. Stage ${roundState.curriculumStage} → ${nextStage}.`)
        } else if (roundState.mode === 'handwriting') {
          setRoundFeedback(`Stroke order complete! ${pointsCopy}${comboCopy}.`)
        } else {
          setRoundFeedback(`Nice work! ${pointsCopy}${comboCopy}.`)
        }
        setRoundFeedbackTone('success')
        setRoundFeedbackPoints(awardedPoints)
        setRoundFeedbackAnswer(roundState.mode === 'handwriting' ? answer : null)

        // Update per-card score: correct → +1 (capped at CARD_MASTERY_MAX).
        const answeredCardId = roundState.cardId
        setCardScores((prev) => {
          const current = prev[scoreSection][answeredCardId] ?? 0
          return {
            ...prev,
            [scoreSection]: {
              ...prev[scoreSection],
              [answeredCardId]: Math.min(current + 1, CARD_MASTERY_MAX),
            },
          }
        })

        // Track near-misses alongside wrong answers for session-end retry
        if (typedAssessment === 'near_miss' && !nearMissCardIdsRef.current.includes(answeredCardId)) {
          nearMissCardIdsRef.current.push(answeredCardId)
        }
      } else {
        if (livesEnabled) {
          nextLives = Math.max(0, livesRemaining - 1)
          setLivesRemaining(nextLives)
        }
        if (answerWasRevealed && correctnessOverride === undefined) {
          setRoundFeedback('The hint showed the answer, so this one counts as a miss.')
        } else if (typedAssessment === 'close') {
          // One kana off is a different sound, so it is a miss; say it was close and show the spelling.
          setRoundFeedback(`Close: one kana is off, so it counts as a miss. The answer is ${formatKanaSpellings(roundState.answer)}.`)
        } else if (isImposterMode(roundState.mode)) {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage - 1)
          setRoundFeedback(`Not quite. Stage ${roundState.curriculumStage} → ${nextStage}.`)
        } else if (isParticleClozeMode(roundState.mode)) {
          const info = PARTICLE_EXPLANATIONS[roundState.answer]
          setRoundFeedback(info
            ? `Not quite. The answer is ${roundState.answer} (${info.romaji}). ${info.explanation}.`
            : `Not quite. The answer is ${roundState.answer}.`)
        } else if (roundState.mode === 'handwriting' && handwritingOutcome) {
          setRoundFeedback('Character not completed. It counts as a retry.')
        } else {
          setRoundFeedback('Not quite.')
        }
        setRoundFeedbackTone('error')
        setRoundFeedbackPoints(0)
        setRoundFeedbackAnswer(
          roundState.mode === 'sentence_assembly' && roundState.options
            ? (() => {
                const chunkMap = new Map(roundState.options.map((o) => [o.id, o.label]))
                return answer.split('|').map((id) => chunkMap.get(id) ?? '').join('')
              })()
            : roundState.mode === 'handwriting' && handwritingOutcome
              ? formatHandwritingAttemptValue(handwritingOutcome, roundState.answer)
              : answer,
        )

        // Wrong answer deducts 1 from the card score (floored at 0).
        const answeredCardId = roundState.cardId
        setCardScores((prev) => {
          const current = prev[scoreSection][answeredCardId] ?? 0
          return {
            ...prev,
            [scoreSection]: {
              ...prev[scoreSection],
              [answeredCardId]: Math.max(current - 1, 0),
            },
          }
        })
        if (!wrongCardIdsRef.current.includes(answeredCardId)) {
          wrongCardIdsRef.current.push(answeredCardId)
        }
      }

      const confidenceForAnswer = confidenceCaptureEnabled ? roundConfidenceScore : undefined

      if (!explicitReviewItemsRef.current) {
        try {
          const data: PersistedStudySession = {
            activeScript,
            deckSlug: activeDeckSlug,
            activeGame,
            livesEnabled,
            leechFocusEnabled,
            confidenceCaptureEnabled,
            sessionTargetItems,
            restore: {
              sessionScore: isCorrect ? sessionScore + 1 : sessionScore,
              sessionRounds: sessionRounds + 1,
              sessionPoints: isCorrect ? sessionPoints + awardedPoints : sessionPoints,
              sessionStreak: nextStreak,
              sessionBestStreak: Math.max(sessionBestStreak, nextStreak),
              sessionConfidenceCount:
                typeof confidenceForAnswer === 'number' ? sessionConfidenceCount + 1 : sessionConfidenceCount,
              sessionConfidenceTotal:
                typeof confidenceForAnswer === 'number' ? sessionConfidenceTotal + confidenceForAnswer : sessionConfidenceTotal,
              livesRemaining: nextLives,
            },
          }
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
        } catch { /* ignore storage errors */ }
      }

      // App already resolves this once, including the JLPT level for the two
      // levelled sections. Re-deriving it from a category here used to agree by
      // accident; since issue #78 a selection can hold blocks no category covers,
      // and it would resolve the wrong deck.
      const resultSlug: DeckSlugInput = roundState.deckSlug ?? activeDeckSlug
      invalidateStudyQueue(resultSlug)

      const isExplicitReview = explicitReviewItemsRef.current !== null
      const persistenceRequestId = isExplicitReview
        ? ++explicitReviewPersistenceRequestRef.current
        : explicitReviewPersistenceRequestRef.current
      const advanceFeedback = () => {
        feedbackAdvanceRef.current = null
        if (!isCorrect && livesEnabled && nextLives <= 0) {
          resetSessionEnd({ errorMessage: 'Out of lives. Press Play to start a new run.' })
          return
        }

        if (completedRoundsAfterAnswer >= targetRounds) {
          if (explicitReviewItemsRef.current) {
            returnToDailyGames()
            return
          }
          resetSessionEnd()
          return
        }

        void nextRound()
        setRoundFeedback(null)
        setRoundFeedbackTone(null)
        setRoundFeedbackPoints(null)
        setRoundFeedbackAnswer(null)
        setRoundResponseMs(null)
        setRoundSrsResult(null)
        setRoundExampleSentence(null)
        setIsRoundResolving(false)
      }
      if (isExplicitReview) {
        feedbackAdvanceRef.current = null
        setRoundAdvancePending(true)
        setRoundAdvanceError(false)
      } else {
        feedbackAdvanceRef.current = advanceFeedback
      }

      // The answer goes to the main process's save queue and this call returns at once; the outcome
      // is reconciled in applySavedAnswer / applyRejectedAnswer below, whichever way it arrives
      // (audit 1, F1/F3). The round never waits for it, except an explicit review's advance.
      const identity = newAnswerIdentity()
      answerContextsRef.current.set(identity.answerId, {
        cardKey: answerCardKey(resultSlug, roundState.cardId),
        slug: resultSlug,
        admitted: false,
        script: scoreSection,
        cardId: roundState.cardId,
        mode: roundState.mode,
        round: roundState,
        isExplicitReview,
        persistenceRequestId,
        advanceFeedback,
        sessionId: activeSessionId,
      })
      void (async () => {
        try {
          const admitted = await window.jplearnDesktop?.recordGameResult({
            slug: resultSlug,
            cardId: roundState.cardId,
            isCorrect,
            minigame: roundState.mode,
            curriculumStage:
              isGrammarCurriculumMode(roundState.mode)
                ? roundState.curriculumStage
                : undefined,
            sessionId: activeSessionId ?? undefined,
            confidenceScore: confidenceForAnswer,
            ...identity,
          })
          if (!admitted) throw new Error('Review persistence unavailable')
          const context = answerContextsRef.current.get(identity.answerId)
          if (context) context.admitted = true
        } catch {
          // Never admitted, so no outcome will follow and the queue never heard of it: say it was
          // skipped, and undo its optimistic step from the database.
          reportSkippedAnswer()
          applyRejectedAnswerRef.current(identity.answerId)
        }
      })()

      void (async () => {
        try {
          const query = roundState.focusText || roundState.answer
          if (!query) return
          const sentence = await window.jplearnDesktop?.lookupSentence?.({ query })
          if (sentence?.jp) {
            setRoundExampleSentence({ jp: sentence.jp, en: sentence.en ?? '', romaji: sentence.romaji ?? '' })
          }
        } catch { /* optional — ignore */ }
      })()

      if (typeof confidenceForAnswer === 'number') {
        setSessionConfidenceCount((value) => value + 1)
        setSessionConfidenceTotal((value) => value + confidenceForAnswer)
      }

      const nextToastId = localToastIdRef.current - 1
      localToastIdRef.current = nextToastId
      collaboratorsRef.current.queueAssistantToast(buildRoundCoachToast(nextToastId, {
        isCorrect,
        mode: roundState.mode,
        nextStreak,
        answer: roundState.answer,
        completedRoundsAfterAnswer,
        targetRounds,
        typedAssessment,
      }))

    },
    [
      activeGame,
      activeDeckSlug,
      activeScript,
      activeSessionId,
      confidenceCaptureEnabled,
      invalidateStudyQueue,
      isRoundResolving,
      leechFocusEnabled,
      livesEnabled,
      livesRemaining,
      nextRound,
      resetSessionEnd,
      returnToDailyGames,
      roundConfidenceScore,
      roundState,
      scriptStats,
      sessionBestStreak,
      sessionConfidenceCount,
      sessionConfidenceTotal,
      sessionPoints,
      sessionRounds,
      sessionScore,
      sessionTargetItems,
      setCardScores,
      setMinigameStats,
      setScriptStats,
    ],
  )

  // ── Answer outcomes ────────────────────────────────────────────────────────
  //
  // Every answer's outcome lands here, however late (audit 1, F1/F3). Global progress -- the
  // stored mastery counter and curriculum stage -- follows the database, but not while a newer
  // answer for the same card is still waiting: its own result will set the value. Round feedback
  // applies only if the learner is still on that round.

  currentRoundRef.current = roundState

  // Re-read the stored counters. The read can take a while, so when it lands the cards with an answer
  // still on its way -- or set by a save since the read began -- keep what they have.
  const refreshStoredScores = useCallback(async () => {
    const desktop = window.jplearnDesktop
    if (!desktop?.getCardScores) return
    const versionsAtStart = new Map(scoreVersionsRef.current)
    try {
      const payload = await desktop.getCardScores()
      const stored = toSectionScores(payload?.scores ?? {})
      const inFlight = new Set(
        Array.from(answerContextsRef.current.values(), (context) => `${context.script}:${context.cardId}`),
      )
      setCardScores((prev) => mergeStoredScores(prev, stored, (script, cardId) => {
        const key = `${script}:${cardId}`
        return inFlight.has(key) || scoreVersionsRef.current.get(key) !== versionsAtStart.get(key)
      }))
    } catch { /* best effort: the next answer's result corrects it */ }
  }, [setCardScores])

  /** Re-read the stored counters now if nothing is on its way, or once the queue empties. */
  const requestStoredScoresRefresh = () => {
    const queueEmpty = (pendingSnapshotRef.current?.count ?? 0) === 0
    if (queueEmpty && answerContextsRef.current.size === 0) {
      needsStoredScoresRefreshRef.current = false
      void refreshStoredScores()
    } else {
      needsStoredScoresRefreshRef.current = true
    }
  }

  const applySavedAnswer = (event: AnswerSavedEvent, snapshot: PendingAnswersSnapshot | null) => {
    const context = answerContextsRef.current.get(event.answerId)
    answerContextsRef.current.delete(event.answerId)
    const result = event.result
    if (!context) {
      // Admitted by an earlier load of this window (or another window): nothing local to reconcile
      // against, so take the database's view once nothing is waiting (the status after this save).
      needsStoredScoresRefreshRef.current = true
      return
    }
    // The study queue was read before this answer saved.
    invalidateStudyQueue(context.slug)

    if (context.isExplicitReview && explicitReviewPersistenceRequestRef.current === context.persistenceRequestId
      && explicitReviewItemsRef.current) {
      setRoundAdvancePending(false)
      feedbackAdvanceRef.current = context.advanceFeedback
    }

    const newerWaiting = hasNewerPendingAnswer(snapshot, context.cardKey, event.answerId)
    if (!newerWaiting && isGrammarCurriculumMode(context.mode) && typeof result.curriculum_stage === 'number') {
      const resolvedStage = normalizeCurriculumStage(result.curriculum_stage)
      setDeckCards((previousCards) =>
        previousCards.map((entry) =>
          entry.id === context.cardId ? { ...entry, curriculum_stage: resolvedStage } : entry,
        ),
      )
    }
    if (!newerWaiting && typeof result.mastery_score === 'number') {
      const storedScore = result.mastery_score
      const versionKey = `${context.script}:${context.cardId}`
      scoreVersionsRef.current.set(versionKey, (scoreVersionsRef.current.get(versionKey) ?? 0) + 1)
      setCardScores((prev) => (
        prev[context.script][context.cardId] === storedScore
          ? prev
          : { ...prev, [context.script]: { ...prev[context.script], [context.cardId]: storedScore } }
      ))
    }
    if (currentRoundRef.current === context.round && result.repetitions != null) {
      setRoundSrsResult({
        repetitions: result.repetitions,
        interval: result.interval,
        next_review: result.next_review,
        ease_factor: result.ease_factor,
      })
    }

    if (typeof result.xp_gained === 'number' && result.xp_gained > 0) {
      const leveledUp = typeof result.level_after === 'number'
        && typeof result.level_before === 'number'
        && result.level_after > result.level_before
      const id = Date.now()
      setXpToasts((prev) => [...prev, {
        id,
        xp: result.xp_gained!,
        levelBefore: leveledUp ? result.level_before : undefined,
        levelAfter: leveledUp ? result.level_after : undefined,
      }])
      setTimeout(() => setXpToasts((prev) => prev.filter((toast) => toast.id !== id)), 2500)
    }
    if (result.milestones_reached && result.milestones_reached.length > 0) {
      const newToasts = result.milestones_reached.map((descriptor, index) => ({
        id: Date.now() + index,
        descriptor,
      }))
      setMilestoneToasts((prev) => [...prev, ...newToasts])
      for (const toast of newToasts) {
        setTimeout(() => setMilestoneToasts((prev) => prev.filter((entry) => entry.id !== toast.id)), 3500)
      }
    }
    if (result.xp_gained !== undefined) {
      void (async () => {
        try {
          const xp = await window.jplearnDesktop?.getXpProgress?.()
          if (xp) setXpProgress(xp)
        } catch { /* ignore */ }
      })()
    }

    // A session summary already on screen was read before this answer saved.
    if (context.sessionId && summarySessionIdRef.current === context.sessionId) {
      void (async () => {
        try {
          const response = await window.jplearnDesktop?.getSessionSummary(context.sessionId!)
          if (response?.ok && response.summary && summarySessionIdRef.current === context.sessionId) {
            setLastSessionSummary(response.summary)
          }
        } catch { /* the summary stays as it was */ }
      })()
    }
  }

  const applyRejectedAnswer = (answerId: string) => {
    const context = answerContextsRef.current.get(answerId)
    answerContextsRef.current.delete(answerId)
    if (context?.isExplicitReview && explicitReviewPersistenceRequestRef.current === context.persistenceRequestId
      && explicitReviewItemsRef.current) {
      setRoundAdvancePending(false)
      setRoundAdvanceError(true)
      feedbackAdvanceRef.current = null
    }
    // The optimistic step for this answer stands in memory; the database never took it. Re-read the
    // stored counters once nothing else is waiting, rather than undo a clamped step.
    requestStoredScoresRefresh()
  }
  applyRejectedAnswerRef.current = applyRejectedAnswer

  useAnswerOutcomes({
    onSaved: applySavedAnswer,
    onRejected: (event) => applyRejectedAnswer(event.answerId),
    onQueueChanged: (snapshot) => {
      pendingSnapshotRef.current = snapshot
      // An admitted answer gone from the queue with no outcome (an event this window missed) is lost
      // as far as this window can tell: reconcile it as refused, from the database.
      const stillWaiting = new Set(snapshot.pending.map((entry) => entry.answerId))
      for (const [answerId, context] of answerContextsRef.current) {
        if (context.admitted && !stillWaiting.has(answerId)) applyRejectedAnswer(answerId)
      }
      if (needsStoredScoresRefreshRef.current) requestStoredScoresRefresh()
    },
  })

  const submitHandwritingOutcome = useCallback((outcome: HandwritingOutcome) => {
    if (!roundState || roundState.mode !== 'handwriting') return
    submitAnswer(roundState.answer, {}, isHandwritingOutcomeCorrect(outcome), outcome)
  }, [roundState, submitAnswer])

  // ── Context slice ──────────────────────────────────────────────────────────
  //
  // Built fresh each render, exactly as the inline `SessionProvider value={{…}}`
  // object was. Typing it as `StudySessionSlice` is what stops a field being
  // silently dropped on the way out.

  const slice: StudySessionSlice = {
    sessionActive,
    roundState,
    roundInput,
    roundFeedback,
    roundFeedbackTone,
    roundFeedbackAnswer,
    roundFeedbackPoints,
    roundPerformanceLabel,
    roundResponseMs,
    roundSrsResult,
    roundExampleSentence,
    isRoundResolving,
    roundAdvancePending,
    roundAdvanceError,
    sessionScore,
    sessionRounds,
    sessionPoints,
    sessionStreak,
    sessionBestStreak,
    sessionTargetItems,
    retryTargetItems,
    roundComboBonus,
    roundMilestoneStreak,
    sessionRunReport,
    sessionStartPending,
    sessionSummaryLoading,
    sessionGoalError,
    lastSessionSummary,
    livesEnabled,
    livesRemaining,
    leechFocusEnabled,
    confidenceCaptureEnabled,
    roundConfidenceScore,
    activeSessionLengthPreset,
    upcomingCards,
    answerInputRef,
    startSession: (game) => { void startSession(game) },
    submitAnswer,
    continueLastSession,
    skipFeedback,
    setRoundInput,
    setRoundConfidence: setRoundConfidenceScore,
    setSessionLength: setSessionTargetItems,
    toggleLives: () => {
      setLivesEnabled((previous) => !previous)
      setLivesRemaining(DEFAULT_LIVES)
    },
    // The learner's own choice: saved, and it replaces any session-only override.
    toggleLeechFocus: () => {
      setSavedLeechFocus(!leechFocusEnabled)
      setLeechFocusOverride(null)
    },
    // Also the learner's own choice: a value set outright is saved like a toggle.
    setLeechFocus: (value: boolean) => {
      setSavedLeechFocus(value)
      setLeechFocusOverride(null)
    },
    toggleConfidence: () => setConfidenceCaptureEnabled((previous) => !previous),
  }

  return {
    slice,

    sessionActive,
    roundState,
    sessionRounds,
    leechFocusEnabled,
    activeSessionId,
    explicitReviewItems,
    showResumeToast,
    resumeData,
    explicitReviewItemsRef,

    startSession,
    startMissedWordReview,
    returnToDailyGames,
    handleRetry,
    handleResume,
    handleDismissResume,
    submitHandwritingOutcome,

    resetSessionCore,
    resetSessionWithLives,
    resetSessionFull,
    resetSessionForDbReset,
    clearLastRunReport,
    requestResumeSession,
  }
}
