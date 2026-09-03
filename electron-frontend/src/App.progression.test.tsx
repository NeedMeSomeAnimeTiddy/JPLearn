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

/* ==================================================================================================
   WHAT THE PATH OFFERS, END TO END — and what stopped being offered when it became the chain.

   THIS FILE USED TO BE THE SOFT GATE'S ONLY COVERAGE, because the path was the soft gate's only
   surface: sixteen tablets on a road, any of which could be walked to and pressed, with a locked
   one raising a confirmation that was remembered per node. The design system retired that road --
   "This replaced a browsable road of sixteen doors. Ten of those sixteen could only throw you at
   another section; a curriculum node is a milestone, not a door" -- so a shut step is no longer
   pressable from anywhere, and `progression.pending` has nothing left to raise it.

   THE MACHINERY IS STILL THERE and is still tested where it lives (`features/progression`). What is
   gone is a way for a learner to reach it, and that is a product decision rather than a bug: if the
   soft gate is to survive it needs a new surface, and if it is not, `requestOpen`'s pending branch
   and one of App's two readiness modals go with it. Stated here rather than left as a passing test
   that no longer tests the thing it is named after.

   WHAT IS STILL TRUE, AND IS WHAT THIS FILE CHECKS: the frontier opens, it lands on its own level
   three, and nothing shut is reachable from the screen.
   ================================================================================================== */

async function openThePath(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  /* HOVER SELECTS, A CLICK ON THE SELECTED ONE GOES -- the mockup's two-step, so a mouse never
     enters a section it only crossed. Two presses is what a keyboard-less caller has. */
  const path = await screen.findByRole('button', { name: /THE PATH —/i })
  fireEvent.click(path)
  fireEvent.click(path)
  await waitFor(() => expect(document.querySelector('.pa-here')).not.toBeNull())
}

const confirmModal = () => document.querySelector('.readiness-warning-modal')

describe('the path offers the frontier and nothing else', () => {
  it('stands on the step the curriculum put the learner on', async () => {
    await openThePath()
    expect(document.querySelector('.pa-kick')?.textContent).toBe('YOU ARE HERE · STEP 02 OF 4')
    expect(document.querySelector('.pa-name')?.textContent).toBe('ひらがな')
  })

  it('draws what is shut without offering it', async () => {
    await openThePath()
    const rows = [...document.querySelectorAll('.pa-row')]
    expect(rows[2].querySelector('.s')?.textContent).toBe('SHUT')
    expect(rows[2].getAttribute('aria-disabled')).toBe('true')
  })

  it('opens the frontier onto its own level three, with no confirmation in the way', async () => {
    await openThePath()
    fireEvent.click(document.querySelector('.pa-go') as HTMLElement)

    /* THE SCREEN'S OWN LABEL, not a caption: a deck the fixture gives no blocks draws no cards to
       carry one, and this test is about WHERE a step sends you. */
    await waitFor(() => expect(document.querySelector('.mn-open')?.getAttribute('aria-label'))
      .toContain('HIRAGANA'))
    expect(confirmModal()).toBeNull()
  })

  it('has no way to press a step that is still shut', async () => {
    await openThePath()
    const root = document.querySelector('.mn-open') as HTMLElement
    /* the arrows walk the run, but they stop at the frontier -- so however many times they are
       pressed, Enter can only reach what is genuinely choosable */
    for (let i = 0; i < 6; i += 1) fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'Enter' })

    await waitFor(() => expect(document.querySelector('.pa-here')).toBeNull())
    expect(document.querySelector('.mn-open')?.getAttribute('aria-label')).toContain('HIRAGANA')
    expect(confirmModal()).toBeNull()
  })

  it('walks back over a finished step, which the run keeps visible', async () => {
    await openThePath()
    fireEvent.keyDown(document.querySelector('.mn-open') as HTMLElement, { key: 'ArrowUp' })
    await waitFor(() => expect(document.querySelector('.pa-kick')?.textContent)
      .toBe('ALREADY DONE · STEP 01 OF 4'))
  })
})

describe('when progression data is unavailable', () => {
  it('renders Home without a course rather than failing', async () => {
    window.jplearnDesktop = makeApi(vi.fn(async () => { throw new Error('bridge down') }))

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    /* the menu still stands; the path simply has nothing to walk */
    await waitFor(() => expect(document.querySelector('.mn-frame')).not.toBeNull())
    expect(document.querySelector('.pa-here')).toBeNull()
  })
})
