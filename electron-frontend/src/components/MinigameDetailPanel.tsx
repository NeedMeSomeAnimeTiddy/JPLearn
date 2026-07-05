import { Play, Lock, TrendingUp, Award, RotateCw } from 'lucide-react'
import type { MinigameKey, MinigameStats } from '../types'
import { MINIGAME_DIFFICULTY, type MinigameDifficultyLevel } from '../constants'

interface MinigameDetailPanelProps {
  gameKey: MinigameKey
  title: string
  description: string
  stats: MinigameStats | null
  locked: boolean
  lockReason: string | null
  difficultyLevel: MinigameDifficultyLevel
  accuracy: number
  onPlay: (game: MinigameKey) => void
}

export function MinigameDetailPanel({
  gameKey,
  title,
  description,
  stats,
  locked,
  lockReason,
  difficultyLevel,
  accuracy,
  onPlay,
}: MinigameDetailPanelProps) {
  const difficultyDotClass = `minigame-card-difficulty-dot--${difficultyLevel}`
  const difficultyLabel = MINIGAME_DIFFICULTY[gameKey]?.label ?? difficultyLevel

  return (
    <div className="minigame-detail-panel">
      <h2 className="minigame-detail-title">{title}</h2>
      <p className="minigame-detail-description">{description}</p>

      <div className="minigame-detail-difficulty">
        <span className={`minigame-card-difficulty-dot ${difficultyDotClass}`} aria-hidden="true" />
        {difficultyLabel}
      </div>

      {locked ? (
        <div className="minigame-detail-lock-reason">
          <Lock size={14} strokeWidth={2} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {lockReason ?? 'This minigame is locked.'}
        </div>
      ) : stats ? (
        <div className="minigame-detail-stats">
          <div className="minigame-detail-stat-item">
            <span className="minigame-detail-stat-label">Accuracy</span>
            <span className="minigame-detail-stat-value">{accuracy}%</span>
          </div>
          <div className="minigame-detail-stat-item">
            <span className="minigame-detail-stat-label">Best Streak</span>
            <span className="minigame-detail-stat-value">
              <Award size={16} strokeWidth={2} aria-hidden="true" style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {stats.bestStreak}
            </span>
          </div>
          <div className="minigame-detail-stat-item">
            <span className="minigame-detail-stat-label">Played</span>
            <span className="minigame-detail-stat-value">
              <RotateCw size={16} strokeWidth={2} aria-hidden="true" style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {stats.attempted}
            </span>
          </div>
          <div className="minigame-detail-stat-item">
            <span className="minigame-detail-stat-label">Current Streak</span>
            <span className="minigame-detail-stat-value">
              <TrendingUp size={16} strokeWidth={2} aria-hidden="true" style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {stats.currentStreak}
            </span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="minigame-detail-play-button"
        disabled={locked}
        aria-label={`Play ${title}`}
        onClick={() => onPlay(gameKey)}
      >
        <Play size={16} strokeWidth={2} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle' }} />
        Play
      </button>
    </div>
  )
}
