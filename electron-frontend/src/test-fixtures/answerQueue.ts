import { vi } from 'vitest'
import type {
  AnswerRejectedEvent,
  AnswerSavedEvent,
  PendingAnswersSnapshot,
  RecordGameResult,
} from '../electron'

type RecordPayload = Parameters<Window['jplearnDesktop']['recordGameResult']>[0]

export const DEFAULT_RECORD_RESULT: RecordGameResult = {
  ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5,
}

/**
 * Stands in for the main process's answer queue (electron/answer_queue.cjs) in renderer tests.
 *
 * `recordGameResult` admits the answer at once, as the real IPC does, then delivers `resultFor`'s
 * outcome as an `answer-saved` event -- or `answer-rejected` if `resultFor` throws -- followed by
 * a queue status, in the main process's order. A test that hands back a promise it resolves later
 * can hold an answer "waiting to save".
 *
 * Spread the returned object into the desktop API so the listeners are wired:
 * `window.jplearnDesktop = { ...baseDesktopApi, ...fakeAnswerQueue(...) }`.
 */
export function fakeAnswerQueue(
  resultFor: (payload: RecordPayload) => RecordGameResult | Promise<RecordGameResult> = () => DEFAULT_RECORD_RESULT,
) {
  const saved = new Set<(event: AnswerSavedEvent) => void>()
  const rejected = new Set<(event: AnswerRejectedEvent) => void>()
  const status = new Set<(snapshot: PendingAnswersSnapshot) => void>()
  const pending: { answerId: string; cardKey: string }[] = []
  let seq = 0

  const snapshot = (): PendingAnswersSnapshot => ({
    count: pending.length, headError: null, headAttempts: 0, seq, pending: pending.map((entry) => ({ ...entry })),
  })
  const emitStatus = () => {
    seq += 1
    const next = snapshot()
    for (const listener of status) listener(next)
  }
  const settle = (answerId: string) => {
    const index = pending.findIndex((entry) => entry.answerId === answerId)
    if (index >= 0) pending.splice(index, 1)
  }

  const recordGameResult = vi.fn(async (payload: RecordPayload) => {
    const cardKey = `${payload.slug}:${payload.cardId}`
    pending.push({ answerId: payload.answerId, cardKey })
    emitStatus()
    void (async () => {
      try {
        const result = await resultFor(payload)
        settle(payload.answerId)
        seq += 1
        for (const listener of saved) listener({ answerId: payload.answerId, cardKey, result, seq })
      } catch (error) {
        settle(payload.answerId)
        seq += 1
        const message = error instanceof Error ? error.message : String(error)
        for (const listener of rejected) {
          listener({ answerId: payload.answerId, cardKey, reason: 'invalid', error: message, seq })
        }
      }
      emitStatus()
    })()
    return { status: 'accepted' as const, answerId: payload.answerId }
  })

  return {
    recordGameResult,
    getPendingAnswers: async () => snapshot(),
    retryPendingAnswers: async () => snapshot(),
    onAnswerSaved: (listener: (event: AnswerSavedEvent) => void) => {
      saved.add(listener)
      return () => { saved.delete(listener) }
    },
    onAnswerRejected: (listener: (event: AnswerRejectedEvent) => void) => {
      rejected.add(listener)
      return () => { rejected.delete(listener) }
    },
    onPendingAnswersChanged: (listener: (snapshot: PendingAnswersSnapshot) => void) => {
      status.add(listener)
      return () => { status.delete(listener) }
    },
  }
}
