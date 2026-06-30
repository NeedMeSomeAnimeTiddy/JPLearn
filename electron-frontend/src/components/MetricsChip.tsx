import type { LucideIcon } from 'lucide-react'

type MetricAccent = 'insight' | 'skill' | 'danger' | 'ocean' | 'streak' | 'warning'

interface MetricsChipProps {
  icon: LucideIcon
  label: string
  value: string | number
  accent: MetricAccent
  valueKey?: string
}

export function MetricsChip({ icon: Icon, label, value, accent, valueKey }: MetricsChipProps) {
  return (
    <span className={`metric-accent-${accent}`}>
      <Icon aria-hidden="true" className="chip-icon" strokeWidth={2.2} />
      <strong key={valueKey} className="live-value">{value}</strong>{' '}
      {label}
    </span>
  )
}
