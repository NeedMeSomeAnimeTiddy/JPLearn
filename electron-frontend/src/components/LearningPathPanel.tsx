import type { LearningPathStatus, SectionReadiness } from '../types'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'

interface LearningPathPanelProps {
  status: LearningPathStatus
  onContinue: (sectionId: string) => void
  onChangePath: () => void
}

const READINESS_LABELS: Record<SectionReadiness, string> = {
  completed: 'Complete',
  suggested_next: 'Up Next',
  recommended: 'Ready',
  challenging: 'Challenging',
  advanced: 'Advanced',
}

export function LearningPathPanel({ status, onContinue, onChangePath }: LearningPathPanelProps) {
  if (!status.path_id || status.steps.length === 0) return null

  return (
    <section className="learning-path-panel panel-glass" aria-label="Your learning path">
      <div className="lpp-header">
        <div className="lpp-title-group">
          <p className="hero-kicker">Your Path</p>
          <strong className="lpp-path-name">{status.path_name}</strong>
        </div>
        <button
          type="button"
          className="lpp-change-btn"
          onClick={onChangePath}
          title="Choose a different learning path"
        >
          Change path
        </button>
      </div>

      <ol className="lpp-steps" aria-label="Path steps">
        {status.steps.map((step) => {
          const isActive = step.readiness === 'suggested_next'
          const isDone = step.readiness === 'completed'

          return (
            <li
              key={step.section_id}
              className={`lpp-step${isActive ? ' lpp-step--active' : ''}${isDone ? ' lpp-step--done' : ''}`}
            >
              <span className="lpp-step-icon" aria-hidden="true">
                {isDone ? (
                  <Check size={12} strokeWidth={2.5} />
                ) : isActive ? (
                  <ArrowRight size={12} strokeWidth={2.5} />
                ) : (
                  <ChevronRight size={12} strokeWidth={2} />
                )}
              </span>

              <span className="lpp-step-content">
                <span className="lpp-step-label">{step.label}</span>
                {isActive && (
                  <span className="lpp-step-pct">
                    {Math.round(step.mastery_pct * 100)}%
                  </span>
                )}
              </span>

              {isActive && (
                <button
                  type="button"
                  className="lpp-continue-btn btn-primary"
                  onClick={() => onContinue(step.section_id)}
                  aria-label={`Continue ${step.label}`}
                >
                  Continue
                </button>
              )}

              {!isActive && !isDone && (
                <span
                  className={`lpp-step-badge lpp-step-badge--${step.readiness}`}
                  aria-label={READINESS_LABELS[step.readiness]}
                >
                  {READINESS_LABELS[step.readiness]}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
