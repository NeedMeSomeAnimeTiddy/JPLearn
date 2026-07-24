// Pure utility functions extracted from App.tsx.

import type { JlptLevel } from './types'

// ── Text normalization ────────────────────────────────────────────────────────

export function sanitizeRomajiInput(value: string): string {
  return value.replace(/[^a-zA-Z\s]/g, '')
}

export function normalizeRomajiQuery(value: string): string {
  return sanitizeRomajiInput(value).toLowerCase().trim()
}

export function toTitleWords(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatTimelineScriptTag(tag: string): string {
  const LABELS: Record<string, string> = {
    hiragana: 'Hiragana',
    katakana: 'Katakana',
    kanji_n5: 'Kanji',
    vocab_n5: 'Vocabulary',
    grammar_patterns: 'Grammar',
    unknown: 'General',
  }
  const normalized = tag.trim().toLowerCase()
  return LABELS[normalized] ?? toTitleWords(normalized || 'general')
}

export function formatTimelineDeckName(deckName: string): string {
  const trimmed = deckName.trim()
  if (!trimmed) return 'Review Deck'
  return toTitleWords(trimmed)
}

// ── Romaji / stroke order ────────────────────────────────────────────────────

interface CardWithRomaji {
  id: number
  character: string
  romaji: string
}

export function getStrokeOrderCandidates<T extends CardWithRomaji>(
  cards: T[],
  query: string,
): T[] {
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

// ── JLPT tag extraction ──────────────────────────────────────────────────────

interface CardWithTags {
  tags: string[]
}

// ── Minigame mode helpers ────────────────────────────────────────────────────

export function isGrammarCurriculumMode(mode: string): boolean {
  return mode === 'sentence_assembly' || mode === 'particle_cloze' || mode === 'vibe_check' || mode === 'imposter'
}

// ── JLPT tag extraction ──────────────────────────────────────────────────────

export function jlptTagFromCard(card: CardWithTags): JlptLevel {
  for (const tag of card.tags) {
    const normalized = tag.trim().toLowerCase()
    if (
      normalized === 'n5' ||
      normalized === 'n4' ||
      normalized === 'n3' ||
      normalized === 'n2' ||
      normalized === 'n1'
    ) {
      return normalized
    }
  }
  return 'n5'
}

// ── Tag display ────────────────────────────────────────────────────────────────

const TAG_LABELS: Record<string, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji: 'Kanji',
  vocab: 'Vocab',
  grammar: 'Grammar',
  sentence: 'Sentence',
  example: 'Example',
  conjugation: 'Conjugation',
  n5: 'N5',
  n4: 'N4',
  n3: 'N3',
  n2: 'N2',
  n1: 'N1',
  kanji_numbers_time: 'Numbers & Time',
  kanji_nature_world: 'Nature & World',
  kanji_people_body: 'People & Body',
  kanji_study_language: 'Study & Language',
  kanji_actions_travel: 'Actions & Travel',
  vocab_greetings: 'Greetings',
  vocab_numbers: 'Numbers',
  vocab_time_days: 'Time & Days',
  vocab_family: 'Family',
  vocab_body: 'Body',
  vocab_food_drink: 'Food & Drink',
  vocab_school_study: 'School & Study',
  vocab_places: 'Places',
  vocab_transport: 'Transport',
  vocab_adjectives: 'Adjectives',
  vocab_verbs: 'Verbs',
  vocab_nouns: 'Nouns',
  vocab_n4_school_work: 'School & Work',
  vocab_n4_home_living: 'Home & Living',
  vocab_n4_travel_places: 'Travel & Places',
  vocab_n4_feelings_character: 'Feelings & Character',
  vocab_n3_work_business: 'Work & Business',
  vocab_n3_emotion_mind: 'Emotion & Mind',
  vocab_n3_society_people: 'Society & People',
  vocab_n3_nature_science: 'Nature & Science',
  vocab_n2_economy_trade: 'Economy & Trade',
  vocab_n2_government_society: 'Government & Society',
  vocab_n2_measure_analysis: 'Measurement & Analysis',
  vocab_n2_land_construction: 'Land & Construction',
  vocab_n1_law_justice: 'Law & Justice',
  vocab_n1_thought_reason: 'Thought & Reason',
  vocab_n1_conflict_crisis: 'Conflict & Crisis',
  vocab_n1_arts_expression: 'Arts & Expression',
  offline_dictionary: 'Dictionary',
}

export function formatTagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function blankOutWordInSentence(sentence: string, word: string): string | null {
  const index = sentence.indexOf(word)
  if (index === -1) return null
  const before = sentence.slice(0, index)
  const after = sentence.slice(index + word.length)
  return `${before}___${after}`
}
