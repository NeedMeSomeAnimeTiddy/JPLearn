import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookText, CalendarDays, Copy, Flame, Heart, History, Keyboard, Languages, ListChecks, Lock, Minus, Settings, Shuffle, Square, Target, Trophy, X } from 'lucide-react'
import './App.css'

type StudySummaryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getStudySummary>
>
type ScriptDeck = Awaited<ReturnType<typeof window.jplearnDesktop.getDeckCards>>
type BlockInfo = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>['blocks'][number]
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'context_cloze' | 'narrative_story' | 'interleave_mix'
type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>
type InterleaveWeights = Record<'romaji_sprint' | 'meaning_match' | 'character_match' | 'context_cloze', number>
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
const DEFAULT_INTERLEAVE_WEIGHTS: InterleaveWeights = {
  romaji_sprint: 1,
  meaning_match: 1,
  character_match: 1,
  context_cloze: 1,
}
const SURPRISE_PROMPTS = [
  'Surprise Drill: trust your first instinct.',
  'Odd Prompt Mode: quick read, clean recall.',
  'Twist Round: stay sharp and answer fast.',
] as const
const SCRIPT_MODE_PROMPT_PACKS: Record<ScriptKey, Record<PlayableMinigame, string[]>> = {
  hiragana: {
    romaji_sprint: [
      'Sound Burst: read it aloud, then type it clean.',
      'Kana Echo: lock the vowel sound before you answer.',
    ],
    meaning_match: [
      'Kana Context: choose the meaning with the strongest cue.',
      'Quick Decode: ignore look-alikes and pick the exact sense.',
    ],
    character_match: [
      'Shape Recall: choose the symbol that matches the meaning.',
      'Script Snap: pick the kana form with confidence.',
    ],
    context_cloze: [
      'Context Ladder: use sentence clues before touching options.',
      'Meaning Lens: infer the blank, then verify carefully.',
    ],
    narrative_story: [
      'Story Gate: read the scene and infer what completes the moment.',
      'Chapter Pulse: use narrative clues to choose the strongest fit.',
    ],
  },
  katakana: {
    romaji_sprint: [
      'Loanword Sprint: hear the borrowed sound in your head first.',
      'Sharp Script: lock the consonant-vowel pair quickly.',
    ],
    meaning_match: [
      'Katakana Decode: pick the meaning that fits the imported term.',
      'Rapid Borrowing: map sound to meaning before selecting.',
    ],
    character_match: [
      'Glyph Match: choose the katakana symbol tied to the prompt.',
      'Name Lane: select the character used in modern terms.',
    ],
    context_cloze: [
      'Loanword Context: let the sentence guide the missing term.',
      'Borrowed Meaning: infer from usage before selecting.',
    ],
    narrative_story: [
      'Story Gate: follow the borrowed-word scene and pick the right meaning.',
      'Chapter Pulse: use the narrative beat before selecting.',
    ],
  },
  kanji_n5: {
    romaji_sprint: [
      'Reading Shift: commit to one reading and type decisively.',
      'Kanji Soundline: connect character to reading in one step.',
    ],
    meaning_match: [
      'Meaning Split: separate close definitions and pick the core one.',
      'Concept Lock: choose the strongest semantic match.',
    ],
    character_match: [
      'Symbol Meaning Link: pick the kanji with the right concept.',
      'N5 Recall: choose the character that best fits the cue.',
    ],
    context_cloze: [
      'Semantic Context: use nearby clues to fill the blank.',
      'N5 Sentence Drill: infer first, then commit to one meaning.',
    ],
    narrative_story: [
      'Story Gate: read the chapter cue and resolve the missing idea.',
      'Chapter Pulse: infer from the narrative shift before choosing.',
    ],
  },
}
const TAG_PROMPT_PACKS: Record<string, string[]> = {
  hiragana: [
    'Foundations First: this kana appears everywhere.',
    'Core Sound Check: nail the basic reading under pressure.',
  ],
  katakana: [
    'Borrowed Word Alert: think modern usage before answering.',
    'Foreign Sound Trace: map the pronunciation to script.',
  ],
  kanji: [
    'Component Clue: use radicals to guide your choice.',
    'Stroke Memory: visualize the character skeleton first.',
  ],
  n5: [
    'JLPT N5 Pulse: treat this like a fast exam checkpoint.',
    'N5 Accuracy Push: prioritize correctness over speed.',
  ],
}
const CLOZE_TEMPLATES: Record<ScriptKey, Record<number, string[]>> = {
  hiragana: {
    1: [
      'Beginner line: I am practicing ___ sounds today.',
      'Warm-up sentence: This kana reads as ___.',
    ],
    2: [
      'Context line: In this reading drill, the missing sound is ___.',
      'Focus sentence: I recognized ___ while reading slowly.',
    ],
    3: [
      'Challenge line: Under pressure, I still recalled ___ correctly.',
      'Advanced cue: In mixed review, ___ appeared and I answered cleanly.',
    ],
  },
  katakana: {
    1: [
      'Beginner line: This borrowed sound is written as ___.',
      'Warm-up sentence: The katakana reading here is ___.',
    ],
    2: [
      'Context line: In a loanword context, ___ is the best fit.',
      'Focus sentence: I saw a modern term and matched it to ___.',
    ],
    3: [
      'Challenge line: Fast recognition still pointed to ___.',
      'Advanced cue: In a noisy context, I mapped the sound to ___.',
    ],
  },
  kanji_n5: {
    1: [
      'Beginner line: This idea is best expressed as ___.',
      'Warm-up sentence: In simple Japanese text, ___ fits this spot.',
    ],
    2: [
      'Context line: The sentence meaning points toward ___ here.',
      'Focus sentence: With one clue missing, ___ completes the thought.',
    ],
    3: [
      'Challenge line: Subtle context still leads to ___.',
      'Advanced cue: In a compressed phrase, ___ is the strongest choice.',
    ],
  },
}

const STORY_CHAPTERS: Record<ScriptKey, Record<1 | 2 | 3, { title: string; lines: string[] }>> = {
  hiragana: {
    1: {
      title: 'Chapter 1: Station Arrival',
      lines: [
        'At the station gate, the sign glows and the missing clue is ___.',
        'A classmate waves from platform two, so the right word is ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Market Errand',
      lines: [
        'At a busy market stand, the sentence only makes sense with ___.',
        'The vendor repeats one key term, and the best fit is ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Festival Night',
      lines: [
        'Lanterns rise over the street, and the final missing meaning is ___.',
        'In the closing scene, one precise word completes the line: ___.',
      ],
    },
  },
  katakana: {
    1: {
      title: 'Chapter 1: City Signs',
      lines: [
        'Neon signs flash loanwords, and the missing concept is ___.',
        'A cafe menu uses katakana terms; the strongest fit is ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Train Transfer',
      lines: [
        'Platform announcements blend borrowed words; fill the blank with ___.',
        'A route map label points to one clear meaning: ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Live Concert',
      lines: [
        'Backstage chatter is fast, but the context still signals ___.',
        'The encore banner uses a key katakana term; choose ___.',
      ],
    },
  },
  kanji_n5: {
    1: {
      title: 'Chapter 1: Morning Routine',
      lines: [
        'A short diary line is missing one core idea: ___.',
        'The morning schedule sentence is complete only with ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Office Tasks',
      lines: [
        'A memo on the desk has one missing concept: ___.',
        'The task list reads naturally when the blank is ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Travel Plan',
      lines: [
        'A ticket note implies one exact meaning in the blank: ___.',
        'In the final itinerary line, the strongest completion is ___.',
      ],
    },
  },
}

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
  cardId: number
  mode: PlayableMinigame
  surprisePrompt: boolean
  curriculumStage: 1 | 2 | 3
  chapterNumber: 1 | 2 | 3 | null
  chapterLabel: string | null
  hintText: string | null
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
  {
    key: 'context_cloze',
    title: 'Context Cloze',
    description: 'Fill sentence blanks using context clues and i+1 progression.',
  },
  {
    key: 'narrative_story',
    title: 'Narrative Story',
    description: 'Play chapter scenes unlocked by your persisted curriculum stage.',
  },
  {
    key: 'interleave_mix',
    title: 'Interleave Mix',
    description: 'Cycle reading, meaning, and character rounds in one run.',
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
  context_cloze: {
    vibe: 'Context Ladder',
    objective: 'Use sentence context to infer the missing meaning.',
    tip: 'Read the full line before checking options, then pick the best semantic fit.',
  },
  narrative_story: {
    vibe: 'Story Chapters',
    objective: 'Complete chapter scenes where each card unlocks prompts by persisted stage.',
    tip: 'Treat each prompt like a mini scene: infer tone first, then choose the exact fit.',
  },
  interleave_mix: {
    vibe: 'Mixed Circuit',
    objective: 'Rotate across recall styles to build stronger long-term memory.',
    tip: 'Every few rounds include a surprising prompt to sharpen attention.',
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
  context_cloze: BookText,
  narrative_story: History,
  interleave_mix: Shuffle,
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
const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'
const CARD_MASTERY_MAX = 4 // Max score per card; reach this to fully master a card.

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
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    katakana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    kanji_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
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

type CardScores = Record<ScriptKey, Record<number, number>>

function loadCardScores(): CardScores {
  try {
    const raw = window.localStorage.getItem(CARD_SCORES_STORAGE_KEY)
    if (!raw) return { hiragana: {}, katakana: {}, kanji_n5: {} }
    const parsed = JSON.parse(raw) as Partial<CardScores>
    return {
      hiragana: parsed.hiragana ?? {},
      katakana: parsed.katakana ?? {},
      kanji_n5: parsed.kanji_n5 ?? {},
    }
  } catch {
    return { hiragana: {}, katakana: {}, kanji_n5: {} }
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

function clampWeight(value: number): number {
  return Math.max(1, Math.min(5, Math.floor(value)))
}

function buildInterleaveSequence(weights: InterleaveWeights): PlayableMinigame[] {
  const sequence: PlayableMinigame[] = []
  const modes: Array<keyof InterleaveWeights> = ['romaji_sprint', 'meaning_match', 'character_match', 'context_cloze']
  for (const mode of modes) {
    const count = clampWeight(weights[mode])
    for (let i = 0; i < count; i += 1) {
      sequence.push(mode)
    }
  }
  return sequence.length > 0 ? sequence : ['romaji_sprint', 'meaning_match', 'character_match']
}

function pickSurprisePrompt(
  script: ScriptKey,
  mode: PlayableMinigame,
  tags: string[],
  seed: number,
): string {
  const scriptPool = SCRIPT_MODE_PROMPT_PACKS[script][mode]
  const tagPool = tags
    .map((tag) => TAG_PROMPT_PACKS[tag.toLowerCase()])
    .filter((pack): pack is string[] => Boolean(pack))
    .flat()
  const combined = [...tagPool, ...scriptPool, ...SURPRISE_PROMPTS]
  return combined[Math.abs(seed) % combined.length]
}

function curriculumStageFromScore(score: number): 1 | 2 | 3 {
  if (score >= 3) return 3
  if (score >= 1) return 2
  return 1
}

function normalizeCurriculumStage(stage: number): 1 | 2 | 3 {
  if (stage >= 3) return 3
  if (stage >= 2) return 2
  return 1
}

function buildClozeLine(script: ScriptKey, stage: 1 | 2 | 3, seed: number): string {
  const templates = CLOZE_TEMPLATES[script][stage]
  return templates[Math.abs(seed) % templates.length]
}

function buildStoryChapter(script: ScriptKey, stage: 1 | 2 | 3, seed: number): { title: string; line: string } {
  const chapter = STORY_CHAPTERS[script][stage]
  return {
    title: chapter.title,
    line: chapter.lines[Math.abs(seed) % chapter.lines.length],
  }
}

function narrativePriorityCards(cards: ScriptDeck['cards']): ScriptDeck['cards'] {
  const stage3 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 3)
  if (stage3.length > 0) return stage3
  const stage2 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 2)
  if (stage2.length > 0) return stage2
  return cards
}

function App() {
  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const viewHistoryRef = useRef<AppView[]>(['home'])
  const viewHistoryIndexRef = useRef(0)
  const isHistoryNavigationRef = useRef(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [activeScript, setActiveScript] = useState<ScriptKey>('hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>('romaji_sprint')
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
  const [isRoundResolving, setIsRoundResolving] = useState<boolean>(false)
  const [sessionScore, setSessionScore] = useState<number>(0)
  const [sessionRounds, setSessionRounds] = useState<number>(0)
  const [sessionPoints, setSessionPoints] = useState<number>(0)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)
  const [leechFocusEnabled, setLeechFocusEnabled] = useState<boolean>(false)
  const [interleaveWeights, setInterleaveWeights] = useState<InterleaveWeights>({ ...DEFAULT_INTERLEAVE_WEIGHTS })
  const [interleaveSurpriseEnabled, setInterleaveSurpriseEnabled] = useState<boolean>(true)
  const [interleaveSurpriseEvery, setInterleaveSurpriseEvery] = useState<number>(5)

  const [scriptStats, setScriptStats] = useState<StatsByScript>(() => loadSavedStats())
  const [minigameStats, setMinigameStats] = useState<MinigameStatsByScript>(() => defaultMinigameStatsByScript())
  const [cardScores, setCardScores] = useState<CardScores>(() => loadCardScores())
  const [overviewBlocks, setOverviewBlocks] = useState<Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>>({})
  const [overviewBlocksLoading, setOverviewBlocksLoading] = useState(false)
  const [charMasteryExpanded, setCharMasteryExpanded] = useState(true)
  const [expandedBlocks, setExpandedBlocks] = useState<string | null>(null)

  interface SelectedChar {
    character: string
    romaji: string
    meaning: string
    score: number
  }
  const [selectedChar, setSelectedChar] = useState<SelectedChar | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0)
  const [resettingDb, setResettingDb] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const roundCycleRef = useRef<number[]>([])
  const roundCursorRef = useRef<number>(0)
  const interleaveCursorRef = useRef<number>(0)
  const interleaveSequence = useMemo(() => buildInterleaveSequence(interleaveWeights), [interleaveWeights])

  const resetRoundCycle = useCallback(() => {
    roundCycleRef.current = []
    roundCursorRef.current = 0
    interleaveCursorRef.current = 0
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
    window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(cardScores))
  }, [cardScores])

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
    if (view !== 'minigame' || !sessionActive || !roundState || isRoundResolving || roundState.mode !== 'romaji_sprint') {
      return
    }

    const focusHandle = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(focusHandle)
  }, [isRoundResolving, roundState, sessionActive, view])

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
    setLeechFocusEnabled(false)
    resetRoundCycle()

    try {
      const [deckPayload, blockPayload] = await Promise.all([
        window.jplearnDesktop.getDeckCards(script),
        window.jplearnDesktop.getBlockProgress(script),
      ])
      setDeckCards(deckPayload.cards)
      const blocks = blockPayload.blocks
      setBlockProgress(blocks)
      // Auto-select the last unlocked block so the user lands on the current frontier.
      if (blocks.length > 0) {
        const lastUnlocked = blocks.reduce(
          (best, b) => (b.unlocked ? b.index : best),
          0,
        )
        setActiveBlockIndex(lastUnlocked)
      } else {
        setActiveBlockIndex(0)
      }
    } catch (err) {
      setDeckCards([])
      setBlockProgress([])
      setActiveBlockIndex(0)
      setGameError(err instanceof Error ? err.message : 'Unknown game bridge error')
    } finally {
      setGameLoading(false)
    }
  }, [resetRoundCycle])

  useEffect(() => {
    void loadScriptCards(activeScript)
  }, [activeScript, loadScriptCards])

  const buildRound = useCallback(
    (
      cards: ScriptDeck['cards'],
      minigame: PlayableMinigame,
      cardIndex: number,
      surprisePrompt: boolean,
      promptSeed: number,
    ): RoundState | null => {
      if (cards.length === 0) return null

      const card = cards[cardIndex]
      const surpriseLabel = pickSurprisePrompt(activeScript, minigame, card.tags, promptSeed)
      const currentScore = cardScores[activeScript][card.id] ?? 0
      const persistedStage = normalizeCurriculumStage(card.curriculum_stage)
      const scoreStage = curriculumStageFromScore(currentScore)
      const curriculumStage = (minigame === 'context_cloze' || minigame === 'narrative_story')
        ? persistedStage
        : scoreStage

      if (minigame === 'romaji_sprint') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'Type the romaji for this character'
        return {
          cardId: card.id,
          mode: minigame,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: null,
          promptLabel,
          focusText: card.character,
          answer: card.romaji,
          options: [],
        }
      }

      if (cards.length < 4) return null

      const cardsById = new Map(cards.map((entry) => [entry.id, entry]))

      function pickDistractorsFromPool(poolIds: number[], desiredCount: number): ScriptDeck['cards'] {
        const selected: ScriptDeck['cards'] = []
        const seen = new Set<number>()
        for (const candidateId of poolIds) {
          if (candidateId === card.id || seen.has(candidateId)) continue
          const candidate = cardsById.get(candidateId)
          if (!candidate) continue
          selected.push(candidate)
          seen.add(candidateId)
          if (selected.length >= desiredCount) return selected
        }

        // Fallback when ranked pool is insufficient.
        for (const fallbackIndex of chooseUniqueIndices(cards.length, desiredCount * 2, cardIndex)) {
          const fallbackCard = cards[fallbackIndex]
          if (fallbackCard.id === card.id || seen.has(fallbackCard.id)) continue
          selected.push(fallbackCard)
          seen.add(fallbackCard.id)
          if (selected.length >= desiredCount) break
        }

        return selected
      }

      if (minigame === 'meaning_match') {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-meaning`,
            label: candidate.meaning,
          })),
        ])

        return {
          cardId: card.id,
          mode: minigame,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: null,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : 'Select the meaning for this character',
          focusText: card.character,
          answer: card.meaning,
          options,
        }
      }

      if (minigame === 'context_cloze') {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-cloze-meaning`,
            label: candidate.meaning,
          })),
        ])
        const clozeSentence = buildClozeLine(activeScript, curriculumStage, promptSeed).replace('___', '_____')

        return {
          cardId: card.id,
          mode: minigame,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: `Hint: ${card.character} (${card.romaji})`,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : `Fill the blank using context clues (Stage ${curriculumStage})`,
          focusText: clozeSentence,
          answer: card.meaning,
          options,
        }
      }

      if (minigame === 'narrative_story') {
        const rankedMeaningDistractors = pickDistractorsFromPool(card.meaning_distractor_ids, 3)
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...rankedMeaningDistractors.map((candidate) => ({
            id: `${candidate.id}-story-meaning`,
            label: candidate.meaning,
          })),
        ])
        const chapter = buildStoryChapter(activeScript, curriculumStage, promptSeed)

        return {
          cardId: card.id,
          mode: minigame,
          surprisePrompt,
          curriculumStage,
          chapterNumber: curriculumStage,
          chapterLabel: chapter.title,
          hintText: `Story gate: Stage ${curriculumStage} unlocked ${chapter.title}`,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : `${chapter.title} - choose the best completion`,
          focusText: chapter.line.replace('___', '_____'),
          answer: card.meaning,
          options,
        }
      }

      const rankedCharacterDistractors = pickDistractorsFromPool(card.character_distractor_ids, 3)
      const options = shuffleArray([
        { id: `${card.id}-correct`, label: card.character },
        ...rankedCharacterDistractors.map((candidate) => ({
          id: `${candidate.id}-character`,
          label: candidate.character,
        })),
      ])

      return {
        cardId: card.id,
        mode: minigame,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: null,
        promptLabel: surprisePrompt
          ? surpriseLabel
          : 'Select the character for this meaning',
        focusText: card.meaning,
        answer: card.character,
        options,
      }
    },
    [activeScript, cardScores],
  )

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

  // Cards restricted to the active block when block progression is available.
  const activeBlockCards = useMemo(() => {
    if (blockProgress.length === 0) return deckCards
    const block = blockProgress[activeBlockIndex]
    if (!block) return deckCards
    const idSet = new Set(block.card_ids)
    return deckCards.filter((c) => idSet.has(c.id))
  }, [deckCards, blockProgress, activeBlockIndex])

  const startSession = useCallback(() => {
    resetRoundCycle()
    const leechPool = activeBlockCards.filter((card) => card.is_leech)
    const sourceCards = leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards
    const modeSelection = nextRoundMode(activeGame)
    const modeCards = modeSelection.mode === 'narrative_story'
      ? narrativePriorityCards(sourceCards)
      : sourceCards
    const index = nextCardIndex(modeCards.length)
    const nextRound = index === null
      ? null
      : buildRound(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
    if (!nextRound) {
      setSessionActive(false)
      setRoundState(null)
      if (leechFocusEnabled && leechPool.length === 0) {
        setGameError('No active leech cards in this block yet. Disable focused review mode to continue.')
      } else {
        setGameError('Not enough cards in this block for the selected minigame yet.')
      }
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
  }, [activeGame, activeBlockCards, buildRound, leechFocusEnabled, nextCardIndex, nextRoundMode, resetRoundCycle, sessionRounds])

  const nextRound = useCallback(() => {
    const leechPool = activeBlockCards.filter((card) => card.is_leech)
    const sourceCards = leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards
    const modeSelection = nextRoundMode(activeGame)
    const modeCards = modeSelection.mode === 'narrative_story'
      ? narrativePriorityCards(sourceCards)
      : sourceCards
    const index = nextCardIndex(modeCards.length)
    const candidate = index === null
      ? null
      : buildRound(modeCards, modeSelection.mode, index, modeSelection.surprisePrompt, modeSelection.promptSeed)
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
  }, [activeGame, activeBlockCards, buildRound, leechFocusEnabled, nextCardIndex, nextRoundMode])

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
        if (roundState.mode === 'narrative_story') {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage + 1)
          const unlockSuffix = nextStage === 3 ? ' Chapter 3 unlocked.' : ''
          setRoundFeedback(`Correct +${awardedPoints} ${awardedPoints === 1 ? 'point' : 'points'} · Stage ${roundState.curriculumStage} -> ${nextStage}.${unlockSuffix}`)
        } else {
          setRoundFeedback(`Correct +${awardedPoints} ${awardedPoints === 1 ? 'point' : 'points'}`)
        }
        setRoundFeedbackTone('success')
        setRoundFeedbackPoints(awardedPoints)
        setRoundFeedbackAnswer(null)

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
      } else {
        if (livesEnabled) {
          nextLives = Math.max(0, livesRemaining - 1)
          setLivesRemaining(nextLives)
        }
        if (roundState.mode === 'narrative_story') {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage - 1)
          setRoundFeedback(`Not quite. Stage ${roundState.curriculumStage} -> ${nextStage}.`)
        } else {
          setRoundFeedback('You got it wrong.')
        }
        setRoundFeedbackTone('error')
        setRoundFeedbackPoints(0)
        setRoundFeedbackAnswer(roundState.answer)

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
      }

      void window.jplearnDesktop.recordGameResult({
        slug: activeScript,
        cardId: roundState.cardId,
        isCorrect,
        minigame: roundState.mode,
        curriculumStage:
          roundState.mode === 'context_cloze' || roundState.mode === 'narrative_story'
            ? roundState.curriculumStage
            : undefined,
      }).then((result) => {
        if (
          (roundState.mode !== 'context_cloze' && roundState.mode !== 'narrative_story') ||
          typeof result.curriculum_stage !== 'number'
        ) {
          return
        }
        const resolvedStage = normalizeCurriculumStage(result.curriculum_stage)
        setDeckCards((previousCards) =>
          previousCards.map((entry) =>
            entry.id === roundState.cardId
              ? { ...entry, curriculum_stage: resolvedStage }
              : entry,
          ),
        )
      }).catch(() => undefined)

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
        if (selectedChar) {
          setSelectedChar(null)
          return
        }

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
  }, [selectedChar, showSettings, view])

  const decks = useMemo(() => summary?.decks ?? [], [summary])
  const streak = useMemo(
    () => summary?.streak ?? { current_days: 0, best_days: 0 },
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
  const itemHistory = useMemo(() => summary?.item_history ?? [], [summary])
  const curriculumSummary = useMemo(
    () =>
      summary?.curriculum?.context_cloze ?? {
        mode: 'context_cloze',
        script_tag: 'all',
        attempts: 0,
        accuracy: 0,
        accuracy_7d: 0,
        stage_distribution: { 1: 0, 2: 0, 3: 0 },
      },
    [summary],
  )
  const curriculumByScript = useMemo(
    () =>
      summary?.curriculum?.context_cloze_by_script ?? {
        hiragana: { mode: 'context_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
        katakana: { mode: 'context_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
        kanji_n5: { mode: 'context_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
      },
    [summary],
  )
  const narrativeSummary = useMemo(
    () =>
      summary?.curriculum?.narrative_story ?? {
        mode: 'narrative_story',
        script_tag: 'all',
        attempts: 0,
        accuracy: 0,
        chapters: {
          '1': { attempts: 0, accuracy: 0, completion_rate: 0 },
          '2': { attempts: 0, accuracy: 0, completion_rate: 0 },
          '3': { attempts: 0, accuracy: 0, completion_rate: 0 },
        },
      },
    [summary],
  )
  const narrativeByScript = useMemo(
    () =>
      summary?.curriculum?.narrative_story_by_script ?? {
        hiragana: { mode: 'narrative_story', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
        katakana: { mode: 'narrative_story', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
        kanji_n5: { mode: 'narrative_story', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      },
    [summary],
  )
  const storyReadiness = useMemo(() => {
    return (['hiragana', 'katakana', 'kanji_n5'] as const).map((script) => {
      const metric = curriculumByScript[script]
      const stage1 = metric.stage_distribution[1] ?? 0
      const stage2 = metric.stage_distribution[2] ?? 0
      const stage3 = metric.stage_distribution[3] ?? 0
      const tracked = stage1 + stage2 + stage3
      const chapter2Ready = stage2 + stage3
      const chapter3Ready = stage3
      const chapter2Pct = tracked > 0 ? Math.round((chapter2Ready / tracked) * 100) : 0
      const chapter3Pct = tracked > 0 ? Math.round((chapter3Ready / tracked) * 100) : 0

      return {
        script,
        tracked,
        chapter2Ready,
        chapter3Ready,
        chapter2Pct,
        chapter3Pct,
      }
    })
  }, [curriculumByScript])

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
    { label: 'Decks', value: decks.length.toString(), tone: 'teal', icon: BarChart3, accent: 'insight' },
    { label: 'Current Streak', value: `${streak.current_days} days`, tone: 'ocean', icon: Flame, accent: 'streak' },
    { label: 'Mastered', value: `${totals.masteryRate}%`, tone: 'amber', icon: Trophy, accent: 'mastery' },
    { label: 'Due Today', value: totals.dueToday.toString(), tone: 'rose', icon: CalendarDays, accent: 'warning' },
  ] as const

  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const selectedGameIntro = MINIGAME_INTROS[activeGame]
  const activeScriptStats = scriptStats[activeScript]
  const activeRunCards = leechFocusEnabled && leechCards.length > 0 ? leechCards : activeBlockCards
  const narrativeReadiness = useMemo(() => {
    const stageCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
    for (const card of activeRunCards) {
      const stage = normalizeCurriculumStage(card.curriculum_stage)
      stageCounts[stage] += 1
    }
    const tracked = stageCounts[1] + stageCounts[2] + stageCounts[3]
    const chapter2Ready = stageCounts[2] + stageCounts[3]
    const chapter3Ready = stageCounts[3]
    return { tracked, chapter2Ready, chapter3Ready }
  }, [activeRunCards])
  const narrativeNextUnlockTarget = useMemo(() => {
    if (narrativeReadiness.tracked === 0) {
      return 'Next unlock target: start a run in this pool to begin chapter progression.'
    }
    if (narrativeReadiness.chapter3Ready === 0) {
      return 'Next unlock target: promote 1 card to Stage 3 to unlock Chapter 3.'
    }
    const remainingToFullChapter3 = Math.max(0, narrativeReadiness.tracked - narrativeReadiness.chapter3Ready)
    if (remainingToFullChapter3 > 0) {
      return `Next unlock target: promote ${remainingToFullChapter3} more ${remainingToFullChapter3 === 1 ? 'card' : 'cards'} to Stage 3 for full Chapter 3 coverage.`
    }
    return 'Next unlock target: full Chapter 3 coverage reached in this pool.'
  }, [narrativeReadiness])

  // Block progress enhanced with locally-tracked card scores (updates live while playing).
  const blockProgressWithMastery = useMemo(() => {
    const scores = cardScores[activeScript]
    return blockProgress.map((block) => {
      const total = block.card_ids.reduce((sum, id) => sum + (scores[id] ?? 0), 0)
      const mastery = block.card_ids.length > 0 ? total / (CARD_MASTERY_MAX * block.card_ids.length) : 0
      const unlocked = block.index === 0 || (() => {
        for (let i = 0; i < block.index; i++) {
          const prev = blockProgress[i]
          const prevTotal = prev.card_ids.reduce((sum, id) => sum + (scores[id] ?? 0), 0)
          const prevMastery = prev.card_ids.length > 0 ? prevTotal / (CARD_MASTERY_MAX * prev.card_ids.length) : 0
          if (prevMastery < 0.8) return false
        }
        return true
      })()
      return { ...block, mastery, unlocked }
    })
  }, [blockProgress, cardScores, activeScript])

  // Block session is complete when every card in the active block has reached max score.
  // sessionRounds > 0 ensures we don't trigger on a pre-mastered block before answering.
  const blockSessionComplete = useMemo(() => {
    if (!sessionActive || sessionRounds === 0 || activeBlockCards.length === 0) return false
    const scores = cardScores[activeScript]
    return activeBlockCards.every((c) => (scores[c.id] ?? 0) >= CARD_MASTERY_MAX)
  }, [sessionActive, sessionRounds, activeBlockCards, cardScores, activeScript])
  const hasAnyActivity = activity.week.reviewed > 0 || activity.month.reviewed > 0
  const hasMistakeData = mistakes.length > 0
  const historyPageSize = 4
  const historyPageCount = Math.max(1, Math.ceil(itemHistory.length / historyPageSize))
  const clampedHistoryPage = Math.min(historyPage, historyPageCount)
  const pagedHistory = itemHistory.slice(
    (clampedHistoryPage - 1) * historyPageSize,
    clampedHistoryPage * historyPageSize,
  )

  useEffect(() => {
    setHistoryPage(1)
  }, [summary])

  // Lazy-load block data for hiragana + katakana when the overview opens.
  useEffect(() => {
    if (view !== 'overview') return
    setOverviewBlocksLoading(true)
    void Promise.all([
      window.jplearnDesktop.getBlockProgress('hiragana'),
      window.jplearnDesktop.getBlockProgress('katakana'),
    ])
      .then(([hira, kata]) => {
        setOverviewBlocks({ hiragana: hira.blocks, katakana: kata.blocks })
      })
      .catch(() => undefined)
      .finally(() => setOverviewBlocksLoading(false))
  }, [view])

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
      // Also wipe all locally-tracked scores and stats so the UI is fully clean.
      const emptyScores: CardScores = { hiragana: {}, katakana: {}, kanji_n5: {} }
      const emptyStats: StatsByScript = {
        hiragana: { ...EMPTY_SCRIPT_STATS },
        katakana: { ...EMPTY_SCRIPT_STATS },
        kanji_n5: { ...EMPTY_SCRIPT_STATS },
      }
      window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(emptyScores))
      window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(emptyStats))
      setCardScores(emptyScores)
      setScriptStats(emptyStats)
      setMinigameStats(defaultMinigameStatsByScript())
      setResetConfirmStep(0)
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

  const canTitlebarBack = viewHistoryIndexRef.current > 0
  const canTitlebarForward = viewHistoryIndexRef.current < viewHistoryRef.current.length - 1

  return (
    <main className="app-shell">
      <header className="window-titlebar" aria-label="Window controls">
        <div className="window-titlebar-drag">
          <div className="window-titlebar-nav" role="group" aria-label="App navigation">
            <button
              type="button"
              className="window-nav-button"
              onClick={titlebarHistoryBack}
              aria-label="Back"
              title="Back"
              disabled={!canTitlebarBack}
            >
              <ArrowLeft className="window-nav-icon" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="window-nav-button"
              onClick={titlebarHistoryForward}
              aria-label="Forward"
              title="Forward"
              disabled={!canTitlebarForward}
            >
              <ArrowRight className="window-nav-icon" strokeWidth={2.2} />
            </button>
          </div>
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
                <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`best-${activeScriptStats.bestStreak}`} className="live-value">{activeScriptStats.bestStreak}</strong> Best Streak</span>
                <span className="metric-accent-danger"><AlertTriangle aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`leech-${leechCards.length}`} className="live-value">{leechCards.length}</strong> Leeches</span>
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
              <h2>Learning Path</h2>
              <span className="game-stats">
                {blockProgressWithMastery.length > 0
                  ? `${blockProgressWithMastery.filter((b) => b.mastery >= 0.8).length} / ${blockProgressWithMastery.length} blocks mastered`
                  : 'Choose a minigame to start'}
              </span>
            </div>

            {blockProgressWithMastery.length > 0 ? (
              <div className="block-path">
                {blockProgressWithMastery.map((block, index) => {
                  const isActive = activeBlockIndex === block.index
                  const masteryPct = Math.round(block.mastery * 100)
                  return (
                    <article
                      key={block.index}
                      className={`block-node ${isActive ? 'is-active' : ''} ${!block.unlocked ? 'is-locked' : ''}`}
                      style={{ animationDelay: `${80 + index * 50}ms` }}
                    >
                      <button
                        type="button"
                        className="block-node-button"
                        disabled={!block.unlocked}
                        onClick={() => {
                          if (!block.unlocked) return
                          setActiveBlockIndex(block.index)
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
                        aria-pressed={isActive}
                        aria-label={`${block.name}, ${block.unlocked ? `${masteryPct}% mastered` : 'locked'}`}
                      >
                        <div className="block-node-header">
                          <div className="block-node-chars" lang="ja" aria-hidden="true">
                            {block.sample_chars.join(' ')}
                          </div>
                          {!block.unlocked ? (
                            <Lock className="block-lock-icon" strokeWidth={2} aria-hidden="true" />
                          ) : null}
                        </div>
                        <strong className="block-node-name">{block.name}</strong>
                        <div className="block-node-bar-wrap" aria-label={`Mastery: ${masteryPct}%`}>
                          <div
                            className="block-node-bar"
                            style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties}
                          />
                        </div>
                        <span className="block-node-pct">{masteryPct}%</span>
                      </button>
                    </article>
                  )
                })}
              </div>
            ) : null}

            {/* Minigame selector – shown below block path once a block is active */}
            {(blockProgressWithMastery.length === 0 || blockProgressWithMastery[activeBlockIndex]?.unlocked) ? (
              <>
                <div className="panel-head block-minigame-head">
                  <h3>
                    {blockProgressWithMastery.length > 0
                      ? `Choose a minigame — ${blockProgressWithMastery[activeBlockIndex]?.name ?? ''} (${activeBlockCards.length} cards)`
                      : 'Choose a minigame'}
                  </h3>
                </div>
                <div className="minigame-grid">
                  {MINIGAMES.map((game, index) => {
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
                        {game.key === 'narrative_story' ? (
                          <p className="game-story-readiness">Chapter 3 ready in pool: {narrativeReadiness.chapter3Ready}</p>
                        ) : null}
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
                  })}
                </div>
              </>
            ) : null}

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
              <span className="brand-kicker">
                {SCRIPT_LABELS[activeScript]}
                {blockProgressWithMastery.length > 0 && blockProgressWithMastery[activeBlockIndex]
                  ? ` · ${blockProgressWithMastery[activeBlockIndex].name}`
                  : ' Run'}
              </span>
              <h1>{selectedGameMeta?.title ?? 'Minigame'}</h1>
            </div>
            <div className="topbar-end">
              <div className="focus-chip">
                <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`correct-${sessionScore}-${sessionRounds}`} className="live-value">{sessionScore}/{sessionRounds}</strong> Correct</span>
                <span className="metric-accent-streak"><Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`points-${sessionPoints}`} className="live-value">{sessionPoints}</strong> Points</span>
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
            {blockSessionComplete && sessionActive ? (
              <article className="block-complete-banner panel-glass" role="status">
                <span className="block-complete-icon" aria-hidden="true">🎉</span>
                <h2 className="block-complete-title">Block complete!</h2>
                <p className="block-complete-copy">
                  You answered every card in{' '}
                  <strong>{blockProgressWithMastery[activeBlockIndex]?.name ?? 'this block'}</strong>{' '}
                  correctly. Head back to the map to continue your path.
                </p>
                <div className="game-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setNavDirection('back')
                      setView('script_hub')
                    }}
                  >
                    Back to Map
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      startSession()
                    }}
                  >
                    Play Again
                  </button>
                </div>
              </article>
            ) : !sessionActive ? (
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
                <label className="lives-toggle leech-focus-toggle">
                  <input
                    type="checkbox"
                    checked={leechFocusEnabled}
                    onChange={(event) => setLeechFocusEnabled(event.target.checked)}
                  />
                  Focused review mode (leech cards first)
                </label>

                {activeGame === 'interleave_mix' ? (
                  <section className="interleave-controls" aria-label="Interleave controls">
                    <p className="interleave-controls-title">Interleave policy</p>
                    <label className="lives-toggle">
                      <input
                        type="checkbox"
                        checked={interleaveSurpriseEnabled}
                        onChange={(event) => setInterleaveSurpriseEnabled(event.target.checked)}
                      />
                      Enable surprise prompts
                    </label>
                    <label className="interleave-frequency">
                      Surprise frequency (every N rounds)
                      <input
                        type="range"
                        min={2}
                        max={8}
                        value={interleaveSurpriseEvery}
                        disabled={!interleaveSurpriseEnabled}
                        onChange={(event) => setInterleaveSurpriseEvery(Number(event.target.value))}
                      />
                      <span>{interleaveSurpriseEvery}</span>
                    </label>
                    <div className="interleave-weight-grid">
                      {(['romaji_sprint', 'meaning_match', 'character_match', 'context_cloze'] as const).map((mode) => (
                        <label key={mode} className="interleave-weight-row">
                          {MINIGAMES.find((game) => game.key === mode)?.title ?? mode}
                          <input
                            type="range"
                            min={1}
                            max={5}
                            value={interleaveWeights[mode]}
                            onChange={(event) => {
                              const nextValue = clampWeight(Number(event.target.value))
                              setInterleaveWeights((previous) => ({
                                ...previous,
                                [mode]: nextValue,
                              }))
                            }}
                          />
                          <span>{interleaveWeights[mode]}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ) : null}

                {activeGame === 'narrative_story' ? (
                  <section className="interleave-controls" aria-label="Narrative chapter readiness">
                    <p className="interleave-controls-title">Story chapter readiness</p>
                    <div className="activity-window-metrics">
                      <span className="metric-accent-insight"><strong className="live-value">{narrativeReadiness.tracked}</strong> tracked cards</span>
                      <span className="metric-accent-ocean"><strong className="live-value">{narrativeReadiness.chapter2Ready}</strong> chapter 2 ready</span>
                      <span className="metric-accent-streak"><strong className="live-value">{narrativeReadiness.chapter3Ready}</strong> chapter 3 ready</span>
                    </div>
                    {narrativeReadiness.tracked === 0 ? (
                      <p className="status-line">No cards available in this run pool yet.</p>
                    ) : narrativeReadiness.chapter3Ready === 0 ? (
                      <p className="status-line">Chapter 3 is still locked for this pool. Promote cards to stage 3 to unlock it.</p>
                    ) : narrativeReadiness.chapter2Ready === 0 ? (
                      <p className="status-line">Chapter 2 is still locked for this pool. Promote cards to stage 2 to unlock it.</p>
                    ) : (
                      <p className="status-line">Higher chapters are available. Keep pushing stage 3 for full story coverage.</p>
                    )}
                    <p className="status-line">{narrativeNextUnlockTarget}</p>
                  </section>
                ) : null}

                <div className="game-actions intro-actions">
                  <button type="button" onClick={startSession} disabled={gameLoading || activeRunCards.length === 0}>
                    Play
                  </button>
                  {gameLoading ? <span>Loading deck...</span> : <span>{activeRunCards.length} cards available</span>}
                </div>
              </article>
            ) : (
              <div className="game-actions">
                <button type="button" onClick={startSession} disabled={gameLoading || activeRunCards.length === 0}>
                  Restart Challenge
                </button>
                {gameLoading ? <span>Loading deck...</span> : <span>{activeRunCards.length} cards available</span>}
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
                  <strong>
                    {selectedGameMeta?.title}
                    {activeGame === 'interleave_mix'
                      ? ` · ${MINIGAMES.find((game) => game.key === roundState.mode)?.title ?? roundState.mode}`
                      : ''}
                  </strong>
                  {roundState.chapterLabel ? <span className="chapter-pill">{roundState.chapterLabel}</span> : null}
                  <span className="stage-pill">Stage {roundState.curriculumStage}</span>
                  {roundState.surprisePrompt ? <span className="surprise-pill">Surprise</span> : null}
                </div>
                <div className="game-prompt-focus">
                  <p className="game-prompt-label">{roundState.promptLabel}</p>
                  <p className={`game-prompt-main ${roundState.mode !== 'character_match' ? 'is-japanese' : ''}`}>
                    {roundState.focusText}
                  </p>
                  {roundState.hintText ? <p className="game-hint-text">{roundState.hintText}</p> : null}
                </div>

                {roundState.mode === 'romaji_sprint' ? (
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
                        className={`option-button ${roundState.mode === 'character_match' ? 'option-button-character' : ''}`}
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
                    {roundState.mode === 'narrative_story' ? (
                      <p className="round-feedback-answer">Story progress updates chapter access based on stage transitions.</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ) : null}
          </section>
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
                onClick={() => setResetConfirmStep(1)}
                disabled={resettingDb}
              >
                {resettingDb ? 'Resetting...' : 'Reset DB'}
              </button>
              <span>{lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for first sync'}</span>
            </div>
          </section>

          {resetConfirmStep > 0 ? (
            <section className="panel-glass reset-confirm-panel" role="alertdialog" aria-modal="true">
              {resetConfirmStep === 1 ? (
                <>
                  <h3>Reset all progress?</h3>
                  <p>
                    This will permanently delete all review history, streaks, leech data,
                    and locally-tracked character scores. There is no undo.
                  </p>
                  <div className="reset-confirm-actions">
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => setResetConfirmStep(2)}
                      disabled={resettingDb}
                    >
                      I understand — continue
                    </button>
                    <button type="button" onClick={() => setResetConfirmStep(0)} disabled={resettingDb}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Final confirmation</h3>
                  <p>
                    <strong>All your progress will be erased.</strong>{' '}
                    Click the button below to permanently delete everything.
                  </p>
                  <div className="reset-confirm-actions">
                    <button
                      type="button"
                      className="danger-button danger-button-final"
                      onClick={() => void resetStudyDb()}
                      disabled={resettingDb}
                    >
                      {resettingDb ? 'Resetting…' : '⚠ Yes, delete everything'}
                    </button>
                    <button type="button" onClick={() => setResetConfirmStep(0)} disabled={resettingDb}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          <section className="tile-grid overview-tile-grid">
            {summaryTiles.map((tile, index) => (
              <article
                key={`${tile.label}-${tile.value}`}
                className={`metric-tile tone-${tile.tone}`}
                style={{ animationDelay: `${120 + index * 80}ms` }}
              >
                <p><tile.icon aria-hidden="true" className={`metric-icon icon-${tile.accent}`} strokeWidth={2.2} />{tile.label}</p>
                <strong className="live-value">{tile.value}</strong>
              </article>
            ))}
          </section>

          {/* ── Character mastery grid ────────────────────────────────── */}
          <section className="panel-glass char-mastery-panel">
            <button
              type="button"
              className="char-mastery-toggle"
              onClick={() => setCharMasteryExpanded((v) => !v)}
              aria-expanded={charMasteryExpanded}
            >
              <div className="panel-head char-mastery-panel-head">
                <h2>Character Mastery</h2>
                <div className="panel-actions">
                  <span>{overviewBlocksLoading ? 'Loading…' : 'Color-coded progress for every symbol'}</span>
                </div>
                <span className={`char-mastery-chevron ${charMasteryExpanded ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            {/* max-height wrapper — inner div carries padding so wrapper can collapse to 0 cleanly */}
            <div className={`char-mastery-body ${charMasteryExpanded ? 'is-open' : ''}`}>
              <div className="char-mastery-body-inner">
                {(['hiragana', 'katakana'] as const).map((script) => {
                  const blocks = overviewBlocks[script]
                  if (!blocks || blocks.length === 0) return null
                  const scores = cardScores[script]

                  return (
                    <div key={script} className="char-mastery-script">
                      <h3 className="char-mastery-script-name">
                        {script === 'hiragana' ? 'Hiragana' : 'Katakana'}
                      </h3>

                      {/*
                        CSS-Grid inline-expand pattern (css-tricks.com/expandable-sections-within-a-css-grid):
                        Tiles sit in an auto-fill grid. The active block's detail panel is injected
                        directly after its tile with grid-column: 1 / -1 so it spans the full row.
                        grid-auto-flow: dense fills any gaps in the tile row before the detail panel,
                        keeping the visual tile order stable.
                      */}
                      <div className="char-mastery-tiles-grid">
                        {blocks.map((block) => {
                          const blockKey = `${script}-${block.index}`
                          const isActive = expandedBlocks === blockKey
                          const blockTotal = block.card_ids.reduce((sum, id) => sum + (scores[id] ?? 0), 0)
                          const pct = block.card_ids.length > 0
                            ? Math.round(blockTotal / (CARD_MASTERY_MAX * block.card_ids.length) * 100)
                            : 0
                          return (
                            <Fragment key={block.index}>
                              <button
                                type="button"
                                className={`cmb-tile ${isActive ? 'is-active' : ''}`}
                                onClick={() => setExpandedBlocks(isActive ? null : blockKey)}
                                aria-expanded={isActive}
                                aria-label={`${block.name}: ${pct}% mastered`}
                              >
                                <div className="cmb-tile-chars" lang="ja" aria-hidden="true">
                                  {block.sample_chars.join(' ')}
                                </div>
                                <strong className="cmb-tile-name">{block.name}</strong>
                                <div className="cmb-bar-wrap">
                                  <div className="cmb-bar" style={{ '--cmb-pct': `${pct}%` } as React.CSSProperties} />
                                </div>
                                <div className="cmb-tile-pct">{pct}%</div>
                              </button>

                              {/* Detail panel: grid-column 1/-1 makes it span the full row right below this tile */}
                              {isActive ? (
                                <div className="char-mastery-detail-inline">
                                  <div className="char-mastery-chips">
                                    {block.card_ids.map((id, charIdx) => {
                                      const score = scores[id] ?? 0
                                      const level = Math.min(score, CARD_MASTERY_MAX)
                                      const char = block.characters?.[charIdx] ?? ''
                                      const meaning = block.meanings?.[charIdx] ?? ''
                                      const romaji = block.romajis?.[charIdx] ?? ''
                                      return (
                                        <button
                                          key={id}
                                          type="button"
                                          className="char-mastery-chip"
                                          data-level={level}
                                          aria-label={`${char} (${romaji}): ${level}/${CARD_MASTERY_MAX}`}
                                          lang="ja"
                                          onClick={() => setSelectedChar({ character: char, romaji, meaning, score: level })}
                                        >
                                          {char}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </Fragment>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="panel-glass activity-summary-panel">
            <div className="panel-head">
              <h2 className="panel-title-with-icon"><CalendarDays aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Study Activity</h2>
              <div className="panel-actions">
                <span>Rolling windows for consistency and momentum</span>
              </div>
            </div>

            {!hasAnyActivity ? (
              <p className="status-line">No recent activity yet. Complete a round to populate weekly and monthly summaries.</p>
            ) : (
              <div className="activity-window-grid">
                {[activity.week, activity.month].map((windowData, index) => (
                  <article
                    key={windowData.days}
                    className="activity-window-card"
                    style={{ animationDelay: `${140 + index * 80}ms` }}
                  >
                    <h3>Last {windowData.days} Days</h3>
                    <div className="activity-window-metrics">
                      <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`reviewed-${windowData.days}-${windowData.reviewed}`} className="live-value">{windowData.reviewed}</strong> reviewed</span>
                      <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`correct-${windowData.days}-${windowData.correct}`} className="live-value">{windowData.correct}</strong> correct</span>
                      <span className="metric-accent-danger"><AlertTriangle aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`incorrect-${windowData.days}-${windowData.incorrect}`} className="live-value">{windowData.incorrect}</strong> incorrect</span>
                      <span className="metric-accent-ocean"><Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`accuracy-${windowData.days}-${windowData.accuracy}`} className="live-value">{windowData.accuracy}%</strong> accuracy</span>
                      <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`earned-${windowData.days}-${windowData.points_earned}`} className="live-value">{windowData.points_earned}</strong> points</span>
                      <span className="metric-accent-warning"><CalendarDays aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`days-${windowData.days}-${windowData.active_days}`} className="live-value">{windowData.active_days}</strong> active days</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel-glass activity-summary-panel">
            <div className="panel-head">
              <h2 className="panel-title-with-icon"><BookText aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Context Cloze Curriculum</h2>
              <div className="panel-actions">
                <span>Persisted stage progression and mode accuracy</span>
              </div>
            </div>

            <div className="activity-window-grid">
              <article className="activity-window-card">
                <h3>Mode Performance</h3>
                <div className="activity-window-metrics">
                  <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong className="live-value">{curriculumSummary.attempts}</strong> attempts</span>
                  <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong className="live-value">{curriculumSummary.accuracy}%</strong> accuracy</span>
                  <span className="metric-accent-ocean"><Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong className="live-value">{curriculumSummary.accuracy_7d}%</strong> 7-day accuracy</span>
                </div>
              </article>
              <article className="activity-window-card">
                <h3>Stage Distribution</h3>
                <div className="activity-window-metrics">
                  <span className="metric-accent-warning"><strong className="live-value">{curriculumSummary.stage_distribution[1]}</strong> stage 1</span>
                  <span className="metric-accent-ocean"><strong className="live-value">{curriculumSummary.stage_distribution[2]}</strong> stage 2</span>
                  <span className="metric-accent-streak"><strong className="live-value">{curriculumSummary.stage_distribution[3]}</strong> stage 3</span>
                </div>
              </article>
            </div>

            <div className="activity-window-grid" style={{ marginTop: '10px' }}>
              {(['hiragana', 'katakana', 'kanji_n5'] as const).map((script) => {
                const metric = curriculumByScript[script]
                return (
                  <article key={script} className="activity-window-card">
                    <h3>{SCRIPT_LABELS[script]}</h3>
                    <div className="activity-window-metrics">
                      <span className="metric-accent-insight"><strong className="live-value">{metric.attempts}</strong> attempts</span>
                      <span className="metric-accent-skill"><strong className="live-value">{metric.accuracy}%</strong> accuracy</span>
                      <span className="metric-accent-ocean"><strong className="live-value">{metric.accuracy_7d}%</strong> 7-day</span>
                      <span className="metric-accent-warning"><strong className="live-value">{metric.stage_distribution[1]}/{metric.stage_distribution[2]}/{metric.stage_distribution[3]}</strong> stage 1/2/3</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="panel-glass activity-summary-panel">
            <div className="panel-head">
              <h2 className="panel-title-with-icon"><History aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Story Progress</h2>
              <div className="panel-actions">
                <span>Narrative attempts, chapter accuracy, and completion readiness</span>
              </div>
            </div>

            <div className="activity-window-grid">
              <article className="activity-window-card">
                <h3>Narrative Mode Performance</h3>
                <div className="activity-window-metrics">
                  <span className="metric-accent-insight"><strong className="live-value">{narrativeSummary.attempts}</strong> attempts</span>
                  <span className="metric-accent-skill"><strong className="live-value">{narrativeSummary.accuracy}%</strong> accuracy</span>
                  <span className="metric-accent-ocean"><strong className="live-value">{narrativeSummary.chapters['3'].completion_rate}%</strong> Chapter 3 completion</span>
                </div>
              </article>
              {(['1', '2', '3'] as const).map((chapterKey) => (
                <article key={chapterKey} className="activity-window-card">
                  <h3>Chapter {chapterKey}</h3>
                  <div className="activity-window-metrics">
                    <span className="metric-accent-insight"><strong className="live-value">{narrativeSummary.chapters[chapterKey].attempts}</strong> attempts</span>
                    <span className="metric-accent-skill"><strong className="live-value">{narrativeSummary.chapters[chapterKey].accuracy}%</strong> accuracy</span>
                    <span className="metric-accent-streak"><strong className="live-value">{narrativeSummary.chapters[chapterKey].completion_rate}%</strong> completion</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="activity-window-grid">
              {storyReadiness.map((story, index) => (
                <article
                  key={story.script}
                  className="activity-window-card"
                  style={{ animationDelay: `${140 + index * 70}ms` }}
                >
                  <h3>{SCRIPT_LABELS[story.script]}</h3>
                  <div className="activity-window-metrics">
                    <span className="metric-accent-insight"><strong className="live-value">{narrativeByScript[story.script].attempts}</strong> attempts</span>
                    <span className="metric-accent-skill"><strong className="live-value">{narrativeByScript[story.script].accuracy}%</strong> accuracy</span>
                    <span className="metric-accent-ocean"><strong className="live-value">{narrativeByScript[story.script].chapters['2'].completion_rate}%</strong> Chapter 2 ready</span>
                    <span className="metric-accent-streak"><strong className="live-value">{narrativeByScript[story.script].chapters['3'].completion_rate}%</strong> Chapter 3 ready</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel-glass mistakes-summary-panel">
            <div className="panel-head">
              <h2 className="panel-title-with-icon"><AlertTriangle aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Mistake Breakdown</h2>
              <div className="panel-actions">
                <span>Top weak areas by error rate</span>
              </div>
            </div>

            {!hasMistakeData ? (
              <p className="status-line">No mistake data yet. Incorrect answers will populate script/tag breakdowns here.</p>
            ) : (
              <div className="mistake-grid">
                {mistakes.map((row, index) => (
                  <article
                    key={row.key}
                    className="mistake-card"
                    style={{ animationDelay: `${140 + index * 60}ms` }}
                  >
                    <h3>{row.key}</h3>
                    <div className="mistake-card-metrics">
                      <span className="metric-accent-danger"><AlertTriangle aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`rate-${row.key}-${row.error_rate}`} className="live-value">{row.error_rate}%</strong> error rate</span>
                      <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`mistakes-${row.key}-${row.mistakes}`} className="live-value">{row.mistakes}</strong> mistakes</span>
                      <span className="metric-accent-insight"><BarChart3 aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`attempts-${row.key}-${row.attempts}`} className="live-value">{row.attempts}</strong> attempts</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel-glass timeline-summary-panel">
            <div className="panel-head">
              <h2 className="panel-title-with-icon"><History aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Item Timeline</h2>
              <div className="panel-actions">
                <span>Recent review events and trend per item</span>
              </div>
            </div>

            {itemHistory.length === 0 ? (
              <p className="status-line">No item history yet. Complete review rounds to build timelines.</p>
            ) : (
              <>
                <div className="timeline-grid">
                  {pagedHistory.map((item, index) => (
                    <article
                      key={item.key}
                      className="timeline-card"
                      style={{ animationDelay: `${140 + index * 60}ms` }}
                    >
                      <div className="timeline-card-head">
                        <h3>{item.prompt}</h3>
                        <span className={`timeline-trend timeline-trend-${item.trend}`}>{item.trend}</span>
                      </div>
                      <p className="timeline-card-subhead">{item.script_tag} • {item.deck}</p>
                      <div className="timeline-events">
                        {item.events.map((event, eventIndex) => (
                          <span key={`${item.key}-${eventIndex}`} className={`timeline-event timeline-event-${event.outcome}`}>
                            <strong>{event.outcome === 'correct' ? '✓' : '✕'}</strong>
                            {event.points_delta} pts
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="timeline-pagination">
                  <button
                    type="button"
                    disabled={clampedHistoryPage <= 1}
                    onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  >
                    Previous
                  </button>
                  <span>Page {clampedHistoryPage} / {historyPageCount}</span>
                  <button
                    type="button"
                    disabled={clampedHistoryPage >= historyPageCount}
                    onClick={() => setHistoryPage((prev) => Math.min(historyPageCount, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
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
              <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`completed-${totals.completedToday}`} className="live-value">{totals.completedToday}</strong> cards completed today</span>
              <span className="metric-accent-streak"><Flame aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`best-day-${streak.best_days}`} className="live-value">{streak.best_days}</strong> day best streak</span>
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
    </main>
  )
}

export default App
