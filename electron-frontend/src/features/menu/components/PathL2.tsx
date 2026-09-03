import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProgressionNodeView } from '../../progression'
import { hereIndex, pathChain, pathRows } from '../pathL2'
import { chainPage } from '../chain'
import { Chain, ChainPile } from './Chain'
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
   THE PATH, LEVEL TWO — THE CHAIN, which is what the design draws and what this screen was not.

   IT WAS A ROAD OF SIXTEEN DOORS, and that is the shape the design system retired: "The road is no
   longer the shape of everything. It now carries the daily puzzles and nothing else, which is the
   one thing it is the right shape for." The plate for this screen -- `assets/screen-path.png`,
   filed as THE CHAIN -- is behind you / here / ahead with a proportional rail underneath, and its
   caption says why: "This replaced a browsable road of sixteen doors. Ten of those sixteen could
   only throw you at another section — a curriculum node is a milestone, not a door."

   WHAT THAT COSTS, STATED PLAINLY. You can no longer walk to step fourteen and press it. The
   sixteen were never sixteen choices: fifteen of them are either finished or shut, and the one
   that is neither is the frontier the curriculum put you on. The cleared ones come back through the
   pile, which is a grid and reaches any of them in two keys; the shut ones are named on the rail
   and by the AHEAD card, which is all a shut milestone has ever been able to say.

   THE DRAWING IS NOT HERE. It is `components/Chain.tsx`, shared with a deck's blocks, which is what
   the design system means by "Classes are `.dk-*`, shared with the deck screen through
   `chainMarkup`". This file is the curriculum's half: which sixteen, which one is open, and the
   words this screen puts in the shapes.
   ================================================================================================== */

export function PathL2({ nodes, loading, onOpenNode, onUp }: PathL2Props) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const rows = useMemo(() => pathRows(nodes), [nodes])
  const here = hereIndex(rows)

  /* two focusable cards: 0 is the open step, 1 is the pile of cleared ones */
  const [at, setAt] = useState<0 | 1>(0)
  /* -1 is "the open one"; anything else is a cleared step being revisited */
  const [pick, setPick] = useState(-1)
  const [pile, setPile] = useState(false)
  const [page, setPage] = useState(0)
  const [cell, setCell] = useState(0)

  const shown = pick >= 0 ? pick : here
  const view = useMemo(() => pathChain(rows, here, shown), [rows, here, shown])
  const shelf = chainPage(view.cleared, page)

  /* THE RAIL IS CLAMPED AT THE FURTHEST OPEN STEP — scrubbing past it would let the pointer reach
     steps the chain does not offer. `reach` is not always `here`: the course forks once, and both
     children of Grammar N5 open together. See `reachIndex`. */
  const scrub = (i: number) => {
    const want = Math.max(0, Math.min(i, view.reach))
    setPick(want === here ? -1 : want)
    setPile(false)
    setAt(0)
  }

  const sel = rows[shown]
  const openRef = useRef<() => void>(() => {})
  openRef.current = () => {
    if (!sel) return
    /* A STEP WITH NOWHERE TO GO IS THE GENUINELY SILENT CASE, and the slab beside it already reads
       NOT BUILT YET. The refusal is what sends you to read it. Everything else goes through
       `onOpenNode`, which owns the curriculum's own soft gate and its confirmation. */
    if (!sel.goesTo) { refuse(); return }
    onOpenNode(sel.id)
  }

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      /* THE PILE OWNS THE KEYS WHILE IT IS OPEN, and its Escape must not reach App's window
         listener — otherwise closing it would leave the screen as well, which is one Escape doing
         two things. Same arrangement as the deck's. */
      if (pile) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') { setPile(false); return }
        if (event.key === 'ArrowRight') { setCell((c) => Math.min(c + 1, shelf.cells.length - 1)); return }
        if (event.key === 'ArrowLeft') { setCell((c) => Math.max(c - 1, 0)); return }
        if (event.key === 'ArrowDown') { setPage((p) => Math.min(p + 1, shelf.pages - 1)); setCell(0); return }
        if (event.key === 'ArrowUp') { setPage((p) => Math.max(p - 1, 0)); setCell(0); return }
        if (event.key === 'Enter') {
          const index = shelf.cells[cell]
          if (index !== undefined) { setPick(index); setPile(false); setAt(0) }
        }
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft'
        || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        setAt((i) => (i === 0 ? 1 : 0))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (at === 1) { if (view.cleared > 0) { setPile(true); setCell(0) } return }
        openRef.current()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, cell, pile, shelf.cells, shelf.pages, view.cleared])

  return (
    /* THE ROOT SAYS WHICH CHAIN THIS IS. The course and a deck's blocks are the same drawing in the
       same classes, so without this the two screens are indistinguishable from the outside -- to a
       test, to a stylesheet, and to anything measuring the running app. */
    <div className={screenClass(entered, 'pa-course')} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('STUDY', null)} />

        {/* an absence is drawn as an absence, and "still reading" is not the same absence as
            "answered with nothing" — a course with no steps in it must say which */}
        {!rows.length ? (
          <div className="pj-empty">
            {loading
              ? 'READING THE CURRICULUM…'
              : 'THE CURRICULUM DID NOT ANSWER · NOTHING TO WALK YET'}
          </div>
        ) : (
          <Chain
            view={view}
            at={at}
            onAt={setAt}
            shown={shown}
            onScrub={scrub}
            onOpen={() => openRef.current()}
            onPile={() => { setPile(true); setCell(0) }}
            enabled={!pile}
          />
        )}

        {pile ? (
          <ChainPile
            view={view}
            page={shelf.page}
            cell={cell}
            onCell={setCell}
            onPick={(index) => { setPick(index); setPile(false); setAt(0) }}
            onClose={() => setPile(false)}
          />
        ) : null}

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Choose<em>選択</em></span>
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
