import type {
  BridgeTelemetry,
  DiagnosticsReport,
  SnapshotData,
  CheckResult,
} from '../../electron.d'

export type DevTab = 'telemetry' | 'diagnostics' | 'snapshot' | 'checks'

export interface DevToolsState {
  telemetry: BridgeTelemetry | null
  diagnostics: DiagnosticsReport | null
  snapshot: SnapshotData | null
  checkResults: Record<string, CheckResult>
  loading: Record<string, boolean>
  error: Record<string, string | null>
}

export interface DevDashboardProps {
  pendingCheck?: string | null
  onClose: () => void
}

export type { BridgeTelemetry, DiagnosticsReport, SnapshotData, CheckResult }
