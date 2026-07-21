import { Check, X } from 'lucide-react'
import type { SrsDraftState } from '../types'

interface SrsDraftReviewPanelProps {
  drafts: SrsDraftState[]
  error: string | null
  onEdit: (id: string, changes: Partial<Pick<SrsDraftState, 'front' | 'back' | 'reading' | 'notes'>>) => void
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onSkipAll: () => void
  onReplay: () => void
  onReturnToTutorMenu: () => void
}

/**
 * Reviewable-before-storage SRS draft list. Every accept/dismiss decision is
 * explicit — nothing here is persisted automatically, and dismissed/skipped
 * drafts never reach the backend at all (only Accept calls saveScenarioSrsCard).
 */
export function SrsDraftReviewPanel({
  drafts,
  error,
  onEdit,
  onAccept,
  onDismiss,
  onSkipAll,
  onReplay,
  onReturnToTutorMenu,
}: SrsDraftReviewPanelProps) {
  const pending = drafts.filter((draft) => draft.status === 'pending')

  return (
    <div className="scenario-activity scenario-srs-review cassette-panel-body">
      <h3 className="scenario-summary-heading">Review suggested SRS cards</h3>
      <p className="scenario-summary-subheading">
        Accept the cards you want to keep — nothing is saved until you do.
      </p>

      {error ? <p className="assistant-chat-error" role="alert">{error}</p> : null}

      {pending.length === 0 ? (
        <p className="assistant-chat-empty">No drafts left to review.</p>
      ) : (
        <ul className="scenario-srs-draft-list" role="list">
          {pending.map((draft) => (
            <li key={draft.id} className="scenario-srs-draft">
              <label className="scenario-srs-draft-field">
                <span>Front</span>
                <input
                  type="text"
                  value={draft.front}
                  onChange={(event) => onEdit(draft.id, { front: event.currentTarget.value })}
                />
              </label>
              <label className="scenario-srs-draft-field">
                <span>Back</span>
                <input
                  type="text"
                  value={draft.back}
                  onChange={(event) => onEdit(draft.id, { back: event.currentTarget.value })}
                />
              </label>
              <label className="scenario-srs-draft-field">
                <span>Reading</span>
                <input
                  type="text"
                  value={draft.reading}
                  onChange={(event) => onEdit(draft.id, { reading: event.currentTarget.value })}
                />
              </label>
              <label className="scenario-srs-draft-field">
                <span>Notes</span>
                <input
                  type="text"
                  value={draft.notes}
                  onChange={(event) => onEdit(draft.id, { notes: event.currentTarget.value })}
                />
              </label>
              <div className="scenario-srs-draft-actions">
                <button
                  type="button"
                  className="scenario-srs-draft-accept"
                  onClick={() => onAccept(draft.id)}
                  aria-label={`Accept card: ${draft.front}`}
                >
                  <Check size={14} strokeWidth={2.4} aria-hidden="true" /> Accept
                </button>
                <button
                  type="button"
                  className="scenario-srs-draft-dismiss"
                  onClick={() => onDismiss(draft.id)}
                  aria-label={`Dismiss card: ${draft.front}`}
                >
                  <X size={14} strokeWidth={2.4} aria-hidden="true" /> Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 ? (
        <button type="button" className="scenario-srs-skip-all" onClick={onSkipAll}>
          Skip all
        </button>
      ) : null}

      <div className="scenario-summary-actions">
        <button type="button" className="scenario-summary-replay" onClick={onReplay}>
          Replay scenario
        </button>
        <button type="button" className="scenario-summary-exit" onClick={onReturnToTutorMenu}>
          Return to Tutor menu
        </button>
      </div>
    </div>
  )
}
