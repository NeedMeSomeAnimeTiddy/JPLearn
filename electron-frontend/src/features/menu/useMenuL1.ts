import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureStatusPayload } from '../../generated/types'
import { HERO_INDEX, MENU_SECTIONS } from './constants'
import type { MenuController, MenuSection } from './types'
import { UNLOCK_SEEN_KEY, gateWords, highWater, newlyUnlocked } from './unlock'
import type { GateWords } from './unlock'
import type { ProgressionNodeView } from '../progression'

/* WHAT IS UNLOCKED IS READ, NOT DECIDED. `domain/feature_catalog.py` gates nine features behind
   curriculum milestones and the bridge has reported them since long before this menu existed;
   `useAchievements` reads the same command for badges. Deciding here would be a second source of
   truth for the one thing the whole progression game turns on.

   UNTIL IT ANSWERS, NOTHING IS LOCKED. A menu that draws five locked rows for a second and then
   unlocks four of them reads as a bug, and a first-run account genuinely has most of them shut --
   so the honest default while loading is "not yet known", drawn open.

   AND IT ASKS AGAIN EVERY TIME THE MENU COMES BACK, which it did not. Asking once per App mount had
   two consequences and both were wrong: a section unlocked DURING a study session stayed drawn shut
   until the app was relaunched, and phase 6's unlock moment -- which is the transition -- could
   never fire, because the only fetch happened before the thing that caused it. One command per
   return to the menu answers both, and `build_feature_unlock_status` is also what PERSISTS an
   unlock, so asking on the way back in is what makes it real.

   AND IT ASKS AFTER THE PROGRESSION, WHICH IS NOT A PREFERENCE. `build_feature_unlock_status`
   evaluates the catalog against `_load_progression_state()`, and those node rows are written by
   `sync_progression_state` -- which only two commands run, both of them the progression's. So a
   feature read that lands first in the strictly serial bridge is judged against LAST cycle's nodes.
   Measured live: mastering a deck mid-session and returning to the menu drew nothing, and the
   moment arrived on the trip after. `progressionToken` is whatever changes when that sync has
   landed, so the second read is the one that counts. */
/* A DEFAULT PARAMETER IS A NEW ARRAY EVERY RENDER, and this effect depends on it. Written as
   `nodes = []` in the signature, a caller that omits it handed the effect a fresh identity on each
   pass: fetch, setState, render, fresh `[]`, fetch again. Measured by a test that expected two
   calls and counted 46,580. The empty case is one shared object. */
const NO_NODES: readonly ProgressionNodeView[] = []

export function useMenuL1(
  enabled: boolean, nodes: readonly ProgressionNodeView[] = NO_NODES,
): MenuController {
  const [active, setActiveState] = useState<number>(HERO_INDEX)
  const [unlocked, setUnlocked] = useState<Set<string> | null>(null)
  const [pendingUnlocks, setPendingUnlocks] = useState<FeatureStatusPayload[]>([])
  /* kept whole, because the lock lines are read off `requires` and not off a second table */
  const [features, setFeatures] = useState<FeatureStatusPayload[]>([])
  /* what this surface has already announced. Read once and then held, because the mark is written
     on dismissal and re-reading storage mid-flight would race that write. */
  const seenRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    const getFeatureState = window.jplearnDesktop?.getFeatureState
    if (!getFeatureState) return
    let alive = true
    void getFeatureState()
      .then((payload) => {
        if (!alive) return
        const features = payload?.features ?? []
        const open = new Set<string>()
        for (const feature of features) {
          if (feature.is_unlocked) open.add(feature.feature_id)
        }
        setUnlocked(open)
        setFeatures(features)

        if (seenRef.current === undefined) {
          try { seenRef.current = window.localStorage.getItem(UNLOCK_SEEN_KEY) } catch { seenRef.current = null }
        }
        /* A SURFACE THAT HAS NEVER LOOKED HAS WITNESSED NOTHING. The first read stores the mark and
           announces none of it, or every account that installs this build opens on a moment
           celebrating features it earned months ago. */
        if (seenRef.current === null) {
          seenRef.current = highWater(features)
          try { window.localStorage.setItem(UNLOCK_SEEN_KEY, seenRef.current) } catch { /* private mode */ }
          return
        }
        const fresh = newlyUnlocked(features, seenRef.current)
        if (fresh.length) setPendingUnlocks(fresh)
      })
      .catch(() => {
        /* the menu is still usable without it; every section simply draws open */
        if (alive) setUnlocked(null)
      })
    return () => { alive = false }
  }, [enabled, nodes])

  /* DISMISSING IS WHAT ADVANCES THE MARK, not showing. A moment that was drawn and never seen --
     the app closed, the window lost -- should still be waiting next time. */
  const dismissUnlocks = useCallback((mark: string) => {
    seenRef.current = mark
    try { window.localStorage.setItem(UNLOCK_SEEN_KEY, mark) } catch { /* private mode */ }
    setPendingUnlocks([])
  }, [])

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

  /** what a section is waiting for, in the curriculum's words — null while nothing is known */
  const gateOf = useCallback((featureId: string): GateWords | null => {
    const feature = features.find((entry) => entry.feature_id === featureId)
    return gateWords(feature?.requires, nodes)
  }, [features, nodes])

  const isLocked = useCallback((section: MenuSection) => {
    if (!section.gate) return false
    if (!unlocked) return false
    return !unlocked.has(section.gate.feature)
  }, [unlocked])

  return useMemo<MenuController>(
    () => ({ active, setActive, step, unlocked, isLocked, gateOf, pendingUnlocks, dismissUnlocks }),
    [active, setActive, step, unlocked, isLocked, gateOf, pendingUnlocks, dismissUnlocks],
  )
}
