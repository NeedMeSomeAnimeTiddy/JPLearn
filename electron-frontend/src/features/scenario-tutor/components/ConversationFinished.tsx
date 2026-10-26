import { useMemo, useState } from 'react'
import { Round } from '../../round'
import type { RunChip } from '../../round'
import { screenHead } from '../../menu'
import { CONVERSATION_CARD_ROWS, CONVERSATION_COPY, CONVERSATION_DETAIL_ROWS, SCENARIO_LEVEL_LABELS } from '../constants'
import type { ScenarioDefinition, ScenarioSession, ScenarioSummary, SrsDraftState } from '../types'
import type { UseScenarioTutorReturn } from '../useScenarioTutor'
import { editsText, pressesItself, useSheetKeys } from '../useSheetKeys'
import { objectiveFoot, objectiveTally, objectiveTickClass, summaryFold, summaryPages } from '../utils'

export interface ConversationFinishedProps {
  tutor: UseScenarioTutorReturn
  scenario: ScenarioDefinition
  session: ScenarioSession
  summary: ScenarioSummary
}

type Field = 'front' | 'back' | 'reading' | 'notes'
const FIELDS: { key: Field; label: string; jp: boolean }[] = [
  { key: 'front', label: 'FRONT', jp: true },
  { key: 'back', label: 'BACK', jp: false },
  { key: 'reading', label: 'READING', jp: true },
  { key: 'notes', label: 'NOTES', jp: false },
]

/* ==================================================================================================
   HOW IT WENT, AND WHAT TO KEEP (board ConvFinished, and ConvStates' failed save).

   The prompt cell is the score and the objectives, with everything else the summary says -- the
   corrections, the words, the patterns, the next steps and the whole transcript -- counted on one
   line and paged behind it. The work cell is the drafted cards: ONE IS OPEN, with its four fields
   editable in place, and the slab accepts that one. The arrows move which card is open; DISMISS and
   SKIP ALL say no. Nothing is saved until a card is accepted, and a dismissed card never reaches the
   backend at all.

   A SAVE THAT FAILED ASKS AGAIN. The session has to be saved before its cards can be drafted, so a
   failure says why in the app's own sentence and the slab becomes TRY SAVING AGAIN.
   ================================================================================================== */
export function ConversationFinished({ tutor, scenario, session, summary }: ConversationFinishedProps) {
  const pending = tutor.srsDrafts.filter((draft) => draft.status === 'pending')
  const accepted = tutor.srsDrafts.filter((draft) => draft.status === 'accepted').length
  const [hot, setHot] = useState(0)
  const at = Math.min(hot, Math.max(0, pending.length - 1))
  const card: SrsDraftState | undefined = pending[at]
  const [page, setPage] = useState(0)
  const pages = useMemo(
    () => summaryPages(scenario, session.transcript, summary, CONVERSATION_DETAIL_ROWS),
    [scenario, session.transcript, summary],
  )
  const pageCount = pages.length + 1
  const tally = objectiveTally(scenario, session)
  const complete = session.status === 'success'
  const back = tutor.returnToSelect

  const accept = () => { if (card) tutor.acceptSrsDraft(card.id) }
  const turn = (by: 1 | -1) => setPage((p) => (p + by + pageCount) % pageCount)

  useSheetKeys((event) => {
    if (event.key === 'Escape') { event.preventDefault(); back(); return }
    /* the open card's fields are text: their arrows move the caret and their ENTER is the field's,
       so the cards move and accept only from the sheet itself */
    if (editsText(event.target)) return
    if (event.key === 'PageDown') { event.preventDefault(); turn(1); return }
    if (event.key === 'PageUp') { event.preventDefault(); turn(-1); return }
    if (pending.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const by = event.key === 'ArrowDown' ? 1 : -1
      setHot(Math.max(0, Math.min(pending.length - 1, at + by)))
      return
    }
    if (event.key === 'Enter' && !pressesItself(event.target)) {
      event.preventDefault()
      accept()
    }
  })

  /* the open card stays in view: the window of cards starts one above it */
  const start = Math.max(0, Math.min(at - 1, pending.length - CONVERSATION_CARD_ROWS))
  const visible = pending.slice(start, start + CONVERSATION_CARD_ROWS)
  const hidden = pending.length - visible.length
  const fold = summaryFold(summary)

  const run: RunChip[] = [
    { key: 'objectives', value: String(tally.neededMet), of: `/ ${tally.needed}`, label: 'OBJECTIVES' },
  ]
  if (summary.corrections.length > 0) {
    run.push({ key: 'fix', value: String(summary.corrections.length), label: summary.corrections.length === 1 ? 'CORRECTION' : 'CORRECTIONS' })
  }
  if (pending.length > 0) {
    run.push({ key: 'cards', value: String(pending.length), label: 'CARDS TO REVIEW', duty: true })
  }

  const work = (() => {
    if (!complete) {
      return { body: <p className="cv-status">{CONVERSATION_COPY.endedEarly}</p>, slab: null }
    }
    if (tutor.sessionSave === 'saving' || tutor.sessionSave === 'idle') {
      return { body: <p className="cv-status" role="status">{CONVERSATION_COPY.saving}</p>, slab: null }
    }
    if (tutor.sessionSave === 'failed' || tutor.sessionSave === 'unavailable') {
      return {
        body: <p className="cv-status bad" role="alert">{tutor.persistenceNote}</p>,
        slab: tutor.sessionSave === 'failed' ? (
          <button type="button" className="rd-slab go" onClick={tutor.retrySessionSave}>
            TRY SAVING AGAIN<em>再試行</em>
          </button>
        ) : null,
      }
    }
    if (pending.length === 0) {
      return {
        body: (
          <p className="cv-status" role="status">
            {CONVERSATION_COPY.noCards}{accepted > 0 ? ` · ${accepted} KEPT` : ''}
          </p>
        ),
        slab: null,
      }
    }
    return {
      body: (
        <>
          <div className="cv-cards">
            {visible.map((draft, i) => {
              const index = start + i
              if (index !== at) {
                return (
                  <button
                    key={draft.id}
                    type="button"
                    className="cv-card"
                    onClick={() => setHot(index)}
                    aria-label={`Card ${index + 1}: ${draft.front} — ${draft.back}`}
                  >
                    <u aria-hidden="true">{index + 1}</u>
                    <span className="t"><span className="jp" lang="ja">{draft.front}</span><span className="ro">{draft.back}</span></span>
                  </button>
                )
              }
              return (
                <div key={draft.id} className="cv-card hot" role="group" aria-label={`Card ${index + 1}: ${draft.front}`}>
                  <u aria-hidden="true">{index + 1}</u>
                  <div className="cv-fields">
                    {FIELDS.map((field) => (
                      <label className="cv-fld" key={field.key}>
                        <em>{field.label}</em>
                        <input
                          className={field.jp ? 'jp' : undefined}
                          lang={field.jp ? 'ja' : undefined}
                          value={draft[field.key]}
                          onChange={(event) => tutor.editSrsDraft(draft.id, { [field.key]: event.currentTarget.value })}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="cv-acts">
                    <button
                      type="button"
                      className="cv-btn"
                      onClick={() => tutor.dismissSrsDraft(draft.id)}
                      aria-label={`Dismiss card: ${draft.front}`}
                    >
                      DISMISS
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {hidden > 0 ? <div className="cv-fold">+ {hidden} MORE · ↑↓ TO REACH THEM</div> : null}
          {tutor.srsReviewError ? <p className="cv-status bad" role="alert">{tutor.srsReviewError}</p> : null}
        </>
      ),
      slab: card ? (
        <button type="button" className="rd-slab go" onClick={accept} aria-label={`Accept card: ${card.front}`}>
          ACCEPT THIS CARD<em>保存</em>
        </button>
      ) : null,
    }
  })()

  const detail = page > 0 ? pages[page - 1] ?? [] : null

  return (
    <Round
      head={screenHead('READING', 'scenes')}
      cap={`${scenario.title.toUpperCase()} · ${scenario.titleJa} · ${SCENARIO_LEVEL_LABELS[session.level].toUpperCase()}`}
      run={run}
      foot={{
        at: 0, target: 0, trail: [], note: 'OBJECTIVES',
        marks: tally.ticks.map(objectiveTickClass),
        right: objectiveFoot(tally, 'after'),
      }}
      onBack={back}
      backLabel="Back to the scenes"
      backJp="戻る"
      backAria="Back to the scenes"
      onRestart={tutor.replayScenario}
      restart={{ en: 'Replay scenario', jp: '再挑戦', aria: 'Replay scenario' }}
      hints={pending.length > 0 && complete
        ? [
          { cap: '↑↓', en: 'Card', jp: '選択' },
          { cap: 'ENTER', en: 'Accept', jp: '保存' },
          { cap: 'ESC', en: 'Back', jp: '戻る' },
        ]
        : [{ cap: 'PGDN', en: 'Details', jp: '詳細' }, { cap: 'ESC', en: 'Back', jp: '戻る' }]}
      ask={
        <div className="rd-ask">
          <div className="rd-kick">
            <span>{complete ? 'SESSION COMPLETE' : 'ENDED EARLY'}</span><em>{complete ? '完了' : '中断'}</em>
          </div>
          {detail ? (
            <div className="cv-detail" aria-live="polite">
              {detail.map((line, i) => (
                <div className="cv-dl" key={`${page}-${i}`}>
                  <em>{line.cap}</em>
                  <span className={line.jp ? 'jp' : undefined} lang={line.jp ? 'ja' : undefined}>{line.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="cv-score">
                <b>{tally.neededMet}<sup>/{tally.needed}</sup></b>
                <i>NEEDED OBJECTIVES MET</i>
              </div>
              <div className="cv-rows">
                {summary.objectives.map((objective) => {
                  const tick = tally.ticks.find((entry) => entry.id === objective.id)
                  const mark = objective.status === 'met' ? 'on' : objective.status === 'assisted' ? 'given' : ''
                  return (
                    <div className="cv-row" key={objective.id}>
                      <i className={[tick && !tick.required ? 'opt' : '', mark].filter(Boolean).join(' ') || undefined} aria-hidden="true" />
                      {tick?.label ?? objective.label}
                      <s className={objective.status === 'met' ? 'g' : undefined}>{objective.status.toUpperCase()}</s>
                    </div>
                  )
                })}
              </div>
              {fold ? <div className="cv-fold">{fold}</div> : null}
            </>
          )}
          <div className="rd-src cv-src cv-pages">
            <button
              type="button"
              className="cv-btn"
              onClick={() => turn(1)}
              aria-label={page + 1 < pageCount ? 'Show the details and the full transcript' : 'Back to the score'}
            >
              {page === 0 ? 'SHOW FULL TRANSCRIPT' : page + 1 < pageCount ? 'NEXT PAGE' : 'BACK TO THE SCORE'}
            </button>
            <span>PAGE <i>{page + 1} OF {pageCount}</i></span>
          </div>
        </div>
      }
      work={
        <div className="rd-work">
          <div className="rd-kick">
            <span>CARDS TO KEEP · {pending.length}</span>
            {pending.length > 0 ? (
              <button type="button" className="cv-btn" onClick={tutor.skipAllSrsDrafts} aria-label="Skip all">SKIP ALL</button>
            ) : <em>保存</em>}
          </div>
          {work.body}
          {work.slab ?? (
            <button type="button" className="rd-slab calm go" onClick={back}>
              BACK TO THE SCENES<em>戻る</em>
            </button>
          )}
        </div>
      }
    />
  )
}
