import { useState } from 'react'
import { Round } from '../../round'
import { screenHead } from '../../menu'
import { CONVERSATION_COPY, CONVERSATION_HISTORY_ROWS, SCENARIO_LEVEL_LABELS } from '../constants'
import type { UseScenarioTutorReturn } from '../useScenarioTutor'
import { pressesItself, useSheetKeys } from '../useSheetKeys'

export interface ConversationHistoryProps {
  tutor: UseScenarioTutorReturn
  onBack: () => void
}

/* ==================================================================================================
   PAST SESSIONS, on the same sheet. The finished conversations are listed in the prompt cell a page
   at a time, and the one the cursor is on is read out in the work cell -- its objectives and the
   words it practised. Deleting one, or all of them, asks on the slab first, the way leaving a
   conversation does: neither can be undone.
   ================================================================================================== */
export function ConversationHistory({ tutor, onBack }: ConversationHistoryProps) {
  const entries = tutor.historyEntries ?? []
  const [cursor, setCursor] = useState(0)
  const [confirm, setConfirm] = useState<'delete' | 'clear' | null>(null)
  const at = Math.min(cursor, Math.max(0, entries.length - 1))
  const entry = entries[at] ?? null
  const start = Math.floor(at / CONVERSATION_HISTORY_ROWS) * CONVERSATION_HISTORY_ROWS
  const page = entries.slice(start, start + CONVERSATION_HISTORY_ROWS)
  const pages = Math.max(1, Math.ceil(entries.length / CONVERSATION_HISTORY_ROWS))

  useSheetKeys((event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirm) setConfirm(null)
      else onBack()
      return
    }
    if (confirm || entries.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor(Math.max(0, Math.min(entries.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1))))
      return
    }
    if (event.key === 'Delete' && !pressesItself(event.target)) {
      event.preventDefault()
      setConfirm('delete')
    }
  })

  const yes = () => {
    if (confirm === 'delete' && entry) tutor.deleteHistoryEntry(entry.id)
    if (confirm === 'clear') tutor.clearHistory()
    setConfirm(null)
  }

  return (
    <Round
      head={screenHead('READING', 'scenes')}
      cap="PAST SESSIONS · KEPT ON THIS DEVICE ONLY"
      run={[{ key: 'sessions', value: String(entries.length), label: entries.length === 1 ? 'SESSION' : 'SESSIONS' }]}
      foot={{
        at: 0, target: 0, trail: [], note: 'PAST SESSIONS', marks: [],
        right: `${entries.length} KEPT`, label: `${entries.length} past sessions`,
      }}
      onBack={onBack}
      backLabel="Back"
      backJp="戻る"
      backAria="Back from past sessions"
      hints={[
        ...(entries.length > 0 ? [{ cap: '↑↓', en: 'Session', jp: '選択' }, { cap: 'DEL', en: 'Delete', jp: '削除' }] : []),
        { cap: 'ESC', en: 'Back', jp: '戻る' },
      ]}
      ask={
        <div className="rd-ask">
          <div className="rd-kick"><span>PAST SESSIONS</span><em>履歴</em></div>
          <div className="cv-hist cv-sub">
            {tutor.historyLoading ? <p className="cv-status" role="status" aria-busy="true">LOADING…</p> : null}
            {tutor.historyError ? <p className="cv-status bad" role="alert">{tutor.historyError}</p> : null}
            {!tutor.historyLoading && tutor.historyEntries && entries.length === 0
              ? <p className="cv-status">{CONVERSATION_COPY.historyEmpty}</p> : null}
            {page.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={start + i === at ? 'cv-hrow on' : 'cv-hrow'}
                aria-pressed={start + i === at}
                onClick={() => { setCursor(start + i); setConfirm(null) }}
              >
                <b>{item.scenarioTitle}</b>
                <s>{SCENARIO_LEVEL_LABELS[item.learnerLevel]?.toUpperCase() ?? item.learnerLevel} · {new Date(item.completedAtUtc).toLocaleString()}</s>
              </button>
            ))}
          </div>
          <div className="rd-src cv-src">
            <span>{entries.length} {entries.length === 1 ? 'SESSION' : 'SESSIONS'}</span>
            <span>PAGE <i>{Math.floor(start / CONVERSATION_HISTORY_ROWS) + 1} OF {pages}</i></span>
          </div>
        </div>
      }
      work={
        <div className="rd-work">
          <div className="rd-kick">
            <span>WHAT IT SAID</span>
            {entry ? (
              <span className="cv-kick-side">
                <button
                  type="button"
                  className="cv-btn"
                  onClick={() => setConfirm('delete')}
                  aria-label={`Delete session: ${entry.scenarioTitle}`}
                >
                  DELETE
                </button>
                <button type="button" className="cv-btn" onClick={() => setConfirm('clear')} aria-label="Clear all">
                  CLEAR ALL
                </button>
              </span>
            ) : <em>要約</em>}
          </div>
          {entry ? (
            <section aria-label={`Summary for ${entry.scenarioTitle}`}>
              <div className="cv-rows">
                {entry.summary.objectives.map((objective) => (
                  <div className="cv-row" key={objective.id}>
                    <i
                      className={objective.status === 'met' ? 'on' : objective.status === 'assisted' ? 'given' : undefined}
                      aria-hidden="true"
                    />
                    {objective.label}
                    <s className={objective.status === 'met' ? 'g' : undefined}>{objective.status.toUpperCase()}</s>
                  </div>
                ))}
              </div>
              {entry.summary.vocabularyPractised.length > 0 ? (
                <div className="cv-dl">
                  <em>WORDS</em>
                  <span className="jp" lang="ja">{entry.summary.vocabularyPractised.join('、')}</span>
                </div>
              ) : null}
            </section>
          ) : null}
          {confirm ? (
            <div
              className="cv-ask-q"
              role="alertdialog"
              aria-label={confirm === 'delete' ? 'Confirm deleting this session' : 'Confirm clearing all sessions'}
            >
              <span>{confirm === 'delete' ? 'DELETE THIS SESSION? IT CANNOT BE UNDONE' : 'CLEAR EVERY PAST SESSION? IT CANNOT BE UNDONE'}</span>
              <button type="button" className="yes" onClick={yes}>{confirm === 'delete' ? 'YES, DELETE' : 'YES, CLEAR ALL'}</button>
              <button type="button" className="no" onClick={() => setConfirm(null)} autoFocus>
                {confirm === 'delete' ? 'KEEP IT' : 'KEEP THEM'}
              </button>
            </div>
          ) : (
            <button type="button" className="rd-slab calm go" onClick={onBack}>BACK<em>戻る</em></button>
          )}
        </div>
      }
    />
  )
}
