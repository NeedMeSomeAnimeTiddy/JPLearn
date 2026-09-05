import type { ReactNode } from 'react'
import { Brand, ScreenHead, screenClass, useEntered, useFrameFit } from '../../menu'
import type { ScreenHeadSpec } from '../../menu'
import { tickRow } from '../utils'
import '../../../styles/stage.css'
import '../../menu/menu.css'
import '../round.css'

/* ==================================================================================================
   THE ROUND'S SHELL — see `round.css` for the argument. This file is only the arrangement.

   PROPS AND NOTHING ELSE. `MinigameView` owns the session, sixteen modes and a dozen effects; this
   owns where things go. The split is what makes the screen testable without a `SessionProvider` and
   what stops the layout from being re-derived inside a ternary the next time a mode is added.
   ================================================================================================== */

export interface RunChip {
  key: string
  /** the figure — the one thing on the chip set in the display face */
  value: string
  /** what it is a figure OF */
  label: string
  /** the quiet half of a fraction, printed before the label */
  of?: string
  /** the one chip allowed to be loud, and only when it is about to matter */
  duty?: boolean
}

export interface RoundHint {
  cap: string
  en: string
  jp: string
}

export interface SlabSpec {
  text: string
  jp?: string
  tone?: 'duty' | 'calm'
  onClick?: () => void
  disabled?: boolean
  /** the name a screen reader gets, when the slab's own words are not it */
  label?: string
}

export interface RoundProps {
  head: ScreenHeadSpec | null
  /** the caption chip under the heading — which deck, which block */
  cap: string
  run: RunChip[]
  /** the prompt cell */
  ask: ReactNode
  /** the work cell */
  work: ReactNode
  /** true once the answer is on the screen, which quiets the prompt's kicker */
  said?: boolean
  foot: { at: number; target: number; trail: readonly boolean[]; note?: string }
  onBack: () => void
  backLabel?: string
  backJp?: string
  /* WHAT LEAVING IS CALLED TO A SCREEN READER, which is not always "leave this round" — the same
     shell carries an exam paper, and abandoning one of those is not abandoning a round. The two
     words on the tab are `backLabel`/`backJp`; this is the whole sentence they stand for. */
  backAria?: string
  /** throw this run away and deal a new one; omitted where there is nothing to throw away */
  onRestart?: () => void
  hints: RoundHint[]
}

export function Round({
  head, cap, run, ask, work, said = false, foot, onBack, backLabel = 'Leave', backJp = '中断',
  backAria = 'Leave this round', onRestart, hints,
}: RoundProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const { ticks, folded } = tickRow(foot.trail, foot.target, foot.at)
  const left = Math.max(0, foot.target - foot.at)

  return (
    <div className={screenClass(entered, 'rd-round')}>
      {/* PINNED TO THE WINDOW, NOT THE BOARD -- the same structural guarantee `.brand` and `.stats`
          get in `menu.css`, and the reason a chip can never paint over the sheet. */}
      <Brand />
      <div className="rd-run">
        {run.map((chip) => (
          <span key={chip.key} className={chip.duty ? 'stat-chip duty' : 'stat-chip'}>
            <b>{chip.value}</b>
            {chip.of ? <s>{chip.of}</s> : null}
            {' '}{chip.label}
          </span>
        ))}
      </div>

      <div className="mn-frame" ref={frameRef}>
        {/* THE CAPTION RIDES THE HEADING SLAB rather than standing beside it. `.pj-note` is the
            slot every other screen already uses for the live line it wants to say about itself, so
            "HIRAGANA N5 · DIGRAPHS" lands in the same place a deck's block count does. A second
            chip under the slab would be a second object saying a smaller version of the same
            thing. */}
        <ScreenHead head={head} note={cap} />

        <div className={said ? 'rd-sheet said' : 'rd-sheet'}>
          {ask}
          {work}
        </div>

        <div className="rd-foot">
          <b>{foot.note ?? `ROUND ${String(Math.min(foot.at + 1, foot.target)).padStart(2, '0')}`}</b>
          {folded ? (
            <span className="rd-fold">{foot.at} OF {foot.target} ANSWERED</span>
          ) : (
            <span className="rd-ticks" role="img" aria-label={`${foot.at} of ${foot.target} answered`}>
              {ticks.map((t, i) => <i key={i} className={t === 'todo' ? undefined : t} />)}
            </span>
          )}
          <s>{left} LEFT</s>
        </div>

        {/* TWO TABS, NOT ONE. Leaving and starting over are the two things you can do to a run from
            outside it, and the old HUD kept both -- a restart button that threw the run away with
            one press and no confirmation, and a back arrow. They belong together in the corner the
            menu already puts its way out in, and the mark that says which is which is the word. */}
        <div className="back-tab">
          <button type="button" onClick={onBack} aria-label={backAria}>
            <span className="bt-en">{backLabel}</span><span className="bt-jp">{backJp}</span>
          </button>
          {onRestart ? (
            <button type="button" onClick={onRestart} aria-label="Restart challenge">
              <span className="bt-en">Start over</span><span className="bt-jp">やり直し</span>
            </button>
          ) : null}
        </div>
        <div className="hints">
          {hints.map((h) => (
            <span key={h.cap}><b>{h.cap}</b>{h.en}<em>{h.jp}</em></span>
          ))}
        </div>
      </div>
    </div>
  )
}
