import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FREE_TALK, type Scene } from '../scenes'
import '../../../styles/stage.css'
import '../menu.css'

export interface ScenesProps {
  scenes: readonly Scene[]
  /** the scenario id, or null for free talk */
  onPick: (scenarioId: string | null) => void
  onUp: () => void
}

/* TWO CARDS AND A STRIP. The walk runs across the scenes and then onto free talk, which is why the
   cursor goes one past the end rather than free talk being a card of its own. */
export function Scenes({ scenes, onPick, onUp }: ScenesProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)
  const last = scenes.length

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
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>会話</b><i>TALK</i>
          <s>場面を選んでください · CHOOSE A CONVERSATION</s>
        </div>

        <div className="scenes">
          {scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === at ? 'sc-card on' : 'sc-card'}
              onFocus={() => setAt(i)}
              onClick={() => onPick(s.id)}
              aria-label={`${s.en} — with the ${s.role}, ${s.objectives.length} objectives`}
            >
              {/* THE NPC IS THE CAP, because who you are talking to is the first thing you want to
                  know about a conversation, and it is the fact the scenario data leads with. */}
              <span className="sc-who"><b>{s.who}</b><i>{s.role}</i></span>
              <span className="sc-title"><b>{s.jp}</b><i>{s.en}</i></span>
              <span className="sc-d">{s.desc}</span>
              {/* required ones solid and optional ones hollow, which is the difference
                  `required: false` makes when the tutor marks you at the end */}
              <span className="sc-obj">
                {s.objectives.map((o) => (
                  <span key={o.label} className={o.required ? '' : 'opt'}>
                    <s aria-hidden="true" />{o.label}
                  </span>
                ))}
              </span>
              <span className="sc-foot">{s.foot}</span>
              <span className="sc-slab">
                {i === at ? 'START THE CONVERSATION · ENTER ▸' : 'START THE CONVERSATION'}
              </span>
            </button>
          ))}

          <button
            type="button"
            className={at === last ? 'sc-free on' : 'sc-free'}
            onFocus={() => setAt(last)}
            onClick={() => onPick(null)}
            aria-label={`${FREE_TALK.en} — ${FREE_TALK.desc}`}
          >
            <span className="g" aria-hidden="true">{FREE_TALK.glyph}</span>
            <span className="n"><b>{FREE_TALK.jp}</b><i>{FREE_TALK.en}</i></span>
            <span className="d">{FREE_TALK.desc}</span>
            <span className="k">{at === last ? `${FREE_TALK.act} · ENTER ▸` : FREE_TALK.act}</span>
          </button>
        </div>

        <button type="button" className="pj-back" onClick={onUp}>← THE WORLD</button>
        <div className="mn-hint">← → CHOOSE · ENTER STARTS · ESC GOES BACK</div>
      </div>
    </div>
  )
}
