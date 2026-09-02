import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MinigameKey, ScriptKey } from '../../../types'
import { SESSION_LENGTH_PRESETS } from '../../../constants'
import {
  CHAPTER_NUM, TAB_W, TAB_W_SEL, drillChapters, drillDecks, drillModes, groupCopy,
  nearestOffered, railDistance, railEnds, railLayout, railStep, tabScale,
} from '../drills'
import { useHoverPick } from '../useHoverPick'
import { screenHead } from '../chrome'
import { refuse } from '../refuse'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

/* HOW THIS RUN GOES, which lived in the script hub and nowhere else. All four are persisted
   preferences rather than per-run choices -- the app has read them out of `sessionPrefs` since
   long before this screen existed -- and they stand beside the button that starts the round
   because that is the moment they mean anything. */
export interface DrillSession {
  /** items in a round, matched against `SESSION_LENGTH_PRESETS[n].items` */
  length: number
  lives: boolean
  focus: boolean
  confidence: boolean
  setLength: (items: number) => void
  toggleLives: () => void
  toggleFocus: () => void
  toggleConfidence: () => void
}

export interface DrillsProps {
  /* THE DECK IS THE APP'S NOW, NOT THE SCREEN'S. It was local state that committed only on start,
     which was harmless while the hero's one claim was a name -- but the lock reasons below are
     computed from the LIVE pool, so a road standing on a deck the app is not standing on would
     draw another deck's refusals. */
  deck: ScriptKey
  /** the resolved deck, level included: KANJI N3 rather than KANJI */
  slug: string
  session: DrillSession
  /* WHY A MODE CANNOT RUN ON THIS POOL. The hub drew these on its cassettes and the road drew
     nothing at all, so retiring the hub without them would leave seventeen modes that all look
     runnable and four that quietly fail. Keyed by mode; absent means it can run. */
  lockReasons: Partial<Record<MinigameKey, string>>
  onDeck: (deck: ScriptKey) => void
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

export function Drills({
  deck, slug, session, lockReasons, onDeck, onStart, onUp,
}: DrillsProps) {
  const entered = useEntered()
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const modes = useMemo(() => drillModes(), [])
  const chapters = useMemo(() => drillChapters(modes), [modes])
  const decks = useMemo(() => drillDecks(modes), [modes])

  const deckKey = deck
  const [sel, setSel] = useState(() => nearestOffered(modes, deck, 0))
  const layout = railLayout(modes, deckKey, sel)
  const here = modes[sel]
  const shut = here ? lockReasons[here.key] ?? null : null

  /* the three lengths answer to their number and the three switches to their letter, both printed
     on the chip -- the same rule level one's rows and the study screens' level row follow */
  const setKeys = useMemo(() => {
    const map = new Map<string, () => void>()
    SESSION_LENGTH_PRESETS.forEach((preset, index) => {
      map.set(String(index + 1), () => session.setLength(preset.items))
    })
    map.set('l', session.toggleLives)
    map.set('f', session.toggleFocus)
    map.set('c', session.toggleConfidence)
    return map
  }, [session])
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
        onDeck(next.key)
        /* changing deck snaps to the nearest mode that deck still offers */
        setSel((s) => nearestOffered(modes, next.key, s))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        /* A REFUSED PRESS SAYS SO OUT LOUD, and the reason is already on the slab -- the flash and
           the knock are only what send you to read it. See `refuse.ts`. */
        if (shut) { refuse(); return }
        if (here) onStart(deckKey, here.key)
      } else {
        /* STOPPED, NOT MERELY PREVENTED: App binds 1 through 5 on the window as its route into a
           deck, so a bubbling 1 would set the round to eight items and then leave the screen. */
        const act = setKeys.get(event.key.toLowerCase())
        if (act) { event.preventDefault(); event.stopPropagation(); act() }
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [layout, decks, deckKey, modes, here, onDeck, onStart, hover, setKeys, shut])

  /* the rail is shifted so the selection sits at the strip's middle */
  const shift = Math.round(STRIP_MID - (layout.centres[sel] ?? 0))
  const ends = railEnds(layout)
  const chapter = chapters.find((c) => sel >= c.from && sel <= c.to) ?? chapters[0]
  const chapterIndex = chapters.indexOf(chapter)
  const copy = groupCopy(chapter?.key ?? '')
  /* THE RESOLVED DECK, because KANJI is five decks and the road runs on whichever of them the
     study screen last stood on. RUN ON KANJI over an N3 round is the same half-truth the deck
     screen's own caption exists to avoid. */
  const deckLabel = slug.replace(/_/g, ' ').toUpperCase()
  /* the card's name is set from its own length, the same rule the deck screen's hero uses */
  const nameSize = here
    ? Math.max(14, Math.min(20, Math.floor(216 / (here.title.length * 0.62))))
    : 16

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('DRILLS', 'drills')} />
        {/* THE DECK AXIS. Its figure is counted out of SCRIPT_MINIGAMES rather than stated. */}
        <div className="dr-decks">
          {decks.map((d) => (
            <button
              key={d.key}
              type="button"
              className={d.key === deckKey ? 'dr-deck on' : 'dr-deck'}
              onClick={() => { onDeck(d.key); setSel((v) => nearestOffered(modes, d.key, v)) }}
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
                onClick={() => { if (shut) { refuse(); return } onStart(deckKey, here.key) }}
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
                <span className={shut ? 'dr-slab shut' : 'dr-slab'}>
                  {shut ? shut.toUpperCase() : `RUN ON ${deckLabel} · ENTER ▸`}
                </span>
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

        {/* ── HOW THIS RUN GOES ───────────────────────────────────────────────────────────────
            Four switches that existed only inside the script hub, standing where the road ends
            rather than on a settings page: they are the difference between eight cards and
            twenty, and between a round that can be lost and one that cannot.

            IN THE FOOT BAND, under the minimap, which the frame contract leaves for a whole-set
            statement about the screen. Every chip prints the key that works it, so this row
            costs neither of the two axes the road already spends. */}
        <div className="dr-set" role="group" aria-label="How this run goes">
          <span className="dr-setlab">THIS RUN</span>
          {SESSION_LENGTH_PRESETS.map((preset, index) => (
            <button
              key={preset.key}
              type="button"
              className={preset.items === session.length ? 'dr-chip on' : 'dr-chip'}
              aria-pressed={preset.items === session.length}
              aria-label={`${preset.label} round, ${preset.items} items`}
              onClick={() => session.setLength(preset.items)}
            >
              <s>{index + 1}</s><b>{preset.label.toUpperCase()}</b><i>{preset.items}</i>
            </button>
          ))}
          <span className="dr-setdiv" aria-hidden="true" />
          <button
            type="button"
            className={session.lives ? 'dr-chip on' : 'dr-chip'}
            aria-pressed={session.lives}
            aria-label={`Lives ${session.lives ? 'on' : 'off'}`}
            onClick={session.toggleLives}
          >
            <s>L</s><b>LIVES</b>
          </button>
          <button
            type="button"
            className={session.focus ? 'dr-chip on' : 'dr-chip'}
            aria-pressed={session.focus}
            aria-label={`Focused review ${session.focus ? 'on' : 'off'}`}
            onClick={session.toggleFocus}
          >
            <s>F</s><b>FOCUS</b>
          </button>
          <button
            type="button"
            className={session.confidence ? 'dr-chip on' : 'dr-chip'}
            aria-pressed={session.confidence}
            aria-label={`Confidence capture ${session.confidence ? 'on' : 'off'}`}
            onClick={session.toggleConfidence}
          >
            <s>C</s><b>CONFIDENCE</b>
          </button>
        </div>

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Choose<em>選択</em></span>
          <span><b>↑ ↓</b>Deck<em>教材</em></span>
          <span><b>1–3</b>Length<em>長さ</em></span>
          <span><b>L F C</b>Switches<em>設定</em></span>
          <span><b>ENTER</b>Run<em>決定</em></span>
        </div>
      </div>
    </div>
  )
}
