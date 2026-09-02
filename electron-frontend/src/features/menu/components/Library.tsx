import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bandOf, libVeil, libraryBands, libraryNote, libraryWindow, shelfLayout, type LibraryRow,
} from '../library'
import { useHoverPick } from '../useHoverPick'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface LibraryProps {
  rows: readonly LibraryRow[]
  loading: boolean
  onOpen: (id: string) => void
  onUp: () => void
}

/* ==================================================================================================
   THE LIBRARY — lifted from the mockup, minus the one thing this app does not know.

   The first port drew a flat list of six equal rows. The mockup's shelf is a WINDOW OVER THIRTY with
   the selected row twice the height of the others, distance painted as dusk over the paper rather
   than as fading, a band plate pinned to the top edge naming the grade you are standing in, and the
   whole shelf as a strip of bars underneath.

   WHAT IS DELIBERATELY MISSING IS THE PROGRESS. The mockup's row carried "HOW FAR YOU GOT" with a
   percentage track, because its library remembered. `usePassages` keeps its progress map in
   component state and nothing persists it, so between visits this app knows nothing about what you
   have read. Thirty empty tracks would be thirty claims that you have read none of them, which is a
   different statement from the app not keeping the answer -- so the row's state slot says which,
   once, and the caption says it for the shelf.
   ================================================================================================== */
export function Library({ rows, loading, onOpen, onUp }: LibraryProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)
  const cursor = Math.min(at, Math.max(0, rows.length - 1))
  const view = libraryWindow(rows, cursor)
  const hover = useHoverPick(setAt)

  const bands = useMemo(() => libraryBands(rows), [rows])
  const band = bands[bandOf(bands, cursor)] ?? null
  const shelf = useMemo(
    () => shelfLayout(view.rows.length, view.cursorInWindow),
    [view.rows.length, view.cursorInWindow],
  )


  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault(); hover.keyed()
        setAt((i) => Math.min(i + 1, rows.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault(); hover.keyed()
        setAt((i) => Math.max(i - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const row = rows[cursor]
        if (row) onOpen(row.id)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [cursor, rows, onOpen, hover])

  const total = shelf.length ? shelf[shelf.length - 1].top + shelf[shelf.length - 1].height : 0

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('READING', 'library')} />
        <div className="library">
          <div className="lb-view">
            <div className="lb-rail" style={{ height: total }}>
              {view.rows.map((row, i) => {
                const isSel = i === view.cursorInWindow
                const place = shelf[i]
                /* the leading edge leans with the row's own height, so a tall row leans further */
                const lean = Math.round(place.height * 0.1405)
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={isSel ? 'lb-row on' : 'lb-row'}
                    style={{
                      top: place.top,
                      height: place.height,
                      zIndex: isSel ? 12 : 4,
                      transform: `scale(${Math.max(0.9, 1 - Math.min(Math.abs(i - view.cursorInWindow), 6) * 0.016)})`,
                      ['--veil' as string]: libVeil(Math.abs(i - view.cursorInWindow)),
                    }}
                    onMouseEnter={() => hover.pick(view.above + i)}
                    onFocus={() => hover.pick(view.above + i)}
                    onClick={() => (isSel ? onOpen(row.id) : setAt(view.above + i))}
                    aria-label={`${row.title} by ${row.author} — ${row.words} words, about ${row.minutes} minutes`}
                  >
                    <span
                      className="lb-mark"
                      style={{
                        clipPath: `polygon(0 0,100% 0,calc(100% - ${lean}px) 100%,0 100%)`,
                        paddingRight: Math.round(lean / 2),
                      }}
                    >
                      <b>{row.minutes}</b><em>MIN</em>
                    </span>
                    <span className="lb-body">
                      <span className="lb-titles">
                        <b className="lb-jp">{row.title}</b>
                        <i className="lb-en">{row.author}</i>
                        <i className="lb-words">{row.words.toLocaleString()} words</i>
                      </span>
                      {/* THE DETAIL LINE IS IN EVERY ROW AND SHOWN ON ONE, so the row it opens on
                          has something to animate from rather than being rebuilt into place. */}
                      <span className="lb-detail">
                        <i className="read">{row.grade.toUpperCase()}</i><s />
                        <i>{row.words.toLocaleString()} WORDS</i><s />
                        <i className="new">≈{row.minutes} MIN ALOUD</i>
                      </span>
                    </span>
                    <span className="lb-state">
                      <em>HOW FAR YOU GOT</em>
                      {/* the app does not keep this between visits, so the slot says so rather
                          than drawing an empty track that would read as "none of it" */}
                      <b style={{ color: 'rgba(20,17,13,0.42)' }}>NOT KEPT</b>
                      <span className="lb-track"><i style={{ width: 0 }} /></span>
                    </span>
                    <i
                      className="lb-slab"
                      style={{
                        clipPath: `polygon(${lean}px 0,100% 0,100% 100%,0 100%)`,
                        paddingLeft: 16 + lean,
                      }}
                    >
                      <b>BEGIN READING ▸</b><b className="key">ENTER</b>
                    </i>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ONE BAND MARKER, PINNED TO THE STAGE'S TOP EDGE. With six rows on screen there is one
              band worth naming, so it is simply put there rather than riding the rail. */}
          <div className="lb-heads">
            {band ? (
              <div className="lb-head here" style={{ top: 0, opacity: 1 }}>
                <i
                  className="lb-rule"
                  style={{
                    height: 3,
                    background: 'linear-gradient(90deg,rgba(0,0,0,0) 0,var(--gold) 15%,'
                      + 'var(--gold) 85%,rgba(0,0,0,0) 100%)',
                  }}
                />
                {/* AND THE PLATE IS A DOOR TO ITS OWN BAND. It names a run of texts and gives
                    its size; pressing it goes to the first of them, which is the only thing it
                    could sensibly mean and was the only thing it did not do. */}
                <button
                  type="button"
                  className="lb-plate"
                  onClick={() => setAt(band.from)}
                  aria-label={`${band.name} — go to the first of ${band.to - band.from + 1} texts`}
                >
                  <b className="k">{band.kanji}</b>
                  <b className="n">{band.name}</b>
                  <i>{band.to - band.from + 1} TEXTS</i>
                </button>
              </div>
            ) : null}
          </div>

          <div className="lb-count up" style={{ opacity: view.above ? 1 : 0 }}>
            <b>{view.above}</b><span>ABOVE</span>
          </div>
          <div className="lb-count down" style={{ opacity: view.below ? 1 : 0 }}>
            <b>{view.below}</b><span>BELOW</span>
          </div>

          {/* ==================================================================================================
              AND THE SHELF IS A MAP, WHICH MEANS IT HAS TO BE PRESSABLE.

              This drew the whole shelf as thirty bars sized by their distance from the cursor -- a
              genuine minimap, showing where you are among thirty texts and where the grade bands
              fall -- and none of it did anything. A map you can read and not travel on is a diagram.

              On a shelf this long the strip is the only control that can cross it in one gesture:
              the rail steps one row at a time and holds six on screen, so reaching the far end is
              twenty-four presses or one click down here.
              ================================================================================================== */}
          <div className="lb-mini">
            <span className="lb-bars">
              {rows.map((row, i) => {
                const d = Math.abs(i - cursor)
                const newBand = i > 0 && rows[i - 1].grade !== row.grade
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="lb-bar"
                    onClick={() => setAt(i)}
                    aria-label={`Go to ${row.title}`}
                    style={{
                      width: d === 0 ? 13 : d === 1 ? 10 : d === 2 ? 8 : d <= 4 ? 7 : 6,
                      height: d === 0 ? 20 : d === 1 ? 15 : d === 2 ? 12 : d <= 4 ? 10 : 8,
                      background: 'rgba(242,234,216,0.26)',
                      boxShadow: i === cursor ? '0 0 0 2px var(--hi)' : 'none',
                      marginLeft: newBand ? 11 : undefined,
                    }}
                  />
                )
              })}
            </span>
            <span className="lb-tally">
              <span>{loading ? 'COUNTING THE SHELF' : libraryNote(rows)}</span>
              <s>·</s>
              <u>WHAT YOU READ IS NOT KEPT BETWEEN VISITS</u>
            </span>
          </div>
        </div>

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>↑↓</b>Choose<em>選択</em></span>
          <span><b>ENTER</b>Read<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
