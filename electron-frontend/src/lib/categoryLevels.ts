import type { JlptLevel } from '../types'

export const CATEGORY_LEVEL_ORDER: JlptLevel[] = ['n5', 'n4', 'n3', 'n2', 'n1']

const LEVEL_PREFIX = /^n([1-5])_/

/**
 * Return the JLPT level a category key belongs to.
 *
 * The level is read from the key's prefix rather than a parallel lookup map:
 * `VOCAB_CATEGORY_ORDER` is already the source of truth for which categories
 * exist, and a second map would be one more list to keep in sync. Kanji has no
 * categories: its themes are block definitions and carry no level prefix. N5 categories predate the prefix convention and are unprefixed
 * (`greetings`, `numbers_time`), so an unprefixed key is N5.
 */
export function categoryLevelOf(key: string): JlptLevel {
  const match = LEVEL_PREFIX.exec(key)
  return match ? (`n${match[1]}` as JlptLevel) : 'n5'
}

/**
 * Drop a redundant `N4 · ` prefix from a category label.
 *
 * Labels carry their level so they read correctly wherever they appear alone
 * (the overview dialog, tag labels). In the hub strip the level is already
 * chosen by the tab above, so repeating it on all four chips is noise.
 */
export function categoryShortLabel(label: string): string {
  return label.replace(/^N[1-5]\s*·\s*/, '')
}

export interface LevelledRow {
  key: string
}

/** Levels that actually have categories, in N5→N1 order. */
export function levelsPresentIn(rows: readonly LevelledRow[]): JlptLevel[] {
  const present = new Set(rows.map((row) => categoryLevelOf(row.key)))
  return CATEGORY_LEVEL_ORDER.filter((level) => present.has(level))
}

/** The subset of `rows` belonging to `level`, preserving their original order. */
export function rowsForLevel<T extends LevelledRow>(rows: readonly T[], level: JlptLevel): T[] {
  return rows.filter((row) => categoryLevelOf(row.key) === level)
}

/**
 * Pick which level tab to show.
 *
 * Prefers the level the user selected, but falls back to the first level that
 * has categories so the strip is never blank — which is what would happen if
 * a track had no categories at the remembered level.
 */
export function resolveVisibleLevel(rows: readonly LevelledRow[], preferred: JlptLevel): JlptLevel {
  const present = levelsPresentIn(rows)
  if (present.length === 0) return preferred
  return present.includes(preferred) ? preferred : present[0]
}
