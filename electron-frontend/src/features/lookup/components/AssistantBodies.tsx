import type { RefObject } from 'react'
import { Volume2 } from 'lucide-react'
import { LOOKUP_COPY, LOOKUP_GATE_COPY, LOOKUP_OCR_LINES } from '../constants'
import type { LookupChat, LookupOcr } from '../types'

/* ==================================================================================================
   A QUESTION AND A SCREENSHOT — the two routes that need a model, drawn on the lookup's own answer
   area (tools.html, option A, plates 8a-8c). Each has three states: no model (the app's own
   sentence for why, and where to fix it), waiting, and answered. Nothing scrolls: a long reply
   pages, and the OCR lines are the ones the image had.
   ================================================================================================== */

function NoModel({ title, reason, help }: { title: string; reason: string; help: string }) {
  return (
    <div className="lk-ans">
      <div className="lk-nomodel" role="status">
        <h3>{title}</h3>
        <p className="bad">{reason}</p>
        <p>{help}</p>
      </div>
    </div>
  )
}

/** the calm chips a conversation needs within reach: sound, romaji and starting over */
function ChatChips({ chat }: { chat: LookupChat }) {
  return (
    <span className="lk-chips-row">
      <button
        type="button"
        className={chat.audioEnabled ? 'lk-chip on' : 'lk-chip'}
        aria-pressed={chat.audioEnabled}
        onClick={chat.toggleAudio}
      >
        SOUND {chat.audioEnabled ? 'ON' : 'OFF'}
      </button>
      <button
        type="button"
        className={chat.romajiEnabled ? 'lk-chip on' : 'lk-chip'}
        aria-pressed={chat.romajiEnabled}
        aria-label={chat.romajiEnabled ? 'Turn off romaji-to-kana conversion' : 'Turn on romaji-to-kana conversion'}
        onClick={chat.toggleRomaji}
      >
        ROMAJI → KANA {chat.romajiEnabled ? 'ON' : 'OFF'}
      </button>
      <button
        type="button"
        className="lk-chip"
        onClick={chat.clear}
        disabled={chat.turns.length === 0 || chat.loading}
        aria-label="Clear chat history"
      >
        CLEAR
      </button>
    </span>
  )
}

export interface QuestionBodyProps {
  chat: LookupChat | undefined
  pages: string[]
  page: number
  replyKey: string | null
}

export function QuestionBody({ chat, pages, page, replyKey }: QuestionBodyProps) {
  if (!chat || !chat.enabled) {
    return (
      <>
        <NoModel
          title={LOOKUP_COPY.chatNoModelTitle}
          reason={chat?.disabledReason ?? LOOKUP_GATE_COPY.chatNoRuntime.reason}
          help={chat?.disabledHelp ?? LOOKUP_GATE_COPY.chatNoRuntime.help}
        />
        <div className="lk-note">{LOOKUP_COPY.chatDimmed}</div>
      </>
    )
  }

  const speaking = replyKey !== null && chat.speakingKey === replyKey
  return (
    <>
      <div className="lk-ans">
        <div className="lk-reply" aria-live="polite">
          <div className="lk-reply-who">
            <span>THE TUTOR</span>
            {pages.length > 0 && replyKey ? (
              <button
                type="button"
                className="lk-hear"
                disabled={!chat.audioEnabled}
                onClick={() => (speaking ? chat.stopSpeaking() : chat.replay(pages.join(' '), replyKey))}
                aria-label={chat.audioEnabled
                  ? (speaking ? 'Stop the tutor\'s audio' : 'Hear the tutor\'s reply')
                  : 'Turn sound on to hear the reply'}
              >
                <Volume2 size={11} strokeWidth={2.4} aria-hidden="true" /> {speaking ? 'STOP' : 'HEAR IT'}
              </button>
            ) : null}
          </div>
          {chat.loading ? <p className="lk-thinking" role="status">Thinking…</p> : null}
          {!chat.loading && chat.error ? <p className="lk-bad" role="alert">{chat.error}</p> : null}
          {!chat.loading && !chat.error && pages.length > 0 ? <p>{pages[page] ?? pages[0]}</p> : null}
          {!chat.loading && !chat.error && pages.length === 0 ? <p className="lk-quiet">{LOOKUP_COPY.chatEmpty}</p> : null}
          {pages.length > 1 && !chat.loading ? (
            <div className="lk-pager">
              <span>LONG REPLIES PAGE, THEY DO NOT SCROLL</span>
              <b>{page + 1} OF {pages.length} {page + 1 < pages.length ? '↓' : '↑'}</b>
            </div>
          ) : null}
        </div>
      </div>
      <div className="lk-note quiet lk-note-row">
        <span>
          {chat.turns.length > 0 ? 'ENTER ASKS A FOLLOW-UP' : 'ENTER ASKS'}
          {' · THE TUTOR SEES THE LAST 3 EXCHANGES'}
        </span>
        <ChatChips chat={chat} />
      </div>
    </>
  )
}

export interface ScreenshotBodyProps {
  ocr: LookupOcr | undefined
  fileInputRef: RefObject<HTMLInputElement | null>
  /** the English, paged the same way a long reply is */
  enPages: string[]
  page: number
  /** why a dropped file was turned away before it reached the reader, until the next image */
  fileNote?: string | null
}

function percent(confidence: number): string {
  return Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '―'
}

export function ScreenshotBody({ ocr, fileInputRef, enPages, page, fileNote }: ScreenshotBodyProps) {
  if (!ocr || !ocr.enabled) {
    return (
      <>
        <NoModel
          title={LOOKUP_COPY.ocrNoModelTitle}
          reason={ocr?.disabledReason ?? LOOKUP_GATE_COPY.ocrNoRuntime.reason}
          help={ocr?.disabledHelp ?? LOOKUP_GATE_COPY.ocrNoRuntime.help}
        />
        {fileNote
          ? <div className="lk-note" role="alert">{fileNote}</div>
          : <div className="lk-note">{LOOKUP_COPY.ocrDimmed}</div>}
      </>
    )
  }

  const { result, busy } = ocr
  /* a file that was turned away before it reached the reader says so in the reader's own place */
  const error = fileNote ?? ocr.error
  return (
    <>
      <div className="lk-ans">
        <div className="lk-shot-col">
          <div className="lk-shot">
            {result?.imageUrl ? <img src={result.imageUrl} alt={`The image that was read: ${result.fileName}`} /> : null}
            {!result && !busy ? <span className="lk-shot-empty" aria-hidden="true">画</span> : null}
            {busy ? <span className="lk-shot-empty">READING…</span> : null}
            {result ? <u>{result.fileName}</u> : null}
          </div>
          <div className="lk-ways">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <b>PICK</b> A FILE
            </button>
            <span><b>CTRL+V</b> PASTE</span>
            <span><b>DROP</b> IT</span>
          </div>
        </div>
        <div className="lk-ocr" aria-live="polite">
          {busy ? <p className="lk-thinking" role="status">Reading the image and translating it…</p> : null}
          {!busy && error ? <p className="lk-bad" role="alert">{error}</p> : null}
          {!busy && !error && !result ? <p className="lk-quiet">{LOOKUP_COPY.ocrEmpty}</p> : null}
          {!busy && result ? (
            <>
              <div className="lk-reply-who">
                <span>{result.lines.length} {result.lines.length === 1 ? 'LINE' : 'LINES'}</span>
                <s>LINES UNDER {Math.round(result.minConfidence * 100)}% ARE MARKED</s>
              </div>
              {result.lines.slice(0, LOOKUP_OCR_LINES).map((line, index) => {
                /* under the filter and still here: a line read with low confidence is the one
                   worth checking against the image */
                const low = Number.isFinite(line.confidence) && line.confidence < result.minConfidence
                return (
                  <div key={`${line.text}-${index}`} className={low ? 'lk-ocr-l low' : 'lk-ocr-l'}>
                    <b lang="ja">{line.text}</b>
                    <s>{percent(line.confidence)}{low ? ' · LOW CONFIDENCE, CHECK IT' : ''}</s>
                  </div>
                )
              })}
              {result.lines.length > LOOKUP_OCR_LINES ? (
                <p className="lk-fold">+ {result.lines.length - LOOKUP_OCR_LINES} MORE LINES</p>
              ) : null}
              {/* no English is a translation that failed, and the reason is already above the lines */}
              {result.englishText ? (
                <div className="lk-ocr-en">
                  <em>
                    {result.clipped ? 'ENGLISH · FIRST PART OF THE TEXT' : 'ENGLISH'}
                    {enPages.length > 1 ? <b>{page + 1} OF {enPages.length} {page + 1 < enPages.length ? '↓' : '↑'}</b> : null}
                  </em>
                  {enPages[page] ?? result.englishText}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="lk-note quiet lk-note-row">
        <span>PNG, JPEG OR WEBP · UP TO {ocr.maxMb} MB · NOTHING LEAVES THIS DEVICE</span>
        {result || ocr.error ? (
          <span className="lk-chips-row">
            <button type="button" className="lk-chip" onClick={ocr.clear} disabled={busy} aria-label="Clear the image">CLEAR</button>
          </span>
        ) : null}
      </div>
    </>
  )
}
