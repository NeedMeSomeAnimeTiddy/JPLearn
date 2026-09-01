import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Lane } from '../lanes'
import '../../../styles/stage.css'
import '../menu.css'

export interface LanesProps {
  /** the caption strip: the section's own name */
  jp: string
  en: string
  /** the line under the lanes */
  note: string
  lanes: readonly Lane[]
  onPick: (key: string) => void
  onUp: () => void
}

/* ONE CARD, TWO SCREENS. Three lanes across the stage or two — the card does not change, only how
   many there are and how wide each gets. See the note in `lanes.ts`. */
export function Lanes({ jp, en, note, lanes, onPick, onUp }: LanesProps) {
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

  /* the screen takes focus on arrival, or its own arrow keys do nothing — see the note in MenuL1 */
  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); setAt((i) => Math.min(i + 1, lanes.length - 1)) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
      else if (event.key === 'Enter') {
        event.preventDefault()
        const lane = lanes[at]
        if (lane && !lane.shut) onPick(lane.key)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, lanes, onPick])

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>{jp}</b><i>{en}</i>
          <s>{lanes.length} {lanes.length === 2 ? 'LANES' : 'LANES'}</s>
        </div>

        <div className={lanes.length === 2 ? 'lanes two' : 'lanes'}>
          {lanes.map((lane, index) => {
            const classes = ['pr-lane']
            if (index === at) classes.push('on')
            if (lane.duty) classes.push('duty')
            if (lane.shut) classes.push('shut')
            return (
              <button
                key={lane.key}
                type="button"
                className={classes.join(' ')}
                onFocus={() => setAt(index)}
                onClick={() => !lane.shut && onPick(lane.key)}
                aria-disabled={lane.shut}
                aria-label={lane.shut
                  ? `${lane.en} — locked, ${lane.opens ?? 'not open yet'}`
                  : `${lane.en} — ${lane.desc}`}
              >
                <span className="pr-cap"><b>{lane.en}</b><i>{lane.jp}</i></span>
                <span className="pr-glyph" aria-hidden="true">{lane.glyph}</span>
                <span className={lane.absent ? 'pr-fig none' : 'pr-fig'}>
                  <b>{lane.fig}</b><i>{lane.figLab}</i>
                </span>
                <span className="pr-d">{lane.desc}</span>
                <span className="pr-foot">{lane.shut ? `LOCKED · ${lane.opens ?? ''}` : lane.foot}</span>
                <span className="pr-slab">
                  {lane.shut ? 'NOT YET' : index === at ? `${lane.act} · ENTER ▸` : lane.act}
                </span>
              </button>
            )
          })}
        </div>

        <div className="pr-note">{note}</div>
        <button type="button" className="pj-back" onClick={onUp}>← THE MENU</button>
        <div className="mn-hint">← → CHOOSE · ENTER OPENS · ESC GOES BACK</div>
      </div>
    </div>
  )
}
