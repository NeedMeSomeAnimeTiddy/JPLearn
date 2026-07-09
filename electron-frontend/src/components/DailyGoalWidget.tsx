import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, Target } from 'lucide-react'

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
    } catch { /* bridge may not be ready */ }
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
    } catch { /* ignore */ }
    if (mountedRef.current) setLoading(false)
  }

  const presets = goal?.presets ?? DEFAULT_PRESETS
  const target = goal?.target ?? 0
  const current = goal?.current ?? 0
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
  const isMet = goal?.goal_met ?? false

  if (!goal) return null

  return (
    <div className="daily-goal-widget" ref={widgetRef}>
      <button
        type="button"
        className="daily-goal-display"
        onClick={() => setShowPicker((v) => !v)}
        disabled={loading}
        aria-label={`Daily goal: ${current} of ${target} cards${isMet ? ' — goal met!' : ''}`}
      >
        <Target size={14} strokeWidth={2} aria-hidden="true" />
        <span className="daily-goal-label">Daily Goal</span>
        <div
          className="daily-goal-track"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`daily-goal-fill${isMet ? ' is-met' : ''}`}
            style={{ '--goal-pct': `${pct}%` } as CSSProperties}
          />
        </div>
        <span className={`daily-goal-count${isMet ? ' is-met' : ''}`}>
          {isMet ? <Check size={12} strokeWidth={2.5} /> : `${current} / ${target}`}
        </span>
      </button>

      {showPicker && (
        <div className="daily-goal-picker">
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              className={`daily-goal-preset${n === target ? ' is-active' : ''}`}
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
