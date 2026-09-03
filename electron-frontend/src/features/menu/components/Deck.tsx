import { useEffect, useMemo, useRef, useState } from 'react'
import type { BlockInfo, JlptLevel, JlptLevelProgress } from '../../../types'
import { chainPage } from '../chain'
import { deckChain, deckChainView } from '../deck'
import { Chain, ChainPile } from './Chain'
import { levelForKey } from '../levels'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { LevelBar } from './LevelBar'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface DeckProps {
  /** the milestone this screen was opened from, in the curriculum's own words */
  title: { en: string; jp: string }
  /* THE DECK ACTUALLY DRAWN, WHICH IS NOT ALWAYS THE MILESTONE. The path's step is KANJI N5, but
     `activeDeckSlug` follows the level tab the learner last used in the hub, so a session spent on
     N3 makes the app open N3's blocks. Naming the milestone alone is how the mockup ended up
     showing kanji N1's blocks under a heading reading HIRAGANA. Two statements, not one: the
     caption says why you are here, the card says what you are looking at. */
  slug: string
  blocks: readonly BlockInfo[]
  /** the gate the backend applied, 0..1 */
  gate: number
  loading: boolean
  error: string | null
  /* WHAT PRESSING START ACTUALLY RUNS. The screen used to hand you to a hub that asked which drill
     -- so the slab could promise "START THIS BLOCK" without ever saying what starting meant. It
     goes straight into a round now, and a button that performs an action has to name it. */
  mode: string
  /* THE LADDER, FOR THE TWO DECKS THAT ARE FIVE DECKS. Empty for the four that are not, and the
     row draws nothing rather than a control with one choice on it. See `levels.ts`. */
  levels: readonly JlptLevelProgress[]
  level: JlptLevel
  onLevel: (level: JlptLevel) => void
  /** study one block. `index` is the block's own index, so a revisit says which. */
  onStart: (index: number) => void
  onUp: () => void
}

export function Deck({
  title, slug, blocks, gate, loading, error, mode, levels, level, onLevel, onStart, onUp,
}: DeckProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const chain = useMemo(() => deckChain(blocks, gate), [blocks, gate])

  /* two focusable cards: 0 is the open block, 1 is the cleared pile */
  const [at, setAt] = useState<0 | 1>(0)
  /* -1 is "the open one"; anything else is a cleared block being revisited */
  const [pick, setPick] = useState(-1)
  const [sheet, setSheet] = useState(false)
  const [page, setPage] = useState(0)
  const [cell, setCell] = useState(0)

  const shown = pick >= 0 ? pick : chain.here
  const here = chain.blocks[shown]
  const view = useMemo(
    () => deckChainView(chain, slug, mode, shown), [chain, slug, mode, shown],
  )
  const shelf = chainPage(chain.cleared, page)

  /* THE RAIL IS A MAP: the block under the pointer is the block you get. See `useTraversal`.
     CLAMPED AT `here`, WHERE THE CLICK IS ALSO REFUSED -- scrubbing past the open block would let
     the pointer reach blocks neither the keyboard nor the mouse will open. */
  const scrub = (i: number) => {
    const want = Math.max(0, Math.min(i, chain.here))
    setPick(want === chain.here ? -1 : want)
    setSheet(false)
    setAt(0)
  }

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      /* THE SHEET OWNS THE KEYS WHILE IT IS OPEN, and its Escape must not reach App's window
         listener — otherwise closing the pile would leave the screen as well, which is one
         Escape doing two things. */
      if (sheet) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') { setSheet(false); return }
        if (event.key === 'ArrowRight') { setCell((c) => Math.min(c + 1, shelf.cells.length - 1)); return }
        if (event.key === 'ArrowLeft') { setCell((c) => Math.max(c - 1, 0)); return }
        if (event.key === 'ArrowDown') { setPage((p) => Math.min(p + 1, shelf.pages - 1)); setCell(0); return }
        if (event.key === 'ArrowUp') { setPage((p) => Math.max(p - 1, 0)); setCell(0); return }
        if (event.key === 'Enter') {
          const index = shelf.cells[cell]
          if (index !== undefined) { setPick(index); setSheet(false); setAt(0) }
        }
        return
      }
      /* THE PRINTED DIGITS PICK THE LEVEL, and they are STOPPED rather than merely prevented:
         `App` binds 1 through 5 on the window as the way into a deck from anywhere the menu is not
         listening, so a press that bubbled would change the level and then leave the screen it had
         just changed. Same collision, same fix, as `MenuL1`'s row numbers. */
      const wanted = levelForKey(levels, event.key)
      if (wanted) {
        event.preventDefault()
        event.stopPropagation()
        if (wanted !== level) onLevel(wanted)
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setAt((i) => (i === 0 ? 1 : 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (at === 1) { if (chain.cleared > 0) { setSheet(true); setCell(0) } return }
        /* A DECK THAT ANSWERED WITH NO BLOCKS IS STILL A DECK YOU CAN STUDY. -1 is "no block
           filter, the whole thing" -- the pool the app falls back to anyway when nothing is
           selected. Without it this screen is a dead end for a deck the bridge could not cut. */
        onStart(here ? here.index : -1)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, cell, chain.cleared, here, level, levels, onLevel, onStart, sheet, shelf.cells, shelf.pages])

  return (
    /* the deck's name is not drawn as a heading -- the open block's cap says it -- but a screen
       reader announcing this screen has not reached that cap yet */
    <div
      className={screenClass(entered, 'dk-blocks')}
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label={`${title.en} ${title.jp}`}
    >
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('STUDY', 'deck')} />
        <LevelBar
          deck={slug.replace(/_n[1-5]$/, '').replace(/_/g, ' ').toUpperCase()}
          levels={levels}
          at={level}
          onPick={onLevel}
        />
        {/* THE SCREEN'S OWN CAPTION IS THE HERE-CARD'S. `.dk-cap` on the open block already says
            which deck this is and where in it you are standing, so the heading at the top of the
            stage was the same sentence a second time -- and on this screen it landed on the cards.
            What it uniquely carried, the deck's whole-chain line, moves to the rail cap. */}
        {/* an absence is drawn as an absence: a deck that did not answer is not an empty deck */}
        {error ? <div className="pj-empty">{error.toUpperCase()}</div> : null}
        {loading && !chain.blocks.length && !error
          ? <div className="pj-empty">READING THE DECK…</div> : null}
        {/* NOT CUT INTO BLOCKS IS NOT THE SAME AS NOTHING TO STUDY, and while this screen was a
            stop on the way to a hub the difference did not matter -- you carried on and picked a
            drill there. It is the last screen before the round now, so the deck the bridge could
            not cut is still offered whole rather than left as a dead end with a Back button. */}
        {!error && !loading && !chain.blocks.length ? (
          <button type="button" className="pj-empty pj-go" onClick={() => onStart(-1)}>
            THIS DECK IS NOT CUT INTO BLOCKS · STUDY IT WHOLE · {mode.toUpperCase()} ▸
          </button>
        ) : null}

        {chain.blocks.length && here ? (
          <Chain
            view={view}
            at={at}
            onAt={setAt}
            shown={shown}
            onScrub={scrub}
            onOpen={() => onStart(here.index)}
            onPile={() => { setSheet(true); setCell(0) }}
            enabled={!sheet}
          />
        ) : null}

        {sheet ? (
          <ChainPile
            view={view}
            page={shelf.page}
            cell={cell}
            onCell={setCell}
            onPick={(index) => { setPick(index); setSheet(false); setAt(0) }}
            onClose={() => setSheet(false)}
          />
        ) : null}

                <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Choose<em>選択</em></span>
          {levels.length > 1 ? <span><b>1–{levels.length}</b>Level<em>級</em></span> : null}
          <span><b>ENTER</b>Start<em>開始</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
