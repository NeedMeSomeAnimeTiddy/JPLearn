import { DAILY_TIMES, TARGET_LEVELS } from '../constants'

interface HabitsStepProps {
  dailyMinutes: number | undefined
  onDailyMinutes: (value: number | undefined) => void
  targetLevel: string | undefined
  onTargetLevel: (level: string | undefined) => void
  disabled: boolean
}

export function HabitsStep({ dailyMinutes, onDailyMinutes, targetLevel, onTargetLevel, disabled }: HabitsStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="obn-section" role="group" aria-labelledby="obn-time-label">
        <h2 id="obn-time-label" className="obn-section-title">
          How much time can you study each day?
        </h2>
        <div className="obn-time-grid" role="radiogroup" aria-label="Daily study time">
          {DAILY_TIMES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`obn-time-card${dailyMinutes === t.value ? ' is-selected' : ''}`}
              aria-pressed={dailyMinutes === t.value}
              onClick={() => onDailyMinutes(dailyMinutes === t.value ? undefined : t.value)}
              disabled={disabled}
            >
              <span className="obn-time-value">{t.label}</span>
              <span className="obn-time-note">{t.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="obn-section" role="group" aria-labelledby="obn-level-label">
        <h2 id="obn-level-label" className="obn-section-title">
          Do you have a target JLPT level in mind?
        </h2>
        <div className="obn-level-grid" role="radiogroup" aria-label="Target JLPT level">
          {TARGET_LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={`obn-level-chip${targetLevel === l.key ? ' is-selected' : ''}`}
              aria-pressed={targetLevel === l.key}
              onClick={() => onTargetLevel(targetLevel === l.key ? undefined : l.key)}
              disabled={disabled}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
