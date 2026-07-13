export const POMODORO_DEFAULTS = {
  pomodoroEnabled: false,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroSessionsBeforeLongBreak: 4,
  pomodoroShowTimerInHud: true,
} as const

export const POMODORO_PRESETS = [
  { key: 'classic' as const, label: 'Classic', work: 25, break: 5, longBreak: 15 },
  { key: 'short' as const, label: 'Short', work: 15, break: 3, longBreak: 10 },
  { key: 'long' as const, label: 'Deep Focus', work: 50, break: 10, longBreak: 20 },
] as const

export type PomodoroPresetKey = (typeof POMODORO_PRESETS)[number]['key']
