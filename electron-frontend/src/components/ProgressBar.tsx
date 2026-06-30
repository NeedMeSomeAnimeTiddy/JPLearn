interface ProgressBarProps {
  label: string
  value: number
  max: number
  displayText?: string
  altStyle?: boolean
}

export function ProgressBar({ label, value, max, displayText, altStyle = false }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const display = displayText ?? `${pct}%`

  return (
    <div className="meter">
      <div className="meter-label">
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <div className="meter-track">
        <div
          className={`meter-fill ${altStyle ? 'meter-fill-alt' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
