import { useEffect, useMemo, useRef, useState } from 'react'
import type { BlockInfo, JlptLevel, JlptLevelProgress } from '../../../types'
import {
  blockNameSize, blockWindow, deckChain, gateLine, nameIsWide, railLine,
} from '../deck'
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
     caption says why you are here, the poster says what you are looking at. */
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

/* ==================================================================================================
   A DECK'S BLOCKS — THE SAME LEDGER THE COURSE IS. See the note over `.dk-run` for why three cards
   in a row stopped being the drawing.

   THE ROWS ARE THE REACH. `.dk-sheet` was a paged overlay that existed only because three cards had
   nowhere to put seventy-three cleared blocks; the column walks them, and the strip in the foot
   band jumps to any of them for a deck too long to walk. One way to reach a block, not two.
   ================================================================================================== */

export function Deck({
  title, slug, blocks, gate, loading, error, mode, levels, level, onLevel, onStart, onUp,
}: DeckProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const chain = useMemo(() => deckChain(blocks, gate), [blocks, gate])

  /* THE CURSOR WALKS [0, here] AND NO FURTHER, which is the whole of the gate: everything behind
     the frontier is cleared and revisitable, and nothing past it is choosable at all. */
  const [at, setAt] = useState(-1)
  const cursor = at < 0 ? Math.max(0, chain.here) : at
  const here = chain.blocks[cursor]
  const revisiting = cursor !== chain.here
  const win = blockWindow(chain.blocks, cursor)

  const wide = nameIsWide(here?.name ?? '')
  const nameSize = blockNameSize(here?.name ?? '', wide)
  const gateOn = Math.round(chain.gate * 100)

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      /* THE PRINTED DIGITS PICK THE LEVEL, and they are STOPPED rather than merely prevented:
         `App` binds 1 through 5 on the window as the way into a deck from anywhere the menu is not
         listening, so a press that bubbled would change the level and then leave the screen it had
         just changed. Same collision, same fix, as `MenuL1`'s row numbers. */
      const wanted = levelForKey(levels, event.key)
      if (wanted) {
        event.preventDefault()
        event.stopPropagation()
        if (wanted !== level) { onLevel(wanted); setAt(-1) }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        setAt(() => Math.min(cursor + 1, Math.max(0, chain.here)))
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setAt(() => Math.max(cursor - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        /* A DECK THAT ANSWERED WITH NO BLOCKS IS STILL A DECK YOU CAN STUDY. -1 is "no block
           filter, the whole thing" -- the pool the app falls back to anyway when nothing is
           selected. Without it this screen is a dead end for a deck the bridge could not cut. */
        onStart(here ? here.index : -1)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [chain.here, cursor, here, level, levels, onLevel, onStart])

  return (
    /* the deck's name is not drawn as a heading -- the poster's cap says it -- but a screen
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
          <>
            {/* ─── the run, as rows ──────────────────────────────────────────────────────── */}
            <div className="dk-run" role="group" aria-label="The blocks in this deck">
              {win.blocks.map((block) => {
                const shut = block.state === 'ahead'
                return (
                  <button
                    key={block.index}
                    type="button"
                    className={['dk-row', block.state, block.index === cursor ? 'on' : '']
                      .filter(Boolean).join(' ')}
                    onClick={() => { if (!shut) setAt(block.index) }}
                    aria-disabled={shut}
                    aria-label={`Block ${block.no}, ${block.name}, ${block.cards} cards`}
                  >
                    <span className="n">{block.no}</span>
                    <span className="t">{block.name}</span>
                    <span className="c">{block.cards} CARDS</span>
                    <span className="s">
                      {block.state === 'done' ? '済 CLEARED'
                        : block.state === 'here' ? `${block.pct}% · OPEN` : 'SHUT'}
                    </span>
                  </button>
                )
              })}
              {/* WHAT WILL NOT FIT, COUNTED AT BOTH ENDS. Standing on the last block of a deck
                  puts every hidden row BEHIND the window, so a fold that only counted forwards
                  said nothing at all on the screen that needed it most. */}
              {win.behind || win.ahead ? (
                <span className="dk-fold">
                  {win.behind ? <><b>{win.behind}</b><i>ABOVE</i></> : null}
                  {win.ahead ? <><b>{win.ahead}</b><i>BELOW</i></> : null}
                </span>
              ) : null}
            </div>

            {/* ─── and the block itself, on the valley ───────────────────────────────────── */}
            <div className="dk-here">
              <span className="dk-cap">
                {revisiting ? 'ALREADY CLEARED' : 'OPEN NOW'} · BLOCK {here.no} OF {chain.blocks.length}
                {' '}<i>{slug.replace(/_/g, ' ').toUpperCase()}</i>
              </span>
              <b
                className="dk-name"
                data-wide={wide ? '1' : '0'}
                style={{ fontSize: `${nameSize}px` }}
              >
                {here.name}
              </b>
              {here.sample.length
                ? <span className="dk-chars">{here.sample.join(' ・ ')}</span> : null}

              <span className="dk-meter">
                <span className="dk-sub">
                  <b>{here.pct}%</b>
                  <em>MASTERED</em>
                  <s>{here.cards} CARDS</s>
                </span>
                <span className="dk-track">
                  <i style={{ width: `${Math.min(100, here.pct)}%` }} />
                  {/* where the gate stands, which is what makes 62% legible as "eight short" */}
                  {revisiting ? null : <u style={{ left: `${gateOn}%` }} />}
                </span>
                <span className="dk-gate">
                  {gateLine(chain, revisiting)}
                </span>
              </span>

              <button
                type="button"
                className="dk-slab"
                data-live="1"
                onClick={() => onStart(here.index)}
              >
                <em>{mode.toUpperCase()}</em>
                <b>{revisiting ? 'STUDY IT AGAIN' : 'START THIS BLOCK'} ▸</b>
              </button>
            </div>

            {/* ─── the whole deck once, in the foot band, and it jumps ───────────────────── */}
            <div className="dk-strip">
              <div className="dk-segrow" role="group" aria-label="Every block in this deck">
                {chain.blocks.map((block) => (
                  <i
                    key={block.index}
                    className={[
                      block.state === 'done' ? 'done' : '',
                      block.state === 'here' ? 'here' : '',
                      block.state === 'ahead' ? 'locked' : '',
                      block.index === cursor ? 'pick' : '',
                    ].filter(Boolean).join(' ')}
                    title={`${block.no} · ${block.name} · ${block.cards} cards`}
                    onClick={() => { if (block.state !== 'ahead') setAt(block.index) }}
                  />
                ))}
              </div>
              <div className="dk-railcap">
                <span>BLOCK 01</span>
                <span className="cap">{railLine(chain)}</span>
                <span>BLOCK {chain.blocks[chain.blocks.length - 1]?.no ?? '01'}</span>
              </div>
            </div>
          </>
        ) : null}

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>↑ ↓</b>Choose<em>選択</em></span>
          {levels.length > 1 ? <span><b>1–{levels.length}</b>Level<em>級</em></span> : null}
          <span><b>ENTER</b>Start<em>開始</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
