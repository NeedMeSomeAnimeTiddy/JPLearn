import type { LevelProgressPayload } from '../../generated/types'
import type { JlptLevel, JlptLevelProgress } from '../../types'
import { JLPT_LEVEL_ORDER } from '../../constants'
import { buildJlptLevelProgressFromTotals, type LevelDeckTotals } from '../../lib/progressAggregation'

export type LevelFamily = 'kanji' | 'vocab'

function isJlptLevel(value: string): value is JlptLevel {
  return (JLPT_LEVEL_ORDER as readonly string[]).includes(value)
}

/** One family's level bar from the bridge's `level-progress` payload; empty levels before it answers. */
export function levelProgressFor(
  payload: LevelProgressPayload | null,
  family: LevelFamily,
): JlptLevelProgress[] {
  const totals: Partial<Record<JlptLevel, LevelDeckTotals>> = {}
  for (const entry of payload?.levels ?? []) {
    if (entry.family !== family || !isJlptLevel(entry.level)) continue
    totals[entry.level] = { total: entry.total, scoreSum: entry.score_sum }
  }
  return buildJlptLevelProgressFromTotals(totals)
}
