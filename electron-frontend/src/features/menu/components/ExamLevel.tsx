import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { JLPT_READY_PCT } from '../../../constants'
import type { JlptExamMode } from '../../../types'
import { EXAM_MODES, sectionLine, type LevelDetail } from '../examLevel'
import '../../../styles/stage.css'
import '../menu.css'

export interface ExamLevelProps {
  level: LevelDetail
  onStart: (mode: JlptExamMode) => void
  onUp: () => void
}

export function ExamLevel({ level, onStart, onUp }: ExamLevelProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)

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
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>検定</b><i>{level.id}</i>
          <s>この級が求めるもの · WHAT THIS LEVEL ASKS OF YOU</s>
        </div>

        <div className="lv-head">
          <b>{level.id}</b>
          <span className={`lv-state ${level.locked ? 'shut' : level.isReady ? 'ready' : ''}`}>
            {level.state}
          </span>
          <span className="lv-figs">
            <em>{level.pct}%</em>
            <s>
              <b>READY AT {JLPT_READY_PCT}%</b>
              {/* the headline reads what is LEFT, not what is done */}
              {level.locked ? 'AND SHUT UNTIL THE GATE'
                : level.shortBy ? `${level.shortBy} POINTS SHORT` : 'PAST THE LINE'}
            </s>
          </span>
        </div>

        <div className="lv-pair">
          <div className="lv-panel">
            <span className="lv-ph">何を覚えたか · WHAT YOU HAVE MASTERED</span>
            {[
              { jp: '漢字', en: 'KANJI', v: level.kanji },
              { jp: '語彙', en: 'VOCABULARY', v: level.vocab },
            ].map((r) => (
              <span key={r.en} className="lv-srow">
                <span className="lv-shead">
                  <span>{r.jp}</span><em>{r.en}</em><b>{r.v.pct}%</b>
                </span>
                <span className="lv-track"><i style={{ width: `${Math.min(100, r.v.pct)}%` }} /></span>
                <span className="lv-count">{r.v.done.toLocaleString()} / {r.v.total.toLocaleString()}</span>
              </span>
            ))}
          </div>

          <div className="lv-panel">
            <span className="lv-ph">試験が求めるもの · WHAT THE EXAM DEMANDS</span>

            {/* THE SECTION IS A SEPARATE GATE, which is the fact this screen exists to carry. */}
            <span className="lv-srow">
              <span className="lv-shead">
                <span>文字語彙・文法</span><em>THE SECTION</em>
                <b>{sectionPct === null ? '—' : `${sectionPct}%`}</b>
              </span>
              <span className={sectionPct === null ? 'lv-track none' : 'lv-track'}>
                {sectionPct === null ? null : <i style={{ width: `${Math.min(100, sectionPct)}%` }} />}
                <u className="mark" style={{ left: `${markPct}%` }} />
              </span>
              <span className="lv-count">{sectionLine(level)}</span>
            </span>

            {/* AND THE TOTAL IS HATCHED, because the app has no content for the rest of it. */}
            <span className="lv-srow">
              <span className="lv-shead">
                <span>合計</span><em>THE WHOLE EXAM</em><b>—</b>
              </span>
              <span className="lv-track none" />
              <span className="lv-count">
                PASS MARK {level.passMark} OF 180 · {level.unscored.points} POINTS OF IT ARE{' '}
                {level.unscored.papers}, WHICH THIS APP HAS NO CONTENT FOR
              </span>
            </span>

            <span className="lv-gate">
              BOTH GATES, NOT ONE — A TOTAL OVER {level.passMark} WITH THE SECTION UNDER{' '}
              {level.section.passMark} IS STILL A FAIL
            </span>
          </div>
        </div>

        <div className="lv-modes">
          {EXAM_MODES.map((m, i) => (
            <button
              key={m.key}
              type="button"
              className={i === at ? 'lv-mode on' : 'lv-mode'}
              onFocus={() => setAt(i)}
              onClick={() => !level.locked && onStart(m.key)}
              aria-disabled={level.locked}
              aria-label={`${m.label} — ${m.description}`}
            >
              <b>{m.label.toUpperCase()}</b>
              <i>{m.purpose}</i>
              <em>{m.description}</em>
            </button>
          ))}
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
