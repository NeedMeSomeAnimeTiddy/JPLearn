import { useState, useCallback } from 'react'
import type { BridgeTelemetry, DiagnosticsReport, SnapshotData, CheckResult } from './types'

export interface UseDevToolsReturn {
  telemetry: BridgeTelemetry | null
  diagnostics: DiagnosticsReport | null
  snapshot: SnapshotData | null
  checkResults: Record<string, CheckResult>
  loading: Record<string, boolean>
  error: Record<string, string | null>
  activeTab: string
  setActiveTab: (tab: string) => void
  fetchTelemetry: () => Promise<void>
  fetchDiagnostics: () => Promise<void>
  fetchSnapshot: () => Promise<void>
  runCheck: (name: string) => Promise<void>
  restartBridge: () => Promise<void>
  clearCaches: () => Promise<void>
  reloadFonts: () => Promise<void>
}

export function useDevTools(): UseDevToolsReturn {
  const [telemetry, setTelemetry] = useState<BridgeTelemetry | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [checkResults, setCheckResults] = useState<Record<string, CheckResult>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<Record<string, string | null>>({})
  const [activeTab, setActiveTab] = useState('telemetry')

  const setOpLoading = useCallback((key: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }))
  }, [])
  const setOpError = useCallback((key: string, value: string | null) => {
    setError((prev) => ({ ...prev, [key]: value }))
  }, [])

  const fetchTelemetry = useCallback(async () => {
    setOpLoading('telemetry', true)
    setOpError('telemetry', null)
    try {
      const result = await window.jplearnDesktop?.getBridgeTelemetry?.()
      if (result && 'ok' in result && result.ok) {
        const { ok: _ok, ...data } = result as { ok: boolean; [key: string]: unknown }
        setTelemetry(data as unknown as BridgeTelemetry)
      } else {
        setOpError('telemetry', (result && 'error' in result ? String(result.error) : null) || 'Failed to fetch telemetry')
      }
    } catch (e) {
      setOpError('telemetry', e instanceof Error ? e.message : String(e))
    } finally {
      setOpLoading('telemetry', false)
    }
  }, [setOpLoading, setOpError])

  const fetchDiagnostics = useCallback(async () => {
    setOpLoading('diagnostics', true)
    setOpError('diagnostics', null)
    try {
      const result = await window.jplearnDesktop?.runDiagnostics?.()
      setDiagnostics(result ?? null)
    } catch (e) {
      setOpError('diagnostics', e instanceof Error ? e.message : String(e))
    } finally {
      setOpLoading('diagnostics', false)
    }
  }, [setOpLoading, setOpError])

  const fetchSnapshot = useCallback(async () => {
    setOpLoading('snapshot', true)
    setOpError('snapshot', null)
    try {
      const result = await window.jplearnDesktop?.getSnapshot?.()
      setSnapshot(result ?? null)
    } catch (e) {
      setOpError('snapshot', e instanceof Error ? e.message : String(e))
    } finally {
      setOpLoading('snapshot', false)
    }
  }, [setOpLoading, setOpError])

  const runCheck = useCallback(async (name: string) => {
    setOpLoading(`check_${name}`, true)
    setOpError(`check_${name}`, null)
    try {
      const result = await window.jplearnDesktop?.runCheck?.(name as 'arch' | 'db' | 'srs')
      if (result) {
        setCheckResults((prev) => ({ ...prev, [name]: result }))
      }
    } catch (e) {
      setOpError(`check_${name}`, e instanceof Error ? e.message : String(e))
    } finally {
      setOpLoading(`check_${name}`, false)
    }
  }, [setOpLoading, setOpError])

  const restartBridge = useCallback(async () => {
    setOpLoading('restart', true)
    try {
      await window.jplearnDesktop?.restartBridge?.()
    } catch {
      // best effort
    } finally {
      setOpLoading('restart', false)
    }
  }, [setOpLoading])

  const clearCaches = useCallback(async () => {
    setOpLoading('clear', true)
    try {
      await window.jplearnDesktop?.clearBridgeCaches?.()
    } catch {
      // best effort
    } finally {
      setOpLoading('clear', false)
    }
  }, [setOpLoading])

  const reloadFonts = useCallback(async () => {
    setOpLoading('fonts', true)
    try {
      await window.jplearnDesktop?.reloadLocalFonts?.()
    } catch {
      // best effort
    } finally {
      setOpLoading('fonts', false)
    }
  }, [setOpLoading])

  return {
    telemetry,
    diagnostics,
    snapshot,
    checkResults,
    loading,
    error,
    activeTab,
    setActiveTab,
    fetchTelemetry,
    fetchDiagnostics,
    fetchSnapshot,
    runCheck,
    restartBridge,
    clearCaches,
    reloadFonts,
  }
}
