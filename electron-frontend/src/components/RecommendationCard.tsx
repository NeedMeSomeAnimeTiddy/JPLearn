import { ArrowRight } from 'lucide-react'

interface RecommendationCardProps {
  displayLabel: string
  reviewCount: number
  difficulty: string
  reason: string
  onStart: () => void
}

const REASON_LABELS: Record<string, string> = {
  high_error_rate: 'Needs work',
  leeches_detected: 'Problem items',
  new_content_ready: 'New content',
  overdue_reviews: 'Overdue',
  streak_recovery: 'Warm-up',
  progression_milestone: 'Just unlocked',
  weak_retention: 'Fading',
  balanced_review: 'Review',
}

const DIFFICULTY_DOTS: Record<string, string> = {
  easy: '●○○',
  normal: '●●○',
  challenging: '●●●',
}

export function RecommendationCard({
  displayLabel,
  reviewCount,
  difficulty,
  reason,
  onStart,
}: RecommendationCardProps) {
  const reasonLabel = REASON_LABELS[reason] ?? reason
  const difficultyDots = DIFFICULTY_DOTS[difficulty] ?? difficulty

  return (
    <div className="recommendation-card">
      <div className="recommendation-card-meta">
        <span className="recommendation-card-reason">{reasonLabel}</span>
        <span className="recommendation-card-difficulty" aria-label={`Difficulty: ${difficulty}`}>
          {difficultyDots}
        </span>
      </div>
      <strong className="recommendation-card-label">{displayLabel}</strong>
      <div className="recommendation-card-footer">
        <span className="recommendation-card-count">{reviewCount} items</span>
        <button
          type="button"
          className="recommendation-card-start"
          onClick={onStart}
          aria-label={`Start: ${displayLabel}`}
        >
          Start
          <ArrowRight aria-hidden="true" className="recommendation-card-arrow" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
