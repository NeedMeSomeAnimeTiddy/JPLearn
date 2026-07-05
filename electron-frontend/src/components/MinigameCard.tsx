import type { LucideIcon } from 'lucide-react'
import { Lock } from 'lucide-react'
import type { MinigameKey } from '../types'
import { MINIGAME_ICONS, MINIGAME_SKILL_GROUP, MINIGAME_SKILL_GROUP_META, MINIGAME_DIFFICULTY } from '../constants'
import type { MinigameDifficultyLevel } from '../constants'

export interface MinigameCardData {
  key: MinigameKey
  title: string
  description: string
  skillGroupKey: string
  difficultyLevel: MinigameDifficultyLevel
  locked: boolean
  lockReason: string | null
}

interface MinigameCardProps {
  card: MinigameCardData
  isSelected: boolean
  onSelect: (key: MinigameKey) => void
  onPlay?: (key: MinigameKey) => void
}

export function MinigameCard({ card, isSelected, onSelect, onPlay }: MinigameCardProps) {
  const Icon: LucideIcon = MINIGAME_ICONS[card.key]
  const skillGroup = MINIGAME_SKILL_GROUP[card.key]
  const skillGroupMeta = MINIGAME_SKILL_GROUP_META[skillGroup]
  const difficulty = MINIGAME_DIFFICULTY[card.key]

  const selectedClass = isSelected ? 'minigame-card--selected' : ''
  const lockedClass = card.locked ? 'minigame-card--locked' : ''
  const difficultyDotClass = `minigame-card-difficulty-dot--${difficulty.level}`

  function handleClick() {
    if (!card.locked) {
      onSelect(card.key)
    }
  }

  function handleDoubleClick() {
    if (!card.locked && onPlay) {
      onPlay(card.key)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      className={`minigame-card ${selectedClass} ${lockedClass}`}
      role="button"
      tabIndex={card.locked ? -1 : 0}
      aria-label={`${card.title}${card.locked ? ` — locked: ${card.lockReason}` : ''}`}
      aria-disabled={card.locked}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="minigame-card-header">
        <Icon className="minigame-card-icon" size={32} strokeWidth={1.8} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <strong className="minigame-card-title">{card.title}</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <span className="minigame-card-badge">{skillGroupMeta.title}</span>
            <span className="minigame-card-difficulty">
              <span className={`minigame-card-difficulty-dot ${difficultyDotClass}`} aria-hidden="true" />
              {difficulty.label}
            </span>
          </div>
        </div>
      </div>
      <p className="minigame-card-description">{card.description}</p>
      {card.locked && (
        <div className="minigame-card-lock-overlay" aria-hidden="true">
          <Lock size={24} strokeWidth={2} aria-label="Locked" />
        </div>
      )}
    </div>
  )
}
