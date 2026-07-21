import { useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import type { ScenarioHistoryEntry } from '../types'

interface ScenarioHistoryPanelProps {
  entries: ScenarioHistoryEntry[] | null
  loading: boolean
  error: string | null
  onDelete: (id: string) => void
  onClearAll: () => void
  onBack: () => void
}

export function ScenarioHistoryPanel({ entries, loading, error, onDelete, onClearAll, onBack }: ScenarioHistoryPanelProps) {
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const openEntry = entries?.find((entry) => entry.id === openEntryId) ?? null

  return (
    <div className="scenario-activity scenario-history cassette-panel-body">
      <button type="button" className="scenario-intro-back" onClick={onBack} aria-label="Back to scenario list">
        <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>All scenarios</span>
      </button>

      <h3 className="scenario-summary-heading">Past sessions</h3>

      {loading ? <p className="assistant-chat-empty" role="status" aria-busy="true">Loading…</p> : null}
      {error ? <p className="assistant-chat-error" role="alert">{error}</p> : null}

      {!loading && entries && entries.length === 0 ? (
        <p className="assistant-chat-empty">No completed sessions yet.</p>
      ) : null}

      {entries && entries.length > 0 ? (
        <>
          <ul className="scenario-history-list" role="list">
            {entries.map((entry) => (
              <li key={entry.id} className="scenario-history-entry">
                <button
                  type="button"
                  className="scenario-history-entry-open"
                  onClick={() => setOpenEntryId((current) => (current === entry.id ? null : entry.id))}
                  aria-expanded={openEntryId === entry.id}
                >
                  <span>{entry.scenarioTitle}</span>
                  <span className="scenario-history-entry-meta">{entry.learnerLevel} · {new Date(entry.completedAtUtc).toLocaleString()}</span>
                </button>
                {confirmDeleteId === entry.id ? (
                  <div className="scenario-confirm-banner" role="alertdialog" aria-label="Confirm deleting this session">
                    <p>Delete this session? This cannot be undone.</p>
                    <div className="scenario-confirm-actions">
                      <button type="button" className="scenario-confirm-yes" onClick={() => { onDelete(entry.id); setConfirmDeleteId(null) }}>
                        Yes, delete
                      </button>
                      <button type="button" className="scenario-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="scenario-history-entry-delete"
                    onClick={() => setConfirmDeleteId(entry.id)}
                    aria-label={`Delete session: ${entry.scenarioTitle}`}
                  >
                    <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {confirmClearAll ? (
            <div className="scenario-confirm-banner" role="alertdialog" aria-label="Confirm clearing all sessions">
              <p>Clear all past sessions? This cannot be undone.</p>
              <div className="scenario-confirm-actions">
                <button type="button" className="scenario-confirm-yes" onClick={() => { onClearAll(); setConfirmClearAll(false) }}>
                  Yes, clear all
                </button>
                <button type="button" className="scenario-confirm-no" onClick={() => setConfirmClearAll(false)}>
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="scenario-history-clear-all" onClick={() => setConfirmClearAll(true)}>
              Clear all
            </button>
          )}
        </>
      ) : null}

      {openEntry ? (
        <section className="scenario-history-detail" aria-label={`Summary for ${openEntry.scenarioTitle}`}>
          <h4 className="scenario-intro-heading">Objectives</h4>
          <ul className="scenario-summary-objectives">
            {openEntry.summary.objectives.map((objective) => (
              <li key={objective.id} className={`scenario-summary-objective scenario-summary-objective-${objective.status}`}>
                {objective.label} — {objective.status}
              </li>
            ))}
          </ul>
          {openEntry.summary.vocabularyPractised.length > 0 ? (
            <>
              <h4 className="scenario-intro-heading">Vocabulary practised</h4>
              <p className="scenario-summary-tags">{openEntry.summary.vocabularyPractised.join('、')}</p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
