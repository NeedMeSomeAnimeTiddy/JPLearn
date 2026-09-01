import { useEffect, useRef, useState } from 'react'
import type { ReadinessPayload } from './ascent'

/* ==================================================================================================
   ONE CALL, ASKED WHEN THE LADDER IS UP.

   `jlpt-readiness` recomputes mastery across all five levels' decks, so it is not free and it is
   not worth paying for on a screen nobody opened. It is also the only thing the ascent needs: the
   mockup's ladder wanted a last-mock score per level too, and that moved to level three with the
   detail panel.

   NOT LOADED IS NOT ZERO. Until it answers there are no columns at all rather than five empty ones
   — five zero-height bars that then jump is a worse lie than a moment of nothing, and on this
   account the answered state is also five zeroes, which would make the two indistinguishable.
   ================================================================================================== */

export interface ReadinessState {
  readiness: ReadinessPayload | null
  loading: boolean
}

export function useReadiness(enabled: boolean): ReadinessState {
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const askedRef = useRef(false)

  useEffect(() => {
    if (!enabled || askedRef.current) return
    const getJLPTReadiness = window.jplearnDesktop?.getJLPTReadiness
    if (!getJLPTReadiness) return
    askedRef.current = true
    let alive = true
    setLoading(true)
    void getJLPTReadiness()
      .then((payload) => {
        if (!alive) return
        setReadiness(payload as unknown as ReadinessPayload)
      })
      .catch(() => {
        /* the screen keeps its caption and its measure, and simply has no ladder to draw */
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [enabled])

  return { readiness, loading }
}
