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
    vocab_n5: 'Words',
    grammar_patterns: 'Conversational',
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
