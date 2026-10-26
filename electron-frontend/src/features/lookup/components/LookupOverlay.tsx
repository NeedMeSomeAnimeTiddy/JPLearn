import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { trapFocus } from '../../../lib/focusTrap'
import { bindWanakanaIme } from '../../../lib/wanakanaBinding'
import {
  ANSWERABLE_ROUTES, LOOKUP_COPY, LOOKUP_OCR_EN_CHARS, LOOKUP_REPLY_PAGE_CHARS, LOOKUP_ROUTES, LOOKUP_WORD_LIMIT,
} from '../constants'
import type { LookupAssistant, LookupController, LookupRouteKey, LookupStatus } from '../types'
import { imageFileFrom, kanjiIn, pageReply } from '../utils'
import { QuestionBody, ScreenshotBody } from './AssistantBodies'
import '../../../styles/stage.css'
import '../lookup.css'
import { boardScale } from '../../menu/useScreen'

export interface LookupOverlayProps {
  controller: LookupController
  /** hand off to the panel that already does this properly, rather than redrawing it here.
   *  `trigger` is what focus returns to when that panel closes -- the overlay's own input is
   *  gone by then, so it hands back whatever had focus before the overlay opened. */
  onOpenKanjiDetail: (character: string, trigger: HTMLElement) => void
  onOpenDictionary: (query: string) => void
  /** the tutor's chat and image translation; absent, both routes draw their no-model state */
  assistant?: LookupAssistant
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

export function LookupOverlay({ controller, onOpenKanjiDetail, onOpenDictionary, assistant }: LookupOverlayProps) {
  const {
    isOpen, close, query, setQuery, activeRoute, routePinned, setActiveRoute, stepRoute, answers, busy,
  } = controller
  const inputRef = useRef<HTMLInputElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [page, setPage] = useState(0)
  /* a dropped file that was not an image, said on A SCREENSHOT until the next image or route */
  const [fileNote, setFileNote] = useState<string | null>(null)
  useEffect(() => { if (activeRoute !== 'ocr' || !isOpen) setFileNote(null) }, [activeRoute, isOpen])

  const chat = assistant?.chat
  const ocr = assistant?.ocr
  /* the routes that can answer right now -- the arrows walk these and skip the dimmed ones */
  const live = useMemo<LookupRouteKey[]>(() => [
    ...ANSWERABLE_ROUTES,
    ...(chat?.enabled ? ['tutor' as const] : []),
    ...(ocr?.enabled ? ['ocr' as const] : []),
  ], [chat?.enabled, ocr?.enabled])

  /* THE REPLY ON SCREEN IS THE LATEST ONE, paged. A follow-up replaces it; the earlier turns are
     kept by the tutor and counted on the note line rather than stacked into a log that scrolls. */
  const lastReply = useMemo(() => {
    const turns = chat?.turns ?? []
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === 'assistant') return { turn: turns[i], key: `${turns[i].created_at_utc}-${i}` }
    }
    return null
  }, [chat?.turns])
  const replyPages = useMemo(
    () => pageReply(lastReply?.turn.content ?? '', LOOKUP_REPLY_PAGE_CHARS),
    [lastReply],
  )
  const enPages = useMemo(
    () => pageReply(ocr?.result?.englishText ?? '', LOOKUP_OCR_EN_CHARS),
    [ocr?.result?.englishText],
  )
  const pages = activeRoute === 'tutor' ? replyPages : activeRoute === 'ocr' ? enPages : []
  useEffect(() => { setPage(0) }, [lastReply?.key, ocr?.result, activeRoute])

  /* ROMAJI BECOMES KANA ONLY ON A QUESTION YOU CHOSE TO ASK. Bound while the route is pinned to A
     QUESTION -- inferred from a trailing "?", it would turn the English already typed into kana on
     the next keystroke. The same switch the conversation screen uses. */
  const romajiBound = isOpen && activeRoute === 'tutor' && routePinned && Boolean(chat?.enabled && chat.romajiEnabled)
  useEffect(() => {
    const element = inputRef.current
    if (!romajiBound || !element) return
    return bindWanakanaIme(element, 'toHiragana')
  }, [romajiBound])

  /* the board is 1280x720 and the window is not, so it is scaled to fit -- the same `--u` the
     menu will use in phase 2, computed here because this is the first screen to need it */
  useLayoutEffect(() => {
    if (!isOpen) return
    const fit = () => {
      const u = boardScale()
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
  /* the two model routes carry a count once they have one -- pages of a reply, lines of an image */
  const markOf = (key: LookupRouteKey): string => {
    if (key === 'tutor') {
      if (chat?.loading) return '…'
      if (chat?.error) return '!'
      return replyPages.length > 0 ? String(replyPages.length) : ''
    }
    if (key === 'ocr') {
      if (ocr?.busy) return '…'
      if (ocr?.error) return '!'
      return ocr?.result ? String(ocr.result.lines.length) : ''
    }
    return mark(statusOf(key))
  }

  /* AN IMAGE IS A SCREENSHOT, however it arrives -- picked, pasted or dropped. It goes to A
     SCREENSHOT whether or not that route can answer, so a paste with no model lands on the sentence
     that says what is missing rather than on nothing. */
  const takeImage = (file: File) => {
    setFileNote(null)
    setActiveRoute('ocr')
    if (ocr?.enabled && !ocr.busy) ocr.submit(file)
  }

  const handoff = () => {
    const trimmed = query.trim()
    if (activeRoute === 'tutor') {
      if (!trimmed || !chat?.enabled || chat.loading) return
      chat.send(trimmed)
      /* the question stays in the field, selected, so the next keystroke is the follow-up */
      setActiveRoute('tutor')
      window.setTimeout(() => inputRef.current?.select(), 0)
      return
    }
    if (activeRoute === 'ocr') {
      if (ocr?.enabled && !ocr.busy) fileInputRef.current?.click()
      return
    }
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
    /* AN INPUT METHOD STILL COMPOSING OWNS EVERY KEY: its ENTER picks the kanji and its ESC drops the
       candidate. Neither is a lookup, nor a close. 229 is what browsers report for its keys. The
       key goes no further either -- the app's own ESC would close the sheet -- but its default is
       left alone, because that default is the input method's. */
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      event.stopPropagation()
      return
    }
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
    /* A PAGED ANSWER TAKES THE UP AND DOWN ARROWS for its pages, and the routes stay on Alt with the
       side arrows -- the same pair that has always walked them without moving the caret */
    if (pages.length > 1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'PageDown' || event.key === 'PageUp')) {
      event.preventDefault()
      const by = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1
      setPage((p) => Math.max(0, Math.min(pages.length - 1, p + by)))
      return
    }
    /* the arrows walk the routes, but only when they are not being used to move the caret */
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') || (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'))) {
      event.preventDefault()
      stepRoute(event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1, live)
    }
  }

  const onPaste = (event: React.ClipboardEvent) => {
    const file = imageFileFrom(event.clipboardData)
    if (!file) return
    event.preventDefault()
    takeImage(file)
  }

  /* EVERY FILE DROP IS CANCELLED BEFORE IT IS LOOKED AT. Left to the browser, a dropped file is a
     navigation -- a text or HTML file would replace the app with itself -- so the default goes
     first, and only then is the file asked whether it is an image. Dragged text is not a file and
     is left to the field. */
  const onDrop = (event: React.DragEvent) => {
    const data = event.dataTransfer
    const carriesFiles = (data?.files?.length ?? 0) > 0 || Boolean(data?.types?.includes('Files'))
    if (!carriesFiles) return
    event.preventDefault()
    const file = imageFileFrom(data)
    if (file) {
      takeImage(file)
      return
    }
    const name = data?.files?.[0]?.name
    setActiveRoute('ocr')
    setFileNote(`${name ? `“${name}”` : 'That file'} ${LOOKUP_COPY.notAnImage}`)
  }

  const answerable = live.length
  const hint = (() => {
    if (activeRoute === 'tutor' && !chat?.enabled) return 'CTRL+, OPENS SETTINGS · ↑ ↓ ROUTE · ESC CLOSES'
    if (activeRoute === 'ocr' && !ocr?.enabled) return 'CTRL+, OPENS SETTINGS · ↑ ↓ ROUTE · ESC CLOSES'
    if (activeRoute === 'tutor') {
      return `${pages.length > 1 ? '↓ NEXT PAGE · ALT ← → ROUTE' : '↑ ↓ ROUTE'} · ENTER ASKS · ESC CLOSES`
    }
    if (activeRoute === 'ocr') {
      return `${pages.length > 1 ? '↓ NEXT PAGE · ALT ← → ROUTE' : '↑ ↓ ROUTE'} · CTRL+V ANOTHER IMAGE · ENTER PICKS A FILE · ESC CLOSES`
    }
    return '↑ ↓ ROUTE · ENTER OPENS IT IN FULL · ESC CLOSES'
  })()

  /* PORTALLED TO THE BODY, because z-index is only ever a rank within a stacking context. Rendered
     in place, the sheet sits inside App's tree and the window titlebar paints straight through it
     -- measured: elementFromPoint over the titlebar returned the titlebar, not the scrim, at
     z-index 10050. A modal has to escape its ancestors, not out-number them. */
  return createPortal(
    <div
      className="lk-open"
      role="dialog"
      aria-modal="true"
      aria-label="Look it up"
      /* a modal keeps Tab inside it -- the sheet and its routes, not the page under the scrim */
      onKeyDown={(event) => { if (frameRef.current) trapFocus(event, frameRef.current) }}
      onPaste={onPaste}
      onDragOver={(event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault() }}
      onDrop={onDrop}
    >
      <button type="button" className="lk-scrim" aria-label="Close lookup" onClick={close} />
      <div className="lk-frame" ref={frameRef}>
        <div className="lk-sheet">
          <div className="lk-cap">
            <b>引く</b><i>LOOK IT UP</i>
            <s>ONE FIELD · {answerable === 5 ? 'FIVE' : answerable === 4 ? 'FOUR' : 'THREE'} ANSWERS · ANY LEVEL</s>
          </div>

          <div className="lk-field">
            <span className="q" aria-hidden="true">/</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={activeRoute === 'tutor' ? LOOKUP_COPY.chatPlaceholder
                : activeRoute === 'ocr' ? LOOKUP_COPY.ocrPlaceholder : LOOKUP_COPY.wordPlaceholder}
              aria-label="What to look up"
              maxLength={activeRoute === 'tutor' && chat ? chat.charLimit : undefined}
              spellCheck={false}
              autoComplete="off"
            />
            <span className={busy ? 'lk-route busy' : 'lk-route'}>
              {activeRoute === 'tutor' && chat?.enabled && query.length > 0
                ? `${query.length} / ${chat.charLimit}`
                : route.command}
            </span>
          </div>

          {activeRoute === 'tutor' ? (
            <QuestionBody chat={chat} pages={replyPages} page={page} replyKey={lastReply?.key ?? null} />
          ) : activeRoute === 'ocr' ? (
            <ScreenshotBody ocr={ocr} fileInputRef={fileInputRef} enPages={enPages} page={page} fileNote={fileNote} />
          ) : (
            <LookupAnswerBody controller={controller} />
          )}

          <div className="lk-routes">
            {LOOKUP_ROUTES.map((entry) => {
              const answerableNow = live.includes(entry.key)
              const classes = ['lk-r']
              if (entry.key === activeRoute) classes.push('on')
              if (!answerableNow) classes.push('off')
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={classes.join(' ')}
                  disabled={!answerableNow}
                  aria-pressed={entry.key === activeRoute}
                  title={entry.needsModel && !answerableNow
                    ? `${entry.command}: ${(entry.key === 'tutor' ? chat?.disabledReason : ocr?.disabledReason) ?? 'not in this build.'}`
                    : entry.command}
                  onClick={() => answerableNow && setActiveRoute(entry.key)}
                >
                  <u aria-hidden="true">{answerableNow ? markOf(entry.key) : ''}</u>
                  <b>{entry.en}</b>
                  <i>{entry.jp}</i>
                </button>
              )
            })}
          </div>
        </div>
        <div className="lk-hint">{hint}</div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="lk-file"
        tabIndex={-1}
        aria-label="Pick an image to translate"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) takeImage(file)
        }}
      />
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
