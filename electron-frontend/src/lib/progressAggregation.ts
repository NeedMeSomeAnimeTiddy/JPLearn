import type {
  CategoryProgress, JlptLevel, JlptLevelProgress, JlptProgressCard, ScriptDeck,
} from '../types'
import { CARD_MASTERY_MAX, CATEGORY_UNLOCK_THRESHOLD, JLPT_LEVEL_LABELS, JLPT_LEVEL_ORDER } from '../constants'

export function jlptTagFromCard(card: Pick<ScriptDeck['cards'][number], 'tags'>): JlptLevel {
  for (const tag of card.tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized === 'n5' || normalized === 'n4' || normalized === 'n3' || normalized === 'n2' || normalized === 'n1') {
      return normalized
    }
  }
  return 'n5'
}

export function buildJlptLevelProgress(cards: JlptProgressCard[], scores: Record<number, number>): JlptLevelProgress[] {
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

export function buildJlptLevelProgressFromLevelDecks(
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

/** Build thematic category progress for vocab or kanji sections.
 *  First category is always unlocked; subsequent categories unlock when
 *  the previous reaches CATEGORY_UNLOCK_THRESHOLD (70%). */

export function buildCategoryProgress<T extends string>(
  categoryOrder: T[],
  categoryLabels: Record<T, string>,
  categoryToSlug: Record<T, string>,
  categoryDecks: Record<T, ScriptDeck['cards']>,
  scores: Record<number, number>,
): CategoryProgress[] {
  let canUnlockNext = true
  return categoryOrder.map((category) => {
    const categoryCards = categoryDecks[category] ?? []
    const total = categoryCards.length
    const totalScore = categoryCards.reduce((sum, card) => sum + (scores[card.id] ?? 0), 0)
    const mastery = total > 0 ? totalScore / (CARD_MASTERY_MAX * total) : 0
    const unlocked = canUnlockNext  // first category always unlocked; rest need prior
    if (total > 0 && mastery < CATEGORY_UNLOCK_THRESHOLD) {
      canUnlockNext = false
    }
    return {
      key: category,
      label: categoryLabels[category],
      slug: categoryToSlug[category],
      cardIds: categoryCards.map((card) => card.id),
      sampleChars: categoryCards.slice(0, 3).map((card) => card.character),
      mastery,
      unlocked,
      total,
    }
  })
}
