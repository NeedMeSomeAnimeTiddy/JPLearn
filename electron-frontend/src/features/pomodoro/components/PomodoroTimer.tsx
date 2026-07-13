import { Clock, Pause, Play } from 'lucide-react'
import type { PomodoroDisplay } from '../types'
import { calculateProgress } from '../utils'

interface PomodoroTimerProps {
  display: PomodoroDisplay | null
}

const SIZE = 24
const STROKE = 2.5
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function PomodoroTimer({ display }: PomodoroTimerProps) {
  if (!display) return null

  const progress = calculateProgress(display.secondsRemaining, display.totalSeconds)
  const offset = CIRCUMFERENCE * (1 - progress)
  const isPaused = !display.isRunning
  const isBreak = display.phase === 'break' || display.phase === 'long-break'

  return (
    <div className={`pomodoro-timer ${isBreak ? 'pomodoro-timer--break' : ''} ${isPaused ? 'pomodoro-timer--paused' : ''}`}>
      <svg
        className="pomodoro-ring"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        <circle
          className="pomodoro-ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
        />
        <circle
          className="pomodoro-ring-fill"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="pomodoro-time" aria-label={`${display.formatted} remaining`}>
        {display.formatted}
      </span>
      <span className="pomodoro-phase-icon" aria-hidden="true">
        {isBreak ? (
          <Play size={10} strokeWidth={2.5} />
        ) : isPaused ? (
          <Pause size={10} strokeWidth={2.5} />
        ) : (
          <Clock size={10} strokeWidth={2.5} />
        )}
      </span>
    </div>
  )
}
