import { useCallback, useMemo, useState } from 'react'
import type { MenuSectionKey } from '../menu'
import type { MenuPath, MenuPathApi } from './types'

/* ==================================================================================================
   THE TREE, AND THE BACK STACK THAT WALKS OUT OF IT.

   The app's own navigation is a flat `AppView` plus an order-of-visit history: six screens, all
   siblings, and a `VIEW_PARENT` map so Escape has somewhere to go. That is the right model for six
   destinations and the wrong one for a menu that is three levels deep, because "up" and "back" stop
   being the same question the moment you can arrive at the same screen two ways.

   So this is a SECOND, SMALLER model that sits above the old one rather than replacing it. It owns
   L1 → L2 → L3 — the menu — and hands off to the flat views at L4, which is where the app already
   is. The two coexist deliberately, exactly as the port plan's third decision asks: every phase
   ships on its own, and the old chrome stays one switch away.

   PASSTHROUGH IS THE WHOLE TRICK. A section with no L2 screen yet does not stop at L2 — it goes
   straight through to the flat view that does its job today. Phase 4 registers screens one at a
   time, and each registration silently converts a passthrough into a real stop without touching
   anything that calls this. All five are registered now, so nothing passes through any more — the
   mechanism stays because level three is the next thing to fill in the same way.
   ================================================================================================== */

/** sections that have a real L2 screen. Phase 4 fills this one entry at a time. */
export const L2_READY: Partial<Record<MenuSectionKey, true>> = {
  /* phase 4: the journey, sixteen milestones, built from the live curriculum */
  STUDY: true,
  /* phase 4: three lanes — review, drills, the daily puzzles */
  DRILLS: true,
  /* phase 4: two lanes on the same card — read, and talk */
  READING: true,
  /* phase 4: the ascent — five levels, and the two thresholds that govern them */
  JLPT: true,
  /* phase 4: the ledger — the streak, the year, and what the app can actually count */
  RECORDS: true,
}

export const ROOT: MenuPath = { level: 1 }

export function useMenuPath(onPassthrough: (section: MenuSectionKey) => void): MenuPathApi {
  const [path, setPath] = useState<MenuPath>(ROOT)

  const enterSection = useCallback((section: MenuSectionKey) => {
    if (!L2_READY[section]) {
      /* no L2 screen for this one yet: the row still goes where it went before. The path stays at
         the root, because a level you cannot see is not a level you should be able to Escape out
         of -- that would make Escape do nothing, once, for no visible reason. */
      onPassthrough(section)
      return
    }
    setPath({ level: 2, section })
  }, [onPassthrough])

  const enterScreen = useCallback((screen: string) => {
    setPath((current) => (
      current.level === 2 ? { level: 3, section: current.section, screen } : current
    ))
  }, [])

  /* UP, NOT BACK. Returns false when there is nowhere above to go, so the caller can fall through
     to whatever it would have done -- in App's case the flat `VIEW_PARENT` chain. Making that an
     explicit boolean rather than a silent no-op is what stops Escape from becoming a key that
     sometimes does nothing. */
  const up = useCallback((): boolean => {
    /* read `path` rather than setting a flag inside the updater: React may call a state updater
       more than once (and does, in StrictMode), so anything it writes to a closure is not a
       reliable answer to give the caller. */
    if (path.level === 3) { setPath({ level: 2, section: path.section }); return true }
    if (path.level === 2) { setPath(ROOT); return true }
    return false
  }, [path])

  const reset = useCallback(() => setPath(ROOT), [])

  return useMemo<MenuPathApi>(() => ({
    path,
    level: path.level,
    section: path.level === 1 ? null : path.section,
    screen: path.level === 3 ? path.screen : null,
    enterSection,
    enterScreen,
    up,
    reset,
  }), [path, enterSection, enterScreen, up, reset])
}
