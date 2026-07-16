import { Eraser, Eye, Flag } from 'lucide-react'
import type { HandwritingOutcome } from '../types'
import { HANDWRITING_ERROR_COPY, HANDWRITING_MISS_THRESHOLD } from '../constants'
import { useHandwritingQuiz } from '../useHandwritingQuiz'
import '../handwriting.css'

interface HandwritingAnswerPanelProps {
  character: string
  disabled: boolean
  externalHintUsed: boolean
  onComplete: (outcome: HandwritingOutcome) => void
}

export function HandwritingAnswerPanel({ character, disabled, externalHintUsed, onComplete }: HandwritingAnswerPanelProps) {
  const {
    targetRef,
    status,
    mistakeCount,
    error,
    retry,
    showAnimation,
    giveUp,
  } = useHandwritingQuiz({ character, disabled, externalHintUsed, onComplete })

  const controlsDisabled = disabled || status !== 'ready'

  return (
    <div className="handwriting-answer-panel">
      <p className="handwriting-instructions" id="handwriting-instructions">
        Draw one stroke at a time. After {HANDWRITING_MISS_THRESHOLD} misses on the same stroke, its path is highlighted.
      </p>
      <div
        ref={targetRef}
        className="handwriting-canvas"
        role="application"
        aria-label="Handwriting canvas"
        aria-describedby="handwriting-instructions"
      />
      <p className="handwriting-status" role="status" aria-live="polite">
        {status === 'loading' ? 'Loading offline stroke data…' : null}
        {status === 'ready' ? `${mistakeCount} ${mistakeCount === 1 ? 'mistake' : 'mistakes'} this round` : null}
        {status === 'complete' ? 'Round complete.' : null}
        {status === 'error' ? (error ?? HANDWRITING_ERROR_COPY) : null}
      </p>
      {status === 'error' ? (
        <button type="button" className="handwriting-control" onClick={retry} disabled={disabled}>
          <Eraser size={15} aria-hidden="true" />
          Retry data load
        </button>
      ) : (
        <div className="handwriting-controls" role="group" aria-label="Handwriting controls">
          <button type="button" className="handwriting-control" onClick={retry} disabled={controlsDisabled}>
            <Eraser size={15} aria-hidden="true" />
            Restart strokes
          </button>
          <button type="button" className="handwriting-control" onClick={showAnimation} disabled={controlsDisabled}>
            <Eye size={15} aria-hidden="true" />
            Show order
          </button>
          <button type="button" className="handwriting-control handwriting-control--give-up" onClick={giveUp} disabled={controlsDisabled}>
            <Flag size={15} aria-hidden="true" />
            Give up
          </button>
        </div>
      )}
    </div>
  )
}
