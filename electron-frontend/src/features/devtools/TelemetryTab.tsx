import { useEffect } from 'react'
import { RefreshCw, Copy } from 'lucide-react'
import type { BridgeTelemetry } from './types'

interface TelemetryTabProps {
  telemetry: BridgeTelemetry | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function formatUptime(startedAtUtc: string): string {
  const started = new Date(startedAtUtc).getTime()
  const now = Date.now()
  const diffMs = now - started
  if (diffMs < 0) return '0s'
  const hours = Math.floor(diffMs / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  const seconds = Math.floor((diffMs % 60000) / 1000)
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function successRate(ok: number, fail: number): string {
  const total = ok + fail
  if (total === 0) return '--'
  return `${Math.round((ok / total) * 100)}%`
}

export function TelemetryTab({ telemetry, loading, error, onRefresh }: TelemetryTabProps) {
  useEffect(() => {
    if (!telemetry && !loading) {
      onRefresh()
    }
  }, [telemetry, loading, onRefresh])

  if (loading && !telemetry) {
    return <div className="devtools-loading">Loading telemetry...</div>
  }

  if (error && !telemetry) {
    return (
      <div className="devtools-error">
        <p>Failed to load telemetry: {error}</p>
        <button type="button" className="devtools-retry-btn" onClick={onRefresh}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    )
  }

  if (!telemetry) return null

  const totalRequests = telemetry.workerRequestCount + telemetry.fallbackCount
  const rate = successRate(telemetry.workerSuccessCount, telemetry.workerFailureCount)

  return (
    <div className="devtools-tab-content">
      <div className="devtools-section-header">
        <h3>Bridge Telemetry</h3>
        <button type="button" className="devtools-icon-btn" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
        </button>
      </div>

      <div className="devtools-kv-grid">
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Uptime</span>
          <span className="devtools-kv-value">{formatUptime(telemetry.startedAtUtc)}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Worker Starts</span>
          <span className="devtools-kv-value">{telemetry.workerStarts}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Requests</span>
          <span className="devtools-kv-value">{totalRequests}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Success Rate</span>
          <span className={`devtools-kv-value ${telemetry.workerFailureCount > telemetry.workerSuccessCount ? 'devtools-text-warn' : 'devtools-text-ok'}`}>
            {rate}
          </span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Succeeded</span>
          <span className="devtools-kv-value devtools-text-ok">{telemetry.workerSuccessCount}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Failed</span>
          <span className="devtools-kv-value devtools-text-err">{telemetry.workerFailureCount}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Timeouts</span>
          <span className="devtools-kv-value">{telemetry.workerTimeoutCount}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Fallbacks</span>
          <span className="devtools-kv-value">{telemetry.fallbackCount}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">One-shots</span>
          <span className="devtools-kv-value">{telemetry.oneShotCount}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Pending</span>
          <span className="devtools-kv-value">{telemetry.pendingRequests}</span>
        </div>
        <div className="devtools-kv-item">
          <span className="devtools-kv-key">Cache Entries</span>
          <span className="devtools-kv-value">{telemetry.readCacheEntries}</span>
        </div>
        {telemetry.lastWorkerError && (
          <div className="devtools-kv-item devtools-kv-full">
            <span className="devtools-kv-key">Last Error</span>
            <span className="devtools-kv-value devtools-text-err devtools-pre-line">{telemetry.lastWorkerError}</span>
          </div>
        )}
        {telemetry.lastFallbackAtUtc && (
          <div className="devtools-kv-item">
            <span className="devtools-kv-key">Last Fallback</span>
            <span className="devtools-kv-value">{new Date(telemetry.lastFallbackAtUtc).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {telemetry.stderrTail ? (
        <div className="devtools-stderr-section">
          <div className="devtools-section-header">
            <h4>Bridge stderr</h4>
            <button
              type="button"
              className="devtools-icon-btn"
              onClick={() => { void navigator.clipboard.writeText(telemetry.stderrTail ?? '') }}
            >
              <Copy size={12} />
            </button>
          </div>
          <pre className="devtools-stderr-block">{telemetry.stderrTail || '(empty)'}</pre>
        </div>
      ) : null}
    </div>
  )
}
