import { RefreshCw } from 'lucide-react'
import type { SystemInfo } from '../types'
import { InfoRow } from './InfoRow'

interface SystemCheckPageProps {
  sysInfo: SystemInfo | null
  loading: boolean
  onRefresh: () => void
}

export function SystemCheckPage({ sysInfo, loading, onRefresh }: SystemCheckPageProps) {
  if (!sysInfo) {
    return <p style={{ opacity: 0.6 }}>Detecting system…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <InfoRow label="RAM" value={`${sysInfo.totalRamGb.toFixed(1)} GB`} />
      <InfoRow label="GPU" value={sysInfo.gpuAdapters && sysInfo.gpuAdapters.length > 0 ? sysInfo.gpuAdapters.join(', ') : 'Not detected'} />
      <div className="setup-network-row">
        <span className="setup-info-label">Network</span>
        <span className="setup-network-value">
          <span className="setup-info-value">
            {sysInfo.networkMbps ? `${sysInfo.networkMbps.toFixed(1)} Mbps` : 'Speed test unavailable'}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="setup-refresh-btn"
            aria-label="Retest network speed"
            title="Retest network speed"
          >
            <RefreshCw size={16} strokeWidth={2.25} aria-hidden="true" style={{ animation: loading ? 'spin 0.9s linear infinite' : 'none' }} />
          </button>
        </span>
      </div>
    </div>
  )
}
