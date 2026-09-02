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

/* ONE CARD, TWO SCREENS. Three lanes across the stage or two — the card does not change, only how
   many there are and what fills them. THE WORLD passes two parts PRACTICE does not: the milestone
   that opened each lane, and the three things inside it. See the note in `lanes.ts`. */
export function Lanes({ section, jp, en, note, lanes, onPick, onUp }: LanesProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)


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
      if (event.key === 'ArrowRight') { event.preventDefault(); setAt((i) => Math.min(i + 1, lanes.length - 1)) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
      else if (event.key === 'Enter') {
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
    /* THE SECTION'S NAME IS NOT DRAWN TWICE. The note under the cards already opens with it --
       "練習 · NOTHING NEW IS TAUGHT HERE" -- which is where the mockup puts it, so the heading that
       said the same thing at the top of the stage is gone. It stays as the region's accessible
       name, because a screen reader has no note to have read yet when it announces the screen. */
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1} role="group" aria-label={`${en} ${jp}`}>
      <div className="mn-frame" ref={frameRef}>
        {/* THE SECTION IS A PROP, NOT A CONSTANT. This was hard-coded to DRILLS, so THE WORLD's
            two lanes stood under a slab reading 練 PRACTICE 練習 in PRACTICE's red -- the one thing
            the heading exists to get right, said wrong, on the only other screen that uses it. */}
        <ScreenHead head={screenHead(section, null)} />
        <div className={lanes.length === 2 ? 'lanes two' : 'lanes'}>
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
                onFocus={() => setAt(index)}
                onClick={() => (lane.shut ? refuse() : onPick(lane.key))}
                aria-disabled={lane.shut}
                aria-label={lane.shut
                  ? `${lane.en} — locked, ${lane.opens ?? 'not open yet'}`
                  : `${lane.en} — ${lane.desc}`}
              >
                <span className="pr-cap"><b>{lane.en}</b><i>{lane.jp}</i></span>
                <span className="pr-glyph" aria-hidden="true">{lane.glyph}</span>
                <span className={lane.absent ? 'pr-fig none' : 'pr-fig'}>
                  <b>{lane.fig}</b><i>{lane.figLab}</i>
                </span>
                <span className="pr-d">{lane.desc}</span>
                {lane.gate ? (
                  <span className="wd-gate"><i aria-hidden="true">{lane.gate.jp}</i>{lane.gate.en}</span>
                ) : null}
                {lane.items?.length ? (
                  <span className="wd-list">
                    {lane.items.map((item) => (
                      <span
                        key={item.jp}
                        className={`wd-item${item.hollow ? ' hollow' : ''}${item.enJp ? ' en-jp' : ''}`}
                      >
                        <b>{item.jp}</b><em>{item.en}</em><u>{item.tag}</u>
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="pr-foot">{lane.foot}</span>
                {/* A SHUT LANE'S SLAB SAYS WHAT OPENS IT, and it is the only place that does —
                    the foot stays the foot, because a locked lane is still a lane and the whole
                    point of drawing one is that you can see what is in there. */}
                <span className="pr-slab">
                  {lane.shut
                    ? (lane.opens ?? 'not open yet')
                    : index === at ? `${lane.act} · ENTER ▸` : lane.act}
                </span>
              </button>
            )
          })}
        </div>

        <div className="pr-note">{note}</div>
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
