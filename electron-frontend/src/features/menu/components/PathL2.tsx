import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProgressionNodeView } from '../../progression'
import { hereIndex, pathRows, reachIndex, runWindow, stepNameSize } from '../pathL2'
import type { PathRow } from '../pathL2'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
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
   THE PATH, LEVEL TWO — THE RUN AS A LEDGER. See the note above `.pa-run` in `menu.css` for why
   this shape and not the two before it.

   ONE COLUMN OF THIN ROWS AND ONE VERY LARGE THING, which is the front door's composition and the
   only one in this app that has never been sent back. The rows are the run — six of the sixteen,
   travelling with the cursor — and the step you are on is set at 104px on the open valley beside
   them, with the gauge, the gate and the action hanging off it.

   BROWSING CAME BACK, WITHIN THE RULE. The chain offered exactly one thing and nothing else; the
   road offered all sixteen including ten that could only refuse. This offers what is genuinely
   choosable: everything up to `reachIndex` — the finished steps, revisitable, and the open one or
   two at the frontier. The arrows walk that range and the window follows them.
   ================================================================================================== */

/** what a row's right-hand word says, which is the only place a step's state is named */
function stateWord(row: PathRow, open: boolean): string {
  if (row.state === 'done') return '済 DONE'
  return open ? 'OPEN NOW' : 'SHUT'
}

export function PathL2({ nodes, loading, onOpenNode, onUp }: PathL2Props) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const run = useMemo(() => pathRows(nodes), [nodes])
  const here = useMemo(() => hereIndex(run), [run])
  const reach = useMemo(() => Math.max(here, reachIndex(run)), [run, here])

  const [cursor, setCursor] = useState<number | null>(null)
  const at = Math.max(0, Math.min(cursor ?? here, reach))
  const view = useMemo(() => runWindow(run, at), [run, at])
  const sel = run[at]

  /* the walk lives in a ref for the same reason the door does: the listener is bound once and
     must not be re-subscribed on every keypress */
  const walkRef = useRef({ at: 0, reach: 0 })
  walkRef.current = { at, reach }

  const openRef = useRef<() => void>(() => {})
  openRef.current = () => {
    if (!sel) return
    /* A STEP WITH NOWHERE TO GO IS THE GENUINELY SILENT CASE, and the slab beside it already reads
       NOT BUILT YET. Everything else goes through `onOpenNode`, which owns the curriculum's own
       soft gate and its confirmation. */
    if (!sel.goesTo) { refuse(); return }
    onOpenNode(sel.id)
  }

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    node.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      const walk = (d: 1 | -1) => {
        event.preventDefault()
        const { at: from, reach: last } = walkRef.current
        setCursor(Math.max(0, Math.min(from + d, last)))
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') walk(1)
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') walk(-1)
      else if (event.key === 'Enter') { event.preventDefault(); openRef.current() }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [])

  const done = run.filter((row) => row.state === 'done').length
  const name = sel ? (sel.jp || sel.en) : ''
  const dest = sel?.goesTo ?? ''
  const revisiting = sel?.state === 'done'
  const pct = revisiting ? 100 : Math.max(0, sel?.pct ?? 0)
  const want = sel?.want ? sel.want.toUpperCase() : ''

  return (
    /* the root says which chain this is -- the deck screen wears `dk-blocks` for the same reason */
    <div className={screenClass(entered, 'pa-course')} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('STUDY', null)} />

        {/* an absence is drawn as an absence, and "still reading" is not the same absence as
            "answered with nothing" — a course with no steps in it must say which */}
        {!run.length ? (
          <div className="pj-empty">
            {loading
              ? 'READING THE CURRICULUM…'
              : 'THE CURRICULUM DID NOT ANSWER · NOTHING TO WALK YET'}
          </div>
        ) : null}

        {run.length ? (
          <>
            <div className="pa-run">
              {view.behind ? (
                <div className="pa-fold">
                  <b>{view.behind}</b>
                  <i>{view.behind === 1 ? 'STEP BEHIND THESE' : 'STEPS BEHIND THESE'}</i>
                </div>
              ) : null}

              {view.rows.map((row, i) => {
                const index = view.behind + i
                const open = index <= reach
                const classes = ['pa-row']
                if (row.state === 'done') classes.push('done')
                if (index === at) classes.push('on')
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={classes.join(' ')}
                    onFocus={() => setCursor(Math.min(index, reach))}
                    onClick={() => (index === at ? openRef.current() : setCursor(Math.min(index, reach)))}
                    aria-disabled={!open}
                    aria-label={`${row.no} ${row.en} — ${stateWord(row, open).replace('済 ', '')}`}
                  >
                    <span className="n">{row.no}</span>
                    <span className="t">
                      <b lang="ja">{row.jp || row.en}</b>
                      <i>{row.en}</i>
                    </span>
                    <span className="s">{stateWord(row, open)}</span>
                  </button>
                )
              })}

              {view.ahead ? (
                <div className="pa-fold">
                  <b>{view.ahead}</b>
                  <i>{view.ahead === 1 ? 'MORE STEP AHEAD OF YOU' : 'MORE STEPS AHEAD OF YOU'}</i>
                </div>
              ) : null}
            </div>

            {sel ? (
              <div className="pa-here">
                <span className="pa-kick">
                  {revisiting ? 'ALREADY DONE' : at === here ? 'YOU ARE HERE' : 'ALSO OPEN'}
                  {` · STEP ${sel.no} OF ${run.length}`}
                </span>
                <span className="pa-name" lang="ja" style={{ fontSize: stepNameSize(name) }}>
                  {name}
                </span>
                <span className="pa-sub">
                  <b>{sel.en}</b>
                  <i>{dest === 'A DECK' ? 'STUDIED HERE, IN BLOCKS'
                    : dest ? `LIVES IN ${dest}` : 'NOT BUILT YET'}</i>
                </span>

                {/* TWELVE COUNTED STEPS, not a smooth bar: a gate is a count and a bar invites
                    reading a precision off it that nobody promised. */}
                <span className="pa-gauge">
                  <span className="pa-segs">
                    {Array.from({ length: 12 }, (_, k) => (
                      <i key={k} className={k < Math.round((pct / 100) * 12) ? 'got' : ''} />
                    ))}
                  </span>
                  <b>{pct}%</b>
                </span>

                <span className="pa-gate">
                  {revisiting ? 'ALREADY DONE · NOTHING AHEAD MOVES'
                    : want ? <>WANTS <em>{want}</em> BEFORE THE NEXT STEP OPENS</>
                      : 'NOTHING TO CLEAR'}
                </span>

                <button
                  type="button"
                  className="pa-go"
                  data-live={dest ? '1' : '0'}
                  onClick={() => openRef.current()}
                >
                  {/* NOWHERE TO GO IS CHECKED FIRST. A finished step with no destination read
                      STUDY IT AGAIN and then refused the press -- the slab has to say the true
                      thing before it says the encouraging one. */}
                  <em>{!dest ? 'NOTHING TO OPEN'
                    : revisiting ? `STEP ${sel.no}` : 'THE ONLY WAY ON'}</em>
                  <b>
                    {!dest ? 'NOT BUILT YET'
                      : revisiting ? 'STUDY IT AGAIN'
                        : dest === 'A DECK' ? 'OPEN ITS BLOCKS' : `GO TO ${dest}`} ▸
                  </b>
                </button>
              </div>
            ) : null}

            <div className="pa-strip">
              <span className="cap">STEP 01</span>
              <span className="pa-ticks">
                {run.map((row) => (
                  <i
                    key={row.id}
                    className={row.state === 'done' ? 'done' : row.state === 'here' ? 'here' : ''}
                    title={`${row.no} ${row.en}`}
                  />
                ))}
              </span>
              <span className="cap">
                {run.length} STEPS · {done} DONE · {Math.round((done / run.length) * 100)}%
              </span>
            </div>
          </>
        ) : null}

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>↑ ↓</b>Walk<em>歩く</em></span>
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
