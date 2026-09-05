import { useEffect, useMemo, useRef, useState } from 'react'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import { ScreenHead } from './ScreenHead'
import { screenHead } from '../chrome'
import { dailyNote, dailyRows } from '../daily'
import { getDefaultDailyGamesSessionDependencies, useDailyGames } from '../../daily-games'
import type { DailyGameType, DailyGamesSessionDependencies } from '../../daily-games'
import '../menu.css'

/* ==================================================================================================
   THE DAILY ROAD — see `daily.ts` for why this replaces a screen rather than redrawing one.

   IT WEARS `.pa-*` AND ADDS NOTHING. Four rows instead of sixteen and no fold, because four fit;
   the hero plate, the gauge, the gate line and the slab are the curriculum road's own, and the only
   thing this file decides is which words go in them. A second set of classes for the same object is
   how one object becomes two.
   ================================================================================================== */

export interface DailyProps {
  /** a puzzle you have not done today opens as today's; one you have opens as practice */
  onPlay: (type: DailyGameType, mode: 'daily' | 'practice') => void
  onUp: () => void
  /** injected by the tests; the app takes the real bridge */
  dependencies?: DailyGamesSessionDependencies
}

/* THE DAY IS READ HERE RATHER THAN IN `App`, because `useDailyGames` fetches on mount and App
   mounts on every boot -- a bridge call at startup for a screen most sessions never open. This
   component only exists while the road is on screen. */
export function Daily({ onPlay, onUp, dependencies }: DailyProps) {
  const deps = useMemo(
    () => dependencies ?? getDefaultDailyGamesSessionDependencies(),
    [dependencies],
  )
  const { data, error, isLoading: loading, retry } = useDailyGames(deps)
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)

  const rows = dailyRows(data)
  const sel = rows[Math.min(at, rows.length - 1)] ?? null
  const empty = !loading && !error && (data?.pool.words.length ?? 0) === 0

  const open = useRef(() => {})
  open.current = () => {
    if (!sel || empty || !data) return
    onPlay(sel.type, sel.done ? 'practice' : 'daily')
  }

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        setAt((n) => Math.min(n + 1, 3))
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setAt((n) => Math.max(0, n - 1))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        open.current()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [])

  const done = rows.filter((row) => row.done).length
  /* A PUZZLE YOU HAVE NOT PLAYED HAS NO PER-CENT, and nought is not the same statement. The gauge
     draws empty either way; the line under it is what tells the two apart. */
  const pct = sel?.pct ?? 0

  return (
    <div className={screenClass(entered, 'pa-course')} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead
          head={screenHead('DRILLS', 'daily')}
          note={loading ? '日課 · READING TODAY’S SET…' : dailyNote(rows, data)}
        />

        {error ? (
          <div className="pj-empty" role="alert">
            {error}
            <button type="button" className="pa-retry" onClick={retry}>TRY AGAIN</button>
          </div>
        ) : null}

        {empty ? (
          <div className="pj-empty">
            NOTHING IN TODAY&apos;S POOL YET · STUDY A DECK AND THE PUZZLES BUILD THEMSELVES
          </div>
        ) : null}

        {!error ? (
          <>
            <div className="pa-run">
              {rows.map((row, i) => {
                const classes = ['pa-row']
                if (row.done) classes.push('done')
                if (i === at) classes.push('on')
                return (
                  <button
                    key={row.type}
                    type="button"
                    className={classes.join(' ')}
                    onFocus={() => setAt(i)}
                    onClick={() => (i === at ? open.current() : setAt(i))}
                    aria-label={`${row.no} ${row.en} — ${row.done ? 'done today' : 'not played today'}`}
                  >
                    <span className="n">{row.no}</span>
                    <span className="t">
                      <b lang="ja">{row.jp}</b>
                      <i>{row.en}</i>
                    </span>
                    <span className="s">{row.done ? '済 DONE' : 'OPEN'}</span>
                  </button>
                )
              })}
            </div>

            {sel ? (
              <div className="pa-here">
                <span className="pa-kick">
                  {sel.done ? 'ALREADY DONE TODAY' : 'NOT PLAYED TODAY'}
                  {` · PUZZLE ${sel.no} OF ${rows.length}`}
                </span>
                <span className="pa-name" lang="ja">{sel.jp}</span>
                <span className="pa-sub">
                  <b>{sel.en}</b>
                  <i>{sel.count || 'NO ATTEMPT TODAY'}</i>
                </span>

                <span className="pa-gauge">
                  <span className="pa-segs">
                    {Array.from({ length: 12 }, (_, k) => (
                      <i key={k} className={k < Math.round((pct / 100) * 12) ? 'got' : ''} />
                    ))}
                  </span>
                  <b>{sel.pct === null ? '—' : `${sel.pct}%`}</b>
                </span>

                <span className="pa-gate">
                  {sel.done
                    ? <>PLAYING IT AGAIN <em>CHANGES NOTHING</em> — TODAY IS ALREADY COUNTED</>
                    : sel.want}
                </span>

                <button
                  type="button"
                  className="pa-go"
                  data-live={empty || !data ? '0' : '1'}
                  onClick={() => open.current()}
                >
                  <em>{empty || !data ? 'NOTHING TO OPEN' : sel.done ? 'PRACTICE' : "TODAY'S"}</em>
                  <b>
                    {empty || !data ? 'NO POOL TODAY'
                      : sel.done ? 'PLAY IT AGAIN' : 'OPEN THIS GAME'} ▸
                  </b>
                </button>
              </div>
            ) : null}

            <div className="pa-strip">
              <span className="cap">PUZZLE {sel?.no ?? '01'}</span>
              <span className="pa-ticks">
                {rows.map((row, i) => (
                  <i
                    key={row.type}
                    className={row.done ? 'done' : i === at ? 'here' : ''}
                    title={`${row.no} ${row.en}`}
                  />
                ))}
              </span>
              <span className="cap">{rows.length} GAMES · {done} DONE</span>
            </div>
          </>
        ) : null}

        <div className="back-tab">
          <button type="button" onClick={onUp} aria-label="Back to practice">
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>↑ ↓</b>Select<em>選択</em></span>
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
