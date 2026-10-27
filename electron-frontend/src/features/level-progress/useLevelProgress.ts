import { useEffect, useMemo, useState } from 'react'
import type { LevelProgressPayload } from '../../generated/types'
import type { CardScores, JlptLevelProgress } from '../../types'
import { levelProgressFor } from './utils'

const LEVEL_PROGRESS_SETTLE_MS = 300

export interface LevelProgressDeps {
  /** The renderer's counters. A new object means a counter moved, so the figures are re-read. */
  cardScores: CardScores
  /** True while a session runs: its answers are summed once it ends, not one read per answer. */
  paused: boolean
}

/* THE KANJI AND VOCABULARY LEVEL BARS (audit 3, F5). Each level's figure is its deck's summed 0..4
   counters over four times its size, the same formula the deck progress bars use. The bridge sums
   them per level so the renderer never fetches every level's cards (about 8,000 words) through the
   serial bridge just to draw five chips.

   Read on launch, after a session ends, and whenever the counters change outside a session (a
   reset, onboarding seeding, a backup import). A failed read keeps the last figures. */
export function useLevelProgress({ cardScores, paused }: LevelProgressDeps): {
  kanji: JlptLevelProgress[]
  vocab: JlptLevelProgress[]
} {
  const [payload, setPayload] = useState<LevelProgressPayload | null>(null)

  useEffect(() => {
    if (paused) return
    const getLevelProgress = window.jplearnDesktop?.getLevelProgress
    if (!getLevelProgress) return
    let cancelled = false
    /* A burst of counter changes (the launch snapshot then the database read; answers still
       saving after a session ends) settles into one bridge read rather than one each. */
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const next = await getLevelProgress()
          if (!cancelled && next) setPayload(next)
        } catch {
          // Best-effort: the bar keeps what it last showed and the next change re-reads.
        }
      })()
    }, LEVEL_PROGRESS_SETTLE_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [cardScores, paused])

  const kanji = useMemo(() => levelProgressFor(payload, 'kanji'), [payload])
  const vocab = useMemo(() => levelProgressFor(payload, 'vocab'), [payload])
  return { kanji, vocab }
}
