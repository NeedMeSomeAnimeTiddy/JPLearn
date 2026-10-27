import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnswerRejectedEvent, AnswerSavedEvent, PendingAnswersSnapshot } from '../../electron'
import { PendingAnswersBar } from './components/PendingAnswersBar'
import { answerCardKey, newAnswerIdentity } from './answerIdentity'
import { hasNewerPendingAnswer, useAnswerOutcomes } from './useAnswerOutcomes'
import { reportSkippedAnswer } from './skippedAnswers'
import { emptyCardScores, mergeStoredScores } from '../../lib/cardScores'

function fakeDesktop(initial: PendingAnswersSnapshot) {
  const saved = new Set<(event: AnswerSavedEvent) => void>()
  const rejected = new Set<(event: AnswerRejectedEvent) => void>()
  const status = new Set<(snapshot: PendingAnswersSnapshot) => void>()
  const retryPendingAnswers = vi.fn(async () => initial)
  window.jplearnDesktop = {
    getPendingAnswers: async () => initial,
    retryPendingAnswers,
    onAnswerSaved: (listener: (event: AnswerSavedEvent) => void) => { saved.add(listener); return () => saved.delete(listener) },
    onAnswerRejected: (listener: (event: AnswerRejectedEvent) => void) => { rejected.add(listener); return () => rejected.delete(listener) },
    onPendingAnswersChanged: (listener: (snapshot: PendingAnswersSnapshot) => void) => { status.add(listener); return () => status.delete(listener) },
  } as unknown as typeof window.jplearnDesktop
  return {
    retryPendingAnswers,
    save: (event: AnswerSavedEvent) => saved.forEach((listener) => listener(event)),
    reject: (event: AnswerRejectedEvent) => rejected.forEach((listener) => listener(event)),
    status: (snapshot: PendingAnswersSnapshot) => status.forEach((listener) => listener(snapshot)),
  }
}

const empty: PendingAnswersSnapshot = { count: 0, headError: null, headAttempts: 0, seq: 0, pending: [] }
const result = { ok: true, card_id: 1, repetitions: 1, interval: 1, next_review: '2026-01-02', ease_factor: 2.5 }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('answer identity', () => {
  it('keeps the local calendar day alongside the UTC instant', () => {
    const identity = newAnswerIdentity(new Date(2026, 9, 27, 0, 30), () => 'id')
    expect(identity.answerId).toBe('id')
    expect(identity.answeredLocalDate).toBe('2026-10-27')
    expect(identity.answeredAtUtc).toBe(new Date(2026, 9, 27, 0, 30).toISOString())
    expect(answerCardKey('hiragana', 4)).toBe('hiragana:4')
  })
})

describe('useAnswerOutcomes', () => {
  it('hands each answer to its handler once, however often it arrives', async () => {
    const desktop = fakeDesktop(empty)
    const onSaved = vi.fn()
    const onRejected = vi.fn()
    renderHook(() => useAnswerOutcomes({ onSaved, onRejected }))
    await act(async () => {})

    act(() => {
      desktop.save({ answerId: 'a', cardKey: 'k', result, seq: 1 })
      desktop.save({ answerId: 'a', cardKey: 'k', result: { ...result, replayed: true }, seq: 2 })
      desktop.reject({ answerId: 'a', cardKey: 'k', reason: 'reset', error: null, seq: 3 })
      desktop.reject({ answerId: 'b', cardKey: 'k', reason: 'invalid', error: 'x', seq: 4 })
    })

    expect(onSaved).toHaveBeenCalledOnce()
    expect(onRejected).toHaveBeenCalledOnce()
    expect(onRejected.mock.calls[0][0].answerId).toBe('b')
  })

  it('reads the queue on mount and tells when it empties', async () => {
    const waiting = { ...empty, count: 1, seq: 5, pending: [{ answerId: 'a', cardKey: 'k' }] }
    const desktop = fakeDesktop(waiting)
    const onQueueChanged = vi.fn()
    renderHook(() => useAnswerOutcomes({ onSaved: vi.fn(), onRejected: vi.fn(), onQueueChanged }))
    await act(async () => {})
    expect(onQueueChanged).toHaveBeenLastCalledWith(waiting, false)

    act(() => desktop.status({ ...empty, seq: 4 }))
    expect(onQueueChanged).toHaveBeenCalledTimes(1)
    act(() => desktop.status({ ...empty, seq: 6 }))
    expect(onQueueChanged).toHaveBeenLastCalledWith({ ...empty, seq: 6 }, true)
  })

  it('knows when a newer answer for the same card is still waiting', () => {
    const snapshot = { ...empty, count: 2, pending: [{ answerId: 'a', cardKey: 'k' }, { answerId: 'b', cardKey: 'k' }] }
    expect(hasNewerPendingAnswer(snapshot, 'k', 'a')).toBe(true)
    expect(hasNewerPendingAnswer({ ...snapshot, pending: [{ answerId: 'a', cardKey: 'k' }] }, 'k', 'a')).toBe(false)
    expect(hasNewerPendingAnswer(snapshot, 'other', 'a')).toBe(false)
    expect(hasNewerPendingAnswer(null, 'k', 'a')).toBe(false)
  })
})

describe('PendingAnswersBar', () => {
  it('stays hidden until the oldest waiting answer has failed', async () => {
    const desktop = fakeDesktop(empty)
    render(<PendingAnswersBar />)
    await act(async () => {})
    expect(screen.getByRole('status').textContent).toBe('')

    act(() => desktop.status({ count: 1, headError: null, headAttempts: 1, seq: 1, pending: [] }))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('says how many answers are waiting and retries on request', async () => {
    const desktop = fakeDesktop(empty)
    render(<PendingAnswersBar />)
    await act(async () => {})

    act(() => desktop.status({ count: 3, headError: 'database is locked', headAttempts: 2, seq: 1, pending: [] }))
    const bar = screen.getByRole('status')
    expect(bar.textContent).toContain("Couldn't confirm this answer was saved.")
    expect(bar.textContent).toContain('(3 waiting)')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(desktop.retryPendingAnswers).toHaveBeenCalledOnce()

    act(() => desktop.status({ ...empty, seq: 2 }))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('reports a skipped answer once, then clears', async () => {
    vi.useFakeTimers()
    const desktop = fakeDesktop(empty)
    render(<PendingAnswersBar />)
    await act(async () => {})

    act(() => desktop.reject({ answerId: 'a', cardKey: 'k', reason: 'invalid', error: 'Unknown card id', seq: 1 }))
    expect(screen.getByRole('status').textContent).toContain("One answer couldn't be saved and was skipped.")
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()

    act(() => vi.advanceTimersByTime(8000))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('keeps one live region mounted, so the first notice is announced', async () => {
    const desktop = fakeDesktop(empty)
    render(<PendingAnswersBar />)
    await act(async () => {})
    const region = screen.getByRole('status')

    act(() => desktop.status({ count: 1, headError: 'database is locked', headAttempts: 1, seq: 1, pending: [] }))
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toContain("Couldn't confirm this answer was saved.")
  })

  it('reports an answer the main process never admitted as skipped', async () => {
    fakeDesktop(empty)
    render(<PendingAnswersBar />)
    await act(async () => {})

    act(() => reportSkippedAnswer())
    expect(screen.getByRole('status').textContent).toContain("One answer couldn't be saved and was skipped.")
  })
})

describe('mergeStoredScores', () => {
  it('takes the database, keeps the named cards, and drops a score the database never took', () => {
    const current = { ...emptyCardScores(), hiragana: { 1: 2, 2: 1, 3: 4 } }
    const stored = { ...emptyCardScores(), hiragana: { 1: 1, 4: 3 } }
    const merged = mergeStoredScores(current, stored, (script, cardId) => script === 'hiragana' && cardId === 3)
    expect(merged.hiragana).toEqual({ 1: 1, 3: 4, 4: 3 })
  })

  it('accepts an empty database', () => {
    const current = { ...emptyCardScores(), hiragana: { 1: 1 } }
    expect(mergeStoredScores(current, emptyCardScores(), () => false).hiragana).toEqual({})
  })
})
