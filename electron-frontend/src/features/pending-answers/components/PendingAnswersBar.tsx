import { usePendingAnswers } from '../usePendingAnswers'
import './pending-answers.css'

/**
 * The bar along the bottom of the window while answers wait to be saved (audit 1, F3). Wording and
 * placement are Robbie's (2026-10-27). It has no dismiss: it goes away once every answer has saved.
 *
 * The live region stays mounted and only its contents change, so a screen reader announces the
 * notice the first time it appears too.
 */
export function PendingAnswersBar() {
  const { waiting, showWaiting, skipped, retry } = usePendingAnswers()
  const shown = showWaiting || skipped

  return (
    <div className="pending-answers-live" role="status" aria-live="polite">
      {shown ? (
        <div className="pending-answers-bar">
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
      ) : null}
    </div>
  )
}
