import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { SessionContextValue } from '../../context/SessionContext'
import type { AssistantToast } from '../tutor/types'
import type { HandwritingOutcome } from '../handwriting'
import type { DailyGamesMissedWordPayload, GameCard } from '../../generated/types'
import type {
  AppView,
  CardScores,
  DeckSlugInput,
  ExplicitReviewItem,
  MinigameKey,
  NavDirection,
  PlayableMinigame,
  RoundState,
  ScriptDeck,
  ScriptKey,
  StatsByScript,
  StudyQueueResponse,
  XPProgress,
} from '../../types'

/**
 * The part of `SessionContextValue` that the study session actually owns.
 *
 * The context value is a composite: it also folds in voice state and
 * `blockSessionComplete`, which is derived from mastery (`cardScores`) and the
 * active deck block. Those are not session state, and pulling them in here just
 * to let the hook "own the interface" would relocate the coupling rather than
 * remove it. App merges the four back in at the `SessionProvider` call site.
 *
 * Deriving this by `Omit` rather than restating the fields keeps tsc enforcing
 * both halves: the hook cannot drop a field, and App cannot forget to supply one.
 */
export type StudySessionSlice = Omit<
  SessionContextValue,
  'blockSessionComplete' | 'voiceBusy' | 'voiceUnavailable' | 'playAudio'
>

/**
 * Everything the session reads from, or writes to, outside itself.
 *
 * These are passed explicitly rather than letting the hook reach into App state:
 * `submitAnswer` in particular is the "review recorded" path and writes a lot
 * that is not session state (mastery, XP, per-script stats, deck cards).
 */
export interface StudySessionDeps {
  // ── Ambient app state the session reads ──────────────────────────────────
  view: AppView
  activeScript: ScriptKey
  activeGame: MinigameKey
  activeDeckSlug: DeckSlugInput
  /** Cards for the active block — the pool a normal (non-explicit-review) run draws from. */
  activeBlockCards: ScriptDeck['cards']
  /** Full loaded deck; `handleRetry` resolves card ids against this, not the block. */
  deckCards: ScriptDeck['cards']
  scriptStats: StatsByScript
  gameLoading: boolean

  // ── Navigation / deck state the session writes ───────────────────────────
  /** From useAppNavigation — sets view (and optionally direction) in one call. */
  navigate: (next: AppView, direction?: NavDirection) => void
  setActiveScript: Dispatch<SetStateAction<ScriptKey>>
  setActiveGame: Dispatch<SetStateAction<MinigameKey>>
  setGameError: Dispatch<SetStateAction<string | null>>
  setDeckCards: Dispatch<SetStateAction<ScriptDeck['cards']>>
  /**
   * Puts the app on `script` at the level `deckSlug` names, holding `gameLoading` until that deck
   * has loaded when it is not the one already open. Resume uses it to reopen the saved deck.
   */
  openStudyDeck: (script: ScriptKey, deckSlug: DeckSlugInput) => void

  // ── Progress/gamification writes from the review path ────────────────────
  setCardScores: Dispatch<SetStateAction<CardScores>>
  setScriptStats: Dispatch<SetStateAction<StatsByScript>>
  setXpProgress: Dispatch<SetStateAction<XPProgress | null>>
  setXpToasts: Dispatch<SetStateAction<Array<{ id: number; xp: number; levelBefore?: number; levelAfter?: number }>>>
  setMilestoneToasts: Dispatch<SetStateAction<Array<{ id: number; descriptor: string }>>>

  // ── Injected collaborators ───────────────────────────────────────────────
  resolveScriptMinigame: (script: ScriptKey, minigame: MinigameKey) => MinigameKey
  buildRound: (
    cards: ScriptDeck['cards'],
    minigame: PlayableMinigame,
    cardIndex: number,
    surprisePrompt: boolean,
    promptSeed: number,
  ) => RoundState | null
  buildRoundWithBridge: (
    cards: ScriptDeck['cards'],
    minigame: PlayableMinigame,
    cardIndex: number,
    surprisePrompt: boolean,
    promptSeed: number,
  ) => Promise<RoundState | null>
  /**
   * Study-queue reads and cache invalidation are injected because
   * `studyQueueCacheRef` is owned by deck loading, not by the session: two of
   * its three readers are `getStudyQueueDeduped` and
   * `refreshDeckProgressAfterSeedChange`. Moving the ref here would split it.
   */
  getStudyQueue: (slug: DeckSlugInput, options?: { preferCache?: boolean }) => Promise<StudyQueueResponse>
  invalidateStudyQueue: (slug: DeckSlugInput) => void
  onSessionStart: () => void
  onSessionEnd: () => void
  queueAssistantToast: (toast: AssistantToast | null) => void
}

/**
 * What the hook hands back: the context slice, plus the session internals that
 * App-resident code genuinely still needs.
 */
export interface StudySessionApi {
  /** Spread into the `SessionProvider` value alongside voice + blockSessionComplete. */
  slice: StudySessionSlice

  // ── Reads that App-resident derivations need ─────────────────────────────
  sessionActive: boolean
  roundState: RoundState | null
  sessionRounds: number
  leechFocusEnabled: boolean
  activeSessionId: string | null
  explicitReviewItems: ExplicitReviewItem[] | null
  showResumeToast: boolean
  resumeData: import('./persistedSession').PersistedStudySession | null

  /**
   * Exposed as the ref *object*, not a snapshot: the Escape handler and
   * `MinigameView`'s onBack both read `.current` imperatively and stay in App.
   * Handing out a copy would give two ref objects that silently desync.
   */
  explicitReviewItemsRef: RefObject<ExplicitReviewItem[] | null>

  // ── Actions App invokes ──────────────────────────────────────────────────
  startSession: (
    selectedGame?: MinigameKey,
    customCards?: GameCard[],
    customTargetItems?: number,
    restore?: import('../../types').PersistedSessionRestore,
    /** Session-only leech focus; absent means the learner's own saved setting (audit 3, Q2). */
    leechFocus?: boolean,
  ) => Promise<void>
  startMissedWordReview: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
  returnToDailyGames: () => void
  handleRetry: (cardIds: number[]) => void
  handleResume: () => Promise<void>
  handleDismissResume: () => void
  submitHandwritingOutcome: (outcome: HandwritingOutcome) => void

  resetSessionCore: () => void
  resetSessionWithLives: () => void
  resetSessionFull: () => void
  /** Full wipe plus the run-report/goal teardown the DB reset needs. */
  resetSessionForDbReset: () => void
  /** Clears the last run's report + summary, without touching the live round. */
  clearLastRunReport: () => void
  /**
   * Queues a session start that waits for `activeScript` to catch up. `leechFocus`
   * sets leech focus for that session only, unsaved: an "Up next" row raised by
   * `leeches_detected` turns it on (audit 3, Q2). When the session ends or another
   * starts, the learner's own setting (`slice.toggleLeechFocus`) applies again.
   */
  requestResumeSession: (request: { script: ScriptKey; minigame: MinigameKey; leechFocus?: boolean }) => void
}

/**
 * What the session keeps about one answer until its save outcome arrives (audit 1, F1/F3): which
 * card and section it belongs to, which round it was given in, and how an explicit review's
 * advance resumes once it saves.
 */
export interface AnswerContext {
  /** `${slug}:${cardId}`, matching the main process's queue */
  cardKey: string
  /** the deck the answer was saved against, whose study queue a late save makes stale */
  slug: DeckSlugInput
  /** set once the main process has admitted it; an admitted answer that leaves the queue unseen is lost */
  admitted: boolean
  script: ScriptKey
  cardId: number
  mode: RoundState['mode']
  round: RoundState
  isExplicitReview: boolean
  persistenceRequestId: number
  advanceFeedback: () => void
  sessionId: string | null
}
