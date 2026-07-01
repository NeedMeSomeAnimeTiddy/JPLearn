import type { ReactNode } from 'react'
import { CONFIDENCE_LEVEL_LABELS, CONFIDENCE_SCORES } from '../../constants'
import { RoundFeedback } from '../RoundFeedback'
import type { PlayableMinigame } from '../../types'

interface MinigameResponsePanelProps {
  isRoundResolving: boolean
  mode: PlayableMinigame
  title: string
  copy: string
  confidenceCaptureEnabled: boolean
  roundConfidenceScore: number
  onSetRoundConfidence: (score: number) => void
  feedback: string | null
  feedbackTone: 'success' | 'error' | null
  feedbackPoints: number | null
  feedbackAnswer: string | null
  feedbackAnswerLabel: string
  livesEnabled: boolean
  feedbackAdvanceMs: number
  feedbackAdvanceLabel: string
  showKeyboardPrompts: boolean
  onSkipFeedback: () => void
  children: ReactNode
}

export function MinigameResponsePanel({
  isRoundResolving,
  mode,
  title,
  copy,
  confidenceCaptureEnabled,
  roundConfidenceScore,
  onSetRoundConfidence,
  feedback,
  feedbackTone,
  feedbackPoints,
  feedbackAnswer,
  feedbackAnswerLabel,
  livesEnabled,
  feedbackAdvanceMs,
  feedbackAdvanceLabel,
  showKeyboardPrompts,
  onSkipFeedback,
  children,
}: MinigameResponsePanelProps) {
  return (
    <div className="minigame-response-column">
      {feedback ? (
        <div className="minigame-feedback-wrap">
          <RoundFeedback
            feedback={feedback}
            tone={feedbackTone}
            points={feedbackPoints}
            answer={feedbackAnswer}
            answerLabel={feedbackAnswerLabel}
            livesEnabled={livesEnabled}
            mode={mode}
            autoAdvanceMs={feedbackAdvanceMs}
            autoAdvanceLabel={feedbackAdvanceLabel}
            onAction={onSkipFeedback}
            actionLabel={showKeyboardPrompts ? 'Next now ↵' : 'Next now'}
            actionTitle={showKeyboardPrompts ? 'Continue immediately (Enter)' : 'Continue immediately'}
          />
        </div>
      ) : (
        <section className="minigame-response-card" aria-label="Answer challenge">
          <div className="minigame-response-head">
            <div className="minigame-response-head-copy">
              <span className="minigame-response-kicker">Answer</span>
              <strong className="minigame-response-title">{title}</strong>
            </div>
            <span className="minigame-response-status">{isRoundResolving ? 'Resolving…' : 'Your move'}</span>
          </div>

          <p className="minigame-response-copy">{copy}</p>

          {children}

          {confidenceCaptureEnabled ? (
            <section
              className="confidence-controls confidence-controls-round"
              aria-label="Confidence score controls"
            >
              <p className="interleave-controls-title">Confidence for this answer</p>
              <div
                className="confidence-chip-row confidence-chip-row-round"
                role="group"
                aria-label="Select confidence score for this answer"
              >
                {CONFIDENCE_SCORES.map((score) => (
                  <button
                    key={`round-confidence-${score}`}
                    type="button"
                    className={`confidence-chip confidence-chip-round ${
                      roundConfidenceScore === score ? 'is-active' : ''
                    }`}
                    onClick={() => onSetRoundConfidence(score)}
                    aria-pressed={roundConfidenceScore === score}
                    aria-label={`Confidence ${CONFIDENCE_LEVEL_LABELS[score]}`}
                    title={`Confidence: ${CONFIDENCE_LEVEL_LABELS[score]}`}
                    disabled={isRoundResolving}
                  >
                    <span className="confidence-chip-label">
                      {CONFIDENCE_LEVEL_LABELS[score]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      )}
    </div>
  )
}