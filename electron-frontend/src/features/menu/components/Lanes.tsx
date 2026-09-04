import { useEffect, useRef, useState } from 'react'
import type { Lane } from '../lanes'
import type { MenuSectionKey } from '../types'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { refuse } from '../refuse'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface LanesProps {
  /** which section these lanes belong to — what the heading slab takes its mark and colour from */
  section: MenuSectionKey
  /** the caption strip: the section's own name */
  jp: string
  en: string
  /** the line under the lanes */
  note: string
  lanes: readonly Lane[]
  onPick: (key: string) => void
  onUp: () => void
}

/* ONE DRAWING, TWO SCREENS. Three lanes down the left or two — what changes is how many rows there
   are and what the poster beside them holds. THE WORLD passes two parts PRACTICE does not: the
   milestone that opened each lane, and the three things inside it. See the note in `lanes.ts`.

   WHY IT IS A LEDGER AND NOT A ROW OF CARDS: see the note over `.pr-run`. Three cards each holding
   a number, one sentence and four hundred pixels of empty paper was the emptiest screen in the app,
   and THE WORLD had the opposite problem in the same box. */
export function Lanes({ section, jp, en, note, lanes, onPick, onUp }: LanesProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)

  const here = lanes[at]

  /* ON ARRIVAL, ONCE. The screen takes focus or its own arrow keys do nothing (see the note in
     MenuL1) — but taking it on every render is a different bug: THE WORLD's figures arrive from
     the bridge after the screen is up, and a focus call in the keydown effect would have snatched
     focus back out of wherever the reader had put it the moment they landed. */
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      /* THE COLUMN RUNS DOWN, SO THE ARROWS DO TOO -- and left and right keep working, because
         three lanes side by side is the shape this screen had for two phases and a hand that
         learned it should not be told it is wrong. */
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault(); setAt((i) => Math.min(i + 1, lanes.length - 1))
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault(); setAt((i) => Math.max(i - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const lane = lanes[at]
        if (!lane) return
        /* a shut lane already says what it is waiting for; the refusal sends you to read it */
        if (lane.shut) { refuse(); return }
        onPick(lane.key)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, lanes, onPick])

  return (
    /* THE SECTION'S NAME IS NOT DRAWN TWICE. The note under the lanes already opens with it --
       "練習 · NOTHING NEW IS TAUGHT HERE" -- which is where the mockup puts it, so the heading that
       said the same thing at the top of the stage is gone. It stays as the region's accessible
       name, because a screen reader has no note to have read yet when it announces the screen. */
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1} role="group" aria-label={`${en} ${jp}`}>
      <div className="mn-frame" ref={frameRef}>
        {/* THE SECTION IS A PROP, NOT A CONSTANT. This was hard-coded to DRILLS, so THE WORLD's
            two lanes stood under a slab reading 練 PRACTICE 練習 in PRACTICE's red -- the one thing
            the heading exists to get right, said wrong, on the only other screen that uses it. */}
        <ScreenHead head={screenHead(section, null)} />

        {/* ─── the ways in, as rows ─────────────────────────────────────────────────────────── */}
        <div className="pr-run" role="group" aria-label={`${en} — ways in`}>
          {lanes.map((lane, index) => {
            const classes = ['pr-lane']
            if (index === at) classes.push('on')
            if (lane.duty) classes.push('duty')
            if (lane.shut) classes.push('shut')
            return (
              <button
                key={lane.key}
                type="button"
                className={classes.join(' ')}
                /* HOVER SELECTS, A CLICK OPENS -- the same two-step level one's rows make, so
                   the poster has already changed under the pointer by the time the press lands. */
                onMouseEnter={() => setAt(index)}
                onFocus={() => setAt(index)}
                onClick={() => (lane.shut ? refuse() : onPick(lane.key))}
                aria-disabled={lane.shut}
                aria-label={lane.shut
                  ? `${lane.en} — locked, ${lane.opens ?? 'not open yet'}`
                  : `${lane.en} — ${lane.desc}`}
              >
                <span className="pr-glyph" aria-hidden="true">{lane.glyph}</span>
                <span className="pr-body">
                  <span className="pr-cap"><b>{lane.en}</b><i>{lane.jp}</i></span>
                  {/* WHAT OPENED THIS LANE IS THE ROW'S OWN LINE where there is one -- THE WORLD's
                      two lanes are each a milestone's reward, and that credit is worth more on the
                      row than the foot's tally is. PRACTICE has no gate, so it keeps the foot. */}
                  <span className="pr-sum">
                    {lane.shut ? (lane.opens ?? 'NOT OPEN YET') : lane.gate?.en ?? lane.foot}
                  </span>
                </span>
                <span className="pr-tally">
                  <b>{lane.fig}</b><i>{lane.figLab}</i>
                </span>
              </button>
            )
          })}
        </div>

        {/* ─── and the one you are on, on the valley ────────────────────────────────────────── */}
        {here ? (
          <div className={here.shut ? 'pr-here shut' : 'pr-here'}>
            <span className="pr-kick">
              {here.shut ? 'NOT OPEN YET' : 'WHAT THIS IS'} <i>{here.jp}</i>
            </span>
            <b className="pr-name">{here.en}</b>
            <span className="pr-d">{here.desc}</span>

            <span className="pr-plate">
              <span className={here.absent ? 'pr-fig none' : 'pr-fig'}>
                <b>{here.fig}</b><i>{here.figLab}</i>
              </span>
              <span className="pr-foot">{here.foot}</span>
              {here.gate ? (
                <span className="wd-gate"><i aria-hidden="true">{here.gate.jp}</i>{here.gate.en}</span>
              ) : null}
              {here.items?.length ? (
                <span className="wd-list">
                  {here.items.map((item) => (
                    <span
                      key={item.jp}
                      className={`wd-item${item.hollow ? ' hollow' : ''}${item.enJp ? ' en-jp' : ''}`}
                    >
                      <b>{item.jp}</b><em>{item.en}</em><u>{item.tag}</u>
                    </span>
                  ))}
                </span>
              ) : null}
            </span>

            {/* A SHUT LANE'S SLAB SAYS WHAT OPENS IT, and it is the only place that does — the
                foot stays the foot, because a locked lane is still a lane and the whole point of
                drawing one is that you can see what is in there. */}
            <button
              type="button"
              className={['pr-slab', here.duty ? '' : 'quiet'].filter(Boolean).join(' ')}
              data-live={here.shut ? '0' : '1'}
              onClick={() => (here.shut ? refuse() : onPick(here.key))}
              aria-disabled={here.shut}
            >
              <em>{here.shut ? 'SHUT' : here.jp}</em>
              <b>{here.shut ? (here.opens ?? 'not open yet') : `${here.act} ▸`}</b>
            </button>
          </div>
        ) : null}

        <div className="pr-note">{note}</div>
        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>↑ ↓</b>Choose<em>選択</em></span>
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
