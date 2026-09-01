import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { libraryNote, libraryWindow, type LibraryRow } from '../library'
import '../../../styles/stage.css'
import '../menu.css'

export interface LibraryProps {
  rows: readonly LibraryRow[]
  loading: boolean
  onOpen: (id: string) => void
  onUp: () => void
}

export function Library({ rows, loading, onOpen, onUp }: LibraryProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)
  const view = libraryWindow(rows, Math.min(at, Math.max(0, rows.length - 1)))

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
      if (event.key === 'ArrowDown') { event.preventDefault(); setAt((i) => Math.min(i + 1, rows.length - 1)) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
      else if (event.key === 'Enter') {
        event.preventDefault()
        const row = rows[at]
        if (row) onOpen(row.id)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, rows, onOpen])

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>読解</b><i>THE LIBRARY</i>
          <s>{loading ? 'COUNTING THE SHELF' : libraryNote(rows)}</s>
        </div>

        {/* NOTHING SCROLLS; THE WINDOW MOVES and the ends say how many are folded away. */}
        {view.above > 0 ? <div className="lb-fold up">▲ {view.above} EASIER</div> : null}

        <div className="lb-rail">
          {view.rows.map((row, i) => (
            <button
              key={row.id}
              type="button"
              className={i === view.cursorInWindow ? 'lb-row on' : 'lb-row'}
              onFocus={() => setAt(view.above + i)}
              onClick={() => onOpen(row.id)}
              aria-label={`${row.title} by ${row.author} — ${row.words} words, about ${row.minutes} minutes`}
            >
              <span className="lb-mark"><b>{row.minutes}</b><em>MIN</em></span>
              <span className="lb-body">
                <b className="lb-jp">{row.title}</b>
                <i className="lb-by">{row.author}</i>
              </span>
              <span className="lb-words">{row.words.toLocaleString()} WORDS</span>
              <span className="lb-slab">
                {i === view.cursorInWindow ? 'BEGIN READING · ENTER ▸' : 'BEGIN READING'}
              </span>
            </button>
          ))}
        </div>

        {view.below > 0 ? <div className="lb-fold down">▼ {view.below} HARDER</div> : null}

        {/* SAID ONCE, RATHER THAN AS THIRTY EMPTY TRACKS. An empty progress bar on every row would
            be thirty claims that you have read none of them, which is a different statement from
            the app not keeping the answer. */}
        <div className="lb-note">
          読解 · EASIEST FIRST — WHAT YOU READ IS NOT KEPT BETWEEN VISITS
        </div>
        <button type="button" className="pj-back" onClick={onUp}>← THE WORLD</button>
        <div className="mn-hint">↑ ↓ CHOOSE · ENTER OPENS · ESC GOES BACK</div>
      </div>
    </div>
  )
}
