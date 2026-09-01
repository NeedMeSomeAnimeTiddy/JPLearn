import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ProgressionNodeView } from '../../progression'
import { hereIndex, pathRows, pathWindow } from '../pathL2'
import '../../../styles/stage.css'
import '../menu.css'

export interface PathL2Props {
  nodes: readonly ProgressionNodeView[]
  loading: boolean
  /** the same pair the progression map uses, so soft-gating and its confirm come for free */
  onOpenNode: (nodeId: string) => void
  onUp: () => void
}

export function PathL2({ nodes, loading, onOpenNode, onUp }: PathL2Props) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const rows = useMemo(() => pathRows(nodes), [nodes])

  /* the cursor starts where the learner actually is, not at the top -- opening the journey on
     step one when you are on step nine would be starting a story you are halfway through */
  const [cursor, setCursor] = useState<number | null>(null)
  const at = cursor ?? hereIndex(rows)

  useEffect(() => {
    if (cursor === null && rows.length) setCursor(hereIndex(rows))
  }, [cursor, rows])

  useLayoutEffect(() => {
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
      frameRef.current?.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

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
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor((c) => Math.min((c ?? at) + 1, rows.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCursor((c) => Math.max((c ?? at) - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const row = rows[at]
        if (row) onOpenNode(row.id)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, rows, onOpenNode])

  const win = pathWindow(rows, at)
  const done = rows.filter((r) => r.state === 'done').length

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>道</b><i>THE PATH</i>
          <s>{loading && !rows.length
            ? 'READING THE CURRICULUM…'
            : `${done} OF ${rows.length} MILESTONES BEHIND YOU`}</s>
        </div>

        {/* an absence is drawn as an absence: no curriculum is not an empty list */}
        {!loading && !rows.length ? (
          <div className="pj-empty">THE CURRICULUM DID NOT ANSWER · NOTHING TO WALK YET</div>
        ) : null}

        <div className="pj-list">
          {win.behind > 0 ? <div className="pj-fold">▲ {win.behind} BEHIND</div> : null}

          {win.rows.map((row, index) => {
            const isCursor = index === win.cursorInWindow
            const classes = ['pj-row', `is-${row.state}`]
            if (isCursor) classes.push('on')
            if (!row.isOpen) classes.push('shut')
            return (
              <button
                key={row.id}
                type="button"
                className={classes.join(' ')}
                onFocus={() => setCursor(win.behind + index)}
                onClick={() => onOpenNode(row.id)}
                aria-label={`${row.no} ${row.en}${row.isOpen ? '' : ' — not open yet'}`}
              >
                <span className="pj-no">{row.no}</span>
                <span className="pj-name">
                  <span className="pj-en">{row.en}</span>
                  <span className="pj-jp">{row.jp}</span>
                </span>
                <span className="pj-want">
                  {row.state === 'done' ? 'DONE' : row.want || '—'}
                  {row.isOverridden ? ' · OPENED EARLY' : ''}
                </span>
                <span className="pj-bar" aria-hidden="true">
                  <i style={{ width: `${row.pct}%` }} />
                </span>
                <span className="pj-figs">
                  <b>{row.count || `${row.pct}%`}</b>
                  <em>{row.goesTo || 'STEP'}</em>
                </span>
              </button>
            )
          })}

          {win.ahead > 0 ? <div className="pj-fold">▼ {win.ahead} AHEAD</div> : null}
        </div>

        <button type="button" className="pj-back" onClick={onUp}>← THE MENU</button>
        <div className="mn-hint">↑ ↓ WALK · ENTER OPENS THE STEP · ESC GOES BACK</div>
      </div>
    </div>
  )
}
