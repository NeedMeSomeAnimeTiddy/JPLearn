import { useRef } from 'react'
import { chainNameSize, chainPage, chainSegTitle } from '../chain'
import type { ChainView } from '../chain'
import { useTraversal } from '../useTraversal'

/* ==================================================================================================
   THE CHAIN, DRAWN — see `chain.ts` for what a chain is and why two screens share this.

   TWO FOCUSABLE THINGS AND ONE THAT IS NOT. The open item acts and the pile of cleared ones opens;
   the AHEAD card is a statement, so it is a `div` and the arrows skip it. That is the drawing's
   whole argument: a chain does not offer you the run, it offers you the frontier.

   THE RAIL IS A MAP, NOT A REEL. It shows every item at once at a fixed scale, so dragging across
   it is ABSOLUTE — the segment under the pointer is the one you get — and it is clamped at the open
   item, which is where the click is refused too. See `useTraversal`.
   ================================================================================================== */

export interface ChainProps {
  view: ChainView
  /** which card has the cursor: 0 the open one, 1 the pile */
  at: 0 | 1
  onAt: (at: 0 | 1) => void
  /** which item the hero card is showing — `view.here`, or a cleared one being revisited */
  shown: number
  /** scrub the rail: the caller clamps and decides what "revisiting" means */
  onScrub: (index: number) => void
  /** press the open item */
  onOpen: () => void
  /** open the pile of cleared ones */
  onPile: () => void
  /** off while the pile owns the screen */
  enabled: boolean
}

export function Chain({ view, at, onAt, shown, onScrub, onOpen, onPile, enabled }: ChainProps) {
  const segRef = useRef<HTMLElement | null>(null)
  const rail = useTraversal('rail', {
    enabled,
    step: (d) => onScrub(shown + d),
    bands: () => Array.from(segRef.current?.children ?? []).map((c) => c.getBoundingClientRect().left),
    pick: onScrub,
  })
  const revisiting = shown !== view.here
  const { hero } = view

  return (
    <>
      <div className="dk-wrap">
        {/* BEHIND YOU — a pile with a count, not a list. The list is what pressing it opens. */}
        <button
          type="button"
          className={`dk-f dk-behind${at === 1 ? ' on' : ''}`}
          onFocus={() => onAt(1)}
          onClick={() => { if (view.cleared > 0) onPile() }}
          aria-disabled={view.cleared === 0}
          aria-label={`${view.cleared} ${view.behindLabel.toLowerCase()} — ${view.pile.act.toLowerCase()}`}
        >
          <span className="dk-cap"><b>BEHIND YOU</b></span>
          <span className="dk-bignum">
            <b>{view.cleared}</b>
            <i>{view.behindLabel}</i>
          </span>
          <span className="dk-act">
            {view.cleared > 0 ? `ENTER · ${view.pile.act}` : view.pile.empty}
          </span>
        </button>

        {/* THE ONE THE CHAIN ACTUALLY OFFERS */}
        <button
          type="button"
          className={`dk-f dk-here${at === 0 ? ' on' : ''}`}
          onFocus={() => onAt(0)}
          onClick={onOpen}
          aria-label={`${hero.name} — ${hero.subLeft}, ${hero.pct}% — ${hero.slabB}`}
        >
          <span className="dk-cap">
            <b>{hero.cap}</b>
            <i>{hero.capRight}</i>
          </span>
          <span className="dk-body">
            {/* THE FACE IS A DATA ATTRIBUTE, NOT AN INLINE FAMILY, because it carries two changes
                and not one: a Japanese name takes the mincho AND loses the italic. Only the size
                is per-name, so only the size is written here. */}
            <span
              className="dk-name"
              data-wide={hero.nameWide ? '1' : '0'}
              lang={hero.nameWide ? 'ja' : undefined}
              style={{ fontSize: chainNameSize(hero.name, hero.nameWide, hero.nameWide ? 66 : 46) }}
            >
              {hero.name}
            </span>
            {hero.under ? <span className="dk-chars" lang="ja">{hero.under}</span> : null}
            <span className="dk-sub">
              <span>{hero.subLeft}</span>
              <span>{hero.subRight}</span>
            </span>
            {/* TWELVE SEGMENTS, not a bar: a gate is a count of steps, and a smooth bar invites
                reading a percentage off it that nobody promised. */}
            <span className="dk-gauge">
              <span className="dk-segs">
                {Array.from({ length: 12 }, (_, k) => (
                  <i key={k} className={k < Math.round((hero.pct / 100) * 12) ? 'got' : ''} />
                ))}
              </span>
              <b>{hero.pct}%</b>
            </span>
          </span>
          {/* WHAT THE PERCENTAGE IS FOR. Not a score — a key, and this says what it opens. */}
          <span className="dk-gate">
            {hero.gate}
            {hero.gateEm ? <em>{hero.gateEm}</em> : null}
          </span>
          <span className="dk-slab" data-live={hero.live ? '1' : '0'}>
            <em>{hero.slabEm}</em>
            <b>{hero.slabB} ▸</b>
          </span>
        </button>

        {/* AHEAD — named, and deliberately not focusable: it is not a choice */}
        <div className="dk-ahead">
          <span className="dk-cap"><b>AHEAD</b><i>NOT YET CHOOSABLE</i></span>
          <span className="dk-next">
            <span>{view.ahead.kicker}</span>
            <b>{view.ahead.name}</b>
            <i>{view.ahead.meta}</i>
          </span>
          <span className="dk-locked">
            <span>{view.ahead.tailLabel}</span>
            <b>{view.beyond}</b>
          </span>
        </div>
      </div>

      {/* THE RAIL IS A MAP — every item at once, at a scale that fits six or seventy-six by
          construction. It says where you are; it is not a second way to go. */}
      <div className="dk-rail" ref={rail.ref} onPointerDown={rail.onPointerDown}>
        <span className="dk-segrow" aria-hidden="true" ref={(n) => { segRef.current = n }}>
          {view.items.map((entry, i) => (
            <i
              key={entry.key}
              className={i === shown && revisiting ? 'pick' : entry.state}
              title={chainSegTitle(entry)}
            />
          ))}
        </span>
        <span className="dk-railcap">
          <span>{view.rail.left}</span>
          <span>{view.rail.mid}</span>
          <span>{view.rail.right}</span>
        </span>
      </div>
    </>
  )
}

export interface ChainPileProps {
  view: ChainView
  page: number
  cell: number
  onCell: (cell: number) => void
  onPick: (index: number) => void
  onClose: () => void
}

/** what the BEHIND YOU count opens: every cleared item as a paged grid, over its own scrim */
export function ChainPile({ view, page, cell, onCell, onPick, onClose }: ChainPileProps) {
  const shelf = chainPage(view.cleared, page)
  return (
    <div className="dk-open">
      {/* THE SCRIM IS A BUTTON, not a div with a handler: it is the primary way out and a click
          target no keyboard can reach is not a way out at all. */}
      <button type="button" className="dk-scrim" aria-label="Close" onClick={onClose} />
      <div className="dk-sheet">
        <span className="dk-cap">
          <b>{view.pile.cap} · {view.cleared} OF {view.items.length}</b>
          <i>ENTER OPENS ONE AGAIN</i>
        </span>
        <div className="dk-grid">
          {shelf.cells.map((index, k) => {
            const entry = view.items[index]
            return (
              <button
                key={entry.key}
                type="button"
                className={`dk-cell${k === cell ? ' on' : ''}`}
                onClick={() => onPick(index)}
                onFocus={() => onCell(k)}
                aria-label={`${entry.no} ${entry.name}${entry.note ? ` — ${entry.note}` : ''}`}
              >
                <b>{entry.no}</b>
                <em>{entry.name}</em>
                <i>{entry.note}</i>
              </button>
            )
          })}
        </div>
        <span className="dk-pager">
          <span>PAGE {shelf.page + 1} / {shelf.pages}</span>
          <span>← → MOVE · ↑ ↓ PAGE · ESC CLOSES</span>
        </span>
      </div>
    </div>
  )
}
