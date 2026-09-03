import { useEffect, useRef, useState } from 'react'
import { JLPT_READY_PCT } from '../../../constants'
import type { JlptExamMode } from '../../../types'
import { EXAM_MODES, sectionLine, type LevelDetail } from '../examLevel'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { refuse } from '../refuse'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface ExamLevelProps {
  level: LevelDetail
  onStart: (mode: JlptExamMode) => void
  onUp: () => void
}

export function ExamLevel({ level, onStart, onUp }: ExamLevelProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)


  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); setAt((i) => Math.min(i + 1, EXAM_MODES.length - 1)) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
      else if (event.key === 'Enter') {
        event.preventDefault()
        if (!level.locked) onStart(EXAM_MODES[at].key)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, level.locked, onStart])

  const sectionPct = level.section.projected === null
    ? null
    : Math.round((level.section.projected / level.section.max) * 100)
  const markPct = Math.round((level.section.passMark / level.section.max) * 100)

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead
          head={screenHead('JLPT', 'level', { en: level.id, jp: '級' })}
          note="WHAT THIS LEVEL ASKS OF YOU"
        />

        {/* ─── the four ways in, as lines. See the note above `.lv-modes` for why a mode
             stopped being a 220x98 card carrying 9px labels. ─────────────────────────────── */}
        <div className="lv-modes">
          <span className="lv-lead">FOUR WAYS TO WORK THIS LEVEL</span>
          <div className="lv-list">
            {EXAM_MODES.map((m, i) => (
              <button
                key={m.key}
                type="button"
                /* THREE STATES THE STYLESHEET HAS ALWAYS DRAWN. `.duty` puts the one vermilion on
                   the mode that is an obligation, `.shut` greys a locked level's rows. */
                className={[
                  'lv-mode',
                  i === at ? 'on' : '',
                  m.duty ? 'duty' : '',
                  level.locked ? 'shut' : '',
                ].filter(Boolean).join(' ')}
                onFocus={() => setAt(i)}
                onClick={() => (level.locked ? refuse() : onStart(m.key))}
                aria-disabled={level.locked}
                aria-label={`${m.label} — ${m.description}`}
              >
                <span className="g" aria-hidden="true">{m.mark}</span>
                <span className="t">
                  <b>{m.label.toUpperCase()}</b>
                  <i>{m.description}</i>
                </span>
                <u>{m.purpose}</u>
              </button>
            ))}
          </div>
        </div>

        {/* ─── and the reading, on one plate ────────────────────────────────────────────── */}
        <div className="lv-read">
          <span className="lv-cap"><s>手応え</s>  HOW READY YOU ARE</span>
          <span className="lv-figs">
            <em>{level.pct}%</em>
            <s>
              <b>READY AT {JLPT_READY_PCT}%</b>
              {/* the headline reads what is LEFT, not what is done */}
              <i>{level.locked ? 'AND SHUT UNTIL THE GATE'
                : level.shortBy ? `${level.shortBy} POINTS SHORT` : 'PAST THE LINE'}</i>
            </s>
          </span>

          <span className="lv-bars">
            {[
              { jp: '漢字', en: 'KANJI', v: level.kanji },
              { jp: '語彙', en: 'VOCABULARY', v: level.vocab },
            ].map((r) => (
              <span key={r.en} className="lv-bar">
                <span>
                  <span className="jp">{r.jp}</span>
                  <span className="en">{r.en}</span>
                  <b>{r.v.done.toLocaleString()} <s>/ {r.v.total.toLocaleString()}</s></b>
                </span>
                <span className="lv-track"><i style={{ width: `${Math.min(100, r.v.pct)}%` }} /></span>
              </span>
            ))}

            {/* THE SECTION IS A SEPARATE GATE, which is the fact this screen exists to carry. */}
            <span className="lv-bar">
              <span>
                <span className="jp">文字語彙・文法</span>
                <span className="en">THE SECTION</span>
                <b>{sectionPct === null ? '—' : `${sectionPct}%`}</b>
              </span>
              <span className={sectionPct === null ? 'lv-track none' : 'lv-track'}>
                {sectionPct === null ? null : <i style={{ width: `${Math.min(100, sectionPct)}%` }} />}
                <u className="mark" style={{ left: `${markPct}%` }} />
              </span>
              <span className="lv-mock">{sectionLine(level)}</span>
            </span>
          </span>

          <span className="lv-foot">
            <b>BOTH GATES, NOT ONE</b>
            {/* TWO SENTENCES, NOT THREE. The plate has to fit the band, and the third was the
                mock line -- which the section bar above already carries as a figure. */}
            <i>
              A total over {level.passMark} with the section under {level.section.passMark} is
              still a fail. {level.unscored.points} of the 180 are {level.unscored.papers.toLowerCase()},
              which this app has no content for.
            </i>
          </span>
        </div>

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
