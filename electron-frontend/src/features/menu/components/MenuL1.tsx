import { useEffect, useLayoutEffect, useRef } from 'react'
import { HERO_INDEX, MENU_SECTIONS } from '../constants'
import type { MenuController, MenuCrown, MenuHero, MenuSectionKey } from '../types'
import '../../../styles/stage.css'
import '../menu.css'

export interface MenuL1Props {
  controller: MenuController
  hero: MenuHero
  crown: MenuCrown
  onOpenSection: (key: MenuSectionKey) => void
  onRunHero: () => void
}

/** rows are laid out down the stage from y248; 62 tall with 12 between */
const ROW_TOP = 248
const ROW_PITCH = 74

export function MenuL1({ controller, hero, crown, onOpenSection, onRunHero }: MenuL1Props) {
  const { active, setActive, step, isLocked } = controller
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
      if (event.key === 'ArrowDown') { event.preventDefault(); step(1) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); step(-1) }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [step])

  const ordered = [...MENU_SECTIONS].sort((a, b) => a.ord - b.ord)

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="mn-crown">
          {crown.streakDays != null && crown.streakDays > 0
            ? <><b>{crown.streakDays}</b><span>DAY STREAK</span></>
            : <span className="none">no streak yet — one session starts it</span>}
          {crown.level != null ? <><b>{crown.level}</b><span>LEVEL</span></> : null}
          {crown.xpInLevel != null && crown.xpForLevel
            ? <span>{crown.xpInLevel} / {crown.xpForLevel} XP</span>
            : null}
        </div>

        <button
          type="button"
          className={active === HERO_INDEX ? 'mn-hero on' : 'mn-hero'}
          onFocus={() => setActive(HERO_INDEX)}
          onClick={onRunHero}
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
          <span className="sh-slab">
            {active === HERO_INDEX ? `${hero.act} · ENTER ▸` : hero.act}
          </span>
        </button>

        <div className="mn-rows">
          {ordered.map((section, index) => {
            const locked = isLocked(section)
            const classes = ['mn-row']
            if (index === active) classes.push('on')
            if (locked) classes.push('locked')
            return (
              <div
                key={section.key}
                className={classes.join(' ')}
                style={{ top: ROW_TOP + index * ROW_PITCH }}
              >
                <button
                  type="button"
                  className="mn-card"
                  style={{ ['--acc' as string]: section.accent }}
                  onFocus={() => setActive(index)}
                  onClick={() => !locked && onOpenSection(section.key)}
                  aria-disabled={locked}
                  aria-label={locked
                    ? `${section.label} — locked, ${section.gate?.opens}`
                    : `${section.label} — ${section.desc}`}
                >
                  <span className="mn-mark">
                    <span className="mn-glyph" aria-hidden="true">{section.glyph}</span>
                    <span className="mn-no" aria-hidden="true">{section.ord}</span>
                  </span>
                  <span className="mn-body">
                    <span className="mn-head">
                      <span className="mn-en">{section.label}</span>
                      <span className="mn-jp">{section.jp}</span>
                    </span>
                    {locked
                      ? <span className="mn-lock">LOCKED · {section.gate?.opens}</span>
                      : <span className="mn-desc">{section.desc}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <div className="mn-hint">↑ ↓ MOVE · ENTER OPENS · / LOOK IT UP · , SETTINGS</div>
      </div>
    </div>
  )
}
