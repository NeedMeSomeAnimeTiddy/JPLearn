import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, BarChart3, Copy, Heart, Keyboard, Languages, ListChecks, Minus, Settings, Square, X } from 'lucide-react'
import './App.css'

type StudySummaryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getStudySummary>
>
type ScriptDeck = Awaited<ReturnType<typeof window.jplearnDesktop.getDeckCards>>
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match'
type AppView = 'home' | 'script_hub' | 'minigame' | 'overview'
type NavDirection = 'forward' | 'back'
type FontSize = 'small' | 'medium' | 'large'
type FeedbackTone = 'success' | 'error' | null
type ThemeKey =
  | 'harbor_mist'
  | 'sakura_dawn'
  | 'forest_ink'
  | 'sunset_lacquer'
  | 'midnight_neon'
  | 'paper_crane'
  | 'matcha_stone'
  | 'ocean_glass'
  | 'ember_night'
  | 'plum_garden'

const FEEDBACK_REVEAL_MS = 2100
const DEFAULT_LIVES = 3

interface AppSettings {
  reducedMotion: boolean
  fontSize: FontSize
  theme: ThemeKey
}

interface RoundOption {
  id: string
  label: string
}

interface RoundState {
  promptLabel: string
  focusText: string
  answer: string
  options: RoundOption[]
}

interface ScriptStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
}

interface MinigameStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
  points: number
}

interface MinigameIntro {
  vibe: string
  objective: string
  tip: string
}

type StatsByScript = Record<ScriptKey, ScriptStats>
type MinigameStatsByScript = Record<ScriptKey, Record<MinigameKey, MinigameStats>>

const SCRIPT_LABELS: Record<ScriptKey, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
}

const SCRIPT_MENU_LINES: Record<ScriptKey, string> = {
  hiragana: 'Start with smooth, foundational sounds.',
  katakana: 'Train sharp symbols for names and loanwords.',
  kanji_n5: 'Build meaning recall one character at a time.',
}

const MINIGAMES: Array<{ key: MinigameKey; title: string; description: string }> = [
  {
    key: 'romaji_sprint',
    title: 'Romaji Sprint',
    description: 'Type the romaji reading as quickly as you can.',
  },
  {
    key: 'meaning_match',
    title: 'Meaning Match',
    description: 'Pick the correct meaning from four choices.',
  },
  {
    key: 'character_match',
    title: 'Character Match',
    description: 'Pick the correct character for the meaning.',
  },
]

const MINIGAME_INTROS: Record<MinigameKey, MinigameIntro> = {
  romaji_sprint: {
    vibe: 'Speed Trial',
    objective: 'Read each character and type the romaji before your momentum drops.',
    tip: 'Stay rhythmic. Short, accurate answers build streak bonuses quickly.',
  },
  meaning_match: {
    vibe: 'Memory Duel',
    objective: 'Find the correct meaning while avoiding distractor options.',
    tip: 'Scan all four choices first, then commit to the closest exact meaning.',
  },
  character_match: {
    vibe: 'Symbol Hunt',
    objective: 'Choose the correct Japanese character for each meaning prompt.',
    tip: 'Compare visual shape first, then verify your recall before selecting.',
  },
}

const SECTION_META: Record<ScriptKey, { glyph: string }> = {
  hiragana: { glyph: 'あ' },
  katakana: { glyph: 'ア' },
  kanji_n5: { glyph: '漢' },
}

const MINIGAME_ICONS: Record<MinigameKey, LucideIcon> = {
  romaji_sprint: Keyboard,
  meaning_match: ListChecks,
  character_match: Languages,
}

const PETAL_STREAM = [
  { x: '6%', drift: '9vw', duration: '11.8s', delay: '-2.1s', size: '14px', opacity: 0.72 },
  { x: '12%', drift: '-8vw', duration: '13.2s', delay: '-5.4s', size: '12px', opacity: 0.66 },
  { x: '18%', drift: '11vw', duration: '14.6s', delay: '-3.6s', size: '16px', opacity: 0.7 },
  { x: '25%', drift: '-9vw', duration: '12.7s', delay: '-8.1s', size: '13px', opacity: 0.64 },
  { x: '32%', drift: '8vw', duration: '15.3s', delay: '-1.8s', size: '15px', opacity: 0.75 },
  { x: '39%', drift: '-7vw', duration: '13.9s', delay: '-6.7s', size: '11px', opacity: 0.62 },
  { x: '47%', drift: '10vw', duration: '16.1s', delay: '-10.4s', size: '14px', opacity: 0.68 },
  { x: '54%', drift: '-11vw', duration: '12.3s', delay: '-7.2s', size: '12px', opacity: 0.65 },
  { x: '61%', drift: '9vw', duration: '14.8s', delay: '-4.8s', size: '16px', opacity: 0.73 },
  { x: '68%', drift: '-8vw', duration: '13.5s', delay: '-9.9s', size: '13px', opacity: 0.64 },
  { x: '74%', drift: '11vw', duration: '15.7s', delay: '-11.1s', size: '15px', opacity: 0.71 },
  { x: '80%', drift: '-9vw', duration: '12.9s', delay: '-6.1s', size: '12px', opacity: 0.66 },
  { x: '87%', drift: '8vw', duration: '14.2s', delay: '-8.6s', size: '14px', opacity: 0.7 },
  { x: '93%', drift: '-7vw', duration: '16.4s', delay: '-12.7s', size: '11px', opacity: 0.6 },
  { x: '9%', drift: '-10vw', duration: '15.6s', delay: '-9.5s', size: '10px', opacity: 0.58 },
  { x: '21%', drift: '7vw', duration: '12.1s', delay: '-1.2s', size: '13px', opacity: 0.63 },
  { x: '35%', drift: '-12vw', duration: '17.3s', delay: '-13.4s', size: '15px', opacity: 0.69 },
  { x: '50%', drift: '9vw', duration: '11.4s', delay: '-4.2s', size: '12px', opacity: 0.61 },
  { x: '65%', drift: '-6vw', duration: '13.8s', delay: '-7.8s', size: '14px', opacity: 0.67 },
  { x: '76%', drift: '10vw', duration: '16.6s', delay: '-14.9s', size: '13px', opacity: 0.65 },
  { x: '89%', drift: '-8vw', duration: '12.6s', delay: '-3.3s', size: '10px', opacity: 0.57 },
] as const

const THEME_OPTIONS: Array<{ key: ThemeKey; label: string }> = [
  { key: 'harbor_mist', label: 'Harbor Mist' },
  { key: 'sakura_dawn', label: 'Sakura Dawn' },
  { key: 'forest_ink', label: 'Forest Ink' },
  { key: 'sunset_lacquer', label: 'Sunset Lacquer' },
  { key: 'midnight_neon', label: 'Midnight Neon' },
  { key: 'paper_crane', label: 'Paper Crane' },
  { key: 'matcha_stone', label: 'Matcha Stone' },
  { key: 'ocean_glass', label: 'Ocean Glass' },
  { key: 'ember_night', label: 'Ember Night' },
  { key: 'plum_garden', label: 'Plum Garden' },
]

function MinigameIcon({ game }: { game: MinigameKey }) {
  const Icon = MINIGAME_ICONS[game]
  return <Icon aria-hidden="true" className="glyph-svg" strokeWidth={2.25} />
}

const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'
const SETTINGS_STORAGE_KEY = 'jplearn-desktop-settings-v1'

const EMPTY_SCRIPT_STATS: ScriptStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
}

const EMPTY_MINIGAME_STATS: MinigameStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
  points: 0,
}

function defaultStatsByScript(): StatsByScript {
  return {
    hiragana: { ...EMPTY_SCRIPT_STATS },
    katakana: { ...EMPTY_SCRIPT_STATS },
    kanji_n5: { ...EMPTY_SCRIPT_STATS },
  }
}

function defaultMinigameStatsByScript(): MinigameStatsByScript {
  return {
    hiragana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
    },
    katakana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
    },
    kanji_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
    },
  }
}

function loadSavedStats(): StatsByScript {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY)
    if (!raw) return defaultStatsByScript()

    const parsed = JSON.parse(raw) as Partial<StatsByScript>
    return {
      hiragana: { ...EMPTY_SCRIPT_STATS, ...(parsed.hiragana ?? {}) },
      katakana: { ...EMPTY_SCRIPT_STATS, ...(parsed.katakana ?? {}) },
      kanji_n5: { ...EMPTY_SCRIPT_STATS, ...(parsed.kanji_n5 ?? {}) },
    }
  } catch {
    return defaultStatsByScript()
  }
}

function defaultSettings(): AppSettings {
  return {
    reducedMotion:
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fontSize: 'medium',
    theme: 'harbor_mist',
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...defaultSettings(), ...parsed }
  } catch {
    return defaultSettings()
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function sanitizeRomajiInput(value: string): string {
  return value.replace(/[^a-zA-Z\s]/g, '')
}

function chooseUniqueIndices(length: number, count: number, exclude: number): number[] {
  const picks = new Set<number>()
  while (picks.size < Math.min(count, Math.max(0, length - 1))) {
    const candidate = Math.floor(Math.random() * length)
    if (candidate !== exclude) picks.add(candidate)
  }
  return [...picks]
}

function shuffleArray<T>(items: T[]): T[] {
  const clone = [...items]
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]]
  }
  return clone
}

function App() {
  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [activeScript, setActiveScript] = useState<ScriptKey>('hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>('romaji_sprint')
  const [deckCards, setDeckCards] = useState<ScriptDeck['cards']>([])
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)

  const [sessionActive, setSessionActive] = useState<boolean>(false)
  const [roundState, setRoundState] = useState<RoundState | null>(null)
  const [roundInput, setRoundInput] = useState<string>('')
  const [roundFeedback, setRoundFeedback] = useState<string | null>(null)
  const [roundFeedbackTone, setRoundFeedbackTone] = useState<FeedbackTone>(null)
  const [roundFeedbackPoints, setRoundFeedbackPoints] = useState<number | null>(null)
  const [roundFeedbackAnswer, setRoundFeedbackAnswer] = useState<string | null>(null)
  const [isRoundResolving, setIsRoundResolving] = useState<boolean>(false)
  const [sessionScore, setSessionScore] = useState<number>(0)
  const [sessionRounds, setSessionRounds] = useState<number>(0)
  const [sessionPoints, setSessionPoints] = useState<number>(0)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)

  const [scriptStats, setScriptStats] = useState<StatsByScript>(() => loadSavedStats())
  const [minigameStats, setMinigameStats] = useState<MinigameStatsByScript>(() => defaultMinigameStatsByScript())
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resettingDb, setResettingDb] = useState(false)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const roundCycleRef = useRef<number[]>([])
  const roundCursorRef = useRef<number>(0)

  const resetRoundCycle = useCallback(() => {
    roundCycleRef.current = []
    roundCursorRef.current = 0
  }, [])

  const nextCardIndex = useCallback((cardsLength: number): number | null => {
    if (cardsLength <= 0) return null

    if (roundCycleRef.current.length !== cardsLength || roundCursorRef.current >= roundCycleRef.current.length) {
      roundCycleRef.current = shuffleArray([...Array(cardsLength).keys()])
      roundCursorRef.current = 0
    }

    const index = roundCycleRef.current[roundCursorRef.current]
    roundCursorRef.current += 1
    return index
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(scriptStats))
  }, [scriptStats])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    document.documentElement.dataset.fontSize = settings.fontSize
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion)
    document.documentElement.dataset.theme = settings.theme
  }, [settings])

  useEffect(() => {
    let mounted = true
    void window.jplearnDesktop
      .isWindowMaximized()
      .then((state) => {
        if (mounted) setIsWindowMaximized(state.isMaximized)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (view !== 'minigame' || activeGame !== 'romaji_sprint' || !sessionActive || !roundState || isRoundResolving) {
      return
    }

    const focusHandle = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(focusHandle)
  }, [activeGame, isRoundResolving, roundState, sessionActive, view])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await window.jplearnDesktop.getStudySummary()
      setSummary(payload)
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

  const loadScriptCards = useCallback(async (script: ScriptKey) => {
    setGameLoading(true)
    setGameError(null)
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setRoundInput('')
    setSessionScore(0)
    setSessionRounds(0)
    setSessionPoints(0)
    setLivesRemaining(DEFAULT_LIVES)
    resetRoundCycle()

    try {
      const payload = await window.jplearnDesktop.getDeckCards(script)
      setDeckCards(payload.cards)
    } catch (err) {
      setDeckCards([])
      setGameError(err instanceof Error ? err.message : 'Unknown game bridge error')
    } finally {
      setGameLoading(false)
    }
  }, [resetRoundCycle])

  useEffect(() => {
    void loadScriptCards(activeScript)
  }, [activeScript, loadScriptCards])

  const buildRound = useCallback(
    (cards: ScriptDeck['cards'], minigame: MinigameKey, cardIndex: number): RoundState | null => {
      if (cards.length === 0) return null

      const card = cards[cardIndex]

      if (minigame === 'romaji_sprint') {
        return {
          promptLabel: 'Type the romaji for this character',
          focusText: card.character,
          answer: card.romaji,
          options: [],
        }
      }

      if (cards.length < 4) return null

      const distractorIndices = chooseUniqueIndices(cards.length, 3, cardIndex)

      if (minigame === 'meaning_match') {
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...distractorIndices.map((idx) => ({
            id: `${cards[idx].id}-meaning`,
            label: cards[idx].meaning,
          })),
        ])

        return {
          promptLabel: 'Select the meaning for this character',
          focusText: card.character,
          answer: card.meaning,
          options,
        }
      }

      const options = shuffleArray([
        { id: `${card.id}-correct`, label: card.character },
        ...distractorIndices.map((idx) => ({
          id: `${cards[idx].id}-character`,
          label: cards[idx].character,
        })),
      ])

      return {
        promptLabel: 'Select the character for this meaning',
        focusText: card.meaning,
        answer: card.character,
        options,
      }
    },
    [],
  )

  const startSession = useCallback(() => {
    resetRoundCycle()
    const index = nextCardIndex(deckCards.length)
    const nextRound = index === null ? null : buildRound(deckCards, activeGame, index)
    if (!nextRound) {
      setSessionActive(false)
      setRoundState(null)
      setGameError('Not enough cards in this deck for the selected minigame yet.')
      return
    }

    setSessionActive(true)
    setRoundState(nextRound)
    setRoundInput('')
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setGameError(null)
    setLivesRemaining(DEFAULT_LIVES)

    if (sessionRounds === 0) {
      setSessionScore(0)
      setSessionPoints(0)
    }
  }, [activeGame, buildRound, deckCards, nextCardIndex, resetRoundCycle, sessionRounds])

  const nextRound = useCallback(() => {
    const index = nextCardIndex(deckCards.length)
    const candidate = index === null ? null : buildRound(deckCards, activeGame, index)
    if (!candidate) {
      setRoundState(null)
      setSessionActive(false)
      return
    }

    setRoundState(candidate)
    setRoundInput('')
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
  }, [activeGame, buildRound, deckCards, nextCardIndex])

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!roundState || isRoundResolving) return

      setIsRoundResolving(true)

      const isCorrect = normalizeText(answer) === normalizeText(roundState.answer)
      const previousScript = scriptStats[activeScript]
      const nextStreak = isCorrect ? previousScript.currentStreak + 1 : 0
      const awardedPoints = isCorrect ? 1 + Math.floor(nextStreak / 3) : 0
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
      if (isCorrect) {
        setSessionScore((value) => value + 1)
        setSessionPoints((value) => value + awardedPoints)
        setRoundFeedback(`Correct +${awardedPoints} ${awardedPoints === 1 ? 'point' : 'points'}`)
        setRoundFeedbackTone('success')
        setRoundFeedbackPoints(awardedPoints)
        setRoundFeedbackAnswer(null)
      } else {
        if (livesEnabled) {
          nextLives = Math.max(0, livesRemaining - 1)
          setLivesRemaining(nextLives)
        }
        setRoundFeedback('You got it wrong.')
        setRoundFeedbackTone('error')
        setRoundFeedbackPoints(0)
        setRoundFeedbackAnswer(roundState.answer)
      }

      window.setTimeout(() => {
        if (!isCorrect && livesEnabled && nextLives <= 0) {
          setSessionActive(false)
          setRoundState(null)
          setGameError('Out of lives. Press Play to start a new run.')
          setRoundFeedback(null)
          setRoundFeedbackTone(null)
          setRoundFeedbackPoints(null)
          setRoundFeedbackAnswer(null)
          setIsRoundResolving(false)
          return
        }

        nextRound()
        setRoundFeedback(null)
        setRoundFeedbackTone(null)
        setRoundFeedbackPoints(null)
        setRoundFeedbackAnswer(null)
        setIsRoundResolving(false)
      }, FEEDBACK_REVEAL_MS)
    },
    [activeGame, activeScript, isRoundResolving, livesEnabled, livesRemaining, nextRound, roundState, scriptStats],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        setShowSettings((v) => !v)
        return
      }

      if (event.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false)
          return
        }

        if (view === 'minigame') {
          setNavDirection('back')
          setView('script_hub')
          return
        }

        if (view === 'script_hub' || view === 'overview') {
          setNavDirection('back')
          setView('home')
          return
        }
      }

      if (showSettings || isInput) return

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
          setView('overview')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, view])

  const decks = useMemo(() => summary?.decks ?? [], [summary])

  const totals = useMemo(() => {
    const totalCards = decks.reduce((acc, deck) => acc + deck.total, 0)
    const masteredCards = decks.reduce((acc, deck) => acc + deck.mastered, 0)
    const dueToday = decks.reduce((acc, deck) => acc + deck.due_today, 0)
    const completedToday = decks.reduce((acc, deck) => acc + deck.completed_today, 0)
    const masteryRate = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0

    return {
      totalCards,
      masteredCards,
      dueToday,
      completedToday,
      masteryRate,
    }
  }, [decks])

  const summaryTiles = [
    { label: 'Decks', value: decks.length.toString(), tone: 'teal' },
    { label: 'Total Cards', value: totals.totalCards.toString(), tone: 'ocean' },
    { label: 'Mastered', value: `${totals.masteryRate}%`, tone: 'amber' },
    { label: 'Due Today', value: totals.dueToday.toString(), tone: 'rose' },
  ] as const

  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const selectedGameIntro = MINIGAME_INTROS[activeGame]
  const activeScriptStats = scriptStats[activeScript]

  const goHome = useCallback(() => {
    setNavDirection('back')
    setView('home')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    resetRoundCycle()
    setShowSettings(false)
  }, [resetRoundCycle])

  const resetStudyDb = useCallback(async () => {
    setResettingDb(true)
    setError(null)
    try {
      await window.jplearnDesktop.resetStudyDb()
      setShowResetConfirm(false)
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown reset error')
    } finally {
      setResettingDb(false)
    }
  }, [loadSummary])

  const minimizeWindow = useCallback(() => {
    void window.jplearnDesktop.minimizeWindow()
  }, [])

  const toggleMaximizeWindow = useCallback(() => {
    void window.jplearnDesktop.toggleMaximizeWindow().then((result) => {
      setIsWindowMaximized(result.isMaximized)
    })
  }, [])

  const closeWindow = useCallback(() => {
    void window.jplearnDesktop.closeWindow()
  }, [])

  return (
    <main className="app-shell">
      <header className="window-titlebar" aria-label="Window controls">
        <div className="window-titlebar-drag" aria-hidden="true">
          <span className="window-titlebar-title">JPLearn</span>
        </div>
        <div className="window-controls" role="group" aria-label="Window actions">
          <button type="button" className="window-control-button" onClick={minimizeWindow} aria-label="Minimize window">
            <Minus className="window-control-icon" strokeWidth={2.2} />
          </button>
          <button type="button" className="window-control-button" onClick={toggleMaximizeWindow} aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'}>
            {isWindowMaximized ? (
              <Copy className="window-control-icon" strokeWidth={1.9} />
            ) : (
              <Square className="window-control-icon" strokeWidth={2} />
            )}
          </button>
          <button type="button" className="window-control-button window-control-close" onClick={closeWindow} aria-label="Close window">
            <X className="window-control-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>
      <div className="atmosphere atmosphere-left" aria-hidden="true" />
      <div className="atmosphere atmosphere-right" aria-hidden="true" />
      <div className="atmosphere atmosphere-top" aria-hidden="true" />
      <div className="petal-layer" aria-hidden="true">
        {PETAL_STREAM.map((petal, index) => (
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

      {view === 'home' ? (
        <div className={`view-shell view-${navDirection}`}>
          <section className="home-menu panel-glass">
            <h1 className="home-logo">JPLearn</h1>
            <p className="home-copy">
              Main Menu. Choose a script village, then choose a mini game and jump into the round.
            </p>

            <div className="menu-grid">
              {(['hiragana', 'katakana', 'kanji_n5'] as const).map((script, index) => {
                const glyph = SECTION_META[script].glyph

                return (
                  <button
                    key={script}
                    type="button"
                    className="menu-card"
                    aria-keyshortcuts={String(index + 1)}
                    onClick={() => {
                      setNavDirection('forward')
                      setActiveScript(script)
                      setView('script_hub')
                    }}
                  >
                    <span className="menu-script-glyph" aria-hidden="true" lang="ja">{glyph}</span>
                    <strong>{SCRIPT_LABELS[script]}</strong>
                    <p>{SCRIPT_MENU_LINES[script]}</p>
                  </button>
                )
              })}
            </div>

            <div className="home-actions">
              <button
                type="button"
                className="home-settings-button"
                aria-keyshortcuts="4"
                onClick={() => {
                  setNavDirection('forward')
                  setView('overview')
                }}
                aria-label="Open study overview"
                title="Study Overview (4)"
              >
                <BarChart3 aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
                Study Overview
              </button>

              <button
                type="button"
                className="home-settings-button"
                onClick={() => setShowSettings(true)}
                aria-label="Open settings"
                title="Settings (Ctrl+,)"
              >
                Settings
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {view === 'script_hub' ? (
        <div className={`view-shell view-${navDirection}`}>
          <header className="topbar panel-glass">
            <button type="button" className="back-button" onClick={goHome}>
              <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              Main Menu
            </button>
            <div className="brand-block">
              <span className="brand-kicker">{SCRIPT_LABELS[activeScript]}</span>
              <h1>Mini Game Map</h1>
            </div>
            <div className="topbar-end">
              <div className="focus-chip">
                <span>{activeScriptStats.bestStreak} Best Streak</span>
              </div>
              <button
                type="button"
                className="topbar-settings-button"
                onClick={() => setShowSettings(true)}
                aria-label="Open settings"
                title="Settings (Ctrl+,)"
              >
                <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              </button>
            </div>
          </header>

          <section className="panel-glass game-panel">
            <div className="panel-head">
              <h2>Choose a Minigame</h2>
              <span className="game-stats">Pick one to enter play mode</span>
            </div>

            <div className="minigame-grid">
              {MINIGAMES.map((game, index) => (
                (() => {
                  const gameStats = minigameStats[activeScript][game.key]
                  const accuracy =
                    gameStats.attempted > 0
                      ? Math.round((gameStats.correct / gameStats.attempted) * 100)
                      : 0

                  return (
                <article
                  key={game.key}
                  role="button"
                  tabIndex={0}
                  className={`game-tile ${activeGame === game.key ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveGame(game.key)
                    setSessionActive(false)
                    setRoundState(null)
                    setRoundFeedback(null)
                    setRoundFeedbackTone(null)
                    setRoundFeedbackPoints(null)
                    setRoundFeedbackAnswer(null)
                    setIsRoundResolving(false)
                    setLivesRemaining(DEFAULT_LIVES)
                    resetRoundCycle()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveGame(game.key)
                      setSessionActive(false)
                      setRoundState(null)
                      setRoundFeedback(null)
                      setRoundFeedbackTone(null)
                      setRoundFeedbackPoints(null)
                      setRoundFeedbackAnswer(null)
                      setIsRoundResolving(false)
                      setLivesRemaining(DEFAULT_LIVES)
                      resetRoundCycle()
                    }
                  }}
                  style={{ animationDelay: `${120 + index * 70}ms` }}
                >
                  <span className="game-icon" aria-hidden="true"><MinigameIcon game={game.key} /></span>
                  <strong>{game.title}</strong>
                  <p>{game.description}</p>
                  <div className="game-tile-stats" aria-label="Minigame stats">
                    <span className="game-tile-stat">
                      <small>Accuracy</small>
                      <strong>{accuracy}%</strong>
                    </span>
                    <span className="game-tile-stat">
                      <small>Best Streak</small>
                      <strong>{gameStats.bestStreak}</strong>
                    </span>
                    <span className="game-tile-stat">
                      <small>Points</small>
                      <strong>{gameStats.points}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="play-cta-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveGame(game.key)
                      setNavDirection('forward')
                      setView('minigame')
                      setSessionActive(false)
                      setRoundState(null)
                      setRoundFeedback(null)
                      setRoundFeedbackTone(null)
                      setRoundFeedbackPoints(null)
                      setRoundFeedbackAnswer(null)
                      setIsRoundResolving(false)
                      setLivesRemaining(DEFAULT_LIVES)
                      resetRoundCycle()
                    }}
                  >
                    Play
                  </button>
                </article>
                  )
                })()
              ))}
            </div>

            {gameLoading ? <p className="status-line">Loading deck cards...</p> : null}
            {gameError ? <p className="status-line status-error">{gameError}</p> : null}
          </section>
        </div>
      ) : null}

      {view === 'minigame' ? (
        <div className={`view-shell view-${navDirection}`}>
          <header className="topbar panel-glass">
            <button
              type="button"
              className="back-button"
              onClick={() => {
                setNavDirection('back')
                setView('script_hub')
              }}
            >
              <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              Back to Map
            </button>
            <div className="brand-block">
              <span className="brand-kicker">{SCRIPT_LABELS[activeScript]} Run</span>
              <h1>{selectedGameMeta?.title ?? 'Minigame'}</h1>
            </div>
            <div className="topbar-end">
              <div className="focus-chip">
                <span>{sessionScore}/{sessionRounds} Correct</span>
                <span>{sessionPoints} Points</span>
              </div>
              <button
                type="button"
                className="topbar-settings-button"
                onClick={() => setShowSettings(true)}
                aria-label="Open settings"
                title="Settings (Ctrl+,)"
              >
                <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              </button>
            </div>
          </header>

          <section className="panel-glass game-panel">
            {!sessionActive ? (
              <article className="minigame-intro panel-glass">
                <span className="intro-icon" aria-hidden="true">
                  <MinigameIcon game={activeGame} />
                </span>
                <p className="hero-kicker">{selectedGameIntro.vibe}</p>
                <h2 className="intro-title">{selectedGameMeta?.title}</h2>
                <p className="hero-copy">{selectedGameMeta?.description}</p>
                <p className="intro-objective"><strong>Objective:</strong> {selectedGameIntro.objective}</p>
                <p className="intro-tip"><strong>Tip:</strong> {selectedGameIntro.tip}</p>
                <label className="lives-toggle">
                  <input
                    type="checkbox"
                    checked={livesEnabled}
                    onChange={(event) => {
                      setLivesEnabled(event.target.checked)
                      setLivesRemaining(DEFAULT_LIVES)
                    }}
                  />
                  Enable lives mode ({DEFAULT_LIVES} lives per run)
                </label>

                <div className="game-actions intro-actions">
                  <button type="button" onClick={startSession} disabled={gameLoading || deckCards.length === 0}>
                    Play
                  </button>
                  {gameLoading ? <span>Loading deck...</span> : <span>{deckCards.length} cards available</span>}
                </div>
              </article>
            ) : (
              <div className="game-actions">
                <button type="button" onClick={startSession} disabled={gameLoading || deckCards.length === 0}>
                  Restart Challenge
                </button>
                {gameLoading ? <span>Loading deck...</span> : <span>{deckCards.length} cards available</span>}
                <div className="lives-inline" aria-live="polite">
                  {livesEnabled ? (
                    [...Array(DEFAULT_LIVES).keys()].map((life) => (
                      <span
                        key={`life-${life}`}
                        className={`life-heart ${life < livesRemaining ? 'is-active' : 'is-lost'}`}
                        aria-hidden="true"
                      >
                        <Heart className="inline-button-icon" strokeWidth={2.2} fill="currentColor" />
                      </span>
                    ))
                  ) : (
                    <span>Lives off</span>
                  )}
                </div>
              </div>
            )}

            {gameError ? <p className="status-line status-error">{gameError}</p> : null}

            {sessionActive && roundState ? (
              <article
                className={`game-round ${
                  roundFeedbackTone === 'error'
                    ? 'is-wrong'
                    : roundFeedbackTone === 'success'
                      ? 'is-correct'
                      : ''
                }`}
                key={`round-${sessionRounds}-${roundState.focusText}-${roundState.answer}`}
              >
                <div className="game-round-head">
                  <span>{SCRIPT_LABELS[activeScript]}</span>
                  <strong>{selectedGameMeta?.title}</strong>
                </div>
                <div className="game-prompt-focus">
                  <p className="game-prompt-label">{roundState.promptLabel}</p>
                  <p className={`game-prompt-main ${activeGame !== 'character_match' ? 'is-japanese' : ''}`}>
                    {roundState.focusText}
                  </p>
                </div>

                {activeGame === 'romaji_sprint' ? (
                  <form
                    className="game-input-row"
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitAnswer(roundInput)
                    }}
                  >
                    <input
                      ref={answerInputRef}
                      value={roundInput}
                      onChange={(event) => setRoundInput(sanitizeRomajiInput(event.target.value))}
                      placeholder="Enter romaji"
                      autoComplete="off"
                      disabled={isRoundResolving}
                    />
                    <button type="submit" disabled={isRoundResolving}>Check</button>
                  </form>
                ) : (
                  <div className="option-grid">
                    {roundState.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`option-button ${activeGame === 'character_match' ? 'option-button-character' : ''}`}
                        disabled={isRoundResolving}
                        onClick={() => submitAnswer(option.label)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {roundFeedback ? (
                  <div
                    className={`round-feedback ${
                      roundFeedbackTone === 'success'
                        ? 'round-feedback-success'
                        : roundFeedbackTone === 'error'
                          ? 'round-feedback-error'
                          : ''
                    }`}
                  >
                    <p className="round-feedback-message">{roundFeedback}</p>
                    <div className="round-feedback-meta">
                      <span className="round-feedback-points">
                        {roundFeedbackPoints !== null ? `+${roundFeedbackPoints} pts` : '+0 pts'}
                      </span>
                      {roundFeedbackTone === 'error' && livesEnabled ? <span className="round-feedback-life">-1 life</span> : null}
                    </div>
                    {roundFeedbackAnswer ? (
                      <p className="round-feedback-answer">Correct answer: {roundFeedbackAnswer}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ) : null}
          </section>
        </div>
      ) : null}

      {roundFeedback ? (
        <div
          className={`round-feedback-toast ${
            roundFeedbackTone === 'success' ? 'round-feedback-toast-success' : 'round-feedback-toast-error'
          }`}
          role="status"
          aria-live="polite"
        >
          <strong>{roundFeedback}</strong>
          {roundFeedbackTone === 'error' && roundFeedbackAnswer ? <span>Correct: {roundFeedbackAnswer}</span> : null}
        </div>
      ) : null}

      {view === 'overview' ? (
        <div className={`view-shell view-${navDirection}`}>
          <header className="topbar panel-glass">
            <button type="button" className="back-button" onClick={goHome}>
              <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              Main Menu
            </button>
            <div className="brand-block">
              <span className="brand-kicker">JPLearn</span>
              <h1>Study Overview</h1>
            </div>
            <div className="topbar-end">
              <div className="focus-chip">
                <span>Progress Board</span>
              </div>
              <button
                type="button"
                className="topbar-settings-button"
                onClick={() => setShowSettings(true)}
                aria-label="Open settings"
                title="Settings (Ctrl+,)"
              >
                <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              </button>
            </div>
          </header>

          <section className="panel-glass overview-hero">
            <div className="overview-hero-copy">
              <p className="hero-kicker">Session Snapshot</p>
              <h2 className="overview-hero-title">Your Learning Pulse</h2>
              <p className="hero-copy">See how much you have mastered, what is due now, and where to focus next.</p>
            </div>
            <div className="overview-hero-actions">
              <button type="button" onClick={() => void loadSummary()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => setShowResetConfirm(true)}
                disabled={resettingDb}
              >
                {resettingDb ? 'Resetting...' : 'Reset DB'}
              </button>
              <span>{lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for first sync'}</span>
            </div>
          </section>

          {showResetConfirm ? (
            <section className="panel-glass reset-confirm-panel" role="alertdialog" aria-modal="true">
              <h3>Reset study database?</h3>
              <p>
                This will permanently clear all review progress and event history for the study overview.
              </p>
              <div className="reset-confirm-actions">
                <button type="button" className="danger-button" onClick={() => void resetStudyDb()} disabled={resettingDb}>
                  {resettingDb ? 'Resetting...' : 'Yes, reset DB'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resettingDb}
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          <section className="tile-grid overview-tile-grid">
            {summaryTiles.map((tile, index) => (
              <article
                key={tile.label}
                className={`metric-tile tone-${tile.tone}`}
                style={{ animationDelay: `${120 + index * 80}ms` }}
              >
                <p>{tile.label}</p>
                <strong>{tile.value}</strong>
              </article>
            ))}
          </section>

          <section className="panel-glass deck-panel overview-deck-panel">
            <div className="panel-head">
              <h2>Deck Snapshot</h2>
              <div className="panel-actions">
                <span>Mastery and daily completion by deck</span>
              </div>
            </div>

            {loading && <p className="status-line">Loading deck metrics...</p>}
            {error && <p className="status-line status-error">Unable to load summary: {error}</p>}
            {!loading && !error && decks.length === 0 ? <p className="status-line">No decks found.</p> : null}

            {!loading && !error && decks.length > 0 ? (
              <div className="deck-grid">
                {decks.map((deck, index) => {
                  const mastery = deck.total > 0 ? Math.round((deck.mastered / deck.total) * 100) : 0
                  const todayProgress =
                    deck.due_today > 0
                      ? Math.min(100, Math.round((deck.completed_today / deck.due_today) * 100))
                      : 0

                  return (
                    <article
                      key={deck.slug}
                      className="deck-card"
                      style={{ animationDelay: `${180 + index * 70}ms` }}
                    >
                      <div className="deck-card-head">
                        <h3>{deck.name}</h3>
                        <span>{deck.total} cards</span>
                      </div>

                      <div className="meter">
                        <div className="meter-label">
                          <span>Mastery</span>
                          <strong>{mastery}%</strong>
                        </div>
                        <div className="meter-track">
                          <div className="meter-fill" style={{ width: `${mastery}%` }} />
                        </div>
                      </div>

                      <div className="meter">
                        <div className="meter-label">
                          <span>Today</span>
                          <strong>
                            {deck.completed_today}/{deck.due_today}
                          </strong>
                        </div>
                        <div className="meter-track">
                          <div className="meter-fill meter-fill-alt" style={{ width: `${todayProgress}%` }} />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : null}

            <footer className="panel-foot">
              <span>{totals.completedToday} cards completed today</span>
              <span>{totals.masteredCards} cards mastered overall</span>
            </footer>
          </section>
        </div>
      ) : null}

      {showSettings ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false)
          }}
        >
          <div
            className="modal-panel settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-modal-header">
              <h2 id="settings-title" className="settings-modal-title">Settings</h2>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                x
              </button>
            </div>

            <div className="settings-section">
              <p className="settings-section-label">Theme</p>
              <select
                className="settings-theme-select"
                value={settings.theme}
                onChange={(event) => {
                  const nextTheme = event.target.value as ThemeKey
                  setSettings((prev) => ({ ...prev, theme: nextTheme }))
                }}
              >
                {THEME_OPTIONS.map((theme) => (
                  <option key={theme.key} value={theme.key}>{theme.label}</option>
                ))}
              </select>
            </div>

            <div className="settings-section">
              <p className="settings-section-label">Font Size</p>
              <div className="settings-button-group">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`settings-option-button ${settings.fontSize === size ? 'is-active' : ''}`}
                    aria-pressed={settings.fontSize === size}
                    onClick={() => setSettings((prev) => ({ ...prev, fontSize: size }))}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <p className="settings-section-label">Accessibility</p>
              <button
                type="button"
                className={`settings-toggle ${settings.reducedMotion ? 'is-active' : ''}`}
                onClick={() => setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
                aria-pressed={settings.reducedMotion}
              >
                <span className="toggle-indicator" aria-hidden="true" />
                Reduce Motion
              </button>
            </div>

            <div className="settings-section">
              <p className="settings-section-label">Keyboard Shortcuts</p>
              <div className="settings-shortcuts">
                <code className="command-hint">Ctrl+,</code><span>Settings</span>
                <code className="command-hint">Esc</code><span>Close modal / back</span>
                <code className="command-hint">1 / 2 / 3</code><span>Script villages (home)</span>
                <code className="command-hint">4</code><span>Study overview (home)</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
