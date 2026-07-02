import type { PlayableMinigame } from '../types'
import type { RoundPerformanceLabel } from '../context/SessionContext'

interface RoundFeedbackProps {
  feedback: string
  tone: 'success' | 'error' | null
  performanceLabel: RoundPerformanceLabel | null
  comboBonus: number
  milestoneStreak: number | null
  answer: string | null
  answerLabel: string
  livesEnabled: boolean
  mode: PlayableMinigame
  autoAdvanceMs?: number
  autoAdvanceLabel?: string
  actionLabel?: string
  actionTitle?: string
  onAction?: () => void
}

export function RoundFeedback({
  feedback,
  tone,
  performanceLabel,
  comboBonus,
  milestoneStreak,
  answer,
  answerLabel,
  livesEnabled,
  mode,
  autoAdvanceMs,
  autoAdvanceLabel,
  actionLabel,
  actionTitle,
  onAction,
}: RoundFeedbackProps) {
  return (
    <div
      className={`round-feedback ${
        tone === 'success'
          ? 'round-feedback-success'
          : tone === 'error'
            ? 'round-feedback-error'
            : ''
      }`}
    >
      <p className="round-feedback-message">{feedback}</p>
      <div className="round-feedback-meta">
        {performanceLabel ? (
          <span className={`round-feedback-performance round-feedback-performance-${performanceLabel.toLowerCase()}`}>
            {performanceLabel}
          </span>
        ) : null}
        {comboBonus > 0 ? <span className="round-feedback-combo">+{comboBonus} combo</span> : null}
        {milestoneStreak ? <span className="round-feedback-milestone">Streak ×{milestoneStreak}</span> : null}
        {tone === 'error' && livesEnabled ? <span className="round-feedback-life">−1 life</span> : null}
      </div>
      {answer ? (
        <div className="round-feedback-answer">
          <p className="round-feedback-answer-label">{answerLabel}</p>
          <p className="round-feedback-answer-value">{answer}</p>
        </div>
      ) : null}
      {mode === 'narrative_story' ? (
        <p className="round-feedback-note">Story progress updates chapter access based on stage transitions.</p>
      ) : null}
      {autoAdvanceMs ? (
        <div className="round-feedback-advance" aria-live="polite">
          <div className="round-feedback-advance-copy">
            <span>{autoAdvanceLabel ?? 'Advancing automatically...'}</span>
            {onAction ? (
              <button
                type="button"
                className="round-feedback-skip"
                onClick={onAction}
                aria-label={actionTitle ?? actionLabel ?? 'Continue now'}
                title={actionTitle ?? actionLabel ?? 'Continue now'}
              >
                {actionLabel ?? 'Continue now'}
              </button>
            ) : null}
          </div>
          <div className="round-feedback-advance-track" aria-hidden="true">
            <span
              className="round-feedback-advance-fill"
              style={{ animationDuration: `${autoAdvanceMs}ms` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
