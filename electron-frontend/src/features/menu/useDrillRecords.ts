import { useCallback, useEffect, useState } from 'react'
import type { DeckSlugInput, DrillRecord, MinigameKey } from '../../types'
import type { MinigameRecordPayload } from '../../generated/types'
import { useAnswerOutcomes } from '../pending-answers/useAnswerOutcomes'

/* ==================================================================================================
   THE DRILLS SCREEN'S RECORD, READ FROM REVIEW HISTORY (audit 17, F1).

   It was a figure kept in memory and never saved, so every launch said NOT PLAYED ON THIS DECK over
   modes played hundreds of times, while SQLite held every answer. The bridge now counts them per
   level deck (Robbie: Kanji N3 shows only Kanji N3), with the best run rebuilt from the answer
   order.

   ONLY WHILE THE SCREEN IS UP. `slug` is null when Drills is not showing, so nothing is read for a
   screen nobody is looking at; the bridge is strictly serial.

   ASKED AGAIN WHEN IT CAN HAVE MOVED: on opening, on a deck change, when the queue of answers still
   being saved empties (a delayed save, a refused one and a replayed one all end there), and when
   `refresh` is called (a reset). Each ask is one effect run; a reply lands only if that run is still
   the latest, so A then B then A, or a reply after a reset, can never draw an old deck's figures.

   `null` IS NOT "NOT PLAYED". Until a reply lands, and if it fails, there is no record rather than an
   empty one, and the screen draws the placeholder instead of claiming the mode was never run.
   ================================================================================================== */

export type DrillRecords = Partial<Record<MinigameKey, DrillRecord>>

export interface DrillRecordsState {
  /** null while loading, after a failed read, or with no deck on screen */
  records: DrillRecords | null
  /** read again now, dropping any reply still on its way */
  refresh: () => void
}

export function toDrillRecords(rows: readonly MinigameRecordPayload[]): DrillRecords {
  const records: Record<string, DrillRecord> = {}
  for (const row of rows) {
    records[row.mode] = { attempted: row.attempted, correct: row.correct, bestRun: row.best_run }
  }
  return records as DrillRecords
}

const ignore = (): void => {}

export function useDrillRecords(slug: DeckSlugInput | null): DrillRecordsState {
  const [records, setRecords] = useState<DrillRecords | null>(null)
  const [generation, setGeneration] = useState(0)
  const refresh = useCallback(() => setGeneration((value) => value + 1), [])

  useAnswerOutcomes({
    onSaved: ignore,
    onRejected: ignore,
    onQueueChanged: (_snapshot, emptied) => { if (emptied) refresh() },
  })

  useEffect(() => {
    setRecords(null)
    const read = window.jplearnDesktop?.getMinigameRecords
    if (!slug || !read) return undefined
    let latest = true
    void read(slug)
      .then((payload) => { if (latest) setRecords(toDrillRecords(payload?.records ?? [])) })
      .catch(() => { /* the record line keeps the placeholder; the rest of the screen stands */ })
    return () => { latest = false }
  }, [slug, generation])

  return { records, refresh }
}
