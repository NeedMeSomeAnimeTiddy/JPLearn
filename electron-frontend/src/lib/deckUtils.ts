import type { BlockInfo, InterleaveWeights, PlayableMinigame, ScriptDeck, ScriptKey } from '../types'

export function normalizeDeckCards(cards: unknown): ScriptDeck['cards'] {
  return Array.isArray(cards) ? cards as ScriptDeck['cards'] : []
}

export const SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT = 1200

export function limitRuntimeDeckCards(script: ScriptKey, cards: ScriptDeck['cards']): ScriptDeck['cards'] {
  if (script !== 'sentence_examples') {
    return cards
  }
  if (cards.length <= SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT) {
    return cards
  }
  return cards.slice(0, SENTENCE_EXAMPLES_RUNTIME_CARD_LIMIT)
}

export function normalizeBlockList(blocks: unknown): BlockInfo[] {
  return Array.isArray(blocks) ? blocks as BlockInfo[] : []
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function chooseUniqueIndices(length: number, count: number, exclude: number): number[] {
  const picks = new Set<number>()
  while (picks.size < Math.min(count, Math.max(0, length - 1))) {
    const candidate = Math.floor(Math.random() * length)
    if (candidate !== exclude) picks.add(candidate)
  }
  return [...picks]
}

export function shuffleArray<T>(items: T[]): T[] {
  const clone = [...items]
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]]
  }
  return clone
}

export function clampWeight(value: number): number {
  return Math.max(1, Math.min(5, Math.floor(value)))
}

export function buildInterleaveSequence(
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
