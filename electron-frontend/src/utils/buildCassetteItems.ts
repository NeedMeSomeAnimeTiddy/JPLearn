import type { MinigameKey, MinigameStatsByScript, ScriptKey } from '../types'
import { MINIGAMES } from '../constants'

export interface CassetteItem {
  key: MinigameKey
  title: string
  description: string
  difficultyLabel: 'Easy' | 'Medium' | 'Hard'
  difficultyLevel: 'easy' | 'medium' | 'hard'
  accuracy: number
  bestStreak: number
  locked: boolean
  lockReason: string | null
}

// Difficulty data — shared between views
const MINIGAME_DIFFICULTY: Record<MinigameKey, {
  level: 'easy' | 'medium' | 'hard'
  label: 'Easy' | 'Medium' | 'Hard'
}> = {
  romaji_sprint: { level: 'easy', label: 'Easy' },
  meaning_match: { level: 'easy', label: 'Easy' },
  character_match: { level: 'easy', label: 'Easy' },
  stroke_order: { level: 'medium', label: 'Medium' },
  typed_recall: { level: 'medium', label: 'Medium' },
  speech_recall: { level: 'hard', label: 'Hard' },
  sentence_assembly: { level: 'hard', label: 'Hard' },
  particle_cloze: { level: 'hard', label: 'Hard' },
  vibe_check: { level: 'hard', label: 'Hard' },
  imposter: { level: 'hard', label: 'Hard' },
  listening_audio_first: { level: 'medium', label: 'Medium' },
  listening_prompt_first: { level: 'medium', label: 'Medium' },
  interleave_mix: { level: 'hard', label: 'Hard' },
}

interface RankedMinigameCard {
  key: MinigameKey
  title: string
  description: string
  accuracy: number
  difficulty: (typeof MINIGAME_DIFFICULTY)[MinigameKey]
  lockReason: string | null
  minigameLocked: boolean
  stats: MinigameStatsByScript[ScriptKey][MinigameKey]
  recommendationScore: number
}

interface ActiveScriptStatsLike {
  bestStreak: number
}

/**
 * Balances ranking between "needs work" and "momentum" so the top slots
 * always include cards that need the most improvement.
 */
function buildBalancedRanking(cards: RankedMinigameCard[]): RankedMinigameCard[] {
  if (cards.length <= 1) return cards

  const needsWork = [...cards].sort((left, right) => right.recommendationScore - left.recommendationScore)
  const momentum = [...cards].sort((left, right) => {
    const leftMomentum = left.accuracy + left.stats.bestStreak * 4 + Math.min(left.stats.attempted, 12)
    const rightMomentum = right.accuracy + right.stats.bestStreak * 4 + Math.min(right.stats.attempted, 12)
    return rightMomentum - leftMomentum
  })

  const seen = new Set<MinigameKey>()
  const balanced: RankedMinigameCard[] = []

  for (const card of needsWork) {
    if (balanced.length >= 2) break
    if (seen.has(card.key)) continue
    balanced.push(card)
    seen.add(card.key)
  }

  for (const card of momentum) {
    if (balanced.length >= 4) break
    if (seen.has(card.key)) continue
    balanced.push(card)
    seen.add(card.key)
  }

  for (const card of cards) {
    if (seen.has(card.key)) continue
    balanced.push(card)
    seen.add(card.key)
  }

  return balanced
}

/**
 * Build CassetteItem[] from available minigames and stats.
 * Used by both ScriptHubView (for the carousel) and MinigameSelectView (for the grid).
 */
export function buildCassetteItems(
  availableMinigames: MinigameKey[],
  minigameStats: MinigameStatsByScript,
  minigameLockReasons: Partial<Record<MinigameKey, string>>,
  activeScript: ScriptKey,
  _activeScriptStats: ActiveScriptStatsLike,
): CassetteItem[] {
  const mapped = availableMinigames
    .map((gameKey) => {
      const game = MINIGAMES.find((entry) => entry.key === gameKey)
      if (!game) return null
      const stats = minigameStats[activeScript][game.key]
      const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0
      const lockReason = minigameLockReasons[game.key] ?? null
      const unmetNeed = stats.attempted === 0 ? 100 : Math.max(0, 85 - accuracy)
      const recommendationScore = unmetNeed + Math.max(0, 6 - Math.min(stats.bestStreak, 6))

      return {
        key: game.key,
        title: game.title,
        description: game.description,
        accuracy,
        difficulty: MINIGAME_DIFFICULTY[game.key],
        lockReason,
        minigameLocked: Boolean(lockReason),
        stats,
        recommendationScore,
      } satisfies RankedMinigameCard
    })
    .filter((entry): entry is RankedMinigameCard => entry !== null)

  const ranked = buildBalancedRanking(mapped)

  return ranked.map((card) => ({
    key: card.key,
    title: card.title,
    description: card.description,
    difficultyLabel: card.difficulty.label,
    difficultyLevel: card.difficulty.level,
    accuracy: card.accuracy,
    bestStreak: card.stats.bestStreak,
    locked: card.minigameLocked,
    lockReason: card.lockReason,
  }))
}
