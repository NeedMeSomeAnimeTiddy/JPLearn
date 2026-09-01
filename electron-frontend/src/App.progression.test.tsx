/**
 * The curriculum map on Home, and its soft gate (issue #78 Phase 4).
 *
 * `JPLEARN_GRAPH` was defined, persisted and exposed over the bridge without
 * anything rendering it. These drive the real App because the behaviour that
 * matters — a gated node asks once, then opens — crosses the feature hook, the
 * shared warning modal and App's navigation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { PROGRESSION_OVERRIDES_STORAGE_KEY, UNTRACKED_NODE_LABEL } from './features/progression'

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
  window.localStorage.setItem('jplearn.menu.frontDoor', 'off')
  window.jplearnDesktop = makeApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/** One index mark, found by its accessible name. */
function mark(name: string): HTMLButtonElement {
  const marks = Array.from(document.querySelectorAll('.course-mark')) as HTMLButtonElement[]
  const match = marks.find((m) => (m.getAttribute('aria-label') ?? '').startsWith(name))
  if (!match) throw new Error(`No index mark for "${name}". Have: ${marks.map((m) => m.getAttribute('aria-label')).join(' | ')}`)
  return match
}

function showAll(): void {
  const toggle = document.querySelector('.course-toggle') as HTMLButtonElement | null
  if (!toggle) throw new Error('No show-all toggle')
  fireEvent.click(toggle)
}

async function openHome(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  await waitFor(() => expect(document.querySelectorAll('.course-mark').length).toBeGreaterThan(0))
}

describe('the course rail', () => {
  it('draws one index mark per stage, in order', async () => {
    await openHome()
    const marks = Array.from(document.querySelectorAll('.course-mark'))
    expect(marks).toHaveLength(NODES.length)
    expect(marks.map((m) => (m.getAttribute('aria-label') ?? '').split(' —')[0]))
      .toEqual(NODES.map((n) => n.name))
  })

  it('reads out the stage the learner is on, with its progress', async () => {
    await openHome()
    const now = document.querySelector('.course-now')
    expect(now?.textContent).toContain('Hiragana')
    expect(now?.textContent).toContain('91/104')
  })

  it('marks the current stage on the rail', async () => {
    await openHome()
    expect(mark('Hiragana').getAttribute('aria-current')).toBe('step')
  })

  it('names each stage and its state for screen readers', async () => {
    // Colour and mark height carry the state visually; the label carries it
    // for everyone else.
    await openHome()
    expect(mark('Basic Kanji (N5)').getAttribute('aria-label')).toContain('not unlocked yet')
    expect(mark('Tutorial').getAttribute('aria-label')).toContain('finished')
  })

  it('keeps a gated stage clickable rather than disabled', async () => {
    // Gating is soft by decision — onboarding is skippable, so a hard gate
    // would lock out anyone who skipped it. Disabling would also drop the
    // mark out of the tab order.
    await openHome()
    expect(mark('Basic Kanji (N5)').disabled).toBe(false)
  })

  it('is collapsed on arrival, because Home is not a course catalogue', async () => {
    await openHome()
    expect(document.querySelector('.course-list')).toBeNull()
    expect(document.querySelector('.course-toggle')?.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('the expanded list', () => {
  it('names every stage once opened', async () => {
    await openHome()
    showAll()

    const rows = Array.from(document.querySelectorAll('.course-row-name'))
    expect(rows.map((r) => r.textContent)).toEqual(NODES.map((n) => n.name))
  })

  it('shows a count only where there is one', async () => {
    await openHome()
    showAll()

    const rows = Array.from(document.querySelectorAll('.course-row'))
    const reading = rows.find((r) => r.textContent?.includes('Reading'))
    expect(reading?.textContent).not.toContain('0/')
    const hiragana = rows.find((r) => r.textContent?.includes('Hiragana'))
    expect(hiragana?.textContent).toContain('91/104')
  })

  it('floats over the page instead of pushing it down', async () => {
    // The whole reason it is a dropdown: expanding in place reflowed Home.
    await openHome()
    showAll()

    const menu = document.querySelector('.course-menu')
    expect(menu).not.toBeNull()
    // The rows live inside the overlay, not as siblings in the page flow.
    expect(menu?.querySelectorAll('.course-row').length).toBe(NODES.length)
  })

  it('closes when the page behind it is clicked', async () => {
    await openHome()
    showAll()
    expect(document.querySelector('.course-menu')).not.toBeNull()

    fireEvent.mouseDown(document.body)

    await waitFor(() => expect(document.querySelector('.course-menu')).toBeNull())
  })

  it('closes on Escape', async () => {
    await openHome()
    showAll()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(document.querySelector('.course-menu')).toBeNull())
  })

  it('stays open when clicked inside', async () => {
    await openHome()
    showAll()

    const menu = document.querySelector('.course-menu') as HTMLElement
    fireEvent.mouseDown(menu)

    expect(document.querySelector('.course-menu')).not.toBeNull()
  })

  it('closes itself when a stage is chosen from it', async () => {
    await openHome()
    showAll()

    const rows = Array.from(document.querySelectorAll('.course-row')) as HTMLButtonElement[]
    const kanji = rows.find((r) => r.textContent?.includes('Basic Kanji (N5)'))!
    fireEvent.click(kanji)

    // Gated, so the confirmation takes over — the dropdown must not linger behind it.
    await waitFor(() => expect(document.querySelector('.course-menu')).toBeNull())
    expect(document.querySelector('.readiness-warning-modal')).not.toBeNull()
  })

  it('explains untracked stages once, not on every row', async () => {
    await openHome()
    showAll()

    const notes = Array.from(document.querySelectorAll('.course-note'))
    expect(notes).toHaveLength(1)
    expect(notes[0].textContent).toContain(UNTRACKED_NODE_LABEL)
  })
})

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

  it('goes straight through when the node is already open', async () => {
    await openHome()
    fireEvent.click(mark('Hiragana'))

    // Leaving Home takes the map with it.
    await waitFor(() => expect(document.querySelectorAll('.course-mark')).toHaveLength(0))
    expect(confirmModal()).toBeNull()
  })

  it('asks for confirmation before opening a gated node', async () => {
    await openHome()
    fireEvent.click(mark('Basic Kanji (N5)'))

    await waitFor(() => expect(confirmModal()).not.toBeNull())
    expect(confirmModal()?.textContent).toContain('Basic Kanji (N5)')
    expect(modalButton(/continue anyway/i)).toBeTruthy()
  })

  it('stays on Home when the confirmation is declined', async () => {
    await openHome()
    fireEvent.click(mark('Basic Kanji (N5)'))
    await waitFor(() => expect(confirmModal()).not.toBeNull())

    fireEvent.click(modalButton(/go back/i))

    await waitFor(() => expect(confirmModal()).toBeNull())
    expect(document.querySelectorAll('.course-mark').length).toBeGreaterThan(0)
  })

  it('remembers the choice so a node is only ever asked about once', async () => {
    await openHome()
    fireEvent.click(mark('Basic Kanji (N5)'))
    await waitFor(() => expect(confirmModal()).not.toBeNull())
    fireEvent.click(modalButton(/continue anyway/i))

    await waitFor(() => {
      const stored = window.localStorage.getItem(PROGRESSION_OVERRIDES_STORAGE_KEY)
      expect(JSON.parse(stored ?? '[]')).toContain('kanji_n5')
    })
  })

  it('opens without asking again after a remembered confirmation', async () => {
    window.localStorage.setItem(PROGRESSION_OVERRIDES_STORAGE_KEY, JSON.stringify(['kanji_n5']))

    await openHome()
    fireEvent.click(mark('Basic Kanji (N5)'))

    await waitFor(() => expect(document.querySelectorAll('.course-mark')).toHaveLength(0))
    expect(confirmModal()).toBeNull()
  })
})

describe('when progression data is unavailable', () => {
  it('renders Home without a map rather than failing', async () => {
    window.jplearnDesktop = makeApi(vi.fn(async () => { throw new Error('bridge down') }))

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    await waitFor(() => expect(document.querySelectorAll('.course-mark')).toHaveLength(0))
  })
})
