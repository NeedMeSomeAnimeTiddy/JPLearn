import { useEffect, useRef, useState } from 'react'
import { FREE_TALK, type Scene } from '../scenes'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface ScenesProps {
  scenes: readonly Scene[]
  /** null is free talk, which is the one entry that is not a scenario */
  onPick: (id: string | null) => void
  onUp: () => void
}

/* ==================================================================================================
   THE CONVERSATIONS — READING's level three, as a ledger. See the note over `.sc-run`.

   FREE TALK IS THE LAST ROW, NOT A DIFFERENT SHAPE. It sat under the two cards as a strip of its
   own because it is not authored content with a start and an end — but that difference is a fact
   about what it IS, not about how it is chosen, and it was already on the same cursor.
   ================================================================================================== */

export function Scenes({ scenes, onPick, onUp }: ScenesProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)
  const last = scenes.length

  const here = at === last ? null : scenes[at]

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault(); setAt((i) => Math.min(i + 1, last))
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault(); setAt((i) => Math.max(i - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        onPick(at === last ? null : scenes[at]?.id ?? null)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, last, scenes, onPick])

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead
          head={screenHead('READING', 'scenes')}
          note="CHOOSE A CONVERSATION"
        />

        {/* ─── every conversation, as rows ──────────────────────────────────────────────────── */}
        <div className="sc-run" role="group" aria-label="Conversations">
          {scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === at ? 'sc-row on' : 'sc-row'}
              onMouseEnter={() => setAt(i)}
              onFocus={() => setAt(i)}
              onClick={() => onPick(s.id)}
              aria-label={`${s.en} — with the ${s.role}, ${s.objectives.length} objectives`}
            >
              <span className="g num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <span className="t">
                <b>{s.en}</b>
                {/* WHO YOU ARE TALKING TO, on the row as well as the poster: two conversations
                    with the same shape are told apart by who is in them. */}
                <i>{s.who.toUpperCase()} · {s.role.toUpperCase()}</i>
              </span>
              <span className="s">{s.objectives.length} STEPS</span>
            </button>
          ))}

          <button
            type="button"
            className={at === last ? 'sc-row on' : 'sc-row'}
            onMouseEnter={() => setAt(last)}
            onFocus={() => setAt(last)}
            onClick={() => onPick(null)}
            aria-label={`${FREE_TALK.en} — ${FREE_TALK.desc}`}
          >
            <span className="g" aria-hidden="true">{FREE_TALK.glyph}</span>
            <span className="t">
              <b>{FREE_TALK.en}</b>
              <i>NO SCRIPT · NO OBJECTIVES</i>
            </span>
            <span className="s">OPEN</span>
          </button>
        </div>

        {/* ─── and the one you are on, on the valley ────────────────────────────────────────── */}
        <div className="sc-here">
          {here ? (
            <>
              <span className="sc-who">WITH THE <i>{here.role.toUpperCase()}</i> · {here.who.toUpperCase()}</span>
              <span className="sc-title"><i>{here.en}</i><b>{here.jp}</b></span>
              <span className="sc-d">{here.desc}</span>
              <span className="sc-plate">
                <span className="sc-cap">WHAT THE TUTOR MARKS YOU ON</span>
                <span className="sc-obj">
                  {here.objectives.map((o) => (
                    <span key={o.label} className={o.required ? '' : 'opt'}>
                      <s aria-hidden="true" />{o.label}
                    </span>
                  ))}
                </span>
                <span className="sc-foot">{here.foot}</span>
              </span>
              <button type="button" className="sc-slab" onClick={() => onPick(here.id)}>
                <em>{here.who.toUpperCase()}</em>
                <b>START THE CONVERSATION ▸</b>
              </button>
            </>
          ) : (
            <>
              <span className="sc-who">NOT A SCENARIO · <i>{FREE_TALK.jp}</i></span>
              <span className="sc-title"><i>{FREE_TALK.en}</i><b>{FREE_TALK.jp}</b></span>
              <span className="sc-d">{FREE_TALK.desc}</span>
              <span className="sc-plate">
                <span className="sc-cap">WHAT THE TUTOR MARKS YOU ON</span>
                <span className="sc-obj">
                  <span className="opt"><s aria-hidden="true" />Nothing — there are no objectives to meet</span>
                </span>
                <span className="sc-foot">WHAT YOU GET WRONG BECOMES CARDS</span>
              </span>
              <button type="button" className="sc-slab" onClick={() => onPick(null)}>
                <em>{FREE_TALK.jp}</em>
                <b>{FREE_TALK.act} ▸</b>
              </button>
            </>
          )}
        </div>

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
