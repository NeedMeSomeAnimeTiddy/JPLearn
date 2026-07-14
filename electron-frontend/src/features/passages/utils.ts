import type { Passage } from './types'
import { DIFFICULTY_ORDER } from './constants'

export function sortByDifficulty(passages: Passage[]): Passage[] {
  return [...passages].sort((a, b) => {
    const orderA = DIFFICULTY_ORDER[a.difficulty_label] ?? 99
    const orderB = DIFFICULTY_ORDER[b.difficulty_label] ?? 99
    if (orderA !== orderB) return orderA - orderB
    return a.difficulty - b.difficulty
  })
}

export function toggleFurigana(text: string): string {
  return text.replace(/（[^）]*）/g, '')
}

export function hasFurigana(text: string): boolean {
  return /（[^）]*）/.test(text)
}
