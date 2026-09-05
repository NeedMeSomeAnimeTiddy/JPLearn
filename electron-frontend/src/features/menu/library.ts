import { READING_PACE, sortByDifficulty, type Passage } from '../passages'

/* ==================================================================================================
   THE LIBRARY — THE WORLD's level three, through the READ lane.

   THE SAME LIST THE DOOR OPENS ONTO. `sortByDifficulty` is the passage hub's own comparator, so
   these thirty are in the order the hub puts them and the lane's three are the first three of this
   screen. A screen that re-sorted would make the two disagree about which text is easiest.

   THERE IS NO PROGRESS COLUMN, and the mockup had one. `usePassages` keeps its progress map in
   component state and nothing persists it, so between visits the app knows nothing about what you
   have read — the mockup drew a "HOW FAR YOU GOT" track per row because its library remembered.
   Drawing an empty track thirty times over would be thirty claims that you have read none of them,
   which is a different statement from the app not keeping the answer. The caption says which it is,
   once.

   FORTY WORDS A MINUTE, which is a beginner reading aloud and is what these are for. It moved to
   `passages/constants` when the reader needed it too -- a shelf and a reader disagreeing about how
   long the same text takes would be two answers to one question -- and is re-exported here because
   this is where the menu reads it from.
   ================================================================================================== */
export { READING_PACE }

export interface LibraryRow {
  id: string
  /** the text's own title, in its own script */
  title: string
  /** the author, which is the only gloss these carry — see the note in `worldLanes` */
  author: string
  words: number
  minutes: number
  /** the grade the data reports, which for all thirty is the same one */
  grade: string
}

export function libraryRows(passages: readonly Passage[] | null): LibraryRow[] {
  if (!passages) return []
  return sortByDifficulty([...passages]).map((p) => ({
    id: p.id,
    title: p.title,
    author: p.author,
    words: p.word_count,
    minutes: Math.max(1, Math.round(p.word_count / READING_PACE)),
    grade: p.difficulty_label,
  }))
}

/* THE OVERFLOW RULE, WHICH IS THIS MENU'S AND NOT THIS SCREEN'S: nothing scrolls, a window moves,
   and the ends state how many are folded away. Six rows on the stage whatever the list is thirty
   long; the window centres the cursor where it can and clamps at both ends, so the first and last
   texts are reachable without the list pretending to continue past them. */
export const LIBRARY_WINDOW = 6
const LEAD = 2

export interface LibraryView {
  rows: LibraryRow[]
  /** how many are folded away above and below */
  above: number
  below: number
  cursorInWindow: number
}

export function libraryWindow(rows: readonly LibraryRow[], cursor: number): LibraryView {
  if (rows.length <= LIBRARY_WINDOW) {
    return { rows: [...rows], above: 0, below: 0, cursorInWindow: cursor }
  }
  const lo = Math.max(0, Math.min(cursor - LEAD, rows.length - LIBRARY_WINDOW))
  const hi = Math.min(rows.length, lo + LIBRARY_WINDOW)
  return { rows: rows.slice(lo, hi), above: lo, below: rows.length - hi, cursorInWindow: cursor - lo }
}

/** what the caption says about the whole shelf, counted rather than stated */
export function libraryNote(rows: readonly LibraryRow[]): string {
  if (!rows.length) return 'NOT COUNTED YET'
  const grades = new Set(rows.map((r) => r.grade))
  const minutes = rows.reduce((a, r) => a + r.minutes, 0)
  const band = grades.size === 1 ? `ALL ${[...grades][0].toUpperCase()}` : `${grades.size} GRADES`
  return `${rows.length} TEXTS · ${band} · ${Math.round(minutes / 60)} HOURS OF READING ALOUD`
}

/* ==================================================================================================
   THE SHELF'S GEOMETRY, which is the mockup's and is arithmetic rather than markup.

   The selected row is a different height from the rest, so every row's top is the sum of what is
   above it inside the window -- the same solve the road and level one use. Distance from the
   selection is painted as a VEIL rather than as opacity: the row keeps its paper and takes dusk
   over it, so the furthest book in the window is about a third of the way into the evening while
   the one you are on is bare white.
   ================================================================================================== */
export const LB = {
  SEL_H: 100,
  ROW_H: 38,
  GAP: 6,
  HEAD: 26,
} as const

/* HOW FAR INTO THE DUSK A ROW SITS, by how far it is from the one you are on.

   THE RAMP USED TO END AT 0.45 AND THAT WAS TOO FAR. Standing on the first text -- which is where
   this screen opens -- put every other row on the shelf at 0.26 or deeper, so five of the six were
   a flat blue-grey and the shelf read as five disabled rows rather than five you have not walked
   to yet. Depth is the job; disabling them is not. */
export const LB_VEIL = [0, 0.07, 0.13, 0.18, 0.22, 0.25] as const
export const libVeil = (d: number): number => LB_VEIL[Math.min(d, LB_VEIL.length - 1)]

export interface ShelfRow { top: number; height: number }

/** every visible row's place down the shelf, given which one is selected within the window */
export function shelfLayout(count: number, cursorInWindow: number): ShelfRow[] {
  const out: ShelfRow[] = []
  let y = LB.HEAD + 12
  for (let i = 0; i < count; i++) {
    const height = i === cursorInWindow ? LB.SEL_H : LB.ROW_H
    out.push({ top: y, height })
    y += height + LB.GAP
  }
  return out
}

/* ==================================================================================================
   THE BANDS ARE READ, NOT COUNTED OUT.

   The mockup split its thirty into four bands of [8, 8, 7, 7] because it authored the shelf and
   knew where the boundaries were. This shelf is whatever `getPassages` returns, and each row already
   carries the grade the data reports -- so a band is simply a RUN OF ROWS SHARING A GRADE. On this
   account all thirty report the same one, which gives one band covering the shelf, and that is the
   honest drawing: four bands over a shelf with one grade in it would be a structure invented for
   the picture.
   ================================================================================================== */
export const BAND_KANJI = ['一', '二', '三', '四', '五', '六'] as const

export interface LibraryBand {
  from: number
  /** inclusive */
  to: number
  name: string
  kanji: string
}

export function libraryBands(rows: readonly LibraryRow[]): LibraryBand[] {
  const out: LibraryBand[] = []
  for (let i = 0; i < rows.length; i++) {
    const grade = rows[i].grade
    const last = out[out.length - 1]
    if (last && rows[last.from].grade === grade) { last.to = i; continue }
    out.push({
      from: i, to: i,
      name: (grade || 'UNGRADED').toUpperCase(),
      kanji: BAND_KANJI[out.length] ?? '·',
    })
  }
  return out
}

/** which band a row is in, or -1 */
export const bandOf = (bands: readonly LibraryBand[], i: number): number =>
  bands.findIndex((b) => i >= b.from && i <= b.to)
