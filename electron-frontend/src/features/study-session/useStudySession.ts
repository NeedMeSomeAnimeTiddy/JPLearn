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
  PersistedSession,
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
import { assessConjugationAnswer, assessTypedAnswer } from '../../lib/answerAssessment'
import { buildConjugationPool } from './conjugationRound'
import type { TypedAnswerState } from '../../lib/answerAssessment'
import { assessTypedRecallAnswer } from '../../lib/typedRecallAssessment'
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
  const [resumeRequest, setResumeRequest] = useState<{ script: ScriptKey; minigame: MinigameKey } | null>(null)
  const [sessionStartPending, setSessionStartPending] = useState<boolean>(false)
  const [sessionSummaryLoading, setSessionSummaryLoading] = useState<boolean>(false)
  const [sessionGoalError, setSessionGoalError] = useState<string | null>(null)
  const [explicitReviewItems, setExplicitReviewItems] = useState<ExplicitReviewItem[] | null>(null)
  const [showResumeToast, setShowResumeToast] = useState<boolean>(false)
  const [resumeData, setResumeData] = useState<PersistedSession | null>(null)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(() => loadSessionPrefs()?.livesEnabled ?? false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)
  const [leechFocusEnabled, setLeechFocusEnabled] = useState<boolean>(() => loadSessionPrefs()?.leechFocusEnabled ?? false)
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
  const seenCardIdsRef = useRef<number[]>([])
  const wrongCardIdsRef = useRef<number[]>([])
  const nearMissCardIdsRef = useRef<number[]>([])
  const retryCardsRef = useRef<GameCard[] | null>(null)
  const retryTargetItemsRef = useRef<number | null>(null)
  const explicitReviewItemsRef = useRef<ExplicitReviewItem[] | null>(null)
  const explicitReviewCursorRef = useRef(0)
  const explicitReviewPersistenceRequestRef = useRef(0)
  const feedbackAdvanceRef = useRef<(() => void) | null>(null)
  const roundCycleRef = useRef<number[]>([])
  const roundCursorRef = useRef<number>(0)
  const queueBucketCountsRef = useRef<{ due: number; leech: number; new: number; review: number } | null>(null)
  const interleaveCursorRef = useRef<number>(0)
  /** Monotonic per-round seed; see nextRoundMode. */
  const promptSeedRef = useRef<number>(0)

  // ── Resume detection ───────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return
      const parsed: PersistedSession = JSON.parse(raw)
      if (!parsed.activeScript || !parsed.activeGame || !Array.isArray(parsed.seenCardIds) || !parsed.restore) return
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
      queueBucketCountsRef.current = queue?.queue ? {
        due: queue.queue.buckets_due,
        leech: queue.queue.buckets_leech,
        new: queue.queue.buckets_new,
        review: queue.queue.buckets_review,
      } : null
    } catch {
      roundCycleRef.current = shuffleArray([...Array(sourceCards.length).keys()])
      queueBucketCountsRef.current = null
    }
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
    setSessionRunReport(null)
    setActiveSessionId(null)
  }, [resetSessionFull])

  const clearLastRunReport = useCallback((): void => {
    setLastSessionSummary(null)
    setSessionRunReport(null)
  }, [])

  const requestResumeSession = useCallback((request: { script: ScriptKey; minigame: MinigameKey }): void => {
    setResumeRequest(request)
  }, [])

  function saveSessionPrefs(): void {
    // Merged rather than written whole: block selection shares this blob and is
    // owned by a different hook, so rebuilding the object here would drop it.
    mergeSessionPrefs({
      script: activeScript,
      game: activeGame,
      livesEnabled,
      leechFocusEnabled,
      confidenceCaptureEnabled,
      sessionTargetItems,
    })
  }

  useEffect(() => {
    saveSessionPrefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScript, activeGame, livesEnabled, leechFocusEnabled, confidenceCaptureEnabled, sessionTargetItems])

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
    seenCardIdsRef.current = []
    wrongCardIdsRef.current = []
    nearMissCardIdsRef.current = []
    try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const previouslyActive = previousSessionActiveRef.current
    previousSessionActiveRef.current = sessionActive

    if (!previouslyActive || sessionActive || !activeSessionId) return

    const capturedWrongCardIds = [...wrongCardIdsRef.current]
    const capturedNearMissCardIds = [...nearMissCardIdsRef.current]
    clearPersistedSession()

    const completedRounds = sessionRounds
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

    setSessionSummaryLoading(true)
    setSessionGoalError(null)
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
    const cursor = roundCursorRef.current
    const cycle = roundCycleRef.current
    const result: GameCard[] = []
    for (let index = cursor; index < cycle.length && result.length < 5; index += 1) {
      const cardIndex = cycle[index]
      if (cardIndex < activeBlockCards.length) {
        result.push(activeBlockCards[cardIndex])
      }
    }
    return result
    // queueRevision is a state counter bumped when the queue or cursor changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionActive, activeBlockCards, explicitReviewItems, queueRevision])

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
      setSessionRunReport(null)
      setActiveSessionId(null)
      seenCardIdsRef.current = []
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

  const returnToDailyGamesHub = useCallback((): void => {
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
    navigate('daily_games', 'back')
  }, [resetSessionEnd, navigate])

  const startSession = useCallback(async (selectedGame: MinigameKey = activeGame, customCards?: GameCard[], customTargetItems?: number, restore?: PersistedSessionRestore) => {
    setSessionStartPending(true)
    resetRoundCycle()
    setSessionGoalError(null)
    setLastSessionSummary(null)
    setSessionRunReport(null)
    setActiveSessionId(null)
    seenCardIdsRef.current = []
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
        ?? (leechFocusEnabled && activeBlockCards.filter((card) => card.is_leech).length > 0
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

      const goalRequest = window.jplearnDesktop?.startSessionGoal({
          targetItems: goalTargetItems,
        })

      await hydrateRoundCycle(modeCards)
      const index = nextCardIndex(modeCards.length)
      const nextRound = index === null
        ? null
        : await buildRoundWithBridge(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
      if (!nextRound) {
    setSessionActive(false)
    setRoundState(null)
        if (leechFocusEnabled && activeBlockCards.filter((card) => card.is_leech).length === 0) {
          setGameError('No cards flagged for review. Disable Leech Focus to play normally.')
        } else {
          setGameError('This block has too few cards for this minigame. Try a different block.')
        }
        return
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
      try {
        const goalResponse: SessionGoalStartResponse = await goalRequest
        if (!goalResponse.ok) {
          setSessionGoalError('Unable to start session goal.')
        } else {
          setActiveSessionId(goalResponse.goal.session_id)
        }
      } catch (error: unknown) {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session goal.')
      }
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
    leechFocusEnabled,
    nextCardIndex,
    nextRoundMode,
    resetRoundCycle,
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
    if (gameLoading || sessionStartPending) return

    const { minigame } = resumeRequest
    setResumeRequest(null)
    void startSession(minigame)
  }, [activeScript, gameLoading, resumeRequest, sessionStartPending, startSession])

  const handleResume = useCallback(async () => {
    if (!resumeData) return
    const data = resumeData
    setShowResumeToast(false)
    setResumeData(null)
    clearPersistedSession()

    setActiveScript(data.activeScript)
    setActiveGame(data.activeGame)
    setLivesEnabled(data.livesEnabled)
    setLeechFocusEnabled(data.leechFocusEnabled)
    setConfidenceCaptureEnabled(data.confidenceCaptureEnabled)

    try {
      const deckPayload = await window.jplearnDesktop.getDeckCards(data.activeScript)
      const seenSet = new Set(data.seenCardIds)
      const remainingCards = deckPayload.cards.filter((c) => !seenSet.has(c.id))
      const targetItems = Math.max(1, remainingCards.length)
      setSessionTargetItems(targetItems)

      navigate('minigame', 'forward')

      if (targetItems > 0) {
        setTimeout(() => {
          startSession(data.activeGame, remainingCards, targetItems, data.restore)
        }, 100)
      }
    } catch {
      navigate('minigame', 'forward')
      startSession(data.activeGame)
    }
  }, [
    resumeData,
    startSession,
    clearPersistedSession,
    setActiveGame,
    setActiveScript,
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
        returnToDailyGamesHub()
        return
      }
      const candidate = buildRound([nextItem.card], 'romaji_sprint', 0, false, 0)
      if (!candidate) {
        returnToDailyGamesHub()
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
    returnToDailyGamesHub,
  ])

  const submitAnswer = useCallback(
    (answer: string, correctnessOverride?: boolean, handwritingOutcome?: HandwritingOutcome) => {
      if (!roundState || isRoundResolving) return
      if (answer.trim().length === 0) return

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
            ? (() => {
              const candidates = [
                roundState.answer,
                roundState.focusText,
                roundState.dictionaryNote?.reading,
                roundState.dictionaryNote?.primaryGloss,
                ...(roundState.dictionaryNote?.secondaryGlosses ?? []),
              ]
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value) => value.length > 0)

              let bestAssessment: TypedAnswerState = 'incorrect'
              for (const candidate of candidates) {
                const candidateAssessment = assessTypedAnswer(candidate, answer)
                if (candidateAssessment === 'exact') {
                  return 'exact'
                }
                if (candidateAssessment === 'near_miss') {
                  bestAssessment = 'near_miss'
                }
              }
              return bestAssessment
            })()
            : roundState.mode === 'dictation'
              ? assessTypedAnswer(roundState.answer, answer)
              : roundState.mode === 'romaji_sprint'
                ? (() => {
                    const variants = roundState.answer.split('/').map(v => normalizeText(v.trim()))
                    return variants.some(v => normalizeText(answer) === v) ? 'exact' : 'incorrect'
                  })()
                : roundState.mode === 'conjugation_drill'
                  ? assessConjugationAnswer(
                    roundState.acceptedAnswers ?? [roundState.answer],
                    answer,
                  )
                  : null
      const isCorrect = correctnessOverride
        ?? (typedAssessment !== null
          ? typedAssessment !== 'incorrect'
          : normalizeText(answer) === normalizeText(roundState.answer))
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
        if ((roundState.mode === 'typed_recall' || roundState.mode === 'speech_recall' || roundState.mode === 'dictation') && typedAssessment === 'near_miss') {
          setRoundFeedback(`Close enough — we’ll count it! ${pointsCopy}${comboCopy}.`)
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
          const current = prev[activeScript][answeredCardId] ?? 0
          return {
            ...prev,
            [activeScript]: {
              ...prev[activeScript],
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
        if (isImposterMode(roundState.mode)) {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage - 1)
          setRoundFeedback(`Not quite. Stage ${roundState.curriculumStage} → ${nextStage}.`)
        } else if (isParticleClozeMode(roundState.mode)) {
          const info = PARTICLE_EXPLANATIONS[roundState.answer]
          setRoundFeedback(info
            ? `Not quite. The answer is ${roundState.answer} (${info.romaji}) — ${info.explanation}.`
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
          const current = prev[activeScript][answeredCardId] ?? 0
          return {
            ...prev,
            [activeScript]: {
              ...prev[activeScript],
              [answeredCardId]: Math.max(current - 1, 0),
            },
          }
        })
        if (!wrongCardIdsRef.current.includes(answeredCardId)) {
          wrongCardIdsRef.current.push(answeredCardId)
        }
      }

      const answeredCardId = roundState.cardId
      if (!seenCardIdsRef.current.includes(answeredCardId)) {
        seenCardIdsRef.current.push(answeredCardId)
      }

      const confidenceForAnswer = confidenceCaptureEnabled ? roundConfidenceScore : undefined

      if (!explicitReviewItemsRef.current) {
        try {
          const data: PersistedSession = {
            activeScript,
            activeGame,
            livesEnabled,
            leechFocusEnabled,
            confidenceCaptureEnabled,
            sessionTargetItems,
            seenCardIds: [...seenCardIdsRef.current],
            sessionStartedAt: new Date().toISOString(),
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
            returnToDailyGamesHub()
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

      void (async () => {
        let persistenceSucceeded = false
        try {
          const result = await window.jplearnDesktop?.recordGameResult({
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
          })
          if (!result) throw new Error('Review persistence unavailable')
          persistenceSucceeded = true
          if (
            isExplicitReview
            && explicitReviewPersistenceRequestRef.current === persistenceRequestId
            && explicitReviewItemsRef.current
          ) {
            setRoundAdvancePending(false)
            feedbackAdvanceRef.current = advanceFeedback
          }
          if (
            isGrammarCurriculumMode(roundState.mode) &&
            typeof result.curriculum_stage === 'number'
          ) {
            const resolvedStage = normalizeCurriculumStage(result.curriculum_stage)
            setDeckCards((previousCards) =>
              previousCards.map((entry) =>
                entry.id === roundState.cardId
                  ? { ...entry, curriculum_stage: resolvedStage }
                  : entry,
              ),
            )
          }
          if (result.repetitions != null) {
            setRoundSrsResult({
              repetitions: result.repetitions,
              interval: result.interval,
              next_review: result.next_review,
              ease_factor: result.ease_factor,
            })
          }
          // Reconcile the optimistic ±1 step above against the stored counter
          // (issue #66). The two agree in the normal case; they diverge when a
          // write was lost or replayed, and SQLite is the source of truth now.
          if (typeof result.mastery_score === 'number') {
            const storedScore = result.mastery_score
            setCardScores((prev) => (
              prev[activeScript][roundState.cardId] === storedScore
                ? prev
                : {
                    ...prev,
                    [activeScript]: { ...prev[activeScript], [roundState.cardId]: storedScore },
                  }
            ))
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
            setTimeout(() => setXpToasts((prev) => prev.filter((t) => t.id !== id)), 2500)
          }
          if (result.milestones_reached && result.milestones_reached.length > 0) {
            const newToasts = result.milestones_reached.map((descriptor, index) => ({
              id: Date.now() + index,
              descriptor,
            }))
            setMilestoneToasts((prev) => [...prev, ...newToasts])
            for (const toast of newToasts) {
              setTimeout(() => setMilestoneToasts((prev) => prev.filter((t) => t.id !== toast.id)), 3500)
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
        } catch {
          if (
            isExplicitReview
            && !persistenceSucceeded
            && explicitReviewPersistenceRequestRef.current === persistenceRequestId
            && explicitReviewItemsRef.current
          ) {
            setRoundAdvancePending(false)
            setRoundAdvanceError(true)
            feedbackAdvanceRef.current = null
          }
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
      returnToDailyGamesHub,
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
      setDeckCards,
      setMilestoneToasts,
      setMinigameStats,
      setScriptStats,
      setXpProgress,
      setXpToasts,
    ],
  )

  const submitHandwritingOutcome = useCallback((outcome: HandwritingOutcome) => {
    if (!roundState || roundState.mode !== 'handwriting') return
    submitAnswer(roundState.answer, isHandwritingOutcomeCorrect(outcome), outcome)
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
    queueBucketCounts: queueBucketCountsRef.current,
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
    toggleLeechFocus: () => setLeechFocusEnabled((previous) => !previous),
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
    returnToDailyGamesHub,
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
