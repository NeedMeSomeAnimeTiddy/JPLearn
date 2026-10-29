import { useCallback, useEffect, useRef } from 'react'
import type { LearningPathStatus, XPProgress } from '../../types'
import type { StudyBlockPayload } from '../../generated/types'

export interface HomeDataSetters {
  setXpProgress: (xp: XPProgress) => void
  setStudyBlock: (block: StudyBlockPayload) => void
  setLearningPathStatus: (path: LearningPathStatus) => void
}

async function safeResolve<T>(fn: (() => Promise<T>) | undefined): Promise<T | null> {
  if (!fn) return null
  try { return await fn() } catch { return null }
}

/* ==================================================================================================
   XP, RECOMMENDATIONS AND THE LEARNING PATH: fetched once on mount, and again only when asked
   (audit 11, F5). They used to refetch on every change to `summary`, which included the first
   summary arriving -- a second copy of all three on the serial bridge in the first second of every
   launch. The caller asks after a later summary (study, Refresh Data, Retry).

   NEWEST WINS. Each fetch takes a number; one that comes back after a newer one started is dropped,
   so a slow old answer cannot overwrite a fresh one. A read that fails leaves its value as it was.
   ================================================================================================== */
export function useHomeData({ setXpProgress, setStudyBlock, setLearningPathStatus }: HomeDataSetters): () => void {
  const requestRef = useRef(0)

  const refreshHomeData = useCallback(() => {
    const request = ++requestRef.current
    const api = window.jplearnDesktop
    void (async () => {
      const [xp, recs, path] = await Promise.all([
        safeResolve(api?.getXpProgress),
        safeResolve(api?.getRecommendations),
        safeResolve(api?.getLearningPathStatus),
      ])
      if (request !== requestRef.current) return
      if (xp) setXpProgress(xp)
      if (recs) setStudyBlock(recs)
      if (path) setLearningPathStatus(path as LearningPathStatus)
    })()
  }, [setXpProgress, setStudyBlock, setLearningPathStatus])

  useEffect(() => {
    refreshHomeData()
    /* a fetch still out when the screen goes is dropped the same way a stale one is */
    return () => { requestRef.current += 1 }
  }, [refreshHomeData])

  return refreshHomeData
}
