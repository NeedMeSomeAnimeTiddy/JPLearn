import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  PomodoroDisplay,
  PomodoroPhase,
  PomodoroSettingsFields,
  PomodoroState,
  UsePomodoroReturn,
} from './types'
import { formatTimerDisplay } from './utils'

function createIdleState(): PomodoroState {
  return { phase: 'idle', secondsRemaining: 0, completedWorkSessions: 0, isRunning: false }
}

export function usePomodoro(
  settings: PomodoroSettingsFields,
  _setSettings: Dispatch<SetStateAction<PomodoroSettingsFields>>,
): UsePomodoroReturn {
  const [state, setState] = useState<PomodoroState>(createIdleState)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startPhase = useCallback((phase: PomodoroPhase, totalSeconds: number) => {
    clearTimer()
    setState((prev) => ({
      phase,
      secondsRemaining: totalSeconds,
      completedWorkSessions: prev.completedWorkSessions,
      isRunning: true,
    }))
  }, [clearTimer])

  const startWork = useCallback(() => {
    startPhase('work', settings.pomodoroWorkMinutes * 60)
  }, [startPhase, settings.pomodoroWorkMinutes])

  const pause = useCallback(() => {
    clearTimer()
    setState((prev) => ({ ...prev, isRunning: false }))
  }, [clearTimer])

  const resume = useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'idle' || prev.secondsRemaining <= 0) return prev
      return { ...prev, isRunning: true }
    })
  }, [])

  const skip = useCallback(() => {
    clearTimer()
    setState((prev) => {
      if (prev.phase === 'work') {
        const nextSessions = prev.completedWorkSessions + 1
        const isLong = (nextSessions % settings.pomodoroSessionsBeforeLongBreak) === 0
        const breakSeconds = isLong
          ? settings.pomodoroLongBreakMinutes * 60
          : settings.pomodoroBreakMinutes * 60
        return {
          phase: isLong ? 'long-break' : 'break',
          secondsRemaining: breakSeconds,
          completedWorkSessions: nextSessions,
          isRunning: false,
        }
      }
      setState(createIdleState())
      return createIdleState()
    })
  }, [clearTimer, settings.pomodoroBreakMinutes, settings.pomodoroLongBreakMinutes, settings.pomodoroSessionsBeforeLongBreak])

  const reset = useCallback(() => {
    clearTimer()
    setState(createIdleState())
  }, [clearTimer])

  useEffect(() => {
    if (state.phase === 'idle') return
    if (state.isRunning) {
      if (intervalRef.current === null) {
        intervalRef.current = setInterval(() => {
          setState((prev) => {
            const next = prev.secondsRemaining - 1
            if (next <= 0) {
              if (prev.phase === 'work') {
                const nextSessions = prev.completedWorkSessions + 1
                const isLong = (nextSessions % settings.pomodoroSessionsBeforeLongBreak) === 0
                const breakSeconds = isLong
                  ? settings.pomodoroLongBreakMinutes * 60
                  : settings.pomodoroBreakMinutes * 60
                return {
                  phase: isLong ? 'long-break' : 'break',
                  secondsRemaining: breakSeconds,
                  completedWorkSessions: nextSessions,
                  isRunning: true,
                }
              }
              return { ...prev, phase: 'idle', secondsRemaining: 0, isRunning: false }
            }
            return { ...prev, secondsRemaining: next }
          })
        }, 1000)
      }
    } else {
      clearTimer()
    }

    return () => {
      clearTimer()
    }
  }, [state.isRunning, state.phase, clearTimer, settings])

  const totalSeconds = useMemo(() => {
    if (state.phase === 'work') return settings.pomodoroWorkMinutes * 60
    if (state.phase === 'break') return settings.pomodoroBreakMinutes * 60
    if (state.phase === 'long-break') return settings.pomodoroLongBreakMinutes * 60
    return 0
  }, [state.phase, settings])

  const display: PomodoroDisplay | null = useMemo(() => {
    if (state.phase === 'idle') return null
    return {
      phase: state.phase,
      secondsRemaining: state.secondsRemaining,
      totalSeconds,
      isRunning: state.isRunning,
      formatted: formatTimerDisplay(state.secondsRemaining),
    }
  }, [state.phase, state.secondsRemaining, state.isRunning, totalSeconds])

  const isActive = settings.pomodoroEnabled && state.phase !== 'idle'

  // Timer is manual-only — sessions do not auto-start or auto-end it.
  const onSessionStart = useCallback(() => {}, [])
  const onSessionEnd = useCallback(() => {}, [])

  const toggle = useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'idle' || prev.secondsRemaining <= 0) {
        // When idle or expired, start a new work phase. Use setTimeout to avoid
        // setState-during-setState when called from a setState update.
        window.setTimeout(() => { startWork() }, 0)
        return prev
      }
      return { ...prev, isRunning: !prev.isRunning }
    })
  }, [startWork])

  return {
    state,
    display,
    isActive,
    startWork,
    pause,
    resume,
    toggle,
    skip,
    reset,
    onSessionStart,
    onSessionEnd,
  }
}
