import type { BlockInfo } from '../../types'

/* ==================================================================================================
   THE DECK SCREEN — a milestone's level three, for the decks that are still cut into blocks.

   THE CHAIN IS STRICT, SO EXACTLY ONE BLOCK IS OPEN. `compute_unlocked_count` walks the blocks in
   order and stops at the first one whose mastery is under the gate, so `unlocked` is a prefix and
   never a scatter. That single fact is the whole drawing: a screen offering forty-four equal
   choices would be describing a decision the deck does not offer.

   THREE POPULATIONS, THREE TREATMENTS. Everything before the frontier is CLEARED and revisitable,
   the frontier itself is OPEN and the only thing that moves the deck on, and everything after it is
   AHEAD and not choosable at all. One proportional rail underneath carries all of them at once, and
   fits six blocks or forty-four by construction rather than by a breakpoint.

   THE GATE IS WHAT THE PERCENTAGE IS FOR. 62% is not a score, it is a key that turns at 70 — and
   until now the renderer could not say so, because the threshold lived only in Python. It is
   reported by `block-progress` for this screen; `DEFAULT_GATE` is the fallback for an older build
   answering without the field, not a second copy of the rule.
   ================================================================================================== */

/** what an older build (or an empty answer) is read as, so a missing field never prints NaN% */
export const DEFAULT_GATE = 0.7

export type DeckBlockState = 'done' | 'here' | 'ahead'

export interface DeckBlock {
  index: number
  /** "01".."44" */
  no: string
  name: string
  cards: number
  /** 0..100, the backend's own per-block mastery */
  pct: number
  state: DeckBlockState
  /** the first few characters of the block, which is what a name alone does not show */
  sample: string[]
}

export interface DeckChain {
  blocks: DeckBlock[]
  /** index of the one open block; -1 when the deck has none */
  here: number
  /** how many are behind it — the count on the BEHIND YOU card */
  cleared: number
  /* HOW MANY ARE SHUT BEYOND THE ONE THE AHEAD CARD NAMES — not how many are shut in total.
     The card names the next block and this is the tail after it, so "LOCKED BEHIND IT" was a
     caption that could be read either way. It is `beyond` and the card says MORE AFTER IT. */
  beyond: number
  /** cards across the whole deck, counted rather than stated */
  cards: number
  /** 0..100 of the deck's blocks that are behind you */
  clearedPct: number
  /** the gate, 0..1, as the backend applied it */
  gate: number
}

export function deckChain(blocks: readonly BlockInfo[], gate: number = DEFAULT_GATE): DeckChain {
  /* THE FRONTIER IS THE LAST UNLOCKED BLOCK, not a count of mastered ones. `unlocked` is a prefix
     by construction, so the last true entry is the one the learner is standing on and everything
     before it has already paid the gate. Reading it as "how many are mastered" would put the
     cursor a block early the moment a cleared block's mastery decayed. */
  let here = -1
  blocks.forEach((block, index) => { if (block.unlocked) here = index })

  const cards = blocks.reduce((total, block) => total + block.card_ids.length, 0)
  const cleared = Math.max(0, here)

  return {
    blocks: blocks.map((block, index) => ({
      index,
      no: String(index + 1).padStart(2, '0'),
      name: block.name,
      cards: block.card_ids.length,
      pct: Math.round(block.mastery * 100),
      state: index < here ? 'done' : index === here ? 'here' : 'ahead',
      sample: block.sample_chars.slice(0, 3),
    })),
    here,
    cleared,
    beyond: Math.max(0, blocks.length - here - 2),
    cards,
    clearedPct: blocks.length ? Math.round((cleared / blocks.length) * 100) : 0,
    gate,
  }
}

/* THE CLEARED BLOCKS ARE PAGED, AND THAT IS WHAT MAKES ANY ONE OF THEM REACHABLE. Twenty-four to a
   page means even a forty-four-block deck is two pages and a grid move, rather than a walk down the
   whole chain — and paging rather than scrolling because nothing in this menu scrolls. */
export const DECK_PER_PAGE = 24

export interface DeckSheet {
  /** the block indices on this page */
  cells: number[]
  page: number
  pages: number
}

export function deckSheet(cleared: number, page: number): DeckSheet {
  const pages = Math.max(1, Math.ceil(cleared / DECK_PER_PAGE))
  const at = Math.max(0, Math.min(page, pages - 1))
  const from = at * DECK_PER_PAGE
  const to = Math.min(cleared, from + DECK_PER_PAGE)
  const cells: number[] = []
  for (let i = from; i < to; i++) cells.push(i)
  return { cells, page: at, pages }
}

/* WHAT THE OPEN BLOCK IS WORTH, in one line. The gate is stated as the thing it unlocks rather than
   as a target to hit, because "70%" on its own is the same unexplained figure the ascent's rungs
   had before they said what they were short of. */
export function gateLine(chain: DeckChain, revisiting: boolean): string {
  if (revisiting) return 'ALREADY CLEARED · NOTHING AHEAD MOVES'
  if (chain.here < 0) return 'THIS DECK HAS NO BLOCKS'
  const gate = Math.round(chain.gate * 100)
  if (chain.here >= chain.blocks.length - 1) {
    return `THE LAST BLOCK · NOTHING IS LOCKED BEHIND IT`
  }
  return `OPENS BLOCK ${chain.blocks[chain.here + 1].no} AT ${gate}%`
}

/** the rail's middle caption: the deck's own totals, all counted */
export function railLine(chain: DeckChain): string {
  return `${chain.blocks.length} BLOCKS · ${chain.cards.toLocaleString()} CARDS · `
    + `${chain.clearedPct}% CLEARED`
}
