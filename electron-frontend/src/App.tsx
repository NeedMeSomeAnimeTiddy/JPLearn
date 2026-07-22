import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type {
  AppSettings,
  AppView,
  BlockInfo,
  BlockProgressPayload,
  CardScores,
  DeckSlugInput,
  ExplicitReviewItem,
  FeedbackTone,
  InterleaveWeights,
  JlptLevel,
  KanjiCategory,
  LastSessionPrefs,
  LearningPathStatus,
  MinigameKey,
  MinigameStatsByScript,
  NavDirection,
  OverviewCategoryBlocks,
  OverviewKanjiCard,
  OverviewSectionKey,
  PersistedSession,
  PersistedSessionRestore,
  PlayableMinigame,
  RecommendationItem,
  RoundState,
  ScriptDeck,
  ScriptKey,
  SectionReadiness,
  SessionGoalStartResponse,
  SessionRunReport,
  SessionSummaryPayload,
  SettingsTabKey,
  ShortcutSubmenuKey,
  StatsByScript,
  StudyPlanCoverageRow,
  StudyQueueResponse,
  StudySummaryPayload,
  VocabCategory,
  XPProgress,
} from './types'
import type { DailyGamesMissedWordPayload, GameCard } from './generated/types'
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
import { dedupeDictionaryCards } from './features/card-notes/utils'
import { KanjiDetailPanel } from './features/kanji-detail'
import { BADGE_METADATA } from './features/achievements'
import { OnboardingWizard } from './features/onboarding'
import { ReadinessWarningModal } from './components/ReadinessWarningModal'
import { useKeyboardCheatsheet, KeyboardCheatsheet } from './features/keyboard'
import { useCommandPalette, CommandPalette } from './features/command-palette'
import type { Command } from './features/command-palette'
import { SessionProvider } from './context/SessionContext'
import { assessTypedAnswer } from './lib/answerAssessment'
import type { TypedAnswerState } from './lib/answerAssessment'
import { assessTypedRecallAnswer } from './lib/typedRecallAssessment'
import { isGrammarCurriculumMode } from './utils'
import { KANJI_MEANINGS } from './lib/kanjiMeanings'
import { ArrowLeft, Trophy } from 'lucide-react'
import {
  PERFORMANCE_GOOD_MS,
  calculateAwardedPoints,
  classifyRoundPerformance,
  buildRoundCoachToast,
} from './lib/roundScoring'
import {
  STATS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  CARD_SCORES_STORAGE_KEY,
  SUMMARY_SNAPSHOT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  PREFS_STORAGE_KEY,
  EXPERTISE_LEVEL_TO_SCRIPT_KEYS,
  deriveExpertiseLevelFromChecked,
  EMPTY_SCRIPT_STATS,
  defaultMinigameStatsByScript,
  loadSavedStats,
  loadSettings,
  loadCardScores,
  loadSummarySnapshot,
  saveSummarySnapshot,
} from './lib/appStorage'
import {
  normalizeDeckCards,
  limitRuntimeDeckCards,
  normalizeBlockList,
  normalizeText,
  shuffleArray,
  buildInterleaveSequence,
} from './lib/deckUtils'
import {
  isParticleClozeMode,
  PARTICLE_EXPLANATIONS,
  isImposterMode,
  normalizeCurriculumStage,
  narrativePriorityCards,
} from './lib/roundContent'
import {
  buildJlptLevelProgress,
  buildJlptLevelProgressFromLevelDecks,
  buildCategoryProgress,
} from './lib/progressAggregation'
import {
  buildStudyPlan,
} from './lib/studyPlan'
import { CARD_MASTERY_MAX } from './constants'
import {
  buildRound as buildRoundImpl,
  buildRoundWithBridge as buildRoundWithBridgeImpl,
} from './features/study-session'
import './App.css'
import { useTheme, type ThemeSettingsFields } from './features/theme'
import { useVoice, splitSpeechSegments, type VoiceSettingsFields } from './features/voice'
import { useModels } from './features/models'
import { useTutor, TutorPanel, TutorToast, type TutorSettingsFields } from './features/tutor'
import { useScenarioTutor } from './features/scenario-tutor'
import { useCursor, CursorFollower, type CursorSettings } from './features/cursor'
import { useWindowDrag } from './features/window-drag'
import { usePomodoro, BreakOverlay, type PomodoroSettingsFields } from './features/pomodoro'
import { DevDashboard } from './features/devtools'
import type { HandwritingOutcome } from './features/handwriting'
import { formatHandwritingAttemptValue, isHandwritingEligibleCharacter, isHandwritingOutcomeCorrect } from './features/handwriting'
import {
  MINIGAMES,
  SCRIPT_MINIGAMES,
  SCRIPT_INTERLEAVE_MODES,
  SCRIPT_LABELS,
  DEFAULT_LIVES,
  SESSION_LENGTH_PRESETS,
  DEFAULT_SESSION_LENGTH_PRESET,
  VOCAB_CATEGORY_ORDER,
  VOCAB_CATEGORY_LABELS,
  VOCAB_CATEGORY_TO_DECK_SLUG,
  KANJI_CATEGORY_ORDER,
  KANJI_CATEGORY_LABELS,
  KANJI_CATEGORY_TO_DECK_SLUG,
  formatRoundModeLabel,
  DEFAULT_INTERLEAVE_WEIGHTS,
  PETAL_STREAM,
  FONT_SIZE_ORDER,
  FONT_SIZE_LABEL,
  APP_FONT_OPTIONS,
  isAppFontPreset,
} from './constants'

const ROUND_QUEUE_TIMEOUT_MS = 1200
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

  // Functions used in state initializers below
  function loadSessionPrefs(): LastSessionPrefs | null {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as LastSessionPrefs
    } catch {
      return null
    }
  }

  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(() => loadSummarySnapshot())
  const [error, setError] = useState<string | null>(null)
  const viewHistoryRef = useRef<AppView[]>(['home'])
  const viewHistoryIndexRef = useRef(0)
  const isHistoryNavigationRef = useRef(false)
  const [loading, setLoading] = useState<boolean>(() => loadSummarySnapshot() === null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [activeScript, setActiveScript] = useState<ScriptKey>(() => loadSessionPrefs()?.script ?? 'hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>(() => loadSessionPrefs()?.game ?? 'romaji_sprint')
  const [deckCards, setDeckCards] = useState<ScriptDeck['cards']>([])
  const [blockProgress, setBlockProgress] = useState<BlockInfo[]>([])
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0)
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)

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

  useEffect(() => {
    saveSessionPrefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScript, activeGame, livesEnabled, leechFocusEnabled, confidenceCaptureEnabled, sessionTargetItems])

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
    setNavDirection('forward')
    setView('daily_games')
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
  }

  useEffect(() => {
    const scripts: ScriptKey[] = ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns', 'sentence_examples']
    const commands: Command[] = [
      { id: 'nav-home', label: 'Go to Home', category: 'navigation', action: () => { setNavDirection('back'); setView('home') } },
      { id: 'nav-script-hub', label: 'Go to Script Hub', category: 'navigation', action: () => { setNavDirection('forward'); setView('script_hub') } },
      { id: 'nav-jlpt', label: 'Go to JLPT Prep', category: 'navigation', action: () => { setNavDirection('forward'); setView('jlpt_prep') } },
      { id: 'nav-daily-games', label: DAILY_GAMES_COPY.title, category: 'navigation', keywords: ['daily', 'games', 'practice'], action: openDailyGames },
      { id: 'nav-overview', label: 'Open Study Overview', category: 'navigation', action: () => { closeKanjiDetail(); setShowOverview(true); void loadSummary() } },
      { id: 'script-hiragana', label: 'Hiragana', category: 'navigation', keywords: ['hiragana', 'script'], action: () => { setNavDirection('forward'); setActiveScript('hiragana'); setView('script_hub') } },
      { id: 'script-katakana', label: 'Katakana', category: 'navigation', keywords: ['katakana', 'script'], action: () => { setNavDirection('forward'); setActiveScript('katakana'); setView('script_hub') } },
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
            setNavDirection('forward')
            setShowOverview(false)
            setShowSettings(false)
            setLastSessionSummary(null)
            setSessionRunReport(null)
            resetSessionWithLives()
            if (script === activeScript) {
              setView('minigame')
              void startSession(game)
            } else {
              setActiveScript(script)
              setResumeRequest({ script, minigame: game })
              setView('minigame')
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
        setNavDirection('forward')
        setView('script_hub')
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
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const shortcutsSectionRef = useRef<HTMLDivElement | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)
  const roundPresentedAtRef = useRef<number>(0)
  const scriptLoadRequestIdRef = useRef<number>(0)
  const lastLoadedScriptRef = useRef<ScriptKey>('hiragana')
  const startupBootMarkRef = useRef<number>(performance.now())
  const startupFirstSummaryMsRef = useRef<number | null>(null)
  const startupReadySentRef = useRef(false)
  const xpDetailsRef = useRef<HTMLDivElement | null>(null)
  const streakDetailsRef = useRef<HTMLDivElement | null>(null)
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
  const roundCycleRef = useRef<number[]>([])
  const roundCursorRef = useRef<number>(0)
  const queueBucketCountsRef = useRef<{ due: number; leech: number; new: number; review: number } | null>(null)
  const [queueRevision, setQueueRevision] = useState(0)
  const interleaveCursorRef = useRef<number>(0)
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

  const availableInterleaveModes = useMemo(() => SCRIPT_INTERLEAVE_MODES[activeScript], [activeScript])
  const interleaveSequence = useMemo(
    () => buildInterleaveSequence(interleaveWeights, availableInterleaveModes),
    [interleaveWeights, availableInterleaveModes],
  )

  useEffect(() => {
    if (availableMinigames.includes(activeGame)) return
    setActiveGame(availableMinigames[0])
  }, [activeGame, availableMinigames])

  const resolveScriptMinigame = useCallback((script: ScriptKey, minigame: MinigameKey): MinigameKey => {
    const allowedMinigames = SCRIPT_MINIGAMES[script]
    return allowedMinigames.includes(minigame) ? minigame : allowedMinigames[0]
  }, [])

  const resetRoundCycle = useCallback(() => {
    roundCycleRef.current = []
    roundCursorRef.current = 0
    interleaveCursorRef.current = 0
  }, [])

  /** Tears down active minigame session state — core pattern. */
  function resetSessionCore(): void {
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
  }

  /** Core + lives reset. Used when starting a new run. */
  function resetSessionWithLives(): void {
    resetSessionCore()
    setLivesRemaining(DEFAULT_LIVES)
  }

  /** Full session wipe including score/counters/input. Used when loading new deck cards. */
  function resetSessionFull(): void {
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
  }

  /** End-of-session reset: core without cycle reset + per-round state + optional error message. */
  function resetSessionEnd(options?: { errorMessage?: string }): void {
    setSessionActive(false)
    pomodoro.onSessionEnd()
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
  }

  function saveSessionPrefs(): void {
    try {
      const prefs: LastSessionPrefs = {
        script: activeScript,
        game: activeGame,
        livesEnabled,
        leechFocusEnabled,
        confidenceCaptureEnabled,
        sessionTargetItems,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
    } catch { /* ignore */ }
  }

  // Chatbot tier cards show combined footprint (chatbot + its hidden, auto-installed
  // embedder) so the displayed size matches what setup actually downloads.





  const models = useModels()

  const voice = useVoice(
    settings as VoiceSettingsFields,
    setSettings as unknown as Dispatch<SetStateAction<VoiceSettingsFields>>,
    {
      tutorInstallInfo: models.tutorInstallInfo,
      refreshTutorInstallInfo: models.refreshTutorInstallInfo,
    },
  )

  const isInMinigameSession = view === 'minigame' && sessionActive && roundState !== null

  const cursor = useCursor(
    settings as unknown as { cursor: CursorSettings },
    setSettings as unknown as Dispatch<SetStateAction<{ cursor: CursorSettings }>>,
  )
  const windowDrag = useWindowDrag()

  const pomodoro = usePomodoro(
    settings as PomodoroSettingsFields,
    setSettings as unknown as Dispatch<SetStateAction<PomodoroSettingsFields>>,
  )

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
        setNavDirection('forward')
        setView('minigame')
        resetSessionWithLives()
        if (differentScript) {
          setActiveScript(script)
          setResumeRequest({ script, minigame })
          return
        }
        void startSession(minigame)
      },
    },
  )

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


  const activeDeckSlug = useMemo(() => {
    if (activeScript === 'kanji_n5') return KANJI_CATEGORY_TO_DECK_SLUG[activeKanjiCategory]
    if (activeScript === 'vocab_n5') return VOCAB_CATEGORY_TO_DECK_SLUG[activeVocabCategory]
    return activeScript
  }, [activeKanjiCategory, activeScript, activeVocabCategory])

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
      const queuePromise = getStudyQueueDeduped(activeDeckSlug)
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
  }, [activeDeckSlug, buildQueueCycle, getStudyQueueDeduped, resetRoundCycle])

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

  useEffect(() => {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(scriptStats))
  }, [scriptStats])

  useEffect(() => {
    window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(cardScores))
  }, [cardScores])

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
  ])

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
  }, [activeKanjiCategory, activeVocabCategory, getBlockProgressDeduped, getDeckCardsDeduped, resetRoundCycle])

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

  const nextRoundMode = useCallback((selectedMode: MinigameKey): { mode: PlayableMinigame; surprisePrompt: boolean; promptSeed: number } => {
    if (selectedMode !== 'interleave_mix') {
      return { mode: selectedMode, surprisePrompt: false, promptSeed: 0 }
    }

    const cursor = interleaveCursorRef.current
    interleaveCursorRef.current += 1
    return {
      mode: interleaveSequence[cursor % interleaveSequence.length],
      surprisePrompt: interleaveSurpriseEnabled && cursor % Math.max(interleaveSurpriseEvery, 1) === 0,
      promptSeed: cursor,
    }
  }, [interleaveSequence, interleaveSurpriseEnabled, interleaveSurpriseEvery])

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
      pomodoro.onSessionStart()
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
      setNavDirection('forward')
      setView('minigame')
    } finally {
      setSessionStartPending(false)
    }
  }

  function returnToDailyGamesHub(): void {
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
    setNavDirection('back')
    setView('daily_games')
  }

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
      pomodoro.onSessionStart()
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
  }, [
    activeBlockCards,
    activeGame,
    buildRoundWithBridge,
    hydrateRoundCycle,
    leechFocusEnabled,
    nextCardIndex,
    nextRoundMode,
    resetRoundCycle,
    sessionTargetItems,
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
    setNavDirection('forward')
    setView('minigame')
    resetSessionWithLives()

    if (script !== activeScript) {
      setActiveScript(script)
      setResumeRequest({ script, minigame })
      return
    }

    void startSession(minigame)
  }, [activeScript, resetRoundCycle, resolveScriptMinigame, sessionRunReport, startSession])

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

      setNavDirection('forward')
      setView('minigame')

      if (targetItems > 0) {
        setTimeout(() => {
          startSession(data.activeGame, remainingCards, targetItems, data.restore)
        }, 100)
      }
    } catch {
      setNavDirection('forward')
      setView('minigame')
      startSession(data.activeGame)
    }
  }, [resumeData, startSession, clearPersistedSession])

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
  }, [activeBlockCards, activeGame, buildRoundWithBridge, hydrateRoundCycle, leechFocusEnabled, nextCardIndex, nextRoundMode])

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

      const resultSlug: DeckSlugInput = roundState.deckSlug
        ?? (activeScript === 'kanji_n5'
          ? KANJI_CATEGORY_TO_DECK_SLUG[activeKanjiCategory]
          : activeScript === 'vocab_n5'
            ? VOCAB_CATEGORY_TO_DECK_SLUG[activeVocabCategory]
            : activeScript)
      studyQueueCacheRef.current.delete(resultSlug)

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
      tutor.queueAssistantToast(buildRoundCoachToast(nextToastId, {
        isCorrect,
        mode: roundState.mode,
        nextStreak,
        answer: roundState.answer,
        completedRoundsAfterAnswer,
        targetRounds,
        typedAssessment,
      }))

    },
    // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
    [activeGame, activeKanjiCategory, activeScript, activeSessionId, activeVocabCategory, confidenceCaptureEnabled, isRoundResolving, leechFocusEnabled, livesEnabled, livesRemaining, nextRound, roundConfidenceScore, roundState, scriptStats, sessionBestStreak, sessionConfidenceCount, sessionConfidenceTotal, sessionPoints, sessionRounds, sessionScore, sessionTargetItems],
  )

  const submitHandwritingOutcome = useCallback((outcome: HandwritingOutcome) => {
    if (!roundState || roundState.mode !== 'handwriting') return
    submitAnswer(roundState.answer, isHandwritingOutcomeCorrect(outcome), outcome)
  }, [roundState, submitAnswer])

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

        if (view === 'minigame') {
          if (explicitReviewItemsRef.current) {
            returnToDailyGamesHub()
            return
          }
          setNavDirection('back')
          setView('script_hub')
          return
        }

        if (view === 'script_hub') {
          setNavDirection('back')
          setView('home')
          return
        }

        if (view === 'jlpt_prep') {
          setNavDirection('back')
          setView('home')
          return
        }

        if (view === 'passage_hub') {
          setNavDirection('back')
          setView('home')
          return
        }

        if (view === 'daily_games') {
          setNavDirection('back')
          setView('home')
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
          setNavDirection('forward')
          setActiveScript('hiragana')
          setView('script_hub')
        }
        if (event.key === '2') {
          setNavDirection('forward')
          setActiveScript('katakana')
          setView('script_hub')
        }
        if (event.key === '3') {
          setNavDirection('forward')
          setActiveScript('kanji_n5')
          setView('script_hub')
        }
        if (event.key === '4') {
          setNavDirection('forward')
          setActiveScript('vocab_n5')
          setView('script_hub')
        }
        if (event.key === '5') {
          setNavDirection('forward')
          setActiveScript('grammar_patterns')
          setView('script_hub')
        }
        if (event.key === '7') {
          setNavDirection('forward')
          setActiveScript('sentence_examples')
          setView('script_hub')
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

  useEffect(() => {
    if (isHistoryNavigationRef.current) {
      isHistoryNavigationRef.current = false
      return
    }

    const currentHistory = viewHistoryRef.current
    const currentIndex = viewHistoryIndexRef.current
    if (currentHistory[currentIndex] === view) return

    const nextHistory = currentHistory.slice(0, currentIndex + 1)
    nextHistory.push(view)
    viewHistoryRef.current = nextHistory
    viewHistoryIndexRef.current = nextHistory.length - 1
  }, [view])

  const goHome = useCallback(() => {
    closeKanjiDetail()
    setNavDirection('back')
    setView('home')
    resetSessionCore()
    setShowSettings(false)
    tutor.closeTutorPanel()
  // oxlint-disable react-hooks/exhaustive-deps — tutor from useTutor hook is not a stable ref
  }, [closeKanjiDetail, resetRoundCycle])

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
    setNavDirection('forward')
    setActiveScript(script)
    setView('script_hub')
    resetSessionCore()
    closeShortcutMenu()
  }, [closeKanjiDetail, closeShortcutMenu, resetRoundCycle])

  const jumpToScriptHubMinigame = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    closeKanjiDetail()
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setNavDirection('forward')
    setShowOverview(false)
    setShowSettings(false)
    setLastSessionSummary(null)
    setSessionRunReport(null)
    setActiveGame(resolvedMinigame)
    setView('minigame')
    resetSessionWithLives()

    if (script !== activeScript) {
      setActiveScript(script)
      setResumeRequest({ script, minigame: resolvedMinigame })
      closeShortcutMenu()
      return
    }

    void startSession(resolvedMinigame)
    closeShortcutMenu()
  }, [activeScript, closeKanjiDetail, closeShortcutMenu, resetRoundCycle, resolveScriptMinigame, startSession])

  const jumpToScriptHubSetup = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    closeKanjiDetail()
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setNavDirection('forward')
    setActiveScript(script)
    setActiveGame(resolvedMinigame)
    setView('script_hub')
    resetSessionWithLives()
    closeShortcutMenu()
  }, [closeKanjiDetail, closeShortcutMenu, resetRoundCycle, resolveScriptMinigame])

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
      const emptyScores: CardScores = { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {}, sentence_examples: {} }
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
      resetSessionFull()
      setSessionStartPending(false)
      setSessionSummaryLoading(false)
      setLastSessionSummary(null)
      setSessionRunReport(null)
      setActiveSessionId(null)
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
      setNavDirection('back')
      setView('home')
      setResetConfirmStep(0)
      refreshDeckProgressAfterSeedChange()
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown reset error')
    } finally {
      setResettingDb(false)
    }
  }, [loadSummary, refreshDeckProgressAfterSeedChange, resetRoundCycle])

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


  const titlebarHistoryBack = useCallback(() => {
    const currentIndex = viewHistoryIndexRef.current
    if (currentIndex <= 0) return

    const nextIndex = currentIndex - 1
    viewHistoryIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    setNavDirection('back')
    setView(viewHistoryRef.current[nextIndex])
  }, [])

  const titlebarHistoryForward = useCallback(() => {
    const currentIndex = viewHistoryIndexRef.current
    const nextIndex = currentIndex + 1
    if (nextIndex >= viewHistoryRef.current.length) return

    viewHistoryIndexRef.current = nextIndex
    isHistoryNavigationRef.current = true
    setNavDirection('forward')
    setView(viewHistoryRef.current[nextIndex])
  }, [])

  // Titlebar callbacks: named here rather than inlined in the titlebar JSX so the
  // titlebar component receives bare handlers instead of raw state setters.
  const toggleShortcutMenu = useCallback(() => {
    setShortcutMenuOpen((open) => !open)
    setActiveShortcutFlyout(null)
  }, [])

  const jumpToJlptPrep = useCallback(() => {
    setView('jlpt_prep')
    setShortcutMenuOpen(false)
  }, [])

  const jumpToPassageHub = useCallback(() => {
    setView('passage_hub')
    setShortcutMenuOpen(false)
  }, [])

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

  const canTitlebarBack = viewHistoryIndexRef.current > 0
  const canTitlebarForward = viewHistoryIndexRef.current < viewHistoryRef.current.length - 1
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
        canTitlebarBack={canTitlebarBack}
        canTitlebarForward={canTitlebarForward}
        titlebarHistoryBack={titlebarHistoryBack}
        titlebarHistoryForward={titlebarHistoryForward}
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
      <SessionProvider value={{
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
        blockSessionComplete,
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
        voiceBusy: voice.voiceBusy,
        voiceUnavailable: voice.voiceUnavailable,
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
        playAudio: (text) => { void voice.playQuestionAudio(text) },
      }}>
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
            setNavDirection('forward')
            setActiveScript(script)
            setView('script_hub')
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
              setNavDirection('forward')
              setActiveScript(script)
              setView('script_hub')
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
            setNavDirection('forward')
            setView('jlpt_prep')
          }}
          onOpenPassages={() => {
            setDictionaryOpen(false)
            setShowOverview(false)
            setShowSettings(false)
            setNavDirection('forward')
            setView('passage_hub')
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
            setNavDirection('forward')

            if (sectionId === 'jlpt_prep') {
              setView('jlpt_prep')
              return
            }

            setActiveScript(sectionId)
            setView('script_hub')
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
            resetSessionWithLives()
          }}
          onSelectVocabCategory={(cat) => {
            setActiveVocabCategory(cat)
            resetSessionWithLives()
          }}
          onToggleLearningPath={() => setLearningPathExpanded((expanded) => !expanded)}
          onSelectGame={(game) => {
            setActiveGame(game)
            resetSessionWithLives()
          }}
          onPlayGame={(game) => {
            setActiveGame(game)
            setNavDirection('forward')
            setView('minigame')
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
            setNavDirection('back')
            setView('script_hub')
          }}
          onOpenDictionary={(seedQuery) => openDictionary(seedQuery ?? '')}
          onOpenSettings={openSettingsFromMenu}
          onRetry={handleRetry}
          onHandwritingOutcome={submitHandwritingOutcome}
        />
      ) : null}

      {view === 'jlpt_prep' ? (
        <JLPTPrepView
          onBack={() => {
            setNavDirection('back')
            setView('home')
          }}
        />
      ) : null}

      {view === 'passage_hub' ? (
        <PassageHubView
          onBack={() => {
            setNavDirection('back')
            setView('home')
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
              onClick={() => { setNavDirection('back'); setView('home'); }}
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

      {showResumeToast && resumeData ? (
        <ResumeToast
          deck={resumeData.activeScript}
          mode={MINIGAMES.find((m) => m.key === resumeData.activeGame)?.title ?? resumeData.activeGame}
          onResume={handleResume}
          onDismiss={handleDismissResume}
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



