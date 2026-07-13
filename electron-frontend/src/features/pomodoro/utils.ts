export function formatTimerDisplay(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function calculateBreakDuration(
  completedSessions: number,
  sessionsBeforeLongBreak: number,
  breakMinutes: number,
  longBreakMinutes: number,
): number {
  return (completedSessions > 0 && completedSessions % sessionsBeforeLongBreak === 0)
    ? longBreakMinutes * 60
    : breakMinutes * 60
}

export function calculateProgress(secondsRemaining: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0
  return Math.max(0, Math.min(1, 1 - secondsRemaining / totalSeconds))
}
