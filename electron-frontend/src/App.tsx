import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookText, CalendarDays, Copy, Flame, Heart, History, House, Keyboard, Languages, ListChecks, Lock, Menu, Minus, Moon, Plus, RefreshCw, Settings, Shuffle, Square, Sun, Target, Trophy, X } from 'lucide-react'
import './App.css'

type StudySummaryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getStudySummary>
>
type DeckSlugInput = Parameters<typeof window.jplearnDesktop.getDeckCards>[0]
type OverviewCharacterMasteryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getOverviewCharacterMastery>
>
type ScriptDeck = Awaited<ReturnType<typeof window.jplearnDesktop.getDeckCards>>
type BlockProgressPayload = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>
type StudyQueueResponse = Awaited<ReturnType<typeof window.jplearnDesktop.getStudyQueue>>
type SessionGoalStartResponse = Awaited<ReturnType<typeof window.jplearnDesktop.startSessionGoal>>
type SessionSummaryResponse = Awaited<ReturnType<typeof window.jplearnDesktop.getSessionSummary>>
type SessionSummaryPayload = NonNullable<SessionSummaryResponse['summary']>
interface SessionRunReport {
  script: ScriptKey
  minigame: MinigameKey
  sectionName: string | null
  completedAt: string
  rounds: number
  correct: number
  wrong: number
  accuracy: number
  points: number
  targetItems: number
  goalCompletionPct: number
  goalDelta: number
  livesEnabled: boolean
  livesRemaining: number
  livesLost: number
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  confidenceCapturedCount: number
  averageConfidenceScore: number | null
}
interface AssistantStatePayload {
  mood: string
  momentum: number
  confidence_level: number
  focus_area: string
  last_major_event: string
}
interface AssistantProfilePayload {
  persona_style: string
  popup_cadence: string
  emotion_persistence: string
  llm_backend: string
  chat_retention: string
  updated_at_utc: string
}
interface AssistantEventPayload {
  id: number
  event_type: string
  priority: 'info' | 'coaching' | 'critical' | 'celebration'
  message_key: string
  metadata: Record<string, string>
}
interface AssistantToast {
  id: number
  priority: AssistantEventPayload['priority']
  title: string
  body: string
}
type BlockInfo = Awaited<ReturnType<typeof window.jplearnDesktop.getBlockProgress>>['blocks'][number]
type JlptProgressCard = Pick<ScriptDeck['cards'][number], 'id' | 'character' | 'tags'>
type OverviewKanjiCard = OverviewCharacterMasteryPayload['kanji_cards'][number]
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5' | 'vocab_n5' | 'grammar_patterns'
type KanjiDeckSlug = 'kanji_n5' | 'kanji_n4' | 'kanji_n3' | 'kanji_n2' | 'kanji_n1'
type VocabDeckSlug = 'vocab_n5' | 'vocab_n4' | 'vocab_n3' | 'vocab_n2' | 'vocab_n1'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'stroke_order' | 'typed_recall' | 'context_cloze' | 'narrative_story' | 'interleave_mix'
type PlayableMinigame = Exclude<MinigameKey, 'interleave_mix'>
type ShortcutSubmenuKey = 'all_maps' | ScriptKey
type InterleaveWeights = Record<'romaji_sprint' | 'meaning_match' | 'character_match' | 'context_cloze', number>
type AppView = 'home' | 'script_hub' | 'minigame' | 'overview'
type NavDirection = 'forward' | 'back'
type FontSize = 'small' | 'medium' | 'large'
type AnimationStyle = 'calm_fade' | 'glide' | 'lively'
type BackgroundStyle =
  | 'classic_scene'
  | 'fuji_view'
  | 'torii_gate'
  | 'temple_reflection'
  | 'garden_bridge'
  | 'autumn_pond'
type FeedbackTone = 'success' | 'error' | null
type ExpertiseLevel = 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation'
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
  | 'harbor_mist_light'
  | 'sakura_dawn_light'
  | 'sunset_lacquer_light'
  | 'midnight_neon_light'
  | 'paper_crane_light'
  | 'ember_night_light'
  | 'forest_ink_light'
  | 'ocean_glass_light'
  | 'plum_garden_light'
  | 'matcha_stone_light'
type ThemeMode = 'dark' | 'light'

const FEEDBACK_REVEAL_MS = 2100
const ASSISTANT_EVENT_POLL_MS = 15000
const ASSISTANT_TOAST_TTL_MS = 5200
const ASSISTANT_MAX_TOASTS = 4
const DEFAULT_LIVES = 3
const SESSION_LENGTH_PRESETS = [
  { key: 'short', label: 'Short', items: 8, icon: Minus },
  { key: 'medium', label: 'Medium', items: 12, icon: Square },
  { key: 'long', label: 'Long', items: 20, icon: Plus },
] as const
const DEFAULT_SESSION_LENGTH_PRESET = SESSION_LENGTH_PRESETS[1]
const DEFAULT_INTERLEAVE_WEIGHTS: InterleaveWeights = {
  romaji_sprint: 1,
  meaning_match: 1,
  character_match: 1,
  context_cloze: 1,
}
const POINT_COMBO_THRESHOLDS = [3, 6, 9] as const
const POINTS_RULE_COPY = '1 point per correct answer, with combo bonuses at streaks 3, 6, and 9 (max 4 points).'
const CONFIDENCE_SCORES = [1, 3, 5] as const
const CONFIDENCE_LEVEL_LABELS: Record<(typeof CONFIDENCE_SCORES)[number], string> = {
  1: 'Low',
  3: 'Mid',
  5: 'High',
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
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Typed Recall: write the meaning from memory with clean spelling.',
      'No options this round: recall first, then type confidently.',
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
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Typed Recall: write the exact meaning from memory.',
      'No hints mode: type what the prompt means in one shot.',
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
    stroke_order: [
      'Writing Trace: start from the meaning and rebuild the character.',
      'Stroke Path: picture the order before you type the kanji.',
    ],
    typed_recall: [
      'Concept Recall: type the meaning directly without choices.',
      'Kanji Memory: commit one meaning and type it exactly.',
    ],
    context_cloze: [
      'Semantic Context: use nearby clues to fill the blank.',
      'N5 Sentence Drill: infer first, then commit to one meaning.',
    ],
    narrative_story: [
      'Story Scene: read the situation and resolve the missing idea.',
      'Scene Pulse: infer from the narrative shift before choosing.',
    ],
  },
  vocab_n5: {
    romaji_sprint: [
      'Word Recall: read the vocab item and type the reading cleanly.',
      'Sound-to-Word: lock pronunciation before typing.',
    ],
    meaning_match: [
      'Word Sense: choose the exact English meaning.',
      'Precision Match: avoid near-synonyms and commit.',
    ],
    character_match: [
      'Word Form: choose the Japanese form for the meaning.',
      'Lexical Link: pick the correct written word.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Meaning Recall: type the word meaning from memory.',
      'Precision Recall: type the best English gloss directly.',
    ],
    context_cloze: [
      'Usage Context: use sentence context to place the right word.',
      'Meaning-in-Use: infer from surrounding clues first.',
    ],
    narrative_story: [
      'Scene Choice: complete the mini situation with the right word.',
      'Story Fit: pick the option that best matches the scene.',
    ],
  },
  grammar_patterns: {
    romaji_sprint: [
      'Pattern Read: confirm reading and type with confidence.',
      'Structure Sound: hear the phrase in your head, then type.',
    ],
    meaning_match: [
      'Grammar Sense: choose the best function or meaning.',
      'Pattern Intent: decide what nuance this structure carries.',
    ],
    character_match: [
      'Pattern Form: select the Japanese pattern for this intent.',
      'Structure Recall: pick the exact expression form.',
    ],
    stroke_order: [
      'Stroke Trace: picture the write order before you answer.',
      'Form First: rebuild the symbol one part at a time.',
    ],
    typed_recall: [
      'Pattern Recall: type the intended meaning in your own words.',
      'Grammar Recall: type what this expression conveys.',
    ],
    context_cloze: [
      'Sentence Pattern: complete the line with the right structure.',
      'Grammar in Context: infer role and choose the best fit.',
    ],
    narrative_story: [
      'Dialogue Scene: choose the pattern that fits the exchange.',
      'Conversational Fit: select the structure that sounds natural.',
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
      'Beginner line: The kana {character} is read as ___.',
      'Warm-up sentence: When I see {character}, I answer ___.',
    ],
    2: [
      'Context line: During reading practice, {character} maps to ___.',
      'Focus sentence: I recognized {character} and chose ___.',
    ],
    3: [
      'Challenge line: Under pressure, {character} still means ___.',
      'Advanced cue: In mixed review, {character} appeared and I picked ___.',
    ],
  },
  katakana: {
    1: [
      'Beginner line: The katakana {character} is read as ___.',
      'Warm-up sentence: For {character}, the correct reading is ___.',
    ],
    2: [
      'Context line: In a loanword drill, {character} maps to ___.',
      'Focus sentence: I saw {character} in context and selected ___.',
    ],
    3: [
      'Challenge line: Fast recognition of {character} still pointed to ___.',
      'Advanced cue: In noisy context, {character} still resolved to ___.',
    ],
  },
  kanji_n5: {
    1: [
      'Beginner line: The kanji {character} is best understood as ___.',
      'Warm-up sentence: In simple text, {character} fits as ___.',
    ],
    2: [
      'Context line: Sentence meaning points to {character} as ___.',
      'Focus sentence: With one clue missing, {character} completes it as ___.',
    ],
    3: [
      'Challenge line: Subtle context still links {character} to ___.',
      'Advanced cue: In a compressed phrase, {character} is interpreted as ___.',
    ],
  },
  vocab_n5: {
    1: [
      'Beginner line: The word {character} means ___.',
      'Warm-up sentence: For {character} ({romaji}), choose ___.',
    ],
    2: [
      'Context line: In this sentence, {character} contributes ___.',
      'Focus sentence: Usage clues show that {character} means ___.',
    ],
    3: [
      'Challenge line: Even in subtle context, {character} means ___.',
      'Advanced cue: Under pressure, {character} is still ___.',
    ],
  },
  grammar_patterns: {
    1: [
      'Beginner line: The pattern {character} is used for ___.',
      'Warm-up sentence: For {character} ({romaji}), the best meaning is ___.',
    ],
    2: [
      'Context line: This exchange calls for {character} to express ___.',
      'Focus sentence: The grammar cue {character} signals ___.',
    ],
    3: [
      'Challenge line: In nuanced dialogue, {character} still conveys ___.',
      'Advanced cue: The most natural reading of {character} here is ___.',
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
        'A ticket note uses {character}, so the missing meaning is ___.',
        'In the final itinerary line, {character} is best read as ___.',
      ],
    },
  },
  vocab_n5: {
    1: {
      title: 'Chapter 1: First Conversation',
      lines: [
        'At introductions, the word {character} completes this line as ___.',
        'A beginner exchange needs {character}; pick ___ to finish it.',
      ],
    },
    2: {
      title: 'Chapter 2: Daily Routine',
      lines: [
        'In a daily routine scene, {character} fits the blank as ___.',
        'The routine sentence sounds natural only if {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Weekend Plans',
      lines: [
        'Planning with friends uses {character}; choose ___ to complete it.',
        'The weekend plan line points to {character} meaning ___.',
      ],
    },
  },
  grammar_patterns: {
    1: {
      title: 'Chapter 1: Polite Basics',
      lines: [
        'A polite reply uses {character}, so the blank should be ___.',
        'This polite scene hinges on {character}; pick ___.',
      ],
    },
    2: {
      title: 'Chapter 2: Requests and Reasons',
      lines: [
        'A request sentence uses {character} to express ___ here.',
        'The reason-giving line sounds right when {character} means ___.',
      ],
    },
    3: {
      title: 'Chapter 3: Natural Conversation',
      lines: [
        'In natural dialogue, {character} conveys ___ in this scene.',
        'The final conversation line depends on {character} meaning ___.',
      ],
    },
  },
}

interface AppSettings {
  reducedMotion: boolean
  fontSize: FontSize
  themeMode: ThemeMode
  theme: ThemeKey
  motionStyle: AnimationStyle
  backgroundStyle: BackgroundStyle
  backgroundBlur: number
}

interface RoundOption {
  id: string
  label: string
}

interface RoundState {
  cardId: number
  mode: PlayableMinigame
  audioText: string
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

type JlptLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'

interface JlptLevelProgress {
  key: JlptLevel
  label: string
  cardIds: number[]
  sampleChars: string[]
  mastery: number
  unlocked: boolean
  total: number
}

interface StudyPlanCoverageRow {
  key: ScriptKey
  label: string
  mastery: number
  total: number
  unlocked: boolean
  difficulty: number
}

type StudyPlanStage = 'starter' | 'building' | 'advanced'

interface StudyPlanShortcut {
  key: string
  label: string
  note: string
  script: ScriptKey
  minigame: MinigameKey
}

interface StudyPlanSnapshot {
  coverageRows: StudyPlanCoverageRow[]
  focusRows: StudyPlanCoverageRow[]
  overallMastery: number
  recommendedMinutes: number
  sessionNote: string
  learnerStage: StudyPlanStage
  shortcutRows: StudyPlanShortcut[]
}

type StatsByScript = Record<ScriptKey, ScriptStats>
type MinigameStatsByScript = Record<ScriptKey, Record<MinigameKey, MinigameStats>>
type OverviewSectionKey = 'studyActivity' | 'contextClozeCurriculum' | 'storyProgress' | 'mistakeBreakdown' | 'itemTimeline' | 'deckSnapshot'

const ALL_SCRIPT_KEYS = ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns'] as const

const SCRIPT_LABELS: Record<ScriptKey, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
  vocab_n5: 'Words',
  grammar_patterns: 'Conversational',
}

const TIMELINE_SCRIPT_LABELS: Record<string, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
  vocab_n5: 'Words',
  grammar_patterns: 'Conversational',
  unknown: 'General',
}

function toTitleWords(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatTimelineScriptTag(tag: string): string {
  const normalized = tag.trim().toLowerCase()
  return TIMELINE_SCRIPT_LABELS[normalized] ?? toTitleWords(normalized || 'general')
}

function formatTimelineDeckName(deckName: string): string {
  const trimmed = deckName.trim()
  if (!trimmed) return 'Review Deck'
  return toTitleWords(trimmed)
}

const SCRIPT_MENU_LINES: Record<ScriptKey, string> = {
  hiragana: 'Start with smooth, foundational sounds.',
  katakana: 'Train sharp symbols for names and loanwords.',
  kanji_n5: 'Build meaning recall one character at a time.',
  vocab_n5: 'Build practical vocabulary for daily usage.',
  grammar_patterns: 'Practice conversational patterns and sentence flow.',
}

const SCRIPT_DIFFICULTY_META: Record<ScriptKey, { label: string; tier: 1 | 2 | 3 | 4 | 5; icon: LucideIcon }> = {
  hiragana: { label: 'Easy', tier: 1, icon: BookText },
  katakana: { label: 'Easy+', tier: 2, icon: Languages },
  kanji_n5: { label: 'Medium', tier: 3, icon: Target },
  vocab_n5: { label: 'Hard', tier: 4, icon: Flame },
  grammar_patterns: { label: 'Expert', tier: 5, icon: Trophy },
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
    key: 'stroke_order',
    title: 'Stroke Order',
    description: 'Type the kanji from meaning while reinforcing writing sequence.',
  },
  {
    key: 'typed_recall',
    title: 'Typed Recall',
    description: 'Type the meaning directly with near-miss tolerance.',
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

const SCRIPT_MINIGAMES: Record<ScriptKey, MinigameKey[]> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match', 'interleave_mix'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match', 'interleave_mix'],
  kanji_n5: ['romaji_sprint', 'meaning_match', 'character_match', 'stroke_order', 'typed_recall', 'interleave_mix'],
  vocab_n5: ['meaning_match', 'character_match', 'typed_recall', 'context_cloze', 'narrative_story', 'interleave_mix'],
  grammar_patterns: ['meaning_match', 'character_match', 'typed_recall', 'context_cloze', 'narrative_story', 'interleave_mix'],
}

const SCRIPT_INTERLEAVE_MODES: Record<ScriptKey, Array<keyof InterleaveWeights>> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match'],
  kanji_n5: ['romaji_sprint', 'meaning_match', 'character_match'],
  vocab_n5: ['meaning_match', 'character_match', 'context_cloze'],
  grammar_patterns: ['meaning_match', 'character_match', 'context_cloze'],
}

const SECTION_META: Record<ScriptKey, { glyph: string }> = {
  hiragana: { glyph: 'あ' },
  katakana: { glyph: 'ア' },
  kanji_n5: { glyph: '漢' },
  vocab_n5: { glyph: '語' },
  grammar_patterns: { glyph: '話' },
}

const MINIGAME_ICONS: Record<MinigameKey, LucideIcon> = {
  romaji_sprint: Keyboard,
  meaning_match: ListChecks,
  character_match: Languages,
  stroke_order: Keyboard,
  typed_recall: Keyboard,
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

const THEME_OPTIONS: Array<{ key: ThemeKey; label: string; mode: ThemeMode }> = [
  { key: 'harbor_mist', label: 'Harbor Mist', mode: 'dark' },
  { key: 'sakura_dawn', label: 'Sakura Dawn', mode: 'dark' },
  { key: 'forest_ink', label: 'Forest Ink', mode: 'dark' },
  { key: 'sunset_lacquer', label: 'Sunset Lacquer', mode: 'dark' },
  { key: 'midnight_neon', label: 'Midnight Neon', mode: 'dark' },
  { key: 'paper_crane', label: 'Paper Crane', mode: 'dark' },
  { key: 'matcha_stone', label: 'Matcha Stone', mode: 'dark' },
  { key: 'ocean_glass', label: 'Ocean Glass', mode: 'dark' },
  { key: 'ember_night', label: 'Ember Night', mode: 'dark' },
  { key: 'plum_garden', label: 'Plum Garden', mode: 'dark' },
  { key: 'harbor_mist_light', label: 'Harbor Mist Light', mode: 'light' },
  { key: 'sakura_dawn_light', label: 'Sakura Dawn Light', mode: 'light' },
  { key: 'sunset_lacquer_light', label: 'Sunset Lacquer Light', mode: 'light' },
  { key: 'midnight_neon_light', label: 'Midnight Neon Light', mode: 'light' },
  { key: 'paper_crane_light', label: 'Paper Crane Light', mode: 'light' },
  { key: 'ember_night_light', label: 'Ember Night Light', mode: 'light' },
  { key: 'forest_ink_light', label: 'Forest Ink Light', mode: 'light' },
  { key: 'ocean_glass_light', label: 'Ocean Glass Light', mode: 'light' },
  { key: 'plum_garden_light', label: 'Plum Garden Light', mode: 'light' },
  { key: 'matcha_stone_light', label: 'Matcha Stone Light', mode: 'light' },
]

const THEME_MODE_SECTIONS: Array<{ key: ThemeMode; label: string }> = [
  { key: 'dark', label: 'Dark Mode' },
  { key: 'light', label: 'Light Mode' },
]

const DEFAULT_THEME_BY_MODE: Record<ThemeMode, ThemeKey> = {
  dark: 'harbor_mist',
  light: 'harbor_mist_light',
}

const THEME_MODE_ICON: Record<ThemeMode, LucideIcon> = {
  dark: Moon,
  light: Sun,
}

const THEME_SWATCH_ACCENT: Record<ThemeKey, string> = {
  harbor_mist: '#7bc5df',
  sakura_dawn: '#ffb1bf',
  forest_ink: '#89d0a4',
  sunset_lacquer: '#ffab73',
  midnight_neon: '#79d5ff',
  paper_crane: '#d4a57d',
  matcha_stone: '#b6d387',
  ocean_glass: '#7ed4d0',
  ember_night: '#ff9a6a',
  plum_garden: '#c89cff',
  harbor_mist_light: '#69abc4',
  sakura_dawn_light: '#e48ea2',
  sunset_lacquer_light: '#dd8c62',
  midnight_neon_light: '#66a8d6',
  paper_crane_light: '#b8906d',
  ember_night_light: '#d8836f',
  forest_ink_light: '#74b591',
  ocean_glass_light: '#63b9b3',
  plum_garden_light: '#ae86e6',
  matcha_stone_light: '#9fbf70',
}

const THEME_KEY_SET = new Set<ThemeKey>(THEME_OPTIONS.map((theme) => theme.key))

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && THEME_KEY_SET.has(value as ThemeKey)
}

function getThemeModeForTheme(theme: ThemeKey): ThemeMode {
  const themeOption = THEME_OPTIONS.find((option) => option.key === theme)
  return themeOption?.mode ?? 'dark'
}

function getFallbackThemeForMode(mode: ThemeMode): ThemeKey {
  const firstTheme = THEME_OPTIONS.find((theme) => theme.mode === mode)
  return firstTheme?.key ?? DEFAULT_THEME_BY_MODE.dark
}

const FONT_SIZE_ORDER: FontSize[] = ['small', 'medium', 'large']
const FONT_SIZE_ICON: Record<FontSize, LucideIcon> = {
  small: Minus,
  medium: Square,
  large: Plus,
}
const FONT_SIZE_LABEL: Record<FontSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

const MOTION_STYLE_OPTIONS: Array<{ key: AnimationStyle; label: string }> = [
  { key: 'calm_fade', label: 'Calm Fade' },
  { key: 'glide', label: 'Glide' },
  { key: 'lively', label: 'Lively' },
]

const MOTION_STYLE_LABEL: Record<AnimationStyle, string> = {
  calm_fade: 'Calm Fade',
  glide: 'Glide',
  lively: 'Lively',
}

const BACKGROUND_BLUR_MIN = 0
const BACKGROUND_BLUR_MAX = 12
const BACKGROUND_BLUR_DEFAULT = 4

const BACKGROUND_OPTIONS: Array<{
  key: BackgroundStyle
  label: string
  note: string
  imagePath?: string
}> = [
  {
    key: 'classic_scene',
    label: 'No Background',
    note: 'Uses a neutral app background with no image overlay.',
  },
  {
    key: 'fuji_view',
    label: 'Fuji Outlook',
    note: 'Pagoda and mountain skyline.',
    imagePath: 'backgrounds/fuji.jpg',
  },
  {
    key: 'torii_gate',
    label: 'Water Torii',
    note: 'Floating torii at dusk on calm water.',
    imagePath: 'backgrounds/torii.jpg',
  },
  {
    key: 'temple_reflection',
    label: 'Temple Reflection',
    note: 'Temple architecture mirrored in still water.',
    imagePath: 'backgrounds/house.jpg',
  },
  {
    key: 'garden_bridge',
    label: 'Garden Bridge',
    note: 'Red bridge across deep green garden water.',
    imagePath: 'backgrounds/bridge.jpg',
  },
  {
    key: 'autumn_pond',
    label: 'Autumn Pond',
    note: 'Warm maple tones and morning light rays.',
    imagePath: 'backgrounds/lake.jpg',
  },
]

const JLPT_LEVEL_ORDER: JlptLevel[] = ['n5', 'n4', 'n3', 'n2', 'n1']
const JLPT_LEVEL_LABELS: Record<JlptLevel, string> = {
  n5: 'JLPT N5',
  n4: 'JLPT N4',
  n3: 'JLPT N3',
  n2: 'JLPT N2',
  n1: 'JLPT N1',
}
const KANJI_LEVEL_TO_DECK_SLUG: Record<JlptLevel, KanjiDeckSlug> = {
  n5: 'kanji_n5',
  n4: 'kanji_n4',
  n3: 'kanji_n3',
  n2: 'kanji_n2',
  n1: 'kanji_n1',
}
const VOCAB_LEVEL_TO_DECK_SLUG: Record<JlptLevel, VocabDeckSlug> = {
  n5: 'vocab_n5',
  n4: 'vocab_n4',
  n3: 'vocab_n3',
  n2: 'vocab_n2',
  n1: 'vocab_n1',
}
const KANJI_OVERVIEW_PAGE_SIZE = 45

function MinigameIcon({ game }: { game: MinigameKey }) {
  const Icon = MINIGAME_ICONS[game]
  return <Icon aria-hidden="true" className="glyph-svg" strokeWidth={2.25} />
}

const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'
const SETTINGS_STORAGE_KEY = 'jplearn-desktop-settings-v1'
const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'
const SUMMARY_SNAPSHOT_STORAGE_KEY = 'jplearn-desktop-summary-snapshot-v1'
const SUMMARY_SNAPSHOT_MAX_AGE_MS = 20 * 60 * 1000
const EXPERTISE_STORAGE_KEY = 'jplearn-first-startup-expertise-v1'
const CARD_MASTERY_MAX = 4 // Max score per card; reach this to fully master a card.

const EXPERTISE_OPTIONS: Array<{ level: ExpertiseLevel; title: string; description: string }> = [
  {
    level: 'total_beginner',
    title: 'I am starting from scratch',
    description: 'No decks are pre-completed. You start at lesson one.',
  },
  {
    level: 'know_hiragana',
    title: 'I can already read hiragana',
    description: 'Completes the Hiragana deck only.',
  },
  {
    level: 'know_kana',
    title: 'I can read hiragana and katakana',
    description: 'Completes both Kana decks.',
  },
  {
    level: 'jlpt_n5_foundation',
    title: 'I already know JLPT N5 basics',
    description: 'Completes Hiragana, Katakana, N5 Kanji, and N5 Vocabulary.',
  },
]

const EXPERTISE_LEVEL_TO_SCRIPT_KEYS: Record<ExpertiseLevel, ScriptKey[]> = {
  total_beginner: [],
  know_hiragana: ['hiragana'],
  know_kana: ['hiragana', 'katakana'],
  jlpt_n5_foundation: ['hiragana', 'katakana', 'kanji_n5', 'vocab_n5'],
}

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
    vocab_n5: { ...EMPTY_SCRIPT_STATS },
    grammar_patterns: { ...EMPTY_SCRIPT_STATS },
  }
}

function defaultMinigameStatsByScript(): MinigameStatsByScript {
  return {
    hiragana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    katakana: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    kanji_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    vocab_n5: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
      context_cloze: { ...EMPTY_MINIGAME_STATS },
      narrative_story: { ...EMPTY_MINIGAME_STATS },
      interleave_mix: { ...EMPTY_MINIGAME_STATS },
    },
    grammar_patterns: {
      romaji_sprint: { ...EMPTY_MINIGAME_STATS },
      meaning_match: { ...EMPTY_MINIGAME_STATS },
      character_match: { ...EMPTY_MINIGAME_STATS },
      stroke_order: { ...EMPTY_MINIGAME_STATS },
      typed_recall: { ...EMPTY_MINIGAME_STATS },
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
      vocab_n5: { ...EMPTY_SCRIPT_STATS, ...(parsed.vocab_n5 ?? {}) },
      grammar_patterns: { ...EMPTY_SCRIPT_STATS, ...(parsed.grammar_patterns ?? {}) },
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
    themeMode: 'dark',
    theme: 'harbor_mist',
    motionStyle: 'glide',
    backgroundStyle: 'classic_scene',
    backgroundBlur: BACKGROUND_BLUR_DEFAULT,
  }
}

function isBackgroundStyle(value: unknown): value is BackgroundStyle {
  return (
    value === 'classic_scene' ||
    value === 'fuji_view' ||
    value === 'torii_gate' ||
    value === 'temple_reflection' ||
    value === 'garden_bridge' ||
    value === 'autumn_pond'
  )
}

function clampBackgroundBlur(value: number): number {
  return Math.max(BACKGROUND_BLUR_MIN, Math.min(BACKGROUND_BLUR_MAX, Math.round(value)))
}

function resolveBackgroundImageUrl(imagePath: string): string {
  if (typeof window === 'undefined') return imagePath
  try {
    return new URL(imagePath, window.location.href).toString()
  } catch {
    return imagePath
  }
}

function createBackgroundPreviewDataUrl(source: HTMLImageElement, width: number, height: number): string | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const targetRatio = width / height
  const sourceRatio = sourceWidth / sourceHeight

  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = Math.round(sourceHeight * targetRatio)
    sx = Math.round((sourceWidth - sw) / 2)
  } else if (sourceRatio < targetRatio) {
    sh = Math.round(sourceWidth / targetRatio)
    sy = Math.round((sourceHeight - sh) / 2)
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)

  try {
    return canvas.toDataURL('image/webp', 0.72)
  } catch {
    return canvas.toDataURL('image/jpeg', 0.78)
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const defaults = defaultSettings()
    const parsedMode = isThemeMode(parsed.themeMode) ? parsed.themeMode : null
    const parsedTheme = isThemeKey(parsed.theme) ? parsed.theme : null
    const normalizedMode = parsedMode ?? (parsedTheme ? getThemeModeForTheme(parsedTheme) : defaults.themeMode)
    const normalizedTheme = parsedTheme && getThemeModeForTheme(parsedTheme) === normalizedMode
      ? parsedTheme
      : getFallbackThemeForMode(normalizedMode)
    return {
      ...defaults,
      ...parsed,
      themeMode: normalizedMode,
      theme: normalizedTheme,
      backgroundStyle: isBackgroundStyle(parsed.backgroundStyle) ? parsed.backgroundStyle : defaults.backgroundStyle,
      backgroundBlur: typeof parsed.backgroundBlur === 'number' ? clampBackgroundBlur(parsed.backgroundBlur) : defaults.backgroundBlur,
    }
  } catch {
    return defaultSettings()
  }
}

type CardScores = Record<ScriptKey, Record<number, number>>

function loadCardScores(): CardScores {
  try {
    const raw = window.localStorage.getItem(CARD_SCORES_STORAGE_KEY)
    if (!raw) return { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {} }
    const parsed = JSON.parse(raw) as Partial<CardScores>
    return {
      hiragana: parsed.hiragana ?? {},
      katakana: parsed.katakana ?? {},
      kanji_n5: parsed.kanji_n5 ?? {},
      vocab_n5: parsed.vocab_n5 ?? {},
      grammar_patterns: parsed.grammar_patterns ?? {},
    }
  } catch {
    return { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {} }
  }
}

function loadSummarySnapshot(): StudySummaryPayload | null {
  try {
    const raw = window.localStorage.getItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      capturedAtUtc?: string
      payload?: unknown
    }

    if (typeof parsed.capturedAtUtc !== 'string') {
      return null
    }

    const capturedMs = Date.parse(parsed.capturedAtUtc)
    if (!Number.isFinite(capturedMs) || Date.now() - capturedMs > SUMMARY_SNAPSHOT_MAX_AGE_MS) {
      window.localStorage.removeItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
      return null
    }

    if (!parsed.payload || typeof parsed.payload !== 'object') {
      return null
    }

    const payload = parsed.payload as { decks?: unknown }
    if (!Array.isArray(payload.decks)) {
      return null
    }

    return parsed.payload as StudySummaryPayload
  } catch {
    return null
  }
}

function saveSummarySnapshot(payload: StudySummaryPayload): void {
  try {
    window.localStorage.setItem(
      SUMMARY_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        capturedAtUtc: new Date().toISOString(),
        payload,
      }),
    )
  } catch {
    // Non-fatal: startup can continue even if local snapshot writes fail.
  }
}

function normalizeDeckCards(cards: unknown): ScriptDeck['cards'] {
  return Array.isArray(cards) ? cards as ScriptDeck['cards'] : []
}

function normalizeBlockList(blocks: unknown): BlockInfo[] {
  return Array.isArray(blocks) ? blocks as BlockInfo[] : []
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeTypedText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function isTransposition(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  const diffs: number[] = []
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) diffs.push(index)
  }
  if (diffs.length !== 2) return false
  const [i, j] = diffs
  return left[i] === right[j] && left[j] === right[i]
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  let previousRow: number[] = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const currentRow: number[] = [i]
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1
      currentRow[j] = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + substitutionCost,
      )
    }
    previousRow = currentRow
  }
  return previousRow[right.length]
}

type TypedAnswerState = 'exact' | 'near_miss' | 'incorrect'

function assessTypedAnswer(expected: string, given: string): TypedAnswerState {
  const normalizedExpected = normalizeTypedText(expected)
  const normalizedGiven = normalizeTypedText(given)
  if (!normalizedExpected || !normalizedGiven) return 'incorrect'
  if (normalizedExpected === normalizedGiven) return 'exact'

  const distance = levenshteinDistance(normalizedExpected, normalizedGiven)
  const minLength = Math.min(normalizedExpected.length, normalizedGiven.length)
  const nearMiss =
    distance <= 1 ||
    isTransposition(normalizedExpected, normalizedGiven) ||
    (distance === 2 && minLength >= 6)

  return nearMiss ? 'near_miss' : 'incorrect'
}

function sanitizeRomajiInput(value: string): string {
  return value.replace(/[^a-zA-Z\s]/g, '')
}

function normalizeRomajiQuery(value: string): string {
  return sanitizeRomajiInput(value).toLowerCase().trim()
}

function getStrokeOrderCandidates(cards: ScriptDeck['cards'], query: string): ScriptDeck['cards'] {
  const normalizedQuery = normalizeRomajiQuery(query)
  if (normalizedQuery.length === 0) return []

  return cards
    .filter((card) => normalizeRomajiQuery(card.romaji).includes(normalizedQuery))
    .sort((left, right) => {
      const leftRomaji = normalizeRomajiQuery(left.romaji)
      const rightRomaji = normalizeRomajiQuery(right.romaji)
      const leftExact = leftRomaji === normalizedQuery ? 1 : 0
      const rightExact = rightRomaji === normalizedQuery ? 1 : 0
      if (leftExact !== rightExact) return rightExact - leftExact
      return left.character.localeCompare(right.character, 'ja')
    })
    .slice(0, 8)
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

function buildInterleaveSequence(
  weights: InterleaveWeights,
  allowedModes: Array<keyof InterleaveWeights>,
): PlayableMinigame[] {
  const sequence: PlayableMinigame[] = []
  for (const mode of allowedModes) {
    const count = clampWeight(weights[mode])
    for (let i = 0; i < count; i += 1) {
      sequence.push(mode)
    }
  }
  return sequence.length > 0 ? sequence : allowedModes
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

function applyCardTemplate(template: string, card: ScriptDeck['cards'][number]): string {
  return template
    .replaceAll('{character}', card.character)
    .replaceAll('{romaji}', card.romaji)
    .replaceAll('{meaning}', card.meaning)
}

function buildClozeLine(script: ScriptKey, stage: 1 | 2 | 3, seed: number, card: ScriptDeck['cards'][number]): string {
  const templates = CLOZE_TEMPLATES[script][stage]
  return applyCardTemplate(templates[Math.abs(seed) % templates.length], card)
}

function buildStoryChapter(script: ScriptKey, stage: 1 | 2 | 3, seed: number, card: ScriptDeck['cards'][number]): { title: string; line: string } {
  const chapter = STORY_CHAPTERS[script][stage]
  return {
    title: chapter.title,
    line: applyCardTemplate(chapter.lines[Math.abs(seed) % chapter.lines.length], card),
  }
}

function narrativePriorityCards(cards: ScriptDeck['cards']): ScriptDeck['cards'] {
  const stage3 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 3)
  if (stage3.length > 0) return stage3
  const stage2 = cards.filter((card) => normalizeCurriculumStage(card.curriculum_stage) === 2)
  if (stage2.length > 0) return stage2
  return cards
}

function jlptTagFromCard(card: Pick<ScriptDeck['cards'][number], 'tags'>): JlptLevel {
  for (const tag of card.tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized === 'n5' || normalized === 'n4' || normalized === 'n3' || normalized === 'n2' || normalized === 'n1') {
      return normalized
    }
  }
  return 'n5'
}

function buildJlptLevelProgress(cards: JlptProgressCard[], scores: Record<number, number>): JlptLevelProgress[] {
  let canUnlockNext = true
  return JLPT_LEVEL_ORDER.map((level) => {
    const levelCards = cards.filter((card) => jlptTagFromCard(card) === level)
    const total = levelCards.length
    const totalScore = levelCards.reduce((sum, card) => sum + (scores[card.id] ?? 0), 0)
    const mastery = total > 0 ? totalScore / (CARD_MASTERY_MAX * total) : 0
    const unlocked = total > 0 && canUnlockNext
    if (total > 0 && mastery < 0.8) {
      canUnlockNext = false
    }
    return {
      key: level,
      label: JLPT_LEVEL_LABELS[level],
      cardIds: levelCards.map((card) => card.id),
      sampleChars: levelCards.slice(0, 3).map((card) => card.character),
      mastery,
      unlocked,
      total,
    }
  })
}

function buildJlptLevelProgressFromLevelDecks(
  levelDecks: Record<JlptLevel, ScriptDeck['cards']>,
  scores: Record<number, number>,
): JlptLevelProgress[] {
  let canUnlockNext = true
  return JLPT_LEVEL_ORDER.map((level) => {
    const levelCards = levelDecks[level]
    const total = levelCards.length
    const totalScore = levelCards.reduce((sum, card) => sum + (scores[card.id] ?? 0), 0)
    const mastery = total > 0 ? totalScore / (CARD_MASTERY_MAX * total) : 0
    const unlocked = total > 0 && canUnlockNext
    if (total > 0 && mastery < 0.8) {
      canUnlockNext = false
    }
    return {
      key: level,
      label: JLPT_LEVEL_LABELS[level],
      cardIds: levelCards.map((card) => card.id),
      sampleChars: levelCards.slice(0, 3).map((card) => card.character),
      mastery,
      unlocked,
      total,
    }
  })
}

function getStudyPlanStage(overallMastery: number, trackedCards: number, currentStreak: number): StudyPlanStage {
  if (trackedCards < 12 || currentStreak < 2 || overallMastery < 0.25) return 'starter'
  if (overallMastery < 0.65) return 'building'
  return 'advanced'
}

function getStudyPlanShortcutMinigame(row: StudyPlanCoverageRow, stage: StudyPlanStage, index: number): MinigameKey {
  if (row.key === 'hiragana' || row.key === 'katakana') {
    if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
    if (stage === 'building') return index === 0 ? 'character_match' : 'romaji_sprint'
    return index === 0 ? 'interleave_mix' : 'character_match'
  }

  if (row.key === 'kanji_n5') {
    if (stage === 'starter') return index === 0 ? 'character_match' : 'meaning_match'
    if (stage === 'building') return index === 0 ? 'character_match' : 'typed_recall'
    return index === 0 ? 'typed_recall' : 'stroke_order'
  }

  if (row.key === 'vocab_n5') {
    if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
    if (stage === 'building') return index === 0 ? 'typed_recall' : 'context_cloze'
    return index === 0 ? 'context_cloze' : 'narrative_story'
  }

  if (stage === 'starter') return index === 0 ? 'meaning_match' : 'character_match'
  if (stage === 'building') return index === 0 ? 'context_cloze' : 'typed_recall'
  return index === 0 ? 'narrative_story' : 'context_cloze'
}

function getStudyPlanTargetMastery(script: ScriptKey): number {
  if (script === 'hiragana') return 0.9
  if (script === 'katakana') return 0.85
  if (script === 'kanji_n5') return 0.72
  if (script === 'vocab_n5') return 0.72
  return 0.68
}

function aggregateDeckMastery(
  decks: StudySummaryPayload['decks'],
  predicate: (slug: string) => boolean,
): { mastery: number; total: number } {
  const matchingDecks = decks.filter((deck) => predicate(deck.slug))
  const total = matchingDecks.reduce((sum, deck) => sum + deck.total, 0)
  if (total <= 0) {
    return { mastery: 0, total: 0 }
  }
  const mastered = matchingDecks.reduce((sum, deck) => sum + deck.mastered, 0)
  return {
    mastery: mastered / total,
    total,
  }
}

function aggregateJlptMastery(levels: JlptLevelProgress[]): { mastery: number; total: number } {
  const total = levels.reduce((sum, row) => sum + row.total, 0)
  if (total <= 0) {
    return { mastery: 0, total: 0 }
  }
  const weighted = levels.reduce((sum, row) => sum + (row.mastery * row.total), 0)
  return {
    mastery: weighted / total,
    total,
  }
}

function buildStudyPlan(
  decks: StudySummaryPayload['decks'],
  kanjiLevels: JlptLevelProgress[],
  vocabLevels: JlptLevelProgress[],
  weeklyActivity: StudySummaryPayload['activity'],
  currentStreak: number,
): StudyPlanSnapshot {
  const hiragana = aggregateDeckMastery(decks, (slug) => slug === 'hiragana')
  const katakana = aggregateDeckMastery(decks, (slug) => slug === 'katakana')
  const grammar = aggregateDeckMastery(decks, (slug) => slug === 'grammar_patterns')

  const kanjiFromDecks = aggregateDeckMastery(decks, (slug) => slug.startsWith('kanji_'))
  const vocabFromDecks = aggregateDeckMastery(decks, (slug) => slug.startsWith('vocab_'))
  const kanjiFallback = aggregateJlptMastery(kanjiLevels)
  const vocabFallback = aggregateJlptMastery(vocabLevels)

  const kanji = kanjiFromDecks.total > 0 ? kanjiFromDecks : kanjiFallback
  const vocab = vocabFromDecks.total > 0 ? vocabFromDecks : vocabFallback

  const hiraganaReady = hiragana.mastery >= 0.35
  const kanjiReady = hiragana.mastery >= 0.7 && katakana.mastery >= 0.45
  const vocabReady = hiragana.mastery >= 0.7 && katakana.mastery >= 0.55
  const grammarReady = vocab.mastery >= 0.45

  const coverageRows: StudyPlanCoverageRow[] = [
    {
      key: 'hiragana',
      label: SCRIPT_LABELS.hiragana,
      mastery: hiragana.mastery,
      total: hiragana.total,
      unlocked: true,
      difficulty: 0,
    },
    {
      key: 'katakana',
      label: SCRIPT_LABELS.katakana,
      mastery: katakana.mastery,
      total: katakana.total,
      unlocked: hiraganaReady,
      difficulty: 1,
    },
    {
      key: 'kanji_n5',
      label: SCRIPT_LABELS.kanji_n5,
      mastery: kanji.mastery,
      total: kanji.total,
      unlocked: kanjiReady,
      difficulty: 2,
    },
    {
      key: 'vocab_n5',
      label: SCRIPT_LABELS.vocab_n5,
      mastery: vocab.mastery,
      total: vocab.total,
      unlocked: vocabReady,
      difficulty: 3,
    },
    {
      key: 'grammar_patterns',
      label: SCRIPT_LABELS.grammar_patterns,
      mastery: grammar.mastery,
      total: grammar.total,
      unlocked: grammarReady,
      difficulty: 4,
    },
  ]

  const unlockedRows = coverageRows.filter((row) => row.unlocked)
  const needsWorkRows = unlockedRows.filter((row) => row.mastery < getStudyPlanTargetMastery(row.key))

  const focusRows = (needsWorkRows.length > 0 ? needsWorkRows : unlockedRows)
    .sort((left, right) => {
      if (Math.abs(left.mastery - right.mastery) > 0.06) {
        return left.mastery - right.mastery
      }
      return left.difficulty - right.difficulty
    })
    .slice(0, 3)

  const totalCards = coverageRows.reduce((sum, row) => sum + row.total, 0)
  const overallMastery = totalCards > 0
    ? coverageRows.reduce((sum, row) => sum + (row.mastery * row.total), 0) / totalCards
    : 0
  const learnerStage = getStudyPlanStage(overallMastery, totalCards, currentStreak)
  const recommendedMinutes = weeklyActivity.week.reviewed >= 24
    ? 20
    : weeklyActivity.week.reviewed >= 10
      ? 15
      : 10

  const sessionNote = focusRows.length > 0
    ? `Start with ${focusRows[0].label} and move to harder tracks after this block feels steady.`
    : currentStreak > 0
      ? `Keep the streak alive with a short mixed review.`
      : 'Build the plan after your first few rounds and it will highlight your weakest active track.'

  const shortcutRows = focusRows.slice(0, 3).map((row, index) => {
    const minigame = getStudyPlanShortcutMinigame(row, learnerStage, index)
    const script: ScriptKey = row.key
    const title = MINIGAMES.find((game) => game.key === minigame)?.title ?? minigame
    const stageLabel = learnerStage === 'starter'
      ? 'Starter-safe'
      : learnerStage === 'building'
        ? 'Build-up'
        : 'Advanced'

    return {
      key: `${row.key}-${minigame}-${index}`,
      label: title,
      note: `${row.label} · ${stageLabel} route`,
      script,
      minigame,
    }
  })

  return {
    coverageRows,
    focusRows,
    overallMastery,
    recommendedMinutes,
    sessionNote,
    learnerStage,
    shortcutRows,
  }
}

function calculateAwardedPoints(streakAfterCorrect: number): number {
  const comboBonus = POINT_COMBO_THRESHOLDS.reduce(
    (count, threshold) => count + (streakAfterCorrect >= threshold ? 1 : 0),
    0,
  )
  return 1 + comboBonus
}

function describeQueueLoad(remainingDue: number): string {
  if (remainingDue <= 0) return 'All caught up for now.'
  if (remainingDue <= DEFAULT_SESSION_LENGTH_PRESET.items) return 'Ready to clear in one short session.'
  if (remainingDue <= 60) return 'Enough queued for a few sessions.'
  return 'Long-term queue available; chip away in small runs.'
}

function formatAssistantMoodLabel(mood: string): string {
  if (mood === 'coach_celebratory') return 'Celebrating'
  if (mood === 'coach_supportive') return 'Supportive'
  if (mood === 'coach_alert') return 'On Alert'
  return 'Focused'
}

function formatAssistantEventTitle(event: AssistantEventPayload): string {
  if (event.event_type === 'session_goal_met') return 'Goal complete'
  if (event.event_type === 'streak_milestone') return 'Streak milestone'
  if (event.event_type === 'leech_intervention') return 'Tough items spotted'
  if (event.event_type === 'weakness_spike') return 'Practice recommendation'
  return 'Coach update'
}

function formatAssistantEventBody(event: AssistantEventPayload): string {
  if (event.message_key === 'coach.goal_met') {
    return 'Excellent run. Lock in the momentum with one short follow-up session.'
  }
  if (event.message_key === 'coach.streak_milestone') {
    const days = event.metadata.days ?? '0'
    return `${days}-day streak reached. Keep the chain alive with a quick review.`
  }
  if (event.message_key === 'coach.leech_intervention') {
    const count = event.metadata.leech_count ?? '0'
    return `${count} leech cards are active. Prioritize focused typed recall on weak prompts.`
  }
  if (event.message_key === 'coach.weakness_focus') {
    const focusArea = event.metadata.focus_area ?? 'general'
    const errorRate = event.metadata.error_rate ?? '0'
    return `Focus on ${focusArea}. Recent error rate is ${errorRate}% in this area.`
  }
  return 'Quick check-in: stay steady and finish this block cleanly.'
}

function App() {
  const [view, setView] = useState<AppView>('home')
  const [navDirection, setNavDirection] = useState<NavDirection>('forward')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(() => loadSummarySnapshot())
  const [error, setError] = useState<string | null>(null)
  const viewHistoryRef = useRef<AppView[]>(['home'])
  const viewHistoryIndexRef = useRef(0)
  const isHistoryNavigationRef = useRef(false)
  const [loading, setLoading] = useState<boolean>(() => loadSummarySnapshot() === null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [assistantState, setAssistantState] = useState<AssistantStatePayload | null>(null)
  const [assistantProfile, setAssistantProfile] = useState<AssistantProfilePayload | null>(null)
  const [assistantToasts, setAssistantToasts] = useState<AssistantToast[]>([])

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
  const [sessionTargetItems, setSessionTargetItems] = useState<number>(DEFAULT_SESSION_LENGTH_PRESET.items)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [lastSessionSummary, setLastSessionSummary] = useState<SessionSummaryPayload | null>(null)
  const [sessionRunReport, setSessionRunReport] = useState<SessionRunReport | null>(null)
  const [resumeRequest, setResumeRequest] = useState<{ script: ScriptKey; minigame: MinigameKey } | null>(null)
  const [sessionStartPending, setSessionStartPending] = useState<boolean>(false)
  const [sessionSummaryLoading, setSessionSummaryLoading] = useState<boolean>(false)
  const [sessionGoalError, setSessionGoalError] = useState<string | null>(null)
  const [livesEnabled, setLivesEnabled] = useState<boolean>(false)
  const [livesRemaining, setLivesRemaining] = useState<number>(DEFAULT_LIVES)
  const [leechFocusEnabled, setLeechFocusEnabled] = useState<boolean>(false)
  const [interleaveWeights] = useState<InterleaveWeights>({ ...DEFAULT_INTERLEAVE_WEIGHTS })
  const [interleaveSurpriseEnabled] = useState<boolean>(true)
  const [interleaveSurpriseEvery] = useState<number>(5)
  const [confidenceCaptureEnabled, setConfidenceCaptureEnabled] = useState<boolean>(false)
  const [roundConfidenceScore, setRoundConfidenceScore] = useState<number>(3)
  const [sessionConfidenceCount, setSessionConfidenceCount] = useState<number>(0)
  const [sessionConfidenceTotal, setSessionConfidenceTotal] = useState<number>(0)

  const [scriptStats, setScriptStats] = useState<StatsByScript>(() => loadSavedStats())
  const [minigameStats, setMinigameStats] = useState<MinigameStatsByScript>(() => defaultMinigameStatsByScript())
  const [cardScores, setCardScores] = useState<CardScores>(() => loadCardScores())
  const [overviewBlocks, setOverviewBlocks] = useState<Partial<Record<'hiragana' | 'katakana', BlockInfo[]>>>({})
  const [overviewKanjiDeck, setOverviewKanjiDeck] = useState<OverviewKanjiCard[]>([])
  const [activeKanjiLevel, setActiveKanjiLevel] = useState<JlptLevel>('n5')
  const [activeKanjiDeckSlug, setActiveKanjiDeckSlug] = useState<KanjiDeckSlug>('kanji_n5')
  const [activeVocabLevel, setActiveVocabLevel] = useState<JlptLevel>('n5')
  const [activeVocabDeckSlug, setActiveVocabDeckSlug] = useState<VocabDeckSlug>('vocab_n5')
  const [kanjiDeckCardsByLevel, setKanjiDeckCardsByLevel] = useState<Record<JlptLevel, ScriptDeck['cards']>>({
    n5: [],
    n4: [],
    n3: [],
    n2: [],
    n1: [],
  })
  const [vocabDeckCardsByLevel, setVocabDeckCardsByLevel] = useState<Record<JlptLevel, ScriptDeck['cards']>>({
    n5: [],
    n4: [],
    n3: [],
    n2: [],
    n1: [],
  })
  const [kanjiOverviewPage, setKanjiOverviewPage] = useState<Partial<Record<JlptLevel, number>>>({})
  const [overviewBlocksLoading, setOverviewBlocksLoading] = useState(false)
  const [charMasteryExpanded, setCharMasteryExpanded] = useState(false)
  const [expandedBlocks, setExpandedBlocks] = useState<string | null>(null)
  const [homeStudyPlanExpanded, setHomeStudyPlanExpanded] = useState(false)
  const [learningPathExpanded, setLearningPathExpanded] = useState(false)
  const [overviewSectionExpanded, setOverviewSectionExpanded] = useState<Record<OverviewSectionKey, boolean>>({
    studyActivity: false,
    contextClozeCurriculum: false,
    storyProgress: false,
    mistakeBreakdown: false,
    itemTimeline: false,
    deckSnapshot: false,
  })

  interface SelectedChar {
    character: string
    romaji: string
    meaning: string
    label: string
    score: number
  }
  const [selectedChar, setSelectedChar] = useState<SelectedChar | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showExpertisePrompt, setShowExpertisePrompt] = useState<boolean>(false)
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1)
  const [selectedExpertiseLevel, setSelectedExpertiseLevel] = useState<ExpertiseLevel>('total_beginner')
  const [applyingExpertise, setApplyingExpertise] = useState<boolean>(false)
  const [expertiseError, setExpertiseError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [backgroundPreviewUrls, setBackgroundPreviewUrls] = useState<Partial<Record<BackgroundStyle, string>>>({})
  const [resetConfirmStep, setResetConfirmStep] = useState<0 | 1 | 2>(0)
  const [resettingDb, setResettingDb] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [isWindowMaximized, setIsWindowMaximized] = useState(false)
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false)
  const [activeShortcutFlyout, setActiveShortcutFlyout] = useState<ShortcutSubmenuKey | null>(null)
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const shortcutsSectionRef = useRef<HTMLDivElement | null>(null)
  const shortcutMenuRef = useRef<HTMLDivElement | null>(null)
  const scriptLoadRequestIdRef = useRef<number>(0)
  const lastLoadedScriptRef = useRef<ScriptKey>('hiragana')
  const startupBootMarkRef = useRef<number>(performance.now())
  const startupFirstSummaryMsRef = useRef<number | null>(null)
  const startupReadySentRef = useRef(false)
  const previousSessionActiveRef = useRef(false)
  const kanjiLevelDeckCacheRef = useRef<Partial<Record<JlptLevel, ScriptDeck['cards']>>>({})
  const vocabLevelDeckCacheRef = useRef<Partial<Record<JlptLevel, ScriptDeck['cards']>>>({})
  const kanjiLevelBlockCacheRef = useRef<Partial<Record<JlptLevel, BlockInfo[]>>>({})
  const vocabLevelBlockCacheRef = useRef<Partial<Record<JlptLevel, BlockInfo[]>>>({})
  const deckCardsInFlightRef = useRef<Map<string, Promise<ScriptDeck>>>(new Map())
  const blockProgressInFlightRef = useRef<Map<string, Promise<BlockProgressPayload>>>(new Map())
  const roundCycleRef = useRef<number[]>([])
  const roundCursorRef = useRef<number>(0)
  const interleaveCursorRef = useRef<number>(0)
  const backgroundImageCacheRef = useRef<Partial<Record<BackgroundStyle, HTMLImageElement>>>({})
  const assistantSeenEventIdsRef = useRef<Set<number>>(new Set())
  const availableMinigames = useMemo(() => SCRIPT_MINIGAMES[activeScript], [activeScript])

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

  const availableThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => theme.mode === settings.themeMode),
    [settings.themeMode],
  )

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setSettings((prev) => {
      if (prev.themeMode === mode) return prev
      const currentThemeMode = getThemeModeForTheme(prev.theme)
      const nextTheme = currentThemeMode === mode ? prev.theme : getFallbackThemeForMode(mode)
      return {
        ...prev,
        themeMode: mode,
        theme: nextTheme,
      }
    })
  }, [])

  const activeDeckSlug = useMemo(() => {
    if (activeScript === 'kanji_n5') return activeKanjiDeckSlug
    if (activeScript === 'vocab_n5') return activeVocabDeckSlug
    return activeScript
  }, [activeKanjiDeckSlug, activeScript, activeVocabDeckSlug])

  const getDeckCardsDeduped = useCallback((slug: DeckSlugInput): Promise<ScriptDeck> => {
    const inFlight = deckCardsInFlightRef.current.get(slug)
    if (inFlight) return inFlight

    const request = window.jplearnDesktop.getDeckCards(slug).finally(() => {
      if (deckCardsInFlightRef.current.get(slug) === request) {
        deckCardsInFlightRef.current.delete(slug)
      }
    })
    deckCardsInFlightRef.current.set(slug, request)
    return request
  }, [])

  const getBlockProgressDeduped = useCallback((slug: DeckSlugInput): Promise<BlockProgressPayload> => {
    const inFlight = blockProgressInFlightRef.current.get(slug)
    if (inFlight) return inFlight

    const request = window.jplearnDesktop.getBlockProgress(slug).finally(() => {
      if (blockProgressInFlightRef.current.get(slug) === request) {
        blockProgressInFlightRef.current.delete(slug)
      }
    })
    blockProgressInFlightRef.current.set(slug, request)
    return request
  }, [])

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
      const queue = await window.jplearnDesktop.getStudyQueue(activeDeckSlug)
      roundCycleRef.current = buildQueueCycle(queue, sourceCards)
    } catch {
      roundCycleRef.current = [...Array(sourceCards.length).keys()]
    }
    roundCursorRef.current = 0
  }, [activeDeckSlug, buildQueueCycle, resetRoundCycle])

  const nextCardIndex = useCallback((cardsLength: number): number | null => {
    if (cardsLength <= 0) return null

    if (roundCycleRef.current.length !== cardsLength || roundCursorRef.current >= roundCycleRef.current.length) {
      return null
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
    document.documentElement.dataset.themeMode = settings.themeMode
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.motionStyle = settings.motionStyle
    void window.jplearnDesktop.setStartupTheme(settings.theme).catch(() => undefined)
  }, [settings])

  const activePetalStream = useMemo(() => {
    if (settings.reducedMotion || settings.motionStyle === 'calm_fade') return []
    const count = settings.motionStyle === 'lively' ? 14 : 10
    return PETAL_STREAM.slice(0, count)
  }, [settings.motionStyle, settings.reducedMotion])

  const showPetalLayer = activePetalStream.length > 0 && !(view === 'minigame' && sessionActive)

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
    if (window.localStorage.getItem(EXPERTISE_STORAGE_KEY) === 'done') return
    setShowExpertisePrompt(true)
  }, [])

  useEffect(() => {
    const onWindowStateChanged = window.jplearnDesktop.onWindowStateChanged
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
      isRoundResolving ||
      (roundState.mode !== 'romaji_sprint' && roundState.mode !== 'typed_recall')
    ) {
      return
    }

    const focusHandle = window.requestAnimationFrame(() => {
      answerInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(focusHandle)
  }, [isRoundResolving, roundState, sessionActive, view])

  useEffect(() => {
    const previouslyActive = previousSessionActiveRef.current
    previousSessionActiveRef.current = sessionActive

    if (!previouslyActive || sessionActive || !activeSessionId) return

    const completedRounds = sessionRounds
    const completedCorrect = sessionScore
    const completedWrong = Math.max(0, completedRounds - completedCorrect)
    const accuracy = completedRounds > 0 ? Math.round((completedCorrect / completedRounds) * 100) : 0
    const goalCompletionPct = sessionTargetItems > 0
      ? Math.min(999, Math.round((completedRounds / sessionTargetItems) * 100))
      : 0
    const goalDelta = completedRounds - sessionTargetItems
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
      targetItems: sessionTargetItems,
      goalCompletionPct,
      goalDelta,
      livesEnabled,
      livesRemaining,
      livesLost,
      leechFocusEnabled,
      confidenceCaptureEnabled,
      confidenceCapturedCount: sessionConfidenceCount,
      averageConfidenceScore,
    })

    setSessionSummaryLoading(true)
    setSessionGoalError(null)
    void window.jplearnDesktop
      .getSessionSummary(activeSessionId)
      .then((response) => {
        if (!response.ok || !response.summary) {
          setSessionGoalError(response.error ?? 'Unable to load session summary.')
          setLastSessionSummary(null)
          return
        }
        setLastSessionSummary(response.summary)
      })
      .catch((error: unknown) => {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to load session summary.')
        setLastSessionSummary(null)
      })
      .finally(() => {
        setSessionSummaryLoading(false)
      })
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
  ])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await window.jplearnDesktop.getStudySummary()
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

  const notifyStartupReady = useCallback((deferredLoadsQueuedAtMs?: number) => {
    if (startupReadySentRef.current) return
    startupReadySentRef.current = true

    const startupReadyMs = Math.round(performance.now() - startupBootMarkRef.current)
    void window.jplearnDesktop
      .notifyStartupReady({
        startupReadyMs,
        firstSummaryMs: startupFirstSummaryMsRef.current,
        deferredLoadsQueuedAtMs,
      })
      .catch(() => undefined)
  }, [])

  const scheduleDeferredStartupTask = useCallback((task: () => void, delayMs: number) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(
        () => task(),
        { timeout: Math.max(500, delayMs + 500) },
      )
      return
    }
    window.setTimeout(task, delayMs)
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    const getAssistantSnapshotFn = window.jplearnDesktop.getAssistantSnapshot
    if (!getAssistantSnapshotFn) {
      return
    }

    let cancelled = false

    async function refreshAssistantSnapshot(): Promise<void> {
      try {
        const response = await getAssistantSnapshotFn!(activeSessionId ?? undefined)
        if (!response.ok || cancelled) return
        setAssistantProfile(response.snapshot.profile)
        setAssistantState(response.snapshot.state)
      } catch {
        // Snapshot is supplementary; keep study loop uninterrupted.
      }
    }

    void refreshAssistantSnapshot()

    return () => {
      cancelled = true
    }
  }, [activeSessionId, summary])

  useEffect(() => {
    const getAssistantEventsFn = window.jplearnDesktop.getAssistantEvents
    const consumeAssistantEventsFn = window.jplearnDesktop.consumeAssistantEvents
    if (!getAssistantEventsFn || !consumeAssistantEventsFn) {
      return
    }

    let disposed = false

    async function pullAssistantEvents(): Promise<void> {
      try {
        const response = await getAssistantEventsFn!(8)
        if (!response.ok || disposed || response.events.length === 0) {
          return
        }

        const fresh = response.events.filter((event) => !assistantSeenEventIdsRef.current.has(event.id))
        for (const event of fresh) {
          assistantSeenEventIdsRef.current.add(event.id)
        }

        if (fresh.length > 0) {
          const toasts = fresh.map((event) => ({
            id: event.id,
            priority: event.priority,
            title: formatAssistantEventTitle(event),
            body: formatAssistantEventBody(event),
          }))
          setAssistantToasts((previous) => [...previous, ...toasts].slice(-ASSISTANT_MAX_TOASTS))
        }

        await consumeAssistantEventsFn!(response.events.map((event) => event.id))
      } catch {
        // Non-blocking polling path.
      }
    }

    void pullAssistantEvents()
    const pollHandle = window.setInterval(() => {
      void pullAssistantEvents()
    }, ASSISTANT_EVENT_POLL_MS)

    return () => {
      disposed = true
      window.clearInterval(pollHandle)
    }
  }, [])

  useEffect(() => {
    if (assistantToasts.length <= 0) {
      return
    }

    const timeoutHandle = window.setTimeout(() => {
      setAssistantToasts((previous) => previous.slice(1))
    }, ASSISTANT_TOAST_TTL_MS)

    return () => {
      window.clearTimeout(timeoutHandle)
    }
  }, [assistantToasts])

  useEffect(() => {
    let cancelled = false

    async function preloadStartupDeckData(): Promise<void> {
      const startupKanjiLevel: JlptLevel = 'n5'
      const startupVocabLevel: JlptLevel = 'n5'
      let deferredLoadsQueuedAtMs: number | undefined

      const preloadKanjiLevel = async (level: JlptLevel, shouldHydrateState: boolean): Promise<void> => {
        if (kanjiLevelDeckCacheRef.current[level] && kanjiLevelBlockCacheRef.current[level]) {
          return
        }

        const slug = KANJI_LEVEL_TO_DECK_SLUG[level]
        const [deckPayload, blockPayload] = await Promise.all([
          getDeckCardsDeduped(slug),
          getBlockProgressDeduped(slug),
        ])
        if (cancelled) return

        const normalizedCards = normalizeDeckCards(deckPayload.cards)
        const normalizedBlocks = normalizeBlockList(blockPayload.blocks)
        kanjiLevelDeckCacheRef.current[level] = normalizedCards
        kanjiLevelBlockCacheRef.current[level] = normalizedBlocks
        if (shouldHydrateState) {
          setKanjiDeckCardsByLevel((previous) => ({
            ...previous,
            [level]: normalizedCards,
          }))
        }
      }

      const preloadVocabLevel = async (level: JlptLevel, shouldHydrateState: boolean): Promise<void> => {
        if (vocabLevelDeckCacheRef.current[level] && vocabLevelBlockCacheRef.current[level]) {
          return
        }

        const slug = VOCAB_LEVEL_TO_DECK_SLUG[level]
        const [deckPayload, blockPayload] = await Promise.all([
          getDeckCardsDeduped(slug),
          getBlockProgressDeduped(slug),
        ])
        if (cancelled) return

        const normalizedCards = normalizeDeckCards(deckPayload.cards)
        const normalizedBlocks = normalizeBlockList(blockPayload.blocks)
        vocabLevelDeckCacheRef.current[level] = normalizedCards
        vocabLevelBlockCacheRef.current[level] = normalizedBlocks
        if (shouldHydrateState) {
          setVocabDeckCardsByLevel((previous) => ({
            ...previous,
            [level]: normalizedCards,
          }))
        }
      }

      try {
        await Promise.all([
          preloadKanjiLevel(startupKanjiLevel, true),
          preloadVocabLevel(startupVocabLevel, true),
        ])

        if (cancelled) return

        const deferredLevels = JLPT_LEVEL_ORDER.filter(
          (level) => level !== startupKanjiLevel,
        )
        deferredLoadsQueuedAtMs = Math.round(performance.now() - startupBootMarkRef.current)

        deferredLevels.forEach((level, index) => {
          const delayMs = 150 * (index + 1)
          scheduleDeferredStartupTask(() => {
            void preloadKanjiLevel(level, true).catch(() => undefined)
          }, delayMs)
          scheduleDeferredStartupTask(() => {
            void preloadVocabLevel(level, true).catch(() => undefined)
          }, delayMs + 75)
        })
      } catch {
        // Allow startup to continue even if preloading fails on some decks.
      } finally {
        if (!cancelled) {
          notifyStartupReady(deferredLoadsQueuedAtMs)
        }
      }
    }

    void preloadStartupDeckData()

    return () => {
      cancelled = true
    }
  }, [getBlockProgressDeduped, getDeckCardsDeduped, notifyStartupReady, scheduleDeferredStartupTask])

  const loadScriptCards = useCallback(async (
    script: ScriptKey,
    kanjiLevel: JlptLevel = activeKanjiLevel,
    vocabLevel: JlptLevel = activeVocabLevel,
  ) => {
    const requestId = scriptLoadRequestIdRef.current + 1
    scriptLoadRequestIdRef.current = requestId
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
    setSessionConfidenceCount(0)
    setSessionConfidenceTotal(0)
    setLivesRemaining(DEFAULT_LIVES)
    setLeechFocusEnabled(false)
    resetRoundCycle()

    try {
      if (script === 'kanji_n5') {
        const selectedKanjiSlug = KANJI_LEVEL_TO_DECK_SLUG[kanjiLevel]
        const cachedCards = kanjiLevelDeckCacheRef.current[kanjiLevel]
        const cachedBlocks = kanjiLevelBlockCacheRef.current[kanjiLevel]

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
          kanjiLevelDeckCacheRef.current[kanjiLevel] = selectedCards
          kanjiLevelBlockCacheRef.current[kanjiLevel] = selectedBlocks
          setKanjiDeckCardsByLevel((previous) => ({
            ...previous,
            [kanjiLevel]: selectedCards,
          }))
        }

        const resolvedKanjiCards = selectedCards ?? []
        const resolvedKanjiBlocks = selectedBlocks ?? []

        setDeckCards(resolvedKanjiCards)
        setActiveKanjiDeckSlug(selectedKanjiSlug)

        for (const level of JLPT_LEVEL_ORDER) {
          if (level === kanjiLevel || kanjiLevelDeckCacheRef.current[level]) continue
          void getDeckCardsDeduped(KANJI_LEVEL_TO_DECK_SLUG[level])
            .then((payload) => {
              const normalizedCards = normalizeDeckCards(payload.cards)
              kanjiLevelDeckCacheRef.current[level] = normalizedCards
              setKanjiDeckCardsByLevel((previous) => ({
                ...previous,
                [level]: normalizedCards,
              }))
            })
            .catch(() => undefined)

          void getBlockProgressDeduped(KANJI_LEVEL_TO_DECK_SLUG[level])
            .then((payload) => {
              kanjiLevelBlockCacheRef.current[level] = normalizeBlockList(payload.blocks)
            })
            .catch(() => undefined)
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
        const selectedVocabSlug = VOCAB_LEVEL_TO_DECK_SLUG[vocabLevel]
        const cachedCards = vocabLevelDeckCacheRef.current[vocabLevel]
        const cachedBlocks = vocabLevelBlockCacheRef.current[vocabLevel]

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
          vocabLevelDeckCacheRef.current[vocabLevel] = selectedCards
          vocabLevelBlockCacheRef.current[vocabLevel] = selectedBlocks
          setVocabDeckCardsByLevel((previous) => ({
            ...previous,
            [vocabLevel]: selectedCards,
          }))
        }

        const resolvedVocabCards = selectedCards ?? []
        const resolvedVocabBlocks = selectedBlocks ?? []

        setDeckCards(resolvedVocabCards)
        setActiveVocabDeckSlug(selectedVocabSlug)

        for (const level of JLPT_LEVEL_ORDER) {
          if (level === vocabLevel || vocabLevelDeckCacheRef.current[level]) continue
          void getDeckCardsDeduped(VOCAB_LEVEL_TO_DECK_SLUG[level])
            .then((payload) => {
              const normalizedCards = normalizeDeckCards(payload.cards)
              vocabLevelDeckCacheRef.current[level] = normalizedCards
              setVocabDeckCardsByLevel((previous) => ({
                ...previous,
                [level]: normalizedCards,
              }))
            })
            .catch(() => undefined)

          void getBlockProgressDeduped(VOCAB_LEVEL_TO_DECK_SLUG[level])
            .then((payload) => {
              vocabLevelBlockCacheRef.current[level] = normalizeBlockList(payload.blocks)
            })
            .catch(() => undefined)
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
        const [deckPayload, blockPayload] = await Promise.all([
          getDeckCardsDeduped(script),
          getBlockProgressDeduped(script),
        ])

        if (scriptLoadRequestIdRef.current !== requestId) {
          return
        }

        setDeckCards(normalizeDeckCards(deckPayload.cards))
        const blocks = normalizeBlockList(blockPayload.blocks)
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
      setGameError(err instanceof Error ? err.message : 'Unknown game bridge error')
    } finally {
      if (scriptLoadRequestIdRef.current === requestId) {
        setGameLoading(false)
      }
    }
  }, [activeKanjiLevel, activeVocabLevel, getBlockProgressDeduped, getDeckCardsDeduped, resetRoundCycle])

  useEffect(() => {
    void loadScriptCards(activeScript, activeKanjiLevel, activeVocabLevel)
  }, [activeScript, activeKanjiLevel, activeVocabLevel, loadScriptCards])

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
      const exampleSentenceHint = card.example_sentence
        ? `Example sentence: ${card.example_sentence}`
        : null

      if (minigame === 'romaji_sprint') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'Type the romaji for this character'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint,
          promptLabel,
          focusText: card.character,
          answer: card.romaji,
          options: [],
        }
      }

      if (minigame === 'typed_recall') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'Type the meaning for this prompt'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? `Use exact wording when possible. Prompt: ${card.character}`,
          promptLabel,
          focusText: card.character,
          answer: card.meaning,
          options: [],
        }
      }

      if (minigame === 'stroke_order') {
        const promptLabel = surprisePrompt
          ? surpriseLabel
          : 'Type the reading to reveal kanji candidates'
        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: card.example_sentence
            ? `Stroke memory: type the reading, then choose the kanji for ${card.example_sentence}`
            : 'Stroke memory: type the reading, then pick the matching kanji candidate.',
          promptLabel,
          focusText: card.meaning,
          answer: card.character,
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

        // Prefer same-tag distractors to keep options semantically coherent.
        const cardTagSet = new Set(card.tags.map((tag) => tag.toLowerCase()))
        for (const candidate of cards) {
          if (candidate.id === card.id || seen.has(candidate.id)) continue
          const sharesTag = candidate.tags.some((tag) => cardTagSet.has(tag.toLowerCase()))
          if (!sharesTag) continue
          selected.push(candidate)
          seen.add(candidate.id)
          if (selected.length >= desiredCount) return selected
        }

        // Final fallback when ranked pool and tag pool are insufficient.
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
          audioText: card.character,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: activeScript === 'kanji_n5'
            ? 'Stroke memory: visualize the character skeleton first.'
            : exampleSentenceHint,
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
        const clozeSentence = buildClozeLine(activeScript, curriculumStage, promptSeed, card).replace('___', '_____')

        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          surprisePrompt,
          curriculumStage,
          chapterNumber: null,
          chapterLabel: null,
          hintText: exampleSentenceHint ?? `Focus card: ${card.character} (${card.romaji})`,
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
        const chapter = buildStoryChapter(activeScript, curriculumStage, promptSeed, card)
        const readingPassage = card.example_sentence?.trim() ?? ''
        const readingFocusText = readingPassage.length > 0 ? readingPassage : chapter.line.replace('___', '_____')

        return {
          cardId: card.id,
          mode: minigame,
          audioText: card.character,
          surprisePrompt,
          curriculumStage,
          chapterNumber: curriculumStage,
          chapterLabel: null,
          hintText: readingPassage.length > 0
            ? `Read the sentence and choose the best meaning for ${card.character}.`
            : exampleSentenceHint ?? `Scene focus: ${card.character} (${card.romaji})`,
          promptLabel: surprisePrompt
            ? surpriseLabel
            : readingPassage.length > 0
              ? `Read the passage and choose the best meaning (Stage ${curriculumStage})`
              : `Choose the best scene completion (Stage ${curriculumStage})`,
          focusText: readingFocusText,
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
        audioText: card.character,
        surprisePrompt,
        curriculumStage,
        chapterNumber: null,
        chapterLabel: null,
        hintText: activeScript === 'kanji_n5'
          ? 'Stroke memory: visualize the character skeleton first.'
          : exampleSentenceHint,
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

  const kanjiLevelProgress = useMemo(
    () => buildJlptLevelProgressFromLevelDecks(kanjiDeckCardsByLevel, cardScores.kanji_n5),
    [kanjiDeckCardsByLevel, cardScores.kanji_n5],
  )

  const vocabLevelProgress = useMemo(
    () => buildJlptLevelProgressFromLevelDecks(vocabDeckCardsByLevel, cardScores.vocab_n5),
    [vocabDeckCardsByLevel, cardScores.vocab_n5],
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
    const block = blockProgress[activeBlockIndex]
    if (!block) return deckCards
    const idSet = new Set(block.card_ids)
    return deckCards.filter((c) => idSet.has(c.id))
  }, [deckCards, blockProgress, activeBlockIndex])

  const activeSessionLengthPreset = useMemo(
    () => SESSION_LENGTH_PRESETS.find((preset) => preset.items === sessionTargetItems) ?? null,
    [sessionTargetItems],
  )

  useEffect(() => {
    if (activeSessionLengthPreset) return
    setSessionTargetItems(DEFAULT_SESSION_LENGTH_PRESET.items)
  }, [activeSessionLengthPreset])

  const startSession = useCallback(async (selectedGame: MinigameKey = activeGame) => {
    setSessionStartPending(true)
    resetRoundCycle()
    setSessionGoalError(null)
    setLastSessionSummary(null)
    setSessionRunReport(null)
    try {
      const leechPool = activeBlockCards.filter((card) => card.is_leech)
      const sourceCards = leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards
      const modeSelection = nextRoundMode(selectedGame)
      const modeCards = modeSelection.mode === 'narrative_story'
        ? narrativePriorityCards(sourceCards)
        : sourceCards
      const goalTargetItems = Math.max(1, Math.floor(sessionTargetItems))

      try {
        const goalResponse: SessionGoalStartResponse = await window.jplearnDesktop.startSessionGoal({
          targetItems: goalTargetItems,
        })
        if (!goalResponse.ok) {
          setSessionGoalError('Unable to start session goal.')
          return
        }
        setActiveSessionId(goalResponse.goal.session_id)
      } catch (error: unknown) {
        setSessionGoalError(error instanceof Error ? error.message : 'Unable to start session goal.')
        return
      }

      await hydrateRoundCycle(modeCards)
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
      setRoundConfidenceScore(3)
      setSessionConfidenceCount(0)
      setSessionConfidenceTotal(0)

      if (sessionRounds === 0) {
        setSessionScore(0)
        setSessionPoints(0)
      }
    } finally {
      setSessionStartPending(false)
    }
  }, [
    activeBlockCards,
    activeGame,
    buildRound,
    hydrateRoundCycle,
    leechFocusEnabled,
    nextCardIndex,
    nextRoundMode,
    resetRoundCycle,
    sessionRounds,
    sessionTargetItems,
  ])

  const continueLastSession = useCallback(() => {
    if (!sessionRunReport) return

    const script = sessionRunReport.script
    const minigame = resolveScriptMinigame(script, sessionRunReport.minigame)

    setActiveGame(minigame)
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

  const nextRound = useCallback(async () => {
    const leechPool = activeBlockCards.filter((card) => card.is_leech)
    const sourceCards = leechFocusEnabled && leechPool.length > 0 ? leechPool : activeBlockCards
    const modeSelection = nextRoundMode(activeGame)
    const modeCards = modeSelection.mode === 'narrative_story'
      ? narrativePriorityCards(sourceCards)
      : sourceCards
    let index = nextCardIndex(modeCards.length)
    if (index === null) {
      await hydrateRoundCycle(modeCards)
      index = nextCardIndex(modeCards.length)
    }
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
  }, [activeBlockCards, activeGame, buildRound, hydrateRoundCycle, leechFocusEnabled, nextCardIndex, nextRoundMode])

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!roundState || isRoundResolving) return

      setIsRoundResolving(true)
      const completedRoundsAfterAnswer = sessionRounds + 1
      const targetRounds = Math.max(1, Math.floor(sessionTargetItems))

      const typedAssessment =
        roundState.mode === 'typed_recall'
          ? assessTypedAnswer(roundState.answer, answer)
          : null
      const isCorrect =
        typedAssessment !== null
          ? typedAssessment !== 'incorrect'
          : normalizeText(answer) === normalizeText(roundState.answer)
      const previousScript = scriptStats[activeScript]
      const nextStreak = isCorrect ? previousScript.currentStreak + 1 : 0
      const awardedPoints = isCorrect ? calculateAwardedPoints(nextStreak) : 0
      const comboBonus = Math.max(0, awardedPoints - 1)
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
      if (isCorrect) {
        setSessionScore((value) => value + 1)
        setSessionPoints((value) => value + awardedPoints)
        if (roundState.mode === 'typed_recall' && typedAssessment === 'near_miss') {
          setRoundFeedback(`Near miss accepted ${pointsCopy}${comboCopy}`)
        } else if (roundState.mode === 'narrative_story') {
          const nextStage = normalizeCurriculumStage(roundState.curriculumStage + 1)
          setRoundFeedback(`Correct ${pointsCopy}${comboCopy} · Stage ${roundState.curriculumStage} -> ${nextStage}.`)
        } else {
          setRoundFeedback(`Correct ${pointsCopy}${comboCopy}`)
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

      const confidenceForAnswer = confidenceCaptureEnabled ? roundConfidenceScore : undefined

      void window.jplearnDesktop.recordGameResult({
        slug:
          activeScript === 'kanji_n5'
            ? activeKanjiDeckSlug
            : activeScript === 'vocab_n5'
              ? activeVocabDeckSlug
              : activeScript,
        cardId: roundState.cardId,
        isCorrect,
        minigame: roundState.mode,
        curriculumStage:
          roundState.mode === 'context_cloze' || roundState.mode === 'narrative_story'
            ? roundState.curriculumStage
            : undefined,
        sessionId: activeSessionId ?? undefined,
        confidenceScore: confidenceForAnswer,
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

      if (typeof confidenceForAnswer === 'number') {
        setSessionConfidenceCount((value) => value + 1)
        setSessionConfidenceTotal((value) => value + confidenceForAnswer)
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

        if (completedRoundsAfterAnswer >= targetRounds) {
          setSessionActive(false)
          setRoundState(null)
          setRoundFeedback(null)
          setRoundFeedbackTone(null)
          setRoundFeedbackPoints(null)
          setRoundFeedbackAnswer(null)
          setIsRoundResolving(false)
          return
        }

        void nextRound()
        setRoundFeedback(null)
        setRoundFeedbackTone(null)
        setRoundFeedbackPoints(null)
        setRoundFeedbackAnswer(null)
        setIsRoundResolving(false)
      }, FEEDBACK_REVEAL_MS)
    },
    [activeGame, activeKanjiDeckSlug, activeScript, activeSessionId, activeVocabDeckSlug, confidenceCaptureEnabled, isRoundResolving, livesEnabled, livesRemaining, nextRound, roundConfidenceScore, roundState, scriptStats, sessionRounds, sessionTargetItems],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      if (showExpertisePrompt) {
        if (event.key === 'Escape') {
          event.preventDefault()
        }
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        setShowSettings((v) => !v)
        return
      }

      if (event.key === 'Escape') {
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
          setActiveScript('vocab_n5')
          setView('script_hub')
        }
        if (event.key === '5') {
          setNavDirection('forward')
          setActiveScript('grammar_patterns')
          setView('script_hub')
        }
        if (event.key === '6') {
          setNavDirection('forward')
          setView('overview')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedChar, shortcutMenuOpen, showExpertisePrompt, showSettings, view])

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
    () => ({
      hiragana: { mode: 'context_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
      katakana: { mode: 'context_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
      kanji_n5: { mode: 'context_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
      vocab_n5: { mode: 'context_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
      grammar_patterns: { mode: 'context_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
      ...(summary?.curriculum?.context_cloze_by_script ?? {}),
    }),
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
    () => ({
      hiragana: { mode: 'narrative_story', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      katakana: { mode: 'narrative_story', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      kanji_n5: { mode: 'narrative_story', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      vocab_n5: { mode: 'narrative_story', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      grammar_patterns: { mode: 'narrative_story', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 0 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      ...(summary?.curriculum?.narrative_story_by_script ?? {}),
    }),
    [summary],
  )
  const storyReadiness = useMemo(() => {
    return ALL_SCRIPT_KEYS.map((script) => {
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
    const remainingDue = Math.max(0, dueToday - completedToday)
    const masteryRate = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0

    return {
      totalCards,
      masteredCards,
      dueToday,
      completedToday,
      remainingDue,
      masteryRate,
    }
  }, [decks])

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

  const summaryTiles = [
    { label: 'Decks', value: decks.length.toString(), tone: 'teal', icon: BarChart3, accent: 'insight' },
    { label: 'Current Streak', value: `${streak.current_days} days`, tone: 'ocean', icon: Flame, accent: 'streak' },
    { label: 'Mastered', value: `${totals.masteryRate}%`, tone: 'amber', icon: Trophy, accent: 'mastery' },
    {
      label: 'Next Session',
      value: `${Math.min(totals.remainingDue, DEFAULT_SESSION_LENGTH_PRESET.items)} cards`,
      note: describeQueueLoad(totals.remainingDue),
      tone: 'rose',
      icon: CalendarDays,
      accent: 'warning',
    },
  ] as const

  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const activeScriptStats = scriptStats[activeScript]
  const activeRunCards = leechFocusEnabled && leechCards.length > 0 ? leechCards : activeBlockCards

  // Use backend block mastery/unlock values so script hub and overview stay consistent.
  const blockProgressWithMastery = useMemo(() => {
    return blockProgress
  }, [blockProgress])

  useEffect(() => {
    if (blockProgressWithMastery.length === 0) return

    const current = blockProgressWithMastery[activeBlockIndex]
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
      return blockProgressWithMastery[activeBlockIndex]?.name ?? null
    }
    if (activeScript === 'kanji_n5') {
      return kanjiLevelProgress.find((level) => level.key === activeKanjiLevel)?.label ?? null
    }
    if (activeScript === 'vocab_n5') {
      return vocabLevelProgress.find((level) => level.key === activeVocabLevel)?.label ?? null
    }
    return null
  }, [blockProgressWithMastery, activeBlockIndex, activeScript, kanjiLevelProgress, activeKanjiLevel, vocabLevelProgress, activeVocabLevel])

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

  useEffect(() => {
    if (activeScript !== 'kanji_n5' || blockProgress.length > 0) return
    const fallback = kanjiLevelProgress.find((level) => level.unlocked) ?? kanjiLevelProgress.find((level) => level.total > 0)
    if (!fallback || fallback.key === activeKanjiLevel) return
    setActiveKanjiLevel(fallback.key)
  }, [activeScript, blockProgress.length, kanjiLevelProgress, activeKanjiLevel])

  useEffect(() => {
    if (activeScript !== 'vocab_n5' || blockProgress.length > 0) return
    const fallback = vocabLevelProgress.find((level) => level.unlocked) ?? vocabLevelProgress.find((level) => level.total > 0)
    if (!fallback || fallback.key === activeVocabLevel) return
    setActiveVocabLevel(fallback.key)
  }, [activeScript, blockProgress.length, vocabLevelProgress, activeVocabLevel])

  // Lazy-load block data for hiragana + katakana when the overview opens.
  useEffect(() => {
    if (view !== 'overview') return
    setOverviewBlocksLoading(true)
    void window.jplearnDesktop.getOverviewCharacterMastery()
      .then((payload) => {
        setOverviewBlocks(payload.blocks)
        setOverviewKanjiDeck(payload.kanji_cards)
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

  const closeShortcutMenu = useCallback(() => {
    setShortcutMenuOpen(false)
    setActiveShortcutFlyout(null)
  }, [])

  const jumpToMainMenu = useCallback(() => {
    goHome()
    closeShortcutMenu()
  }, [closeShortcutMenu, goHome])

  const jumpToOverview = useCallback(() => {
    setNavDirection('forward')
    setView('overview')
    closeShortcutMenu()
  }, [closeShortcutMenu])

  const jumpToScriptHub = useCallback((script: ScriptKey) => {
    setNavDirection('forward')
    setActiveScript(script)
    setView('script_hub')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    resetRoundCycle()
    closeShortcutMenu()
  }, [closeShortcutMenu, resetRoundCycle])

  const jumpToScriptHubMinigame = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setNavDirection('forward')
    setActiveScript(script)
    setActiveGame(resolvedMinigame)
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
    closeShortcutMenu()
  }, [closeShortcutMenu, resetRoundCycle, resolveScriptMinigame])

  const jumpToScriptHubSetup = useCallback((script: ScriptKey, minigame: MinigameKey) => {
    const resolvedMinigame = resolveScriptMinigame(script, minigame)
    setNavDirection('forward')
    setActiveScript(script)
    setActiveGame(resolvedMinigame)
    setView('script_hub')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundFeedbackTone(null)
    setRoundFeedbackPoints(null)
    setRoundFeedbackAnswer(null)
    setIsRoundResolving(false)
    setLivesRemaining(DEFAULT_LIVES)
    resetRoundCycle()
    closeShortcutMenu()
  }, [closeShortcutMenu, resetRoundCycle, resolveScriptMinigame])

  const openSettingsFromMenu = useCallback(() => {
    setShowSettings(true)
    closeShortcutMenu()
  }, [closeShortcutMenu])

  const refreshDataFromMenu = useCallback(() => {
    void loadSummary()
    closeShortcutMenu()
  }, [closeShortcutMenu, loadSummary])

  const resetStudyDb = useCallback(async () => {
    setResettingDb(true)
    setError(null)
    try {
      await window.jplearnDesktop.resetStudyDb()
      // Also wipe all locally-tracked scores and stats so the UI is fully clean.
      const emptyScores: CardScores = { hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {} }
      const emptyStats: StatsByScript = {
        hiragana: { ...EMPTY_SCRIPT_STATS },
        katakana: { ...EMPTY_SCRIPT_STATS },
        kanji_n5: { ...EMPTY_SCRIPT_STATS },
        vocab_n5: { ...EMPTY_SCRIPT_STATS },
        grammar_patterns: { ...EMPTY_SCRIPT_STATS },
      }
      window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify(emptyScores))
      window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(emptyStats))
      window.localStorage.removeItem(SUMMARY_SNAPSHOT_STORAGE_KEY)
      window.localStorage.removeItem(EXPERTISE_STORAGE_KEY)
      setCardScores(emptyScores)
      setScriptStats(emptyStats)
      setMinigameStats(defaultMinigameStatsByScript())
      setShowExpertisePrompt(true)
      setOnboardingStep(1)
      setExpertiseError(null)
      setSelectedExpertiseLevel('total_beginner')
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
    void window.jplearnDesktop
      .toggleMaximizeWindow()
      .then(() => window.jplearnDesktop.isWindowMaximized())
      .then((state) => {
        setIsWindowMaximized(state.isMaximized)
      })
      .catch(() => undefined)
  }, [])

  const closeWindow = useCallback(() => {
    void window.jplearnDesktop.closeWindow()
  }, [])

  const applyExpertiseSelection = useCallback(async () => {
    setApplyingExpertise(true)
    setExpertiseError(null)
    try {
      await window.jplearnDesktop.applyExpertiseLevel(selectedExpertiseLevel)

      if (selectedExpertiseLevel === 'total_beginner') {
        setCardScores({ hiragana: {}, katakana: {}, kanji_n5: {}, vocab_n5: {}, grammar_patterns: {} })
      } else {
        const targetScripts = EXPERTISE_LEVEL_TO_SCRIPT_KEYS[selectedExpertiseLevel]
        const payloads = await Promise.all(targetScripts.map((slug) => getDeckCardsDeduped(slug)))
        setCardScores((previous) => {
          const next: CardScores = {
            hiragana: { ...previous.hiragana },
            katakana: { ...previous.katakana },
            kanji_n5: { ...previous.kanji_n5 },
            vocab_n5: { ...previous.vocab_n5 },
            grammar_patterns: { ...previous.grammar_patterns },
          }

          targetScripts.forEach((scriptKey, index) => {
            const deck = payloads[index]
            const seeded = { ...next[scriptKey] }
            deck.cards.forEach((card) => {
              seeded[card.id] = CARD_MASTERY_MAX
            })
            next[scriptKey] = seeded
          })

          return next
        })
      }

      window.localStorage.setItem(EXPERTISE_STORAGE_KEY, 'done')
      setShowExpertisePrompt(false)
      await loadSummary()
    } catch (err) {
      setExpertiseError(err instanceof Error ? err.message : 'Could not apply expertise profile.')
    } finally {
      setApplyingExpertise(false)
    }
  }, [getDeckCardsDeduped, loadSummary, selectedExpertiseLevel])

  const goToNextOnboardingStep = useCallback(() => {
    setExpertiseError(null)
    setOnboardingStep((prev) => {
      if (prev === 1) return 2
      return 3
    })
  }, [])

  const goToPreviousOnboardingStep = useCallback(() => {
    setExpertiseError(null)
    setOnboardingStep((prev) => {
      if (prev === 3) return 2
      return 1
    })
  }, [])

  const skipOnboarding = useCallback(() => {
    window.localStorage.setItem(EXPERTISE_STORAGE_KEY, 'done')
    setShowExpertisePrompt(false)
    setExpertiseError(null)
    setOnboardingStep(1)
  }, [])
  const selectedExpertiseOption =
    EXPERTISE_OPTIONS.find((option) => option.level === selectedExpertiseLevel) ?? EXPERTISE_OPTIONS[0]

  const resolvedBackgroundUrls = useMemo(() => {
    const next: Partial<Record<BackgroundStyle, string>> = {}
    BACKGROUND_OPTIONS.forEach((option) => {
      if (!option.imagePath) return
      next[option.key] = resolveBackgroundImageUrl(option.imagePath)
    })
    return next
  }, [])

  useEffect(() => {
    let cancelled = false

    async function preloadBackgroundAssets(): Promise<void> {
      const photoOptions = BACKGROUND_OPTIONS.filter(
        (option): option is (typeof BACKGROUND_OPTIONS)[number] & { imagePath: string } => Boolean(option.imagePath),
      )

      const previewMap: Partial<Record<BackgroundStyle, string>> = {}

      await Promise.all(
        photoOptions.map(async (option) => {
          const src = resolvedBackgroundUrls[option.key]
          if (!src) return

          const image = new Image()
          image.decoding = 'async'
          image.src = src

          try {
            await image.decode()
          } catch {
            await new Promise<void>((resolve) => {
              image.onload = () => resolve()
              image.onerror = () => resolve()
            })
          }

          if (cancelled) return
          backgroundImageCacheRef.current[option.key] = image

          const previewDataUrl = createBackgroundPreviewDataUrl(image, 272, 112)
          if (previewDataUrl) {
            previewMap[option.key] = previewDataUrl
          }
        }),
      )

      if (!cancelled) {
        setBackgroundPreviewUrls((previous) => ({
          ...previous,
          ...previewMap,
        }))
      }
    }

    void preloadBackgroundAssets()

    return () => {
      cancelled = true
    }
  }, [resolvedBackgroundUrls])

  const selectedBackgroundOption =
    BACKGROUND_OPTIONS.find((option) => option.key === settings.backgroundStyle) ?? BACKGROUND_OPTIONS[0]
  const selectedBackgroundUrl = selectedBackgroundOption.imagePath
    ? resolvedBackgroundUrls[selectedBackgroundOption.key]
    : undefined
  const appShellStyle = {
    '--background-image': selectedBackgroundUrl ? `url("${selectedBackgroundUrl}")` : 'none',
    '--background-blur': `${clampBackgroundBlur(settings.backgroundBlur)}px`,
  } as CSSProperties

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

  return (
    <main className="app-shell" data-background-style={settings.backgroundStyle} style={appShellStyle}>
      <header className="window-titlebar" aria-label="Window controls">
        <div className="window-titlebar-drag">
          <div className="window-titlebar-nav" role="group" aria-label="App navigation">
            <div className="titlebar-shortcut-wrap" ref={shortcutMenuRef}>
              <button
                type="button"
                className="window-nav-button"
                aria-label="Open shortcuts"
                title="Shortcuts"
                aria-haspopup="menu"
                aria-expanded={shortcutMenuOpen}
                onClick={() => {
                  setShortcutMenuOpen((open) => !open)
                  setActiveShortcutFlyout(null)
                }}
              >
                <Menu className="window-nav-icon" strokeWidth={2.2} />
              </button>
              {shortcutMenuOpen ? (
                <div className="titlebar-shortcut-menu" role="menu" aria-label="Quick locations">
                  <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={jumpToMainMenu}>
                    <House className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Main Menu
                  </button>

                  <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={jumpToOverview}>
                    <BarChart3 className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Study Overview
                  </button>

                  <div className="titlebar-shortcut-tree-anchor">
                    <button
                      type="button"
                      role="menuitem"
                      className="titlebar-shortcut-item titlebar-shortcut-parent"
                      aria-haspopup="true"
                      aria-expanded={activeShortcutFlyout !== null}
                      onClick={() => {
                        setActiveShortcutFlyout((current) => (current === null ? 'all_maps' : null))
                      }}
                    >
                      <ListChecks className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                      All Maps
                      <span className="titlebar-shortcut-caret" aria-hidden="true">{activeShortcutFlyout !== null ? '▾' : '▸'}</span>
                    </button>

                    {activeShortcutFlyout !== null ? (
                      <div className="titlebar-shortcut-righttree" role="group" aria-label="Maps and minigames">
                        {ALL_SCRIPT_KEYS.map((script) => {
                          const isScriptExpanded = activeShortcutFlyout === script
                          return (
                            <div key={script} className="titlebar-shortcut-map-group">
                              <button
                                type="button"
                                role="menuitem"
                                className="titlebar-shortcut-item titlebar-shortcut-child"
                                aria-haspopup="true"
                                aria-expanded={isScriptExpanded}
                                onClick={() => {
                                  setActiveShortcutFlyout((current) => (current === script ? 'all_maps' : script))
                                }}
                              >
                                <span className="titlebar-shortcut-glyph" aria-hidden="true">{SECTION_META[script].glyph}</span>
                                {SCRIPT_LABELS[script]} Map
                                <span className="titlebar-shortcut-caret" aria-hidden="true">{isScriptExpanded ? '▾' : '▸'}</span>
                              </button>
                              {isScriptExpanded ? (
                                <div className="titlebar-shortcut-childmenu" role="group" aria-label={`${SCRIPT_LABELS[script]} minigames`}>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                    onClick={() => jumpToScriptHub(script)}
                                  >
                                    <span className="titlebar-shortcut-glyph" aria-hidden="true">↗</span>
                                    Open Map
                                  </button>
                                  {SCRIPT_MINIGAMES[script].map((gameKey) => {
                                    const gameTitle = MINIGAMES.find((entry) => entry.key === gameKey)?.title ?? gameKey
                                    return (
                                      <button
                                        key={gameKey}
                                        type="button"
                                        role="menuitem"
                                        className="titlebar-shortcut-item titlebar-shortcut-leaf"
                                        onClick={() => jumpToScriptHubMinigame(script, gameKey)}
                                      >
                                        <MinigameIcon game={gameKey} />
                                        {gameTitle}
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>

                  <button type="button" role="menuitem" className="titlebar-shortcut-item" onClick={openSettingsFromMenu}>
                    <Settings className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="titlebar-shortcut-item"
                    onClick={refreshDataFromMenu}
                  >
                    <Activity className="titlebar-shortcut-icon" strokeWidth={2.1} aria-hidden="true" />
                    Refresh Data
                  </button>
                </div>
              ) : null}
            </div>
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
          <button
            type="button"
            className="window-control-button window-control-button-maximize"
            onClick={toggleMaximizeWindow}
            aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'}
          >
            <span className={`window-control-icon-stack ${isWindowMaximized ? 'is-maximized' : ''}`} aria-hidden="true">
              <Square className="window-control-icon window-control-icon-maximize" strokeWidth={2} />
              <Copy className="window-control-icon window-control-icon-restore" strokeWidth={1.9} />
            </span>
          </button>
          <button type="button" className="window-control-button window-control-close" onClick={closeWindow} aria-label="Close window">
            <X className="window-control-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>
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

      <div className="app-shell-scroll">
      {view === 'home' ? (
        <div className={`view-shell view-${navDirection}`}>
          <section className="home-menu panel-glass">
            <h1 className="home-logo">JPLearn</h1>
            <p className="home-copy">
              Main Menu. Choose a learning track, then pick a minigame and start your run.
            </p>

            <div className="menu-grid">
              {(['hiragana', 'katakana', 'kanji_n5', 'vocab_n5', 'grammar_patterns'] as const).map((script, index) => {
                const glyph = SECTION_META[script].glyph
                const difficulty = SCRIPT_DIFFICULTY_META[script]
                const DifficultyIcon = difficulty.icon

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
                    <span
                      className={`menu-card-difficulty menu-card-difficulty-${difficulty.tier}`}
                      aria-label={`Difficulty: ${difficulty.label}`}
                      title={`Difficulty: ${difficulty.label}`}
                    >
                      <DifficultyIcon className="menu-card-difficulty-icon" aria-hidden="true" strokeWidth={2.05} />
                      <span>{difficulty.label}</span>
                    </span>
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
                aria-keyshortcuts="6"
                onClick={() => {
                  setNavDirection('forward')
                  setView('overview')
                }}
                aria-label="Open study overview"
                title="Study Overview (6)"
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

            {studyPlan.coverageRows.length > 0 ? (
              <section className="home-study-plan-strip panel-glass" aria-label="Study plan">
                <button
                  type="button"
                  className="home-study-plan-toggle"
                  onClick={() => setHomeStudyPlanExpanded((expanded) => !expanded)}
                  aria-expanded={homeStudyPlanExpanded}
                  aria-controls="home-study-plan-body"
                >
                  <div className="home-study-plan-heading">
                    <p className="hero-kicker">Study Plan</p>
                    <strong>{studyPlan.recommendedMinutes}-minute {studyPlan.learnerStage === 'starter' ? 'starter-safe' : studyPlan.learnerStage === 'building' ? 'build-up' : 'advanced'} session</strong>
                    <span>{studyPlan.sessionNote}</span>
                  </div>
                  <div className="home-study-plan-summary">
                    <span>{Math.round(studyPlan.overallMastery * 100)}% coverage</span>
                    <span>{studyPlan.focusRows[0]?.label ?? 'Keep reviewing'}</span>
                    <span aria-hidden="true" className={`home-study-plan-chevron ${homeStudyPlanExpanded ? 'is-open' : ''}`}>▾</span>
                  </div>
                </button>

                <div id="home-study-plan-body" className={`home-study-plan-body ${homeStudyPlanExpanded ? 'is-open' : ''}`}>
                  <div className="home-study-plan-strip-grid">
                    <div className="home-study-plan-shortcuts" aria-label="Study plan shortcuts">
                      {studyPlan.shortcutRows.slice(0, 2).map((shortcut) => (
                        <button
                          key={shortcut.key}
                          type="button"
                          className="study-plan-shortcut-button study-plan-shortcut-button-inline"
                          onClick={() => jumpToScriptHubSetup(shortcut.script, shortcut.minigame)}
                        >
                          <span className="study-plan-shortcut-kicker">Quick shortcut</span>
                          <strong>{shortcut.label}</strong>
                          <p>{shortcut.note}</p>
                        </button>
                      ))}
                    </div>

                    <div className="home-study-plan-metrics">
                      {studyPlan.coverageRows.slice(0, 3).map((row) => {
                        const pct = Math.round(row.mastery * 100)
                        return (
                          <div key={row.key} className="home-study-plan-metric-row">
                            <div className="home-study-plan-metric-head">
                              <strong>{row.label}</strong>
                              <span>{pct}%</span>
                            </div>
                            <div className="study-plan-coverage-bar" aria-hidden="true">
                              <div className="study-plan-coverage-fill" style={{ '--study-plan-pct': `${pct}%` } as CSSProperties} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      ) : null}

      {view === 'script_hub' ? (
        <div className={`view-shell view-${navDirection}`}>
          <header className="topbar panel-glass">
            <button
              type="button"
              className="back-button back-button-icon-only"
              onClick={goHome}
              aria-label="Back to main menu"
              title="Back to main menu"
            >
              <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
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
            <div className="learning-path-shell">
              <button
                type="button"
                className={`learning-path-toggle ${learningPathExpanded ? 'is-expanded' : ''}`}
                onClick={() => setLearningPathExpanded((expanded) => !expanded)}
                aria-expanded={learningPathExpanded}
                aria-controls="learning-path-body"
              >
                <div className="panel-head learning-path-head">
                  <h2>Learning Path</h2>
                  <span className="game-stats">
                    {blockProgressWithMastery.length > 0
                      ? `${blockProgressWithMastery.filter((b) => b.mastery >= 0.8).length} / ${blockProgressWithMastery.length} blocks mastered`
                      : activeScript === 'kanji_n5'
                        ? `${kanjiLevelProgress.filter((level) => level.mastery >= 0.8 && level.total > 0).length} / ${kanjiLevelProgress.filter((level) => level.total > 0).length} JLPT levels mastered`
                        : activeScript === 'vocab_n5'
                          ? `${vocabLevelProgress.filter((level) => level.mastery >= 0.8 && level.total > 0).length} / ${vocabLevelProgress.filter((level) => level.total > 0).length} JLPT levels mastered`
                          : 'Choose a minigame to start'}
                  </span>
                </div>

                {!learningPathExpanded ? (
                  <div className="learning-path-compact" role="group" aria-label="Learning path compact summary">
                    {learningPathTrackRows.map((row) => {
                      const masteryPct = Math.round(row.mastery * 100)
                      return (
                        <div key={row.key} className="learning-path-compact-row">
                          <div className="learning-path-compact-head">
                            <strong>{row.label}</strong>
                            <span>{masteryPct}%</span>
                          </div>
                          <div className="study-plan-coverage-bar" aria-hidden="true">
                            <div className="study-plan-coverage-fill" style={{ '--study-plan-pct': `${masteryPct}%` } as CSSProperties} />
                          </div>
                          <p className="learning-path-compact-meta">
                            {row.total > 0 ? `${row.total} cards tracked` : 'No cards tracked yet'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </button>

              <div id="learning-path-body" className={`learning-path-body ${learningPathExpanded ? 'is-open' : ''}`}>
                <div className="learning-path-body-inner">
                  {gameLoading ? (
                    <p className="status-line">Loading deck cards...</p>
                  ) : blockProgressWithMastery.length > 0 ? (
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
                  ) : activeScript === 'kanji_n5' || activeScript === 'vocab_n5' ? (
                    <div className="jlpt-level-path" role="group" aria-label={`${activeScript === 'kanji_n5' ? 'Kanji' : 'Vocabulary'} JLPT progression`}>
                      {(activeScript === 'kanji_n5' ? kanjiLevelProgress : vocabLevelProgress).map((level, index) => {
                        const isActive = activeScript === 'kanji_n5' ? activeKanjiLevel === level.key : activeVocabLevel === level.key
                        const masteryPct = Math.round(level.mastery * 100)
                        const unavailable = level.total === 0
                        return (
                          <article
                            key={level.key}
                            className={`jlpt-level-node ${isActive ? 'is-active' : ''} ${(!level.unlocked || unavailable) ? 'is-locked' : ''}`}
                            style={{ animationDelay: `${80 + index * 45}ms` }}
                          >
                            <button
                              type="button"
                              className="jlpt-level-button"
                              disabled={!level.unlocked || unavailable}
                              onClick={() => {
                                if (activeScript === 'kanji_n5') {
                                  setActiveKanjiLevel(level.key)
                                } else {
                                  setActiveVocabLevel(level.key)
                                }
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
                              aria-label={`${level.label}, ${unavailable ? 'no cards yet' : `${masteryPct}% mastered`}`}
                            >
                              <div className="jlpt-level-header">
                                <strong>{level.label}</strong>
                                {!level.unlocked || unavailable ? (
                                  <Lock className="block-lock-icon" strokeWidth={2} aria-hidden="true" />
                                ) : null}
                              </div>
                              <span className="jlpt-level-preview" lang="ja" aria-hidden="true">
                                {level.sampleChars.length > 0 ? level.sampleChars.join(' ') : '—'}
                              </span>
                              <div className="block-node-bar-wrap" aria-label={`Mastery: ${masteryPct}%`}>
                                <div
                                  className="block-node-bar"
                                  style={{ '--block-mastery': `${masteryPct}%` } as CSSProperties}
                                />
                              </div>
                              <span className="jlpt-level-meta">{level.total} cards • {masteryPct}%</span>
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Minigame selector – shown below block path once a block is active */}
            {!gameLoading && (blockProgressWithMastery.length === 0 || blockProgressWithMastery[activeBlockIndex]?.unlocked) ? (
              <>
                <div className="panel-head block-minigame-head">
                  <h3>
                    {blockProgressWithMastery.length > 0
                      ? `Choose a minigame — ${blockProgressWithMastery[activeBlockIndex]?.name ?? ''} (${activeBlockCards.length} cards)`
                      : activeScript === 'kanji_n5' || activeScript === 'vocab_n5'
                        ? `Choose a minigame — ${activeSectionName ?? 'JLPT Level'} (${activeBlockCards.length} cards)`
                        : 'Choose a minigame'}
                  </h3>
                </div>

                <div className="minigame-setup-toolbar" aria-label="Minigame quick setup">
                  <div className="session-length-row" role="group" aria-label="Session length">
                    {SESSION_LENGTH_PRESETS.map((preset) => {
                      const Icon = preset.icon
                      const isActive = activeSessionLengthPreset?.key === preset.key
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          className={`setup-option-button session-length-button session-length-${preset.key} ${isActive ? 'is-active' : ''}`}
                          aria-pressed={isActive}
                          aria-label={`Set ${preset.label.toLowerCase()} session length (${preset.items} items)`}
                          title={`${preset.label} length (${preset.items} items)`}
                          onClick={() => setSessionTargetItems(preset.items)}
                        >
                          <span className="setup-option-icon" aria-hidden="true">
                            <Icon className="toggle-icon" strokeWidth={2.2} />
                          </span>
                          <span className="setup-option-copy">
                            <span className="setup-option-label">{preset.label}</span>
                            <span className="setup-option-meta">{preset.items} items</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="intro-toggle-row" role="group" aria-label="Minigame setup toggles">
                    <button
                      type="button"
                      className={`setup-option-button setup-toggle-button ${livesEnabled ? 'is-active' : ''}`}
                      aria-pressed={livesEnabled}
                      aria-label={`Toggle lives mode (${DEFAULT_LIVES} lives per run)`}
                      title={`Lives mode (${DEFAULT_LIVES} lives): ${livesEnabled ? 'On' : 'Off'}`}
                      onClick={() => {
                        setLivesEnabled((previous) => !previous)
                        setLivesRemaining(DEFAULT_LIVES)
                      }}
                    >
                      <span className="setup-option-icon" aria-hidden="true">
                        <Heart className="toggle-icon" strokeWidth={2.1} />
                      </span>
                      <span className="setup-option-copy">
                        <span className="setup-option-label">Lives mode</span>
                        <span className="setup-option-meta">{livesEnabled ? `${DEFAULT_LIVES} lives active` : 'Off'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`setup-option-button setup-toggle-button leech-focus-toggle ${leechFocusEnabled ? 'is-active' : ''}`}
                      aria-pressed={leechFocusEnabled}
                      aria-label="Toggle focused review mode (leech cards first)"
                      title={`Focused review mode (leech first): ${leechFocusEnabled ? 'On' : 'Off'}`}
                      onClick={() => setLeechFocusEnabled((previous) => !previous)}
                    >
                      <span className="setup-option-icon" aria-hidden="true">
                        <AlertTriangle className="toggle-icon" strokeWidth={2.1} />
                      </span>
                      <span className="setup-option-copy">
                        <span className="setup-option-label">Focused review</span>
                        <span className="setup-option-meta">{leechFocusEnabled ? 'Leech cards first' : 'Mixed queue'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`setup-option-button setup-toggle-button ${confidenceCaptureEnabled ? 'is-active' : ''}`}
                      aria-pressed={confidenceCaptureEnabled}
                      aria-label="Toggle answer confidence capture"
                      title={`Confidence capture: ${confidenceCaptureEnabled ? 'On' : 'Off'}`}
                      onClick={() => setConfidenceCaptureEnabled((previous) => !previous)}
                    >
                      <span className="setup-option-icon" aria-hidden="true">
                        <Target className="toggle-icon" strokeWidth={2.1} />
                      </span>
                      <span className="setup-option-copy">
                        <span className="setup-option-label">Answer confidence</span>
                        <span className="setup-option-meta">{confidenceCaptureEnabled ? 'Rate each answer' : 'Tracking off'}</span>
                      </span>
                    </button>
                  </div>
                </div>

                {sessionSummaryLoading ? <p className="status-line">Loading session summary...</p> : null}
                {sessionGoalError ? <p className="status-line status-error">{sessionGoalError}</p> : null}
                {lastSessionSummary ? (
                  <section className="session-summary-card" aria-live="polite">
                    <div className="session-summary-head">
                      <p className="session-summary-kicker">Last Session</p>
                      <span className={`session-summary-pill ${lastSessionSummary.goal_met ? 'is-success' : 'is-warn'}`}>
                        {lastSessionSummary.goal_met ? 'Goal Met' : 'In Progress'}
                      </span>
                    </div>
                    <p className="session-summary-main">
                      {lastSessionSummary.completed_items}/{lastSessionSummary.target_items} items · {lastSessionSummary.accuracy}% accuracy · {Math.max(0, lastSessionSummary.reviewed - lastSessionSummary.correct)} misses
                    </p>
                    <div className="session-summary-actions">
                      <span className="session-summary-context">
                        {sessionRunReport
                          ? `${SCRIPT_LABELS[sessionRunReport.script]} · ${MINIGAMES.find((game) => game.key === sessionRunReport.minigame)?.title ?? sessionRunReport.minigame}`
                          : `${SCRIPT_LABELS[activeScript]} · ${selectedGameMeta?.title ?? 'Minigame'}`}
                      </span>
                      <button
                        type="button"
                        className="session-summary-continue"
                        onClick={() => continueLastSession()}
                        disabled={!sessionRunReport || sessionStartPending}
                      >
                        Continue
                      </button>
                    </div>
                  </section>
                ) : null}

                <div className="minigame-grid">
                  {availableMinigames.map((gameKey, index) => {
                    const game = MINIGAMES.find((entry) => entry.key === gameKey)
                    if (!game) return null
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
                        <div className="game-tile-head">
                          <span className="game-icon" aria-hidden="true"><MinigameIcon game={game.key} /></span>
                          <div className="game-tile-copy">
                            <strong className="game-tile-title">{game.title}</strong>
                            <p className="game-tile-description">{game.description}</p>
                          </div>
                        </div>
                        <div className="game-tile-stats" aria-label="Minigame stats">
                          <span className="game-tile-stat" aria-label="Accuracy" title="Accuracy">
                            <span className="game-tile-stat-label" aria-hidden="true"><Target className="game-tile-stat-icon" strokeWidth={2.1} /></span>
                            <strong>{accuracy}%</strong>
                          </span>
                          <span className="game-tile-stat" aria-label="Best streak" title="Best streak">
                            <span className="game-tile-stat-label" aria-hidden="true"><Flame className="game-tile-stat-icon" strokeWidth={2.1} /></span>
                            <strong>{gameStats.bestStreak}</strong>
                          </span>
                          <span className="game-tile-stat" aria-label="Points" title="Points">
                            <span className="game-tile-stat-label" aria-hidden="true"><Trophy className="game-tile-stat-icon" strokeWidth={2.1} /></span>
                            <strong>{gameStats.points}</strong>
                          </span>
                        </div>
                        <button
                          type="button"
                          className="play-cta-button game-tile-play"
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
                            void startSession(game.key)
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
                {activeSectionName
                  ? ` · ${activeSectionName}`
                  : ' Run'}
              </span>
              <h1>{selectedGameMeta?.title ?? 'Minigame'}</h1>
            </div>
            <div className="topbar-end">
              <div className="focus-chip">
                <span className="metric-accent-skill"><Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`correct-${sessionScore}-${sessionRounds}`} className="live-value">{sessionScore}/{sessionRounds}</strong> Correct</span>
                <span className="metric-accent-streak"><Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`points-${sessionPoints}`} className="live-value">{sessionPoints}</strong> Points</span>
                <span className="metric-accent-insight"><Trophy aria-hidden="true" className="chip-icon" strokeWidth={2.2} /><strong key={`goal-${sessionRounds}-${sessionTargetItems}`} className="live-value">{sessionRounds}/{sessionTargetItems}</strong> Goal</span>
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
                  <strong>{activeSectionName ?? 'this section'}</strong>{' '}
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
                      void startSession()
                    }}
                  >
                    Play Again
                  </button>
                </div>
              </article>
            ) : !sessionActive ? (
              <>
                {sessionRunReport && !sessionStartPending ? (
                  <article className="post-session-report" role="status" aria-live="polite">
                    <div className="post-session-head">
                      <div>
                        <p className="post-session-kicker">Session Report</p>
                        <h2>Run Complete · {MINIGAMES.find((game) => game.key === sessionRunReport.minigame)?.title ?? sessionRunReport.minigame}</h2>
                      </div>
                      <span className="post-session-time">Finished {sessionRunReport.completedAt}</span>
                    </div>

                    <p className="post-session-note">
                      {sessionRunReport.sectionName
                        ? `${SCRIPT_LABELS[sessionRunReport.script]} · ${sessionRunReport.sectionName}`
                        : SCRIPT_LABELS[sessionRunReport.script]}
                    </p>

                    <div className="post-session-grid" aria-label="Session performance metrics">
                      <div className="post-session-cell"><small>Accuracy</small><strong>{sessionRunReport.accuracy}%</strong></div>
                      <div className="post-session-cell"><small>Correct</small><strong>{sessionRunReport.correct}</strong></div>
                      <div className="post-session-cell"><small>Misses</small><strong>{sessionRunReport.wrong}</strong></div>
                      <div className="post-session-cell"><small>Points</small><strong>{sessionRunReport.points}</strong></div>
                      <div className="post-session-cell"><small>Goal Completion</small><strong>{sessionRunReport.goalCompletionPct}%</strong></div>
                      {sessionRunReport.livesEnabled ? (
                        <>
                          <div className="post-session-cell"><small>Lives</small><strong>{sessionRunReport.livesRemaining}/{DEFAULT_LIVES}</strong></div>
                          <div className="post-session-cell"><small>Lives Lost</small><strong>{sessionRunReport.livesLost}</strong></div>
                        </>
                      ) : null}
                      {sessionRunReport.leechFocusEnabled ? (
                        <div className="post-session-cell"><small>Leech Focus</small><strong>On</strong></div>
                      ) : null}
                      {sessionRunReport.confidenceCaptureEnabled ? (
                        <>
                          <div className="post-session-cell"><small>Confidence Captured</small><strong>{sessionRunReport.confidenceCapturedCount}</strong></div>
                          <div className="post-session-cell"><small>Avg Confidence</small><strong>{sessionRunReport.averageConfidenceScore ?? '-'}</strong></div>
                        </>
                      ) : null}
                    </div>

                    <div className="post-session-insights">
                      <p>
                        <strong>Points Rule:</strong> {POINTS_RULE_COPY}
                      </p>
                      <p>
                        <strong>Goal Check:</strong>{' '}
                        {sessionRunReport.goalDelta >= 0
                          ? `Goal cleared by ${sessionRunReport.goalDelta} item${sessionRunReport.goalDelta === 1 ? '' : 's'}.`
                          : `${Math.abs(sessionRunReport.goalDelta)} item${Math.abs(sessionRunReport.goalDelta) === 1 ? '' : 's'} short of goal.`}
                      </p>
                    </div>
                  </article>
                ) : null}

                <div className="game-actions">
                  <button type="button" onClick={() => { void startSession() }} disabled={gameLoading || activeRunCards.length === 0 || sessionSummaryLoading || sessionStartPending}>
                    {sessionRunReport ? 'Play Again' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNavDirection('back')
                      setView('script_hub')
                    }}
                  >
                    Back to Map
                  </button>
                  {gameLoading ? <span>Loading deck...</span> : <span>{activeRunCards.length} cards available</span>}
                </div>
              </>
            ) : (
              <div className="game-actions">
                <button type="button" onClick={() => { void startSession() }} disabled={gameLoading || activeRunCards.length === 0 || sessionSummaryLoading || sessionStartPending}>
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

                {roundState.mode === 'stroke_order' ? (
                  <div className="stroke-order-picker">
                    <div className="game-input-row">
                      <input
                        ref={answerInputRef}
                        value={roundInput}
                        onChange={(event) => setRoundInput(sanitizeRomajiInput(event.target.value))}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          const candidates = getStrokeOrderCandidates(activeBlockCards, roundInput)
                          if (candidates.length === 1) {
                            submitAnswer(candidates[0].character)
                          }
                        }}
                        placeholder="Type romaji reading"
                        autoComplete="off"
                        disabled={isRoundResolving}
                      />
                    </div>
                    <div className="stroke-order-candidate-wrap" aria-label="Kanji candidates">
                      {getStrokeOrderCandidates(activeBlockCards, roundInput).length > 0 ? (
                        <div className="option-grid">
                          {getStrokeOrderCandidates(activeBlockCards, roundInput).map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              className="option-button option-button-character"
                              disabled={isRoundResolving}
                              onClick={() => submitAnswer(candidate.character)}
                            >
                              <span className="option-button-main" lang="ja">{candidate.character}</span>
                              <span className="option-button-sub">{candidate.romaji}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="status-line">Type a romaji reading to show matching kanji.</p>
                      )}
                    </div>
                  </div>
                ) : roundState.mode === 'romaji_sprint' || roundState.mode === 'typed_recall' ? (
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
                      onChange={(event) =>
                        setRoundInput(
                          roundState.mode === 'romaji_sprint'
                            ? sanitizeRomajiInput(event.target.value)
                            : event.target.value,
                        )
                      }
                      placeholder={roundState.mode === 'romaji_sprint'
                        ? 'Enter romaji'
                        : 'Type meaning'}
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

                {confidenceCaptureEnabled ? (
                  <section className="confidence-controls confidence-controls-round" aria-label="Confidence score controls">
                    <p className="interleave-controls-title">Confidence for this answer</p>
                    <div className="confidence-chip-row confidence-chip-row-round" role="group" aria-label="Select confidence score for this answer">
                      {CONFIDENCE_SCORES.map((score) => (
                        <button
                          key={`round-confidence-${score}`}
                          type="button"
                          className={`confidence-chip confidence-chip-round ${roundConfidenceScore === score ? 'is-active' : ''}`}
                          onClick={() => setRoundConfidenceScore(score)}
                          aria-pressed={roundConfidenceScore === score}
                          aria-label={`Confidence ${CONFIDENCE_LEVEL_LABELS[score]}`}
                          title={`Confidence: ${CONFIDENCE_LEVEL_LABELS[score]}`}
                          disabled={isRoundResolving}
                        >
                          <span className="confidence-chip-label">{CONFIDENCE_LEVEL_LABELS[score]}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

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
                      <span className="round-feedback-points-rule">Combo at streaks 3/6/9</span>
                      {roundFeedbackTone === 'error' && livesEnabled ? <span className="round-feedback-life">-1 life</span> : null}
                    </div>
                    {roundFeedbackAnswer ? (
                      <div className="round-feedback-answer">
                        <p className="round-feedback-answer-label">Correct answer</p>
                        <p className="round-feedback-answer-value">{roundFeedbackAnswer}</p>
                      </div>
                    ) : null}
                    {roundState.mode === 'narrative_story' ? (
                      <p className="round-feedback-note">Story progress updates chapter access based on stage transitions.</p>
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
            <button
              type="button"
              className="back-button back-button-icon-only"
              onClick={goHome}
              aria-label="Back to main menu"
              title="Back to main menu"
            >
              <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
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
              <p className="hero-copy">See how much you have mastered and what to tackle in your next focused run.</p>
              <div className="overview-snapshot-grid" aria-label="Session snapshot metrics">
                {summaryTiles.map((tile, index) => (
                  <article
                    key={`${tile.label}-${tile.value}`}
                    className={`overview-snapshot-tile tone-${tile.tone}`}
                    style={{ animationDelay: `${120 + index * 80}ms` }}
                    title={'note' in tile ? tile.note : undefined}
                  >
                    <p><tile.icon aria-hidden="true" className={`metric-icon icon-${tile.accent}`} strokeWidth={2.2} />{tile.label}</p>
                    <strong className="live-value">{tile.value}</strong>
                  </article>
                ))}
              </div>
            </div>
            <div className="overview-hero-actions">
              <button
                type="button"
                className="icon-action-button"
                onClick={() => void loadSummary()}
                disabled={loading}
                aria-label={loading ? 'Refreshing data' : 'Refresh data'}
                title={loading ? 'Refreshing data' : 'Refresh data'}
              >
                <RefreshCw aria-hidden="true" className={`inline-button-icon ${loading ? 'spin-icon' : ''}`} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="danger-button icon-action-button"
                onClick={() => setResetConfirmStep(1)}
                disabled={resettingDb}
                aria-label={resettingDb ? 'Resetting database' : 'Reset database'}
                title={resettingDb ? 'Resetting database' : 'Reset database'}
              >
                <AlertTriangle aria-hidden="true" className={`inline-button-icon ${resettingDb ? 'spin-icon' : ''}`} strokeWidth={2.2} />
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

          {/* ── Character mastery grid ────────────────────────────────── */}
          <section className="panel-glass char-mastery-panel">
            <button
              type="button"
              className="char-mastery-toggle"
              onClick={() => setCharMasteryExpanded((v) => !v)}
              aria-expanded={charMasteryExpanded}
            >
              <div className="panel-head char-mastery-panel-head">
                <h2 className="panel-title-with-icon"><Languages aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Character Mastery</h2>
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
                          const pct = Math.round(block.mastery * 100)
                          return (
                            <Fragment key={block.index}>
                              <button
                                type="button"
                                className={`cmb-tile ${isActive ? 'is-active' : ''}`}
                                onClick={() => setExpandedBlocks(isActive ? null : blockKey)}
                                aria-expanded={isActive}
                                aria-label={`${block.name}: ${block.unlocked ? `${pct}% mastered` : 'locked'}`}
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
                                          onClick={() => setSelectedChar({ character: char, romaji, meaning, label: 'Reading / English meaning', score: level })}
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

                {overviewKanjiLevelProgress.some((level) => level.total > 0) ? (
                  <div className="char-mastery-script">
                    <h3 className="char-mastery-script-name">Kanji by JLPT Level</h3>
                    <div className="char-mastery-tiles-grid">
                      {overviewKanjiLevelProgress.filter((level) => level.total > 0).map((level) => {
                        const blockKey = `kanji-${level.key}`
                        const isActive = expandedBlocks === blockKey
                        const pct = Math.round(level.mastery * 100)
                        const page = Math.max(1, kanjiOverviewPage[level.key] ?? 1)
                        const pageCount = Math.max(1, Math.ceil(level.cardIds.length / KANJI_OVERVIEW_PAGE_SIZE))
                        const clampedPage = Math.min(page, pageCount)
                        const start = (clampedPage - 1) * KANJI_OVERVIEW_PAGE_SIZE
                        const visibleCards = overviewKanjiDeck
                          .filter((card) => jlptTagFromCard(card) === level.key)
                          .slice(start, start + KANJI_OVERVIEW_PAGE_SIZE)
                        return (
                          <Fragment key={level.key}>
                            <button
                              type="button"
                              className={`cmb-tile ${isActive ? 'is-active' : ''}`}
                              onClick={() => {
                                setExpandedBlocks(isActive ? null : blockKey)
                                if (!isActive) {
                                  setKanjiOverviewPage((previous) => ({ ...previous, [level.key]: 1 }))
                                }
                              }}
                              aria-expanded={isActive}
                              aria-label={`${level.label}: ${pct}% mastered`}
                            >
                              <div className="cmb-tile-chars" lang="ja" aria-hidden="true">
                                {level.sampleChars.join(' ')}
                              </div>
                              <strong className="cmb-tile-name">{level.label}</strong>
                              <div className="cmb-bar-wrap">
                                <div className="cmb-bar" style={{ '--cmb-pct': `${pct}%` } as CSSProperties} />
                              </div>
                              <div className="cmb-tile-pct">{level.total} cards • {pct}%</div>
                            </button>

                            {isActive ? (
                              <div className="char-mastery-detail-inline">
                                <div className="char-mastery-chips char-mastery-chips-kanji">
                                  {visibleCards.map((card) => {
                                    const score = cardScores.kanji_n5[card.id] ?? 0
                                    const levelScore = Math.min(score, CARD_MASTERY_MAX)
                                    return (
                                      <button
                                        key={card.id}
                                        type="button"
                                        className="char-mastery-chip char-mastery-chip-kanji"
                                        data-level={levelScore}
                                        aria-label={`${card.character}, ${card.romaji}, ${card.meaning}: ${levelScore}/${CARD_MASTERY_MAX}`}
                                        onClick={() => setSelectedChar({ character: card.character, romaji: card.romaji, meaning: card.meaning, label: 'Reading / English meaning', score: levelScore })}
                                      >
                                        <span className="char-mastery-chip-glyph" lang="ja">{card.character}</span>
                                        <span className="char-mastery-chip-copy">
                                          <span className="char-mastery-chip-reading">{card.romaji}</span>
                                          <span className="char-mastery-chip-meaning">{card.meaning}</span>
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                                {pageCount > 1 ? (
                                  <div className="kanji-chip-pagination">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setKanjiOverviewPage((previous) => ({
                                          ...previous,
                                          [level.key]: Math.max(1, clampedPage - 1),
                                        }))
                                      }}
                                      disabled={clampedPage <= 1}
                                    >
                                      Previous
                                    </button>
                                    <span>Page {clampedPage} / {pageCount}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setKanjiOverviewPage((previous) => ({
                                          ...previous,
                                          [level.key]: Math.min(pageCount, clampedPage + 1),
                                        }))
                                      }}
                                      disabled={clampedPage >= pageCount}
                                    >
                                      Next
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

              </div>
            </div>
          </section>

          <section className="panel-glass activity-summary-panel overview-collapsible-panel">
            <button
              type="button"
              className="overview-panel-toggle"
              onClick={() => toggleOverviewSection('studyActivity')}
              aria-expanded={overviewSectionExpanded.studyActivity}
              aria-controls="overview-study-activity-body"
            >
              <div className="panel-head">
                <h2 className="panel-title-with-icon"><CalendarDays aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Study Activity</h2>
                <div className="panel-actions">
                  <span>Rolling windows for consistency and momentum</span>
                </div>
                <span className={`overview-panel-chevron ${overviewSectionExpanded.studyActivity ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            <div id="overview-study-activity-body" className={`overview-panel-body ${overviewSectionExpanded.studyActivity ? 'is-open' : ''}`}>
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
            </div>
          </section>

          <section className="panel-glass activity-summary-panel overview-collapsible-panel">
            <button
              type="button"
              className="overview-panel-toggle"
              onClick={() => toggleOverviewSection('contextClozeCurriculum')}
              aria-expanded={overviewSectionExpanded.contextClozeCurriculum}
              aria-controls="overview-context-cloze-curriculum-body"
            >
              <div className="panel-head">
                <h2 className="panel-title-with-icon"><BookText aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Context Cloze Curriculum</h2>
                <div className="panel-actions">
                  <span>Persisted stage progression and mode accuracy</span>
                </div>
                <span className={`overview-panel-chevron ${overviewSectionExpanded.contextClozeCurriculum ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            <div id="overview-context-cloze-curriculum-body" className={`overview-panel-body ${overviewSectionExpanded.contextClozeCurriculum ? 'is-open' : ''}`}>
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
                {ALL_SCRIPT_KEYS.map((script) => {
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
            </div>
          </section>

          <section className="panel-glass activity-summary-panel overview-collapsible-panel">
            <button
              type="button"
              className="overview-panel-toggle"
              onClick={() => toggleOverviewSection('storyProgress')}
              aria-expanded={overviewSectionExpanded.storyProgress}
              aria-controls="overview-story-progress-body"
            >
              <div className="panel-head">
                <h2 className="panel-title-with-icon"><History aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Story Progress</h2>
                <div className="panel-actions">
                  <span>Narrative attempts, chapter accuracy, and completion readiness</span>
                </div>
                <span className={`overview-panel-chevron ${overviewSectionExpanded.storyProgress ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            <div id="overview-story-progress-body" className={`overview-panel-body ${overviewSectionExpanded.storyProgress ? 'is-open' : ''}`}>
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
            </div>
          </section>

          <section className="panel-glass mistakes-summary-panel overview-collapsible-panel">
            <button
              type="button"
              className="overview-panel-toggle"
              onClick={() => toggleOverviewSection('mistakeBreakdown')}
              aria-expanded={overviewSectionExpanded.mistakeBreakdown}
              aria-controls="overview-mistake-breakdown-body"
            >
              <div className="panel-head">
                <h2 className="panel-title-with-icon"><AlertTriangle aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Mistake Breakdown</h2>
                <div className="panel-actions">
                  <span>Top weak areas by error rate</span>
                </div>
                <span className={`overview-panel-chevron ${overviewSectionExpanded.mistakeBreakdown ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            <div id="overview-mistake-breakdown-body" className={`overview-panel-body ${overviewSectionExpanded.mistakeBreakdown ? 'is-open' : ''}`}>
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
            </div>
          </section>

          <section className="panel-glass timeline-summary-panel overview-collapsible-panel">
            <button
              type="button"
              className="overview-panel-toggle"
              onClick={() => toggleOverviewSection('itemTimeline')}
              aria-expanded={overviewSectionExpanded.itemTimeline}
              aria-controls="overview-item-timeline-body"
            >
              <div className="panel-head">
                <h2 className="panel-title-with-icon"><History aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Item Timeline</h2>
                <div className="panel-actions">
                  <span>Recent review events and trend per item</span>
                </div>
                <span className={`overview-panel-chevron ${overviewSectionExpanded.itemTimeline ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            <div id="overview-item-timeline-body" className={`overview-panel-body ${overviewSectionExpanded.itemTimeline ? 'is-open' : ''}`}>
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
                        <p className="timeline-card-subhead">{formatTimelineScriptTag(item.script_tag)} • {formatTimelineDeckName(item.deck)}</p>
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
            </div>
          </section>

          <section className="panel-glass deck-panel overview-deck-panel overview-collapsible-panel">
            <button
              type="button"
              className="overview-panel-toggle"
              onClick={() => toggleOverviewSection('deckSnapshot')}
              aria-expanded={overviewSectionExpanded.deckSnapshot}
              aria-controls="overview-deck-snapshot-body"
            >
              <div className="panel-head">
                <h2 className="panel-title-with-icon"><ListChecks aria-hidden="true" className="panel-title-icon" strokeWidth={2.3} />Deck Snapshot</h2>
                <div className="panel-actions">
                  <span>Mastery and daily completion by deck</span>
                </div>
                <span className={`overview-panel-chevron ${overviewSectionExpanded.deckSnapshot ? 'is-open' : ''}`} aria-hidden="true">▾</span>
              </div>
            </button>

            <div id="overview-deck-snapshot-body" className={`overview-panel-body ${overviewSectionExpanded.deckSnapshot ? 'is-open' : ''}`}>
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
            </div>
          </section>
        </div>
      ) : null}

      {showExpertisePrompt ? (
        <div className="modal-backdrop expertise-backdrop" role="presentation">
          <div
            className="modal-panel settings-panel expertise-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expertise-title"
            aria-describedby="expertise-subtitle"
          >
            <div className="settings-modal-header">
              <div>
                <h2 id="expertise-title" className="settings-modal-title">
                  {onboardingStep === 1 ? 'Where should your learning start?' : null}
                  {onboardingStep === 2 ? 'How much should we pre-complete for you?' : null}
                  {onboardingStep === 3 ? 'Confirm your starting point' : null}
                </h2>
                <p id="expertise-subtitle" className="settings-modal-subtitle">
                  {onboardingStep === 1 ? 'Choose setup or skip. We will only ask this once.' : null}
                  {onboardingStep === 2 ? 'Choose the option that matches what you can already read today.' : null}
                  {onboardingStep === 3 ? 'You can change this later by resetting study progress in settings.' : null}
                </p>
              </div>
              <button
                type="button"
                className="onboarding-btn onboarding-btn-ghost onboarding-skip"
                onClick={skipOnboarding}
                disabled={applyingExpertise}
              >
                Skip setup
              </button>
            </div>

            <div className="onboarding-progress" aria-label="Onboarding progress">
              <span className={`onboarding-dot ${onboardingStep >= 1 ? 'is-active' : ''}`}>1</span>
              <span className={`onboarding-dot ${onboardingStep >= 2 ? 'is-active' : ''}`}>2</span>
              <span className={`onboarding-dot ${onboardingStep >= 3 ? 'is-active' : ''}`}>3</span>
            </div>

            {onboardingStep === 1 ? (
              <div className="onboarding-step">
                <p className="onboarding-callout">
                  Are you new to Japanese, or should we pre-complete basics you already know?
                </p>
                <ul className="onboarding-checklist" aria-label="What this setup does">
                  <li>Matches your starting level in one click.</li>
                  <li>Avoids repeating content you already know.</li>
                  <li>You can reset and redo this anytime.</li>
                </ul>
                <p className="settings-help">
                  Tiny quirk: choosing lower is a power move. Momentum beats ego.
                </p>
              </div>
            ) : null}

            {onboardingStep === 2 ? (
              <div className="onboarding-step">
                <p className="settings-help">
                  Be honest, not heroic. We can always level up later.
                </p>
                <div className="expertise-options" role="radiogroup" aria-label="Expertise level">
                  {EXPERTISE_OPTIONS.map((option) => (
                    <button
                      key={option.level}
                      type="button"
                      className={`expertise-option ${selectedExpertiseLevel === option.level ? 'is-active' : ''}`}
                      onClick={() => setSelectedExpertiseLevel(option.level)}
                      aria-pressed={selectedExpertiseLevel === option.level}
                      disabled={applyingExpertise}
                    >
                      <span className="expertise-option-title">{option.title}</span>
                      <span className="expertise-option-description">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {onboardingStep === 3 ? (
              <div className="onboarding-step onboarding-summary">
                <p>
                  <strong>Chosen level:</strong> {selectedExpertiseOption.title}
                </p>
                <p>
                  <strong>What will be completed:</strong> {selectedExpertiseOption.description}
                </p>
                <p className="settings-help">
                  If this looks right, press Start learning and we will apply it now.
                </p>
              </div>
            ) : null}

            {expertiseError ? <p className="expertise-error">{expertiseError}</p> : null}

            <div className="expertise-actions">
              {onboardingStep > 1 ? (
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-secondary"
                  onClick={goToPreviousOnboardingStep}
                  disabled={applyingExpertise}
                >
                  Back
                </button>
              ) : null}
              {onboardingStep < 3 ? (
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-primary"
                  onClick={goToNextOnboardingStep}
                  disabled={applyingExpertise}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-primary"
                  onClick={() => void applyExpertiseSelection()}
                  disabled={applyingExpertise}
                >
                  {applyingExpertise ? 'Applying...' : 'Start learning'}
                </button>
              )}
            </div>
          </div>
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
            className="modal-panel settings-panel settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-sheet-grabber" aria-hidden="true" />
            <div className="settings-modal-header">
              <div>
                <h2 id="settings-title" className="settings-modal-title">Control Panel</h2>
                <p className="settings-modal-subtitle">Quick app controls</p>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                x
              </button>
            </div>

            <div className="settings-sheet-body">
              <div className="settings-control-grid">
                <div className="settings-section settings-control-row settings-control-row-no-icon">
                  <div className="settings-control-content">
                    <p className="settings-section-label">Theme</p>
                    <div className="settings-theme-mode-toggle" role="radiogroup" aria-label="Appearance mode">
                      {THEME_MODE_SECTIONS.map((modeSection) => {
                        const ModeIcon = THEME_MODE_ICON[modeSection.key]
                        const isActive = settings.themeMode === modeSection.key
                        return (
                          <button
                            key={modeSection.key}
                            type="button"
                            className={`settings-icon-entry settings-theme-mode-entry ${isActive ? 'is-active' : ''}`}
                            onClick={() => setThemeMode(modeSection.key)}
                            aria-label={`Use ${modeSection.label}`}
                            aria-pressed={isActive}
                            title={modeSection.label}
                          >
                            <span className={`settings-mode-icon-button ${isActive ? 'is-enabled' : ''}`} aria-hidden="true">
                              <ModeIcon size={18} strokeWidth={2.25} aria-hidden="true" />
                            </span>
                            <span className="settings-icon-entry-label">{modeSection.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="settings-theme-mode-label">{settings.themeMode === 'dark' ? 'Dark Mode Themes' : 'Light Mode Themes'}</p>
                    <div className="settings-theme-grid" role="radiogroup" aria-label={`${settings.themeMode} theme selection`}>
                      {availableThemes.map((theme) => (
                        <button
                          key={theme.key}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.theme === theme.key ? 'is-active' : ''}`}
                          style={{ '--theme-color': THEME_SWATCH_ACCENT[theme.key] } as CSSProperties}
                          onClick={() =>
                            setSettings((prev) => ({
                              ...prev,
                              themeMode: theme.mode,
                              theme: theme.key,
                            }))
                          }
                          aria-label={`Use ${theme.label} theme`}
                          aria-pressed={settings.theme === theme.key}
                          title={theme.label}
                        >
                          <span className={`settings-theme-chip ${settings.theme === theme.key ? 'is-active' : ''}`} aria-hidden="true">
                            <span className="settings-theme-chip-core" aria-hidden="true" />
                          </span>
                          <span className="settings-icon-entry-label">{theme.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-section settings-control-row settings-control-row-no-icon">
                  <div className="settings-control-content">
                    <p className="settings-section-label">Background</p>
                    <div className="settings-background-grid" role="radiogroup" aria-label="Background selection">
                      {BACKGROUND_OPTIONS.map((background) => {
                        const isActive = settings.backgroundStyle === background.key
                        return (
                          <button
                            key={background.key}
                            type="button"
                            className={`settings-icon-entry settings-background-entry ${isActive ? 'is-active' : ''}`}
                            onClick={() => setSettings((prev) => ({ ...prev, backgroundStyle: background.key }))}
                            aria-label={`Use ${background.label} background`}
                            aria-pressed={isActive}
                            title={background.label}
                          >
                            <span
                              className={`settings-background-preview ${background.imagePath ? 'is-photo' : 'is-classic'}`}
                              aria-hidden="true"
                            >
                              {background.imagePath ? (
                                <img
                                  className="settings-background-preview-image"
                                  src={backgroundPreviewUrls[background.key] ?? resolvedBackgroundUrls[background.key]}
                                  alt=""
                                  loading="eager"
                                  decoding="async"
                                />
                              ) : null}
                            </span>
                            <span className="settings-background-copy">
                              <span className="settings-icon-entry-label">{background.label}</span>
                              <span className="settings-background-note">{background.note}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="settings-background-slider">
                      <div className="settings-background-slider-head">
                        <span>Blur amount</span>
                        <span>{clampBackgroundBlur(settings.backgroundBlur)}px</span>
                      </div>
                      <input
                        type="range"
                        min={BACKGROUND_BLUR_MIN}
                        max={BACKGROUND_BLUR_MAX}
                        step={1}
                        className="settings-range"
                        value={clampBackgroundBlur(settings.backgroundBlur)}
                        onChange={(event) => {
                          const nextBlur = Number(event.currentTarget.value)
                          setSettings((prev) => ({ ...prev, backgroundBlur: clampBackgroundBlur(nextBlur) }))
                        }}
                        aria-label="Background blur amount"
                        disabled={settings.backgroundStyle === 'classic_scene'}
                      />
                      <p className="settings-help">
                        Applies to photo backgrounds. Choose No Background to restore the simpler pre-drawing background.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="settings-section settings-control-row settings-control-row-no-icon">
                  <div className="settings-control-content">
                    <p className="settings-section-label">Font Size</p>
                    <button
                      type="button"
                      className="settings-icon-entry settings-icon-entry-button"
                      onClick={advanceFontSize}
                      aria-label={`Font size: ${FONT_SIZE_LABEL[settings.fontSize]}. Activate to cycle.`}
                      title={`Font size: ${FONT_SIZE_LABEL[settings.fontSize]}`}
                    >
                      <span className="settings-mode-icon-button" aria-hidden="true">
                        {(() => {
                          const Icon = FONT_SIZE_ICON[settings.fontSize]
                          return <Icon className="settings-option-glyph" size={18} strokeWidth={2.25} aria-hidden="true" />
                        })()}
                      </span>
                      <span className="settings-icon-entry-label">{FONT_SIZE_LABEL[settings.fontSize]}</span>
                    </button>
                  </div>
                </div>

                <div className="settings-section settings-control-row settings-control-row-no-icon">
                  <div className="settings-control-content">
                    <p className="settings-section-label">Animations</p>
                    <div className="settings-animation-grid" role="radiogroup" aria-label="Animation style">
                      {MOTION_STYLE_OPTIONS.map((motionStyle) => (
                        <button
                          key={motionStyle.key}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.motionStyle === motionStyle.key ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, motionStyle: motionStyle.key }))}
                          aria-label={`Use ${motionStyle.label} animation style`}
                          aria-pressed={settings.motionStyle === motionStyle.key}
                          title={motionStyle.label}
                        >
                          <span className={`settings-mode-icon-button ${settings.motionStyle === motionStyle.key ? 'is-enabled' : ''}`} aria-hidden="true">
                            {motionStyle.key === 'calm_fade' ? (
                              <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
                            ) : motionStyle.key === 'glide' ? (
                              <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
                            ) : (
                              <Flame size={18} strokeWidth={2.25} aria-hidden="true" />
                            )}
                          </span>
                          <span className="settings-icon-entry-label">{MOTION_STYLE_LABEL[motionStyle.key]}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.reducedMotion ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
                        aria-label={settings.reducedMotion ? 'Reduce motion enabled. Activate to disable.' : 'Reduce motion disabled. Activate to enable.'}
                        aria-pressed={settings.reducedMotion}
                        title={settings.reducedMotion ? 'Reduce motion enabled' : 'Reduce motion disabled'}
                      >
                        <span className={`settings-mode-icon-button ${settings.reducedMotion ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Activity size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">Reduce Motion</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-section settings-control-row">
                  <button
                    type="button"
                    className="settings-icon-tile"
                    onClick={() => shortcutsSectionRef.current?.focus()}
                    aria-label="Focus keyboard shortcuts"
                  >
                    <Keyboard size={18} strokeWidth={2.1} />
                  </button>
                  <div ref={shortcutsSectionRef} className="settings-control-content" tabIndex={-1}>
                    <p className="settings-section-label">Keyboard Shortcuts</p>
                    <div className="settings-shortcuts">
                      <code className="command-hint">Ctrl+,</code><span>Settings</span>
                      <code className="command-hint">Esc</code><span>Close modal / back</span>
                      <code className="command-hint">1 / 2 / 3 / 4 / 5</code><span>Learning tracks (home)</span>
                      <code className="command-hint">6</code><span>Study overview (home)</span>
                    </div>
                  </div>
                </div>
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

      <aside className="assistant-overlay" aria-live="polite" aria-label="Tutor companion">
        {assistantState ? (
          <div className="assistant-status-chip" role="status" aria-atomic="true">
            <Heart className="assistant-status-icon" strokeWidth={2.1} aria-hidden="true" />
            <div className="assistant-status-copy">
              <strong>{assistantProfile?.persona_style === 'coach' ? 'Coach' : 'Tutor'}: {formatAssistantMoodLabel(assistantState.mood)}</strong>
              <span>
                Momentum {assistantState.momentum >= 0 ? '+' : ''}{assistantState.momentum}
                {' · '}
                Focus {assistantState.focus_area}
              </span>
            </div>
          </div>
        ) : null}

        {assistantToasts.length > 0 ? (
          <div className="assistant-toast-stack" role="status" aria-label="Tutor updates">
            {assistantToasts.map((toast) => (
              <article key={toast.id} className={`assistant-toast assistant-toast-${toast.priority}`}>
                <h3>{toast.title}</h3>
                <p>{toast.body}</p>
              </article>
            ))}
          </div>
        ) : null}
      </aside>

      </div>
    </main>
  )
}

export default App
