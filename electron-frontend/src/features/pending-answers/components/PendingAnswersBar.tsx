import { usePendingAnswers } from '../usePendingAnswers'
import './pending-answers.css'

/**
 * The bar along the bottom of the window while answers wait to be saved (audit 1, F3). Wording and
 * placement are Robbie's (2026-10-27). It has no dismiss: it goes away once every answer has saved.
 */
export function PendingAnswersBar() {
  const { waiting, showWaiting, skipped, retry } = usePendingAnswers()
  if (!showWaiting && !skipped) return null

  return (
    <div className="pending-answers-bar" role="status" aria-live="polite">
      <p className="pending-answers-text">
        {showWaiting
          ? <>Couldn&apos;t confirm this answer was saved.{waiting > 1 ? <span className="pending-answers-count"> ({waiting} waiting)</span> : null}</>
          : <>One answer couldn&apos;t be saved and was skipped.</>}
      </p>
      {showWaiting ? (
        <button type="button" className="pending-answers-retry" onClick={retry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
