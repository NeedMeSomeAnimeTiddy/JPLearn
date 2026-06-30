import type { CSSProperties } from 'react'

interface XPBarProps {
  level: number
  xpToNextLevel: number
  xpForCurrentLevel: number
}

export function XPBar({ level, xpToNextLevel, xpForCurrentLevel }: XPBarProps) {
  const xpEarned = xpForCurrentLevel - xpToNextLevel
  const pct = xpForCurrentLevel > 0 ? Math.round((xpEarned / xpForCurrentLevel) * 100) : 0

  return (
    <div className="xp-bar" aria-label={`Level ${level} — ${xpEarned} / ${xpForCurrentLevel} XP`}>
      <span className="xp-bar-level" aria-hidden="true">
        Lv {level}
      </span>
      <div className="xp-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="xp-bar-fill"
          style={{ '--xp-pct': `${pct}%` } as CSSProperties}
        />
      </div>
      <span className="xp-bar-label" aria-hidden="true">
        {xpEarned} / {xpForCurrentLevel}
      </span>
    </div>
  )
}
