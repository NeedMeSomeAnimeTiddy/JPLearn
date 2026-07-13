import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BadgeEntry } from './types'
import { EARNED_BADGE_ORDER } from './constants'

export function useAchievements() {
  const [badges, setBadges] = useState<BadgeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.jplearnDesktop?.getFeatureState?.()
      if (!mountedRef.current) return
      const earnedMap = new Set<string>()
      if (result?.features) {
        for (const feat of result.features) {
          if (feat.badges && feat.is_unlocked) {
            for (const badge of feat.badges) {
              earnedMap.add(badge)
            }
          }
        }
      }
      const entries: BadgeEntry[] = EARNED_BADGE_ORDER.map((descriptor) => ({
        descriptor,
        earned: earnedMap.has(descriptor),
      }))
      setBadges(entries)
    } catch (e: unknown) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : 'Failed to load achievements.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  const earnedCount = useMemo(() => badges.filter((b) => b.earned).length, [badges])

  return { badges, loading, error, earnedCount, totalCount: EARNED_BADGE_ORDER.length, refetch: fetch }
}
