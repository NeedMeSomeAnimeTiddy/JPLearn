import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ASCENT_BOT, ASCENT_H, ASCENT_TOP, JLPT_READY_PCT, JLPT_UNLOCK_PCT,
  badgeFor, pctY, stateWord, type Rung,
} from '../ascent'
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
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)

  useLayoutEffect(() => {
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
      frameRef.current?.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

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
        if (rung && rung.state !== 'locked') onOpen(rung.level)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, rungs, onOpen])

  const cursor = rungs[Math.min(at, Math.max(rungs.length - 1, 0))]

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>検定</b><i>THE EXAM</i>
          <s>{loading ? 'READING YOUR MASTERY' : `${rungs.length} LEVELS`}</s>
        </div>

        <div className="ascent">
          <span className="as-tick" style={{ top: ASCENT_TOP }}>100</span>
          <span className="as-tick" style={{ top: ASCENT_BOT }}>0</span>

          {rungs.map((rung, index) => {
            const fill = Math.round((ASCENT_H * rung.pct) / 100)
            /* the number rides ON the fill when there is room above it and above the fill when
               there is not — a 94% column has 18px of track left and a figure set in it is cut */
            const inFill = fill > 120
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
                onClick={() => rung.state !== 'locked' && onOpen(rung.level)}
                aria-disabled={rung.state === 'locked'}
                aria-label={rung.opensAt
                  ? `${rung.id} — locked, opens at ${rung.opensAt.need}% on ${rung.opensAt.id}, which is at ${rung.opensAt.at}%`
                  : `${rung.id} — ${rung.pct}% ready, ${rung.done} of ${rung.total} cards mastered`}
              >
                {rung.opensAt ? (
                  <span className="as-lockbox">
                    <b>OPENS AT</b>
                    <i>{rung.opensAt.id} · {rung.opensAt.need}%</i>
                    <u>{rung.opensAt.id} AT {rung.opensAt.at}%</u>
                  </span>
                ) : (
                  <>
                    <span className="as-fill" style={{ height: fill }} />
                    {rung.isTarget ? <span className="as-mark" aria-hidden="true">検定</span> : null}
                  </>
                )}
                <span
                  className={rung.opensAt ? 'as-pct' : inFill ? 'as-pct' : 'as-pct above'}
                  style={{ bottom: rung.opensAt ? 8 : inFill ? fill - (rung.isTarget ? 62 : 44) : fill + 10 }}
                >
                  {rung.pct}%
                </span>
              </button>
            )
          })}

          {rungs.map((rung) => {
            const classes = ['as-plinth']
            if (rung.state === 'locked') classes.push('locked')
            if (rung.isTarget) classes.push('here')
            return (
              <span key={rung.level} className={classes.join(' ')} style={{ left: rung.x, width: rung.w }}>
                <b>{rung.id}</b><i>{stateWord(rung)}</i>
                <u>{rung.done.toLocaleString()} / {rung.total.toLocaleString()} MASTERED</u>
              </span>
            )
          })}

          {rungs.map((rung) => {
            const badge = badgeFor(rung)
            if (!badge) return null
            return (
              <span
                key={rung.level}
                className={rung.state === 'target' ? 'as-you' : 'as-ready'}
                style={{ left: rung.x, width: rung.w }}
              >
                {badge}
              </span>
            )
          })}

          {/* after the columns, so both thresholds run across all five rather than between them */}
          <span className="as-rule ready" style={{ top: pctY(JLPT_READY_PCT) }} />
          <span className="as-chip ready" style={{ top: pctY(JLPT_READY_PCT) }}>
            <b>{JLPT_READY_PCT}%</b><i>READY</i>
          </span>
          <span className="as-rule gate" style={{ top: pctY(JLPT_UNLOCK_PCT) }} />
          <span className="as-chip gate" style={{ top: pctY(JLPT_UNLOCK_PCT) }}>
            <b>{JLPT_UNLOCK_PCT}%</b><i>GATE</i>
          </span>

          {cursor ? <span className="as-cur" style={{ left: cursor.x, width: cursor.w }} /> : null}
        </div>

        {/* WHAT A BAR MEASURES, which nothing in the app has ever said. Without it a learner who
            has studied every day for a fortnight reads five empty columns as a broken screen. */}
        <div className="as-note">
          検定 · A BAR IS MASTERY, NOT STUDY — THREE CORRECT REVIEWS AND A 21-DAY INTERVAL, PER CARD
        </div>
        <button type="button" className="pj-back" onClick={onUp}>← THE MENU</button>
        <div className="mn-hint">← → CHOOSE A LEVEL · ENTER OPENS · ESC GOES BACK</div>
      </div>
    </div>
  )
}
