import { ArrowRight, BookOpen } from 'lucide-react'
import { BEGINNER_PATH_STEPS } from '../constants'

interface ReadyStepProps {
  submitting: boolean
  onStart: () => void
}

export function ReadyStep({ submitting, onStart }: ReadyStepProps) {
  return (
    <div className="obn-section">
      <div className="obn-path-card obn-path-card--featured">
        <div className="obn-path-card-header">
          <BookOpen size={20} strokeWidth={2} aria-hidden="true" className="obn-path-icon" />
          <div>
            <strong className="obn-path-name">Complete Beginner</strong>
            <span className="obn-path-badge">Recommended</span>
          </div>
        </div>
        <p className="obn-path-desc">
          Start from scratch and build a solid foundation. The app will guide you step by step — no guesswork needed.
        </p>
        <ol className="obn-path-steps">
          {BEGINNER_PATH_STEPS.map((step, i) => (
            <li key={step.label} className="obn-path-step">
              <span className="obn-path-step-num">{i + 1}</span>
              <span className="obn-path-step-label">{step.label}</span>
              <span className="obn-path-step-note">{step.note}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="obn-btn obn-btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: '0.94rem' }}
          disabled={submitting}
          onClick={onStart}
        >
          {submitting ? 'Starting…' : 'Start Complete Beginner Path'}
          {!submitting && <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
