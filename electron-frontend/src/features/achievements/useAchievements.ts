import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BadgeEntry } from './types'
import {
  EARNED_BADGE_ORDER,
  MILESTONE_BADGE_ORDER,
  NODE_MASTERY_BADGE_ORDER,
  STREAK_BADGE_ORDER,
} from './constants'

const BADGE_ORDER = [
  ...EARNED_BADGE_ORDER,
  ...MILESTONE_BADGE_ORDER,
  ...STREAK_BADGE_ORDER,
  ...NODE_MASTERY_BADGE_ORDER,
]

export function useAchievements() {
  const [badges, setBadges] = useState<BadgeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [featureResult, milestoneResult] = await Promise.all([
        window.jplearnDesktop?.getFeatureState?.(),
        window.jplearnDesktop?.getAchievementMilestones?.(),
      ])
      if (!mountedRef.current) return
      const earnedMap = new Set<string>()
      if (featureResult?.features) {
        for (const feat of featureResult.features) {
          if (feat.badges && feat.is_unlocked) {
            for (const badge of feat.badges) {
              earnedMap.add(badge)
            }
          }
        }
      }
      if (milestoneResult?.milestones) {
        for (const milestone of milestoneResult.milestones) {
          if (milestone.earned) {
            earnedMap.add(milestone.descriptor)
          }
        }
      }
      if (milestoneResult?.streak_milestones) {
        for (const milestone of milestoneResult.streak_milestones) {
          if (milestone.earned) {
            earnedMap.add(milestone.descriptor)
          }
        }
      }
      if (milestoneResult?.node_mastery_badges) {
        for (const badge of milestoneResult.node_mastery_badges) {
          if (badge.earned) {
            earnedMap.add(badge.descriptor)
          }
        }
      }
      const entries: BadgeEntry[] = BADGE_ORDER.map((descriptor) => ({
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

  return { badges, loading, error, earnedCount, totalCount: BADGE_ORDER.length, refetch: fetch }
}
