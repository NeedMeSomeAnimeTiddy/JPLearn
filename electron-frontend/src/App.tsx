import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type {
  AppSettings,
  BlockInfo,
  BlockProgressPayload,
  CardScores,
  DeckSlugInput,
  JlptLevel,
  KanjiCategory,
  LearningPathStatus,
  MinigameKey,
  MinigameStatsByScript,
  OverviewCategoryBlocks,
  OverviewKanjiCard,
  OverviewSectionKey,
  PlayableMinigame,
  RecommendationItem,
  RoundState,
  ScriptDeck,
  ScriptKey,
  SectionReadiness,
  SettingsTabKey,
  ShortcutSubmenuKey,
  StatsByScript,
  StudyPlanCoverageRow,
  StudyQueueResponse,
  StudySummaryPayload,
  VocabCategory,
  XPProgress,
} from './types'
import { SetupWizard } from './components/SetupWizard'
import { DictionaryPopup } from './components/DictionaryPopup'
import { ResumeToast } from './components/ResumeToast'
import { CloseConfirmDialog } from './components/CloseConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppTitlebar } from './components/AppTitlebar'
import { AppSettingsModal } from './components/AppSettingsModal'
import { HomeView } from './views/HomeView'
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
import type { Command } from './features/command-palette'
import { SessionProvider } from './context/SessionContext'
import { useAppNavigation, VIEW_PARENT } from './features/navigation'
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
  useStudySession,
} from './features/study-session'
import './App.css'
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
  KANJI_CATEGORY_ORDER,
  KANJI_CATEGORY_LABELS,
  KANJI_CATEGORY_TO_DECK_SLUG,
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
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0)
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
  const [activeKanjiCategory, setActiveKanjiCategory] = useState<KanjiCategory>('numbers_time')
  const [activeVocabCategory, setActiveVocabCategory] = useState<VocabCategory>('greetings')
  const [kanjiDeckCardsByCategory, setKanjiDeckCardsByCategory] = useState<Record<KanjiCategory, ScriptDeck['cards']>>({
    numbers_time: [], nature_world: [], people_body: [], study_language: [], actions_travel: [],
    n4_society_roles: [], n4_mind_thought: [], n4_daily_life: [], n4_time_action: [],
    n3_governance: [], n3_communication: [], n3_movement: [], n3_achievement: [],
    n2_professionalism: [], n2_economics: [], n2_analysis: [],
    n1_law_order: [], n1_ideology: [], n1_literary: [],
  })
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
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
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
  const kanjiCategoryDeckCacheRef = useRef<Partial<Record<KanjiCategory, ScriptDeck['cards']>>>({})
  const vocabCategoryDeckCacheRef = useRef<Partial<Record<VocabCategory, ScriptDeck['cards']>>>({})
  const kanjiCategoryBlockCacheRef = useRef<Partial<Record<KanjiCategory, BlockInfo[]>>>({})
  const vocabCategoryBlockCacheRef = useRef<Partial<Record<VocabCategory, BlockInfo[]>>>({})
  const scriptDeckCacheRef = useRef<Partial<Record<ScriptKey, ScriptDeck['cards']>>>({})
  const scriptBlockCacheRef = useRef<Partial<Record<ScriptKey, BlockInfo[]>>>({})
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

  const activeDeckSlug = useMemo(() => {
    if (activeScript === 'kanji_n5') return KANJI_CATEGORY_TO_DECK_SLUG[activeKanjiCategory]
    if (activeScript === 'vocab_n5') return VOCAB_CATEGORY_TO_DECK_SLUG[activeVocabCategory]
    return activeScript
  }, [activeKanjiCategory, activeScript, activeVocabCategory])

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

  // Cards restricted to the active block when block progression is available.
  const activeBlockCards = useMemo(() => {
    if (blockProgress.length === 0) {
      return deckCards
    }
    const block = blockProgress.find((entry) => entry.index === activeBlockIndex)
    if (!block) return deckCards
    const idSet = new Set(block.card_ids)
    const matchingCards = deckCards.filter((c) => idSet.has(c.id))
    // Fallback to full deck when block metadata does not map to loaded card IDs.
    return matchingCards.length > 0 ? matchingCards : deckCards
  }, [deckCards, blockProgress, activeBlockIndex])

  const models = useModels()

  const voice = useVoice(
    settings as VoiceSettingsFields,
    setSettings as unknown as Dispatch<SetStateAction<VoiceSettingsFields>>,
    {
      tutorInstallInfo: models.tutorInstallInfo,
      refreshTutorInstallInfo: models.refreshTutorInstallInfo,
    },
  )

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
    activeKanjiCategory,
    activeVocabCategory,
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

  const showPetalLayer = activePetalStream.length > 0 && !(view === 'minigame' && sessionActive)

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
      if (recs) setRecommendations(recs.recommendations)
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

  const loadScriptCards = useCallback(async (
    script: ScriptKey,
    kanjiCategory: KanjiCategory = activeKanjiCategory,
    vocabCategory: VocabCategory = activeVocabCategory,
  ) => {
    const requestId = scriptLoadRequestIdRef.current + 1
    scriptLoadRequestIdRef.current = requestId
    setGameLoading(true)
    setGameError(null)

    resetSessionFull()

    try {
      if (script === 'kanji_n5') {
        const selectedKanjiSlug = KANJI_CATEGORY_TO_DECK_SLUG[kanjiCategory]
        const cachedCards = kanjiCategoryDeckCacheRef.current[kanjiCategory]
        const cachedBlocks = kanjiCategoryBlockCacheRef.current[kanjiCategory]

        let selectedCards = cachedCards
        let selectedBlocks = cachedBlocks

        if (!selectedCards || !selectedBlocks) {
          const [selectedDeckPayload, blockPayload] = await Promise.all([
            getDeckCardsDeduped(selectedKanjiSlug),
            getBlockProgressDeduped(selectedKanjiSlug),
          ])

          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }

          selectedCards = normalizeDeckCards(selectedDeckPayload.cards)
          selectedBlocks = normalizeBlockList(blockPayload.blocks)
          kanjiCategoryDeckCacheRef.current[kanjiCategory] = selectedCards
          kanjiCategoryBlockCacheRef.current[kanjiCategory] = selectedBlocks
          setKanjiDeckCardsByCategory((previous) => ({
            ...previous,
            [kanjiCategory]: selectedCards,
          }))
        }

        const resolvedKanjiCards = selectedCards ?? []
        const resolvedKanjiBlocks = selectedBlocks ?? []

        setDeckCards(resolvedKanjiCards)

        // Preload remaining kanji categories in background
        for (const cat of KANJI_CATEGORY_ORDER) {
          if (cat === kanjiCategory || kanjiCategoryDeckCacheRef.current[cat]) continue
          void (async () => {
            try {
              const payload = await getDeckCardsDeduped(KANJI_CATEGORY_TO_DECK_SLUG[cat])
              const normalizedCards = normalizeDeckCards(payload.cards)
              kanjiCategoryDeckCacheRef.current[cat] = normalizedCards
              setKanjiDeckCardsByCategory((previous) => ({
                ...previous,
                [cat]: normalizedCards,
              }))
            } catch { /* ignore preload failure */ }
          })()
          void (async () => {
            try {
              const payload = await getBlockProgressDeduped(KANJI_CATEGORY_TO_DECK_SLUG[cat])
              kanjiCategoryBlockCacheRef.current[cat] = normalizeBlockList(payload.blocks)
            } catch { /* ignore preload failure */ }
          })()
        }

        const blocks = resolvedKanjiBlocks
        setBlockProgress(blocks)
        if (blocks.length > 0) {
          const lastUnlocked = blocks.reduce(
            (best, b) => (b.unlocked ? b.index : best),
            0,
          )
          setActiveBlockIndex(lastUnlocked)
        } else {
          setActiveBlockIndex(0)
        }
      } else if (script === 'vocab_n5') {
        const selectedVocabSlug = VOCAB_CATEGORY_TO_DECK_SLUG[vocabCategory]
        const cachedCards = vocabCategoryDeckCacheRef.current[vocabCategory]
        const cachedBlocks = vocabCategoryBlockCacheRef.current[vocabCategory]

        let selectedCards = cachedCards
        let selectedBlocks = cachedBlocks

        if (!selectedCards || !selectedBlocks) {
          const [selectedDeckPayload, blockPayload] = await Promise.all([
            getDeckCardsDeduped(selectedVocabSlug),
            getBlockProgressDeduped(selectedVocabSlug),
          ])

          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }

          selectedCards = normalizeDeckCards(selectedDeckPayload.cards)
          selectedBlocks = normalizeBlockList(blockPayload.blocks)
          vocabCategoryDeckCacheRef.current[vocabCategory] = selectedCards
          vocabCategoryBlockCacheRef.current[vocabCategory] = selectedBlocks
          setVocabDeckCardsByCategory((previous) => ({
            ...previous,
            [vocabCategory]: selectedCards,
          }))
        }

        const resolvedVocabCards = selectedCards ?? []
        const resolvedVocabBlocks = selectedBlocks ?? []

        setDeckCards(resolvedVocabCards)

        // Preload remaining vocab categories in background
        for (const cat of VOCAB_CATEGORY_ORDER) {
          if (cat === vocabCategory || vocabCategoryDeckCacheRef.current[cat]) continue
          void (async () => {
            try {
              const payload = await getDeckCardsDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
              const normalizedCards = normalizeDeckCards(payload.cards)
              vocabCategoryDeckCacheRef.current[cat] = normalizedCards
              setVocabDeckCardsByCategory((previous) => ({
                ...previous,
                [cat]: normalizedCards,
              }))
            } catch { /* ignore preload failure */ }
          })()
          void (async () => {
            try {
              const payload = await getBlockProgressDeduped(VOCAB_CATEGORY_TO_DECK_SLUG[cat])
              vocabCategoryBlockCacheRef.current[cat] = normalizeBlockList(payload.blocks)
            } catch { /* ignore preload failure */ }
          })()
        }

        const blocks = resolvedVocabBlocks
        setBlockProgress(blocks)
        if (blocks.length > 0) {
          const lastUnlocked = blocks.reduce(
            (best, b) => (b.unlocked ? b.index : best),
            0,
          )
          setActiveBlockIndex(lastUnlocked)
        } else {
          setActiveBlockIndex(0)
        }
      } else {
        const cachedDeck = scriptDeckCacheRef.current[script]
        const cachedBlocks = scriptBlockCacheRef.current[script]

        let resolvedCards = cachedDeck
        let resolvedBlocks = cachedBlocks

        if (!resolvedCards || !resolvedBlocks) {
          const [deckPayload, blockPayload] = await Promise.all([
            resolvedCards ? Promise.resolve({ cards: resolvedCards }) : getDeckCardsDeduped(script),
            resolvedBlocks ? Promise.resolve({ blocks: resolvedBlocks }) : getBlockProgressDeduped(script),
          ])
          if (scriptLoadRequestIdRef.current !== requestId) {
            return
          }

          if (!resolvedCards) {
            resolvedCards = limitRuntimeDeckCards(script, normalizeDeckCards(deckPayload.cards))
            scriptDeckCacheRef.current[script] = resolvedCards
          }
          if (!resolvedBlocks) {
            resolvedBlocks = normalizeBlockList(blockPayload.blocks)
            scriptBlockCacheRef.current[script] = resolvedBlocks
          }
        }

        setDeckCards(resolvedCards ?? [])

        const blocks = resolvedBlocks ?? []
        setBlockProgress(blocks)
        if (blocks.length > 0) {
          const lastUnlocked = blocks.reduce(
            (best, b) => (b.unlocked ? b.index : best),
            0,
          )
          setActiveBlockIndex(lastUnlocked)
        } else {
          setActiveBlockIndex(0)
        }
      }

      lastLoadedScriptRef.current = script
    } catch (err) {
      if (scriptLoadRequestIdRef.current !== requestId) {
        return
      }
      setDeckCards([])
      setBlockProgress([])
      setActiveBlockIndex(0)
      setGameError(err instanceof Error ? err.message : 'Could not load deck data. Restart the app if this persists.')
    } finally {
      if (scriptLoadRequestIdRef.current === requestId) {
        setGameLoading(false)
      }
    }
  }, [activeKanjiCategory, activeVocabCategory, getBlockProgressDeduped, getDeckCardsDeduped, resetSessionFull])

  // After the backend SRS states change wholesale (onboarding seeding or a reset),
  // the cached deck/block progress no longer matches the database. Drop every cache
  // and refetch so the minigame learning path and overview block tiles reflect the
  // new unlock/mastery state instead of showing stale "locked"/0% data.
  const refreshDeckProgressAfterSeedChange = useCallback(() => {
    scriptDeckCacheRef.current = {}
    scriptBlockCacheRef.current = {}
    kanjiCategoryDeckCacheRef.current = {}
    kanjiCategoryBlockCacheRef.current = {}
    vocabCategoryDeckCacheRef.current = {}
    vocabCategoryBlockCacheRef.current = {}
    studyQueueCacheRef.current.clear()

    void loadScriptCards(activeScript, activeKanjiCategory, activeVocabCategory)
    void (async () => {
      try {
        const payload = await window.jplearnDesktop?.getOverviewCharacterMastery()
        if (!payload) return
        setOverviewBlocks(payload.blocks)
        setOverviewCategoryBlocks(payload.category_blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
      } catch { /* ignore */ }
    })()
  }, [activeScript, activeKanjiCategory, activeVocabCategory, loadScriptCards])

  useEffect(() => {
    void loadScriptCards(activeScript, activeKanjiCategory, activeVocabCategory)
  }, [activeScript, activeKanjiCategory, activeVocabCategory, loadScriptCards])

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

  const kanjiCategoryProgress = useMemo(
    () => buildCategoryProgress(
      KANJI_CATEGORY_ORDER, KANJI_CATEGORY_LABELS, KANJI_CATEGORY_TO_DECK_SLUG,
      kanjiDeckCardsByCategory, cardScores.kanji_n5,
    ),
    [kanjiDeckCardsByCategory, cardScores.kanji_n5],
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

      if (event.key === 'Escape') {
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
  }, [closeKanjiDetail, kanjiDetailCharacter, tutor.tutorPanelOpen, tutor.tutorPanelMode, tutor.closeTutorPanel, tutor.returnToTutorMenu, loadSummary, selectedChar, shortcutMenuOpen, showOverview, showSettings, view])

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
    () => buildStudyPlan(decks, kanjiLevelProgress, vocabLevelProgress, activity, streak.current_days),
    [activity, decks, kanjiLevelProgress, streak.current_days, vocabLevelProgress],
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

  useEffect(() => {
    if (blockProgressWithMastery.length === 0) return

    const current = blockProgressWithMastery.find((block) => block.index === activeBlockIndex)
    if (current?.unlocked) return

    const firstUnlocked = blockProgressWithMastery.find((block) => block.unlocked)
    if (firstUnlocked) {
      setActiveBlockIndex(firstUnlocked.index)
      return
    }

    if (activeBlockIndex !== 0) {
      setActiveBlockIndex(0)
    }
  }, [blockProgressWithMastery, activeBlockIndex])

  const activeSectionName = useMemo(() => {
    if (blockProgressWithMastery.length > 0) {
      return blockProgressWithMastery.find((block) => block.index === activeBlockIndex)?.name ?? null
    }
    if (activeScript === 'kanji_n5') {
      return kanjiCategoryProgress.find((cat) => cat.key === activeKanjiCategory)?.label ?? null
    }
    if (activeScript === 'vocab_n5') {
      return vocabCategoryProgress.find((cat) => cat.key === activeVocabCategory)?.label ?? null
    }
    return null
  }, [blockProgressWithMastery, activeBlockIndex, activeScript, kanjiCategoryProgress, activeKanjiCategory, vocabCategoryProgress, activeVocabCategory])




  const minigameLockReasons = useMemo(() => {
    const reasons: Partial<Record<MinigameKey, string>> = {}
    if (!voice.speechRecognitionModelEnabled) {
      reasons.speech_recall = voice.speechRecognitionLockReason
    }
    if (voice.listeningLockReason) {
      reasons.listening_audio_first = voice.listeningLockReason
      reasons.dictation = voice.listeningLockReason
    }
    if (activeScript === 'vocab_n5' && activeBlockCards.length > 0) {
      const hasCompounds = activeBlockCards.some((c) => {
        const kanjiChars = [...c.character].filter((ch) => /\p{Script=Han}/u.test(ch))
        return kanjiChars.length >= 2 && !kanjiChars.some((ch) => !(ch in KANJI_MEANINGS))
      })
      if (!hasCompounds) {
        reasons.kanji_compound_builder = 'No compound words in this block'
      }
    }
    if (leechFocusEnabled && activeBlockCards.length > 0 && activeBlockCards.filter((c) => c.is_leech).length === 0) {
      const leechModes: MinigameKey[] = ['romaji_sprint', 'meaning_match', 'character_match', 'stroke_order', 'typed_recall', 'speech_recall', 'sentence_assembly', 'particle_cloze', 'vibe_check', 'imposter', 'listening_audio_first', 'dictation', 'kanji_compound_builder', 'context_cloze', 'interleave_mix']
      for (const mode of leechModes) {
        if (!reasons[mode]) reasons[mode] = 'No leech cards in this block'
      }
    }
    if (activeBlockCards.length > 0 && activeBlockCards.length < 2) {
      const mcModes: MinigameKey[] = ['meaning_match', 'character_match', 'particle_cloze', 'vibe_check', 'imposter', 'listening_audio_first', 'kanji_compound_builder', 'context_cloze']
      for (const mode of mcModes) {
        if (!reasons[mode]) reasons[mode] = 'Not enough cards for this mode'
      }
    }
    return reasons
  // oxlint-disable react-hooks/exhaustive-deps — voice.speechRecognitionLockReason is a constant string, voice hook return is not stable
  }, [voice.listeningLockReason, voice.speechRecognitionModelEnabled, activeScript, activeBlockCards, leechFocusEnabled])

  // Block session is complete when every card in the active block has reached max score.
  // sessionRounds > 0 ensures we don't trigger on a pre-mastered block before answering.
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
    if (activeScript !== 'kanji_n5' || blockProgress.length > 0) return
    const activeCat = kanjiCategoryProgress.find((cat) => cat.key === activeKanjiCategory)
    if (activeCat?.total && activeCat.total > 0) return
    const fallback = kanjiCategoryProgress.find((cat) => cat.unlocked) ?? kanjiCategoryProgress.find((cat) => cat.total > 0)
    if (!fallback || fallback.key === activeKanjiCategory) return
    setActiveKanjiCategory(fallback.key as KanjiCategory)
  }, [activeScript, blockProgress.length, kanjiCategoryProgress, activeKanjiCategory])

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

  const jumpToScriptHubSetup = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    closeKanjiDetail()
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setActiveScript(script)
    setActiveGame(resolvedMinigame)
    navigate('script_hub', 'forward')
    resetSessionWithLives()
    closeShortcutMenu()
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
          path_id: null,
          path_name: null,
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

  // Handles completion of the onboarding form: seeds deck expertise, persists answers, sets path.
  const handleOnboardingComplete = useCallback(async (
    pathId: string | null,
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

    if (pathId) {
      const result = await window.jplearnDesktop?.setLearningPath?.(pathId).catch(() => undefined)
      if (result) setLearningPathStatus(result as LearningPathStatus)
    } else {
      const result = await window.jplearnDesktop?.completeOnboarding?.(answers).catch(() => undefined)
      if (result) setLearningPathStatus(result as LearningPathStatus)
    }
  }, [getDeckCardsDeduped, refreshDeckProgressAfterSeedChange])


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
        onComplete={(pathId, checkedItems, answers) => {
          void handleOnboardingComplete(pathId, checkedItems, answers)
        }}
        onSkip={(checkedItems, answers) => {
          void handleOnboardingComplete(null, checkedItems, answers)
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
      {view === 'home' ? (
        <HomeView
          navDirection={navDirection}
          studyPlan={studyPlan}
          learningPathStatus={learningPathStatus}
          recommendations={recommendations.map((r) => ({
            nodeId: r.node_id,
            displayLabel: r.display_label,
            reviewCount: r.review_count,
            difficulty: r.difficulty,
            reason: r.reason,
          }))}
          onStartRecommendation={(nodeId) => {
            const scriptMap: Record<string, string> = {
              hiragana: 'hiragana', katakana: 'katakana',
              vocabulary_n5: 'vocab_n5', grammar_n5: 'grammar_patterns', kanji_n5: 'kanji_n5',
            }
            const script = scriptMap[nodeId] as ScriptKey | undefined
            if (script) jumpToScriptHub(script)
          }}
          onContinuePath={(sectionId) => {
            const script = sectionId as ScriptKey
            setActiveScript(script)
            navigate('script_hub', 'forward')
          }}
          onChangePath={() => {
            // Re-open onboarding by resetting onboarding_complete in local state
            setLearningPathStatus((prev) => prev ? { ...prev, onboarding_complete: false } : prev)
          }}
          onSelectScript={(script) => {
            // Check readiness before navigating — show modal for challenging/advanced
            const readiness = learningPathStatus?.steps.find((s) => s.section_id === script)?.readiness
            const needsWarning = (readiness === 'challenging' || readiness === 'advanced') && !warnedSectionsRef.current.has(script)
            if (needsWarning) {
              const LABELS: Record<ScriptKey, string> = {
                hiragana: 'Hiragana', katakana: 'Katakana', kanji_n5: 'Kanji (N5)',
                vocab_n5: 'N5 Vocabulary', grammar_patterns: 'N5 Grammar', sentence_examples: 'Sentences',
              }
              setWarningModal({
                sectionId: script,
                label: LABELS[script] ?? script,
                readiness: readiness as SectionReadiness,
                reason: readiness === 'advanced'
                  ? 'This section builds on content you haven\'t started yet.'
                  : 'Prerequisites are still in progress.',
              })
            } else {
              setActiveScript(script)
              navigate('script_hub', 'forward')
            }
          }}
          onOpenJlptPrep={() => {
            const sectionId = 'jlpt_prep'
            const shouldWarn = !warnedSectionsRef.current.has(sectionId)
            if (shouldWarn) {
              setWarningModal({
                sectionId,
                label: 'JLPT Preparation',
                readiness: 'advanced',
                reason: 'JLPT prep combines multiple skills and is most effective once your foundations are in place.',
              })
              return
            }

            setDictionaryOpen(false)
            setShowOverview(false)
            setShowSettings(false)
            tutor.closeTutorPanel()
            navigate('jlpt_prep', 'forward')
          }}
          onOpenPassages={() => {
            setDictionaryOpen(false)
            setShowOverview(false)
            setShowSettings(false)
            navigate('passage_hub', 'forward')
          }}
          onOpenDailyGames={openDailyGames}
          onJumpToSetup={jumpToScriptHubSetup}
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
          navDirection={navDirection}
          activeScript={activeScript}
          activeGame={activeGame}
          activeBlockIndex={activeBlockIndex}
          gameLoading={gameLoading}
          gameError={gameError}
          blockProgressWithMastery={blockProgressWithMastery}
          activeBlockCards={activeBlockCards}
          kanjiLevelProgress={kanjiLevelProgress}
          vocabLevelProgress={vocabLevelProgress}
          activeKanjiLevel={activeKanjiLevel}
          activeVocabLevel={activeVocabLevel}
          kanjiCategoryProgress={kanjiCategoryProgress}
          vocabCategoryProgress={vocabCategoryProgress}
          activeKanjiCategory={activeKanjiCategory}
          activeVocabCategory={activeVocabCategory}
          learningPathExpanded={learningPathExpanded}
          learningPathTrackRows={learningPathTrackRows}
          minigameStats={minigameStats}
          availableMinigames={availableMinigames}
          activeSectionName={activeSectionName}
          minigameLockReasons={minigameLockReasons}
          onBack={goHome}
          onSelectBlock={(index) => {
            setActiveBlockIndex(index)
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
          onSelectKanjiCategory={(cat) => {
            setActiveKanjiCategory(cat)
            // Keep the hub's level tab on the level that owns this category,
            // so the highlight follows selections made from anywhere else.
            setActiveKanjiLevel(categoryLevelOf(cat))
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

            <div className="hub-topbar-center">
              <span className="hub-topbar-catalog">JPL-DLY-A</span>
              <strong className="hub-topbar-title">
                <span className="hub-glitch-text">{DAILY_GAMES_COPY.title}</span>
              </strong>
              <span className="hub-topbar-catalog hub-topbar-catalog--sub">DAILY GAMES · 毎日</span>
              <span className="hub-topbar-stripe" aria-hidden="true" />
            </div>

            <span aria-hidden="true" />
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
    <main className="app-shell">
      <AppTitlebar
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



