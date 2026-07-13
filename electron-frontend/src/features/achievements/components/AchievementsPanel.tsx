import { Headphones, MessageCircle, PenTool, BookOpen, Target, Bot } from 'lucide-react'
import { clsx } from 'clsx'
import { BADGE_METADATA } from '../constants'
import type { BadgeEntry } from '../types'

const ICON_MAP: Record<string, typeof Headphones> = {
  headphones: Headphones,
  messageCircle: MessageCircle,
  penTool: PenTool,
  bookOpen: BookOpen,
  target: Target,
  bot: Bot,
}

interface BadgeCardProps {
  entry: BadgeEntry
}

function BadgeCard({ entry }: BadgeCardProps) {
  const meta = BADGE_METADATA[entry.descriptor]
  if (!meta) return null
  const IconComponent = ICON_MAP[meta.icon] || Target

  return (
    <div
      className={clsx(
        'badge-card',
        entry.earned ? 'badge-earned' : 'badge-locked',
      )}
      role="listitem"
      aria-label={`${meta.name}${entry.earned ? ' — earned' : ' — locked'}`}
    >
      <div className="badge-icon-wrapper">
        <IconComponent
          size={24}
          className={entry.earned ? 'badge-icon-earned' : 'badge-icon-locked'}
          aria-hidden="true"
        />
      </div>
      <div className="badge-info">
        <span className="badge-name">{meta.name}</span>
        <span className="badge-desc">{meta.description}</span>
        {entry.earned && <span className="badge-earned-label">Earned</span>}
      </div>
    </div>
  )
}

interface AchievementsPanelProps {
  badges: BadgeEntry[]
  earnedCount: number
  totalCount: number
}

export function AchievementsPanel({ badges, earnedCount, totalCount }: AchievementsPanelProps) {
  return (
    <section
      className="achievements-panel"
      role="region"
      aria-label={`Achievements: ${earnedCount} of ${totalCount} badges earned`}
    >
      <div className="achievements-header">
        <h3>Achievements</h3>
        <span className="achievements-count">
          {earnedCount} / {totalCount}
        </span>
      </div>
      <div className="achievements-grid" role="list">
        {badges.map((entry) => (
          <BadgeCard key={entry.descriptor} entry={entry} />
        ))}
      </div>
    </section>
  )
}
