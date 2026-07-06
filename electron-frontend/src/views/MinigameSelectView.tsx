import { useState, useMemo } from 'react'
import { ArrowLeft, Grid3x3 } from 'lucide-react'
import type { MinigameKey, MinigameStats, MinigameStatsByScript, NavDirection, ScriptKey } from '../types'
import { MINIGAMES, MINIGAME_DIFFICULTY, MINIGAME_SKILL_GROUP, buildBalancedRanking } from '../constants'
import type { RankedMinigameCard, MinigameSkillGroupKey } from '../constants'
import { MinigameCard } from '../components/MinigameCard'
import type { MinigameCardData } from '../components/MinigameCard'
import { MinigameDetailPanel } from '../components/MinigameDetailPanel'
import { MinigameGrid } from '../components/MinigameGrid'
import { FilterSortBar } from '../components/FilterSortBar'
import type { DifficultyFilterValue, SortMode } from '../components/FilterSortBar'

interface MinigameSelectViewProps {
  navDirection: NavDirection
  activeScript: ScriptKey
  activeGame: MinigameKey
  availableMinigames: MinigameKey[]
  minigameStats: MinigameStatsByScript
  activeScriptStats: { bestStreak: number }
  minigameLockReasons: Partial<Record<MinigameKey, string>>
  onBack: () => void
  onSelectGame: (game: MinigameKey) => void
  onPlayGame: (game: MinigameKey) => void
  onOpenSettings: () => void
}

function emptyStats(): MinigameStats {
  return { attempted: 0, correct: 0, currentStreak: 0, bestStreak: 0, points: 0 }
}

export function MinigameSelectView({
  navDirection,
  activeScript,
  activeGame,
  availableMinigames,
  minigameStats,
  activeScriptStats,
  minigameLockReasons,
  onBack,
  onSelectGame,
  onPlayGame,
  onOpenSettings: _onOpenSettings,
}: MinigameSelectViewProps) {
  const [skillGroupFilter, setSkillGroupFilter] = useState<MinigameSkillGroupKey | null>(null)
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilterValue>('all')
  const [sortMode, setSortMode] = useState<SortMode>('recommended')

  const perScriptStats = minigameStats[activeScript] ?? ({} as Record<MinigameKey, MinigameStats>)

  const rankedCards: RankedMinigameCard[] = useMemo(() => {
    return availableMinigames.map((key) => {
      const diff = MINIGAME_DIFFICULTY[key] ?? { level: 'medium' as const, label: 'Medium' as const }
      const stats = perScriptStats[key] ?? emptyStats()
      const accuracy = stats.attempted > 0
        ? Math.round((stats.correct / stats.attempted) * 100)
        : 0
      const unmetNeed = stats.attempted === 0 ? 100 : Math.max(0, 85 - accuracy)
      const recommendationScore = unmetNeed + Math.max(0, 6 - Math.min(stats.bestStreak, 6))

      return {
        key,
        title: MINIGAMES.find((m) => m.key === key)?.title ?? key,
        description: MINIGAMES.find((m) => m.key === key)?.description ?? '',
        accuracy,
        difficulty: diff,
        lockReason: minigameLockReasons[key] ?? null,
        minigameLocked: Boolean(minigameLockReasons[key]),
        stats,
        recommendationScore,
      } satisfies RankedMinigameCard
    })
  }, [availableMinigames, perScriptStats, minigameLockReasons])

  const filteredCards = useMemo(() => {
    let cards = rankedCards

    if (skillGroupFilter) {
      cards = cards.filter((c) => MINIGAME_SKILL_GROUP[c.key] === skillGroupFilter)
    }

    if (difficultyFilter !== 'all') {
      cards = cards.filter((c) => c.difficulty.label.toLowerCase() === difficultyFilter)
    }

    switch (sortMode) {
      case 'recommended':
        cards = buildBalancedRanking(cards)
        break
      case 'difficulty':
        cards = [...cards].sort((a, b) => {
          const order = { easy: 0, medium: 1, hard: 2 }
          return order[a.difficulty.level] - order[b.difficulty.level]
        })
        break
      case 'recent':
      default:
        cards = [...cards].sort((a, b) => b.recommendationScore - a.recommendationScore)
        break
    }

    return cards
  }, [rankedCards, skillGroupFilter, difficultyFilter, sortMode])

  const handleSelectGame = (game: MinigameKey) => {
    onSelectGame(game)
  }

  const handlePlayGame = (game: MinigameKey) => {
    onPlayGame(game)
  }

  const hasActiveFilters = skillGroupFilter !== null || difficultyFilter !== 'all'
  const resetFilters = () => {
    setSkillGroupFilter(null)
    setDifficultyFilter('all')
    setSortMode('recommended')
  }

  const selectedCard = activeGame ? rankedCards.find((c) => c.key === activeGame) : null

  return (
    <div className={`view-shell view-${navDirection}`}>
      {/* Top bar */}
      <div className="minigame-select-topbar">
        <button
          type="button"
          className="back-button back-button-icon-only"
          onClick={onBack}
          aria-label="Back to script hub"
          title="Back"
        >
          <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
        <h1 className="hub-topbar-title" style={{ fontSize: '1rem', fontWeight: 600 }}>
          <Grid3x3 size={16} strokeWidth={2.2} aria-hidden="true" style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Browse Minigames
        </h1>
        <span className="hub-stat">
          <span>
            {availableMinigames.length} games · Best streak: {activeScriptStats.bestStreak}
          </span>
        </span>
      </div>

      {/* Filter / Sort */}
      <FilterSortBar
        items={availableMinigames}
        activeSkillGroup={skillGroupFilter}
        activeDifficulty={difficultyFilter}
        sortMode={sortMode}
        onSkillGroupChange={setSkillGroupFilter}
        onDifficultyChange={setDifficultyFilter}
        onSortChange={setSortMode}
      />

      {/* Body: grid + detail panel */}
      <div className="minigame-select-body">
        <div className="minigame-select-grid-area">
          {filteredCards.length > 0 ? (
            <MinigameGrid>
              {filteredCards.map((card) => {
                const isSelected = activeGame === card.key
                const cardData: MinigameCardData = {
                  key: card.key,
                  title: card.title,
                  description: card.description,
                  skillGroupKey: MINIGAME_SKILL_GROUP[card.key],
                  difficultyLevel: card.difficulty.level,
                  locked: card.minigameLocked,
                  lockReason: card.lockReason,
                }
                return (
                  <MinigameCard
                    key={card.key}
                    card={cardData}
                    isSelected={isSelected}
                    onSelect={handleSelectGame}
                    onPlay={handlePlayGame}
                  />
                )
              })}
            </MinigameGrid>
          ) : (
            <div className="hub-empty-state" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                {hasActiveFilters
                  ? 'No minigames match the current filters.'
                  : 'No minigames available for this script.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="hub-chip-button"
                  onClick={resetFilters}
                  aria-label="Reset filters"
                >
                  Reset Filters
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="minigame-select-detail-area">
          {selectedCard ? (
            <MinigameDetailPanel
              gameKey={selectedCard.key}
              title={selectedCard.title}
              description={selectedCard.description}
              stats={selectedCard.stats}
              locked={selectedCard.minigameLocked}
              lockReason={selectedCard.lockReason}
              difficultyLevel={selectedCard.difficulty.level}
              accuracy={selectedCard.accuracy}
              onPlay={handlePlayGame}
            />
          ) : (
            <div className="hub-empty-state" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.85rem' }}>Select a minigame to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
