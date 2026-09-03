import { useEffect, useRef, useState } from 'react'
import {
  ASCENT_BOT, ASCENT_H, ASCENT_TOP, JLPT_READY_PCT, JLPT_UNLOCK_PCT,
  pctY, stateWord, type Rung,
} from '../ascent'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { refuse } from '../refuse'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface AscentProps {
  rungs: readonly Rung[]
  /** true until the readiness call has answered */
  loading: boolean
  onOpen: (level: string) => void
  onUp: () => void
}

/* THE LADDER. Five columns, two rules across all of them, and one cursor.

   THE RULES ARE EMITTED AFTER THE COLUMNS and lifted above them. Drawn behind, a threshold shows
   only in the gaps — which throws away the entire reason this shape was chosen over five separate
   cards: you can follow one line across all five levels at once. */
export function Ascent({ rungs, loading, onOpen, onUp }: AscentProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)


  /* on arrival, once — the readiness figures land after the screen is up, and a focus call that
     re-ran with them would take focus back off whatever the reader had reached for */
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); setAt((i) => Math.min(i + 1, rungs.length - 1)) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
      else if (event.key === 'Enter') {
        event.preventDefault()
        const rung = rungs[at]
        if (!rung) return
        /* AND A LOCKED RUNG SAYS SO. This did nothing at all -- see `refuse.ts`; the column
           already carries the percentage it is waiting for. */
        if (rung.state === 'locked') { refuse(); return }
        onOpen(rung.level)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, rungs, onOpen])

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead
          head={screenHead('JLPT', null)}
          note={loading ? 'READING YOUR MASTERY' : `${rungs.length} LEVELS`}
        />

        {/* `.as-wrap`, NOT `.ascent`. Both are in the mockup and only one of them is this screen's:
            `.ascent` is a flow-positioned box sized `calc(100vw / var(--u))`, which measures the
            WINDOW -- correct where it sat, wrong inside a centred 1280x720 board, where it would
            run off whichever edge the letterboxing put it nearest. `.as-wrap` is the absolute
            inset-0 container the mockup's own ascent markup emits. */}
        {/* THE LADDER. Every level is ONE box carrying its own fill, figure, name, count and
            state — see the note above `.as-col`. Nothing hangs off a column any more, so nothing
            can drift out of line with it. */}
        <div className="as-wrap">
          <span className="as-tick" style={{ top: ASCENT_TOP }}>100</span>
          <span className="as-tick" style={{ top: ASCENT_BOT }}>0</span>

          {rungs.map((rung, index) => {
            const fill = Math.round((ASCENT_H * rung.pct) / 100)
            /* the figure rides ON the fill when there is room for it, and stands on the track
               above it when there is not — cream there, ink on the gold */
            const inFill = fill > (rung.isTarget ? 150 : 74)
            const classes = ['as-col']
            if (rung.state === 'locked') classes.push('locked')
            if (rung.isTarget) classes.push('here')
            if (index === at) classes.push('sel')
            return (
              <button
                key={rung.level}
                type="button"
                className={classes.join(' ')}
                style={{ left: rung.x, width: rung.w, top: ASCENT_TOP, height: ASCENT_H }}
                onFocus={() => setAt(index)}
                onClick={() => (rung.state === 'locked' ? refuse() : onOpen(rung.level))}
                aria-disabled={rung.state === 'locked'}
                aria-label={rung.opensAt
                  ? `${rung.id} — locked, opens at ${rung.opensAt.need}% on ${rung.opensAt.id}, which is at ${rung.opensAt.at}%`
                  : `${rung.id} — ${rung.pct}% ready, ${rung.done} of ${rung.total} cards mastered`}
              >
                {fill > 0 ? <span className="as-fill" style={{ height: fill }} /> : null}
                <span className="as-base" />
                <span className="as-body">
                  <b className={inFill ? 'as-pct infill' : 'as-pct'}>{rung.pct}%</b>
                  {rung.isTarget ? (
                    <i className="as-count">
                      {rung.done.toLocaleString()} / {rung.total.toLocaleString()} MASTERED
                    </i>
                  ) : null}
                  <b className="as-id">{rung.id}</b>
                  <i className="as-state">{stateWord(rung)}</i>
                </span>
              </button>
            )
          })}

          {/* after the columns, so both thresholds run across all five rather than between them */}
          <span className="as-rule ready" style={{ top: pctY(JLPT_READY_PCT) }} />
          <span className="as-chip ready" style={{ top: pctY(JLPT_READY_PCT) }}>
            <b>{JLPT_READY_PCT}%</b><i>READY TO SIT</i>
          </span>
          <span className="as-rule gate" style={{ top: pctY(JLPT_UNLOCK_PCT) }} />
          <span className="as-chip gate" style={{ top: pctY(JLPT_UNLOCK_PCT) }}>
            <b>{JLPT_UNLOCK_PCT}%</b><i>OPENS THE NEXT</i>
          </span>
        </div>

        {/* WHAT THE FOUR SHUT COLUMNS USED TO SAY ONE AT A TIME, and what a bar actually measures.
            One line, on a ground, in the band the contract leaves for a whole-set statement. */}
        <div className="as-law">
          <b>EACH LEVEL OPENS WHEN THE ONE BELOW IT REACHES {JLPT_UNLOCK_PCT}%</b>
          <i>A BAR IS MASTERY, NOT STUDY — THREE CORRECT REVIEWS AND A 21-DAY INTERVAL, PER CARD</i>
        </div>

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Choose<em>選択</em></span>
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
