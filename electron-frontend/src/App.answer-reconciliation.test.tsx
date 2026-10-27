/**
 * How the study session reconciles each answer's late outcome with the mastery counters it already
 * stepped (audit 1, F1/F3): drives the real App against a fake answer queue that can hold an answer
 * "waiting to save" until the test lets it go. The counters are read from their localStorage
 * snapshot, which mirrors the in-memory map on every change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { openGame } from './test-entry'
import { CARD_SCORES_STORAGE_KEY } from './lib/appStorage'
import App from './App'
import { DEFAULT_RECORD_RESULT, fakeAnswerQueue } from './test-fixtures/answerQueue'
import type { AnswerSavedEvent, PendingAnswersSnapshot, RecordGameResult } from './electron'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => (
    <span>{typeof sequence[0] === 'string' ? sequence[0] : ''}</span>
  ),
}))

vi.mock('./features/onboarding/useTypewriter', () => ({
  useTypewriter: (text: string, onComplete: () => void) => {
    onComplete()
    return text
  },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class MockObserver {
  constructor(_c?: unknown) {}
  disconnect(): void {}
  observe(_t?: Element): void {}
  unobserve(_t?: Element): void {}
  takeRecords(): [] { return [] }
}
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockObserver })
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: MockObserver })
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: MockObserver })
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: MockObserver })
if (!Element.prototype.scrollBy) {
  Element.prototype.scrollBy = function scrollBy() {}
}

const cards = [
  { id: 0, character: 'あ', romaji: 'a', meaning: 'a-meaning' },
  { id: 1, character: 'い', romaji: 'i', meaning: 'i-meaning' },
  { id: 2, character: 'う', romaji: 'u', meaning: 'u-meaning' },
  { id: 3, character: 'え', romaji: 'e', meaning: 'e-meaning' },
].map((c) => ({
  ...c,
  tags: ['hiragana'],
  example_sentence: null,
  dictionary_summary: null,
  is_leech: false,
  curriculum_stage: 1,
  meaning_distractor_ids: [0, 1, 2, 3].filter((i) => i !== c.id),
  character_distractor_ids: [0, 1, 2, 3].filter((i) => i !== c.id),
  note_key: `note:v1:builtin:${c.id.toString(16).padStart(64, '0')}`,
}))

const emptyActivity = {
  days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function makeApi(
  queue: ReturnType<typeof fakeAnswerQueue>,
  getCardScores: () => Promise<{ scores: Record<string, Record<number, number>> }>,
  overrides: Record<string, unknown> = {},
) {
  return {
    versions: { chrome: '0', electron: '0', node: '0' },
    getStudySummary: async () => ({
      decks: [], streak: { current_days: 0, best_days: 0, freezes_available: 0 },
      activity: { week: emptyActivity, month: { ...emptyActivity, days: 30 } },
      mistakes: [], minigame_performance: [], session_history: [], item_history: [],
      generated_at: '2026-01-01T00:00:00+00:00',
    }),
    getDeckCards: async () => ({ cards }),
    getBlockProgress: async () => ({ blocks: [] }),
    getStudyQueue: async () => ({ items: [] }),
    getOverviewCharacterMastery: async () => ({
      blocks: { hiragana: [], katakana: [] },
      category_blocks: { vocab_n5: [], grammar_patterns: [] },
      kanji_cards: [],
    }),
    getCardScores,
    ...queue,
    startSessionGoal: async () => ({
      ok: true,
      goal: {
        session_id: 'test-session', target_items: 10, target_minutes: null,
        target_accuracy: null, started_at_utc: '2026-01-01T00:00:00+00:00',
      },
    }),
    getSessionSummary: async () => ({
      ok: true,
      summary: {
        session_id: 'test-session', target_items: 10, completed_items: 0,
        reviewed: 0, correct: 0, accuracy: 0, target_accuracy: null, goal_met: false,
      },
    }),
    notifyStartupReady: async () => ({ ok: true }),
    setStartupTheme: async () => ({ ok: true, theme: 'lofi_dusk' }),
    getCardNote: async () => ({ note: null }),
    ...overrides,
  } as unknown as typeof window.jplearnDesktop
}

function hiraganaScores(): Record<string, number> {
  const raw = window.localStorage.getItem(CARD_SCORES_STORAGE_KEY)
  return raw ? (JSON.parse(raw).hiragana ?? {}) : {}
}

function slipLabel(slip: Element): string {
  return (slip.querySelector('b')?.textContent ?? '').trim()
}

function readRound(): { cardId: number; expected: string; options: HTMLButtonElement[] } | null {
  const options = Array.from(document.querySelectorAll('.rd-slip')) as HTMLButtonElement[]
  if (options.length === 0) return null
  const promptEl = Array.from(document.querySelectorAll('span, div, p, h1, h2'))
    .find((el) => /^[あいうえ]$/.test((el.textContent ?? '').trim()))
  const card = cards.find((c) => c.character === (promptEl?.textContent ?? '').trim())
  if (!card) return null
  if (!options.some((o) => slipLabel(o) === card.meaning)) return null
  return { cardId: card.id, expected: card.meaning, options }
}

function readTicks(): number {
  return document.querySelectorAll('.rd-ticks i.on, .rd-ticks i.bad').length
}

/** Answers the current round correctly and returns the card it was on. */
async function answerCorrectly(): Promise<number> {
  const before = readTicks()
  await waitFor(() => expect(readRound()).not.toBeNull(), { timeout: 4000 })
  const round = readRound()
  if (!round) throw new Error('round became unreadable after settling')
  fireEvent.click(round.options.find((o) => slipLabel(o) === round.expected)!)
  await waitFor(() => expect(readTicks()).toBe(before + 1), { timeout: 4000 })
  const next = screen.queryByRole('button', { name: /continue immediately/i }) as HTMLButtonElement | null
  if (next && !next.disabled) fireEvent.click(next)
  return round.cardId
}

async function startMeaningMatch(): Promise<void> {
  render(<App />)
  await openGame('Hiragana', 'Meaning Match')
  await waitFor(() => expect(readTicks()).toBe(0))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('reconciling answers with the stored counters', () => {
  it('takes back the step of a first answer the database refused, even when the database is empty', async () => {
    const queue = fakeAnswerQueue(() => { throw new Error('Unknown card id') })
    window.jplearnDesktop = makeApi(queue, async () => ({ scores: {} }))
    await startMeaningMatch()

    const cardId = await answerCorrectly()

    await waitFor(() => expect(hiraganaScores()[cardId]).toBeUndefined())
    expect(screen.getByText("One answer couldn't be saved and was skipped.")).toBeTruthy()
  })

  it('says an answer the main process never admitted was skipped, and takes back its step', async () => {
    const queue = fakeAnswerQueue()
    const getCardScores = vi.fn(async () => ({ scores: {} }))
    window.jplearnDesktop = makeApi(queue, getCardScores, {
      recordGameResult: vi.fn(async () => { throw new Error('IPC down') }),
    })
    await startMeaningMatch()
    const readsBefore = getCardScores.mock.calls.length

    const cardId = await answerCorrectly()

    await waitFor(() => expect(screen.getByText("One answer couldn't be saved and was skipped.")).toBeTruthy())
    await waitFor(() => expect(getCardScores.mock.calls.length).toBeGreaterThan(readsBefore))
    await waitFor(() => expect(hiraganaScores()[cardId]).toBeUndefined())
  })

  it('keeps a waiting answer while a later one is refused, then takes the database once both are settled', async () => {
    const first = deferred<RecordGameResult>()
    let calls = 0
    const queue = fakeAnswerQueue(() => {
      calls += 1
      if (calls === 1) return first.promise
      throw new Error('Unknown card id')
    })
    let stored: Record<number, number> = {}
    const getCardScores = vi.fn(async () => ({ scores: { hiragana: stored } }))
    window.jplearnDesktop = makeApi(queue, getCardScores)
    await startMeaningMatch()

    const waitingCard = await answerCorrectly()
    let refusedCard = await answerCorrectly()
    while (refusedCard === waitingCard) refusedCard = await answerCorrectly()
    const readsWhileWaiting = getCardScores.mock.calls.length

    // nothing is re-read while the first answer still waits, and its step stands
    await act(async () => {})
    expect(getCardScores.mock.calls.length).toBe(readsWhileWaiting)
    expect(hiraganaScores()[waitingCard]).toBeGreaterThan(0)

    stored = { [waitingCard]: 1 }
    await act(async () => { first.resolve({ ...DEFAULT_RECORD_RESULT, mastery_score: 1 }) })

    await waitFor(() => expect(hiraganaScores()[refusedCard]).toBeUndefined())
    expect(hiraganaScores()[waitingCard]).toBe(1)
  })

  it('does not let a slow database read wipe the step of an answer given meanwhile', async () => {
    const reads: ReturnType<typeof deferred<{ scores: Record<string, Record<number, number>> }>>[] = []
    const getCardScores = vi.fn(() => {
      const read = deferred<{ scores: Record<string, Record<number, number>> }>()
      reads.push(read)
      return read.promise
    })
    const later = deferred<RecordGameResult>()
    let calls = 0
    const queue = fakeAnswerQueue(() => {
      calls += 1
      if (calls === 1) throw new Error('Unknown card id')
      return later.promise
    })
    window.jplearnDesktop = makeApi(queue, getCardScores)
    render(<App />)
    // the startup read
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))
    await act(async () => { reads[0].resolve({ scores: {} }) })
    await openGame('Hiragana', 'Meaning Match')
    await waitFor(() => expect(readTicks()).toBe(0))

    // a refused answer starts a re-read, which the test holds
    await answerCorrectly()
    await waitFor(() => expect(reads.length).toBe(2))

    // meanwhile another answer is given and waits to save
    const laterCard = await answerCorrectly()
    const stepped = hiraganaScores()[laterCard]
    expect(stepped).toBeGreaterThan(0)

    await act(async () => { reads[1].resolve({ scores: { hiragana: { 9: 1 } } }) })
    expect(hiraganaScores()[laterCard]).toBe(stepped)
  })

  it('a save that lands after the round moved on still sets the stored counter', async () => {
    const first = deferred<RecordGameResult>()
    let calls = 0
    const queue = fakeAnswerQueue(() => {
      calls += 1
      return calls === 1 ? first.promise : DEFAULT_RECORD_RESULT
    })
    window.jplearnDesktop = makeApi(queue, async () => ({ scores: {} }))
    await startMeaningMatch()

    const firstCard = await answerCorrectly()
    await answerCorrectly()
    await act(async () => { first.resolve({ ...DEFAULT_RECORD_RESULT, mastery_score: 5 }) })

    await waitFor(() => expect(hiraganaScores()[firstCard]).toBe(5))
  })

  it('after a reload, an answer from before it saves and the window takes the database view', async () => {
    const queue = fakeAnswerQueue()
    const getCardScores = vi.fn(async () => ({ scores: { hiragana: { 2: 3 } } }))
    const savedListeners = new Set<(event: AnswerSavedEvent) => void>()
    const statusListeners = new Set<(snapshot: PendingAnswersSnapshot) => void>()
    const waiting: PendingAnswersSnapshot = {
      count: 1, headError: null, headAttempts: 1, seq: 10, pending: [{ answerId: 'before-reload', cardKey: 'hiragana:2' }],
    }
    window.jplearnDesktop = makeApi(queue, getCardScores, {
      getPendingAnswers: async () => waiting,
      onAnswerSaved: (listener: (event: AnswerSavedEvent) => void) => {
        savedListeners.add(listener)
        return () => { savedListeners.delete(listener) }
      },
      onPendingAnswersChanged: (listener: (snapshot: PendingAnswersSnapshot) => void) => {
        statusListeners.add(listener)
        return () => { statusListeners.delete(listener) }
      },
    })
    render(<App />)
    await waitFor(() => expect(savedListeners.size).toBeGreaterThan(0))
    await act(async () => {})
    const readsBefore = getCardScores.mock.calls.length

    await act(async () => {
      const event = { answerId: 'before-reload', cardKey: 'hiragana:2', result: { ...DEFAULT_RECORD_RESULT, mastery_score: 3 }, seq: 11 }
      for (const listener of savedListeners) listener(event)
      for (const listener of statusListeners) listener({ count: 0, headError: null, headAttempts: 0, seq: 12, pending: [] })
    })

    await waitFor(() => expect(getCardScores.mock.calls.length).toBeGreaterThan(readsBefore))
    await waitFor(() => expect(hiraganaScores()[2]).toBe(3))
  })
})
