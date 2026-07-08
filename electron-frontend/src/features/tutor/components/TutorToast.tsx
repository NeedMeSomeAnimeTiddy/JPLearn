import type { AssistantToast } from '../types'
import { ASSISTANT_TOAST_ICONS, ASSISTANT_TOAST_TTL_MS } from '../constants'
import { X } from 'lucide-react'

interface TutorToastProps {
  toast: AssistantToast
  onDismiss: (id: number) => void
  onAction: (toast: AssistantToast) => void
}

export function TutorToast({ toast, onDismiss, onAction }: TutorToastProps) {
  return (
    <div className="assistant-toast-stack" role="status" aria-label="Tutor updates">
      <article key={toast.id} className={`assistant-toast assistant-toast-${toast.priority}`}>
        <div className="assistant-toast-header">
          <span className="assistant-toast-icon" aria-hidden="true">
            {(() => {
              const Icon = ASSISTANT_TOAST_ICONS[toast.priority]
              return <Icon strokeWidth={2.2} />
            })()}
          </span>
          <h3>{toast.title}</h3>
          <button
            type="button"
            className="assistant-toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            <X strokeWidth={2.2} />
          </button>
        </div>
        <p className="assistant-toast-body">{toast.body}</p>
        {toast.targetMode ? (
          <div className="assistant-toast-controls">
            <button
              type="button"
              className="assistant-toast-action"
              onClick={() => onAction(toast)}
            >
              {toast.actionLabel}
            </button>
          </div>
        ) : null}
        <div className="assistant-toast-advance-track" aria-hidden="true">
          <span
            key={toast.id}
            className="assistant-toast-advance-fill"
            style={{ animationDuration: `${ASSISTANT_TOAST_TTL_MS}ms` }}
          />
        </div>
      </article>
    </div>
  )
}
