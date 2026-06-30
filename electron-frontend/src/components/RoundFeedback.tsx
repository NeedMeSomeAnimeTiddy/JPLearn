import type { PlayableMinigame } from '../types'

interface RoundFeedbackProps {
  feedback: string
  tone: 'success' | 'error' | null
  points: number | null
  answer: string | null
  answerLabel: string
  livesEnabled: boolean
  mode: PlayableMinigame
}

export function RoundFeedback({ feedback, tone, points, answer, answerLabel, livesEnabled, mode }: RoundFeedbackProps) {
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
        <span className="round-feedback-points">
          {points !== null ? `+${points} pts` : '+0 pts'}
        </span>
        <span className="round-feedback-points-rule">Combo at streaks 3/6/9</span>
        {tone === 'error' && livesEnabled ? <span className="round-feedback-life">-1 life</span> : null}
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
    </div>
  )
}
