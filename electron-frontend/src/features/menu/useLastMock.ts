import { useEffect, useRef, useState } from 'react'
import type { LastMock } from './examLevel'

/* ==================================================================================================
   THE LAST MOCK, WHICH THIS SCREEN HAS BEEN BUILT TO SHOW AND NEVER SHOWN.

   `levelDetail(rung, data, lastMock)` takes it, `LevelDetail.lastMock` carries it, `sectionLine`
   branches on whether it exists, and `App.tsx` passed a hard-coded `null` -- with a comment saying
   "the projection is the BACKEND's, stored on the result", which is true and was the reason nobody
   noticed it was never fetched. So the branch that reads "you scored 38 of 60 last time, projecting
   112" has never once been taken, and every level in the exam ladder says the same "no mock sat yet"
   whether you have sat one or not.

   THE DATA HAS BEEN THERE THE WHOLE TIME. `jlpt_exam_results` records every mock, the bridge exposes
   it as `jlpt-exam-history`, the preload exposes THAT as `getJLPTExamHistory`, and the flat prep view
   has been drawing eight rows of it for as long as it has existed. Nothing needed building; this
   needed asking.

   ONE LEVEL AT A TIME, AND ONLY WHEN ITS PANEL IS OPEN. The history table grows without bound and
   the bridge is strictly serial -- see the note in CLAUDE.md -- so this asks for the level you are
   looking at rather than pulling the whole table to filter it here.

   AND `null` IS NOT `not yet`. Until the call answers there is no mock rather than no mock SAT, and
   those two draw differently: `sectionLine` says "NO MOCK SAT YET" for the second, which would be a
   lie for a fifth of a second every time the panel opens. `settled` is what separates them.
   ================================================================================================== */

export interface LastMockState {
  mock: LastMock | null
  /** false until the answer is in, so "not sat" is never drawn over "not asked yet" */
  settled: boolean
}

export function useLastMock(level: string | null): LastMockState {
  const [state, setState] = useState<LastMockState>({ mock: null, settled: false })
  /* which level the state in hand belongs to, so a slow answer for N3 cannot land on N2's panel */
  const wantRef = useRef<string | null>(null)

  useEffect(() => {
    wantRef.current = level
    if (!level) { setState({ mock: null, settled: false }); return }
    const get = window.jplearnDesktop?.getJLPTExamHistory
    if (!get) { setState({ mock: null, settled: true }); return }
    let alive = true
    setState({ mock: null, settled: false })
    void get(level as Parameters<typeof get>[0])
      .then((payload) => {
        if (!alive || wantRef.current !== level) return
        /* THE MOST RECENT, and the table is ordered newest first by the query that builds it --
           taken as `[0]` rather than sorted here, because a second opinion about the ordering is
           how the two come apart. */
        const last = payload?.results?.[0]
        setState({
          mock: last
            ? { correct: last.correct, asked: last.questions_answered, projected: last.projected_score }
            : null,
          settled: true,
        })
      })
      .catch(() => {
        /* the panel keeps everything else it knows and simply has no mock to report */
        if (alive && wantRef.current === level) setState({ mock: null, settled: true })
      })
    return () => { alive = false }
  }, [level])

  return state
}
