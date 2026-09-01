import { sortByDifficulty, type Passage } from '../passages'

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

   FORTY WORDS A MINUTE, which is a beginner reading aloud and is what these are for. It is the one
   number on this screen that is an assumption rather than a measurement, so it is named here rather
   than buried in an expression.
   ================================================================================================== */
export const READING_PACE = 40

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
