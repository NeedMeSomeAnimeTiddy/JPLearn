import type { ReactNode } from 'react'
import { Round } from '../../round'
import type { RoundHint, RunChip } from '../../round'
import { PUZZLE_COPY, PUZZLE_LIST_ROWS } from '../constants'
import type { PuzzleShell } from '../types'
import { fillCopy } from '../utils'

/* ==================================================================================================
   A DAILY PUZZLE ON THE SHEET -- `past-three.html` plate THREE.

   THE BOARD IS THE PROMPT CELL AND THE LIST IS THE WORK CELL, which is the plate's whole argument: a
   puzzle and a flashcard are the same object with different things in the left half. Each puzzle
   renders its own one of these because each owns the state behind both halves; this is only where
   the session's half (heading, caption, the way out, the ending) meets the puzzle's.

   THE ENDING IS THE ROUND'S ANSWERED STATE, NOT A MODAL OVER IT. The finished board stays where it
   was in the prompt cell, the score moves into the run chips and the work cell becomes the result.
   ================================================================================================== */

interface PuzzleRoundProps {
  shell: PuzzleShell
  run: RunChip[]
  foot: { at: number; target: number; trail: readonly boolean[] }
  hints: RoundHint[]
  ask: ReactNode
  work: ReactNode
}

export function PuzzleRound({ shell, run, foot, hints, ask, work }: PuzzleRoundProps) {
  const own = new Set(hints.map((hint) => hint.cap))
  return (
    <Round
      head={shell.head}
      cap={shell.cap}
      run={shell.ending?.run ?? run}
      said={shell.ending !== null}
      foot={{ ...foot, note: fillCopy(PUZZLE_COPY.words, { count: foot.target }) }}
      onBack={shell.onBack}
      backLabel={PUZZLE_COPY.backLabel}
      backJp={PUZZLE_COPY.backJp}
      backAria={shell.backAria}
      hints={[...hints, ...shell.hints.filter((hint) => !own.has(hint.cap))]}
      ask={ask}
      work={shell.ending?.work ?? work}
    />
  )
}

/* THE WORK CELL'S LIST, AND WHAT HAPPENS WHEN IT IS LONGER THAN THE CELL. Nothing scrolls: past
   `PUZZLE_LIST_ROWS` the rest becomes one line saying how many, on the edge they left over. */
export function PuzzleRows<T>({ items, label, render, limit = PUZZLE_LIST_ROWS }: {
  items: readonly T[]
  label: string
  render: (item: T, index: number) => ReactNode
  limit?: number
}) {
  const shown = items.slice(0, limit)
  const rest = items.length - shown.length
  return (
    <div className="dp-rows">
      <ul className="dp-list" aria-label={label}>
        {shown.map((item, index) => render(item, index))}
      </ul>
      {rest > 0 ? <p className="dp-fold">{fillCopy(PUZZLE_COPY.more, { count: rest })}</p> : null}
    </div>
  )
}
