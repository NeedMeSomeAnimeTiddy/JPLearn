// Shared constants extracted from App.tsx.
// Both App.tsx and view files import from here.
// eslint-disable-next-line react-refresh/only-export-components -- intentional: this file exports constants, not components
/* eslint-disable react-refresh/only-export-components */

import type { LucideIcon } from 'lucide-react'
import {
  BookText,
  Flame,
  History,
  Keyboard,
  Languages,
  ListChecks,
  MessageCircle,
  Mic,
  Minus,
  Plus,
  Shuffle,
  Square,
  Target,
  Trophy,
  Volume2,
} from 'lucide-react'
import type {
  JlptLevel,
  KanjiCategory,
  KanjiCategorySlug,
  KanjiDeckSlug,
  MinigameKey,
  PlayableMinigame,
  ScriptKey,
  VocabCategory,
  VocabCategorySlug,
  VocabDeckSlug,
} from './types'

// ── Script metadata ──────────────────────────────────────────────────────────

export const ALL_SCRIPT_KEYS = [
  'hiragana',
  'katakana',
  'kanji_n5',
  'vocab_n5',
  'grammar_patterns',
  'sentence_examples',
] as const

export const SCRIPT_LABELS: Record<ScriptKey, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
  vocab_n5: 'Vocabulary',
  grammar_patterns: 'Grammar',
  sentence_examples: 'Sentences',
}

export const TIMELINE_SCRIPT_LABELS: Record<string, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
  vocab_n5: 'Vocabulary',
  grammar_patterns: 'Grammar',
  sentence_examples: 'Sentences',
  unknown: 'General',
}

export const SCRIPT_MENU_LINES: Record<ScriptKey, string> = {
  hiragana: 'Start with smooth, foundational sounds.',
  katakana: 'Train sharp symbols for names and loanwords.',
  kanji_n5: 'Build meaning recall one character at a time.',
  vocab_n5: 'Learn everyday words grouped by topic.',
  grammar_patterns: 'Practice grammar patterns and sentence flow.',
  sentence_examples: 'Train full Japanese sentences with context-first recall.',
}

export const SCRIPT_DIFFICULTY_META: Record<
  ScriptKey,
  { label: string; tier: 1 | 2 | 3 | 4 | 5; icon: LucideIcon }
> = {
  hiragana: { label: 'Easy', tier: 1, icon: BookText },
  katakana: { label: 'Easy+', tier: 2, icon: Languages },
  kanji_n5: { label: 'Medium', tier: 3, icon: Target },
  vocab_n5: { label: 'Hard', tier: 4, icon: Flame },
  grammar_patterns: { label: 'Expert', tier: 5, icon: Trophy },
  sentence_examples: { label: 'Expert+', tier: 5, icon: History },
}

export const SECTION_META: Record<ScriptKey, { glyph: string }> = {
  hiragana: { glyph: 'あ' },
  katakana: { glyph: 'ア' },
  kanji_n5: { glyph: '漢' },
  vocab_n5: { glyph: '語' },
  grammar_patterns: { glyph: '話' },
  sentence_examples: { glyph: '文' },
}

// ── Minigame metadata ────────────────────────────────────────────────────────

export const MINIGAMES: Array<{ key: MinigameKey; title: string; description: string }> = [
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
    key: 'speech_recall',
    title: 'Speech Recall',
    description: 'Say the meaning aloud — transcribed and graded offline.',
  },
  {
    key: 'sentence_assembly',
    title: 'Sentence Assembly',
    description: 'Arrange shuffled sentence chunks into natural Japanese order.',
  },
  {
    key: 'particle_cloze',
    title: 'Particle Cloze',
    description: 'Fill the missing particle using sentence context and word order cues.',
  },
  {
    key: 'vibe_check',
    title: 'Vibe Check',
    description: 'Read social tone and pick the best context for the sentence register.',
  },
  {
    key: 'imposter',
    title: 'Imposter',
    description: 'Find the token with a deliberate grammar error in a sentence.',
  },
  {
    key: 'listening_audio_first',
    title: 'Listening: Audio First',
    description: 'Hear a word and choose its meaning — character hidden until feedback.',
  },
  {
    key: 'listening_prompt_first',
    title: 'Listening: Prompt First',
    description: 'See the character while audio plays, then choose the meaning.',
  },
  {
    key: 'interleave_mix',
    title: 'Interleave Mix',
    description: 'Cycle reading, meaning, and character rounds in one run.',
  },
]

export const SCRIPT_MINIGAMES: Record<ScriptKey, MinigameKey[]> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match', 'sentence_assembly', 'particle_cloze', 'imposter', 'interleave_mix'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match', 'sentence_assembly', 'particle_cloze', 'imposter', 'interleave_mix'],
  kanji_n5: [
    'romaji_sprint',
    'meaning_match',
    'character_match',
    'stroke_order',
    'typed_recall',
    'speech_recall',
    'sentence_assembly',
    'particle_cloze',
    'imposter',
    'listening_audio_first',
    'listening_prompt_first',
    'interleave_mix',
  ],
  vocab_n5: [
    'meaning_match',
    'character_match',
    'typed_recall',
    'speech_recall',
    'particle_cloze',
    'imposter',
    'listening_audio_first',
    'listening_prompt_first',
    'interleave_mix',
  ],
  grammar_patterns: [
    'meaning_match',
    'character_match',
    'typed_recall',
    'speech_recall',
    'sentence_assembly',
    'particle_cloze',
    'vibe_check',
    'imposter',
    'listening_audio_first',
    'listening_prompt_first',
    'interleave_mix',
  ],
  sentence_examples: [
    'meaning_match',
    'character_match',
    'typed_recall',
    'speech_recall',
    'sentence_assembly',
    'imposter',
    'listening_audio_first',
    'listening_prompt_first',
    'interleave_mix',
  ],
}

export const MINIGAME_ICONS: Record<MinigameKey, LucideIcon> = {
  romaji_sprint: Keyboard,
  meaning_match: ListChecks,
  character_match: Languages,
  stroke_order: Keyboard,
  typed_recall: Keyboard,
  speech_recall: Mic,
  sentence_assembly: Shuffle,
  particle_cloze: BookText,
  vibe_check: MessageCircle,
  imposter: History,
  listening_audio_first: Volume2,
  listening_prompt_first: Volume2,
  interleave_mix: Shuffle,
}

// ── Session configuration ────────────────────────────────────────────────────

export const DEFAULT_LIVES = 3

export const SESSION_LENGTH_PRESETS = [
  { key: 'short', label: 'Short', items: 8, icon: Minus },
  { key: 'medium', label: 'Medium', items: 12, icon: Square },
  { key: 'long', label: 'Long', items: 20, icon: Plus },
] as const

export const DEFAULT_SESSION_LENGTH_PRESET = SESSION_LENGTH_PRESETS[1]

export const CONFIDENCE_SCORES = [1, 3, 5] as const

export const CONFIDENCE_LEVEL_LABELS: Record<(typeof CONFIDENCE_SCORES)[number], string> = {
  1: 'Low',
  3: 'Mid',
  5: 'High',
}

export const POINT_COMBO_THRESHOLDS = [3, 6, 9] as const

export const POINTS_RULE_COPY =
  '1 point per correct answer, with combo bonuses at streaks 3, 6, and 9 (max 4 points).'

// ── JLPT level metadata ──────────────────────────────────────────────────────

export const JLPT_LEVEL_ORDER: JlptLevel[] = ['n5', 'n4', 'n3', 'n2', 'n1']

export const JLPT_LEVEL_LABELS: Record<JlptLevel, string> = {
  n5: 'JLPT N5',
  n4: 'JLPT N4',
  n3: 'JLPT N3',
  n2: 'JLPT N2',
  n1: 'JLPT N1',
}

export const KANJI_LEVEL_TO_DECK_SLUG: Record<JlptLevel, KanjiDeckSlug> = {
  n5: 'kanji_n5',
  n4: 'kanji_n4',
  n3: 'kanji_n3',
  n2: 'kanji_n2',
  n1: 'kanji_n1',
}

export const VOCAB_LEVEL_TO_DECK_SLUG: Record<JlptLevel, VocabDeckSlug> = {
  n5: 'vocab_n5',
  n4: 'vocab_n4',
  n3: 'vocab_n3',
  n2: 'vocab_n2',
  n1: 'vocab_n1',
}

export const KANJI_OVERVIEW_PAGE_SIZE = 45

// ── Thematic category metadata ────────────────────────────────────────────────

/** Mastery fraction of the previous category needed to unlock the next one. */
export const CATEGORY_UNLOCK_THRESHOLD = 0.7

export const VOCAB_CATEGORY_ORDER: VocabCategory[] = [
  'greetings',
  'numbers',
  'time_days',
  'family',
  'body',
  'food_drink',
  'school_study',
  'places',
  'transport',
  'adjectives',
  'verbs',
  'nouns',
]

export const VOCAB_CATEGORY_LABELS: Record<VocabCategory, string> = {
  greetings:    'Greetings',
  numbers:      'Numbers',
  time_days:    'Time & Days',
  family:       'Family',
  body:         'Body',
  food_drink:   'Food & Drink',
  school_study: 'School & Study',
  places:       'Places',
  transport:    'Transport',
  adjectives:   'Adjectives',
  verbs:        'Verbs',
  nouns:        'Common Nouns',
}

export const VOCAB_CATEGORY_TO_DECK_SLUG: Record<VocabCategory, VocabCategorySlug> = {
  greetings:    'vocab_greetings',
  numbers:      'vocab_numbers',
  time_days:    'vocab_time_days',
  family:       'vocab_family',
  body:         'vocab_body',
  food_drink:   'vocab_food_drink',
  school_study: 'vocab_school_study',
  places:       'vocab_places',
  transport:    'vocab_transport',
  adjectives:   'vocab_adjectives',
  verbs:        'vocab_verbs',
  nouns:        'vocab_nouns',
}

export const KANJI_CATEGORY_ORDER: KanjiCategory[] = [
  'numbers_time',
  'nature_world',
  'people_body',
  'study_language',
  'actions_travel',
  'n4_society_roles',
  'n4_mind_thought',
  'n4_daily_life',
  'n4_time_action',
  'n3_governance',
  'n3_communication',
  'n3_movement',
  'n3_achievement',
  'n2_professionalism',
  'n2_economics',
  'n2_analysis',
  'n1_law_order',
  'n1_ideology',
  'n1_literary',
]

export const KANJI_CATEGORY_LABELS: Record<KanjiCategory, string> = {
  numbers_time:       'N5 · Numbers & Time',
  nature_world:       'N5 · Nature & World',
  people_body:        'N5 · People & Body',
  study_language:     'N5 · Study & Language',
  actions_travel:     'N5 · Actions & Travel',
  n4_society_roles:   'N4 · Society & Roles',
  n4_mind_thought:    'N4 · Mind & Thought',
  n4_daily_life:      'N4 · Daily Life',
  n4_time_action:     'N4 · Time & Action',
  n3_governance:      'N3 · Governance',
  n3_communication:   'N3 · Communication',
  n3_movement:        'N3 · Movement',
  n3_achievement:     'N3 · Achievement',
  n2_professionalism: 'N2 · Professionalism',
  n2_economics:       'N2 · Economics',
  n2_analysis:        'N2 · Analysis',
  n1_law_order:       'N1 · Law & Order',
  n1_ideology:        'N1 · Society & Power',
  n1_literary:        'N1 · Literary Arts',
}

export const KANJI_CATEGORY_TO_DECK_SLUG: Record<KanjiCategory, KanjiCategorySlug> = {
  numbers_time:       'kanji_numbers_time',
  nature_world:       'kanji_nature_world',
  people_body:        'kanji_people_body',
  study_language:     'kanji_study_language',
  actions_travel:     'kanji_actions_travel',
  n4_society_roles:   'kanji_n4_society_roles',
  n4_mind_thought:    'kanji_n4_mind_thought',
  n4_daily_life:      'kanji_n4_daily_life',
  n4_time_action:     'kanji_n4_time_action',
  n3_governance:      'kanji_n3_governance',
  n3_communication:   'kanji_n3_communication',
  n3_movement:        'kanji_n3_movement',
  n3_achievement:     'kanji_n3_achievement',
  n2_professionalism: 'kanji_n2_professionalism',
  n2_economics:       'kanji_n2_economics',
  n2_analysis:        'kanji_n2_analysis',
  n1_law_order:       'kanji_n1_law_order',
  n1_ideology:        'kanji_n1_ideology',
  n1_literary:        'kanji_n1_literary',
}

// ── Interleave ───────────────────────────────────────────────────────────────

type InterleaveWeightKey = 'romaji_sprint' | 'meaning_match' | 'character_match' | 'particle_cloze'

export const SCRIPT_INTERLEAVE_MODES: Record<ScriptKey, Array<InterleaveWeightKey>> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match'],
  kanji_n5: ['romaji_sprint', 'meaning_match', 'character_match'],
  vocab_n5: ['meaning_match', 'character_match', 'particle_cloze'],
  grammar_patterns: ['meaning_match', 'character_match', 'particle_cloze'],
  sentence_examples: ['meaning_match', 'character_match', 'particle_cloze'],
}

// ── Round display helpers ────────────────────────────────────────────────────

export function formatRoundModeLabel(mode: PlayableMinigame): string {
  if (mode === 'romaji_sprint') return 'Romaji Sprint'
  if (mode === 'meaning_match') return 'Meaning Match'
  if (mode === 'character_match') return 'Character Match'
  if (mode === 'stroke_order') return 'Stroke Order'
  if (mode === 'typed_recall') return 'Typed Recall'
  if (mode === 'speech_recall') return 'Speech Recall'
  if (mode === 'sentence_assembly') return 'Sentence Assembly'
  if (mode === 'particle_cloze') return 'Particle Cloze'
  if (mode === 'vibe_check') return 'Vibe Check'
  if (mode === 'imposter') return 'Imposter'
  if (mode === 'listening_audio_first') return 'Listening: Audio First'
  if (mode === 'listening_prompt_first') return 'Listening: Prompt First'
  return 'Interleave Mix'
}

export function formatFeedbackAnswerLabel(mode: PlayableMinigame): string {
  if (mode === 'romaji_sprint') return 'The reading'
  if (mode === 'stroke_order' || mode === 'character_match') return 'The character'
  if (mode === 'sentence_assembly') return 'Correct order'
  return 'The answer'
}

export function formatExpectedAnswer(rawAnswer: string): string {
  const compact = rawAnswer.trim().replace(/\s+/g, ' ')
  if (!compact) return rawAnswer
  const parts = compact
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length <= 1) return compact
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`
}
