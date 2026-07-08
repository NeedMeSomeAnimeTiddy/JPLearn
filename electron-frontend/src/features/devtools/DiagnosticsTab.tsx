import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import type { DiagnosticsReport } from './types'

interface DiagnosticsTabProps {
  diagnostics: DiagnosticsReport | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export function DiagnosticsTab({ diagnostics, loading, error, onRefresh }: DiagnosticsTabProps) {
  useEffect(() => {
    if (!diagnostics && !loading) {
      onRefresh()
    }
  }, [diagnostics, loading, onRefresh])

  if (loading && !diagnostics) {
    return <div className="devtools-loading">Loading diagnostics...</div>
  }

  if (error && !diagnostics) {
    return (
      <div className="devtools-error">
        <p>Failed to load diagnostics: {error}</p>
        <button type="button" className="devtools-retry-btn" onClick={onRefresh}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!diagnostics) return null

  const { queue_composition, session_completion, typed_outcomes } = diagnostics

  return (
    <div className="devtools-tab-content">
      <div className="devtools-section-header">
        <h3>Review Queue Composition</h3>
      </div>
      {queue_composition.length === 0 ? (
        <p className="devtools-empty">No review state data found.</p>
      ) : (
        <table className="devtools-table">
          <thead>
            <tr>
              <th>Deck</th>
              <th>Due</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {queue_composition.map((item: { deck: string; total: number; due: number }) => (
              <tr key={item.deck}>
                <td>{item.deck}</td>
                <td className="devtools-num">{item.due}</td>
                <td className="devtools-num">{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="devtools-section-header">
        <h3>Session Completion (last 10)</h3>
      </div>
      {session_completion.length === 0 ? (
        <p className="devtools-empty">No saved session goals found.</p>
      ) : (
        <table className="devtools-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Completed</th>
              <th>Reviewed</th>
              <th>Accuracy</th>
              <th>Goal Met</th>
            </tr>
          </thead>
          <tbody>
            {session_completion.map((s) => (
              <tr key={s.session_id}>
                <td className="devtools-mono">{s.session_id.slice(0, 8)}...</td>
                <td className="devtools-num">{s.completed_items}/{s.target_items}</td>
                <td className="devtools-num">{s.reviewed}</td>
                <td className="devtools-num">{s.accuracy}%</td>
                <td className="devtools-num">
                  <span className={s.goal_met ? 'devtools-text-ok' : 'devtools-text-err'}>
                    {s.goal_met ? 'Yes' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="devtools-section-header">
        <h3>Typed Recall Outcomes</h3>
      </div>
      <div className="devtools-kv-grid">
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Attempts</span>
          <span className="devtools-kv-value">{typed_outcomes.attempts}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Correct</span>
          <span className="devtools-kv-value devtools-text-ok">{typed_outcomes.correct}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Incorrect</span>
          <span className="devtools-kv-value devtools-text-err">{typed_outcomes.incorrect}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Accuracy</span>
          <span className="devtools-kv-value">{typed_outcomes.accuracy}%</span>
        </div>
      </div>
    </div>
  )
}
