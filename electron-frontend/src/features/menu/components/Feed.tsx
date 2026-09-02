import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { VOCAB_BUDGET_STEPS, type VocabFeed } from '../../vocab-feed'
import { feedAt, feedHead, feedNote, wordKanji, wordSize } from '../feed'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface FeedProps {
  /** the milestone this screen was opened from, in the curriculum's own words */
  title: { en: string; jp: string }
  feed: VocabFeed
  onStart: () => void
  onUp: () => void
}

export function Feed({ title, feed, onStart, onUp }: FeedProps) {
  const entered = useEntered()
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  /* SIX FOCUSABLE THINGS: the queue card, and the five budget steps. The steps are ordinary
     focusables rather than a control with an axis of its own, so ← → and Enter mean here exactly
     what they mean on every other screen in this menu — move, then pick. */
  const [at, setAt] = useState(0)
  /* which word of today's queue is being read; a queue has a front, so it opens on it */
  const [word, setWord] = useState(0)

  const head = feedHead(feed)
  const here = feedAt(feed, word)

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
  /* a new budget is a new queue, so the reader goes back to its front rather than holding an
     index into a list that no longer has one there */
  useEffect(() => { setWord(0) }, [feed.budget])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
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
  }, [at, feed, onStart])

  const kanji = here ? wordKanji(here) : null

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
        {/* the hero's cap and the today panel already say which level this is and how many words
            are in it, so the heading at the top of the stage was the third statement of it */}
        {feed.error ? <div className="pj-empty">{feed.error.toUpperCase()}</div> : null}
        {feed.loading && !feed.words.length && !feed.error
          ? <div className="pj-empty">READING TODAY’S WORDS…</div> : null}

        {!feed.error ? (
          <>
            <div className="fd-wrap">
              {/* THE WORD AT THE FRONT OF THE QUEUE */}
              <button
                type="button"
                className={`fd-f fd-hero${at === 0 ? ' on' : ''}`}
                onFocus={() => setAt(0)}
                onClick={onStart}
                aria-label={here
                  ? `${here.word}, ${here.reading} — ${here.meaning}`
                  : 'No new words queued today'}
              >
                <span className="fd-cap">
                  <b>{here ? `次の語 NEXT WORD · ${word + 1} OF ${head.queued}` : '今日 TODAY'}</b>
                  <i>NEW TODAY · NOT A REVIEW</i>
                </span>

                {here ? (
                  <span className="fd-body">
                    <span className="fd-word" lang="ja" style={{ fontSize: wordSize(here.word) }}>
                      {here.word}
                    </span>
                    <span className="fd-read">{here.reading.toUpperCase()}</span>
                    <span className="fd-gloss">{here.meaning}</span>
                    {/* THE COUNT, NOT THE CULPRIT — the payload says how many of these are new,
                        never which, so the chips are plain and the line carries the figure. */}
                    <span className="fd-uses">
                      {kanji?.chars.map((ch) => <i key={ch} lang="ja">{ch}</i>)}
                      <s>{kanji?.note}</s>
                    </span>
                  </span>
                ) : (
                  <span className="fd-body">
                    <span className="fd-word" lang="ja" style={{ fontSize: 44 }}>
                      {feed.budget === 0 ? '休み' : 'しまい'}
                    </span>
                    <span className="fd-gloss">
                      {feed.budget === 0
                        ? 'No new words today — reviews only.'
                        : 'Nothing new is queued. Reviews are not capped.'}
                    </span>
                  </span>
                )}

                <span className="fd-theme">{here?.theme?.toUpperCase() || 'NO THEME'}</span>
                <span className="fd-slab">
                  <em>{head.queued ? `${head.queued} QUEUED` : 'NOTHING QUEUED'}</em>
                  <b>{head.queued ? 'START TODAY’S WORDS' : 'GO TO REVIEWS'} ▸</b>
                </span>
              </button>

              {/* THE METER THAT REPLACED THE BLOCK GATE */}
              <div className="fd-today">
                <span className="fd-cap"><b>今日 TODAY</b><i>NEW WORDS A DAY</i></span>
                {/* THE PANEL'S HEADLINE FIGURE. `next_words` returns what has not been started, so
                    this is what is queued rather than what is left of a day's ration -- the app has
                    no "done today" to subtract. The line under it says which. */}
                <span className="fd-count">
                  <b>{head.queued}</b>
                  <span>
                    <em>{head.queued === 1 ? 'WORD QUEUED' : 'WORDS QUEUED'}</em>
                    <i>
                      {feed.budget === 0 ? 'NO NEW WORDS SET' : `BUDGET IS ${feed.budget} A DAY`}
                    </i>
                  </span>
                </span>
                <span className="fd-steps">
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
                </span>
                <span className="fd-steplab">{feedNote(feed)}</span>

                {/* THE DENOMINATORS. "Here are ten words" is a card trick without them, and these
                    three are the bridge's own counts — clearing a kanji block moves the first two. */}
                <span className="fd-denom three">
                  <span>
                    <b>{feed.readable.toLocaleString()} / {feed.total.toLocaleString()}</b>
                    <i>READABLE WITH THE KANJI YOU KNOW</i>
                    <u style={{ width: `${head.readablePct}%` }} />
                  </span>
                  <span>
                    <b>{feed.started.toLocaleString()} / {feed.total.toLocaleString()}</b>
                    <i>BEGUN AT ALL</i>
                    <u style={{ width: `${head.startedPct}%` }} />
                  </span>
                  <span>
                    <b>{feed.knownKanji.toLocaleString()}</b>
                    <i>KANJI KNOWN · THIS IS THE ORDER</i>
                  </span>
                </span>
              </div>
            </div>

            {/* THE RAIL MARKS POSITION, NOT PROGRESS. `next_words` returns what has NOT been
                started, so studying a word removes it from the list rather than ticking it — the
                queue is recomputed, never consumed, and there is no "done today" to draw. */}
            <div className="fd-rail">
              <span className="fd-segrow" aria-hidden="true">
                {head.queued
                  ? feed.words.map((entry, index) => (
                    <i key={entry.card_id} className={index === word ? 'here' : ''} />
                  ))
                  : <span className="fd-none">NO NEW WORDS QUEUED TODAY</span>}
              </span>
              <span className="fd-railcap">
                <span>{head.queued ? 'FIRST' : ''}</span>
                <span>
                  {head.queued
                    ? `${head.queued} QUEUED · THE LIST IS REBUILT, NOT TICKED OFF`
                    : 'REVIEWS ONLY'}
                  {' · '}{head.readablePct}% OF THE LEVEL IS READABLE
                </span>
                <span>{head.queued ? 'LAST' : ''}</span>
              </span>
            </div>
          </>
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
