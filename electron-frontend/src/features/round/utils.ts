import type { PlayableMinigame } from '../../types'
import { PANEL_MODES, ROUND_COPY, TICK_CAP, TYPED_MODES, type RoundCopy } from './constants'

/* ==================================================================================================
   THE FOUR THINGS THE ROUND HAS TO WORK OUT BEFORE IT CAN DRAW ITSELF.

   All four were arithmetic buried in JSX, and the one that was missing entirely is the first.
   ================================================================================================== */

export type RoundKind = 'choice' | 'typed' | 'panel'

/** which fill the work cell takes — see the two lists in `constants.ts` for why the default is slips */
export function roundKind(mode: PlayableMinigame): RoundKind {
  if (PANEL_MODES.includes(mode)) return 'panel'
  if (TYPED_MODES.includes(mode)) return 'typed'
  return 'choice'
}

export function roundCopy(mode: PlayableMinigame): RoundCopy {
  return ROUND_COPY[mode] ?? ROUND_COPY.meaning_match
}

/* ==================================================================================================
   THE PROMPT'S SIZE, SOLVED RATHER THAN SET — the same lesson the deck screen's block headline
   taught, one screen along.

   The prompt cell holds a single kana, a four-kanji compound, a word, or a whole sentence with a
   hole in it, and there is no one size that is right for two of those. The old screen had one: the
   character rendered at a fixed display size and a sentence wrapped out of the panel it was in.

   TWO REGIMES, AND THE JOIN IS DELIBERATE. Up to six glyphs the prompt is a SPECIMEN and fills the
   cell's width — a lone kanji is as big as it can be, and it shrinks as more arrive. Past six it is
   a SENTENCE and stops shrinking with each character: it wraps, and the size comes off the area it
   has to fill rather than the width. They are clamped to meet at 45px so a seventh character cannot
   make the type grow.
   ================================================================================================== */

/** the prompt cell's inner width and the height a wrapped prompt may use, in board pixels */
export const ASK_W = 272
export const ASK_H = 300

export function promptSize(text: string): number {
  const n = Math.max(1, [...text].length)
  if (n <= 6) return Math.min(132, Math.floor(ASK_W / n))
  /* 1.5 is a glyph's box with its line-height in it — the constant that turns an area into a size */
  return Math.max(20, Math.min(45, Math.floor(Math.sqrt((ASK_W * ASK_H) / (1.5 * n)))))
}

/* ==================================================================================================
   THE FOOT BAND'S TICKS, WHICH ARE THE WHOLE ROUND.

   The frame contract gives the foot band to a whole-set summary, one object, thin, spanning the
   stage — and this is the round's. What the old screen said as `0/20` in a row of four look-alike
   counters is twenty marks: gold answered, vermilion missed, cream where you are.

   IT FOLDS RATHER THAN SHRINKING. A hundred-card run would draw hundred ticks two pixels wide,
   which is a texture rather than a count. Past `TICK_CAP` the strip stops being drawn and the band
   says the figure instead — the same law every list in this menu obeys.
   ================================================================================================== */

export type Tick = 'on' | 'bad' | 'here' | 'todo'

export interface TickRow {
  ticks: Tick[]
  /** true when the set is too long to draw and the band should print the figure instead */
  folded: boolean
}

export function tickRow(trail: readonly boolean[], target: number, at: number): TickRow {
  const total = Math.max(0, target)
  if (total === 0 || total > TICK_CAP) return { ticks: [], folded: total > TICK_CAP }
  const ticks: Tick[] = []
  for (let i = 0; i < total; i++) {
    if (i < trail.length) ticks.push(trail[i] ? 'on' : 'bad')
    else if (i === at) ticks.push('here')
    else ticks.push('todo')
  }
  return { ticks, folded: false }
}

/* ==================================================================================================
   AND THE TRAIL ITSELF, which nothing in the session was keeping.

   `useSession` counts how many rounds have gone and how many were right; it does not remember WHICH.
   The tick strip needs the order, and the order is derivable: every time the round count goes up,
   the score either went up with it or it did not. So this is a reducer over two numbers rather than
   a new field in the session — the session's own state stays the source of truth and this is a
   reading of it.

   A COUNT THAT WENT DOWN IS A NEW RUN. Starting a session resets both to zero, and a trail that
   survived that would put the last run's misses under this one's first card.
   ================================================================================================== */

export interface TrailState {
  trail: boolean[]
  rounds: number
  score: number
}

export const EMPTY_TRAIL: TrailState = { trail: [], rounds: 0, score: 0 }

export function stepTrail(state: TrailState, rounds: number, score: number): TrailState {
  if (rounds < state.rounds || score < state.score) {
    /* a new run — and a fresh one is not always all-zero, since a retry starts with a target of its
       own; whatever it starts at is the new floor */
    return { trail: [], rounds, score }
  }
  if (rounds === state.rounds) return state
  const trail = state.trail.slice()
  const gained = score - state.score
  const played = rounds - state.rounds
  /* every round that went by is a mark; the ones that scored are the right ones. More than one round
     at a time only happens when a render was missed, and then the misses land first — which is the
     conservative way round, since a strip that claims a correct answer nobody gave is a lie. */
  for (let i = 0; i < played; i++) trail.push(i >= played - gained)
  return { trail, rounds, score }
}
