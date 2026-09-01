/**
 * Characterization tests for App's view routing, written BEFORE the issue #69
 * phase 4c extraction — same discipline as App.session-state.test.tsx.
 *
 * Routing is three separate mappings, and these pin all three:
 *   1. view -> component      (which screen renders)
 *   2. view -> parent         (where Escape goes; note `home` has no parent)
 *   3. history stack          (titlebar back/forward, order-of-visit, multi-hop)
 *
 * `App.daily-games.test.tsx` already covers daily_games Escape/back/history, so
 * that view is deliberately not re-pinned here.
 *
 * These assert current behaviour, not desired behaviour. A failure means the
 * extraction changed navigation semantics.
 *
 * Not covered, and deliberately so: `navDirection`. It only feeds enter/exit
 * animations and has no accessible output, so a wrong direction cannot be
 * asserted here — it has to be checked by eye at each call site.
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

function makeApi() {
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
    recordGameResult: async () => ({
      ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5,
    }),
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

// ── View identification ──────────────────────────────────────────────────────
// Each view is identified by a landmark unique to it, so `currentView()` can
// assert the *whole* mapping rather than one branch at a time.

type ViewName = 'home' | 'script_hub' | 'minigame' | 'jlpt_prep' | 'passage_hub' | 'daily_games'

function currentView(): ViewName | 'unknown' {
  if (document.querySelector('.game-hud-stat')) return 'minigame'
  if (screen.queryByRole('button', { name: 'Back to main menu' })) return 'script_hub'
  if (screen.queryByRole('heading', { name: 'Passages' })) return 'passage_hub'
  if (screen.queryByRole('heading', { name: 'Crossword' })) return 'daily_games'
  if (screen.queryByRole('heading', { name: 'JLPT Preparation' })) return 'jlpt_prep'
  if (screen.queryByRole('button', { name: 'Daily Games' })) return 'home'
  return 'unknown'
}

function expectView(name: ViewName): Promise<void> {
  return waitFor(() => { expect(currentView()).toBe(name) })
}

/** The cassette carousel needs two clicks: focus, then launch. */
function clickTopMenuCard(label: string): void {
  const menuCards = Array.from(document.querySelectorAll('.cassette')) as HTMLButtonElement[]
  const button = menuCards.find(
    (card) => card.querySelector('.cassette-title')?.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )
  if (!button) throw new Error(`Top menu card not found for ${label}`)
  fireEvent.click(button)
  fireEvent.click(button)
}

/**
 * The titlebar back/forward buttons derive their disabled state from refs read
 * during render, so they can lag one render behind the navigation that enabled
 * them. Tests wait for the enabled state instead of assuming it.
 */
async function waitForEnabled(name: RegExp): Promise<void> {
  await waitFor(() => {
    const button = screen.getByRole('button', { name }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
}

async function openFromShortcutMenu(itemName: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /open shortcuts/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: itemName }))
}

describe('view -> parent (Escape back-navigation)', () => {
  it('returns script_hub to home', async () => {
    render(<App />)
    await expectView('home')

    clickTopMenuCard('Hiragana')
    await expectView('script_hub')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
  })

  it('returns jlpt_prep to home', async () => {
    render(<App />)
    await expectView('home')

    await openFromShortcutMenu('JLPT Prep')
    await expectView('jlpt_prep')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
  })

  it('returns passage_hub to home', async () => {
    render(<App />)
    await expectView('home')

    await openFromShortcutMenu('Passages')
    await expectView('passage_hub')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
  })

  it('returns minigame to script_hub, not home — minigame is the one view whose parent is not home', async () => {
    render(<App />)
    await expectView('home')

    clickTopMenuCard('Hiragana')
    await expectView('script_hub')

    // Same two-click cassette pattern as the top menu.
    const tiles = await screen.findAllByRole('button', { name: /Meaning Match/i })
    const cassette = (tiles[0].closest('.cassette') ?? tiles[0]) as HTMLElement
    fireEvent.click(cassette)
    fireEvent.click(cassette)
    await expectView('minigame')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('script_hub')
  })

  it('leaves home alone — home has no parent', async () => {
    render(<App />)
    await expectView('home')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
  })
})

describe('history stack (titlebar back/forward)', () => {
  it('walks back and forward across a multi-hop trail, in order of visit', async () => {
    render(<App />)
    await expectView('home')

    // home -> script_hub -> home -> passage_hub
    clickTopMenuCard('Hiragana')
    await expectView('script_hub')
    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
    await openFromShortcutMenu('Passages')
    await expectView('passage_hub')

    const back = () => fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    const forward = () => fireEvent.click(screen.getByRole('button', { name: /^Forward$/ }))

    back()
    await expectView('home')
    back()
    await expectView('script_hub')
    back()
    await expectView('home')

    // Already at the oldest entry: another back is a no-op, not a crash.
    back()
    await expectView('home')

    forward()
    await expectView('script_hub')
    forward()
    await expectView('home')
    forward()
    await expectView('passage_hub')

    // Already at the newest entry: another forward is a no-op.
    forward()
    await expectView('passage_hub')
  })

  it('truncates the forward trail when navigating somewhere new after going back', async () => {
    render(<App />)
    await expectView('home')

    // Two hops before the first Back: `canTitlebarBack` is derived from a ref
    // read during render, so it only reflects a navigation once a later render
    // happens. See the note on waitForEnabled.
    clickTopMenuCard('Hiragana')
    await expectView('script_hub')
    await openFromShortcutMenu('Passages')
    await expectView('passage_hub')

    await waitForEnabled(/^Back$/)
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await expectView('script_hub')

    // Branching from here must discard the passage_hub forward entry, so the
    // trail becomes [home, script_hub, jlpt_prep].
    await openFromShortcutMenu('JLPT Prep')
    await expectView('jlpt_prep')

    // Forward alone can't distinguish a truncated trail from a retained one —
    // either way the new entry is at the end. Back is what proves it: the
    // discarded passage_hub must not reappear between jlpt_prep and script_hub.
    fireEvent.click(screen.getByRole('button', { name: /^Forward$/ }))
    await expectView('jlpt_prep')

    await waitForEnabled(/^Back$/)
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await expectView('script_hub')
  })
})

describe('home number-key shortcuts', () => {
  it.each([
    ['1', 'Hiragana'],
    ['2', 'Katakana'],
    ['3', 'Kanji'],
  ])('key %s opens the script hub', async (key) => {
    render(<App />)
    await expectView('home')

    fireEvent.keyDown(window, { key })
    await expectView('script_hub')
  })

  it('only fires on home — the same key in another view does not re-navigate', async () => {
    render(<App />)
    await expectView('home')

    await openFromShortcutMenu('Passages')
    await expectView('passage_hub')

    fireEvent.keyDown(window, { key: '1' })
    await expectView('passage_hub')
  })
})
