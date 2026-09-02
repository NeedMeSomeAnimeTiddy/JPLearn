import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ProgressionNodeView } from '../../progression'
import {
  CS, CS_BACK, CS_CHAPTERS, CS_CHNUM, CS_FACE, CS_FOCUS,
  courseMark, courseSlots, csBits, csChapter, csScale, hereIndex, pathRows,
} from '../pathL2'
import type { PathRow } from '../pathL2'
import { MENU_SECTIONS } from '../constants'
import { useHoverPick } from '../useHoverPick'
import { useTraversal } from '../useTraversal'
import { refuse } from '../refuse'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface PathL2Props {
  nodes: readonly ProgressionNodeView[]
  loading: boolean
  /** the same pair the progression map uses, so soft-gating and its confirm come for free */
  onOpenNode: (nodeId: string) => void
  onUp: () => void
}

/* ==================================================================================================
   THE PATH, LEVEL TWO — a walked road, which is what the mockup draws and what the first port did
   not. That version was a vertical list of six rows with a fold count at each end. This is sixteen
   standing tablets on a rail that compresses toward both horizons, the card riding the one you are
   on, a marker showing how far between this step and the next you have got, and a minimap of the
   whole sixteen under it.

   THE LAYOUT IS INLINE STYLE ON PURPOSE. Everything here is a function of distance from the
   selection and changes on every keypress, so it cannot live in the stylesheet -- the mockup writes
   the same numbers into `cssText` for the same reason. What CAN rest is in `menu.css`; the
   arithmetic is in `pathL2.ts`, where it is testable.
   ================================================================================================== */

/** how the road opens: a tablet's opacity by how far it is from the one you are on */
const FADE = [1, 1, 0.92, 0.72, 0.45]
const DIM = 'rgba(222,214,189,0.55)'

type Status = 'done' | 'current' | 'locked'
const statusOf = (row: PathRow): Status =>
  row.state === 'done' ? 'done' : row.state === 'here' ? 'current' : 'locked'

/** where a step hands off to, and the colour that section wears */
function handOff(row: PathRow): { label: string; accent: string | null } | null {
  if (!row.goesTo || row.goesTo === 'A DECK') return null
  const section = MENU_SECTIONS.find((s) => s.label === row.goesTo)
  return { label: row.goesTo, accent: section?.accent ?? null }
}

export function PathL2({ nodes, loading, onOpenNode, onUp }: PathL2Props) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const rows = useMemo(() => pathRows(nodes), [nodes])


  /* the cursor starts where the learner actually is, not at the top -- opening the journey on
     step one when you are on step nine would be starting a story you are halfway through */
  const [cursor, setCursor] = useState<number | null>(null)
  const at = Math.max(0, Math.min(cursor ?? hereIndex(rows), rows.length - 1))
  /* walking the road translates the rail, so a tablet slides under a stationary pointer whose
     `mouseenter` would drag the selection back. See `useHoverPick`. */
  const hover = useHoverPick(setCursor)
  /* THE ROAD IS A REEL: you push it and it travels under a fixed centre. See `useTraversal`. */
  const reel = useTraversal('reel', {
    step: (d) => {
      hover.keyed()
      setCursor((c) => Math.max(0, Math.min((c ?? hereIndex(rows)) + d, rows.length - 1)))
    },
  })

  useEffect(() => {
    if (cursor === null && rows.length) setCursor(hereIndex(rows))
  }, [cursor, rows])


  /* THE SCREEN TAKES FOCUS WHEN IT ARRIVES, or its own arrow keys do nothing. The listener below
     is on this subtree rather than on the window — deliberately, so the menu never eats the arrows
     a study session needs — but a subtree only receives keydown when focus is inside it, and after
     a click on the level above, focus is on <body>. `tabIndex={-1}` makes the container focusable
     without putting it in the tab order, which is the same thing a dialog does.

     LEFT AND RIGHT, BECAUSE THE ROAD IS HORIZONTAL NOW. The up/down pair is kept as well: it is
     what the hint bar promised for three phases and what a hand already on the arrows will try. */
  const walkRef = useRef({ at: 0, len: 0 })
  walkRef.current = { at, len: rows.length }

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      const walk = (d: 1 | -1) => {
        event.preventDefault()
        hover.keyed()
        /* THROUGH THE REF, LIKE THE DOOR BELOW IT. This listener is bound once and must not be
           re-subscribed every time the cursor moves; the two things it needs to know about the
           current road -- where you are, and how long it is -- are kept where a stable listener
           can read them. Read out of the closure they would be whatever they were on the frame
           the effect ran, which is the first one. */
        const { at: here, len } = walkRef.current
        setCursor((c) => Math.max(0, Math.min((c ?? here) + d, len - 1)))
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') walk(1)
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') walk(-1)
      else if (event.key === 'Enter') {
        event.preventDefault()
        openRef.current()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [hover])

  const n = rows.length
  const { centers, seamX, end } = useMemo(() => courseSlots(rows, at), [rows, at])
  const mark = useMemo(() => courseMark(rows, centers), [rows, centers])
  const done = rows.filter((r) => r.state === 'done').length
  const sel = rows[at]
  const chapter = Math.max(0, csChapter(at))
  const chap = CS_CHAPTERS[chapter]

  const selStatus = sel ? statusOf(sel) : 'locked'
  const selUp = selStatus !== 'locked'
  const selHand = sel ? handOff(sel) : null
  const selDead = !!sel && !sel.goesTo

  /* the card's big slot is Japanese and CJK glyphs are one em wide, so the size is the card's 250px
     divided by the count -- capped at the 66 one- and two-character names are drawn at, floored at
     28 where mincho stops being mincho */
  const bigJp = sel?.jp ?? ''
  const bigSize = bigJp ? Math.max(28, Math.min(66, Math.floor(250 / (bigJp.length * 1.06)))) : 0

  const slabLine = !sel ? ''
    : selDead ? 'NOTHING HERE YET'
      : selStatus === 'locked' ? 'LOCKED'
        : selHand ? `GO TO ${selHand.label} ▸`
          : selStatus === 'current' ? 'START THIS STEP ▸' : 'REVISIT THIS STEP ▸'
  const slabLive = !selDead && selStatus !== 'locked'

  /* ==================================================================================================
     ONE DOOR, AND IT SAYS NO OUT LOUD.

     Three places entered a step -- Enter, a click on the tablet under the cursor, and the hero slab
     -- and all three called `onOpenNode` for any row at all. A step that is LOCKED or that leads
     nowhere yet went through the same call, `requestOpen` returned nothing, and the screen sat
     there: no flash, no movement, and a slab two inches away already reading LOCKED or NOTHING HERE
     YET. The refusal is what sends you to read it. See `refuse.ts`.

     THROUGH A REF FOR THE SAME REASON THE CONFIRM ON LEVEL ONE IS: the keydown listener is bound
     once and deliberately does not depend on the cursor, so what it needs to know about the current
     row has to live where a stable listener can read it. */
  /* ==================================================================================================
     THE WORDS ARRIVE WITH THE FURNITURE.

     The tablets slide, the marker travels, the minimap eases -- and the three lines on the hero card
     HARD-CUT. Every piece of furniture on this screen moves and the only thing carrying information
     teleports, which reads as the card being replaced rather than as the road being walked. It is
     also the one thing on screen the eye is actually reading.

     SO THE TEXT ENTERS FROM THE SIDE YOU CAME FROM, which ties the animation to the navigation
     rather than decorating it: walk forward and the new name comes in from the right. A small
     stagger down the three lines lets the eye land on the NUMBER first, which is the line that says
     where you are.

     A KEY, NOT A TRANSITION. These are text nodes whose content changes, and CSS cannot transition
     that -- but remounting the three spans restarts their entrance animation, which is exactly the
     effect, and it is three spans rather than the card, so nothing that is sliding is interrupted. */
  const dirRef = useRef(1)
  const wasRef = useRef(at)
  if (at !== wasRef.current) {
    dirRef.current = at > wasRef.current ? 1 : -1
    wasRef.current = at
  }

  const openRef = useRef<() => void>(() => {})
  openRef.current = () => {
    if (!sel) return
    /* AND ONLY THE DEAD ONE IS REFUSED. A LOCKED step is not unreachable and never has been --
       `useProgression` calls its gating SOFT, on the ground that onboarding is skippable and a hard
       gate would shut out anyone who skipped it: pressing one raises a confirmation, which is
       already feedback and already the right feedback. A step with no destination at all is the
       genuinely silent case, and the slab beside it already reads NOTHING HERE YET. */
    if (selDead) { refuse(); return }
    onOpenNode(sel.id)
  }

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        {/* NO SLAB ON THE ROAD, and this is a decision rather than an omission: `.cs-chapline` two
            lines down already reads "THE PATH 道 / 一 基礎 FOUNDATIONS", which is the heading plus
            the chapter you are standing in. A second heading over it would say less, twice. */}
        {/* an absence is drawn as an absence, and "still reading" is not the same absence as
            "answered with nothing" -- a road with no tablets on it must say which */}
        {!n ? (
          <div className="pj-empty">
            {loading
              ? 'READING THE CURRICULUM…'
              : 'THE CURRICULUM DID NOT ANSWER · NOTHING TO WALK YET'}
          </div>
        ) : null}

        {n ? (
          <div className="course-wrap">
            <div className="cs-chapline">
              <span className="cs-chaplead">THE PATH 道</span>
              <s>/</s>
              <span className="cs-chapnow">
                {`${CS_CHNUM[chapter]} ${chap.jp} ${chap.en}`}
              </span>
            </div>

            {/* THE GESTURE BELONGS TO THE WINDOW, NOT TO WHAT SLIDES THROUGH IT. `.cs-rail` is the
                reel itself -- 5,200 pixels wide and mostly outside the frame -- so a listener on it
                is a listener on a surface the pointer is never over. Measured: every wheel and drag
                aimed at its centre landed 2,600 pixels off-screen and did nothing at all. */}
            <div
              className="cs-strip"
              ref={reel.ref}
              onPointerDown={reel.onPointerDown}
            >
              <div
                className="cs-rail"
                style={{ transform: `translateX(${Math.round(CS_FOCUS - centers[at])}px)` }}
              >
                {rows.map((row, i) => {
                  const status = statusOf(row)
                  const isSel = i === at
                  const d = Math.abs(i - at)
                  const faceUp = status !== 'locked'
                  const dead = !row.goesTo
                  const op = isSel ? 0 : FADE[d] ?? 0
                  /* DIRECTION, DRAWN. What is finished sinks and takes a small shadow; what is
                     ahead stands proud of the road and casts a long one, so behind and ahead stop
                     being mirror images of each other. */
                  const dep = status === 'done'
                    ? { y: 9, sh: '3px 4px 0 rgba(0,0,0,0.32)' }
                    : { y: -6, sh: '6px 9px 0 rgba(0,0,0,0.5)' }
                  const keyline = faceUp ? 'rgba(20,17,13,0.2)' : 'rgba(242,234,216,0.16)'
                  const bits = csBits(row)
                  const hand = handOff(row)
                  const style: CSSProperties = {
                    left: Math.round(centers[i] - CS.W / 2),
                    top: CS.TABY,
                    opacity: op,
                    pointerEvents: isSel || op < 0.1 ? 'none' : 'auto',
                    background: faceUp ? CS_FACE : CS_BACK,
                    boxShadow: `${dep.sh}, inset 0 0 0 1px ${keyline}`,
                    border: dead ? '1px dashed rgba(242,234,216,0.3)' : undefined,
                    transform: `skewX(-8deg) rotate(-1.2deg) translateY(${dep.y}px)`
                      + ` scale(${isSel ? 0.94 : csScale(d)})`,
                    transitionDelay: `${Math.min(d, 3) * 14}ms`,
                  }
                  const destStyle: CSSProperties = hand && hand.accent
                    ? { background: hand.accent, color: 'var(--washi)' }
                    : dead
                      ? faceUp
                        ? {
                          background: 'rgba(20,17,13,0.14)',
                          borderBottom: '1px dashed rgba(20,17,13,0.45)',
                          color: 'rgba(20,17,13,0.55)',
                        }
                        : {
                          background: 'rgba(242,234,216,0.07)',
                          borderBottom: '1px dashed rgba(242,234,216,0.34)',
                          color: 'rgba(222,214,189,0.62)',
                        }
                      : faceUp
                        ? { background: 'var(--ink)', color: 'var(--gold-hi)' }
                        : { background: 'rgba(242,234,216,0.13)', color: 'var(--gold-hi)' }
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="cs-tab"
                      data-state={row.state}
                      style={style}
                      onMouseEnter={() => hover.pick(i)}
                      onFocus={() => hover.pick(i)}
                      /* a drag that travelled is not a click -- otherwise letting go over a step
                         enters it, which on the road means a flight you did not ask for */
                      onClick={() => {
                        if (reel.dragged()) return
                        if (i === at) openRef.current()
                        else setCursor(i)
                      }}
                      aria-label={`${row.no} ${row.en}${row.isOpen ? '' : ' — not open yet'}`}
                    >
                      <span className="cs-dest" style={destStyle}>
                        {hand ? `→ ${hand.label}` : dead ? 'NOT BUILT' : 'DECK'}
                      </span>
                      <b className="cs-num" style={{ color: faceUp ? 'var(--ink)' : 'rgba(242,234,216,0.66)' }}>
                        {row.no}
                      </b>
                      <span
                        className="cs-hair"
                        style={{
                          width: faceUp ? 30 : 16,
                          background: faceUp ? 'rgba(20,17,13,0.4)' : 'rgba(242,234,216,0.4)',
                        }}
                      />
                      {bits.lv ? (
                        <b className="cs-lv" style={{ color: faceUp ? 'var(--hi-deep)' : '#f2ead8' }}>
                          {bits.lv}
                        </b>
                      ) : null}
                      <span
                        className="cs-vjp"
                        data-lat={/[぀-ヿ一-龯]/.test(bits.vjp) ? '0' : '1'}
                        style={{ color: faceUp ? 'var(--ink)' : 'rgba(232,224,203,0.78)' }}
                      >
                        {bits.vjp}
                      </span>
                      <span
                        className="cs-gate"
                        style={{ color: faceUp ? 'rgba(20,17,13,0.62)' : 'rgba(242,234,216,0.62)' }}
                      >
                        {bits.tok}
                      </span>
                      <span
                        className="cs-glyph"
                        data-seal={status === 'done' ? '1' : '0'}
                        style={status === 'done' ? undefined : {
                          color: status === 'current' ? 'var(--hi-deep)' : 'rgba(242,234,216,0.52)',
                        }}
                      >
                        {status === 'done' ? '済'
                          : status === 'current' ? 'YOU ARE HERE'
                            : dead ? 'NOT YET' : 'LOCKED'}
                      </span>
                    </button>
                  )
                })}

                <span className="cs-cap start" style={{ left: Math.round(centers[0] - CS.W / 2 - CS.GAP - CS.CAP_W), top: CS.TABY }}>
                  <b>START</b>
                </span>
                {seamX != null ? (
                  <span className="cs-cap seam" style={{ left: Math.round(seamX), top: CS.TABY }}>
                    <b>CERTIFICATION</b>
                  </span>
                ) : null}
                <span className="cs-cap end" style={{ left: Math.round(end + CS.GAP), top: CS.TABY }}>
                  <b>END</b>
                </span>

                {/* HIDDEN WHEN THE CARD IS STANDING ON IT. The marker rides the rule at the card's
                    foot, and when you are on the step the card is already saying the same number in
                    its gauge -- so it steps aside rather than competing. */}
                <span
                  className="cs-mark"
                  style={{
                    left: Math.round(mark.x) - 4,
                    top: CS.RULE - 7,
                    opacity: Math.abs(mark.x - centers[at]) < CS.WSEL / 2 + 10 ? 0 : 1,
                  }}
                >
                  <i>{mark.pct}%</i>
                </span>

                {sel ? (
                  <button
                    type="button"
                    className="cs-hero"
                    style={{
                      left: Math.round(centers[at] - CS.WSEL / 2),
                      top: 0,
                      background: selUp ? 'var(--washi)' : CS_BACK,
                      boxShadow: '6px 8px 0 rgba(0,0,0,0.5), inset 0 0 0 1px '
                        + (selUp ? 'rgba(20,17,13,0.15)' : 'rgba(242,234,216,0.14)'),
                      border: !selUp && selDead ? '1px dashed rgba(242,234,216,0.4)' : undefined,
                    }}
                    onClick={() => openRef.current()}
                    data-dir={dirRef.current}
                  >
                    <span
                      className="cs-htab"
                      style={selHand && selHand.accent
                        ? { background: selHand.accent, color: 'var(--washi)' }
                        : selUp
                          ? { background: 'var(--ink)', color: 'var(--gold-hi)' }
                          : { background: 'rgba(242,234,216,0.13)', color: 'var(--gold-hi)' }}
                    >
                      {selHand ? `→ ${selHand.label}` : selDead ? 'NOT BUILT' : 'DECK'}
                    </span>
                    <span className="cs-hhead">
                      <span
                        key={`n${at}`}
                        className="cs-hnum"
                        style={{ color: selUp ? 'var(--ink)' : DIM }}
                      >
                        {sel.no}
                      </span>
                    </span>
                    <span
                      key={`j${at}`}
                      className="cs-hjp"
                      data-lat={bigJp ? '0' : '1'}
                      style={{
                        fontSize: bigSize ? `${bigSize}px` : undefined,
                        color: selUp ? 'var(--ink)' : 'rgba(230,222,200,0.72)',
                      }}
                    >
                      {bigJp || sel.en}
                    </span>
                    <span
                      key={`e${at}`}
                      className="cs-hen"
                      style={{ color: selUp ? 'var(--hi-deep)' : DIM }}
                    >
                      {sel.en}
                    </span>
                    <span className="cs-hfoot">
                      <span className="cs-gaterow">
                        <span
                          className="cs-gatelabel"
                          style={{ color: selUp ? 'rgba(20,17,13,0.45)' : 'rgba(242,234,216,0.45)' }}
                        >
                          {selStatus === 'current' ? 'GATE TO CLEAR'
                            : selStatus === 'done' ? 'CLEARED'
                              : selDead ? 'NOT BUILT YET' : 'LOCKED UNTIL'}
                        </span>
                        <span
                          className="cs-gateval"
                          style={{ color: selUp ? 'rgba(20,17,13,0.8)' : 'rgba(242,234,216,0.78)' }}
                        >
                          {selDead ? '—' : sel.want || '—'}
                          {sel.isOverridden ? ' · OPENED EARLY' : ''}
                        </span>
                      </span>
                      <span
                        className="cs-gaugerow"
                        style={{ display: selStatus === 'current' ? 'flex' : 'none' }}
                      >
                        <span className="cs-segs">
                          {Array.from({ length: 12 }, (_, k) => (
                            <i
                              key={k}
                              style={{
                                background: k < Math.round((12 * Math.max(0, sel.pct)) / 100)
                                  ? 'var(--gold)'
                                  : selUp ? 'rgba(20,17,13,0.12)' : 'rgba(242,234,216,0.12)',
                                boxShadow: `inset 0 0 0 1px ${selUp ? 'rgba(20,17,13,0.18)' : 'rgba(242,234,216,0.16)'}`,
                              }}
                            />
                          ))}
                        </span>
                        <b className="cs-pct" style={{ color: selUp ? 'var(--hi-deep)' : 'var(--gold-hi)' }}>
                          {Math.max(0, sel.pct)}%
                        </b>
                      </span>
                    </span>
                    <span
                      className="cs-hseal"
                      style={{ display: selStatus === 'done' ? 'block' : 'none' }}
                    >
                      済
                    </span>
                    <span className="cs-slabwrap">
                      <span
                        className="cs-slab"
                        style={{ background: slabLive ? 'var(--hi)' : 'rgba(12,10,8,0.72)' }}
                      >
                        <i style={{
                          color: slabLive ? '#ffd9a1' : 'rgba(242,234,216,0.62)',
                          fontWeight: slabLive ? 700 : 600,
                          letterSpacing: slabLive ? '0.16em' : '0.14em',
                        }}>
                          {slabLine}
                        </i>
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            </div>

            <span className="cs-side lo" style={{ opacity: at ? 1 : 0.14 }}>
              <i /><i /><i><b>{at}</b><u>BEHIND</u></i>
            </span>
            <span className="cs-side hi" style={{ opacity: n - 1 - at ? 1 : 0.14 }}>
              <i /><i /><i><b>{n - 1 - at}</b><u>AHEAD</u></i>
            </span>

            <div className="cs-mini">
              <span className="cs-minibars">
                {rows.map((row, i) => {
                  const d = Math.abs(i - at)
                  return (
                    <i
                      key={row.id}
                      title={`${i + 1}. ${row.en}`}
                      style={{
                        width: [26, 21, 17, 13][d] ?? 10,
                        height: [36, 28, 22, 16][d] ?? 12,
                        background: row.state === 'done' ? 'var(--gold)'
                          : row.state === 'here' ? 'var(--gold-hi)' : 'rgba(242,234,216,0.26)',
                        boxShadow: i === at ? '0 0 0 3px var(--hi)' : undefined,
                      }}
                    />
                  )
                })}
              </span>
              <span className="cs-minitext">
                <span className="cs-cleared">{done} {done === 1 ? 'STEP' : 'STEPS'} CLEARED</span>
                <s>·</s>
                <em className="cs-togo">{Math.max(0, n - done - 1)} TO GO</em>
              </span>
            </div>
          </div>
        ) : null}

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Walk<em>歩く</em></span>
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
