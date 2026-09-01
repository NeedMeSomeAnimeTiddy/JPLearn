import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MinigameKey, ScriptKey } from '../../../types'
import {
  drillChapters, drillDecks, drillModes, nearestOffered, railLayout, railStep,
} from '../drills'
import '../../../styles/stage.css'
import '../menu.css'

export interface DrillsProps {
  /** the deck the hub is already standing on, so the screen opens where the app is */
  deck: ScriptKey
  onStart: (deck: ScriptKey, mode: MinigameKey) => void
  onUp: () => void
}

/** the middle of the strip, which is where the selection is held */
const STRIP_MID = 474

export function Drills({ deck, onStart, onUp }: DrillsProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const modes = useMemo(() => drillModes(), [])
  const chapters = useMemo(() => drillChapters(modes), [modes])
  const decks = useMemo(() => drillDecks(modes), [modes])

  const [deckKey, setDeckKey] = useState<ScriptKey>(deck)
  const [sel, setSel] = useState(() => nearestOffered(modes, deck, 0))
  const layout = railLayout(modes, deckKey, sel)
  const here = modes[sel]

  useLayoutEffect(() => {
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
      frameRef.current?.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); setSel((s) => railStep(layout, s, 1)) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setSel((s) => railStep(layout, s, -1)) }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        const i = decks.findIndex((d) => d.key === deckKey)
        const next = decks[Math.max(0, Math.min(decks.length - 1, i + step))]
        setDeckKey(next.key)
        /* changing deck snaps to the nearest mode that deck still offers */
        setSel((s) => nearestOffered(modes, next.key, s))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (here) onStart(deckKey, here.key)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [layout, decks, deckKey, modes, here, onStart])

  /* the rail is shifted so the selection sits at the strip's middle, which is measured rather than
     assumed — the same trap the ascent's row fell into when it was inset */
  const shift = Math.round(STRIP_MID - (layout.centres[sel] ?? 0))

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>訓練</b><i>DRILLS</i>
          <s>{layout.list.length} OF {modes.length} MODES RUN ON {decks.find((d) => d.key === deckKey)?.label.toUpperCase()}</s>
        </div>

        {/* THE DECK AXIS. Its figure is counted out of SCRIPT_MINIGAMES rather than stated. */}
        <div className="dr-decks">
          {decks.map((d) => (
            <button
              key={d.key}
              type="button"
              className={d.key === deckKey ? 'dr-deck on' : 'dr-deck'}
              onClick={() => { setDeckKey(d.key); setSel((s) => nearestOffered(modes, d.key, s)) }}
              aria-label={`${d.label} — offers ${d.offers} of ${modes.length} drills`}
            >
              <b>{d.label.toUpperCase()}</b>
              <s>{d.offers} / {modes.length}</s>
            </button>
          ))}
        </div>

        <div className="dr-strip">
          <div className="dr-rail" style={{ transform: `translateX(${shift}px)` }}>
            {modes.map((m, i) => {
              if (!layout.offered[i]) return null
              const chapter = chapters.find((c) => i >= c.from && i <= c.to)
              const opensChapter = chapter?.from === i
              return (
                <button
                  key={m.key}
                  type="button"
                  className={i === sel ? 'dr-tab on' : 'dr-tab'}
                  style={{ left: layout.lefts[i], width: layout.widths[i] }}
                  onClick={() => setSel(i)}
                  aria-label={`${m.title} — ${m.description}`}
                >
                  {opensChapter ? <u className="dr-chap">{chapter?.title.toUpperCase()}</u> : null}
                  <b>{String(layout.list.indexOf(i) + 1).padStart(2, '0')}</b>
                  <span>{m.title}</span>
                  {i === sel ? (
                    <>
                      <em>{m.description}</em>
                      {/* WHICH DECKS OFFER IT, which is the map read the other way and the one
                          fact a learner picking a drill cannot get anywhere else. */}
                      <span className="dr-cells">
                        {decks.map((d) => (
                          <i key={d.key} className={m.decks.includes(d.key) ? 'on' : ''} title={d.label} />
                        ))}
                        <s>ON {m.decks.length} OF {decks.length} DECKS</s>
                      </span>
                      <span className="dr-slab">START · ENTER ▸</span>
                    </>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* THE FOLD, SAID OUT LOUD. A deck that offers twelve of seventeen has five closed over,
            and a road that silently omits them looks like a shorter catalogue. */}
        {layout.list.length < modes.length ? (
          <div className="dr-fold">
            {modes.length - layout.list.length} MODES DO NOT RUN ON{' '}
            {decks.find((d) => d.key === deckKey)?.label.toUpperCase()}
          </div>
        ) : null}

        <button type="button" className="pj-back" onClick={onUp}>← PRACTICE</button>
        <div className="mn-hint">← → THE ROAD · ↑ ↓ THE DECK · ENTER STARTS · ESC GOES BACK</div>
      </div>
    </div>
  )
}
