import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTraversal } from '../useTraversal'
import type { BlockInfo } from '../../../types'
import { deckChain, deckSheet, gateLine, railLine } from '../deck'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered } from '../useScreen'
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
  /** study one block. `index` is the block's own index, so a revisit says which. */
  onStart: (index: number) => void
  onUp: () => void
}

export function Deck({ title, slug, blocks, gate, loading, error, onStart, onUp }: DeckProps) {
  const entered = useEntered()
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const chain = useMemo(() => deckChain(blocks, gate), [blocks, gate])

  /* two focusable cards: 0 is the open block, 1 is the cleared pile */
  const [at, setAt] = useState(0)
  /* -1 is "the open one"; anything else is a cleared block being revisited */
  const [pick, setPick] = useState(-1)
  const [sheet, setSheet] = useState(false)
  const [page, setPage] = useState(0)
  const [cell, setCell] = useState(0)

  const shown = pick >= 0 ? pick : chain.here

  /* THE RAIL IS A MAP: the block under the pointer is the block you get. See `useTraversal`.
     CLAMPED AT `here`, WHERE THE CLICK IS ALSO REFUSED -- scrubbing past the open block would let
     the pointer reach blocks neither the keyboard nor the mouse will open. */
  const railRef = useRef<HTMLElement | null>(null)
  const scrub = (i: number) => {
    const want = Math.max(0, Math.min(i, chain.here))
    setPick(want === chain.here ? -1 : want)
    setSheet(false)
    setAt(0)
  }
  const rail = useTraversal('rail', {
    enabled: !sheet,
    step: (d) => scrub(shown + d),
    bands: () => Array.from(railRef.current?.children ?? [])
      .map((c) => c.getBoundingClientRect().left),
    pick: scrub,
  })
  const here = chain.blocks[shown]
  const next = chain.blocks[chain.here + 1]
  const view = deckSheet(chain.cleared, page)

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
      /* THE SHEET OWNS THE KEYS WHILE IT IS OPEN, and its Escape must not reach App's window
         listener — otherwise closing the pile would leave the screen as well, which is one
         Escape doing two things. */
      if (sheet) {
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') { setSheet(false); return }
        if (event.key === 'ArrowRight') { setCell((c) => Math.min(c + 1, view.cells.length - 1)); return }
        if (event.key === 'ArrowLeft') { setCell((c) => Math.max(c - 1, 0)); return }
        if (event.key === 'ArrowDown') { setPage((p) => Math.min(p + 1, view.pages - 1)); setCell(0); return }
        if (event.key === 'ArrowUp') { setPage((p) => Math.max(p - 1, 0)); setCell(0); return }
        if (event.key === 'Enter') {
          const index = view.cells[cell]
          if (index !== undefined) { setPick(index); setSheet(false); setAt(0) }
        }
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setAt((i) => (i === 0 ? 1 : 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (at === 1) { if (chain.cleared > 0) { setSheet(true); setCell(0) } return }
        if (here) onStart(here.index)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, cell, chain.cleared, here, onStart, sheet, view.cells, view.pages])

  const revisiting = pick >= 0

  return (
    /* the deck's name is not drawn as a heading -- the open block's cap says it -- but a screen
       reader announcing this screen has not reached that cap yet */
    <div
      className={screenClass(entered)}
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label={`${title.en} ${title.jp}`}
    >
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('STUDY', 'deck')} />
        {/* THE SCREEN'S OWN CAPTION IS THE HERE-CARD'S. `.dk-cap` on the open block already says
            which deck this is and where in it you are standing, so the heading at the top of the
            stage was the same sentence a second time -- and on this screen it landed on the cards.
            What it uniquely carried, the deck's whole-chain line, moves to the rail cap. */}
        {/* an absence is drawn as an absence: a deck that did not answer is not an empty deck */}
        {error ? <div className="pj-empty">{error.toUpperCase()}</div> : null}
        {loading && !chain.blocks.length && !error
          ? <div className="pj-empty">READING THE DECK…</div> : null}
        {!error && !loading && !chain.blocks.length ? (
          <div className="pj-empty">THIS DECK IS NOT CUT INTO BLOCKS</div>
        ) : null}

        {chain.blocks.length && here ? (
          <>
            <div className="dk-wrap">
              {/* BEHIND YOU — a pile with a count, not a list. The list is the sheet. */}
              <button
                type="button"
                className={`dk-f dk-behind${at === 1 ? ' on' : ''}`}
                onFocus={() => setAt(1)}
                onClick={() => { if (chain.cleared > 0) { setSheet(true); setCell(0) } }}
                aria-disabled={chain.cleared === 0}
                aria-label={`${chain.cleared} blocks cleared — open the pile to study one again`}
              >
                <span className="dk-cap"><b>BEHIND YOU</b></span>
                <span className="dk-bignum">
                  <b>{chain.cleared}</b>
                  <i>{chain.cleared === 1 ? 'BLOCK CLEARED' : 'BLOCKS CLEARED'}</i>
                </span>
                <span className="dk-act">
                  {chain.cleared > 0 ? 'ENTER · OPEN THEM' : 'NOTHING BEHIND YOU YET'}
                </span>
              </button>

              {/* OPEN NOW — the one block the chain actually offers */}
              <button
                type="button"
                className={`dk-f dk-here${at === 0 ? ' on' : ''}`}
                onFocus={() => setAt(0)}
                onClick={() => onStart(here.index)}
                aria-label={`${here.name} — ${here.cards} cards, ${here.pct}% mastered`}
              >
                <span className="dk-cap">
                  <b>{revisiting ? 'REVISITING' : 'OPEN NOW'} · BLOCK {here.no} OF {chain.blocks.length}</b>
                  <i>{slug.replace(/_/g, ' ').toUpperCase()}</i>
                </span>
                <span className="dk-body">
                  <span className="dk-name">{here.name}</span>
                  <span className="dk-chars" lang="ja">{here.sample.join(' · ')}</span>
                  <span className="dk-sub">
                    <span>{here.cards} CARDS</span>
                    <span>{revisiting ? 'CLEARED' : 'IN PROGRESS'}</span>
                  </span>
                  {/* TWELVE SEGMENTS, not a bar: a gate is a count of steps, and a smooth bar
                      invites reading a percentage off it that nobody promised. */}
                  <span className="dk-gauge">
                    <span className="dk-segs">
                      {Array.from({ length: 12 }, (_, k) => (
                        <i key={k} className={k < Math.round((here.pct / 100) * 12) ? 'got' : ''} />
                      ))}
                    </span>
                    <b>{here.pct}%</b>
                  </span>
                </span>
                {/* WHAT THE PERCENTAGE IS FOR. Not a score — a key, and the gate says what it opens. */}
                <span className="dk-gate">{gateLine(chain, revisiting)}</span>
                <span className="dk-slab">
                  <em>{revisiting ? `BLOCK ${here.no}` : 'THE ONLY WAY ON'}</em>
                  <b>{revisiting ? 'STUDY IT AGAIN' : 'START THIS BLOCK'} ▸</b>
                </span>
              </button>

              {/* AHEAD — named, and deliberately not focusable: it is not a choice */}
              <div className="dk-ahead">
                <span className="dk-cap"><b>AHEAD</b><i>NOT YET CHOOSABLE</i></span>
                <span className="dk-next">
                  <span>NEXT, WHEN THIS ONE OPENS IT</span>
                  <b>{next ? next.name : 'THE DECK IS DONE'}</b>
                  <i>{next ? `${next.cards} CARDS` : 'NOTHING LOCKED'}</i>
                </span>
                <span className="dk-locked">
                  <span>AND MORE AFTER IT</span>
                  <b>{chain.beyond}</b>
                </span>
              </div>
            </div>

            {/* THE RAIL IS A MAP — every block at once, at a scale that fits six or forty-four
                by construction. It is not focusable: it says where you are, it is not a way to go. */}
            <div
              className="dk-rail"
              ref={rail.ref}
              onPointerDown={rail.onPointerDown}
            >
              <span
                className="dk-segrow"
                aria-hidden="true"
                ref={(n) => { railRef.current = n }}
              >
                {chain.blocks.map((block) => (
                  <i
                    key={block.index}
                    className={block.index === shown && revisiting ? 'pick' : block.state}
                    title={`${block.no} ${block.name} — ${block.state === 'ahead' ? 'locked'
                      : block.state === 'here' ? 'open now' : 'done'}`}
                  />
                ))}
              </span>
              <span className="dk-railcap">
                <span>BLOCK 01</span>
                <span>{railLine(chain)}</span>
                <span>BLOCK {chain.blocks[chain.blocks.length - 1].no}</span>
              </span>
            </div>
          </>
        ) : null}

        {sheet ? (
          <div className="dk-open">
            <button
              type="button"
              className="dk-scrim"
              aria-label="Close the cleared blocks"
              onClick={() => setSheet(false)}
            />
            <div className="dk-sheet">
              <span className="dk-cap">
                <b>CLEARED BLOCKS · {chain.cleared} OF {chain.blocks.length}</b>
                <i>ENTER STUDIES ONE AGAIN</i>
              </span>
              <div className="dk-grid">
                {view.cells.map((index, k) => {
                  const block = chain.blocks[index]
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`dk-cell${k === cell ? ' on' : ''}`}
                      onClick={() => { setPick(index); setSheet(false); setAt(0) }}
                      onFocus={() => setCell(k)}
                      aria-label={`${block.no} ${block.name} — ${block.cards} cards`}
                    >
                      <b>{block.no}</b>
                      <em>{block.name}</em>
                      <i>{block.cards} CARDS</i>
                    </button>
                  )
                })}
              </div>
              <span className="dk-pager">
                <span>PAGE {view.page + 1} / {view.pages}</span>
                <span>← → MOVE · ↑ ↓ PAGE · ESC CLOSES</span>
              </span>
            </div>
          </div>
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
