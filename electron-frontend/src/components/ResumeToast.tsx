import { useCallback, useEffect } from 'react'
import { Play, X } from 'lucide-react'
import { formatTimelineScriptTag } from '../utils'

const RESUME_TOAST_TTL_MS = 10_000

interface ResumeToastProps {
  deck: string
  mode: string
  onResume: () => void
  onDismiss: () => void
}

export function ResumeToast({ deck, mode, onResume, onDismiss }: ResumeToastProps) {
  useEffect(() => {
    const handle = window.setTimeout(() => {
      onDismiss()
    }, RESUME_TOAST_TTL_MS)
    return () => window.clearTimeout(handle)
  }, [onDismiss])

  const handleResume = useCallback(() => {
    onResume()
  }, [onResume])

  const handleDismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  return (
    <aside className="resume-toast-anchor" aria-live="polite">
      <article
        className="resume-toast"
        role="status"
        aria-label={`Resume your last session: ${formatTimelineScriptTag(deck)}`}
      >
        <div className="resume-toast-header">
          <span className="resume-toast-icon" aria-hidden="true">
            <Play strokeWidth={2.2} />
          </span>
          <p className="resume-toast-label">Resume session?</p>
        </div>
        <p className="resume-toast-detail">
          {formatTimelineScriptTag(deck)} &middot; {mode}
        </p>
        <div className="resume-toast-controls">
          <button
            type="button"
            className="resume-toast-action"
            onClick={handleResume}
          >
            Resume
          </button>
          <button
            type="button"
            className="resume-toast-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <X strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="resume-toast-advance-track" aria-hidden="true">
          <span className="resume-toast-advance-fill" />
        </div>
      </article>
    </aside>
  )
}
