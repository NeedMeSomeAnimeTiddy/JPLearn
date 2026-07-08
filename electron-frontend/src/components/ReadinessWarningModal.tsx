import { AlertTriangle, X } from 'lucide-react'
import type { SectionReadiness } from '../types'

interface ReadinessWarningModalProps {
  sectionLabel: string
  readiness: SectionReadiness
  reason: string
  onContinue: () => void
  onCancel: () => void
}

const READINESS_COPY: Record<string, { title: string; body: (label: string) => string }> = {
  challenging: {
    title: 'Heads up!',
    body: (label) =>
      `${label} will be more effective once you've made more progress on earlier sections. You can still study it now — it'll just be trickier.`,
  },
  advanced: {
    title: 'Just a heads up',
    body: (label) =>
      `${label} builds on content you haven't started yet. Jumping in early is fine, but you may find it quite difficult without the foundations.`,
  },
}

export function ReadinessWarningModal({
  sectionLabel,
  readiness,
  reason,
  onContinue,
  onCancel,
}: ReadinessWarningModalProps) {
  const copy = READINESS_COPY[readiness] ?? READINESS_COPY.challenging

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rwm-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="modal-panel readiness-warning-modal crt-scanlines">
        <div className="crt-vhs-line" />
        <button
          type="button"
          className="panel-close-button"
          style={{ position: 'absolute', top: 14, right: 14 }}
          onClick={onCancel}
        aria-label="Go back"
      >
        <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>

        <div className="rwm-icon-row">
          <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" className="rwm-icon" />
        </div>

        <h2 id="rwm-title" className="rwm-title">{copy.title}</h2>
        <p className="rwm-body">{copy.body(sectionLabel)}</p>
        {reason && <p className="rwm-reason">{reason}</p>}

        <div className="rwm-actions">
          <button type="button" className="rwm-back-btn" onClick={onCancel}>
            Go back
          </button>
          <button type="button" className="rwm-continue-btn btn-primary" onClick={onContinue}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  )
}
