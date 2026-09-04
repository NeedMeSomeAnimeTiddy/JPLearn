import { useEffect, useRef, useState } from 'react'
import { VOCAB_BUDGET_STEPS, type VocabFeed } from '../../vocab-feed'
import type { JlptLevel, JlptLevelProgress } from '../../../types'
import { feedAt, feedHead, feedNote, feedWindow, wordKanji, wordSize } from '../feed'
import { levelForKey } from '../levels'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { LevelBar } from './LevelBar'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface FeedProps {
  /** the milestone this screen was opened from, in the curriculum's own words */
  title: { en: string; jp: string }
  feed: VocabFeed
  /** the drill this screen's one button runs -- see the same prop on `Deck` */
  mode: string
  /* THE FIVE VOCABULARY LEVELS. The curriculum has one node for all of them, so this row is the
     only thing in the app that reaches N4 through N1 now the hub is gone. See `levels.ts`. */
  levels: readonly JlptLevelProgress[]
  level: JlptLevel
  onLevel: (level: JlptLevel) => void
  onStart: () => void
  onUp: () => void
}

export function Feed({ title, feed, mode, levels, level, onLevel, onStart, onUp }: FeedProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)

  /* SIX FOCUSABLE THINGS: the queue card, and the five budget steps. The steps are ordinary
     focusables rather than a control with an axis of its own, so ← → and Enter mean here exactly
     what they mean on every other screen in this menu — move, then pick. */
  const [at, setAt] = useState(0)
  /* which word of today's queue is being read; a queue has a front, so it opens on it */
  const [word, setWord] = useState(0)

  const head = feedHead(feed)
  const here = feedAt(feed, word)


  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])
  /* a new budget is a new queue, so the reader goes back to its front rather than holding an
     index into a list that no longer has one there */
  useEffect(() => { setWord(0) }, [feed.budget])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      /* the printed digits pick the level, stopped rather than prevented -- see `Deck` */
      const wanted = levelForKey(levels, event.key)
      if (wanted) {
        event.preventDefault()
        event.stopPropagation()
        if (wanted !== level) onLevel(wanted)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setAt((i) => Math.min(i + 1, VOCAB_BUDGET_STEPS.length))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setAt((i) => Math.max(i - 1, 0))
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        /* the queue is read on the other axis, so the budget row never has to give up ← → */
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setWord((w) => Math.max(0, Math.min(feed.words.length - 1, w + step)))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (at === 0) { onStart(); return }
        const step = VOCAB_BUDGET_STEPS[at - 1]
        if (step !== undefined) feed.setBudget(step)
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [at, feed, level, levels, onLevel, onStart])

  const kanji = here ? wordKanji(here) : null
  const win = feedWindow(feed.words.length, word)

  return (
    <div
      className={screenClass(entered)}
      ref={rootRef}
      tabIndex={-1}
      role="group"
      aria-label={`${title.en} ${title.jp}`}
    >
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('STUDY', 'feed')} />
        <LevelBar deck="VOCABULARY" levels={levels} at={level} onPick={onLevel} />
        {/* the hero's cap and the today panel already say which level this is and how many words
            are in it, so the heading at the top of the stage was the third statement of it */}
        {feed.error ? <div className="pj-empty">{feed.error.toUpperCase()}</div> : null}
        {feed.loading && !feed.words.length && !feed.error
          ? <div className="pj-empty">READING TODAY’S WORDS…</div> : null}

        {!feed.error ? (
          <>
            {/* ─── today's queue, as rows. See the note over `.fd-run` for why one hero card
                 and a rail of anonymous ticks stopped being the drawing. ──────────────── */}
            {win.list.length ? (
              <div className="fd-run" role="group" aria-label="New words today">
                {win.list.map((i) => {
                  const w = feed.words[i]
                  return (
                    <button
                      key={w.card_id}
                      type="button"
                      className={i === word ? 'fd-row on' : 'fd-row'}
                      onMouseEnter={() => setWord(i)}
                      onFocus={() => { setWord(i); setAt(0) }}
                      onClick={onStart}
                      aria-label={`${w.word}, ${w.reading} — ${w.meaning}`}
                    >
                      <span className="n">{String(i + 1).padStart(2, '0')}</span>
                      <span className="w" lang="ja">{w.word}</span>
                      <span className="m">{w.meaning}</span>
                      {/* HOW MANY OF ITS KANJI ARE NEW, which is what decides whether a word is
                          readable today. The payload says how many, never which. */}
                      <span className="s">{w.unknown_kanji ? `${w.unknown_kanji} NEW` : ''}</span>
                    </button>
                  )
                })}
                {win.behind || win.ahead ? (
                  <span className="fd-fold">
                    {win.behind ? <><b>{win.behind}</b><i>ABOVE</i></> : null}
                    {win.ahead ? <><b>{win.ahead}</b><i>BELOW</i></> : null}
                  </span>
                ) : null}
              </div>
            ) : (
              /* AN EMPTY QUEUE IS AN ABSENCE, and which absence it is matters: a budget of nought
                 is a choice you made, and a queue that ran dry is not. */
              <div className="fd-none">
                {feed.budget === 0
                  ? 'NO NEW WORDS TODAY · REVIEWS ONLY'
                  : 'NOTHING NEW IS QUEUED · REVIEWS ARE NOT CAPPED'}
              </div>
            )}

            {/* ─── and the word itself, on the valley ─────────────────────────── */}
            <div className="fd-here">
              <span className="fd-cap">
                {here ? `NEXT WORD · ${word + 1} OF ${head.queued}` : 'TODAY'}
                {' '}<i>NEW TODAY · NOT A REVIEW</i>
              </span>

              {here ? (
                <>
                  <b className="fd-word" lang="ja" style={{ fontSize: wordSize(here.word) }}>
                    {here.word}
                  </b>
                  <span className="fd-read">{here.reading.toUpperCase()}</span>
                  <span className="fd-gloss">{here.meaning}</span>
                  <span className="fd-plate">
                    {/* THE COUNT, NOT THE CULPRIT — the chips are plain and the line carries
                        the figure, because the payload never says WHICH of them is new. */}
                    <span className="fd-uses">
                      {kanji?.chars.map((ch) => <i key={ch} lang="ja">{ch}</i>)}
                      <s>{kanji?.note}</s>
                    </span>
                    <span className="fd-theme">{here.theme?.toUpperCase() || 'NO THEME'}</span>
                  </span>
                </>
              ) : (
                <>
                  <b className="fd-word" lang="ja" style={{ fontSize: 52 }}>
                    {feed.budget === 0 ? '休み' : 'しまい'}
                  </b>
                  <span className="fd-gloss">
                    {feed.budget === 0
                      ? 'No new words today — reviews only.'
                      : 'Nothing new is queued. Reviews are not capped.'}
                  </span>
                </>
              )}

              {/* the slab names the drill it runs, for the same reason the deck screen's does */}
              <button type="button" className="fd-slab" onClick={onStart}>
                <em>
                  {head.queued
                    ? `${head.queued} QUEUED · ${mode.toUpperCase()}`
                    : mode.toUpperCase()}
                </em>
                <b>{head.queued ? 'START TODAY’S WORDS' : 'GO TO REVIEWS'} ▸</b>
              </button>
            </div>

            {/* ─── the foot band: what the level is made of, and how many words a day ─────
                 THE DENOMINATORS. "Here are ten words" is a card trick without them, and these
                 three are the bridge's own counts — clearing a kanji block moves the first two. */}
            <div className="fd-mini">
              <span className="fd-denom">
                <span>
                  <b>{feed.readable.toLocaleString()} / {feed.total.toLocaleString()}</b>
                  <i>READABLE WITH THE KANJI YOU KNOW</i>
                </span>
                <span>
                  <b>{feed.started.toLocaleString()} / {feed.total.toLocaleString()}</b>
                  <i>BEGUN AT ALL</i>
                </span>
                <span>
                  <b>{feed.knownKanji.toLocaleString()}</b>
                  <i>KANJI KNOWN · THIS IS THE ORDER</i>
                </span>
              </span>
            </div>

            <div className="fd-set" role="group" aria-label="New words a day">
              <span className="fd-setlab">NEW WORDS A DAY</span>
              {VOCAB_BUDGET_STEPS.map((step, k) => (
                <button
                  key={step}
                  type="button"
                  className={`fd-step${step === feed.budget ? ' set' : ''}${at === k + 1 ? ' on' : ''}`}
                  onFocus={() => setAt(k + 1)}
                  onClick={() => feed.setBudget(step)}
                  aria-pressed={step === feed.budget}
                  disabled={feed.loading}
                  aria-label={step === 0 ? 'No new words a day' : `${step} new words a day`}
                >
                  {step === 0 ? 'NONE' : step}
                </button>
              ))}
            </div>
            <div className="fd-steplab">{feedNote(feed)}</div>
          </>
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
