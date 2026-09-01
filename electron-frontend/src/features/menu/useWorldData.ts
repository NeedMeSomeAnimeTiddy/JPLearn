import { useEffect, useRef, useState } from 'react'
import type { Passage } from '../passages'
import type { ScenarioSessionPayload } from '../../generated/types'

/* ==================================================================================================
   WHAT THE WORLD'S TWO LANES NEED, and nothing else.

   ONE AT A TIME, NEVER TOGETHER. The Python child process handles one request at a time and a
   timed-out request rejects every other one in flight with it, so these two are awaited in
   sequence. `Promise.all` here would be two menu figures betting on each other.

   ASKED ONCE, AND ONLY WHEN THE SCREEN IS UP. Neither figure changes while you look at it, and
   neither is worth 348 KB of passage text on a screen you never opened — so the fetch is gated on
   arrival at the lanes and never repeats. Until it answers, the lanes say so: the count draws as
   an absence, not as a zero.
   ================================================================================================== */

export interface WorldData {
  passages: Passage[] | null
  sessions: ScenarioSessionPayload[] | null
}

const NOTHING: WorldData = { passages: null, sessions: null }

export function useWorldData(enabled: boolean): WorldData {
  const [data, setData] = useState<WorldData>(NOTHING)
  const askedRef = useRef(false)

  useEffect(() => {
    if (!enabled || askedRef.current) return
    askedRef.current = true
    let alive = true

    void (async () => {
      /* EACH ONE LANDS ON ITS OWN. A lane whose figure arrived should draw it even if the other
         call failed — one dead bridge command must not blank the half of the screen that works. */
      const getPassages = window.jplearnDesktop?.getPassages
      if (getPassages) {
        try {
          const payload = await getPassages()
          if (!alive) return
          setData((current) => ({ ...current, passages: (payload?.passages ?? []) as Passage[] }))
        } catch {
          /* the lane still draws, saying it has not been counted */
        }
      }

      const listSessions = window.jplearnDesktop?.listScenarioSessions
      if (listSessions) {
        try {
          const payload = await listSessions()
          if (!alive) return
          setData((current) => ({ ...current, sessions: payload?.sessions ?? [] }))
        } catch {
          /* likewise: TALK keeps its two scenes and drops only the play count */
        }
      }
    })()

    return () => { alive = false }
  }, [enabled])

  return data
}
