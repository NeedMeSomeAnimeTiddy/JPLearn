import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_PRESETS = [10, 20, 30, 50, 75]

interface DailyGoalData {
  target: number
  current: number
  goal_met: boolean
  presets: number[]
}

interface DailyGoalWidgetProps {
  onGoalChange?: () => void
}

export function DailyGoalWidget({ onGoalChange }: DailyGoalWidgetProps) {
  const [goal, setGoal] = useState<DailyGoalData | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)
  const widgetRef = useRef<HTMLDivElement>(null)

  const fetchGoal = useCallback(async () => {
    if (!window.jplearnDesktop?.getDailyGoal) return
    try {
      const data = await window.jplearnDesktop.getDailyGoal()
      if (mountedRef.current) setGoal(data)
    } catch {}
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchGoal()
    return () => { mountedRef.current = false }
  }, [fetchGoal])

  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  const handleSetGoal = async (target: number) => {
    if (!window.jplearnDesktop?.setDailyGoal) return
    setLoading(true)
    try {
      const data = await window.jplearnDesktop.setDailyGoal(target)
      if (mountedRef.current) {
        setGoal(data)
        setShowPicker(false)
        onGoalChange?.()
      }
    } catch {}
    if (mountedRef.current) setLoading(false)
  }

  const presets = goal?.presets ?? DEFAULT_PRESETS
  const target = goal?.target ?? 0
  const current = goal?.current ?? 0
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0

  if (!goal) return null

  return (
    <div className="home-bar daily-goal-widget" ref={widgetRef}>
      <button
        type="button"
        className="home-bar-clickable"
        onClick={() => setShowPicker((v) => !v)}
        disabled={loading}
        aria-label={`Daily goal: ${current} of ${target} cards`}
      >
        <span className="home-bar-label">Daily Goal</span>
        <div className="home-bar-meter">
          <div className="home-bar-meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="home-bar-count">{current}/{target}</span>
      </button>

      {showPicker && (
        <div className="home-bar-picker">
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              className={`home-bar-picker-btn${n === target ? ' is-active' : ''}`}
              onClick={() => { void handleSetGoal(n) }}
              disabled={loading}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
