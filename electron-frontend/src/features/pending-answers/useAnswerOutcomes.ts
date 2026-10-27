import { useEffect, useRef } from 'react'
import type { AnswerRejectedEvent, AnswerSavedEvent, PendingAnswersSnapshot } from '../../electron'

export interface AnswerOutcomeHandlers {
  onSaved: (event: AnswerSavedEvent, snapshot: PendingAnswersSnapshot | null) => void
  onRejected: (event: AnswerRejectedEvent, snapshot: PendingAnswersSnapshot | null) => void
  /** the queue changed; `emptied` is true when the last waiting answer has just gone */
  onQueueChanged?: (snapshot: PendingAnswersSnapshot, emptied: boolean) => void
}

/**
 * Subscribe once to every answer's outcome. Each answer id is handled at most once, whichever way
 * it arrives, so a replayed save never shows its toasts twice. The latest queue snapshot is fetched
 * on mount, so a renderer that reloads mid-save still knows which cards have answers in flight.
 */
export function useAnswerOutcomes(handlers: AnswerOutcomeHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const desktop = window.jplearnDesktop
    if (!desktop?.onAnswerSaved || !desktop.onAnswerRejected) return undefined
    const handled = new Set<string>()
    let snapshot: PendingAnswersSnapshot | null = null
    let disposed = false

    const takeSnapshot = (next: PendingAnswersSnapshot) => {
      if (snapshot !== null && next.seq < snapshot.seq) return
      const emptied = (snapshot?.count ?? 0) > 0 && next.count === 0
      snapshot = next
      handlersRef.current.onQueueChanged?.(next, emptied)
    }

    const offSaved = desktop.onAnswerSaved((event) => {
      if (handled.has(event.answerId)) return
      handled.add(event.answerId)
      handlersRef.current.onSaved(event, snapshot)
    })
    const offRejected = desktop.onAnswerRejected((event) => {
      if (handled.has(event.answerId)) return
      handled.add(event.answerId)
      handlersRef.current.onRejected(event, snapshot)
    })
    const offStatus = desktop.onPendingAnswersChanged?.(takeSnapshot)
    void desktop.getPendingAnswers?.().then((next) => {
      if (!disposed && next) takeSnapshot(next)
    }).catch(() => undefined)

    return () => {
      disposed = true
      offSaved()
      offRejected()
      offStatus?.()
    }
  }, [])
}

/** Whether another answer than `answerId` for the same card is still waiting to be saved. */
export function hasNewerPendingAnswer(
  snapshot: PendingAnswersSnapshot | null,
  cardKey: string,
  answerId: string,
): boolean {
  return (snapshot?.pending ?? []).some((entry) => entry.cardKey === cardKey && entry.answerId !== answerId)
}
