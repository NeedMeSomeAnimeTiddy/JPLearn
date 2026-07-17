import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { KanjiCompound, KanjiDetailPayload, KanjiReading } from '../../../generated/types'
import { KANJI_DETAIL_COPY } from '../constants'
import type { KanjiDetailPanelProps, KanjiDetailRequestState } from '../types'
import { useKanjiDetail } from '../useKanjiDetail'
import {
  formatKanjiDetailTag,
  formatKanjiReading,
  trapFocus,
} from '../utils'
import { KanjiStrokeAnimation } from './KanjiStrokeAnimation'
import '../kanji-detail.css'

function MissingData() {
  return <p className="kanji-detail-empty">{KANJI_DETAIL_COPY.missingData}</p>
}

function ReadingGroup({ heading, readings }: { heading: string; readings: KanjiReading[] }) {
  return (
    <section className="kanji-detail-reading-group" aria-label={heading}>
      <h3>{heading}</h3>
      {readings.length === 0 ? <MissingData /> : (
        <ul className="kanji-detail-reading-list">
          {readings.map((reading) => (
            <li key={`${heading}-${reading.reading}`} className="kanji-detail-reading-entry">
              <span className="kanji-detail-reading" lang="ja">{formatKanjiReading(reading.reading)}</span>
              {reading.examples.length === 0 ? (
                <span className="kanji-detail-example-empty">{KANJI_DETAIL_COPY.noVerifiedExample}</span>
              ) : (
                <ul className="kanji-detail-example-list">
                  {reading.examples.map((example, index) => (
                    <li key={`${example.word}-${example.reading}-${index}`}>
                      <span lang="ja">{example.word}</span>
                      <span className="kanji-detail-kana" lang="ja">{example.reading}</span>
                      {example.meanings.length > 0 && <span>{example.meanings.join('; ')}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CompoundList({ compounds, hasMore }: { compounds: KanjiCompound[]; hasMore: boolean }) {
  if (compounds.length === 0) return <MissingData />
  return (
    <>
      <ul className="kanji-detail-compound-list">
        {compounds.map((compound) => (
          <li key={`${compound.word}-${compound.reading}`}>
            <span className="kanji-detail-compound-word" lang="ja">{compound.word}</span>
            <span className="kanji-detail-kana" lang="ja">{compound.reading}</span>
            {compound.meanings.length > 0 && <span>{compound.meanings.join('; ')}</span>}
          </li>
        ))}
      </ul>
      {hasMore && <p className="kanji-detail-meta">Showing the first 12 matching compounds.</p>}
    </>
  )
}

function ReadyDetail({ detail }: { detail: KanjiDetailPayload }) {
  return (
    <div className="kanji-detail-content">
      <section className="kanji-detail-section kanji-detail-summary" aria-labelledby="kanji-detail-summary-heading">
        <div className="kanji-detail-glyph" lang="ja" aria-hidden="true">{detail.character}</div>
        <div className="kanji-detail-summary-main">
          <h2 id="kanji-detail-summary-heading">Summary</h2>
          <p className="kanji-detail-meanings">
            {detail.meanings.length > 0 ? detail.meanings.join(' · ') : KANJI_DETAIL_COPY.missingData}
          </p>
          <dl className="kanji-detail-facts">
            <div>
              <dt>JLPT</dt>
              <dd>{detail.jlpt_level ?? 'JLPT level not listed'}</dd>
            </div>
            <div>
              <dt>Strokes</dt>
              <dd>{detail.stroke_count ?? KANJI_DETAIL_COPY.missingData}</dd>
            </div>
          </dl>
          {detail.tags.length === 0 && detail.categories.length === 0 ? <MissingData /> : (
            <div className="kanji-detail-chip-groups" aria-label="Tags and categories">
            {detail.tags.length > 0 && (
              <ul className="kanji-detail-chips" aria-label="Tags">
                {detail.tags.map((tag) => <li key={tag}>{formatKanjiDetailTag(tag)}</li>)}
              </ul>
            )}
            {detail.categories.length > 0 && (
              <ul className="kanji-detail-chips" aria-label="Categories">
                {detail.categories.map((category) => <li key={category}>{category}</li>)}
              </ul>
            )}
            </div>
          )}
        </div>
      </section>

      <div className="kanji-detail-primary-grid">
        <section className="kanji-detail-section" aria-labelledby="kanji-detail-readings-heading">
          <h2 id="kanji-detail-readings-heading">Readings</h2>
          <div className="kanji-detail-readings-grid">
            <ReadingGroup heading="On’yomi" readings={detail.on_readings} />
            <ReadingGroup heading="Kun’yomi" readings={detail.kun_readings} />
          </div>
        </section>

        <section className="kanji-detail-section" aria-labelledby="kanji-detail-radicals-heading">
          <h2 id="kanji-detail-radicals-heading">Radicals and components</h2>
          {detail.radicals.length === 0 ? <MissingData /> : (
            <ol className="kanji-detail-radical-list">
              {detail.radicals.map((radical) => (
                <li key={`${radical.position}-${radical.radical}`}>
                  <span className="kanji-detail-radical" lang="ja">{radical.radical}</span>
                  <span>{radical.stroke_count === null ? KANJI_DETAIL_COPY.missingData : `${radical.stroke_count} strokes`}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="kanji-detail-section" aria-labelledby="kanji-detail-compounds-heading">
        <h2 id="kanji-detail-compounds-heading">Compounds</h2>
        <CompoundList compounds={detail.compounds} hasMore={detail.has_more_compounds} />
      </section>

      <section className="kanji-detail-section kanji-detail-stroke-section" aria-labelledby="kanji-detail-strokes-heading">
        <h2 id="kanji-detail-strokes-heading">Stroke order</h2>
        <KanjiStrokeAnimation character={detail.character} strokeCount={detail.stroke_count} />
      </section>
    </div>
  )
}

function DetailState({ state, retry }: { state: KanjiDetailRequestState; retry: () => void }) {
  if (state.status === 'ready') return <ReadyDetail detail={state.detail} />
  if (state.status === 'error') {
    return (
      <div className="kanji-detail-state" role="status" aria-live="polite">
        <p>{state.message}</p>
        <button type="button" className="kanji-detail-secondary-action" onClick={retry}>Retry</button>
      </div>
    )
  }
  return (
    <div className="kanji-detail-state" role="status" aria-live="polite">
      <p>{state.message}</p>
    </div>
  )
}

export function KanjiDetailPanel({ character, onClose }: KanjiDetailPanelProps) {
  const request = useKanjiDetail(character)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (restoreFocusRef.current === null && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement
    }
    closeButtonRef.current?.focus()
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
    if (dialogRef.current) trapFocus(event, dialogRef.current)
  }

  return (
    <div
      className="modal-backdrop kanji-detail-backdrop"
      data-testid="kanji-detail-backdrop"
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="kanji-detail-panel cassette-panel crt-scanlines"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kanji-detail-heading"
        aria-describedby="kanji-detail-description"
        tabIndex={-1}
        onKeyDownCapture={handleKeyDownCapture}
      >
        <div className="crt-vhs-line" />
        <header className="kanji-detail-header cassette-panel-header">
          <div aria-hidden="true" />
          <div className="cassette-panel-header-center">
            <p id="kanji-detail-description" className="cassette-panel-header-catalog">Offline character index</p>
            <h1 id="kanji-detail-heading" className="cassette-panel-header-title">
              Kanji details: <span lang="ja">{character}</span>
            </h1>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="panel-close-button kanji-detail-close"
            aria-label={`Close kanji details for ${character}`}
            title="Close kanji details"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <DetailState state={request} retry={request.retry} />
      </div>
    </div>
  )
}
