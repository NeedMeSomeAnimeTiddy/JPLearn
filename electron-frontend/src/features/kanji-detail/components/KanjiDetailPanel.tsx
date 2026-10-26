import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { KanjiDetailPayload } from '../../../generated/types'
import { boardScale } from '../../menu/useScreen'
import { KANJI_DETAIL_COPY } from '../constants'
import type { KanjiDetailPanelProps, KanjiDetailRequestState } from '../types'
import { useKanjiDetail } from '../useKanjiDetail'
import {
  formatKanjiDetailTag,
  formatKanjiReading,
  kanjiParts,
  kanjiSheetRows,
  missingFromDeck,
  trapFocus,
} from '../utils'
import { KanjiStrokeAnimation } from './KanjiStrokeAnimation'
import '../../../styles/stage.css'
import '../../lookup/lookup.css'
import '../../mastery/mastery.css'
import '../kanji-detail.css'

/* ==================================================================================================
   THE CHARACTER — a sheet over the dimmed scene, on Look it up's scrim and Every character's shell.

   ONE OBJECT IN TWO STATES. With the offline dictionary the middle column holds readings and
   compounds; without it the same column, at the same width, names what is missing as hatched
   absences. The shell, the three column edges, Escape and replay never move between the two, so a
   learner who installs the dictionary sees the sheet fill in rather than turn into another one.
   See `design-system/canvas-kanji-conversation/Main.dc.html` and `KanjiDictionary.dc.html`.

   NOTHING SCROLLS. The middle column has a budget of rows (`kanjiSheetRows`) and what does not fit
   is a count in its kicker.
   ================================================================================================== */

function isDeckOnly(detail: KanjiDetailPayload): boolean {
  if (detail.source === 'deck_only') return true
  return detail.meanings.length === 0
    && detail.on_readings.length + detail.kun_readings.length === 0
    && detail.stroke_count == null
}

function Facts({ detail, deckOnly }: { detail: KanjiDetailPayload; deckOnly: boolean }) {
  const level = detail.jlpt_level?.toUpperCase() ?? null
  const theme = detail.categories.join(' · ')
  const tags = detail.tags.map(formatKanjiDetailTag).join(' · ')
  return (
    <div className="kx-facts">
      {!deckOnly && detail.stroke_count != null ? (
        <div><em>STROKES</em><span className="x">{detail.stroke_count}</span></div>
      ) : null}
      <div>
        <em>LEVEL</em>
        {level ? (
          <span className="x">
            {level}
            {deckOnly && detail.jlpt_level_source ? <i>TAGGED FROM THE {detail.jlpt_level_source.toUpperCase()}</i> : null}
          </span>
        ) : <span className="none">Not listed</span>}
      </div>
      {theme ? <div><em>THEME</em><span>{theme}</span></div> : null}
      {deckOnly && tags ? <div><em>TAGS</em><span>{tags}</span></div> : null}
    </div>
  )
}

function DeckOnlyColumn({ detail }: { detail: KanjiDetailPayload }) {
  const missing = missingFromDeck(detail)
  return (
    <>
      <div className="mx-kick"><span>DECK ONLY</span><s>{missing.length} NEED THE DICTIONARY</s></div>
      {missing.map((label) => (
        /* AN ABSENCE IS A HATCH AND A DASH, NEVER A ZERO -- The Exam's rule for a figure it cannot
           give */
        <div key={label} className="kx-gh"><em>{label}</em><span aria-label="Not available">—</span></div>
      ))}
      <p className="kx-why">{KANJI_DETAIL_COPY.deckOnly}</p>
      <div className="kx-fix">
        <div><span>OFFLINE DICTIONARY</span><s>NOT INSTALLED</s></div>
        <div>ADD IT IN SETTINGS › OFFLINE DICTIONARY</div>
      </div>
    </>
  )
}

function DictionaryColumn({ detail }: { detail: KanjiDetailPayload }) {
  const rows = kanjiSheetRows(detail)
  const compoundCount = `${rows.compounds.length} OF ${rows.compoundTotal}${rows.hasMoreCompounds ? '+' : ''}`
  return (
    <>
      <div className="mx-kick">
        <span>READINGS</span>
        <s>
          {rows.onCount} ON · {rows.kunCount} KUN
          {rows.readingsHidden > 0 ? ` · ${rows.readingsHidden} MORE` : ''}
        </s>
      </div>
      {rows.readings.map((row, index) => {
        if (!row.reading) {
          return (
            <div key={`${row.kind}-none`} className="kx-rd none">
              <u>{row.kind}</u><b>—</b><span>{KANJI_DETAIL_COPY.missingData}</span>
            </div>
          )
        }
        const example = row.reading.examples[0]
        return (
          <div key={`${row.kind}-${row.reading.reading}-${index}`} className="kx-rd">
            <u>{row.kind}</u>
            <b lang="ja">{formatKanjiReading(row.reading.reading)}</b>
            {example ? (
              <span>
                <span className="jp" lang="ja">{example.word}</span>
                <span className="kana" lang="ja">{example.reading}</span>
                {example.meanings[0] ?? ''}
              </span>
            ) : <span className="none">No verified example.</span>}
          </div>
        )
      })}
      <div className="mx-kick kx-kick-gap">
        <span>COMPOUNDS</span>
        <s>{rows.compoundTotal > 0 ? `${compoundCount} · COMMON FIRST` : 'NONE RECORDED'}</s>
      </div>
      {rows.compounds.length === 0 ? (
        <div className="kx-rd none"><span>{KANJI_DETAIL_COPY.missingData}</span></div>
      ) : rows.compounds.map((compound) => (
        <div key={`${compound.word}-${compound.reading}`} className="kx-cp">
          <b lang="ja">{compound.word}</b>
          <i lang="ja">{compound.reading}</i>
          <span>{compound.meanings.join('; ')}</span>
        </div>
      ))}
    </>
  )
}

function StateColumn({ state, retry }: { state: KanjiDetailRequestState; retry: () => void }) {
  if (state.status === 'ready') return null
  return (
    <div className="kx-state" role="status" aria-live="polite">
      <div className="mx-kick"><span>{state.status === 'loading' ? 'ONE MOMENT' : 'NOT AVAILABLE'}</span></div>
      <p className={state.status === 'loading' ? 'kx-small' : 'kx-why'}>{state.message}</p>
      {state.status === 'error' ? (
        <button type="button" className="kx-btn ink" onClick={retry}>Retry</button>
      ) : null}
    </div>
  )
}

export function KanjiDetailPanel({ character, onClose, backTo = null }: KanjiDetailPanelProps) {
  const request = useKanjiDetail(character)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [replaySignal, setReplaySignal] = useState(0)

  useLayoutEffect(() => {
    const fit = () => frameRef.current?.style.setProperty('--lk-u', String(boardScale()))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    if (restoreFocusRef.current === null && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement
    }
    /* THE SHEET TAKES FOCUS, NOT A BUTTON ON IT, because ENTER is the replay key and a focused button
       would take ENTER for itself -- landing on the close control would make ENTER close the sheet */
    sheetRef.current?.focus()
  }, [character])

  useEffect(() => () => {
    const trigger = restoreFocusRef.current
    if (trigger?.isConnected) trigger.focus()
  }, [])

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      if (target.tagName === 'BUTTON') return
      event.preventDefault()
      setReplaySignal((n) => n + 1)
      return
    }
    if (sheetRef.current) trapFocus(event, sheetRef.current)
  }

  const detail = request.status === 'ready' ? request.detail : null
  const deckOnly = detail ? isDeckOnly(detail) : false
  const parts = detail ? kanjiParts(detail) : []
  const level = detail?.jlpt_level?.toUpperCase() ?? null
  const backWords = backTo ? `BACK TO ${backTo.toUpperCase()}` : 'BACK'
  const closeLabel = backTo ? `Back to ${backTo}` : `Close kanji details for ${character}`

  return createPortal(
    <div
      className="lk-open kx-open"
      role="dialog"
      aria-modal="true"
      aria-label={`Kanji details: ${character}`}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <button type="button" className="lk-scrim" aria-label={closeLabel} tabIndex={-1} onClick={onClose} />
      <div className="lk-frame" ref={frameRef}>
        <div className="mx-sheet kx-sheet" ref={sheetRef} tabIndex={-1}>
          <div className="lk-cap">
            <b lang="ja">字</b><i>CHARACTER</i>
            <s>
              <span lang="ja">{character}</span>
              {detail ? (deckOnly ? ' · FROM THE DECK, NOT THE DICTIONARY' : ' · FROM THE DICTIONARY') : ''}
            </s>
            {level ? <u className="lv">{level}</u> : null}
            <button type="button" className="kx-esc" onClick={onClose} aria-label={closeLabel}>ESC</button>
          </div>

          <div className="kx-body">
            <section className="kx-c1" aria-label="The character">
              <div className="kx-glyph" lang="ja" aria-hidden="true">{character}</div>
              {detail && detail.meanings.length > 0 ? (
                <p className="kx-mean">{detail.meanings.slice(0, 3).join(' · ')}</p>
              ) : null}
              {detail ? <Facts detail={detail} deckOnly={deckOnly} /> : null}
            </section>

            <section className="kx-c2" aria-label={deckOnly ? 'What needs the dictionary' : 'Readings and compounds'}>
              {detail
                ? (deckOnly ? <DeckOnlyColumn detail={detail} /> : <DictionaryColumn detail={detail} />)
                : <StateColumn state={request} retry={request.retry} />}
            </section>

            <section className="kx-c3" aria-label="Parts and stroke order">
              <div className="mx-kick">
                <span>BUILT FROM</span>
                <s>{detail ? `${parts.length} ${parts.length === 1 ? 'PART' : 'PARTS'}` : ''}</s>
              </div>
              {parts.length > 0 ? (
                <div className="mx-chips">
                  {parts.map((part) => (
                    <i key={part} className={parts.length <= 3 ? 'mx-chip big' : 'mx-chip'} lang="ja">{part}</i>
                  ))}
                </div>
              ) : (
                <div className="kx-gh"><em>PARTS</em><span aria-label="Not available">—</span></div>
              )}
              <div className="mx-kick q kx-kick-gap">
                <span>STROKE ORDER</span>
                <s>
                  {detail?.stroke_count != null
                    ? `${detail.stroke_count} STROKES`
                    : 'WORKS WITHOUT THE DICTIONARY'}
                </s>
              </div>
              <KanjiStrokeAnimation character={character} replaySignal={replaySignal} />
            </section>
          </div>

          <div className="mx-hint">
            <b>ENTER</b> REPLAY · <b>ESC</b> {backWords}
          </div>
        </div>
        <div className="lk-hint kx-under">
          {backTo ? `ESC GOES UP ONE LEVEL — BACK TO ${backTo.toUpperCase()}` : 'ESC CLOSES'}
        </div>
      </div>
    </div>,
    document.body,
  )
}
