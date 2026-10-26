import type { KanjiCompound, KanjiDetailPayload, KanjiReading } from '../../generated/types'
import { formatTagLabel } from '../../utils'
import { KANJI_SHEET_ROWS, KANJI_SHEET_READING_ROWS } from './constants'

const HAN_IDEOGRAPH = /^\p{Unified_Ideograph}$/u

export function extractKanjiCharacters(value: string): string[] {
  const seen = new Set<string>()
  return Array.from(value).filter((character) => {
    if (!HAN_IDEOGRAPH.test(character) || seen.has(character)) return false
    seen.add(character)
    return true
  })
}

export function formatKanjiReading(reading: string): string {
  return reading.replaceAll('.', '・')
}

export function formatKanjiDetailTag(tag: string): string {
  return formatTagLabel(tag)
}

/* ==================================================================================================
   WHAT THE MIDDLE COLUMN HAS ROOM FOR. The sheet is 316 tall and nothing in it scrolls, so the
   readings and the compounds share one budget of rows and what does not fit becomes a count in the
   kicker ("4 OF 12+") rather than a scrollbar. Readings go first because they are the character's
   own; compounds fill whatever is left, common ones first.
   ================================================================================================== */
export interface SheetReading {
  kind: 'ON' | 'KUN'
  /** null is the absence row -- the dictionary answered and had nothing for this kind */
  reading: KanjiReading | null
}

export interface KanjiSheetRows {
  readings: SheetReading[]
  onCount: number
  kunCount: number
  /** readings the budget left out */
  readingsHidden: number
  compounds: KanjiCompound[]
  compoundTotal: number
  hasMoreCompounds: boolean
}

export function kanjiSheetRows(detail: KanjiDetailPayload): KanjiSheetRows {
  const on = detail.on_readings.map((reading): SheetReading => ({ kind: 'ON', reading }))
  const kun = detail.kun_readings.map((reading): SheetReading => ({ kind: 'KUN', reading }))
  /* one row of each kind before a second of either -- an absent kind gets its absence row -- so a
     character with five on-readings still says whether it has a kun-reading at all */
  const firstOn = on[0] ?? { kind: 'ON', reading: null }
  const firstKun = kun[0] ?? { kind: 'KUN', reading: null }
  const extra = [...on.slice(1), ...kun.slice(1)].slice(0, Math.max(0, KANJI_SHEET_READING_ROWS - 2))
  const readings = [firstOn, ...extra.filter((row) => row.kind === 'ON'), firstKun,
    ...extra.filter((row) => row.kind === 'KUN')]
  const shownReadings = readings.filter((row) => row.reading).length
  const all = [...on, ...kun]
  const compoundRoom = Math.max(0, KANJI_SHEET_ROWS - readings.length)
  const common = detail.compounds.filter((c) => c.is_common)
  const rare = detail.compounds.filter((c) => !c.is_common)
  return {
    readings,
    onCount: on.length,
    kunCount: kun.length,
    readingsHidden: all.length - shownReadings,
    compounds: [...common, ...rare].slice(0, compoundRoom),
    compoundTotal: detail.compounds.length,
    hasMoreCompounds: detail.has_more_compounds,
  }
}

/** what the deck-only sheet is missing, in the order the middle column draws the absences */
export function missingFromDeck(detail: KanjiDetailPayload): string[] {
  const missing: string[] = []
  if (detail.on_readings.length + detail.kun_readings.length === 0) missing.push('READINGS')
  if (detail.meanings.length === 0) missing.push('MEANINGS')
  if (detail.compounds.length === 0) missing.push('COMPOUNDS')
  if (detail.stroke_count == null) missing.push('STROKE COUNT')
  return missing
}

/** the parts the character is built from: the committed components, or the dictionary's radicals */
export function kanjiParts(detail: KanjiDetailPayload): string[] {
  if (detail.components.length > 0) return detail.components
  return detail.radicals.map((radical) => radical.radical)
}

// Promoted to src/lib/focusTrap.ts so the shared Tutor popup shell can reuse
// the same focus-trap implementation. Re-exported here so existing imports
// in this feature (KanjiDetailPanel, KanjiStrokeAnimation) keep working.
export { getFocusableElements, trapFocus, isReducedMotionPreferred } from '../../lib/focusTrap'
