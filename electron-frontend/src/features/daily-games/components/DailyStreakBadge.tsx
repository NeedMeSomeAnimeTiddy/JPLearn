import { Flame, Snowflake } from 'lucide-react'
import type { DailyGamesStreakPayload } from '../../../generated/types'
import { DAILY_GAMES_COPY } from '../constants'

interface DailyStreakBadgeProps {
  streak: DailyGamesStreakPayload
}

export function DailyStreakBadge({ streak }: DailyStreakBadgeProps) {
  return (
    <div className="daily-streak-badges" aria-label={DAILY_GAMES_COPY.streak}>
      <span className="daily-streak-badge">
        <Flame aria-hidden="true" size={18} />
        <strong>{streak.current_streak_days}</strong>
        <span>{DAILY_GAMES_COPY.streak}</span>
      </span>
      <span className="daily-streak-badge">
        <Snowflake aria-hidden="true" size={18} />
        <strong>{streak.freezes_available}</strong>
        <span>{DAILY_GAMES_COPY.freezes}</span>
      </span>
    </div>
  )
}
