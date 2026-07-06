import type { CSSProperties } from 'react'
import type { LearningPathStatus, SectionReadiness } from '../types'
import { ArrowRight, Check, RefreshCw } from 'lucide-react'

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

const STEP_GLYPHS: Record<string, string> = {
  hiragana: 'あ',
  katakana: 'ア',
  kanji_n5: '漢',
  vocab_n5: '語',
  grammar_patterns: '話',
}

export function LearningPathPanel({ status, onContinue, onChangePath }: LearningPathPanelProps) {
  if (!status.path_id || status.steps.length === 0) return null

  const activeStep = status.steps.find((step) => step.readiness === 'suggested_next') ?? null

  return (
    <section className="learning-path-panel panel-glass" aria-label="Your learning path">
      <div className="lpp-header">
        <div className="lpp-title-group">
          <p className="hero-kicker">Your Path</p>
          <strong className="lpp-path-name">{status.path_name}</strong>
        </div>
        <div className="lpp-header-actions">
          {activeStep && (
            <button
              type="button"
              className="lpp-icon-btn lpp-continue-btn btn-primary"
              onClick={() => onContinue(activeStep.section_id)}
              aria-label={`Continue ${activeStep.label}`}
              title={`Continue ${activeStep.label}`}
            >
              <ArrowRight size={13} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="lpp-icon-btn lpp-change-btn"
            onClick={onChangePath}
            title="Choose a different learning path"
            aria-label="Choose a different learning path"
          >
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ol className="lpp-track" aria-label="Path steps">
        {status.steps.map((step, index) => {
          const isActive = step.readiness === 'suggested_next'
          const isDone = step.readiness === 'completed'
          const pct = Math.round(step.mastery_pct * 100)
          const prevDone = index > 0 && status.steps[index - 1].readiness === 'completed'
          const prevPct = index > 0 ? Math.round(status.steps[index - 1].mastery_pct * 100) : 0
          const glyph = STEP_GLYPHS[step.section_id] ?? step.label.charAt(0)
          const readinessLabel = READINESS_LABELS[step.readiness]

          const nodeInner = (
            <>
              <span
                className="lpp-node-ring"
                style={{ '--lpp-pct': `${pct}%` } as CSSProperties}
                aria-hidden="true"
              >
                <span className="lpp-node-glyph" lang="ja">{glyph}</span>
              </span>
              {isDone && (
                <span className="lpp-node-check" aria-hidden="true">
                  <Check size={9} strokeWidth={3} />
                </span>
              )}
            </>
          )

          return (
            <li
              key={step.section_id}
              className={[
                'lpp-stop',
                isActive ? 'lpp-stop--active' : '',
                isDone ? 'lpp-stop--done' : '',
                prevDone ? 'lpp-stop--reached' : '',
                `lpp-stop--${step.readiness}`,
              ].filter(Boolean).join(' ')}
              style={{ '--lpp-prev-pct': `${prevPct}%` } as CSSProperties}
              title={`${step.label} — ${readinessLabel}, ${pct}% mastered`}
            >
              {isActive ? (
                <button
                  type="button"
                  className="lpp-node"
                  onClick={() => onContinue(step.section_id)}
                  aria-label={`Continue ${step.label}, ${pct}% mastered`}
                >
                  {nodeInner}
                </button>
              ) : (
                <span
                  className="lpp-node"
                  aria-label={`${step.label}, ${readinessLabel}, ${pct}% mastered`}
                >
                  {nodeInner}
                </span>
              )}
              <span className="lpp-stop-label">{step.label}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
