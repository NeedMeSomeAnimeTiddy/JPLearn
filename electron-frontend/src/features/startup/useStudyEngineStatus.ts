import { useCallback, useRef, useState } from 'react'

/* ==================================================================================================
   A STUDY ENGINE THAT NEVER ANSWERED IS NOT A CLEAR DAY (audit 11, F1).

   When the first summary of a launch fails, the recommendations read beside it fails too, and the
   home hero used to draw that absence as "nothing due". This is the one fact that tells the two
   apart: no summary has arrived since launch, and the last attempt failed. A failure after a summary
   has arrived is not this state -- the learner has seen real data, and the overlay still reports it.
   ================================================================================================== */

export interface StudyEngineStatus {
  /** the last failure's message, while no summary has arrived since launch; otherwise null */
  failure: string | null
  /** a summary arrived. True when the home data should be fetched again for it */
  recordSuccess: () => boolean
  /** a summary load failed. True when no summary has arrived since launch */
  recordFailure: (message: string) => boolean
}

export function useStudyEngineStatus(): StudyEngineStatus {
  const [failure, setFailure] = useState<string | null>(null)
  const succeededRef = useRef(false)
  const failedRef = useRef(false)

  const recordSuccess = useCallback(() => {
    /* THE FIRST SUMMARY OF A CLEAN LAUNCH ADDS NOTHING (F5): the home data was fetched on mount,
       beside it. After a failure the mount fetch failed too, so a Retry's summary fetches again. */
    const refetch = succeededRef.current || failedRef.current
    succeededRef.current = true
    setFailure(null)
    return refetch
  }, [])

  const recordFailure = useCallback((message: string) => {
    failedRef.current = true
    if (succeededRef.current) return false
    setFailure(message)
    return true
  }, [])

  return { failure, recordSuccess, recordFailure }
}
