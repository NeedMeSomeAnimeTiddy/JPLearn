import { formatTagLabel } from '../../utils'

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

// Promoted to src/lib/focusTrap.ts so the shared Tutor popup shell can reuse
// the same focus-trap implementation. Re-exported here so existing imports
// in this feature (KanjiDetailPanel, KanjiStrokeAnimation) keep working.
export { getFocusableElements, trapFocus, isReducedMotionPreferred } from '../../lib/focusTrap'
