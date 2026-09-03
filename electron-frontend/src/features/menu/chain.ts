/* ==================================================================================================
   THE CHAIN — one drawing, two screens, and the design system says so in as many words.

   `components/screens.html` files the course and a deck's blocks under the same name and the same
   classes: "Behind you / here / ahead, and a proportional rail of the whole run beneath. Only the
   OPEN item acts; everything else is context. Classes are `.dk-*`, SHARED WITH THE DECK SCREEN
   THROUGH `chainMarkup`." The mockup has one function drawing both; the port had one of them.

   WHAT A CHAIN IS. An ordered run of things where exactly one is open, everything before it is done
   and revisitable, and everything after it is shut. That is true of a deck's blocks because
   `compute_unlocked_count` stops at the first block under the gate, and it is true of the sixteen
   curriculum steps for the same kind of reason. Three objects whatever the count -- how many are
   behind you, the one that is open, the one ahead -- and a rail whose segments divide its width, so
   six of them and seventy-six both fit by construction rather than by a breakpoint.

   THE VIEW IS FILLED, NOT DERIVED. Everything here is words and numbers the caller has already
   worked out, because the two screens say genuinely different things with the same shapes: a block
   is STARTED and a step is OPENED, a deck's tail is "AND MORE AFTER IT" and the course's is "LOCKED
   BEHIND IT". Deriving those from a `kind: 'deck' | 'path'` flag would put both screens' copy in
   one file and a conditional at every line of it.
   ================================================================================================== */

export type ChainState = 'done' | 'here' | 'ahead'

export interface ChainItem {
  /** stable across re-renders — a block index or a node id */
  key: string
  /** "01".."16" */
  no: string
  name: string
  /** the second line in the pile, and the tail of the rail segment's title */
  note: string
  state: ChainState
}

export interface ChainHero {
  /** the dark cap: where you are, and what you are looking at */
  cap: string
  capRight: string
  name: string
  /* A CJK NAME IS SET IN THE JAPANESE FACE AND IS ONE EM PER GLYPH. The Latin italic black averages
     0.62 em; mincho is 1.06. One divisor for both is how 漢字 came out at the size of "Sentence
     Examples". */
  nameWide: boolean
  /** the small line under the name — a block's first characters. Absent on the course. */
  under: string | null
  subLeft: string
  subRight: string
  /** 0..100 */
  pct: number
  /** what the percentage is FOR: the gate stated as the thing it opens */
  gate: string
  /** the gate's own emphasis, drawn in vermilion — the figure inside the sentence */
  gateEm: string | null
  slabEm: string
  slabB: string
  /** false when pressing it would do nothing, so the slab can say so instead of lying */
  live: boolean
}

export interface ChainView {
  items: ChainItem[]
  /** index of the open one; -1 when the run has none */
  here: number
  /* THE FURTHEST ITEM THE RAIL MAY REACH, which is not always the open one. A deck's blocks are a
     strict line, so there it IS the open one. The curriculum forks once -- Grammar N5 opens both
     Sentence Examples and Scripted Conversation -- so two steps are open at that point, and
     clamping at the first would draw the second as NOT YET CHOOSABLE while it sits there
     choosable. Everything up to and including this index can be reached; nothing past it can. */
  reach: number
  /** how many are behind it */
  cleared: number
  /** how many are shut BEYOND the one the AHEAD card names */
  beyond: number
  /** "BLOCKS CLEARED" / "STEPS DONE" */
  behindLabel: string
  hero: ChainHero
  ahead: {
    kicker: string
    name: string
    meta: string
    /** "AND MORE AFTER IT" / "LOCKED BEHIND IT" */
    tailLabel: string
  }
  rail: { left: string; mid: string; right: string }
  /** what the pile of cleared ones is called, in its cap and in its own words */
  pile: { cap: string; act: string; empty: string }
}

/* THE NAME IS SET FROM ITS OWN LENGTH, and 470 is the card's own width. The mockup carries the same
   line with a comment saying what happens when it is not: left at a fixed size the long names run
   off the right edge and the short ones sit in a hand's width of empty paper. */
export function chainNameSize(name: string, wide: boolean, max = 46): number {
  const n = Math.max(1, [...name].length)
  return Math.max(26, Math.min(max, Math.floor(470 / (n * (wide ? 1.06 : 0.62)))))
}

/** a rail segment's own sentence, which is the only place an ahead item is named at all */
export function chainSegTitle(item: ChainItem): string {
  const state = item.state === 'ahead' ? 'locked' : item.state === 'here' ? 'open now' : 'done'
  return `${item.no} ${item.name}${item.note ? ` — ${item.note}` : ''} — ${state}`
}

/* THE PILE IS PAGED, AND THAT IS WHAT MAKES ANY ONE OF THEM REACHABLE. Twenty-four to a page means
   even a seventy-six-block deck is two pages and a grid move, rather than a walk down the whole
   chain — and paging rather than scrolling because nothing in this menu scrolls. */
export const CHAIN_PER_PAGE = 24

export interface ChainPage {
  /** the indices on this page */
  cells: number[]
  page: number
  pages: number
}

export function chainPage(cleared: number, page: number): ChainPage {
  const pages = Math.max(1, Math.ceil(cleared / CHAIN_PER_PAGE))
  const at = Math.max(0, Math.min(page, pages - 1))
  const from = at * CHAIN_PER_PAGE
  const to = Math.min(cleared, from + CHAIN_PER_PAGE)
  const cells: number[] = []
  for (let i = from; i < to; i++) cells.push(i)
  return { cells, page: at, pages }
}
