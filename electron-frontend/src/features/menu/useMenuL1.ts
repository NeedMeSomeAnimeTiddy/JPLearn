import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HERO_INDEX, MENU_SECTIONS } from './constants'
import type { MenuController, MenuSection } from './types'

/* WHAT IS UNLOCKED IS READ, NOT DECIDED. `domain/feature_catalog.py` gates nine features behind
   curriculum milestones and the bridge has reported them since long before this menu existed;
   `useAchievements` reads the same command for badges. Deciding here would be a second source of
   truth for the one thing the whole progression game turns on.

   UNTIL IT ANSWERS, NOTHING IS LOCKED. A menu that draws five locked rows for a second and then
   unlocks four of them reads as a bug, and a first-run account genuinely has most of them shut --
   so the honest default while loading is "not yet known", drawn open. */
export function useMenuL1(enabled: boolean): MenuController {
  const [active, setActiveState] = useState<number>(HERO_INDEX)
  const [unlocked, setUnlocked] = useState<Set<string> | null>(null)
  const askedRef = useRef(false)

  useEffect(() => {
    if (!enabled || askedRef.current) return
    const getFeatureState = window.jplearnDesktop?.getFeatureState
    if (!getFeatureState) return
    askedRef.current = true
    let alive = true
    void getFeatureState()
      .then((payload) => {
        if (!alive) return
        const open = new Set<string>()
        for (const feature of payload?.features ?? []) {
          if (feature.is_unlocked) open.add(feature.feature_id)
        }
        setUnlocked(open)
      })
      .catch(() => {
        /* the menu is still usable without it; every section simply draws open */
        if (alive) setUnlocked(null)
      })
    return () => { alive = false }
  }, [enabled])

  const setActive = useCallback((index: number) => {
    setActiveState(index < HERO_INDEX ? HERO_INDEX : Math.min(index, MENU_SECTIONS.length - 1))
  }, [])

  const step = useCallback((direction: 1 | -1) => {
    setActiveState((current) => {
      const next = current + direction
      if (next < HERO_INDEX) return MENU_SECTIONS.length - 1
      if (next > MENU_SECTIONS.length - 1) return HERO_INDEX
      return next
    })
  }, [])

  const isLocked = useCallback((section: MenuSection) => {
    if (!section.gate) return false
    if (!unlocked) return false
    return !unlocked.has(section.gate.feature)
  }, [unlocked])

  return useMemo<MenuController>(
    () => ({ active, setActive, step, unlocked, isLocked }),
    [active, setActive, step, unlocked, isLocked],
  )
}
