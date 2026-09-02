import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { HERO_INDEX, MENU_SECTIONS } from '../constants'
import { useHoverPick } from '../useHoverPick'
import type {
  MenuController, MenuCrown, MenuHero, MenuRow, MenuSection, MenuSectionKey,
} from '../types'
import '../../../styles/stage.css'
import '../menu.css'

export interface MenuL1Props {
  controller: MenuController
  hero: MenuHero
  crown: MenuCrown
  rows: Record<MenuSectionKey, MenuRow>
  onOpenSection: (key: MenuSectionKey) => void
  onRunHero: () => void
}

/* ==================================================================================================
   THE COLUMN IS SOLVED, NOT LAID OUT — and that is the difference between this and what shipped.

   The first port drew five rows at a uniform 62px on a fixed 74px pitch. The mockup's column has no
   resting geometry at all: a row is 40 tall shut and 118, 126 or 122 open depending on which figure
   it carries, so every row's top is the sum of the heights above it and one of those heights depends
   on which row is open. There is nothing to store, only this — it runs on every selection change and
   costs five writes.

   THE GAP PAYS FOR THE STAGE, and 9 is measured rather than chosen. Four shut rows and one open came
   to 396 authored at a 14px gap — and to 410 PAINTED, because a row is rolled -1.2deg about its left
   edge and a 660-wide row therefore drops 13.8px at its right end. At 9 the tallest arrangement
   paints 385 against a 384 stage.
   ================================================================================================== */
const ST_ROW_H = 40
const ST_GAP = 9
/** the open height is set by which figure the row carries — a due badge is taller than a gauge */
const ST_H = { gauge: 118, due: 126, fig: 122 } as const
/* CENTRED IN THE STAGE, NOT IN THE FRAME. The tallest arrangement — four shut and the tallest open
   — is centred against the stage's 192..576 band, and the shorter ones hang from that same line. */
const ST_STACK = 4 * (ST_ROW_H + ST_GAP) + Math.max(...Object.values(ST_H))
const ST_TOP = 192 + Math.round((384 - ST_STACK) / 2)

/** twelve segments, because that is what the gauge is made of */
const SEGMENTS = Array.from({ length: 12 }, (_, k) => k)

function useClock(): { time: string; date: string } {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    /* on the minute, not every second: nothing on this bar shows seconds, and a 1Hz setState on the
       front door would re-render the menu sixty times for every one thing that changed */
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const day = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()]
  return { time: `${hh}:${mm}`, date: `${now.getMonth() + 1}/${now.getDate()} ${day}` }
}

export function MenuL1({ controller, hero, crown, rows, onOpenSection, onRunHero }: MenuL1Props) {
  const { active, setActive, step, isLocked, gateOf } = controller
  const { time, date } = useClock()
  /* opening a row pushes every row below it down past a stationary pointer, whose `mouseenter`
     would then drag the selection back -- the same fight the road has. See `useHoverPick`. */
  const hover = useHoverPick(setActive)

  /* WHAT A LOCKED ROW IS WAITING FOR, read off `domain/feature_catalog.py` rather than restated
     here. The section carries only the feature id now; the milestone and whether it must be
     MASTERED or merely REACHED both come from the same call that decided the row was shut. */
  const lockLine = (section: MenuSection): string | null => {
    const gate = section.gate ? gateOf(section.gate.feature) : null
    return gate ? `${gate.en} · ${gate.word}` : null
  }
  /* AND THE SHUT ROW'S TOKEN IS THE SHORT FORM OF IT. A locked row has two places that say what it
     is waiting for -- the token on the right, which is all you see shut, and the state line, which
     only opens. Given the same sentence they printed it twice, a centimetre apart. This is the
     mockup's own split: `lockTok` there turns "reach GRAMMAR on the path" into "GRAMMAR FIRST" and
     leaves the full sentence to the line underneath.

     THE MILESTONE ALONE, THOUGH, BECAUSE THIS CURRICULUM'S NAMES ARE LONGER THAN THE MOCKUP'S. The
     token sits in a 330-wide shut card and holds about twelve characters before it clips; the
     mockup's "GRAMMAR" left room for FIRST and the real node is GRAMMAR N5, which did not --
     measured on screen as `GRAMMAR N5 F` with the rest cut off. The name is the part that carries
     the information, so the name is the part that stays. */
  const lockTok = (section: MenuSection): string => {
    const gate = section.gate ? gateOf(section.gate.feature) : null
    return gate ? gate.en : 'LOCKED'
  }
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
      frameRef.current?.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  /* THE ARROWS BELONG TO THE MENU WHILE THE MENU IS THE SCREEN. Bound on the root rather than the
     window so the keys stop at this subtree -- the app has its own arrow handling inside a study
     session, and a menu that quietly ate those would be worse than one with no keyboard at all. */
  /* THE SCREEN TAKES FOCUS WHEN IT ARRIVES, or its own arrow keys do nothing. The listener below
     is on this subtree rather than on the window — deliberately, so the menu never eats the arrows
     a study session needs — but a subtree only receives keydown when focus is inside it, and after
     a click on the level above, focus is on <body>. Measured live: two ArrowDowns moved the cursor
     nowhere at all. `tabIndex={-1}` makes the container focusable without putting it in the tab
     order, which is the same thing a dialog does. */
  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); hover.keyed(); step(1) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); hover.keyed(); step(-1) }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [step, hover])

  const ordered = useMemo(() => [...MENU_SECTIONS].sort((a, b) => a.ord - b.ord), [])

  /* the solve: every row's top is the sum of the heights above it, walked in reading order */
  const placed = useMemo(() => {
    let y = ST_TOP
    return ordered.map((section, index) => {
      const open = index === active
      const height = open ? ST_H[rows[section.key].kind] : ST_ROW_H
      const top = y
      y += height + ST_GAP
      return { section, index, open, top, height }
    })
  }, [ordered, active, rows])

  const heroOn = active === HERO_INDEX
  const xpPct = crown.xpForLevel ? Math.round(((crown.xpInLevel ?? 0) / crown.xpForLevel) * 100) : 0

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>

        {/* ---- the brand, top left ---- */}
        <header className="brand">
          <div className="brand-seal">
            <svg className="brand-crane" viewBox="18 20 228 154" aria-hidden="true">
              <path d="M116 120 L 178 26 L 196 122 Z" fill="#ffffff" />
              <path d="M134 112 L 218 56 L 200 122 Z" fill="#b8ada0" />
              <path d="M96 128 L 126 102 L 184 134 L 130 170 Z" fill="#f2ead8" />
              <path d="M180 138 L 238 164 L 170 162 Z" fill="#f2ead8" />
              <path d="M50 36 L 70 42 L 130 110 L 94 140 Z" fill="#f2ead8" />
              <path d="M26 54 L 58 42 L 56 58 Z" fill="#b8ada0" />
            </svg>
          </div>
          <div className="brand-col">
            <div className="brand-lat2">JPLEARN</div>
            <div className="brand-jp2">日本語学習</div>
          </div>
        </header>

        {/* ---- the four claims, top right ---- */}
        <div className="stats">
          <span className="stat-chip">{time}</span>
          <span className="stat-chip">{date}</span>
          {crown.streakDays != null && crown.streakDays > 0 ? (
            <span className="stat-chip shu">
              <b>{crown.streakDays}</b> DAY STREAK <span className="jp">連続</span>
            </span>
          ) : (
            <span className="stat-chip"><span className="mut">NO STREAK YET</span></span>
          )}
          {crown.level != null ? (
            <span className="stat-chip">
              <span>Lv</span> <b>{crown.level}</b>
              <span className="xp-track"><i style={{ width: `${xpPct}%` }} /></span>
            </span>
          ) : null}
        </div>

        {/* ---- level one ---- */}
        <div className="mn-standing">

          <button
            type="button"
            className={heroOn ? 'st-hero on' : 'st-hero'}
            onMouseEnter={() => hover.pick(HERO_INDEX)}
            onFocus={() => hover.pick(HERO_INDEX)}
            onClick={() => (heroOn ? onRunHero() : setActive(HERO_INDEX))}
          >
            <span className="sh-cap"><b>{hero.cap}</b><i>{hero.capJp}</i></span>
            <span className="sh-body">
              <span className="sh-fig">
                <b>{hero.fig}</b>
                <span><em>{hero.figEm}</em><i>{hero.figLab}</i></span>
              </span>
              <span className="sh-why">{hero.why}</span>
            </span>
            <span className="sh-meta"><s>{hero.metaLeft}</s><span>{hero.metaRight}</span></span>
            <span className="sh-slab">{heroOn ? `${hero.act} · ENTER ▸` : hero.act}</span>
          </button>

          {placed.map(({ section, index, open, top, height }) => {
            const row = rows[section.key]
            const locked = isLocked(section)
            const classes = ['st-row']
            if (open) classes.push('is-open')
            if (locked) classes.push('is-locked')
            /* rows further from the one you opened start later, so the column settles outward from
               the selection rather than snapping as one block */
            const lag = Math.min(Math.abs(index - active), 4) * 26
            const on = Math.round((12 * row.pct) / 100)
            return (
              <div
                key={section.key}
                className={classes.join(' ')}
                style={{
                  ['--top' as string]: `${top}px`,
                  ['--h' as string]: `${height}px`,
                  ['--lag' as string]: `${lag}ms`,
                  ['--i' as string]: index,
                  ['--acc' as string]: section.accent,
                }}
              >
                <div className="st-in">
                  <button
                    type="button"
                    className="st-card"
                    onMouseEnter={() => hover.pick(index)}
                    onFocus={() => hover.pick(index)}
                    /* HOVER OPENS, A CLICK ON THE OPEN ONE GOES. Pointing is not choosing, so a
                       mouse never enters a section it only crossed. */
                    onClick={() => {
                      if (active !== index) { setActive(index); return }
                      if (!locked) onOpenSection(section.key)
                    }}
                    aria-disabled={locked}
                    aria-label={locked
                      ? `${section.label} — locked, ${lockLine(section) ?? 'not open yet'}`
                      : `${section.label} — ${row.lab}, ${row.val}`}
                  >
                    <span className="st-mark">
                      <span className="st-glyph" aria-hidden="true">{section.glyph}</span>
                      <b className="st-no" aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>
                    </span>
                    <span className="st-body">
                      <span className="st-head">
                        <span className="st-en">{section.label}</span>
                        <span className="st-jp">{section.jp}</span>
                        <span className="st-tok">
                          {locked ? lockTok(section) : row.tok}
                        </span>
                      </span>
                      <span className="st-detail">
                        <span className="st-state">
                          <b>{locked ? 'OPENS WHEN YOU' : row.lab}</b>
                          <i>{locked ? (lockLine(section) ?? 'GET FURTHER') : row.val}</i>
                        </span>
                        <span className="st-fig on">
                          {row.kind === 'gauge' ? (
                            <>
                              <span className="st-segs">
                                {SEGMENTS.map((k) => (
                                  <i
                                    key={k}
                                    className={open && k < on ? 'on' : undefined}
                                    style={{ ['--d' as string]: `${160 + k * 26}ms` }}
                                  />
                                ))}
                              </span>
                              <b className="st-pct">{row.pct}%</b>
                            </>
                          ) : row.kind === 'due' ? (
                            <>
                              <b className="st-due">{row.due}</b>
                              <span className="st-figlab">{row.figLab}</span>
                            </>
                          ) : (
                            <>
                              <b className="st-fign">{row.fig}</b>
                              <span className="st-figlab">{row.figLab}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="st-slab">{locked ? 'LOCKED 施錠' : row.slab}</span>
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* ---- the keys, bottom right ---- */}
        <div className="hints">
          <span><b>↑↓</b>Select<em>選択</em></span>
          <span><b>ENTER</b>Confirm<em>決定</em></span>
          <span><b>/</b>Look up<em>辞書</em></span>
        </div>
      </div>
    </div>
  )
}
