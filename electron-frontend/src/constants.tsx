// Shared constants extracted from App.tsx.
// Both App.tsx and view files import from here.
// eslint-disable-next-line react-refresh/only-export-components -- intentional: this file exports constants, not components
/* eslint-disable react-refresh/only-export-components */

import type { LucideIcon } from 'lucide-react'
import {
  BookText,
  Combine,
  Ear,
  FileText,
  Flame,
  History,
  Keyboard,
  Languages,
  ListChecks,
  MessageCircle,
  Mic,
  Minus,
  Palette,
  PenLine,
  Repeat2,
  Plus,
  Settings,
  Shuffle,
  Square,
  Target,
  Trophy,
  Volume2,
} from 'lucide-react'
import type {
  AnimationStyle,
  AppFontPreset,
  FontSize,
  InterleaveWeights,
  JlptLevel,
  KanjiCategory,
  KanjiCategorySlug,
  KanjiDeckSlug,
  MinigameKey,
  PlayableMinigame,
  ScriptKey,
  SettingsTabKey,
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
    key: 'handwriting',
    title: 'Handwriting',
    description: 'Draw one Japanese character in its correct stroke order.',
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
    title: 'Recognition',
    description: 'Hear a word and choose its meaning — character hidden until feedback.',
  },
  {
    key: 'dictation',
    title: 'Dictation',
    description: 'Hear a word and type it in Japanese — no visual hints.',
  },
  {
    key: 'kanji_compound_builder',
    title: 'Compound Builder',
    description: 'Build compound words from individual kanji meanings.',
  },
  {
    key: 'context_cloze',
    title: 'Context Cloze',
    description: 'Fill the missing word in a sentence from vocabulary options.',
  },
  {
    key: 'conjugation_drill',
    title: 'Conjugation Drill',
    description: 'Produce a verb or adjective in the form the round asks for.',
  },
  {
    key: 'interleave_mix',
    title: 'Interleave Mix',
    description: 'Cycle reading, meaning, and character rounds in one run.',
  },
]

export const SCRIPT_MINIGAMES: Record<ScriptKey, MinigameKey[]> = {
  hiragana: ['romaji_sprint', 'meaning_match', 'character_match', 'handwriting', 'sentence_assembly', 'particle_cloze', 'imposter', 'speech_recall', 'listening_audio_first', 'dictation', 'context_cloze', 'interleave_mix'],
  katakana: ['romaji_sprint', 'meaning_match', 'character_match', 'handwriting', 'sentence_assembly', 'particle_cloze', 'imposter', 'speech_recall', 'listening_audio_first', 'dictation', 'context_cloze', 'interleave_mix'],
  kanji_n5: [
    'romaji_sprint',
    'meaning_match',
    'character_match',
    'stroke_order',
    'handwriting',
    'typed_recall',
    'speech_recall',
    'particle_cloze',
    'imposter',
    'context_cloze',
    'listening_audio_first',
    'interleave_mix',
  ],
  vocab_n5: [
    'meaning_match',
    'conjugation_drill',
    'character_match',
    'typed_recall',
    'kanji_compound_builder',
    'speech_recall',
    'particle_cloze',
    'imposter',
    'context_cloze',
    'listening_audio_first',
    'dictation',
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
    'context_cloze',
    'listening_audio_first',
    'interleave_mix',
  ],
  sentence_examples: [
    'meaning_match',
    'character_match',
    'typed_recall',
    'speech_recall',
    'sentence_assembly',
    'imposter',
    'context_cloze',
    'listening_audio_first',
    'interleave_mix',
  ],
}

export const MINIGAME_ICONS: Record<MinigameKey, LucideIcon> = {
  romaji_sprint: Keyboard,
  meaning_match: ListChecks,
  character_match: Languages,
  stroke_order: Keyboard,
  handwriting: PenLine,
  typed_recall: Keyboard,
  speech_recall: Mic,
  sentence_assembly: Shuffle,
  particle_cloze: BookText,
  vibe_check: MessageCircle,
  imposter: History,
  listening_audio_first: Volume2,
  dictation: Ear,
  kanji_compound_builder: Combine,
  context_cloze: FileText,
  conjugation_drill: Repeat2,
  interleave_mix: Shuffle,
}

export type MinigameSkillGroupKey =
  | 'recognition'
  | 'recall'
  | 'listening'
  | 'challenge'
  | 'mixed'

export const MINIGAME_SKILL_GROUP_META: Record<
  MinigameSkillGroupKey,
  { title: string; helper: string; order: number }
> = {
  recognition: {
    title: 'Recognition',
    helper: 'Fast pattern spotting and meaning detection.',
    order: 1,
  },
  recall: {
    title: 'Recall',
    helper: 'Produce answers from memory with precision.',
    order: 2,
  },
  listening: {
    title: 'Listening',
    helper: 'Train audio-first understanding and spoken recall.',
    order: 3,
  },
  challenge: {
    title: 'Challenge',
    helper: 'Harder contextual rounds for deeper fluency.',
    order: 4,
  },
  mixed: {
    title: 'Mixed',
    helper: 'Blend multiple modes into one focused run.',
    order: 5,
  },
}

export const MINIGAME_SKILL_GROUP: Record<MinigameKey, MinigameSkillGroupKey> = {
  romaji_sprint: 'recognition',
  meaning_match: 'recognition',
  character_match: 'recognition',
  stroke_order: 'recall',
  handwriting: 'recall',
  typed_recall: 'recall',
  speech_recall: 'recall',
  sentence_assembly: 'listening',
  particle_cloze: 'challenge',
  vibe_check: 'challenge',
  imposter: 'challenge',
  listening_audio_first: 'listening',
  dictation: 'listening',
  kanji_compound_builder: 'recognition',
  context_cloze: 'challenge',
  conjugation_drill: 'recall',
  interleave_mix: 'mixed',
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

export const FEEDBACK_COPY = {
  REVIEW_SAVING: 'Saving review progress…',
  REVIEW_SAVE_FAILURE: 'We couldn’t save this review answer, so the review has not advanced. Use Back to return to Daily Games safely.',
  ANSWERED_IN: (ms: number) => `${(ms / 1000).toFixed(2)}s`,
  NEXT_REVIEW_IN: (days: number) =>
    `Next review in ${days <= 0 ? '1 day' : `${days} days`}`,
} as const

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
  'n4_school_work',
  'n4_home_living',
  'n4_travel_places',
  'n4_feelings_character',
  'n3_work_business',
  'n3_emotion_mind',
  'n3_society_people',
  'n3_nature_science',
  'n2_economy_trade',
  'n2_government_society',
  'n2_measure_analysis',
  'n2_land_construction',
  'n1_law_justice',
  'n1_thought_reason',
  'n1_conflict_crisis',
  'n1_arts_expression',
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
  n4_school_work:        'N4 · School & Work',
  n4_home_living:        'N4 · Home & Living',
  n4_travel_places:      'N4 · Travel & Places',
  n4_feelings_character: 'N4 · Feelings & Character',
  n3_work_business:      'N3 · Work & Business',
  n3_emotion_mind:       'N3 · Emotion & Mind',
  n3_society_people:     'N3 · Society & People',
  n3_nature_science:     'N3 · Nature & Science',
  n2_economy_trade:      'N2 · Economy & Trade',
  n2_government_society: 'N2 · Government & Society',
  n2_measure_analysis:   'N2 · Measurement & Analysis',
  n2_land_construction:  'N2 · Land & Construction',
  n1_law_justice:        'N1 · Law & Justice',
  n1_thought_reason:     'N1 · Thought & Reason',
  n1_conflict_crisis:    'N1 · Conflict & Crisis',
  n1_arts_expression:    'N1 · Arts & Expression',
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
  n4_school_work:        'vocab_n4_school_work',
  n4_home_living:        'vocab_n4_home_living',
  n4_travel_places:      'vocab_n4_travel_places',
  n4_feelings_character: 'vocab_n4_feelings_character',
  n3_work_business:      'vocab_n3_work_business',
  n3_emotion_mind:       'vocab_n3_emotion_mind',
  n3_society_people:     'vocab_n3_society_people',
  n3_nature_science:     'vocab_n3_nature_science',
  n2_economy_trade:      'vocab_n2_economy_trade',
  n2_government_society: 'vocab_n2_government_society',
  n2_measure_analysis:   'vocab_n2_measure_analysis',
  n2_land_construction:  'vocab_n2_land_construction',
  n1_law_justice:        'vocab_n1_law_justice',
  n1_thought_reason:     'vocab_n1_thought_reason',
  n1_conflict_crisis:    'vocab_n1_conflict_crisis',
  n1_arts_expression:    'vocab_n1_arts_expression',
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
  if (mode === 'handwriting') return 'Handwriting'
  if (mode === 'typed_recall') return 'Typed Recall'
  if (mode === 'speech_recall') return 'Speech Recall'
  if (mode === 'sentence_assembly') return 'Sentence Assembly'
  if (mode === 'particle_cloze') return 'Particle Cloze'
  if (mode === 'vibe_check') return 'Vibe Check'
  if (mode === 'imposter') return 'Imposter'
  if (mode === 'listening_audio_first') return 'Recognition'
  if (mode === 'dictation') return 'Dictation'
  if (mode === 'kanji_compound_builder') return 'Compound Builder'
  if (mode === 'context_cloze') return 'Context Cloze'
  if (mode === 'conjugation_drill') return 'Conjugation Drill'
  return 'Interleave Mix'
}

export function formatFeedbackAnswerLabel(_mode: PlayableMinigame): string {
  return 'Your answer'
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


// ── App shell / appearance ────────────────────────────────────

export const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string; icon: LucideIcon }> = [
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'assistant', label: 'Assistant', icon: MessageCircle },
  { key: 'system', label: 'System', icon: Settings },
]

export const DEFAULT_INTERLEAVE_WEIGHTS: InterleaveWeights = {
  romaji_sprint: 1,
  meaning_match: 1,
  character_match: 1,
  particle_cloze: 1,
}

export const PETAL_STREAM = [
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

export const FONT_SIZE_ORDER: FontSize[] = ['small', 'medium', 'large']

export const FONT_SIZE_ICON: Record<FontSize, LucideIcon> = {
  small: Minus,
  medium: Square,
  large: Plus,
}

export const FONT_SIZE_LABEL: Record<FontSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

export const APP_FONT_OPTIONS: Array<{ key: AppFontPreset; label: string }> = [
  { key: 'kiwi_maru', label: 'Kiwi Maru' },
  { key: 'bizin_gothic', label: 'BIZ UDPGothic' },
  { key: 'kaisei_decol', label: 'Kaisei Decol' },
  { key: 'noto_sans_jp', label: 'Noto Sans JP' },
  { key: 'shippori_mincho', label: 'Shippori Mincho' },
  { key: 'zen_old_mincho', label: 'Zen Old Mincho' },
  { key: 'reggae_one', label: 'Reggae One' },
  { key: 'system_ui', label: 'System UI' },
]

export function isAppFontPreset(value: unknown): value is AppFontPreset {
  return (
    value === 'kiwi_maru'
    || value === 'bizin_gothic'
    || value === 'kaisei_decol'
    || value === 'noto_sans_jp'
    || value === 'shippori_mincho'
    || value === 'zen_old_mincho'
    || value === 'reggae_one'
    || value === 'system_ui'
  )
}

export const MOTION_STYLE_OPTIONS: Array<{ key: AnimationStyle; label: string }> = [
  { key: 'calm_fade', label: 'Calm Fade' },
  { key: 'glide', label: 'Glide' },
  { key: 'lively', label: 'Lively' },
]

export const MOTION_STYLE_LABEL: Record<AnimationStyle, string> = {
  calm_fade: 'Calm Fade',
  glide: 'Glide',
  lively: 'Lively',
}

export const CARD_MASTERY_MAX = 4 // Max score per card; reach this to fully master a card.

// Reason codes from domain/recommendation.py, as the badge on an "Up next" row.
// Each says why the engine raised the row, which is also what decides the drill
// it launches — see domain/study_route.choose_route.
export const RECOMMENDATION_REASON_LABELS: Record<string, string> = {
  high_error_rate: 'Needs work',
  leeches_detected: 'Problem items',
  new_content_ready: 'New content',
  overdue_reviews: 'Overdue',
  streak_recovery: 'Warm-up',
  progression_milestone: 'Just unlocked',
  weak_retention: 'Fading',
  balanced_review: 'Review',
}

export const DIFFICULTY_DOTS: Record<string, string> = {
  easy: '●○○',
  normal: '●●○',
  challenging: '●●●',
}
