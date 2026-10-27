/**
 * Resuming an interrupted study session (audit 2, F7).
 *
 * The saved session named only the section (`vocab_n5`), and every vocabulary and kanji level
 * shares that key, so an N3 session came back on N5's cards. Resume also ran the deck's unseen
 * cards as a custom list, sizing the run to however many there were. These drive the real App:
 * a save is put in storage, the resume toast is pressed, and the round on screen is read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { appReady } from './test-entry'
import { SESSION_STORAGE_KEY } from './lib/appStorage'
import { baseDesktopApi } from './test-fixtures/desktopApi'
import App from './App'

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

function vocabCards(rows: Array<[number, string, string, string]>) {
  const ids = rows.map(([id]) => id)
  return rows.map(([id, character, romaji, meaning]) => ({
    id, character, romaji, meaning,
    tags: ['vocab'],
    example_sentence: null,
    dictionary_summary: null,
    is_leech: false,
    curriculum_stage: 1,
    meaning_distractor_ids: ids.filter((other) => other !== id),
    character_distractor_ids: ids.filter((other) => other !== id),
    note_key: `note:v1:builtin:${id.toString(16).padStart(64, '0')}`,
  }))
}

/* Two levels with nothing in common, so the prompt alone says which deck a round came from. */
const n5Cards = vocabCards([
  [1, '水', 'mizu', 'water'], [2, '火', 'hi', 'fire'],
  [3, '山', 'yama', 'mountain'], [4, '川', 'kawa', 'river'],
])
const n3Cards = vocabCards([
  [5001, '経済', 'keizai', 'economy'], [5002, '政治', 'seiji', 'politics'],
  [5003, '環境', 'kankyou', 'environment'], [5004, '議論', 'giron', 'debate'],
])

const restore = {
  sessionScore: 2, sessionRounds: 3, sessionPoints: 2, sessionStreak: 1, sessionBestStreak: 2,
  sessionConfidenceCount: 0, sessionConfidenceTotal: 0, livesRemaining: 3,
}

function savedSession(extra: Record<string, unknown> = {}) {
  return {
    activeScript: 'vocab_n5',
    activeGame: 'meaning_match',
    livesEnabled: false,
    leechFocusEnabled: false,
    confidenceCaptureEnabled: false,
    sessionTargetItems: 8,
    seenCardIds: [5001],
    sessionStartedAt: '2026-10-27T00:00:00.000Z',
    restore,
    ...extra,
  }
}

function makeApi() {
  const getDeckCards = vi.fn(async (slug: string) => ({
    slug, name: slug, cards: slug === 'vocab_n3' ? n3Cards : slug === 'vocab_n5' ? n5Cards : [],
  }))
  const startSessionGoal = vi.fn(async (_payload: { targetItems: number }) => ({
    ok: true,
    goal: {
      session_id: 'resumed', target_items: 5, target_minutes: null,
      target_accuracy: null, started_at_utc: '2026-01-01T00:00:00+00:00',
    },
  }))
  return { ...baseDesktopApi, getDeckCards, startSessionGoal }
}

let api: ReturnType<typeof makeApi>

beforeEach(() => {
  window.localStorage.clear()
  api = makeApi()
  window.jplearnDesktop = api as unknown as typeof window.jplearnDesktop
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/** the prompt of the round on screen, if it is one of `cards` */
function promptFrom(cards: Array<{ character: string }>): string | null {
  const characters = new Set(cards.map((card) => card.character))
  const prompt = Array.from(document.querySelectorAll('span, div, p, h1, h2'))
    .find((el) => characters.has((el.textContent ?? '').trim()))
  return prompt ? (prompt.textContent ?? '').trim() : null
}

/* the resume toast waits two seconds after mount, which uses most of the default budget */
describe('resuming an interrupted session', { timeout: 15000 }, () => {
  it('reopens the level the session was on, at the saved length', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession({ deckSlug: 'vocab_n3' })))
    render(<App />)
    await appReady()

    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }, { timeout: 4000 }))

    await waitFor(() => expect(promptFrom(n3Cards)).not.toBeNull(), { timeout: 4000 })
    expect(promptFrom(n5Cards)).toBeNull()
    expect(api.getDeckCards).toHaveBeenCalledWith('vocab_n3')
    /* eight rounds were chosen and three were played: the run counts on from three of eight,
       and the goal asks the backend for the five left */
    expect(screen.getByRole('img', { name: '3 of 8 answered' })).toBeTruthy()
    expect(api.startSessionGoal).toHaveBeenLastCalledWith({ targetItems: 5 })
  })

  it('saves the deck it is studying, so the next resume can find it again', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession({ deckSlug: 'vocab_n3' })))
    render(<App />)
    await appReady()
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }, { timeout: 4000 }))
    await waitFor(() => expect(promptFrom(n3Cards)).not.toBeNull(), { timeout: 4000 })

    const prompt = promptFrom(n3Cards)
    const expected = n3Cards.find((card) => card.character === prompt)?.meaning
    const slip = Array.from(document.querySelectorAll('.rd-slip'))
      .find((el) => (el.querySelector('b')?.textContent ?? '').trim() === expected) as HTMLElement | undefined
    if (!slip) throw new Error('no correct option on screen')
    fireEvent.click(slip)

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')
      expect(saved).toMatchObject({ activeScript: 'vocab_n5', deckSlug: 'vocab_n3', sessionTargetItems: 8 })
      expect(saved.restore.sessionRounds).toBe(4)
    }, { timeout: 4000 })
  })

  it('does not offer a session saved before the deck was recorded, and drops it', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession()))
    render(<App />)
    await appReady()

    /* the toast would appear two seconds after mount */
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('does not offer a save whose deck is not one its section studies', async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession({ deckSlug: 'kanji_n3' })))
    render(<App />)
    await appReady()

    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })
})
