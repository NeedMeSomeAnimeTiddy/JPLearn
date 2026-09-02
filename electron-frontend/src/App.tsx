import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type {
  AppSettings,
  BlockInfo,
  BlockProgressPayload,
  CardScores,
  DeckSlugInput,
  KanjiDeckSlug,
  VocabDeckSlug,
  JlptLevel,
  LearningPathStatus,
  MinigameKey,
  MinigameStatsByScript,
  OverviewCategoryBlocks,
  OverviewKanjiCard,
  OverviewSectionKey,
  PlayableMinigame,
  RoundState,
  ScriptDeck,
  ScriptKey,
  SectionReadiness,
  SessionPrefOverrides,
  SettingsTabKey,
  ShortcutSubmenuKey,
  StatsByScript,
  StudyPlanCoverageRow,
  StudyQueueResponse,
  StudySummaryPayload,
  VocabCategory,
  XPProgress,
} from './types'
import type { StudyBlockPayload } from './generated/types'
import { SetupWizard } from './components/SetupWizard'
import { DictionaryPopup } from './components/DictionaryPopup'
import { ResumeToast } from './components/ResumeToast'
import { CloseConfirmDialog } from './components/CloseConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppTitlebar } from './components/AppTitlebar'
import { AppSettingsModal } from './components/AppSettingsModal'
import { ScriptHubView } from './views/ScriptHubView'
import { MinigameView } from './views/MinigameView'
import { OverviewView } from './views/OverviewView'
import { JLPTPrepView } from './views/JLPTPrepView'
import { PassageHubView } from './views/PassageHubView'
import { DAILY_GAMES_COPY } from './features/daily-games/constants'
import { dedupeDictionaryCards } from './features/card-notes'
import { KanjiDetailPanel } from './features/kanji-detail'
import { BADGE_METADATA } from './features/achievements'
import { OnboardingWizard } from './features/onboarding'
import { ReadinessWarningModal } from './components/ReadinessWarningModal'
import { useKeyboardCheatsheet, KeyboardCheatsheet } from './features/keyboard'
import { useCommandPalette, CommandPalette } from './features/command-palette'
import { useLookup, LookupOverlay, isTypingTarget } from './features/lookup'
import { flyHome, flyToSection, valleyIsFlying } from './valley/flights'
import {
  useMenuL1, useWorldData, useReadiness, useDeckBlocks,
  MenuL1, PathL2, Lanes, Ascent, Ledger, Scenes, Wall, Library, ExamLevel, Drills, Deck, Feed, Unlock,
  practiceLanes, worldLanes, ascentRungs, scenes as buildScenes, libraryRows, levelDetail, milestone,
  unlockMoment, heroFromStudyBlock, crownFrom, rowsFrom, type MenuSectionKey,
} from './features/menu'
import type { Command } from './features/command-palette'
import { SessionProvider } from './context/SessionContext'
import { useAppNavigation, useMenuPath, VIEW_PARENT } from './features/navigation'
import { KANJI_MEANINGS } from './lib/kanjiMeanings'
import { ArrowLeft, Trophy } from 'lucide-react'
import {
  STATS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  CARD_SCORES_STORAGE_KEY,
  SUMMARY_SNAPSHOT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  EXPERTISE_LEVEL_TO_SCRIPT_KEYS,
  deriveExpertiseLevelFromChecked,
  EMPTY_SCRIPT_STATS,
  defaultMinigameStatsByScript,
  loadSavedStats,
  loadSettings,
  loadCardScores,
  loadSessionPrefs,
  loadSummarySnapshot,
  saveSummarySnapshot,
} from './lib/appStorage'
import { emptyCardScores, hasAnyCardScore, toSectionScores } from './lib/cardScores'
import {
  normalizeDeckCards,
  limitRuntimeDeckCards,
  normalizeBlockList,
} from './lib/deckUtils'
import {
  buildJlptLevelProgress,
  buildJlptLevelProgressFromLevelDecks,
  buildCategoryProgress,
} from './lib/progressAggregation'
import {
  buildStudyPlan,
} from './lib/studyPlan'
import { categoryLevelOf } from './lib/categoryLevels'
import { CARD_MASTERY_MAX } from './constants'
import {
  buildRound as buildRoundImpl,
  buildRoundWithBridge as buildRoundWithBridgeImpl,
  buildConjugationPool,
  useStudySession,
} from './features/study-session'
import './App.css'
import { useBlockSelection, describeSelection } from './features/block-selection'
import { useVocabFeed, isFedDeck } from './features/vocab-feed'
import { useProgression, LOCKED_NODE_REASON } from './features/progression'
import type { ProgressionNodeView } from './features/progression'
import { computeMinigameLockReasons } from './lib/minigameAvailability'
import { useTheme, type ThemeSettingsFields } from './features/theme'
import { useVoice, splitSpeechSegments, type VoiceSettingsFields } from './features/voice'
import { useModels } from './features/models'
import { useTutor, TutorPanel, TutorToast, type TutorSettingsFields } from './features/tutor'
import type { AssistantToast } from './features/tutor/types'
import { useScenarioTutor } from './features/scenario-tutor'
import { useCursor, CursorFollower, type CursorSettings } from './features/cursor'
import { useWindowDrag } from './features/window-drag'
import { usePomodoro, BreakOverlay, type PomodoroSettingsFields } from './features/pomodoro'
import { DevDashboard } from './features/devtools'
import {
  MINIGAMES,
  SCRIPT_MINIGAMES,
  SCRIPT_LABELS,
  VOCAB_CATEGORY_ORDER,
  VOCAB_CATEGORY_LABELS,
  VOCAB_CATEGORY_TO_DECK_SLUG,
  formatRoundModeLabel,
  PETAL_STREAM,
  FONT_SIZE_ORDER,
  FONT_SIZE_LABEL,
  APP_FONT_OPTIONS,
  isAppFontPreset,
} from './constants'

const STUDY_QUEUE_CACHE_TTL_MS = 45000
const DECK_LOAD_TIMEOUT_MS = 15000
const STARTUP_WARMUP_INITIAL_DELAY_MS = 900
const STARTUP_WARMUP_YIELD_DEADLINE_MS = 45
const DailyGamesHub = lazy(() => import('./features/daily-games/components/GamesHub'))

function App() {
  // First-run setup wizard check — must be the first hooks so the conditional
  // return (added near the bottom of App) comes after all other hooks.
  const [showWizard, setShowWizard] = useState<boolean | null>(null)
  useEffect(() => {
    const api = window.jplearnDesktop
    if (typeof api?.isFirstRun !== 'function') {
      setShowWizard(false)
      return
    }
    const isFirstRun = api.isFirstRun // narrowed reference
    const check = async () => {
      try {
        const first = await isFirstRun() as boolean
        setShowWizard(first)
      } catch {
        setShowWizard(false)
      }
    }
    void check()
  }, [])

  const nav = useAppNavigation()
  const { view, navDirection, navigate } = nav
  const [summary, setSummary] = useState<StudySummaryPayload | null>(() => loadSummarySnapshot())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(() => loadSummarySnapshot() === null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [activeScript, setActiveScript] = useState<ScriptKey>(() => loadSessionPrefs()?.script ?? 'hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>(() => loadSessionPrefs()?.game ?? 'romaji_sprint')
  const [deckCards, setDeckCards] = useState<ScriptDeck['cards']>([])
  const [blockProgress, setBlockProgress] = useState<BlockInfo[]>([])
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)

  const [scriptStats, setScriptStats] = useState<StatsByScript>(() => loadSavedStats())
  const [minigameStats, setMinigameStats] = useState<MinigameStatsByScript>(() => defaultMinigameStatsByScript())
  const [cardScores, setCardScores] = useState<CardScores>(() => loadCardScores())
  const [overviewBlocks, setOverviewBlocks] = useState<Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>>({})
  const [overviewCategoryBlocks, setOverviewCategoryBlocks] = useState<OverviewCategoryBlocks>({
    vocab_n5: [],
    grammar_patterns: [],
  })
  const [overviewKanjiDeck, setOverviewKanjiDeck] = useState<OverviewKanjiCard[]>([])
  const [activeKanjiLevel, setActiveKanjiLevel] = useState<JlptLevel>('n5')
  const [activeVocabLevel, setActiveVocabLevel] = useState<JlptLevel>('n5')
  const [kanjiDeckCardsByLevel] = useState<Record<JlptLevel, ScriptDeck['cards']>>({
    n5: [], n4: [], n3: [], n2: [], n1: [],
  })
  const [vocabDeckCardsByLevel] = useState<Record<JlptLevel, ScriptDeck['cards']>>({
    n5: [], n4: [], n3: [], n2: [], n1: [],
  })
  const [activeVocabCategory, setActiveVocabCategory] = useState<VocabCategory>('greetings')
  const [vocabDeckCardsByCategory, setVocabDeckCardsByCategory] = useState<Record<VocabCategory, ScriptDeck['cards']>>({
    greetings: [], numbers: [], time_days: [], family: [], body: [],
    food_drink: [], school_study: [], places: [], transport: [],
    adjectives: [], verbs: [], nouns: [],
    n4_school_work: [], n4_home_living: [], n4_travel_places: [], n4_feelings_character: [],
    n3_work_business: [], n3_emotion_mind: [], n3_society_people: [], n3_nature_science: [],
    n2_economy_trade: [], n2_government_society: [], n2_measure_analysis: [], n2_land_construction: [],
    n1_law_justice: [], n1_thought_reason: [], n1_conflict_crisis: [], n1_arts_expression: [],
  })
  const [kanjiOverviewPage, setKanjiOverviewPage] = useState<Partial<Record<JlptLevel, number>>>({})
  const [overviewBlocksLoading, setOverviewBlocksLoading] = useState(false)

  const pageLoading = loading || gameLoading
  const pageLoadingLabel = gameLoading ? 'Loading deck cards…' : 'Loading…'
  const [charMasteryExpanded, setCharMasteryExpanded] = useState(false)
  const [expandedBlocks, setExpandedBlocks] = useState<string | null>(null)
  const [xpProgress, setXpProgress] = useState<XPProgress | null>(null)
  const [xpToasts, setXpToasts] = useState<Array<{ id: number; xp: number; levelBefore?: number; levelAfter?: number }>>([])
  const [milestoneToasts, setMilestoneToasts] = useState<Array<{ id: number; descriptor: string }>>([])
  const [studyBlock, setStudyBlock] = useState<StudyBlockPayload | null>(null)
  const [learningPathStatus, setLearningPathStatus] = useState<LearningPathStatus | null>(null)
  const [warningModal, setWarningModal] = useState<{
    sectionId: ScriptKey | 'jlpt_prep'
    label: string
    readiness: SectionReadiness
    reason: string
  } | null>(null)
  const warnedSectionsRef = useRef<Set<string>>(new Set())
  const [learningPathExpanded, setLearningPathExpanded] = useState(false)
  const [overviewSectionExpanded, setOverviewSectionExpanded] = useState<Record<OverviewSectionKey, boolean>>({
    studyActivity: false,
    sessionHistory: false,
    mistakeBreakdown: false,
    minigamePerformance: false,
    deckSnapshot: false,
    achievements: false,
  })

  interface SelectedChar {
    character: string
    romaji: string
    meaning: string
    label: string
    score: number
  }
  const [selectedChar, setSelectedChar] = useState<SelectedChar | null>(null)
  const [kanjiDetailCharacter, setKanjiDetailCharacter] = useState<string | null>(null)
  const kanjiDetailTriggerRef = useRef<HTMLElement | null>(null)
  const tutorTitlebarButtonRef = useRef<HTMLButtonElement | null>(null)

  const openKanjiDetail = useCallback((character: string, trigger: HTMLElement) => {
    kanjiDetailTriggerRef.current = trigger
    setSelectedChar(null)
    setKanjiDetailCharacter(character)
  }, [])

  const closeKanjiDetail = useCallback(() => {
    const trigger = kanjiDetailTriggerRef.current
    if (!trigger) {
      setKanjiDetailCharacter(null)
      return
    }

    const fallbackId = trigger.dataset.kanjiDetailFocusFallback
    kanjiDetailTriggerRef.current = null
    setKanjiDetailCharacter(null)
    window.setTimeout(() => {
      const fallback = fallbackId ? document.getElementById(fallbackId) : null
      const target = trigger.isConnected
        ? trigger
        : fallback instanceof HTMLElement
          ? fallback
          : document.querySelector<HTMLElement>('[aria-label="Close overview"], [aria-label="Dictionary search"]')
      target?.focus()
    }, 0)
  }, [])

    const [dictionaryOpen, setDictionaryOpen] = useState(false)
    const [dictionarySeedQuery, setDictionarySeedQuery] = useState('')
    const [dictionaryOpenSignal, setDictionaryOpenSignal] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>('appearance')
  const [xpDetailsOpen, setXpDetailsOpen] = useState(false)
  const [streakDetailsOpen, setStreakDetailsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [collapsedSettingsSections, setCollapsedSettingsSections] = useState<Partial<Record<string, boolean>>>({
    theme: true,
    background: true,
    typography: true,
    animations: true,
    'study-display': true,
    cursor: true,
    'tutor-assistant': true,
    'tutor-models': true,
    'offline-dictionary': true,
    'image-ocr': true,
    voice: true,
    'speech-recognition': true,
    'voicevox-runtime': true,
    'pomodoro': true,
    'keyboard-shortcuts': true,
    'close-behavior': true,
    'auto-start': true,
    'backup-restore': true,
    'data-management': true,
    'fsrs-optimization': true,
  })
  const theme = useTheme(
    settings as ThemeSettingsFields,
    setSettings as unknown as Dispatch<SetStateAction<ThemeSettingsFields>>,
    (t: string) => { void window.jplearnDesktop?.setStartupTheme(t) },
    setCollapsedSettingsSections,
  )
  const { isOpen: keyboardCheatsheetOpen, close: closeKeyboardCheatsheet } = useKeyboardCheatsheet()
  const commandPalette = useCommandPalette()
  const lookup = useLookup()

  function openDailyGames(): void {
    closeKanjiDetail()
    setDictionaryOpen(false)
    setShowOverview(false)
    setShowSettings(false)
    tutor.closeTutorPanel()
    navigate('daily_games', 'forward')
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
  }

  useEffect(() => {
    const scripts: ScriptKey[] = ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns', 'sentence_examples']
    const commands: Command[] = [
      { id: 'nav-home', label: 'Go to Home', category: 'navigation', action: () => { navigate('home', 'back') } },
      { id: 'nav-script-hub', label: 'Go to Script Hub', category: 'navigation', action: () => { navigate('script_hub', 'forward') } },
      { id: 'nav-jlpt', label: 'Go to JLPT Prep', category: 'navigation', action: () => { navigate('jlpt_prep', 'forward') } },
      { id: 'nav-daily-games', label: DAILY_GAMES_COPY.title, category: 'navigation', keywords: ['daily', 'games', 'practice'], action: openDailyGames },
      { id: 'nav-overview', label: 'Open Study Overview', category: 'navigation', action: () => { closeKanjiDetail(); setShowOverview(true); void loadSummary() } },
      { id: 'script-hiragana', label: 'Hiragana', category: 'navigation', keywords: ['hiragana', 'script'], action: () => { setActiveScript('hiragana'); navigate('script_hub', 'forward') } },
      { id: 'script-katakana', label: 'Katakana', category: 'navigation', keywords: ['katakana', 'script'], action: () => { setActiveScript('katakana'); navigate('script_hub', 'forward') } },
      { id: 'open-settings', label: 'Open Settings', category: 'settings', shortcut: 'Ctrl+,', action: () => { closeKanjiDetail(); setShowSettings(true) } },
      { id: 'open-keyboard-cheatsheet', label: 'Keyboard Shortcuts', category: 'settings', action: () => { closeKeyboardCheatsheet(); setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })) }, 50) } },
      { id: 'tutor-open-menu', label: 'Open Tutor', category: 'navigation', keywords: ['tutor', 'menu'], action: () => tutor.openTutorPanel() },
      { id: 'tutor-open-chat', label: 'Chat with Tutor', category: 'navigation', keywords: ['tutor', 'chat', 'sensei'], action: () => tutor.openTutorPanel('chat') },
      { id: 'tutor-open-scenarios', label: 'Scenario Practice', category: 'navigation', keywords: ['tutor', 'scenario', 'roleplay', 'conversation'], action: () => tutor.openTutorPanel('scenarios') },
      { id: 'tutor-open-ocr', label: 'Image Translation', category: 'navigation', keywords: ['tutor', 'ocr', 'image', 'translate'], action: () => tutor.openTutorPanel('ocr') },
    ]

    for (const script of scripts) {
      const games = SCRIPT_MINIGAMES[script]
      for (const game of games) {
        if (game === 'interleave_mix') continue
        const label = `${formatRoundModeLabel(game)} (${SCRIPT_LABELS[script]})`
        commands.push({
          id: `play-${game}-${script}`,
          label,
          category: 'study',
          keywords: ['minigame', game, script, SCRIPT_LABELS[script]],
          action: () => {
            setActiveGame(game)
            setShowOverview(false)
            setShowSettings(false)
            session.clearLastRunReport()
            resetSessionWithLives()
            if (script === activeScript) {
              navigate('minigame', 'forward')
              void startSession(game)
            } else {
              setActiveScript(script)
              session.requestResumeSession({ script, minigame: game })
              navigate('minigame', 'forward')
            }
          },
        })
      }
    }

    commandPalette.registerCommands(commands)
    // oxlint-disable-next-line react-hooks/exhaustive-deps — registerCommands is stable, other deps are stable setters
  }, [commandPalette.registerCommands, activeScript])

  useEffect(() => {
    const cleanup = window.jplearnDesktop?.onTrayAction?.((action: string) => {
      if (action === 'start-session') {
        navigate('script_hub', 'forward')
      } else if (action === 'view-overview') {
        closeKanjiDetail()
        setShowOverview(true)
        void loadSummary()
      }
    })
    return cleanup
    // oxlint-disable-next-line react-hooks/exhaustive-deps — loadSummary from useCallback is stable
  }, [])

  const [showOverview, setShowOverview] = useState(false)
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0)
  const [resettingDb, setResettingDb] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [optimizingFSRS, setOptimizingFSRS] = useState(false)
  const [fsrsResult, setFsrsResult] = useState<{ ok: boolean; error?: string; loss_before?: number; loss_after?: number; card_count?: number; log_count?: number } | null>(null)
  const [fsrsCustom, setFsrsCustom] = useState(false)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false)
  const [activeShortcutFlyout, setActiveShortcutFlyout] = useState<ShortcutSubmenuKey | null>(null)
  const [devDashboardOpen, setDevDashboardOpen] = useState(false)
  const [pendingDevCheck, setPendingDevCheck] = useState<string | null>(null)
  const shortcutsSectionRef = useRef<HTMLDivElement | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)
  const scriptLoadRequestIdRef = useRef<number>(0)
  const lastLoadedScriptRef = useRef<ScriptKey>('hiragana')
  const startupBootMarkRef = useRef<number>(performance.now())
  const startupFirstSummaryMsRef = useRef<number | null>(null)
  const startupReadySentRef = useRef(false)
  const xpDetailsRef = useRef<HTMLDivElement | null>(null)
  const streakDetailsRef = useRef<HTMLDivElement | null>(null)
  const vocabCategoryDeckCacheRef = useRef<Partial<Record<VocabCategory, ScriptDeck['cards']>>>({})
  const vocabCategoryBlockCacheRef = useRef<Partial<Record<VocabCategory, BlockInfo[]>>>({})
  // Keyed by deck slug, not ScriptKey: the kanji and vocabulary sections each
  // span five JLPT level decks, and since #78 they load the level deck directly.
  const scriptDeckCacheRef = useRef<Partial<Record<string, ScriptDeck['cards']>>>({})
  const scriptBlockCacheRef = useRef<Partial<Record<string, BlockInfo[]>>>({})
  const deckCardsInFlightRef = useRef<Map<string, Promise<ScriptDeck>>>(new Map())
  const blockProgressInFlightRef = useRef<Map<string, Promise<BlockProgressPayload>>>(new Map())
  const studyQueueInFlightRef = useRef<Map<string, Promise<StudyQueueResponse>>>(new Map())
  const studyQueueCacheRef = useRef<Map<string, { payload: StudyQueueResponse; cachedAtMs: number }>>(new Map())
  const availableMinigames = useMemo(() => SCRIPT_MINIGAMES[activeScript], [activeScript])

  const dictionaryCards = useMemo(() => {
    return dedupeDictionaryCards([...deckCards, ...overviewKanjiDeck])
  }, [deckCards, overviewKanjiDeck])

  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  const openDictionary = useCallback((seedQuery = '') => {
    closeKanjiDetail()
    setShowSettings(false)
    setShowOverview(false)
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
    tutor.closeTutorPanel()
    setXpDetailsOpen(false)
    setStreakDetailsOpen(false)
    setSelectedChar(null)
    setDictionarySeedQuery(seedQuery)
    setDictionaryOpen(true)
    setDictionaryOpenSignal((previous) => previous + 1)
  }, [closeKanjiDetail])

  const closeDictionary = useCallback(() => {
    closeKanjiDetail()
    setDictionaryOpen(false)
    setDictionarySeedQuery('')
  }, [closeKanjiDetail])

  useEffect(() => {
    if (availableMinigames.includes(activeGame)) return
    setActiveGame(availableMinigames[0])
  }, [activeGame, availableMinigames])

  const resolveScriptMinigame = useCallback((script: ScriptKey, minigame: MinigameKey): MinigameKey => {
    const allowedMinigames = SCRIPT_MINIGAMES[script]
    return allowedMinigames.includes(minigame) ? minigame : allowedMinigames[0]
  }, [])

  // Chatbot tier cards show combined footprint (chatbot + its hidden, auto-installed
  // embedder) so the displayed size matches what setup actually downloads.





  // ── Deck/round inputs the study-session hook depends on ────────────────────
  // These are declared ahead of `useStudySession` below because the hook takes
  // them as arguments — `activeBlockCards` in particular is a render-time value,
  // so it cannot be late-bound through a ref.

  // The deck a session studies. For the two levelled sections this is the JLPT
  // *level* deck, not a category: since issue #78 the categories are blocks over
  // that deck, and a selection may hold blocks no category covers. Deriving the
  // slug from a category would then resolve to the wrong (or a stale) deck.
  const activeDeckSlug = useMemo<DeckSlugInput>(() => {
    if (activeScript === 'kanji_n5') return `kanji_${activeKanjiLevel}` as KanjiDeckSlug
    if (activeScript === 'vocab_n5') return `vocab_${activeVocabLevel}` as VocabDeckSlug
    return activeScript
  }, [activeScript, activeKanjiLevel, activeVocabLevel])

  const getStudyQueueDeduped = useCallback(
    (slug: DeckSlugInput, options?: { preferCache?: boolean }): Promise<StudyQueueResponse> => {
      if (typeof window === 'undefined' || !window.jplearnDesktop?.getStudyQueue) {
        return Promise.reject(new Error('Study queue API unavailable'))
      }

      const cacheKey = slug
      const preferCache = options?.preferCache ?? true
      if (preferCache) {
        const cached = studyQueueCacheRef.current.get(cacheKey)
        if (cached && performance.now() - cached.cachedAtMs <= STUDY_QUEUE_CACHE_TTL_MS) {
          return Promise.resolve(cached.payload)
        }
      }

      const inFlight = studyQueueInFlightRef.current.get(cacheKey)
      if (inFlight) return inFlight

      const fetchQueue = async (): Promise<StudyQueueResponse> => {
        try {
          const payload = await window.jplearnDesktop.getStudyQueue(slug)
          studyQueueCacheRef.current.set(cacheKey, {
            payload,
            cachedAtMs: performance.now(),
          })
          return payload
        } finally {
          if (studyQueueInFlightRef.current.get(cacheKey) === request) {
            studyQueueInFlightRef.current.delete(cacheKey)
          }
        }
      }
      const request = fetchQueue()
      studyQueueInFlightRef.current.set(cacheKey, request)
      return request
    },
    [],
  )

  /**
   * `studyQueueCacheRef` stays here rather than moving into `useStudySession`:
   * two of its three readers (`getStudyQueueDeduped`,
   * `refreshDeckProgressAfterSeedChange`) are deck loading, not session. The
   * session invalidates through this callback instead of holding a second
   * reference to the same cache.
   */
  const invalidateStudyQueue = useCallback((slug: DeckSlugInput) => {
    studyQueueCacheRef.current.delete(slug)
  }, [])

  const buildRound = useCallback(
    (
      cards: ScriptDeck['cards'],
      minigame: PlayableMinigame,
      cardIndex: number,
      surprisePrompt: boolean,
      promptSeed: number,
    ): RoundState | null => buildRoundImpl(
      activeScript, cardScores, cards, minigame, cardIndex, surprisePrompt, promptSeed,
    ),
    [activeScript, cardScores],
  )

  const buildRoundWithBridge = useCallback(async (
    cards: ScriptDeck['cards'],
    minigame: PlayableMinigame,
    cardIndex: number,
    surprisePrompt: boolean,
    promptSeed: number,
  ): Promise<RoundState | null> => buildRoundWithBridgeImpl(
    activeScript, cardScores, cards, minigame, cardIndex, surprisePrompt, promptSeed,
  ), [activeScript, cardScores])

  // Which blocks are being studied, and the cards that union to. Selection is
  // derived from stored prefs rather than held here, so blocks arriving from the
  // bridge cannot race it — see features/block-selection.
  const blockSelection = useBlockSelection(activeDeckSlug, blockProgress, deckCards)
  // The vocabulary levels have no blocks to select, so they have a feed instead. The
  // hook answers nothing for every other deck, which is why both can be live at once.
  const vocabFeed = useVocabFeed(activeDeckSlug)
  const activeBlockCards = blockSelection.cards

  const models = useModels()

  const voice = useVoice(
    settings as VoiceSettingsFields,
    setSettings as unknown as Dispatch<SetStateAction<VoiceSettingsFields>>,
    {
      tutorInstallInfo: models.tutorInstallInfo,
      refreshTutorInstallInfo: models.refreshTutorInstallInfo,
    },
  )

  // The 16-node curriculum graph (issue #78 Phase 4). Fetched only while Home is
  // on screen — it is the only consumer, and the bridge is strictly serial.
  const progression = useProgression(view === 'home')

  /* `enabled` is "the menu is the surface you are looking at", not "the menu is the front door".
     That is what makes it ask again on the way back from a study session -- which is when a feature
     actually unlocks, and the only reason the moment below can fire at all.

     IT SITS HERE RATHER THAN WITH THE REST OF THE MENU STATE because it reads `progression.nodes`,
     and the features are evaluated against the progression: asking first would be asking about last
     cycle's nodes. */
  const menu = useMenuL1(view === 'home', progression.nodes)

  const cursor = useCursor(
    settings as unknown as { cursor: CursorSettings },
    setSettings as unknown as Dispatch<SetStateAction<{ cursor: CursorSettings }>>,
  )
  const windowDrag = useWindowDrag()

  const pomodoro = usePomodoro(
    settings as PomodoroSettingsFields,
    setSettings as unknown as Dispatch<SetStateAction<PomodoroSettingsFields>>,
  )

  // ── Study session (issue #69 phase 4b) ─────────────────────────────────────
  //
  // Sits here because everything below reads session state, and everything above
  // is a dependency it takes by value. The one edge that does not fit that order
  // is `tutor.queueAssistantToast`: the tutor hook consumes session state, so it
  // has to be constructed *after* this call. It is passed through a latest-value
  // ref box, assigned during render immediately after `useTutor` returns.


  const queueAssistantToastRef = useRef<(toast: AssistantToast | null) => void>(() => {})

  const session = useStudySession({
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
    getStudyQueue: getStudyQueueDeduped,
    invalidateStudyQueue,
    onSessionStart: pomodoro.onSessionStart,
    onSessionEnd: pomodoro.onSessionEnd,
    queueAssistantToast: (toast) => { queueAssistantToastRef.current(toast) },
  })

  const {
    sessionActive,
    roundState,
    sessionRounds,
    leechFocusEnabled,
    activeSessionId,
    explicitReviewItems,
    explicitReviewItemsRef,
    startSession,
    startMissedWordReview,
    returnToDailyGamesHub,
    resetSessionCore,
    resetSessionWithLives,
    resetSessionFull,
  } = session

  const isInMinigameSession = view === 'minigame' && sessionActive && roundState !== null

  const tutor = useTutor(
    settings as TutorSettingsFields,
    {
      voice: {
        playVoiceRuntimeAudio: voice.playVoiceRuntimeAudio,
        cancelAssistantSpeech: voice.cancelAssistantSpeech,
        assistantSpeechRunIdRef: voice.assistantSpeechRunIdRef,
        splitSpeechSegments,
      },
      isInMinigameSession,
      activeSessionId,
      activeScript,
      ocrInstalled: models.tutorInstallInfo?.ocrInstalled ?? false,
      onToastNavigate: (script, game, differentScript) => {
        const minigame = resolveScriptMinigame(script, game)
        setActiveGame(minigame)
        navigate('minigame', 'forward')
        resetSessionWithLives()
        if (differentScript) {
          setActiveScript(script)
          session.requestResumeSession({ script, minigame })
          return
        }
        void startSession(minigame)
      },
    },
  )

  // Closes the one backwards edge in the wiring order above. Assigned during
  // render rather than in an effect: `tutor`'s functions are not stable, so an
  // effect keyed on its identity could hold a stale reference between renders.
  queueAssistantToastRef.current = tutor.queueAssistantToast

  const openProgressionNode = useCallback((node: ProgressionNodeView) => {
    setDictionaryOpen(false)
    setShowOverview(false)
    setShowSettings(false)

    const destination = node.destination
    switch (destination.kind) {
      case 'script':
        tutor.closeTutorPanel()
        setActiveScript(destination.script)
        if (destination.minigame) setActiveGame(destination.minigame)
        navigate('script_hub', 'forward')
        return
      case 'jlpt':
        tutor.closeTutorPanel()
        navigate('jlpt_prep', 'forward')
        return
      case 'passages':
        tutor.closeTutorPanel()
        navigate('passage_hub', 'forward')
        return
      case 'scenarios':
        tutor.openTutorPanel('scenarios')
        return
      case 'tutor':
        tutor.openTutorPanel('chat')
        return
      case 'none':
        // `tutorial` — a one-time, skippable flow with nothing to re-enter.
        return
    }
  }, [navigate, setActiveGame, setActiveScript, tutor])

  // Scenario Practice shares the tutor's single audio channel (same run-id ref
  // and the same coach-audio toggle), so NPC playback and chat replies can
  // never talk over each other.
  const scenarioTutor = useScenarioTutor({
    voice: {
      playVoiceRuntimeAudio: voice.playVoiceRuntimeAudio,
      cancelAssistantSpeech: voice.cancelAssistantSpeech,
      assistantSpeechRunIdRef: voice.assistantSpeechRunIdRef,
      voiceUnavailable: voice.voiceUnavailable,
    },
    audioEnabled: settings.assistantChatAudioEnabled,
    aiEvaluationEnabled: settings.scenarioAiEvaluationEnabled,
  })

  // Restores focus to the Tutor titlebar button when the popup closes —
  // Back (within the popup) restores focus to the menu item instead, via
  // TutorMenu's own autofocus bookkeeping.
  const tutorPanelWasOpenRef = useRef(false)
  useEffect(() => {
    if (tutorPanelWasOpenRef.current && !tutor.tutorPanelOpen) {
      tutorTitlebarButtonRef.current?.focus()
    }
    tutorPanelWasOpenRef.current = tutor.tutorPanelOpen
  }, [tutor.tutorPanelOpen])

  // oxlint-disable react-hooks/exhaustive-deps — models from useModels hook is not a stable ref
  useEffect(() => {
    void models.refreshTutorInstallInfo()
  }, [models.refreshTutorInstallInfo])

  // oxlint-disable react-hooks/exhaustive-deps — voice from useVoice hook is not a stable ref
  useEffect(() => {
    if (view !== 'script_hub') return
    void voice.refreshVoiceStatus()
  }, [voice.refreshVoiceStatus, view])

  // oxlint-disable react-hooks/exhaustive-deps — voice from useVoice hook is not a stable ref
  useEffect(() => {
    if (!showSettings || activeSettingsTab !== 'assistant') return
    const h = window.setInterval(() => { void voice.refreshVoiceStatus() }, 3000)
    return () => { window.clearInterval(h) }
  }, [activeSettingsTab, voice.refreshVoiceStatus, showSettings])












  // Do not warm voice runtime automatically in the background.
  // Keep startup and menu-open flows quiet; runtime initializes on first use.

  const toggleOverviewSection = useCallback((section: OverviewSectionKey) => {
    setOverviewSectionExpanded((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }, [])

  const advanceFontSize = useCallback(() => {
    const currentIndex = FONT_SIZE_ORDER.indexOf(settings.fontSize)
    const nextIndex = (currentIndex + 1) % FONT_SIZE_ORDER.length
    const nextSize = FONT_SIZE_ORDER[nextIndex]
    setSettings((prev) => ({ ...prev, fontSize: nextSize }))
  }, [settings.fontSize])

  const reloadLocalFonts = useCallback(() => {
    void window.jplearnDesktop?.reloadLocalFonts?.().catch(() => undefined)
  }, [])


  const getDeckCardsDeduped = useCallback((slug: DeckSlugInput): Promise<ScriptDeck> => {
    if (typeof window === 'undefined' || !window.jplearnDesktop?.getDeckCards) {
      return Promise.reject(new Error('Deck cards API unavailable'))
    }

    const inFlight = deckCardsInFlightRef.current.get(slug)
    if (inFlight) return inFlight

    const request = Promise.race<ScriptDeck>([
      window.jplearnDesktop.getDeckCards(slug),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error(`Loading deck cards timed out for ${slug}`)), DECK_LOAD_TIMEOUT_MS)
      }),
    ]).finally(() => {
      if (deckCardsInFlightRef.current.get(slug) === request) {
        deckCardsInFlightRef.current.delete(slug)
      }
    })
    deckCardsInFlightRef.current.set(slug, request)
    return request
  }, [])

  const getBlockProgressDeduped = useCallback((slug: DeckSlugInput): Promise<BlockProgressPayload> => {
    if (typeof window === 'undefined' || !window.jplearnDesktop?.getBlockProgress) {
      return Promise.reject(new Error('Block progress API unavailable'))
    }

    const inFlight = blockProgressInFlightRef.current.get(slug)
    if (inFlight) return inFlight

    const request = Promise.race<BlockProgressPayload>([
      window.jplearnDesktop.getBlockProgress(slug),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error(`Loading block progress timed out for ${slug}`)), DECK_LOAD_TIMEOUT_MS)
      }),
    ]).finally(() => {
      if (blockProgressInFlightRef.current.get(slug) === request) {
        blockProgressInFlightRef.current.delete(slug)
      }
    })
    blockProgressInFlightRef.current.set(slug, request)
    return request
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(scriptStats))
  }, [scriptStats])

  // Mastery counters live in SQLite since issue #66. localStorage is written only
  // as a warm-start snapshot so the first paint after launch is not empty — it is
  // no longer a source of truth, and `hydrateCardScoresFromDb` below overwrites
  // whatever it held once the bridge answers.
  useEffect(() => {
    window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(cardScores))
  }, [cardScores])

  // One-time adoption of pre-#66 counters, then hydrate from the database.
  //
  // The counter cannot be recomputed from FSRS state (see domain/mastery.py), so
  // an existing learner's mastery survives the move only if it is imported. The
  // bridge refuses to import into a non-empty table, so a stale snapshot replayed
  // later cannot roll progress backwards.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const desktop = window.jplearnDesktop
      if (!desktop?.getCardScores) return
      try {
        const legacy = loadCardScores()
        if (desktop.importCardScores && hasAnyCardScore(legacy)) {
          await desktop.importCardScores(legacy)
        }
        const payload = await desktop.getCardScores()
        if (cancelled) return
        const stored = toSectionScores(payload?.scores ?? {})
        // Only adopt the database view if it has something in it. A learner mid-way
        // through their first session has scores in memory that are already stored,
        // and an empty payload from a transient bridge failure must not blank them.
        if (hasAnyCardScore(stored)) {
          setCardScores(stored)
        }
      } catch {
        // Hydration is best-effort: the in-memory snapshot stays, and every answer
        // still writes through to SQLite via record-result.
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    document.documentElement.dataset.fontSize = settings.fontSize
    document.documentElement.dataset.appFont = settings.appFont
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion)
    document.documentElement.dataset.motionStyle = settings.motionStyle
  }, [settings])


  const activePetalStream = useMemo(() => {
    if (settings.reducedMotion || settings.motionStyle === 'calm_fade') return []
    const count = settings.motionStyle === 'lively' ? 14 : 10
    return PETAL_STREAM.slice(0, count)
  }, [settings.motionStyle, settings.reducedMotion])

  /* THE CSS PETALS ARE THE OLD FRONT DOOR'S WEATHER, and the menu grows its own -- `petals.ts`
     drops them off the valley's actual sakura and momiji, in perspective, behind the interface.
     Drawn on top of that, the flat ones read as debris on the lens: they are the only thing on
     screen with no depth, they cross the paper plates, and they fall at a screen-space rate the
     world underneath them contradicts. So the menu takes the world's petals and nothing else. */
  const showPetalLayer = activePetalStream.length > 0
    && !(view === 'minigame' && sessionActive) && view !== 'home'

  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const state = await window.jplearnDesktop?.isWindowMaximized()
        if (mounted && state) setIsWindowMaximized(state.isMaximized)
      } catch { /* ignore */ }
    }
    void check()

    return () => {
      mounted = false
    }
  }, [])

  // Onboarding is now gated entirely by learningPathStatus.onboarding_complete from the backend.

  useEffect(() => {
    const onWindowStateChanged = window.jplearnDesktop?.onWindowStateChanged
    if (!onWindowStateChanged) {
      return
    }

    const unsubscribe = onWindowStateChanged((state) => {
      setIsWindowMaximized(state.isMaximized)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await window.jplearnDesktop?.getStudySummary()
      setSummary(payload)
      saveSummarySnapshot(payload)
      if (startupFirstSummaryMsRef.current === null) {
        startupFirstSummaryMsRef.current = Math.round(performance.now() - startupBootMarkRef.current)
      }
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown desktop bridge error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  // Fetch XP progress, study recommendations, and learning path
  // on mount and whenever the summary refreshes.
  useEffect(() => {
    let mounted = true
    const getXp = window.jplearnDesktop?.getXpProgress
    const getRecs = window.jplearnDesktop?.getRecommendations
    const getPath = window.jplearnDesktop?.getLearningPathStatus

    const safeResolve = async <T,>(fn: (() => Promise<T>) | undefined): Promise<T | null> => {
      if (!fn) return null
      try { return await fn() } catch { return null }
    }

    const doFetch = async () => {
      const [xp, recs, path] = await Promise.all([
        safeResolve(getXp),
        safeResolve(getRecs),
        safeResolve(getPath),
      ])
      if (!mounted) return
      if (xp) setXpProgress(xp)
      if (recs) setStudyBlock(recs)
      if (path) setLearningPathStatus(path as LearningPathStatus)
    }
    void doFetch()

    return () => { mounted = false }
  }, [summary])

  const notifyStartupReady = useCallback((deferredLoadsQueuedAtMs?: number) => {
    if (startupReadySentRef.current) return
    startupReadySentRef.current = true

    const startupReadyMs = Math.round(performance.now() - startupBootMarkRef.current)
    void window.jplearnDesktop?.notifyStartupReady({
      startupReadyMs,
      firstSummaryMs: startupFirstSummaryMsRef.current,
      deferredLoadsQueuedAtMs,
    }).catch(() => undefined)
  }, [])


















  // Avoid background tutor runtime warmup on startup.
  // Runtime loads lazily when the user sends a chat request.






  useEffect(() => {
    let cancelled = false
    let warmupStartHandle: number | null = null
    let lastYieldAt = performance.now()

    const yieldToMain = async () => {
      if (typeof globalThis.scheduler !== 'undefined' && typeof globalThis.scheduler.yield === 'function') {
        await globalThis.scheduler.yield()
        return
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })
    }

    const maybeYieldToMain = async () => {
      if (performance.now() - lastYieldAt < STARTUP_WARMUP_YIELD_DEADLINE_MS) {
        return
      }
      await yieldToMain()
      lastYieldAt = performance.now()
    }

    async function preloadStartupDeckData(): Promise<void> {
      const startupScripts: ScriptKey[] = ['hiragana', 'katakana']
      const deferredLoadsQueuedAtMs = Math.round(performance.now() - startupBootMarkRef.current)

      // Signal startup-ready as soon as core UI mounts; keep deck warmups fully backgrounded.
      notifyStartupReady(deferredLoadsQueuedAtMs)

      const preloadScript = async (script: ScriptKey): Promise<void> => {
        if (scriptDeckCacheRef.current[script] && scriptBlockCacheRef.current[script]) {
          return
        }

        if (!scriptDeckCacheRef.current[script]) {
          const deckPayload = await getDeckCardsDeduped(script)
          if (cancelled) return
          scriptDeckCacheRef.current[script] = limitRuntimeDeckCards(script, normalizeDeckCards(deckPayload.cards))
        }

        if (!scriptBlockCacheRef.current[script]) {
          try {
            const blockPayload = await getBlockProgressDeduped(script)
            if (cancelled) return
            scriptBlockCacheRef.current[script] = normalizeBlockList(blockPayload.blocks)
          } catch { /* ignore preload failure */ }
        }
      }

      try {
        // Keep post-open warmup lightweight to avoid blocking input shortly
        // after first paint.
        for (const script of startupScripts) {
          await preloadScript(script)
          if (cancelled) return
          await maybeYieldToMain()
        }
      } catch {
        // Allow startup to continue even if preloading fails on some decks.
      }
    }

    warmupStartHandle = window.setTimeout(() => {
      if (!cancelled) {
        void preloadStartupDeckData()
      }
    }, STARTUP_WARMUP_INITIAL_DELAY_MS)

    return () => {
      cancelled = true
      if (warmupStartHandle !== null) {
        window.clearTimeout(warmupStartHandle)
      }
    }
  }, [getBlockProgressDeduped, getDeckCardsDeduped, notifyStartupReady])

  const preloadVocabCategoryCards = useCallback(() => {
    for (const cat of VOCAB_CATEGORY_ORDER) {
      if (vocabCategoryDeckCacheRef.current[cat]) continue
      void (async () => {
        try {
          const payload = await getDeckCardsDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
          const cards = normalizeDeckCards(payload.cards)
          vocabCategoryDeckCacheRef.current[cat] = cards
          setVocabDeckCardsByCategory((previous) => ({ ...previous, [cat]: cards }))
        } catch { /* ignore preload failure — progress rows degrade, study does not */ }
      })()
    }
  }, [getDeckCardsDeduped])

  const loadScriptCards = useCallback(async (
    script: ScriptKey,
    deckSlug: DeckSlugInput,
  ) => {
    const requestId = scriptLoadRequestIdRef.current + 1
    scriptLoadRequestIdRef.current = requestId
    setGameLoading(true)
    setGameError(null)

    resetSessionFull()

    try {
      // One path for every section since issue #78. The kanji and vocabulary
      // sections used to load a *category* deck here, which is why their blocks
      // were never read: a category carries no blocks of its own, it *is* one.
      // They now load the JLPT level deck, whose blocks are the categories
      // followed by generated sets covering the rest of the corpus.
      const cachedDeck = scriptDeckCacheRef.current[deckSlug]
      const cachedBlocks = scriptBlockCacheRef.current[deckSlug]

      let resolvedCards = cachedDeck
      let resolvedBlocks = cachedBlocks

      if (!resolvedCards || !resolvedBlocks) {
        const [deckPayload, blockPayload] = await Promise.all([
          resolvedCards ? Promise.resolve({ cards: resolvedCards }) : getDeckCardsDeduped(deckSlug),
          resolvedBlocks ? Promise.resolve({ blocks: resolvedBlocks }) : getBlockProgressDeduped(deckSlug),
        ])
        if (scriptLoadRequestIdRef.current !== requestId) {
          return
        }

        if (!resolvedCards) {
          resolvedCards = limitRuntimeDeckCards(script, normalizeDeckCards(deckPayload.cards))
          scriptDeckCacheRef.current[deckSlug] = resolvedCards
        }
        if (!resolvedBlocks) {
          resolvedBlocks = normalizeBlockList(blockPayload.blocks)
          scriptBlockCacheRef.current[deckSlug] = resolvedBlocks
        }
      }

      setDeckCards(resolvedCards ?? [])

      // No index to reset: useBlockSelection derives the default from these
      // blocks (furthest unlocked, as single-select used to land).
      setBlockProgress(resolvedBlocks ?? [])

      // Category decks are still fetched, but only to feed the per-category
      // mastery rows that drive the JLPT level tabs and the overview. They are
      // views over this same parent deck now, so they cost little and their
      // numbers agree with it by construction.
      if (script === 'vocab_n5') {
        preloadVocabCategoryCards()
      }

      lastLoadedScriptRef.current = script
    } catch (err) {
      if (scriptLoadRequestIdRef.current !== requestId) {
        return
      }
      setDeckCards([])
      setBlockProgress([])
      setGameError(err instanceof Error ? err.message : 'Could not load deck data. Restart the app if this persists.')
    } finally {
      if (scriptLoadRequestIdRef.current === requestId) {
        setGameLoading(false)
      }
    }
  }, [getBlockProgressDeduped, getDeckCardsDeduped, resetSessionFull, preloadVocabCategoryCards])

  // After the backend SRS states change wholesale (onboarding seeding or a reset),
  // the cached deck/block progress no longer matches the database. Drop every cache
  // and refetch so the minigame learning path and overview block tiles reflect the
  // new unlock/mastery state instead of showing stale "locked"/0% data.
  const refreshDeckProgressAfterSeedChange = useCallback(() => {
    scriptDeckCacheRef.current = {}
    scriptBlockCacheRef.current = {}
    vocabCategoryDeckCacheRef.current = {}
    vocabCategoryBlockCacheRef.current = {}
    studyQueueCacheRef.current.clear()

    void loadScriptCards(activeScript, activeDeckSlug)
    void (async () => {
      try {
        const payload = await window.jplearnDesktop?.getOverviewCharacterMastery()
        if (!payload) return
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      } catch { /* ignore */ }
    })()
  }, [activeScript, activeDeckSlug, loadScriptCards])

  // Reloads on the *slug*, so switching JLPT level swaps the deck (and its
  // blocks) the way switching section always has. Category changes no longer
  // reload anything — they move the level tabs, not the deck under study.
  useEffect(() => {
    void loadScriptCards(activeScript, activeDeckSlug)
  }, [activeScript, activeDeckSlug, loadScriptCards])

  const leechCards = useMemo(
    () => deckCards.filter((card) => card.is_leech),
    [deckCards],
  )

  const kanjiLevelProgress = useMemo(
    () => buildJlptLevelProgressFromLevelDecks(kanjiDeckCardsByLevel, cardScores.kanji_n5),
    [kanjiDeckCardsByLevel, cardScores.kanji_n5],
  )

  const vocabLevelProgress = useMemo(
    () => buildJlptLevelProgressFromLevelDecks(vocabDeckCardsByLevel, cardScores.vocab_n5),
    [vocabDeckCardsByLevel, cardScores.vocab_n5],
  )

  const vocabCategoryProgress = useMemo(
    () => buildCategoryProgress(
      VOCAB_CATEGORY_ORDER, VOCAB_CATEGORY_LABELS, VOCAB_CATEGORY_TO_DECK_SLUG,
      vocabDeckCardsByCategory, cardScores.vocab_n5,
    ),
    [vocabDeckCardsByCategory, cardScores.vocab_n5],
  )

  const overviewKanjiLevelProgress = useMemo(
    () => buildJlptLevelProgress(overviewKanjiDeck, cardScores.kanji_n5),
    [overviewKanjiDeck, cardScores.kanji_n5],
  )

  /* THE FIVE ROWS DISPATCH TO THE VIEWS THAT ALREADY EXIST. Phase 2 changes the front door, not
     what is behind it — each section lands on the flat view that does that job today, and phase 4
     replaces them one at a time with the L2 screens. YOU has no view of its own; it is the
     overview panel, which is what RECORDS always was. */
  const openMenuSection = useCallback((key: MenuSectionKey) => {
    setDictionaryOpen(false)
    setShowOverview(false)
    setShowSettings(false)
    tutor.closeTutorPanel()
    if (key === 'STUDY') { navigate('script_hub', 'forward'); return }
    if (key === 'DRILLS') { openDailyGames(); return }
    if (key === 'READING') { navigate('passage_hub', 'forward'); return }
    if (key === 'JLPT') { navigate('jlpt_prep', 'forward'); return }
    setShowOverview(true)
  }, [navigate, openDailyGames, tutor])

  /* THE TREE, WITH THE OLD BEHAVIOUR AS ITS PASSTHROUGH. `enterSection` stops at L2 for any
     section that has an L2 screen, and goes straight to the flat view for any that does not.
     `L2_READY` is empty today, so every row behaves exactly as it did in phase 2 — phase 4
     converts them one at a time by registering a screen, and nothing here changes. */
  const menuPath = useMenuPath(openMenuSection)

  /* ==================================================================================================
     THE UNLOCK MOMENT, WHICH IS AN EVENT AND NOT A PLACE.

     It is the one screen here you did not navigate to, so it does not appear over wherever you
     happened to be standing: `menuLevel` goes to a level nothing matches while it is up, and
     continuing from it leaves you at the front door. Gating at the source rather than adding
     `&& !moment` to twelve render branches is also what stops an L2 board painting for one frame
     under the moment's own wash before a reset effect could fire.
     ================================================================================================== */
  const moment = useMemo(
    () => unlockMoment(menu.pendingUnlocks, progression.nodes),
    [menu.pendingUnlocks, progression.nodes],
  )
  const resetMenuPath = menuPath.reset
  useEffect(() => {
    /* `ROOT` is a module constant, so this is idempotent and cannot loop through `menuPath` */
    if (moment) resetMenuPath()
  }, [moment, resetMenuPath])
  const menuLevel = moment ? 0 : menuPath.level


  /* THE CAMERA CARRIES THE NAVIGATION, and this is the pair of calls that make it do so.

     ENTERING FLIES FIRST AND CHANGES THE SCREEN AT 82% OF THE MOVE, so the section's board is
     assembling as the flight settles rather than appearing over a camera still crossing the
     valley. `flyToSection` calls straight back when there is no valley -- `?valley=off` is a
     supported boot and a menu whose navigation needed a canvas would not survive it.

     LEAVING IS THE OTHER WAY ROUND: the screen goes at once and the camera follows it home. You
     have already decided to leave, and watching the board you are done with ride two seconds of
     egress is the wrong half of the move to spend on it. */
  const enterMenuSection = useCallback((section: MenuSectionKey) => {
    if (valleyIsFlying()) return
    flyToSection(section, () => menuPath.enterSection(section))
  }, [menuPath])

  const leaveMenuLevel = useCallback((): boolean => {
    const wasInSection = menuPath.level === 2
    if (!menuPath.up()) return false
    /* only a departure from a section is a journey home; L3 to L2 is a move within one place */
    if (wasInSection) flyHome()
    return true
  }, [menuPath])

  /* THE WORLD'S TWO FIGURES, fetched only once the screen asking for them is up — see the note in
     `useWorldData`. `worldLanes` is memoised because `Lanes` watches the array it is given, and a
     fresh one on every render would re-subscribe its keydown listener for nothing. */
  const worldOpen = view === 'home' && menuLevel === 2 && menuPath.section === 'READING'
  const world = useWorldData(worldOpen)
  const worldCards = useMemo(
    () => worldLanes({
      passages: world.passages, sessions: world.sessions,
      unlocked: menu.unlocked, gateOf: menu.gateOf,
    }),
    [world.passages, world.sessions, menu.unlocked, menu.gateOf],
  )

  /* THE ASCENT'S ONE CALL, on the same terms: asked when the ladder is up, memoised because the
     screen watches the array it is given. */
  const examOpen = view === 'home' && menuLevel === 2 && menuPath.section === 'JLPT'
  const exam = useReadiness(examOpen)
  const examRungs = useMemo(() => ascentRungs(exam.readiness), [exam.readiness])
  /* WHICH RUNG LEVEL THREE IS ABOUT. The ascent's cursor is the ascent's own state -- it is not in
     the path, because a cursor is not a place -- so the rung is carried across when it is opened. */
  const [examRung, setExamRung] = useState<string | null>(null)

  /* ==================================================================================================
     A MILESTONE'S LEVEL THREE — and which of the two it is, is the deck's answer, not a table.

     Seven of the curriculum's sixteen nodes lead to a deck. Six of those are still cut into blocks
     and get THE DECK; the vocabulary levels stopped being chunked and get THE FEED instead. The
     split is the backend's own — `build_vocab_feed` refuses a deck with blocks and
     `build_block_progress` answers an empty list for one without — so `isFedDeck` is read here
     rather than a second list being kept in step with it.

     THE SEVENTH IS LISTENING, AND IT GOES STRAIGHT THROUGH. Its destination names hiragana *and a
     minigame*: the milestone is about a mode, not about hiragana's blocks, which the HIRAGANA
     milestone already draws two rows above. Sending it to a block chain would put the same deck
     behind two different steps and answer neither.
     ================================================================================================== */
  const [menuNode, setMenuNode] = useState<string | null>(null)
  const menuMilestone = useMemo(
    () => milestone(progression.nodes, menuNode ?? ''),
    [progression.nodes, menuNode],
  )
  /* fetched only while one of the two screens is up: `null` is what stops the hook asking */
  const deckScreenOpen = menuLevel === 3 && menuPath.screen === 'deck'
  const menuDeck = useDeckBlocks(deckScreenOpen ? activeDeckSlug : null)
  /* the feed itself is `vocabFeed` above -- App already holds one for the deck under study, and a
     second instance would be a second round trip answering the same question */

  const routeMilestone = useCallback((node: ProgressionNodeView) => {
    const destination = node.destination
    /* a mode, or one of the nine milestones that is not a deck at all: the app's own door */
    if (destination.kind !== 'script' || destination.minigame) { openProgressionNode(node); return }
    setMenuNode(node.node_id)
    setActiveScript(destination.script)
    menuPath.enterScreen(isFedDeck(destination.script) ? 'feed' : 'deck')
  }, [menuPath, openProgressionNode, setActiveScript])

  /* WHO ASKED, WHICH THE CONFIRMATION DOES NOT OTHERWISE KNOW. `progression.pending` is one piece
     of shared state raised by three call sites — this screen, the L1 map and the flat one — and its
     modal used to answer all of them with `openProgressionNode`. Measured live on a fresh account:
     an OPEN milestone reached the deck screen and a GATED one, once confirmed, went straight to the
     hub. Same row, two destinations, decided by whether a dialog happened to appear. */
  const milestoneRequestRef = useRef<string | null>(null)

  const openMilestone = useCallback((nodeId: string) => {
    milestoneRequestRef.current = nodeId
    const node = progression.requestOpen(nodeId)
    /* null means the gate raised its confirmation; the ref carries the answer to the modal */
    if (!node) return
    milestoneRequestRef.current = null
    routeMilestone(node)
  }, [progression, routeMilestone])

  const examDetail = useMemo(() => {
    const rung = examRungs.find((r) => r.level === examRung)
    const data = rung && exam.readiness ? exam.readiness.levels[rung.level] : null
    if (!rung || !data) return null
    /* the projection is the BACKEND's, stored on the result -- `project_mock_score` already ran */
    return levelDetail(rung, data, null)
  }, [examRungs, examRung, exam.readiness])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        commandPalette.toggle()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        if (showSettings) {
          setShowSettings(false)
        } else {
          setDictionaryOpen(false)
          tutor.closeTutorPanel()
          setShowOverview(false)
          setShowSettings(true)
        }
        return
      }

      /* `/` OPENS THE LOOKUP FROM ANYWHERE, and `,` opens settings the same way. Both are bare
         keys because that is what the menu was designed around -- and both are ignored the moment
         anything is being typed into, which is the same guard `?` already uses for the keyboard
         cheatsheet. Ctrl+, keeps working; this adds a door, it does not move one. */
      if (!isTypingTarget(event.target) && (event.key === '/' || event.key === ',')) {
        event.preventDefault()
        if (event.key === '/') {
          if (lookup.isOpen) lookup.close()
          else {
            setShowSettings(false)
            lookup.open()
          }
          return
        }
        lookup.close()
        if (showSettings) {
          setShowSettings(false)
        } else {
          setDictionaryOpen(false)
          tutor.closeTutorPanel()
          setShowOverview(false)
          setShowSettings(true)
        }
        return
      }

      if (event.key === 'Escape') {
        /* topmost first: the lookup covers everything else while it is open */
        if (lookup.isOpen) {
          lookup.close()
          return
        }

        if (kanjiDetailCharacter) {
          closeKanjiDetail()
          return
        }

        if (showCloseDialog) {
          setShowCloseDialog(false)
          return
        }

        if (commandPalette.isOpen) {
          commandPalette.close()
          return
        }

        if (keyboardCheatsheetOpen) {
          closeKeyboardCheatsheet()
          return
        }

        if (shortcutMenuOpen) {
          setShortcutMenuOpen(false)
          setActiveShortcutFlyout(null)
          return
        }

        if (selectedChar) {
          setSelectedChar(null)
          return
        }

        if (showSettings) {
          setShowSettings(false)
          return
        }

        if (tutor.tutorPanelOpen) {
          // The shell's own Escape handler (TutorPanelShell) normally
          // catches this first and stops propagation while focus is inside
          // the popup; this is a defensive fallback for the rare case focus
          // isn't there. Same policy: close at the menu, back to the menu
          // from any activity — Escape never abandons a scenario.
          if (tutor.tutorPanelMode === 'menu') {
            tutor.closeTutorPanel()
          } else {
            tutor.returnToTutorMenu()
          }
          return
        }

        // An in-progress missed-word review returns to the Daily Games hub
        // before Escape is allowed to leave the minigame view at all.
        if (view === 'minigame' && explicitReviewItemsRef.current) {
          returnToDailyGamesHub()
          return
        }

        /* THE TREE FIRST, THEN THE FLAT MAP. Inside the menu, Escape means "up one level"; the
           `up()` boolean is what stops it becoming a key that silently does nothing at the root,
           where it must fall through to the app's own parent chain instead. */
        if (view === 'home' && leaveMenuLevel()) {
          return
        }

        const parentView = VIEW_PARENT[view]
        if (parentView) {
          navigate(parentView, 'back')
          return
        }

        if (showOverview) {
          setShowOverview(false)
          return
        }
      }

      if (showSettings || showCloseDialog || commandPalette.isOpen || tutor.tutorPanelOpen || isInput) return

      if (event.key === '6') {
        setDictionaryOpen(false)
        setShowOverview(true)
        setShowSettings(false)
        void loadSummary()
        setShortcutMenuOpen(false)
        setActiveShortcutFlyout(null)
        return
      }

      if (view === 'home') {
        if (event.key === '1') {
          setActiveScript('hiragana')
          navigate('script_hub', 'forward')
        }
        if (event.key === '2') {
          setActiveScript('katakana')
          navigate('script_hub', 'forward')
        }
        if (event.key === '3') {
          setActiveScript('kanji_n5')
          navigate('script_hub', 'forward')
        }
        if (event.key === '4') {
          setActiveScript('vocab_n5')
          navigate('script_hub', 'forward')
        }
        if (event.key === '5') {
          setActiveScript('grammar_patterns')
          navigate('script_hub', 'forward')
        }
        if (event.key === '7') {
          setActiveScript('sentence_examples')
          navigate('script_hub', 'forward')
        }
      }
    }

    // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeKanjiDetail, kanjiDetailCharacter, tutor.tutorPanelOpen, tutor.tutorPanelMode, tutor.closeTutorPanel, tutor.returnToTutorMenu, loadSummary, selectedChar, shortcutMenuOpen, showOverview, showSettings, view, menuPath])

  const decks = useMemo(() => summary?.decks ?? [], [summary])
  const streak = useMemo(
    () => summary?.streak ?? { current_days: 0, best_days: 0, freezes_available: 0 },
    [summary],
  )
  const activity = useMemo(
    () =>
      summary?.activity ?? {
        week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
        month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
      },
    [summary],
  )
  const mistakes = useMemo(() => summary?.mistakes ?? [], [summary])
  const minigamePerf = useMemo(() => summary?.minigame_performance ?? [], [summary])
  const sessionHistory = useMemo(() => summary?.session_history ?? [], [summary])
  const studyPlan = useMemo(
    () => buildStudyPlan(decks, kanjiLevelProgress, vocabLevelProgress),
    [decks, kanjiLevelProgress, vocabLevelProgress],
  )
  const learningPathTrackRows = useMemo(
    () => {
      const trackedKeys: ScriptKey[] = ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5']
      return trackedKeys
        .map((key) => studyPlan.coverageRows.find((row) => row.key === key))
        .filter((row): row is StudyPlanCoverageRow => row !== undefined)
    },
    [studyPlan.coverageRows],
  )

  const activeRunCards = leechFocusEnabled && leechCards.length > 0 ? leechCards : activeBlockCards

  // Use backend block mastery/unlock values so script hub and overview stay consistent.
  const blockProgressWithMastery = useMemo(() => {
    return blockProgress
  }, [blockProgress])

  // No "snap off a locked block" effect: useBlockSelection filters the selection
  // against the current blocks every render, so a locked or out-of-range index
  // can never be live in the first place.

  const activeSectionName = useMemo(() => {
    if (blockProgressWithMastery.length > 0) {
      const selected = blockSelection.selected
      if (selected.length === 1) {
        return blockProgressWithMastery.find((block) => block.index === selected[0])?.name ?? null
      }
      return selected.length === 0
        ? 'Whole deck'
        : `${selected.length} blocks`
    }
    if (activeScript === 'vocab_n5') {
      return vocabCategoryProgress.find((cat) => cat.key === activeVocabCategory)?.label ?? null
    }
    return null
  }, [blockProgressWithMastery, blockSelection.selected, activeScript, vocabCategoryProgress, activeVocabCategory])




  const minigameLockReasons = useMemo(() => {
    const reasons: Partial<Record<MinigameKey, string>> = {}
    if (!voice.speechRecognitionModelEnabled) {
      reasons.speech_recall = voice.speechRecognitionLockReason
    }
    if (voice.listeningLockReason) {
      reasons.listening_audio_first = voice.listeningLockReason
      reasons.dictation = voice.listeningLockReason
    }
    // Everything else follows from what the live pool holds, evaluated by a
    // shared rule table rather than mode-by-mode here. It is no longer gated on
    // the section: the pool is the union of the selected blocks, so a section's
    // name says very little about what a round can draw.
    return {
      ...computeMinigameLockReasons(
        {
          size: activeBlockCards.length,
          hasCompoundWords: activeBlockCards.some((c) => {
            const kanjiChars = [...c.character].filter((ch) => /\p{Script=Han}/u.test(ch))
            return kanjiChars.length >= 2 && !kanjiChars.some((ch) => !(ch in KANJI_MEANINGS))
          }),
          // Counted after the top-up from the wider deck, so this locks only when
          // the whole section has nothing conjugatable — not merely this block.
          conjugatableCount: buildConjugationPool(activeBlockCards, deckCards).length,
          leechCount: activeBlockCards.filter((c) => c.is_leech).length,
        },
        { leechFocusEnabled },
      ),
      ...reasons,
    }
  // oxlint-disable react-hooks/exhaustive-deps — voice.speechRecognitionLockReason is a constant string, voice hook return is not stable
  }, [voice.listeningLockReason, voice.speechRecognitionModelEnabled, activeBlockCards, deckCards, leechFocusEnabled])

  // Complete when every card in the *pool* has reached max score. With one block
  // selected that is the block, as before. Selecting many, or clearing to study
  // the whole deck, makes it correspondingly rarer — the check stays honest, it
  // just fires less often the more a learner takes on at once.
  // sessionRounds > 0 ensures we don't trigger on a pre-mastered pool before answering.
  const blockSessionComplete = useMemo(() => {
    if (!sessionActive || sessionRounds === 0 || activeBlockCards.length === 0) return false
    const scores = cardScores[activeScript]
    return activeBlockCards.every((c) => (scores[c.id] ?? 0) >= CARD_MASTERY_MAX)
  }, [sessionActive, sessionRounds, activeBlockCards, cardScores, activeScript])
  const hasAnyActivity = activity.week.reviewed > 0 || activity.month.reviewed > 0
  const hasMistakeData = mistakes.length > 0
  const hasMinigamePerfData = minigamePerf.length > 0
  const hasSessionHistory = sessionHistory.length > 0

  useEffect(() => {
    if (activeScript !== 'vocab_n5' || blockProgress.length > 0) return
    const activeCat = vocabCategoryProgress.find((cat) => cat.key === activeVocabCategory)
    if (activeCat?.total && activeCat.total > 0) return
    const fallback = vocabCategoryProgress.find((cat) => cat.unlocked) ?? vocabCategoryProgress.find((cat) => cat.total > 0)
    if (!fallback || fallback.key === activeVocabCategory) return
    setActiveVocabCategory(fallback.key as VocabCategory)
  }, [activeScript, blockProgress.length, vocabCategoryProgress, activeVocabCategory])

  // Lazy-load block data for hiragana + katakana when the overview popup opens.
  useEffect(() => {
    if (!showOverview) return
    setOverviewBlocksLoading(true)
    const fetchMastery = async () => {
      try {
        const payload = await window.jplearnDesktop?.getOverviewCharacterMastery()
        if (!payload) return
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      } catch { /* ignore */ }
      finally { setOverviewBlocksLoading(false) }
    }
    void fetchMastery()
  }, [showOverview])

  const goHome = useCallback(() => {
    closeKanjiDetail()
    navigate('home', 'back')
    resetSessionCore()
    setShowSettings(false)
    tutor.closeTutorPanel()
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [closeKanjiDetail, resetSessionCore])

  const closeShortcutMenu = useCallback(() => {
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
  }, [])

  const jumpToMainMenu = useCallback(() => {
    goHome()
    closeShortcutMenu()
  }, [closeShortcutMenu, goHome])

  const jumpToOverview = useCallback(() => {
    closeKanjiDetail()
    setDictionaryOpen(false)
    setShowOverview(true)
    setShowSettings(false)
    tutor.closeTutorPanel()
    void loadSummary()
    closeShortcutMenu()
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [closeKanjiDetail, closeShortcutMenu, loadSummary])

  const jumpToScriptHub = useCallback((script: ScriptKey) => {
    closeKanjiDetail()
    setActiveScript(script)
    navigate('script_hub', 'forward')
    resetSessionCore()
    closeShortcutMenu()
  }, [closeKanjiDetail, closeShortcutMenu, navigate, resetSessionCore])

  const jumpToScriptHubMinigame = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    closeKanjiDetail()
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setShowOverview(false)
    setShowSettings(false)
    session.clearLastRunReport()
    setActiveGame(resolvedMinigame)
    navigate('minigame', 'forward')
    resetSessionWithLives()

    if (script !== activeScript) {
      setActiveScript(script)
      session.requestResumeSession({ script, minigame: resolvedMinigame })
      closeShortcutMenu()
      return
    }

    void startSession(resolvedMinigame)
    closeShortcutMenu()
  // oxlint-disable react-hooks/exhaustive-deps — session is rebuilt each render; its actions are stable
  }, [activeScript, closeKanjiDetail, closeShortcutMenu, resetSessionWithLives, resolveScriptMinigame, startSession])
  /* LAUNCH THE DRILL THE ENGINE CHOSE, rather than landing on a hub for the learner to pick one.
     This came back with the menu hero: `HomeView`'s "Up next" row was its only caller and retired
     with it, which left the hero card saying REVIEW THESE over a named drill and a card count and
     then opening a section instead. A card that promises an action has to perform it, and the
     recommendation payload has carried the drill and the leech-focus override all along. */
  const jumpToScriptHubSetup = useCallback((
    script: ScriptKey,
    minigame: MinigameKey,
    overrides?: SessionPrefOverrides,
  ) => {
    closeKanjiDetail()
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setActiveScript(script)
    setActiveGame(resolvedMinigame)
    if (overrides?.leechFocusEnabled !== undefined) {
      session.setLeechFocus(overrides.leechFocusEnabled)
    }
    navigate('script_hub', 'forward')
    resetSessionWithLives()
    closeShortcutMenu()
  // oxlint-disable react-hooks/exhaustive-deps — session is rebuilt each render; its actions are stable
  }, [closeKanjiDetail, closeShortcutMenu, navigate, resetSessionWithLives, resolveScriptMinigame])

  const openSettingsFromMenu = useCallback(() => {
    closeKanjiDetail()
    setDictionaryOpen(false)
    setShowSettings(true)
    setShowOverview(false)
    tutor.closeTutorPanel()
    closeShortcutMenu()
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [closeKanjiDetail, closeShortcutMenu])

  const refreshDataFromMenu = useCallback(() => {
    void loadSummary()
    closeShortcutMenu()
  }, [closeShortcutMenu, loadSummary])

  const inspectElementFromMenu = useCallback(async () => {
    try {
      await window.jplearnDesktop?.openInspectElement?.()
    } catch {
      // Devtools action is best effort in development contexts.
    } finally {
      closeShortcutMenu()
    }
  }, [closeShortcutMenu])

  const openDevDashboard = useCallback(() => {
    closeShortcutMenu()
    setDevDashboardOpen(true)
  }, [closeShortcutMenu])

  const runCheckFromMenu = useCallback((checkName: string) => {
    closeShortcutMenu()
    setPendingDevCheck(checkName)
    setDevDashboardOpen(true)
  }, [closeShortcutMenu])

  const restartBridgeFromMenu = useCallback(async () => {
    closeShortcutMenu()
    try {
      await window.jplearnDesktop?.restartBridge?.()
    } catch {
      // best effort
    }
  }, [closeShortcutMenu])

  const clearCachesFromMenu = useCallback(async () => {
    closeShortcutMenu()
    try {
      await window.jplearnDesktop?.clearBridgeCaches?.()
    } catch {
      // best effort
    }
  }, [closeShortcutMenu])

  const resetStudyDb = useCallback(async () => {
    setResettingDb(true)
    setError(null)
    try {
      await window.jplearnDesktop?.resetStudyDb()
      // resetStudyDb clears card_mastery_scores in the same transaction as
      // review_states, so this only has to drop the renderer's snapshot — the two
      // are no longer reconciled by hand (issue #66).
      const emptyScores: CardScores = emptyCardScores()
      const emptyStats: StatsByScript = {
        hiragana: { ...EMPTY_SCRIPT_STATS },
        katakana: { ...EMPTY_SCRIPT_STATS },
        kanji_n5: { ...EMPTY_SCRIPT_STATS },
        vocab_n5: { ...EMPTY_SCRIPT_STATS },
        grammar_patterns: { ...EMPTY_SCRIPT_STATS },
        sentence_examples: { ...EMPTY_SCRIPT_STATS },
      }
      window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(emptyScores))
      window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(emptyStats))
      window.localStorage.removeItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      setCardScores(emptyScores)
      setScriptStats(emptyStats)
      setMinigameStats(defaultMinigameStatsByScript())
      session.resetSessionForDbReset()
      setGameError(null)
      setShowSettings(false)
      setShowOverview(false)
      setShortcutMenuOpen(false)
      setLearningPathStatus((prev) => {
        if (prev) {
          return { ...prev, onboarding_complete: false }
        }
        return {
          onboarding_complete: false,
          suggested_next: null,
          steps: [],
        }
      })
      navigate('home', 'back')
      setResetConfirmStep(0)
      refreshDeckProgressAfterSeedChange()
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown reset error')
    } finally {
      setResettingDb(false)
    }
  // oxlint-disable react-hooks/exhaustive-deps — session is rebuilt each render; its actions are stable
  }, [loadSummary, refreshDeckProgressAfterSeedChange])

  const loadFSRSStatus = useCallback(async () => {
    try {
      const result = await window.jplearnDesktop?.getFSRSWeights?.()
      if (result) {
        setFsrsCustom(result.is_custom)
      }
    } catch { /* ignore */ }
  }, [])

  const optimizeFSRSWeights = useCallback(async () => {
    setOptimizingFSRS(true)
    setFsrsResult(null)
    try {
      const result = await window.jplearnDesktop?.optimizeFSRS?.()
      setFsrsResult(result ?? null)
      if (result?.ok) {
        setFsrsCustom(true)
      }
    } catch (err) {
      setFsrsResult({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setOptimizingFSRS(false)
    }
  }, [])

  const resetFSRSWeights = useCallback(async () => {
    try {
      await window.jplearnDesktop?.resetFSRSWeights?.()
      setFsrsCustom(false)
      setFsrsResult(null)
    } catch { /* ignore */ }
  }, [])

  const minimizeWindow = useCallback(() => {
    void window.jplearnDesktop?.minimizeWindow()
  }, [])

  const toggleMaximizeWindow = useCallback(() => {
    void (async () => {
      try {
        await window.jplearnDesktop?.toggleMaximizeWindow()
        const state = await window.jplearnDesktop?.isWindowMaximized()
        setIsWindowMaximized(state.isMaximized)
      } catch { /* ignore */ }
    })()
  }, [])

  useEffect(() => {
    if (showSettings) {
      void loadFSRSStatus()
    }
  }, [showSettings, loadFSRSStatus])

  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [closeBehavior, setCloseBehavior] = useState<'ask' | 'tray' | 'quit'>('ask')
  const [autoStartOnLogin, setAutoStartOnLogin] = useState(false)

  useEffect(() => {
    void window.jplearnDesktop?.getConfigValue?.('closeBehavior')?.then((result) => {
      if (result && typeof result.value === 'string' && ['ask', 'tray', 'quit'].includes(result.value)) {
        setCloseBehavior(result.value as 'ask' | 'tray' | 'quit')
      }
    }).catch(() => { /* use default */ })
    void window.jplearnDesktop?.getConfigValue?.('autoStartOnLogin')?.then((result) => {
      if (result && typeof result.value === 'boolean') {
        setAutoStartOnLogin(result.value)
      }
    }).catch(() => { /* use default */ })
  }, [])

  const handleCloseRequest = useCallback(() => {
    if (closeBehavior === 'tray') {
      void window.jplearnDesktop?.minimizeToTray?.()
    } else if (closeBehavior === 'quit') {
      void window.jplearnDesktop?.quitApp?.()
    } else {
      setShowCloseDialog(true)
    }
  }, [closeBehavior])

  const handleCloseMinimizeToTray = useCallback((remember: boolean) => {
    setShowCloseDialog(false)
    void window.jplearnDesktop?.minimizeToTray?.()
    if (remember) {
      void window.jplearnDesktop?.setConfigValue?.('closeBehavior', 'tray')
      setCloseBehavior('tray')
    }
  }, [])

  const handleCloseQuit = useCallback((remember: boolean) => {
    setShowCloseDialog(false)
    void window.jplearnDesktop?.quitApp?.()
    if (remember) {
      void window.jplearnDesktop?.setConfigValue?.('closeBehavior', 'quit')
      setCloseBehavior('quit')
    }
  }, [])

  // Handles completion of the onboarding form: seeds deck expertise and records
  // that onboarding finished. No path is chosen — there is one curriculum, and
  // it comes from JPLEARN_GRAPH (issue #78 Phase 5).
  const handleOnboardingComplete = useCallback(async (
    checkedItems: Set<string>,
    answers: { goal?: string; dailyMinutes?: number; targetLevel?: string },
  ) => {
    const level = deriveExpertiseLevelFromChecked(checkedItems)
    try {
      await window.jplearnDesktop?.applyExpertiseLevel(level)
      if (level === 'total_beginner') {
        setCardScores({ hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, sentence_examples: {} })
      } else {
        const targetScripts = EXPERTISE_LEVEL_TO_SCRIPT_KEYS[level]
        const payloads = await Promise.all(targetScripts.map((slug) => getDeckCardsDeduped(slug)))
        setCardScores((previous) => {
          const next: CardScores = {
            hiragana: { ...previous.hiragana },
            katakana: { ...previous.katakana },
            kanji_n5: { ...previous.kanji_n5 },
            vocab_n5: { ...previous.vocab_n5 },
            grammar_patterns: { ...previous.grammar_patterns },
            sentence_examples: { ...previous.sentence_examples },
          }
          targetScripts.forEach((scriptKey, index) => {
            const deck = payloads[index]
            const seeded = { ...next[scriptKey] }
            deck.cards.forEach((card) => { seeded[card.id] = CARD_MASTERY_MAX })
            next[scriptKey] = seeded
          })
          return next
        })
      }
      refreshDeckProgressAfterSeedChange()
    } catch {
      // Expertise seeding is best-effort; proceed to mark onboarding complete.
    }

    // One curriculum since issue #78 Phase 5, so onboarding no longer picks a
    // path — it just records that it finished.
    const result = await window.jplearnDesktop?.completeOnboarding?.(answers).catch(() => undefined)
    if (result) setLearningPathStatus(result as LearningPathStatus)
  }, [getDeckCardsDeduped, refreshDeckProgressAfterSeedChange])



  /* the hero runs the thing rather than opening a section — except where the thing IS a place,
     in which case it hands off to the section it named, so you end up where the card said */
  /* THE HERO PERFORMS WHAT IT PROMISES. The card names the drill the engine chose and how many
     cards are due, and its slab says REVIEW THESE -- so it runs that drill rather than dropping the
     learner at the section to choose one for themselves. `HomeView`'s "Up next" row did exactly
     this and was the only thing that did; retiring it left the promise with nothing behind it.

     WITH NOTHING RECOMMENDED THERE IS NOTHING TO RUN, and the card says so too: its slab reads
     OPEN THE PATH, so a section is the honest destination. */
  const runMenuHero = useCallback(() => {
    const top = studyBlock?.recommendations?.[0]
    if (top?.minigame) {
      jumpToScriptHubSetup(
        top.section as ScriptKey,
        top.minigame as MinigameKey,
        top.leech_focus_enabled === null || top.leech_focus_enabled === undefined
          ? undefined
          : { leechFocusEnabled: top.leech_focus_enabled },
      )
      return
    }
    openMenuSection(heroFromStudyBlock(studyBlock).section ?? 'STUDY')
  }, [jumpToScriptHubSetup, openMenuSection, studyBlock])

  // Titlebar callbacks: named here rather than inlined in the titlebar JSX so the
  // titlebar component receives bare handlers instead of raw state setters.
  const toggleShortcutMenu = useCallback(() => {
    setShortcutMenuOpen((open) => !open)
    setActiveShortcutFlyout(null)
  }, [])

  const jumpToJlptPrep = useCallback(() => {
    // No direction argument: these titlebar jumps preserve the prior
    // navDirection, exactly as the bare setView calls did.
    navigate('jlpt_prep')
    setShortcutMenuOpen(false)
  }, [navigate])

  const jumpToPassageHub = useCallback(() => {
    navigate('passage_hub')
    setShortcutMenuOpen(false)
  }, [navigate])

  const toggleAllMapsFlyout = useCallback(() => {
    setActiveShortcutFlyout((current) => (
      current === null || current === 'dev_tools' || current === 'dev_checks'
        ? 'all_maps'
        : null
    ))
  }, [])

  const toggleDevToolsFlyout = useCallback(() => {
    setActiveShortcutFlyout((current) => (current === 'dev_tools' || current === 'dev_checks' ? null : 'dev_tools'))
  }, [])

  const toggleDevChecksFlyout = useCallback(() => {
    setActiveShortcutFlyout((current) => (current === 'dev_checks' ? 'dev_tools' : 'dev_checks'))
  }, [])

  const toggleStreakDetails = useCallback(() => {
    setStreakDetailsOpen((open) => !open)
  }, [])

  const toggleXpDetails = useCallback(() => {
    setXpDetailsOpen((open) => !open)
  }, [])

  const exportBackup = useCallback(async () => {
    setBackupLoading(true)
    setBackupMessage(null)
    try {
      const result = await window.jplearnDesktop.exportAnalyticsJSON!()
      if (result.cancelled) {
        setBackupMessage(null)
      } else if (result.ok) {
        setBackupMessage(`Saved: ${result.path ?? 'file'}`)
      } else {
        setBackupMessage('Export failed.')
      }
    } catch {
      setBackupMessage('Export failed.')
    } finally {
      setBackupLoading(false)
    }
  }, [])

  const importBackup = useCallback(async () => {
    setBackupLoading(true)
    setBackupMessage(null)
    try {
      const result = await window.jplearnDesktop.importAnalyticsJSON!()
      if (result.cancelled) {
        setBackupMessage(null)
      } else if (result.ok) {
        const counts = result.imported ?? {}
        const parts = Object.entries(counts)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${v} ${k}`)
        setBackupMessage(`Imported: ${parts.join(', ') || 'no changes'}`)
      } else {
        setBackupMessage('Import failed.')
      }
    } catch {
      setBackupMessage('Import failed.')
    } finally {
      setBackupLoading(false)
    }
  }, [])

  const closeSettings = useCallback(() => {
    setShowSettings(false)
  }, [])

  const openDictionaryForCurrentRound = useCallback(() => {
    openDictionary(roundState?.focusText ?? roundState?.answer ?? '')
  }, [openDictionary, roundState])

  const toggleTutorPanelFromTitlebar = useCallback(() => {
    setDictionaryOpen(false)
    setShowOverview(false)
    setShowSettings(false)
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
    if (tutor.tutorPanelOpen) {
      tutor.closeTutorPanel()
    } else {
      tutor.openTutorPanel()
    }
  }, [setDictionaryOpen, tutor])

  const xpInLevel = xpProgress ? Math.max(0, xpProgress.xp_for_current_level - xpProgress.xp_to_next_level) : 0
  const xpLevelCap = xpProgress?.xp_for_current_level ?? 0
  const xpPercent = xpLevelCap > 0 ? Math.round((xpInLevel / xpLevelCap) * 100) : 0

  useEffect(() => {
    if (!shortcutMenuOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (shortcutMenuRef.current?.contains(target)) return
      closeShortcutMenu()
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [closeShortcutMenu, shortcutMenuOpen])

  useEffect(() => {
    if (!xpDetailsOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (xpDetailsRef.current?.contains(target)) return
      setXpDetailsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [xpDetailsOpen])

  useEffect(() => {
    if (!streakDetailsOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (streakDetailsRef.current?.contains(target)) return
      setStreakDetailsOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [streakDetailsOpen])

  const handleSetupWizardComplete = useCallback(() => {
    setShowWizard(false)
    const getPath = window.jplearnDesktop?.getLearningPathStatus
    if (getPath) {
      void (async () => {
        try {
          const path = await getPath()
          if (path) {
            setLearningPathStatus(path as LearningPathStatus)
          }
        } catch { /* ignore */ }
      })()
    }
    void loadSummary()
    void models.refreshTutorInstallInfo()
  // oxlint-disable react-hooks/exhaustive-deps — models from useModels hook is not a stable ref
  }, [loadSummary])

  const hasInstalledTutorModel = Boolean(
    models.tutorInstallInfo?.llamaCppInstalled
      && (models.tutorInstallInfo?.models ?? []).some((model) => model.installed),
  )

  const showOnboardingChatbotSection = models.tutorInstallInfo ? hasInstalledTutorModel : true
  const showOnboardingVoiceSection = models.tutorInstallInfo ? models.tutorInstallInfo.voiceInstalled : true
  const showOnboardingFontSection = models.tutorInstallInfo ? models.tutorInstallInfo.fontsInstalled : true

  {/* ── Early-return gate: setup wizard ────────────────────── */}
  if (showWizard === true) {
    return <>
      {cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}
      <SetupWizard onComplete={handleSetupWizardComplete} />
    </>
  }
  if (showWizard === null) {
    return null
  }

  // Show onboarding wizard when onboarding is not complete
  if (!loading && learningPathStatus && !learningPathStatus.onboarding_complete) {
    return <>
      {cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}
      <OnboardingWizard
        showChatbotSection={showOnboardingChatbotSection}
        assistantChatEnabled={settings.assistantChatEnabled}
        onAssistantChatToggle={() => {
          setSettings((prev) => ({ ...prev, assistantChatEnabled: !prev.assistantChatEnabled }))
        }}
        showVoiceSection={showOnboardingVoiceSection}
        voiceOptions={voice.voiceOptions}
        voiceEnabled={settings.voiceEnabled}
        voiceSpeaker={settings.voiceSpeaker}
        voiceBusy={voice.voiceBusy}
        onVoiceToggle={() => setSettings((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
        onVoiceSelect={(id) => {
          setSettings((prev) => ({ ...prev, voiceSpeaker: id }))
          void voice.playQuestionAudio('こんにちは。いっしょにがんばりましょう。', id)
        }}
        showFontSection={showOnboardingFontSection}
        appFont={settings.appFont}
        fontOptions={APP_FONT_OPTIONS}
        onAppFontSelect={(key) => {
          if (!isAppFontPreset(key)) {
            return
          }
          setSettings((prev) => ({ ...prev, appFont: key }))
        }}
        fontSize={settings.fontSize}
        fontSizeOptions={FONT_SIZE_ORDER.map((size) => ({ key: size, label: FONT_SIZE_LABEL[size] }))}
        onFontSizeSelect={(key) => {
          setSettings((prev) => ({ ...prev, fontSize: key }))
        }}
        onComplete={(_pathId, checkedItems, answers) => {
          void handleOnboardingComplete(checkedItems, answers)
        }}
        onSkip={(checkedItems, answers) => {
          void handleOnboardingComplete(checkedItems, answers)
        }}
      />
    </>
  }

  // Renders the active top-level screen. Extracted from the JSX tree so the
  // return reads as <SessionProvider>{renderView()}{overlays}</SessionProvider>;
  // the branches stay mutually exclusive on `view`.
  const renderView = () => (
    <>
      {/* Home is the main landing surface; keep it mounted only for home view. */}
      {/* L2 — one section at a time. A section with no screen here never reaches level two:
          `useMenuPath` passes it straight through to the flat view instead. */}
      {view === 'home' && menuLevel === 2 && menuPath.section === 'STUDY' ? (
        <PathL2
          nodes={progression.nodes}
          loading={progression.loading}
          /* A MILESTONE THAT LEADS TO A DECK NOW STOPS AT ITS OWN LEVEL THREE rather than
             dropping into the hub. `requestOpen` still runs first, so the soft gate and its
             confirmation are unchanged for every one of the sixteen. */
          onOpenNode={openMilestone}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'deck' ? (
        <Deck
          title={menuMilestone}
          slug={activeDeckSlug}
          blocks={menuDeck.blocks}
          gate={menuDeck.gate}
          loading={menuDeck.loading}
          error={menuDeck.error}
          onStart={(index) => {
            /* THE CHOSEN BLOCK IS HANDED OVER, which is what the pile is for -- the hub's own
               default is the furthest unlocked one and would quietly discard a revisit. */
            blockSelection.select(index)
            const node = progression.nodes.find((n) => n.node_id === menuNode)
            if (node) openProgressionNode(node)
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'feed' ? (
        <Feed
          title={menuMilestone}
          feed={vocabFeed}
          onStart={() => {
            const node = progression.nodes.find((n) => n.node_id === menuNode)
            if (node) openProgressionNode(node)
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 2 && menuPath.section === 'DRILLS' ? (
        <Lanes
          jp="練習" en="PRACTICE"
          note="練習 · NOTHING NEW IS TAUGHT HERE — THIS IS WHAT THE PATH HAS ALREADY GIVEN YOU"
          lanes={practiceLanes(summary)}
          onPick={(key) => {
            /* three genuinely different destinations, all of them places the app already has */
            if (key === 'games') { openDailyGames(); return }
            if (key === 'drills') { menuPath.enterScreen('drills'); return }
            jumpToScriptHub(activeScript)
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {worldOpen ? (
        <Lanes
          jp="実践" en="THE WORLD"
          note="実践 · REAL JAPANESE, NOT EXERCISES — NOTHING IN HERE IS EVER DUE"
          lanes={worldCards}
          onPick={(key) => {
            /* two lanes, two doors the app already has: the passage hub, and the tutor popup
               opened straight onto its scenario picker rather than its menu */
            if (key === 'read') { menuPath.enterScreen('library'); return }
            /* TALK has a level three now -- picking the scene is a menu screen rather than the
               tutor's own picker, and it hands the CHOSEN scenario over rather than the list */
            menuPath.enterScreen('scenes')
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'drills' ? (
        <Drills
          deck={activeScript}
          onStart={(deck, mode) => {
            /* the drill itself runs in the script hub, which is where it has always run -- the
               screen hands over BOTH axes rather than only the deck the hub happened to hold */
            jumpToScriptHubMinigame(deck, mode)
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'level' && examDetail ? (
        <ExamLevel
          level={examDetail}
          onStart={() => {
            /* the exam itself is the flat prep view, which is where it has always run */
            navigate('jlpt_prep', 'forward')
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'library' ? (
        <Library
          rows={libraryRows(world.passages)}
          loading={!world.passages}
          onOpen={() => {
            /* the reader itself is the app's own view and stays at L4 -- the plan leaves open
               whether a page of prose should live inside the stage at all */
            navigate('passage_hub', 'forward')
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'wall' ? (
        <Wall onUp={leaveMenuLevel} />
      ) : null}

      {view === 'home' && menuLevel === 3 && menuPath.screen === 'scenes' ? (
        <Scenes
          scenes={buildScenes(world.sessions)}
          onPick={(scenarioId) => {
            if (scenarioId) {
              /* the SCENE, not the picker: `selectScenario` is the scenario tutor's own call and
                 the panel opens already standing on it */
              scenarioTutor.selectScenario(scenarioId)
              tutor.openTutorPanel('scenarios')
              return
            }
            /* free talk is not a scene and never was -- it is the tutor's own chat */
            tutor.openTutorPanel('chat')
          }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {view === 'home' && menuLevel === 2 && menuPath.section === 'RECORDS' ? (
        <Ledger
          summary={summary}
          xp={xpProgress}
          /* the wall is a real level three now, so the door opens it rather than the flat panel */
          onOpenAchievements={() => menuPath.enterScreen('wall')}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {examOpen ? (
        <Ascent
          rungs={examRungs}
          loading={exam.loading}
          onOpen={(level) => { setExamRung(level); menuPath.enterScreen('level') }}
          onUp={leaveMenuLevel}
        />
      ) : null}

      {/* THE MOMENT TAKES THE STAGE. It is drawn before the front door rather than over it, because
          it is the only screen here that is an event -- and `menuLevel` has already closed every
          other menu branch, so this is the whole of the menu while it is up. */}
      {view === 'home' && moment ? (
        <Unlock moment={moment} onContinue={menu.dismissUnlocks} />
      ) : null}

      {view === 'home' && menuLevel === 1 ? (
        <MenuL1
          controller={menu}
          hero={heroFromStudyBlock(studyBlock)}
          crown={crownFrom(summary?.streak?.current_days ?? null, xpProgress, {
            /* WHAT THE CHIPS OPEN ONTO, and every field is one `summary` already carries -- see
               `statPanels.ts` for why nothing here is invented and why the clock has no panel. */
            streakBest: summary?.streak?.best_days ?? null,
            freezes: summary?.streak?.freezes_available ?? null,
            week: summary?.activity?.week
              ? {
                reviewed: activity.week.reviewed,
                correct: activity.week.correct,
                accuracy: activity.week.accuracy,
                activeDays: activity.week.active_days,
                points: activity.week.points_earned,
              }
              : null,
          })}
          rows={rowsFrom({
            nodes: progression.nodes,
            block: studyBlock,
            streakDays: summary?.streak?.current_days ?? null,
          })}
          onOpenSection={enterMenuSection}
          onRunHero={runMenuHero}
        />
      ) : null}

      {/* Keyboard shortcut cheatsheet */}
      <KeyboardCheatsheet isOpen={keyboardCheatsheetOpen} onClose={closeKeyboardCheatsheet} />

      {/* Command palette (Ctrl+K) */}
      <CommandPalette
        isOpen={commandPalette.isOpen}
        query={commandPalette.query}
        onQueryChange={commandPalette.setQuery}
        commands={commandPalette.filtered}
        selectedIndex={commandPalette.selectedIndex}
        onSelect={commandPalette.setSelectedIndex}
        onExecute={(cmd) => { commandPalette.close(); cmd.action() }}
        onClose={commandPalette.close}
      />

      {/* XP gain toasts — centered, stacks vertically */}
      {xpToasts.length > 0 ? (
        <div
          style={{
            position: 'fixed',
            top: '3rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '4px',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 300,
          }}
        >
          {xpToasts.map((t) => (
            <div
              key={t.id}
              className="xp-toast-inner"
              style={{
                background: 'color-mix(in oklab, var(--accent-soft) 18%, var(--panel-bg-alt))',
                border: '1px solid color-mix(in oklab, var(--accent) 42%, transparent)',
                padding: '10px 28px',
                fontSize: '0.95rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                lineHeight: 1,
              }}
            >
              {t.levelAfter != null
                ? <>Level Up! {t.levelBefore} → {t.levelAfter}</>
                : <>+{t.xp} XP</>}
            </div>
          ))}
        </div>
      ) : null}

      {/* Milestone achievement toasts — centered, stacks vertically */}
      {milestoneToasts.length > 0 ? (
        <div
          style={{
            position: 'fixed',
            top: '6.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '4px',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 300,
          }}
        >
          {milestoneToasts.map((t) => {
            const meta = BADGE_METADATA[t.descriptor]
            if (!meta) return null
            return (
              <div
                key={t.id}
                className="milestone-toast-inner"
                style={{
                  background: 'color-mix(in oklab, var(--tone-amber) 18%, var(--panel-bg-alt))',
                  border: '1px solid color-mix(in oklab, var(--tone-amber) 42%, transparent)',
                  padding: '10px 28px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  lineHeight: 1.4,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Trophy size={16} aria-hidden="true" />
                <span>{meta.name} — {meta.description}</span>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Gated-node confirmation. Same component and shape as the readiness
          warning below, because it is the same promise to the learner: this is
          advice, not a wall. Confirming is remembered per node. */}
      {progression.pending && (
        <ReadinessWarningModal
          sectionLabel={progression.pending.name}
          readiness="advanced"
          reason={LOCKED_NODE_REASON}
          onCancel={() => { milestoneRequestRef.current = null; progression.cancelOpen() }}
          onContinue={() => {
            const node = progression.confirmOpen()
            if (!node) return
            /* the menu's own request goes back to the menu; the two maps keep their old door */
            const fromMenu = milestoneRequestRef.current === node.node_id
            milestoneRequestRef.current = null
            if (fromMenu) routeMilestone(node)
            else openProgressionNode(node)
          }}
        />
      )}

      {/* Readiness warning modal — shown before navigating to a non-recommended section */}
      {warningModal && (
        <ReadinessWarningModal
          sectionLabel={warningModal.label}
          readiness={warningModal.readiness}
          reason={warningModal.reason}
          onCancel={() => setWarningModal(null)}
          onContinue={() => {
            const { sectionId } = warningModal
            warnedSectionsRef.current.add(sectionId)
            setWarningModal(null)
            setDictionaryOpen(false)
            setShowOverview(false)
            setShowSettings(false)
            tutor.closeTutorPanel()

            if (sectionId === 'jlpt_prep') {
              navigate('jlpt_prep', 'forward')
              return
            }

            setActiveScript(sectionId)
            navigate('script_hub', 'forward')
          }}
        />
      )}

      {/* ScriptHub uses a full view so setup content has enough space. */}
      {view === 'script_hub' ? (
        <ScriptHubView
          vocabFeed={vocabFeed}
          activeDeckSlug={activeDeckSlug}
          navDirection={navDirection}
          activeScript={activeScript}
          activeGame={activeGame}
          selectedBlockIndices={blockSelection.selected}
          blockSelectionSummary={describeSelection(
            blockProgressWithMastery, blockSelection.selected, activeBlockCards.length,
          )}
          gameLoading={gameLoading}
          gameError={gameError}
          blockProgressWithMastery={blockProgressWithMastery}
          activeBlockCards={activeBlockCards}
          kanjiLevelProgress={kanjiLevelProgress}
          vocabLevelProgress={vocabLevelProgress}
          activeKanjiLevel={activeKanjiLevel}
          activeVocabLevel={activeVocabLevel}
          kanjiCategoryProgress={[]}
          vocabCategoryProgress={vocabCategoryProgress}
          activeVocabCategory={activeVocabCategory}
          learningPathExpanded={learningPathExpanded}
          learningPathTrackRows={learningPathTrackRows}
          minigameStats={minigameStats}
          availableMinigames={availableMinigames}
          activeSectionName={activeSectionName}
          minigameLockReasons={minigameLockReasons}
          onBack={goHome}
          onToggleBlock={(index) => {
            blockSelection.toggle(index)
            resetSessionWithLives()
          }}
          onSelectAllBlocks={() => {
            blockSelection.selectAll()
            resetSessionWithLives()
          }}
          onClearBlocks={() => {
            blockSelection.clear()
            resetSessionWithLives()
          }}
          onSelectKanjiLevel={(level) => {
            setActiveKanjiLevel(level)
            resetSessionWithLives()
          }}
          onSelectVocabLevel={(level) => {
            setActiveVocabLevel(level)
            resetSessionWithLives()
          }}
          onSelectVocabCategory={(cat) => {
            setActiveVocabCategory(cat)
            setActiveVocabLevel(categoryLevelOf(cat))
            resetSessionWithLives()
          }}
          onToggleLearningPath={() => setLearningPathExpanded((expanded) => !expanded)}
          onSelectGame={(game) => {
            setActiveGame(game)
            resetSessionWithLives()
          }}
          onPlayGame={(game) => {
            setActiveGame(game)
            navigate('minigame', 'forward')
            resetSessionWithLives()
            void startSession(game)
          }}
        />
      ) : null}

      {view === 'minigame' ? (
        <MinigameView
          navDirection={navDirection}
          activeScript={activeScript}
          activeGame={explicitReviewItems ? 'romaji_sprint' : activeGame}
          activeSectionName={activeSectionName}
          gameLoading={gameLoading}
          gameError={gameError}
          activeRunCardsLength={explicitReviewItems?.length ?? activeRunCards.length}
          voiceEnabled={settings.voiceEnabled}
          showKeyboardPrompts={settings.showKeyboardPrompts}
          furiganaEnabled={settings.furiganaEnabled}
          furiganaAutoHideMastered={settings.furiganaAutoHideMastered}
          activeBlockCards={explicitReviewItems?.map((item) => item.card) ?? activeBlockCards}
          activeRoundCard={explicitReviewItems && roundState?.deckSlug
            ? explicitReviewItems.find((item) => item.deckSlug === roundState.deckSlug && item.cardId === roundState.cardId)?.card ?? null
            : null}
          onBack={() => {
            if (explicitReviewItemsRef.current) {
              returnToDailyGamesHub()
              return
            }
            navigate('script_hub', 'back')
          }}
          onOpenDictionary={(seedQuery) => openDictionary(seedQuery ?? '')}
          onOpenSettings={openSettingsFromMenu}
          onRetry={session.handleRetry}
          onHandwritingOutcome={session.submitHandwritingOutcome}
        />
      ) : null}

      {view === 'jlpt_prep' ? (
        <JLPTPrepView
          onBack={() => {
            navigate('home', 'back')
          }}
        />
      ) : null}

      {view === 'passage_hub' ? (
        <PassageHubView
          onBack={() => {
            navigate('home', 'back')
          }}
          onOpenDictionary={(query) => openDictionary(query ?? '')}
          onPlayAudio={(text) => { void voice.playQuestionAudio(text) }}
          voiceBusy={voice.voiceBusy}
        />
      ) : null}

      {view === 'daily_games' ? (
        <div className={`view-shell view-${navDirection}`}>
          <div className="hub-crt-surface" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
          <div className="hub-vhs-line" aria-hidden="true" />
          <div className="hub-crystal hub-crystal--a" aria-hidden="true" />
          <div className="hub-crystal hub-crystal--b" aria-hidden="true" />
          <div className="hub-crystal hub-crystal--c" aria-hidden="true" />

          <header className="hub-topbar">
            <h1 className="sr-only">Daily Games</h1>
            <button
              type="button"
              className="back-button back-button-icon-only"
              onClick={() => { navigate('home', 'back'); }}
              aria-label="Back to main menu"
            >
              <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
            </button>

            <span className="hub-nameplate">
              <span className="hub-nameplate-mark" aria-hidden="true">JPL-DLY-A</span>
              <strong className="hub-topbar-title">
                <span className="hub-glitch-text">{DAILY_GAMES_COPY.title}</span>
              </strong>
            </span>

            <span className="hub-topbar-sub">DAILY GAMES · 毎日</span>
          </header>

          <div className="hub-studio">
            <ErrorBoundary>
              <Suspense fallback={<div className="daily-games-hub" role="status" aria-label={DAILY_GAMES_COPY.loading} />}>
                <DailyGamesHub
                  onReviewMissedWords={startMissedWordReview}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      ) : null}
    </>
  )

  return (
    <main className={view === 'home' ? 'app-shell mn-showing' : 'app-shell'}>
      <AppTitlebar
        bare={view === 'home'}
        windowDrag={windowDrag}
        shortcutMenuRef={shortcutMenuRef}
        shortcutMenuOpen={shortcutMenuOpen}
        toggleShortcutMenu={toggleShortcutMenu}
        activeShortcutFlyout={activeShortcutFlyout}
        setActiveShortcutFlyout={setActiveShortcutFlyout}
        jumpToMainMenu={jumpToMainMenu}
        jumpToOverview={jumpToOverview}
        jumpToJlptPrep={jumpToJlptPrep}
        jumpToPassageHub={jumpToPassageHub}
        openDailyGames={openDailyGames}
        toggleAllMapsFlyout={toggleAllMapsFlyout}
        jumpToScriptHub={jumpToScriptHub}
        jumpToScriptHubMinigame={jumpToScriptHubMinigame}
        toggleDevToolsFlyout={toggleDevToolsFlyout}
        toggleDevChecksFlyout={toggleDevChecksFlyout}
        openSettingsFromMenu={openSettingsFromMenu}
        refreshDataFromMenu={refreshDataFromMenu}
        inspectElementFromMenu={inspectElementFromMenu}
        openDevDashboard={openDevDashboard}
        runCheckFromMenu={runCheckFromMenu}
        restartBridgeFromMenu={restartBridgeFromMenu}
        clearCachesFromMenu={clearCachesFromMenu}
        openDictionaryForCurrentRound={openDictionaryForCurrentRound}
        canTitlebarBack={nav.canHistoryBack}
        canTitlebarForward={nav.canHistoryForward}
        titlebarHistoryBack={nav.historyBack}
        titlebarHistoryForward={nav.historyForward}
        settings={settings}
        pomodoro={pomodoro}
        tutor={tutor}
        tutorTitlebarButtonRef={tutorTitlebarButtonRef}
        toggleTutorPanelFromTitlebar={toggleTutorPanelFromTitlebar}
        streak={streak}
        streakDetailsOpen={streakDetailsOpen}
        streakDetailsRef={streakDetailsRef}
        toggleStreakDetails={toggleStreakDetails}
        xpProgress={xpProgress}
        xpDetailsOpen={xpDetailsOpen}
        xpDetailsRef={xpDetailsRef}
        toggleXpDetails={toggleXpDetails}
        xpInLevel={xpInLevel}
        xpLevelCap={xpLevelCap}
        xpPercent={xpPercent}
        isWindowMaximized={isWindowMaximized}
        minimizeWindow={minimizeWindow}
        toggleMaximizeWindow={toggleMaximizeWindow}
        handleCloseRequest={handleCloseRequest}
      />
      <div className="atmosphere atmosphere-left" aria-hidden="true" />
      <div className="atmosphere atmosphere-right" aria-hidden="true" />
      <div className="atmosphere atmosphere-top" aria-hidden="true" />
      {showPetalLayer ? (
        <div className="petal-layer" aria-hidden="true">
          {activePetalStream.map((petal, index) => (
            <span
              key={`petal-${index}`}
              className="petal"
              style={{
                left: petal.x,
                '--petal-drift': petal.drift,
                '--petal-duration': petal.duration,
                '--petal-delay': petal.delay,
                '--petal-size': petal.size,
                opacity: petal.opacity,
              } as CSSProperties}
            />
          ))}
        </div>
      ) : null}

      {pageLoading ? (
        <div className="page-loading-overlay" role="status" aria-label={pageLoadingLabel}>
          <div className="page-loading-crt" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
          <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
          <div className="page-loading-widget">
            <span
              className="page-loading-label page-loading-glitch"
              data-text={pageLoadingLabel}
            >
              {pageLoadingLabel}
            </span>
            <div className="page-loading-track">
              <div className="page-loading-fill" />
            </div>
            <div className="page-loading-eq" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-shell-scroll">
      {/* Session state comes from useStudySession; voice and blockSessionComplete
          are App's, and are merged in here rather than pulled into the hook. */}
      <SessionProvider value={{
        ...session.slice,
        blockSessionComplete,
        voiceBusy: voice.voiceBusy,
        voiceUnavailable: voice.voiceUnavailable,
        playAudio: (text) => { void voice.playQuestionAudio(text) },
      }}>
      {renderView()}

      {/* Study Overview popup — accessible on top of any view */}
      {showOverview ? (
        <div
          className="modal-backdrop overview-backdrop"
          role="presentation"
          onClick={() => setShowOverview(false)}
        >
          <div
            className="overview-popup-panel crt-scanlines"
            role="dialog"
            aria-modal="true"
            aria-label="Study Overview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="crt-vhs-line" />
            <OverviewView
              loading={loading}
              error={error}
              lastUpdated={lastUpdated}
              streak={streak}
              decks={decks}
              activity={activity}
              overviewBlocks={overviewBlocks}
              overviewCategoryBlocks={overviewCategoryBlocks}
              overviewKanjiDeck={overviewKanjiDeck}
              overviewKanjiLevelProgress={overviewKanjiLevelProgress}
              overviewBlocksLoading={overviewBlocksLoading}
              mistakes={mistakes}
              minigamePerf={minigamePerf}
              sessionHistory={sessionHistory}
              hasAnyActivity={hasAnyActivity}
              hasMistakeData={hasMistakeData}
              hasMinigamePerfData={hasMinigamePerfData}
              hasSessionHistory={hasSessionHistory}
              charMasteryExpanded={charMasteryExpanded}
              expandedBlocks={expandedBlocks}
              overviewSectionExpanded={overviewSectionExpanded}
              cardScores={cardScores}
              kanjiOverviewPage={kanjiOverviewPage}
              onClose={() => setShowOverview(false)}
              onRefresh={() => void loadSummary()}
              onToggleCharMastery={() => setCharMasteryExpanded((v) => !v)}
              onSetExpandedBlocks={setExpandedBlocks}
              onToggleSection={toggleOverviewSection}
              onSetKanjiOverviewPage={setKanjiOverviewPage}
              onOpenKanjiDetail={openKanjiDetail}
              onSetSelectedChar={setSelectedChar}
            />
          </div>
        </div>
      ) : null}

      {/* the lookup is chrome, not session UI -- it stands above everything and is reachable
          from any screen, which is the one thing the app's own dictionary could never be */}
      <LookupOverlay
        controller={lookup}
        onOpenKanjiDetail={openKanjiDetail}
        onOpenDictionary={(query) => openDictionary(query)}
      />

      <DictionaryPopup
        open={dictionaryOpen}
        openSignal={dictionaryOpenSignal}
        seedQuery={dictionarySeedQuery}
        cards={dictionaryCards}
        onClose={closeDictionary}
        onOpenKanjiDetail={openKanjiDetail}
        onPlayAudio={(text) => { void voice.playQuestionAudio(text) }}
        voiceBusy={voice.voiceBusy}
        voiceUnavailable={voice.voiceUnavailable}
      />

      {kanjiDetailCharacter ? (
        <KanjiDetailPanel character={kanjiDetailCharacter} onClose={closeKanjiDetail} />
      ) : null}

      </SessionProvider>

      {showSettings ? (
        <AppSettingsModal
          closeSettings={closeSettings}
          activeSettingsTab={activeSettingsTab}
          setActiveSettingsTab={setActiveSettingsTab}
          settings={settings}
          setSettings={setSettings}
          collapsedSettingsSections={collapsedSettingsSections}
          shortcutsSectionRef={shortcutsSectionRef}
          advanceFontSize={advanceFontSize}
          reloadLocalFonts={reloadLocalFonts}
          theme={theme}
          voice={voice}
          cursor={cursor}
          models={models}
          resetConfirmStep={resetConfirmStep}
          setResetConfirmStep={setResetConfirmStep}
          resettingDb={resettingDb}
          resetStudyDb={resetStudyDb}
          backupLoading={backupLoading}
          backupMessage={backupMessage}
          exportBackup={exportBackup}
          importBackup={importBackup}
          optimizingFSRS={optimizingFSRS}
          optimizeFSRSWeights={optimizeFSRSWeights}
          resetFSRSWeights={resetFSRSWeights}
          fsrsCustom={fsrsCustom}
          fsrsResult={fsrsResult}
          closeBehavior={closeBehavior}
          setCloseBehavior={setCloseBehavior}
          autoStartOnLogin={autoStartOnLogin}
          setAutoStartOnLogin={setAutoStartOnLogin}
        />
      ) : null}

      {/* Close confirmation dialog — rendered after settings to appear on top */}
      <CloseConfirmDialog
        isOpen={showCloseDialog}
        onMinimizeToTray={handleCloseMinimizeToTray}
        onQuit={handleCloseQuit}
        onClose={() => setShowCloseDialog(false)}
      />

      {tutor.tutorPanelOpen ? (
        <TutorPanel
          tutor={tutor}
          scenarioTutor={scenarioTutor}
          settings={settings as TutorSettingsFields}
          setSettings={setSettings as unknown as Dispatch<SetStateAction<TutorSettingsFields>>}
          cancelAssistantSpeech={voice.cancelAssistantSpeech}
        />
      ) : null}

      {cursor.cursorMode === 'animated' && createPortal(<CursorFollower {...cursor} />, document.body)}

      {selectedChar ? (
        <div
          className="char-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Character detail: ${selectedChar.character}`}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedChar(null) }}
        >
          <div className="char-detail-card">
            <button
              type="button"
              className="char-detail-close"
              onClick={() => setSelectedChar(null)}
              aria-label="Close"
            >✕</button>
            <div className="char-detail-label">{selectedChar.label}</div>
            <div className="char-detail-char" lang="ja">{selectedChar.character}</div>
            <div className="char-detail-romaji">{selectedChar.romaji}</div>
            {selectedChar.meaning !== selectedChar.romaji ? (
              <div className="char-detail-meaning">{selectedChar.meaning}</div>
            ) : null}
            <div className="char-detail-score-bar-wrap">
              {Array.from({ length: CARD_MASTERY_MAX }, (_, i) => (
                <span
                  key={i}
                  className={`char-detail-pip ${i < selectedChar.score ? 'is-filled' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="char-detail-score-label">
              {selectedChar.score === 0 && 'Not studied yet'}
              {selectedChar.score === 1 && 'Just started'}
              {selectedChar.score === 2 && 'Getting there'}
              {selectedChar.score === 3 && 'Almost mastered'}
              {selectedChar.score === CARD_MASTERY_MAX && 'Mastered ✓'}
            </div>
          </div>
        </div>
      ) : null}

      <aside className="assistant-toast-anchor" aria-live="polite" aria-label="Tutor updates">
        {settings.assistantToastLimit > 0 && tutor.activeAssistantToast ? (
          <TutorToast toast={tutor.activeAssistantToast} onDismiss={tutor.dismissAssistantToast} onAction={tutor.launchAssistantToastAction} />
        ) : null}
      </aside>

      {session.showResumeToast && session.resumeData ? (
        <ResumeToast
          deck={session.resumeData.activeScript}
          mode={MINIGAMES.find((m) => m.key === session.resumeData!.activeGame)?.title ?? session.resumeData.activeGame}
          onResume={() => { void session.handleResume() }}
          onDismiss={session.handleDismissResume}
        />
      ) : null}

      {devDashboardOpen ? (
        <DevDashboard
          pendingCheck={pendingDevCheck}
          onClose={() => { setDevDashboardOpen(false); setPendingDevCheck(null) }}
        />
      ) : null}

      <BreakOverlay
        display={pomodoro.display && (pomodoro.display.phase === 'break' || pomodoro.display.phase === 'long-break') ? pomodoro.display : null}
        onSkip={pomodoro.skip}
        onStartNext={pomodoro.startWork}
      />

      </div>
    </main>
  )
}

export default App



