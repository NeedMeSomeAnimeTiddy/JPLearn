import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ANSWERABLE_ROUTES, LOOKUP_ROUTES, LOOKUP_WORD_LIMIT } from '../constants'
import type { LookupController, LookupRouteKey, LookupStatus } from '../types'
import { kanjiIn } from '../utils'
import '../lookup.css'

export interface LookupOverlayProps {
  controller: LookupController
  /** hand off to the panel that already does this properly, rather than redrawing it here.
   *  `trigger` is what focus returns to when that panel closes -- the overlay's own input is
   *  gone by then, so it hands back whatever had focus before the overlay opened. */
  onOpenKanjiDetail: (character: string, trigger: HTMLElement) => void
  onOpenDictionary: (query: string) => void
}

/** a one-word state for the route strip, so you can see where the answers are without visiting */
function mark(status: LookupStatus): string {
  if (status === 'ready') return '·'
  if (status === 'searching') return '…'
  if (status === 'unavailable') return '—'
  if (status === 'error') return '!'
  if (status === 'empty') return '0'
  return ''
}

function Line({ label, value, absent, jp }: {
  label: string; value: string; absent?: boolean; jp?: boolean
}) {
  return (
    <span className={absent ? 'lk-line none' : 'lk-line'}>
      <em>{label}</em>
      <span className={jp && !absent ? 'jp' : undefined}>{value}</span>
    </span>
  )
}

export function LookupOverlay({ controller, onOpenKanjiDetail, onOpenDictionary }: LookupOverlayProps) {
  const { isOpen, close, query, setQuery, activeRoute, setActiveRoute, stepRoute, answers, busy } = controller
  const inputRef = useRef<HTMLInputElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  /* the board is 1280x720 and the window is not, so it is scaled to fit -- the same `--u` the
     menu will use in phase 2, computed here because this is the first screen to need it */
  useLayoutEffect(() => {
    if (!isOpen) return
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
      frameRef.current?.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      restoreFocusRef.current?.focus?.()
      restoreFocusRef.current = null
      return
    }
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  if (!isOpen) return null

  const route = LOOKUP_ROUTES.find((entry) => entry.key === activeRoute) ?? LOOKUP_ROUTES[1]
  const statusOf = (key: LookupRouteKey): LookupStatus => {
    if (key === 'kanji') return answers.kanji.status
    if (key === 'word') return answers.word.status
    if (key === 'phrase') return answers.phrase.status
    return 'unavailable'
  }

  const handoff = () => {
    const trimmed = query.trim()
    if (!trimmed) return
    const trigger = restoreFocusRef.current ?? document.body
    if (activeRoute === 'kanji' && answers.kanji.detail) {
      close()
      onOpenKanjiDetail(answers.kanji.detail.character, trigger)
      return
    }
    close()
    onOpenDictionary(trimmed)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      handoff()
      return
    }
    /* the arrows walk the routes, but only when they are not being used to move the caret */
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') || (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'))) {
      event.preventDefault()
      stepRoute(event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1)
    }
  }

  /* PORTALLED TO THE BODY, because z-index is only ever a rank within a stacking context. Rendered
     in place, the sheet sits inside App's tree and the window titlebar paints straight through it
     -- measured: elementFromPoint over the titlebar returned the titlebar, not the scrim, at
     z-index 10050. A modal has to escape its ancestors, not out-number them. */
  return createPortal(
    <div className="lk-open" role="dialog" aria-modal="true" aria-label="Look it up">
      <button type="button" className="lk-scrim" aria-label="Close lookup" onClick={close} />
      <div className="lk-frame" ref={frameRef}>
        <div className="lk-sheet">
          <div className="lk-cap">
            <b>引く</b><i>LOOK IT UP</i>
            <s>ONE FIELD · THREE ANSWERS · ANY LEVEL</s>
          </div>

          <div className="lk-field">
            <span className="q" aria-hidden="true">/</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="a kanji, a word, a phrase"
              aria-label="What to look up"
              spellCheck={false}
              autoComplete="off"
            />
            <span className={busy ? 'lk-route busy' : 'lk-route'}>{route.command}</span>
          </div>

          <LookupAnswerBody controller={controller} />

          <div className="lk-routes">
            {LOOKUP_ROUTES.map((entry) => {
              const answerable = ANSWERABLE_ROUTES.includes(entry.key)
              const classes = ['lk-r']
              if (entry.key === activeRoute) classes.push('on')
              if (!answerable) classes.push('off')
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={classes.join(' ')}
                  disabled={!answerable}
                  aria-pressed={entry.key === activeRoute}
                  title={entry.needsModel ? `${entry.command} needs a running model` : entry.command}
                  onClick={() => answerable && setActiveRoute(entry.key)}
                >
                  <u aria-hidden="true">{answerable ? mark(statusOf(entry.key)) : ''}</u>
                  <b>{entry.en}</b>
                  <i>{entry.jp}</i>
                </button>
              )
            })}
          </div>
        </div>
        <div className="lk-hint">↑ ↓ ROUTE · ENTER OPENS IT IN FULL · ESC CLOSES</div>
      </div>
    </div>,
    document.body,
  )
}

function LookupAnswerBody({ controller }: { controller: LookupController }) {
  const { query, activeRoute, answers } = controller
  const trimmed = query.trim()

  if (!trimmed) {
    return (
      <>
        <div className="lk-ans">
          <span className="lk-big" aria-hidden="true">引</span>
          <span className="lk-body">
            <Line label="KANJI" value="one character asks kanji-detail for its level and parts" />
            <Line label="A WORD" value="anything longer searches the dictionary and your decks" />
            <Line label="A PHRASE" value="every query also looks for a sentence that contains it" />
          </span>
        </div>
        <div className="lk-note quiet">TYPE TO LOOK SOMETHING UP · THIS WORKS FROM ANYWHERE IN THE APP</div>
      </>
    )
  }

  if (activeRoute === 'kanji') {
    const { status, detail, reason } = answers.kanji
    return (
      <>
        <div className="lk-ans">
          <span className="lk-big" aria-hidden="true">{detail?.character ?? trimmed}</span>
          <span className="lk-body">
            {status === 'searching' ? <Line label="KANJI" value="asking…" absent /> : null}
            {status === 'unavailable' ? <Line label="UNAVAILABLE" value={reason ?? 'not installed'} absent /> : null}
            {status === 'error' ? <Line label="FAILED" value={reason ?? 'unknown error'} absent /> : null}
            {status === 'empty' ? <Line label="NOTHING" value={reason ?? 'no entry'} absent /> : null}
            {detail ? (
              <>
                <Line
                  label="LEVEL"
                  value={detail.jlpt_level
                    ? `${detail.jlpt_level}${detail.jlpt_level_source ? ` · from the ${detail.jlpt_level_source}` : ''}`
                    : 'no JLPT level recorded for this character'}
                  absent={!detail.jlpt_level}
                />
                <Line
                  label="MEANINGS"
                  value={detail.meanings.length
                    ? detail.meanings.slice(0, 6).join(', ')
                    : 'English meanings need the offline dictionary'}
                  absent={!detail.meanings.length}
                />
                <Line
                  label="READINGS"
                  value={[...detail.on_readings, ...detail.kun_readings].length
                    ? [...detail.on_readings, ...detail.kun_readings].slice(0, 8).map((r) => r.reading).join('  ')
                    : 'on and kun readings need the offline dictionary'}
                  absent={![...detail.on_readings, ...detail.kun_readings].length}
                  jp
                />
                {detail.components.length ? (
                  <span className="lk-line">
                    <em>COMPONENTS</em>
                    <span className="lk-chips">
                      {detail.components.map((component) => <i key={component}>{component}</i>)}
                    </span>
                  </span>
                ) : null}
                <Line
                  label="STROKES"
                  value={detail.stroke_count != null ? String(detail.stroke_count) : 'the stroke count needs the offline dictionary'}
                  absent={detail.stroke_count == null}
                />
              </>
            ) : null}
          </span>
        </div>
        <div className={detail && !detail.meanings.length ? 'lk-note' : 'lk-note quiet'}>
          {detail && !detail.meanings.length
            ? 'THE OFFLINE DICTIONARY IS NOT INSTALLED · WHAT IS SHOWN IS THE COMMITTED DATA'
            : `SOURCE: ${detail?.source ?? 'kanji-detail'}`}
        </div>
      </>
    )
  }

  if (activeRoute === 'word') {
    const { status, results, source, reason } = answers.word
    const shown = results.slice(0, LOOKUP_WORD_LIMIT)
    return (
      <>
        <div className="lk-ans">
          {/* one character gets the full 68px tile; anything longer has to be set smaller or it
              climbs straight out of the box -- 学校 at 68px overflows a 116px square */}
          <span
            className={Array.from(trimmed).length > 1 ? 'lk-big small' : 'lk-big'}
            aria-hidden="true"
          >{trimmed}</span>
          <span className="lk-body">
            {status === 'searching' ? <Line label="DICTIONARY" value="searching…" absent /> : null}
            {status === 'unavailable' ? <Line label="DICTIONARY" value={reason ?? 'not installed'} absent /> : null}
            {status === 'error' ? <Line label="FAILED" value={reason ?? 'unknown error'} absent /> : null}
            {status === 'empty' ? <Line label="NOTHING" value={reason ?? 'no match'} absent /> : null}
            {shown.map((item) => (
              <span className="lk-line" key={item.note_key || `${item.id}`}>
                <em>{item.romaji || '—'}</em>
                <span className="jp">{item.character}<span style={{ fontSize: 12, opacity: 0.7 }}>{'　'}{item.meaning}</span></span>
              </span>
            ))}
          </span>
        </div>
        <div className="lk-note quiet">
          {status === 'ready' && source === 'loaded_cards'
            ? 'FROM YOUR OWN DECKS · THE OFFLINE DICTIONARY WOULD ANSWER MORE THAN THIS'
            : status === 'ready'
              ? `${results.length} RESULT${results.length === 1 ? '' : 'S'} · OFFLINE DICTIONARY`
              : 'A WORD IS ANSWERED FROM THE DICTIONARY, AND FROM THE CARDS YOU ALREADY HAVE'}
        </div>
      </>
    )
  }

  const { status, sentence, reason } = answers.phrase
  const marks = kanjiIn(trimmed)
  return (
    <>
      <div className="lk-ans">
        <span className="lk-big" aria-hidden="true">{marks[0] ?? '例'}</span>
        <span className="lk-body">
          {status === 'searching' ? <Line label="SENTENCE" value="searching…" absent /> : null}
          {status === 'unavailable' ? <Line label="SENTENCE" value={reason ?? 'unavailable'} absent /> : null}
          {status === 'error' ? <Line label="FAILED" value={reason ?? 'unknown error'} absent /> : null}
          {status === 'empty' ? <Line label="SENTENCE" value={reason ?? 'nothing found'} absent /> : null}
          {sentence?.jp ? (
            <>
              <Line label="SENTENCE" value={sentence.jp} jp />
              <Line label="READING" value={sentence.romaji ?? 'no reading recorded'} absent={!sentence.romaji} />
              <Line label="ENGLISH" value={sentence.en ?? 'no translation recorded'} absent={!sentence.en} />
            </>
          ) : null}
        </span>
      </div>
      <div className="lk-note quiet">
        FOUND IN THE SENTENCE DECK · THE FIRST OF ITS ROWS THAT CONTAINS WHAT YOU TYPED
      </div>
    </>
  )
}
