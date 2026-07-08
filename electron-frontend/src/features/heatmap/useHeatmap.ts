import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Activity } from 'react-activity-calendar'
import { DEFAULT_LOOKBACK_DAYS } from './constants'

function toLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 3) return 1
  if (count <= 7) return 2
  if (count <= 14) return 3
  return 4
}

function parseAnyColor(str: string): [number, number, number] {
  const rgba = str.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/)
  if (rgba) return [parseInt(rgba[1]), parseInt(rgba[2]), parseInt(rgba[3])]
  const hex = str.replace('#', '')
  if (hex.length >= 6) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
  }
  return [0, 0, 0]
}

function blend(rgb1: [number, number, number], rgb2: [number, number, number], pct: number): string {
  const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * (pct / 100))
  const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * (pct / 100))
  const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * (pct / 100))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function computeTheme(): { light: string[]; dark: string[] } {
  try {
    const style = getComputedStyle(document.documentElement)
    const panelBg = style.getPropertyValue('--panel-bg').trim() || '#1a1a2e'
    const toneAmber = style.getPropertyValue('--tone-amber').trim() || '#f2b56f'

    const bg = parseAnyColor(panelBg)
    const amber = parseAnyColor(toneAmber)

    const levels = [15, 33, 55, 76, 95]

    const dark = levels.map((pct) => blend(bg, amber, pct))
    const light = levels.map((pct) => blend(parseAnyColor('#ebedf0'), amber, pct))

    return { light, dark }
  } catch {
    return {
      light: ['#ebedf0', '#e8d5c4', '#d4b896', '#b89060', '#987038'],
      dark:  ['#1a1a2e', '#3a2a1a', '#5a3a22', '#7a4a2e', '#987038'],
    }
  }
}

function buildFullDateRange(): Activity[] {
  const result: Activity[] = []
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - DEFAULT_LOOKBACK_DAYS + 1)
  let current = new Date(start)
  while (current <= today) {
    result.push({
      date: current.toISOString().slice(0, 10),
      count: 0,
      level: 0,
    })
    current.setDate(current.getDate() + 1)
  }
  return result
}

export function useHeatmap() {
  const [data, setData] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.jplearnDesktop?.getDailyActivity?.(DEFAULT_LOOKBACK_DAYS)
      if (!mountedRef.current) return
      const full = buildFullDateRange()
      if (result?.ok && result.days.length > 0) {
        const dayMap = new Map(result.days.map((d) => [d.date, d]))
        for (const entry of full) {
          const hit = dayMap.get(entry.date)
          if (hit) {
            entry.count = hit.count
            entry.level = toLevel(hit.count)
          }
        }
      }
      setData(full)
    } catch (e: unknown) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load activity data.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  const theme = useMemo(() => computeTheme(), [])

  return { data, loading, error, refetch: fetch, theme }
}
