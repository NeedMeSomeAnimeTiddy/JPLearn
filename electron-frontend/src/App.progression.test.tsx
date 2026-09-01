/**
 * The curriculum's soft gate (issue #78 Phase 4), now reached through the menu's path.
 *
 * `JPLEARN_GRAPH` was defined, persisted and exposed over the bridge without
 * anything rendering it. These drive the real App because the behaviour that
 * matters — a gated node asks once, then opens — crosses the feature hook, the
 * shared warning modal and App's navigation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { PROGRESSION_OVERRIDES_STORAGE_KEY } from './features/progression'

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

function progressionNode(overrides: Record<string, unknown> = {}) {
  return {
    node_id: 'hiragana',
    name: 'Hiragana',
    category: 'hiragana',
    status: 'locked',
    mastered_ratio: 0,
    is_reachable: false,
    mastered_count: 0,
    total_count: 104,
    is_tracked: true,
    ...overrides,
  }
}

/** Mirrors the real payload shape: some tracked, some deliberately not. */
const NODES = [
  progressionNode({ node_id: 'tutorial', name: 'Tutorial', status: 'mastered', mastered_count: 1, total_count: 1 }),
  progressionNode({ node_id: 'hiragana', name: 'Hiragana', status: 'unlocked', mastered_count: 91 }),
  progressionNode({ node_id: 'kanji_n5', name: 'Basic Kanji (N5)', status: 'locked', total_count: 99 }),
  progressionNode({ node_id: 'reading', name: 'Reading', status: 'locked', is_tracked: false, total_count: 0 }),
]

const emptyActivity = {
  days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0,
}

function makeApi(getProgressionState = vi.fn(async () => ({ nodes: NODES }))) {
  return {
    versions: { chrome: '0', electron: '0', node: '0' },
    getProgressionState,
    getStudySummary: async () => ({
      decks: [], streak: { current_days: 0, best_days: 0, freezes_available: 0 },
      activity: { week: emptyActivity, month: { ...emptyActivity, days: 30 } },
      mistakes: [], minigame_performance: [], session_history: [], item_history: [],
      generated_at: '2026-01-01T00:00:00+00:00',
    }),
    getDeckCards: async () => ({ cards: [] }),
    getBlockProgress: async () => ({ blocks: [] }),
    getStudyQueue: async () => ({ items: [] }),
    getOverviewCharacterMastery: async () => ({
      blocks: { hiragana: [], katakana: [] },
      category_blocks: { vocab_n5: [], grammar_patterns: [] },
      kanji_cards: [],
    }),
    notifyStartupReady: async () => ({ ok: true }),
    setStartupTheme: async () => ({ ok: true, theme: 'lofi_dusk' }),
    getCardNote: async () => ({ note: null }),
  } as unknown as typeof window.jplearnDesktop
}

beforeEach(() => {
  window.localStorage.clear()
    /* this suite clears storage in its own beforeEach, which runs after the setup file's --
       so the classic front door is re-stated here. These tests are about the flow behind
       the door, not the door. */
  window.jplearnDesktop = makeApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/** One index mark, found by its accessible name. */
/* THE CURRICULUM BELONGS TO THE MENU NOW. HomeView's course rail and its expanded list retired
   with phase 6's toggle, and `PathL2.test.tsx` covers what replaced them. What is NOT covered
   anywhere else, and is the reason this file survives, is the soft gate: a locked step asks once,
   then opens. That crosses the feature hook, the shared warning modal and App's routing, so it is
   tested against the real App rather than a component. */
function step(name: string): HTMLButtonElement {
  const rows = Array.from(document.querySelectorAll('.pj-row')) as HTMLButtonElement[]
  const match = rows.find((r) => (r.getAttribute('aria-label') ?? '').includes(name.toUpperCase()))
  if (!match) {
    throw new Error(`No path row for "${name}". Have: ${rows.map((r) => r.getAttribute('aria-label')).join(' | ')}`)
  }
  return match
}

async function openThePath(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  fireEvent.click(await screen.findByRole('button', { name: /THE PATH —/i }))
  await waitFor(() => expect(document.querySelector('.pj-list')).not.toBeNull())
}

/** the path is gone, which means the step opened something */
async function leftThePath(): Promise<void> {
  await waitFor(() => expect(document.querySelector('.pj-list')).toBeNull())
}

describe('opening a node', () => {
  // Scoped to the modal's own class rather than role="dialog": the titlebar
  // streak panel is also a dialog, so the role alone is ambiguous here.
  const confirmModal = () => document.querySelector('.readiness-warning-modal')
  const modalButton = (label: RegExp) => {
    const buttons = Array.from(confirmModal()?.querySelectorAll('button') ?? [])
    const match = buttons.find((b) => label.test(b.textContent ?? ''))
    if (!match) throw new Error(`No modal button matching ${label}`)
    return match
  }

  it('goes straight through when the step is already open', async () => {
    await openThePath()
    fireEvent.click(step('Hiragana'))

    await leftThePath()
    expect(confirmModal()).toBeNull()
  })

  it('asks for confirmation before opening a gated step', async () => {
    await openThePath()
    fireEvent.click(step('Basic Kanji (N5)'))

    await waitFor(() => expect(confirmModal()).not.toBeNull())
    expect(confirmModal()?.textContent).toContain('Basic Kanji (N5)')
    expect(modalButton(/continue anyway/i)).toBeTruthy()
  })

  it('stays on the path when the confirmation is declined', async () => {
    await openThePath()
    fireEvent.click(step('Basic Kanji (N5)'))
    await waitFor(() => expect(confirmModal()).not.toBeNull())

    fireEvent.click(modalButton(/go back/i))

    await waitFor(() => expect(confirmModal()).toBeNull())
    expect(document.querySelector('.pj-list')).not.toBeNull()
  })

  it('remembers the choice so a step is only ever asked about once', async () => {
    await openThePath()
    fireEvent.click(step('Basic Kanji (N5)'))
    await waitFor(() => expect(confirmModal()).not.toBeNull())
    fireEvent.click(modalButton(/continue anyway/i))

    await waitFor(() => {
      const stored = window.localStorage.getItem(PROGRESSION_OVERRIDES_STORAGE_KEY)
      expect(JSON.parse(stored ?? '[]')).toContain('kanji_n5')
    })
  })

  it('opens without asking again after a remembered confirmation', async () => {
    window.localStorage.setItem(PROGRESSION_OVERRIDES_STORAGE_KEY, JSON.stringify(['kanji_n5']))

    await openThePath()
    fireEvent.click(step('Basic Kanji (N5)'))

    await leftThePath()
    expect(confirmModal()).toBeNull()
  })

  it('sends a confirmed step to the same place an open one goes', async () => {
    /* FOUND LIVE, NOT BY A TEST. `progression.pending` is one piece of shared state raised by more
       than one call site, and its modal answered all of them by dropping straight into the flat
       view -- so an OPEN milestone reached its level three and a GATED one, once confirmed, did
       not. Same row, two destinations, decided by whether a dialog happened to appear. */
    await openThePath()
    fireEvent.click(step('Hiragana'))
    await leftThePath()
    expect(document.querySelector('.pj-cap')?.textContent).toContain('HIRAGANA')

    cleanup()
    window.localStorage.clear()

    await openThePath()
    fireEvent.click(step('Basic Kanji (N5)'))
    await waitFor(() => expect(confirmModal()).not.toBeNull())
    fireEvent.click(modalButton(/continue anyway/i))
    await leftThePath()
    expect(document.querySelector('.pj-cap')?.textContent).toContain('BASIC KANJI (N5)')
  })
})

describe('when progression data is unavailable', () => {
  it('renders Home without a map rather than failing', async () => {
    window.jplearnDesktop = makeApi(vi.fn(async () => { throw new Error('bridge down') }))

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    /* the menu still stands; the path simply has nothing to walk */
    await waitFor(() => expect(document.querySelector('.mn-frame')).not.toBeNull())
    expect(document.querySelector('.pj-list')).toBeNull()
  })
})
