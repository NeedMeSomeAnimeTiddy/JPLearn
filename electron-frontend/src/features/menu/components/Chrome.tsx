import { useEffect, useMemo, useRef, useState } from 'react'
import { type StatKey, statPanelsFrom } from '../statPanels'
import type { MenuCrown } from '../types'

/* ==================================================================================================
   THE CHROME, AND WHY IT IS NOT PART OF LEVEL ONE.

   The brand and the four claims were written inside `MenuL1` and lived exactly as long as the front
   door did: entering any section took them off the screen along with the rows. That is the interface
   telling you that you have left the app — nine of the thirteen screens had nothing in three of
   their four corners, no mark, no streak, no level, nothing to say what this was a screen OF.

   IN THE MOCKUP THEY ARE NOT PART OF ANY SCREEN. `.brand`, `.stats` and `.hints` are fixed elements
   outside `.hud` entirely, and the only thing that ever takes them away is `body.in-flight` — the
   camera leaving. That is the right structure and this is it: two components rendered by whatever is
   on screen, with one definition between them, so the streak on a deck screen and the streak on the
   front door can never be two different pieces of markup that have drifted.
   ================================================================================================== */

export function Brand() {
  return (
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
  )
}

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

export interface StatsProps {
  crown: MenuCrown
}

/** the four claims, top right, with what is behind each one — see `statPanels.ts` */
export function Stats({ crown }: StatsProps) {
  const { time, date } = useClock()
  const xpPct = crown.xpForLevel ? Math.round(((crown.xpInLevel ?? 0) / crown.xpForLevel) * 100) : 0

  const panels = useMemo(() => statPanelsFrom(crown), [crown])
  const [openStat, setOpenStat] = useState<StatKey | null>(null)
  /* WHERE THE PANEL HANGS, which is under the chip you pressed rather than under the bar. Measured
     off the chip's own offsets at the moment of the press: `.stats` is the positioned parent and is
     inside the zoomed frame, so these are design pixels and need no scale factor. */
  const [statRight, setStatRight] = useState(0)
  const statsRef = useRef<HTMLDivElement | null>(null)
  const toggleStat = (key: StatKey, el: HTMLElement) => {
    const bar = statsRef.current
    if (bar) setStatRight(Math.max(0, bar.clientWidth - el.offsetLeft - el.offsetWidth))
    setOpenStat((k) => (k === key ? null : key))
  }
  const openPanel = openStat ? panels[openStat] : null
  useEffect(() => {
    if (!openStat) return
    const away = () => setOpenStat(null)
    /* CAPTURE, because Escape here is already spoken for by the level above -- a panel that is open
       has to eat the key before the navigation sees it, or opening a chip and pressing Escape leaves
       the screen instead of closing the chip. */
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenStat(null); e.stopPropagation() }
    }
    window.addEventListener('click', away)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('click', away)
      window.removeEventListener('keydown', key, true)
    }
  }, [openStat])

  /* a chip with nothing behind it stays a chip: no button, no cursor, no empty panel */
  const chip = (key: StatKey, label: string, body: React.ReactNode) => {
    const panel = panels[key]
    if (!panel) return <span className="stat-chip">{body}</span>
    return (
      <button
        type="button"
        className={openStat === key ? 'stat-chip is-open' : 'stat-chip'}
        aria-expanded={openStat === key}
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); toggleStat(key, e.currentTarget) }}
      >
        {body}
      </button>
    )
  }

  return (
    <div className="stats" ref={statsRef}>
      <span className="stat-chip">{time}</span>
      {chip('week', 'This week', date)}
      {crown.streakDays != null && crown.streakDays > 0 ? (
        <button
          type="button"
          className={openStat === 'streak' ? 'stat-chip shu is-open' : 'stat-chip shu'}
          aria-expanded={openStat === 'streak'}
          aria-label={`Streak — ${crown.streakDays} days`}
          onClick={(e) => { e.stopPropagation(); toggleStat('streak', e.currentTarget) }}
        >
          <b>{crown.streakDays}</b> DAY STREAK <span className="jp">連続</span>
        </button>
      ) : (
        <span className="stat-chip"><span className="mut">NO STREAK YET</span></span>
      )}
      {crown.level != null ? (
        <button
          type="button"
          className={openStat === 'level' ? 'stat-chip is-open' : 'stat-chip'}
          aria-expanded={openStat === 'level'}
          aria-label={`Level ${crown.level}`}
          onClick={(e) => { e.stopPropagation(); toggleStat('level', e.currentTarget) }}
        >
          <span>Lv</span> <b>{crown.level}</b>
          <span className="xp-track"><i style={{ width: `${xpPct}%` }} /></span>
        </button>
      ) : null}

      {openPanel ? (
        <div
          className="stat-panel"
          style={{ right: `${statRight}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sp-h"><b>{openPanel.jp}</b><i>{openPanel.en}</i></div>
          {openPanel.rows.map((r) => (
            <div key={r.label} className={r.lead ? 'sp-r hi' : 'sp-r'}>
              <span>{r.label}</span><b>{r.value}</b>
            </div>
          ))}
          <div className="sp-n">{openPanel.note}</div>
        </div>
      ) : null}
    </div>
  )
}
