import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MinigameKey, ScriptKey } from '../../../types'
import {
  CHAPTER_NUM, TAB_W, TAB_W_SEL, drillChapters, drillDecks, drillModes, groupCopy,
  nearestOffered, railDistance, railEnds, railLayout, railStep, tabScale,
} from '../drills'
import { useHoverPick } from '../useHoverPick'
import '../../../styles/stage.css'
import '../menu.css'

export interface DrillsProps {
  /** the deck the hub is already standing on, so the screen opens where the app is */
  deck: ScriptKey
  onStart: (deck: ScriptKey, mode: MinigameKey) => void
  onUp: () => void
}

/* ==================================================================================================
   DRILLS — seventeen modes on an axis of six decks, as the mockup draws it.

   The first port put the rail and the tabs in but expanded the SELECTED TAB in place: the chosen
   mode grew a description, a deck map and an action slab inside its own 94px stone. The mockup does
   what the course's road does instead -- the stone you are on is not drawn at all, and a card stands
   in its slot. That difference is why the port had no `.dr-hero`, `.dr-side` or `.dr-mini`, and why
   a screen carrying three separate readouts looked like a row of tabs.
   ================================================================================================== */

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
  /* walking the rail slides a stone under a stationary pointer, whose `mouseenter` would drag the
     selection back off the one the keyboard just chose. See `useHoverPick`. */
  const hover = useHoverPick(setSel)

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
      if (event.key === 'ArrowRight') {
        event.preventDefault(); hover.keyed(); setSel((s) => railStep(layout, s, 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault(); hover.keyed(); setSel((s) => railStep(layout, s, -1))
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        hover.keyed()
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
  }, [layout, decks, deckKey, modes, here, onStart, hover])

  /* the rail is shifted so the selection sits at the strip's middle */
  const shift = Math.round(STRIP_MID - (layout.centres[sel] ?? 0))
  const ends = railEnds(layout)
  const chapter = chapters.find((c) => sel >= c.from && sel <= c.to) ?? chapters[0]
  const chapterIndex = chapters.indexOf(chapter)
  const copy = groupCopy(chapter?.key ?? '')
  const deckLabel = decks.find((d) => d.key === deckKey)?.label.toUpperCase() ?? ''
  /* the card's name is set from its own length, the same rule the deck screen's hero uses */
  const nameSize = here
    ? Math.max(14, Math.min(20, Math.floor(216 / (here.title.length * 0.62))))
    : 16

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        {/* THE DECK AXIS. Its figure is counted out of SCRIPT_MINIGAMES rather than stated. */}
        <div className="dr-decks">
          {decks.map((d) => (
            <button
              key={d.key}
              type="button"
              className={d.key === deckKey ? 'dr-deck on' : 'dr-deck'}
              onClick={() => { setDeckKey(d.key); setSel((v) => nearestOffered(modes, d.key, v)) }}
              aria-label={`${d.label} — offers ${d.offers} of ${modes.length} drills`}
            >
              <b>{d.label.toUpperCase()}</b>
              <s>{d.offers} / {modes.length}</s>
            </button>
          ))}
        </div>

        <div className="dr-strip">
          <div className="dr-rail" style={{ transform: `translateX(${shift}px)` }}>
            {/* THE CHAPTER BLOCKS RIDE OVER THEIR OWN SPAN, and a chapter the fold emptied has no
                span to sit over -- so it is drawn as nothing rather than as a sliver. */}
            {chapters.map((c, g) => {
              let lo = -1
              let hi = -1
              let have = 0
              for (let i = c.from; i <= c.to; i++) {
                if (layout.offered[i]) { if (lo < 0) lo = i; hi = i; have++ }
              }
              if (lo < 0) {
                return <div key={c.key} className="dr-chap" style={{ opacity: 0, width: 0 }} />
              }
              const a = layout.centres[lo] - (lo === sel ? TAB_W_SEL : TAB_W) / 2
              const b = layout.centres[hi] + (hi === sel ? TAB_W_SEL : TAB_W) / 2
              const total = c.to - c.from + 1
              return (
                <div
                  key={c.key}
                  className={g === chapterIndex ? 'dr-chap here' : 'dr-chap'}
                  style={{ left: Math.round(a + 14), width: Math.round(b - a), opacity: 1 }}
                >
                  <div className="dr-chapin">
                    <u>{CHAPTER_NUM[g] ?? ''}</u>
                    <b>{c.title.toUpperCase()}</b>
                    <i>{groupCopy(c.key).jp}</i>
                    <s>{total} MODE{total === 1 ? '' : 'S'} · {have} HERE</s>
                  </div>
                </div>
              )
            })}

            {/* THE STONES. The selected one is not drawn -- the card stands in its slot -- and a
                folded mode collapses into its own seam rather than fading where it stood. */}
            {modes.map((m, i) => {
              const d = railDistance(layout, i)
              const on = d !== null
              const isSel = i === sel
              const fade = !on || isSel ? 0
                : d === 1 ? 1 : d === 2 ? 0.92 : d === 3 ? 0.72 : d === 4 ? 0.45 : 0
              return (
                <button
                  key={m.key}
                  type="button"
                  className="dr-tab"
                  style={{
                    left: Math.round((on ? layout.centres[i] : layout.lefts[i]) - TAB_W / 2),
                    top: 100,
                    opacity: fade,
                    pointerEvents: on && !isSel ? 'auto' : 'none',
                    transform: `skewX(-8deg) rotate(-1.2deg) scale(${on ? tabScale(d ?? 0) : 0.2})`,
                  }}
                  onMouseEnter={() => hover.pick(i)}
                  onFocus={() => hover.pick(i)}
                  onClick={() => setSel(i)}
                  aria-label={`${m.title} — ${m.description}`}
                  aria-hidden={!on || isSel}
                  tabIndex={on && !isSel ? 0 : -1}
                >
                  <b>{String(i + 1).padStart(2, '0')}</b>
                  <span>{m.title}</span>
                  <s>
                    {m.decks.length === decks.length
                      ? `ALL ${decks.length}`
                      : `${m.decks.length} DECK${m.decks.length === 1 ? '' : 'S'}`}
                  </s>
                </button>
              )
            })}

            {here ? (
              <button
                type="button"
                className="dr-hero"
                style={{ left: Math.round(layout.centres[sel] - TAB_W_SEL / 2), top: 36 }}
                onClick={() => onStart(deckKey, here.key)}
              >
                <span className="dr-htab">
                  {chapter ? `${chapter.title.toUpperCase()} · ${copy.jp}` : ''}
                </span>
                <span className="dr-hnum">
                  <b>{String(sel + 1).padStart(2, '0')}</b>
                  <s>
                    {here.decks.length === decks.length
                      ? `ON ALL ${decks.length} DECKS`
                      : `ON ${here.decks.length} DECK${here.decks.length === 1 ? '' : 'S'}`}
                  </s>
                </span>
                <span className="dr-hglyph">{copy.glyph}</span>
                <span className="dr-hen" style={{ fontSize: `${nameSize}px` }}>{here.title}</span>
                <span className="dr-hd">{here.description}</span>
                {/* WHICH DECKS OFFER IT, which is the map read the other way and the one fact a
                    learner picking a drill cannot get anywhere else. */}
                <span className="dr-cells">
                  <span>
                    {decks.map((d) => (
                      <i
                        key={d.key}
                        className={`${here.decks.includes(d.key) ? 'has' : ''}`
                          + `${d.key === deckKey ? ' at' : ''}`}
                        title={d.label}
                      />
                    ))}
                  </span>
                  <s>OFFERED HERE</s>
                </span>
                <span className="dr-slab">RUN ON {deckLabel} · ENTER ▸</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* what is off each end, counted rather than drawn */}
        <div className="dr-side lo" style={{ opacity: ends.lo ? 1 : 0 }}>
          <i /><i /><i><b>{ends.lo}</b><u>MORE</u></i>
        </div>
        <div className="dr-side hi" style={{ opacity: ends.hi ? 1 : 0 }}>
          <i /><i /><i><b>{ends.hi}</b><u>MORE</u></i>
        </div>

        <div className="dr-mini">
          <span className="dr-bars">
            {modes.map((m, i) => {
              const d = railDistance(layout, i)
              const off = d === null
              const dd = d ?? 9
              return (
                <i
                  key={m.key}
                  className={off ? 'off' : undefined}
                  style={{
                    width: off ? 5 : dd === 0 ? 14 : dd === 1 ? 11 : dd === 2 ? 9 : dd <= 4 ? 8 : 6,
                    height: off ? 6 : dd === 0 ? 19 : dd === 1 ? 14 : dd === 2 ? 11 : dd <= 4 ? 9 : 7,
                    boxShadow: i === sel ? '0 0 0 2px var(--hi)' : 'none',
                    marginLeft: i > 0 && modes[i - 1].group !== m.group ? 10 : undefined,
                  }}
                />
              )
            })}
          </span>
          {/* THE FOLD, SAID OUT LOUD. A deck that offers twelve of seventeen has five closed over,
              and a road that silently omits them looks like a shorter catalogue. */}
          <span className="dr-line">
            MODE {layout.at + 1} / {layout.list.length} OFFERED ON {deckLabel}
            {layout.list.length < modes.length
              ? ` · ${modes.length - layout.list.length} FOLDED AWAY`
              : ''}
          </span>
        </div>

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Choose<em>選択</em></span>
          <span><b>↑ ↓</b>Deck<em>教材</em></span>
          <span><b>ENTER</b>Run<em>決定</em></span>
        </div>
      </div>
    </div>
  )
}
