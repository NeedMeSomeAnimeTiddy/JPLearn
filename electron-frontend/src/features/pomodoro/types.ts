export interface PomodoroSettingsFields {
  pomodoroEnabled: boolean
  pomodoroWorkMinutes: number
  pomodoroBreakMinutes: number
  pomodoroLongBreakMinutes: number
  pomodoroSessionsBeforeLongBreak: number
  pomodoroShowTimerInHud: boolean
}

export type PomodoroPhase = 'work' | 'break' | 'long-break' | 'idle'

export interface PomodoroState {
  phase: PomodoroPhase
  secondsRemaining: number
  completedWorkSessions: number
  isRunning: boolean
}

export interface PomodoroDisplay {
  phase: PomodoroPhase
  secondsRemaining: number
  totalSeconds: number
  isRunning: boolean
  formatted: string
}

export interface UsePomodoroReturn {
  state: PomodoroState
  display: PomodoroDisplay | null
  isActive: boolean
  startWork: () => void
  pause: () => void
  resume: () => void
  skip: () => void
  reset: () => void
  onSessionStart: () => void
  onSessionEnd: () => void
}
