import { useCallback, useEffect, useState } from 'react'
import type { PendingAnswersSnapshot } from '../../electron'

export interface PendingAnswersState {
  /** answers waiting to save; shown only once the oldest has failed at least once */
  waiting: number
  showWaiting: boolean
  /** an answer was refused for good and skipped; shown once until the bar next clears */
  skipped: boolean
  retry: () => void
}

/** Follows the main process's save queue for the bar at the bottom of the window. */
export function usePendingAnswers(): PendingAnswersState {
  const [snapshot, setSnapshot] = useState<PendingAnswersSnapshot | null>(null)
  const [skipped, setSkipped] = useState(false)

  useEffect(() => {
    const desktop = window.jplearnDesktop
    if (!desktop?.onPendingAnswersChanged) return undefined
    let disposed = false
    const take = (next: PendingAnswersSnapshot) => {
      setSnapshot((previous) => (previous !== null && next.seq < previous.seq ? previous : next))
    }
    const offStatus = desktop.onPendingAnswersChanged(take)
    const offRejected = desktop.onAnswerRejected?.((event) => {
      if (event.reason === 'invalid') setSkipped(true)
    })
    void desktop.getPendingAnswers?.().then((next) => {
      if (!disposed && next) take(next)
    }).catch(() => undefined)
    return () => {
      disposed = true
      offStatus()
      offRejected?.()
    }
  }, [])

  // The skipped notice is said once, then goes: there is nothing left to retry.
  useEffect(() => {
    if (!skipped) return undefined
    const timer = setTimeout(() => setSkipped(false), 8000)
    return () => clearTimeout(timer)
  }, [skipped])

  const retry = useCallback(() => {
    setSkipped(false)
    void window.jplearnDesktop?.retryPendingAnswers?.().catch(() => undefined)
  }, [])

  const waiting = snapshot?.count ?? 0
  return {
    waiting,
    showWaiting: waiting > 0 && (snapshot?.headAttempts ?? 0) > 0 && snapshot?.headError != null,
    skipped,
    retry,
  }
}
