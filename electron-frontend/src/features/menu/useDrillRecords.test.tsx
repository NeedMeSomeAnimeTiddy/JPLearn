import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnswerSavedEvent, PendingAnswersSnapshot } from '../../electron'
import type { MinigameRecordPayload } from '../../generated/types'
import type { DeckSlugInput } from '../../types'
import { useDrillRecords } from './useDrillRecords'

/* audit 17, F1: the Drills record is read from review history, per level deck, and only the latest
   read for the deck on screen is ever drawn */

interface Deferred { slug: string; resolve: (rows: MinigameRecordPayload[]) => void; reject: (error: Error) => void }

function fakeDesktop() {
  const reads: Deferred[] = []
  const saved = new Set<(event: AnswerSavedEvent) => void>()
  const status = new Set<(snapshot: PendingAnswersSnapshot) => void>()
  let seq = 0
  const getMinigameRecords = vi.fn((slug: string) => new Promise<{ records: MinigameRecordPayload[] }>((resolve, reject) => {
    reads.push({ slug, resolve: (records) => resolve({ records }), reject })
  }))
  window.jplearnDesktop = {
    getMinigameRecords,
    getPendingAnswers: async () => ({ count: 0, headError: null, headAttempts: 0, seq: 0, pending: [] }),
    onAnswerSaved: (listener: (event: AnswerSavedEvent) => void) => { saved.add(listener); return () => { saved.delete(listener) } },
    onAnswerRejected: () => () => {},
    onPendingAnswersChanged: (listener: (snapshot: PendingAnswersSnapshot) => void) => {
      status.add(listener)
      return () => { status.delete(listener) }
    },
  } as unknown as Window['jplearnDesktop']
  return {
    reads,
    getMinigameRecords,
    /** the main process's queue now holds `count` answers */
    queue(count: number) {
      seq += 1
      const pending = Array.from({ length: count }, (_, i) => ({ answerId: `a${i}`, cardKey: `kanji_n3:${i}` }))
      for (const listener of status) listener({ count, headError: null, headAttempts: 0, seq, pending })
    },
    /** an `answer-saved` event, sent again by a reload or a second window */
    replaySaved(answerId: string) {
      seq += 1
      for (const listener of saved) listener({ answerId, cardKey: 'kanji_n3:0', result: { ok: true } as AnswerSavedEvent['result'], seq })
    },
  }
}

const row = (mode: string, attempted: number, correct: number, bestRun: number): MinigameRecordPayload => (
  { mode, attempted, correct, best_run: bestRun }
)

describe('useDrillRecords', () => {
  afterEach(() => {
    window.jplearnDesktop = undefined as unknown as Window['jplearnDesktop']
  })

  it('reads the level deck on screen and holds null until the reply lands', async () => {
    const desktop = fakeDesktop()
    const { result } = renderHook(() => useDrillRecords('kanji_n3'))
    expect(result.current.records).toBeNull()
    expect(desktop.getMinigameRecords).toHaveBeenCalledWith('kanji_n3')
    await act(async () => { desktop.reads[0].resolve([row('imposter', 10, 7, 4)]) })
    expect(result.current.records).toEqual({ imposter: { attempted: 10, correct: 7, bestRun: 4 } })
  })

  it('reads nothing while the screen is not up', () => {
    const desktop = fakeDesktop()
    renderHook(() => useDrillRecords(null))
    expect(desktop.getMinigameRecords).not.toHaveBeenCalled()
  })

  it('stays on the placeholder when the read fails', async () => {
    const desktop = fakeDesktop()
    const { result } = renderHook(() => useDrillRecords('hiragana'))
    await act(async () => { desktop.reads[0].reject(new Error('bridge down')) })
    expect(result.current.records).toBeNull()
  })

  it('reads again once a delayed save has landed and the queue is empty', async () => {
    const desktop = fakeDesktop()
    const { result } = renderHook(() => useDrillRecords('kanji_n3'))
    await act(async () => { desktop.reads[0].resolve([row('imposter', 1, 1, 1)]) })
    act(() => desktop.queue(1))
    expect(desktop.getMinigameRecords).toHaveBeenCalledTimes(1)
    act(() => desktop.queue(0))
    expect(desktop.getMinigameRecords).toHaveBeenCalledTimes(2)
    /* the record on screen stays until the new one lands, rather than flicking to the placeholder */
    expect(result.current.records?.imposter).toEqual({ attempted: 1, correct: 1, bestRun: 1 })
    await act(async () => { desktop.reads[1].resolve([row('imposter', 2, 2, 2)]) })
    expect(result.current.records?.imposter).toEqual({ attempted: 2, correct: 2, bestRun: 2 })
  })

  it('reads again when a refused save empties the queue, and shows what the database holds', async () => {
    /* the queue empties the same way whether the save was taken or refused */
    const desktop = fakeDesktop()
    const { result } = renderHook(() => useDrillRecords('kanji_n3'))
    await act(async () => { desktop.reads[0].resolve([row('imposter', 3, 2, 2)]) })
    act(() => desktop.queue(1))
    act(() => desktop.queue(0))
    await act(async () => { desktop.reads[1].resolve([row('imposter', 3, 2, 2)]) })
    expect(result.current.records?.imposter?.attempted).toBe(3)
  })

  it('does not read again for a replayed outcome', async () => {
    const desktop = fakeDesktop()
    renderHook(() => useDrillRecords('kanji_n3'))
    await act(async () => { desktop.reads[0].resolve([]) })
    act(() => {
      desktop.replaySaved('a0')
      desktop.replaySaved('a0')
    })
    expect(desktop.getMinigameRecords).toHaveBeenCalledTimes(1)
  })

  it('draws only the latest read: A, then B, then A again', async () => {
    const desktop = fakeDesktop()
    const { result, rerender } = renderHook(({ slug }) => useDrillRecords(slug), {
      initialProps: { slug: 'kanji_n3' as DeckSlugInput },
    })
    rerender({ slug: 'kanji_n2' })
    rerender({ slug: 'kanji_n3' })
    expect(desktop.reads.map((read) => read.slug)).toEqual(['kanji_n3', 'kanji_n2', 'kanji_n3'])
    await act(async () => {
      desktop.reads[2].resolve([row('imposter', 5, 5, 5)])
      desktop.reads[1].resolve([row('imposter', 9, 0, 0)])
      desktop.reads[0].resolve([row('imposter', 1, 0, 0)])
    })
    expect(result.current.records?.imposter).toEqual({ attempted: 5, correct: 5, bestRun: 5 })
  })

  it('drops a shown record at once on a reset and on a deck change', async () => {
    const desktop = fakeDesktop()
    const { result, rerender } = renderHook(({ slug }) => useDrillRecords(slug), {
      initialProps: { slug: 'kanji_n3' as DeckSlugInput },
    })
    await act(async () => { desktop.reads[0].resolve([row('imposter', 4, 4, 4)]) })
    expect(result.current.records).not.toBeNull()
    act(() => result.current.refresh())
    expect(result.current.records).toBeNull()
    await act(async () => { desktop.reads[1].resolve([row('imposter', 4, 4, 4)]) })
    expect(result.current.records).not.toBeNull()
    rerender({ slug: 'kanji_n2' })
    expect(result.current.records).toBeNull()
  })

  it('drops a read still on its way when progress is reset', async () => {
    const desktop = fakeDesktop()
    const { result } = renderHook(() => useDrillRecords('kanji_n3'))
    act(() => result.current.refresh())
    expect(result.current.records).toBeNull()
    await act(async () => { desktop.reads[0].resolve([row('imposter', 40, 30, 12)]) })
    expect(result.current.records).toBeNull()
    await act(async () => { desktop.reads[1].resolve([]) })
    await waitFor(() => expect(result.current.records).toEqual({}))
  })
})
