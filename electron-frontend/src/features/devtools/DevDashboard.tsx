import { useEffect, useCallback, useRef } from 'react'
import { X, RotateCcw, Trash2, Type } from 'lucide-react'
import { useDevTools } from './useDevTools'
import { TelemetryTab } from './TelemetryTab'
import { DiagnosticsTab } from './DiagnosticsTab'
import { SnapshotTab } from './SnapshotTab'
import { ChecksTab } from './ChecksTab'
import type { DevDashboardProps } from './types'

const TABS = [
  { key: 'telemetry', label: 'Telemetry' },
  { key: 'diagnostics', label: 'Diagnostics' },
  { key: 'snapshot', label: 'Snapshot' },
  { key: 'checks', label: 'Checks' },
]

export function DevDashboard({ pendingCheck, onClose }: DevDashboardProps) {
  const dev = useDevTools()
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // oxlint-disable react-hooks/exhaustive-deps — dev object recreated each render via custom hook
  useEffect(() => {
    if (dev.activeTab === 'telemetry' && !dev.telemetry) {
      void dev.fetchTelemetry()
    }
    if (dev.activeTab === 'diagnostics' && !dev.diagnostics) {
      void dev.fetchDiagnostics()
    }
    if (dev.activeTab === 'snapshot' && !dev.snapshot) {
      void dev.fetchSnapshot()
    }
  }, [dev.activeTab])

  // oxlint-disable react-hooks/exhaustive-deps — dev object recreated each render via custom hook
  useEffect(() => {
    if (pendingCheck) {
      dev.setActiveTab('checks')
      void dev.runCheck(pendingCheck)
    }
  }, [pendingCheck])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose()
    }
  }, [onClose])

  return (
    <div className="devtools-overlay" ref={overlayRef} onClick={handleOverlayClick} role="dialog" aria-label="Developer Dashboard">
      <div className="devtools-card">
        <div className="devtools-header">
          <h2>Developer Dashboard</h2>
          <button type="button" className="devtools-icon-btn devtools-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="devtools-tabs" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={dev.activeTab === key}
              className={`devtools-tab ${dev.activeTab === key ? 'is-active' : ''}`}
              onClick={() => dev.setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="devtools-body" role="tabpanel">
          {dev.activeTab === 'telemetry' && (
            <TelemetryTab
              telemetry={dev.telemetry}
              loading={dev.loading.telemetry || false}
              error={dev.error.telemetry || null}
              onRefresh={() => { void dev.fetchTelemetry() }}
            />
          )}
          {dev.activeTab === 'diagnostics' && (
            <DiagnosticsTab
              diagnostics={dev.diagnostics}
              loading={dev.loading.diagnostics || false}
              error={dev.error.diagnostics || null}
              onRefresh={() => { void dev.fetchDiagnostics() }}
            />
          )}
          {dev.activeTab === 'snapshot' && (
            <SnapshotTab
              snapshot={dev.snapshot}
              loading={dev.loading.snapshot || false}
              error={dev.error.snapshot || null}
              onRefresh={() => { void dev.fetchSnapshot() }}
            />
          )}
          {dev.activeTab === 'checks' && (
            <ChecksTab
              checkResults={dev.checkResults}
              loading={dev.loading}
              error={dev.error}
              onRunCheck={(name) => { void dev.runCheck(name) }}
            />
          )}
        </div>

        <div className="devtools-footer">
          <span className="devtools-footer-label">Quick Actions:</span>
          <button
            type="button"
            className="devtools-action-btn"
            onClick={() => { void dev.restartBridge() }}
            disabled={dev.loading.restart}
          >
            <RotateCcw size={14} />
            {dev.loading.restart ? 'Restarting...' : 'Restart Bridge'}
          </button>
          <button
            type="button"
            className="devtools-action-btn"
            onClick={() => { void dev.clearCaches() }}
            disabled={dev.loading.clear}
          >
            <Trash2 size={14} />
            {dev.loading.clear ? 'Clearing...' : 'Clear Caches'}
          </button>
          <button
            type="button"
            className="devtools-action-btn"
            onClick={() => { void dev.reloadFonts() }}
            disabled={dev.loading.fonts}
          >
            <Type size={14} />
            {dev.loading.fonts ? 'Reloading...' : 'Reload Fonts'}
          </button>
        </div>
      </div>
    </div>
  )
}
