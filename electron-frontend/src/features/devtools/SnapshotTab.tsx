import { useEffect } from 'react'
import { RefreshCw, Copy } from 'lucide-react'
import type { SnapshotData } from './types'

interface SnapshotTabProps {
  snapshot: SnapshotData | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export function SnapshotTab({ snapshot, loading, error, onRefresh }: SnapshotTabProps) {
  useEffect(() => {
    if (!snapshot && !loading) {
      onRefresh()
    }
  }, [snapshot, loading, onRefresh])

  if (loading && !snapshot) {
    return <div className="devtools-loading">Loading snapshot...</div>
  }

  if (error && !snapshot) {
    return (
      <div className="devtools-error">
        <p>Failed to load snapshot: {error}</p>
        <button type="button" className="devtools-retry-btn" onClick={onRefresh}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!snapshot) return null

  return (
    <div className="devtools-tab-content">
      <div className="devtools-section-header">
        <h3>Git Status</h3>
        <button
          type="button"
          className="devtools-icon-btn"
          onClick={() => { void navigator.clipboard.writeText(snapshot.commit) }}
        >
          <Copy size={12} />
        </button>
      </div>
      <div className="devtools-kv-grid">
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Branch</span>
          <span className="devtools-kv-value devtools-mono">{snapshot.branch}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Commit</span>
          <span className="devtools-kv-value devtools-mono">{snapshot.commit}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Dirty</span>
          <span className={`devtools-kv-value ${snapshot.dirty ? 'devtools-text-warn' : 'devtools-text-ok'}`}>
            {snapshot.dirty ? 'Yes' : 'Clean'}
          </span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Changed Files</span>
          <span className="devtools-kv-value">{snapshot.changed_count}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Python</span>
          <span className="devtools-kv-value">{snapshot.python}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">CWD</span>
          <span className="devtools-kv-value devtools-mono">{snapshot.cwd}</span>
        </div>
      </div>

      {snapshot.changed_files.length > 0 && (
        <div className="devtools-section">
          <h4>Changed Files</h4>
          <ul className="devtools-file-list">
            {snapshot.changed_files.map((f) => (
              <li key={f} className="devtools-mono">{f}</li>
            ))}
            {snapshot.changed_files_omitted > 0 && (
              <li className="devtools-mono devtools-text-dim">...{snapshot.changed_files_omitted} more omitted</li>
            )}
          </ul>
        </div>
      )}

      <div className="devtools-section-header">
        <h3>File Stats</h3>
      </div>
      <div className="devtools-kv-grid">
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Python Files</span>
          <span className="devtools-kv-value">{snapshot.python_file_count}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Test Files</span>
          <span className="devtools-kv-value">{snapshot.test_file_count}</span>
        </div>
      </div>

      {snapshot.largest_python_files.length > 0 && (
        <div className="devtools-section">
          <h4>Largest Python Files</h4>
          <table className="devtools-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.largest_python_files.map((f) => (
                <tr key={f.path}>
                  <td className="devtools-mono">{f.path}</td>
                  <td className="devtools-num">{f.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
