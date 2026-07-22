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
  KanjiCategory,
  MinigameKey,
  MinigameStatsByScript,
  NavDirection,
  PlayableMinigame,
  RoundState,
  ScriptDeck,
  ScriptKey,
  StatsByScript,
  StudyQueueResponse,
  VocabCategory,
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
  activeKanjiCategory: KanjiCategory
  activeVocabCategory: VocabCategory
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

  // ── Progress/gamification writes from the review path ────────────────────
  setCardScores: Dispatch<SetStateAction<CardScores>>
  setScriptStats: Dispatch<SetStateAction<StatsByScript>>
  setMinigameStats: Dispatch<SetStateAction<MinigameStatsByScript>>
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
  resumeData: import('../../types').PersistedSession | null

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
  ) => Promise<void>
  startMissedWordReview: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
  returnToDailyGamesHub: () => void
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
  /** Queues a session start that waits for `activeScript` to catch up. */
  requestResumeSession: (request: { script: ScriptKey; minigame: MinigameKey }) => void
}
