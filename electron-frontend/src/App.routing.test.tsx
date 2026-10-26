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
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { openDeck, openGame } from './test-entry'
import { SCREEN_NAMES } from './features/menu'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { VIEW_PARENT } from './features/navigation'

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
    /* the DAILY road reads the day before it can offer a puzzle, and `daily_games` cannot be
       entered without pressing one */
    getDailyGamesState: async () => ({
      pool: {
        day: '2026-07-15', algorithm_version: 1, game_seeds: {},
        words: [{ deck_slug: 'vocab_n5', deck_name: 'N5 Vocabulary', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' }],
      },
      streak: { last_completed_day: null, current_streak_days: 1, best_streak_days: 1, freezes_available: 0, freeze_month: null },
      attempts: [], progress: { attempt_count: 0, completed_daily_game_types: [], missed_words: [] },
    }),
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
  window.jplearnDesktop = makeApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// ── View identification ──────────────────────────────────────────────────────
// Each view is identified by a landmark unique to it, so `currentView()` can
// assert the *whole* mapping rather than one branch at a time.

type ViewName = 'home' | 'minigame' | 'jlpt_prep' | 'passage_hub' | 'daily_games'

function currentView(): ViewName | 'unknown' {
  /* DAILY GAMES FIRST, and the container rather than the sheet: a puzzle stands on the round's own
     sheet, so `.rd-sheet` would call it a minigame. `.dp-puzzle` is the view's root in every state
     -- loading the day, dealing the board, the board, the result. */
  if (document.querySelector('.dp-puzzle')) return 'daily_games'
  /* THE ROUND BEFORE THE FRAME, and the order is the whole answer now. The round moved onto the
     menu's own stage, so it has a `.mn-frame` too -- asking the frame first would call every round
     'home'. `.rd-sheet` is the sheet it stands on and is there in all of its states. */
  if (document.querySelector('.rd-sheet')) return 'minigame'
  /* HOME IS THE VALLEY MENU NOW. `HomeView` and its Daily Games button retired with phase 6's
     toggle; `.mn-frame` is the menu's own stage and is present at every level of it -- including
     the deck screen, which is where the script hub's six digit shortcuts land since the hub went. */
  if (document.querySelector('.mn-frame')) return 'home'
  return 'unknown'
}

/* WHICH OF THE MENU'S OWN SCREENS IS UP, for the tests that care that home has depth.
   Read off the heading slab rather than off the screen's body: a deck screen whose bridge answered
   with no blocks draws an absence where its cards would be, and this file's desktop mock answers
   with nothing for everything -- so a body-shaped question says 'unknown' for a screen that is
   plainly there. `SCREEN_NAMES` is the same map the slab is built from. */
function menuScreen(): string {
  const head = document.querySelector('.pj-title b')?.textContent?.trim() ?? ''
  const found = Object.entries(SCREEN_NAMES).find(([, name]) => name.en === head)
  return found ? found[0] : (head || 'unknown')
}

/* `jlpt_prep` and `passage_hub` USED TO BE DETECTED HERE, by a "JLPT Preparation" heading and a
   "Passages" one. Neither exists any more: both views lost the browsing screen that carried it --
   the menu's ASCENT and LIBRARY draw those now -- and what is left runs an exam or renders a text,
   neither of which can be reached without a payload this file has no cheap way to supply. Their
   place in the parent chain is asserted directly against `VIEW_PARENT` instead. */

function expectView(name: ViewName): Promise<void> {
  return waitFor(() => { expect(currentView()).toBe(name) })
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

/* `daily_games` IS ONE PUZZLE NOW. "Daily Games" from the titlebar opens the DAILY road -- a menu
   screen, so `view` stays 'home' -- and the view is one tablet further in. */
async function openDailyPuzzle(): Promise<void> {
  await openFromShortcutMenu('Daily Games')
  fireEvent.click(await screen.findByRole('button', { name: /^01 CROSSWORD/ }))
}

describe('view -> parent (Escape back-navigation)', () => {
  it('walks up the menu rather than out of a view, because the deck screen IS home', async () => {
    /* THE SCRIPT HUB WAS A VIEW AND ITS REPLACEMENT IS NOT. A deck's screen is level three of the
       menu, so `view` never leaves 'home' and Escape is answered by the menu's own path rather
       than by `VIEW_PARENT`. That is the whole point of the two navigation models coexisting --
       see `useMenuPath`. */
    render(<App />)
    await expectView('home')

    openDeck('Hiragana')
    await waitFor(() => expect(menuScreen()).toBe('deck'))
    expect(currentView()).toBe('home')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(menuScreen()).not.toBe('deck'))
    expect(currentView()).toBe('home')
  })

  it('returns daily_games to home — which is the DAILY road it was opened from', async () => {
    render(<App />)
    await expectView('home')

    await openDailyPuzzle()
    await expectView('daily_games')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
    expect(await screen.findByRole('button', { name: /^01 CROSSWORD/ })).toBeTruthy()
  })

  it('keeps the bare titlebar and the valley shell on every view the app has', async () => {
    /* ALL FIVE VIEWS WEAR THE SAME SHELL, because it is one unconditional line in App.tsx. Home, the
       round and the puzzle are walked here; `jlpt_prep` and `passage_hub` run an exam or a text and
       cannot be entered without a payload this file has no cheap way to supply (see above), so they
       are covered by being the same <main> and the same <AppTitlebar bare> as these three. */
    const expectBareShell = () => {
      expect(document.querySelector('main.app-shell.mn-showing')).toBeTruthy()
      expect(document.querySelector('.window-titlebar.is-bare')).toBeTruthy()
      expect(document.querySelector('.window-titlebar:not(.is-bare)')).toBeNull()
    }
    render(<App />)
    await expectView('home')
    expectBareShell()

    await openGame('Hiragana', 'Meaning Match')
    await expectView('minigame')
    expectBareShell()
    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')

    await openDailyPuzzle()
    await expectView('daily_games')
    expectBareShell()
  })

  it('still parents the two views the shortcut menu no longer opens directly', () => {
    /* `jlpt_prep` and `passage_hub` used to be two clicks from the titlebar, which is what these
       tests walked. They are not any more: the menu's ASCENT and LIBRARY are the browsing screens
       and those two views now RUN something -- an exam, a text -- so they cannot be entered without
       naming which. Their place in the parent chain is unchanged and still matters, because Escape
       out of a running exam has to land somewhere; asserted against the map rather than by walking
       a route that would now be four keystrokes of menu. */
    expect(VIEW_PARENT.jlpt_prep).toBe('home')
    expect(VIEW_PARENT.passage_hub).toBe('home')
  })


  it('returns minigame to home, now that nothing stands between the menu and a round', async () => {
    /* ITS PARENT WAS `script_hub` and it was the one entry in the map that was not `home`. With
       the hub gone every leaf goes home, and the menu is standing on the screen you left from. */
    render(<App />)
    await expectView('home')

    await openGame('Hiragana', 'Meaning Match')
    await expectView('minigame')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
  })

  it('leaves home alone — home has no parent', async () => {
    render(<App />)
    await expectView('home')

    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
  })
})

/* THESE TWO TESTS COVER THE INTERNAL HISTORY LOGIC ONLY. The titlebar is bare on every screen, and
   `.window-titlebar.is-bare .window-titlebar-drag > *` hides its Back and Forward buttons (menu.css),
   so a user cannot click them -- jsdom loads no CSS, which is the only reason this file still can.
   What is pinned is the stack the buttons read (order of visit, truncation), not a control the user
   has; keyboard and in-screen Back are how a user leaves a view. */
describe('history stack (titlebar back/forward)', () => {
  it('walks back and forward across a multi-hop trail, in order of visit', async () => {
    render(<App />)
    await expectView('home')

    /* home -> minigame -> home -> daily_games. THE MIDDLE HOP USED TO BE THE SCRIPT HUB, which
       was the cheapest second view to reach; the minigame is now, and it is reached the way every
       drill is reached, through the titlebar's map tree. */
    await openGame('Hiragana', 'Meaning Match')
    await expectView('minigame')
    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')
    await openDailyPuzzle()
    await expectView('daily_games')

    const back = () => fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    const forward = () => fireEvent.click(screen.getByRole('button', { name: /^Forward$/ }))

    back()
    await expectView('home')
    back()
    await expectView('minigame')
    back()
    await expectView('home')

    // Already at the oldest entry: another back is a no-op, not a crash.
    back()
    await expectView('home')

    forward()
    await expectView('minigame')
    forward()
    await expectView('home')
    forward()
    await expectView('daily_games')

    // Already at the newest entry: another forward is a no-op.
    forward()
    await expectView('daily_games')
  })

  it('truncates the forward trail when navigating somewhere new after going back', async () => {
    render(<App />)
    await expectView('home')

    // Two hops before the first Back: `canTitlebarBack` is derived from a ref
    // read during render, so it only reflects a navigation once a later render
    // happens. See the note on waitForEnabled.
    await openGame('Hiragana', 'Meaning Match')
    await expectView('minigame')
    await openDailyPuzzle()
    await expectView('daily_games')

    /* TWO BACKS, BECAUSE THE ROAD IS A STOP ON THE WAY. `daily_games` cannot be entered without
       naming a puzzle, and the screen that names one is a menu screen — so walking there from the
       round really does pass through home, and the trail is [home, minigame, home, daily_games]
       rather than three entries. The extra hop is the road, which is a place you stood. */
    await waitForEnabled(/^Back$/)
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await expectView('home')
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await expectView('minigame')

    /* Branching from here must discard the forward trail, so it becomes [home, minigame, home]. THE BRANCH USED TO BE 'JLPT Prep' FROM THE SHORTCUT MENU, and that
       item now opens the menu's own exam ladder rather than a view of its own; the branch after
       that was the script hub, which is gone too. Escaping out of the round is the destination
       that is left, and it is a real one -- it is what every round ends with. */
    fireEvent.keyDown(window, { key: 'Escape' })
    await expectView('home')

    // Forward alone can't distinguish a truncated trail from a retained one —
    // either way the new entry is at the end. Back is what proves it: the
    // discarded daily_games must not reappear between home and minigame.
    fireEvent.click(screen.getByRole('button', { name: /^Forward$/ }))
    await expectView('home')

    await waitForEnabled(/^Back$/)
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await expectView('minigame')
  })
})

/* THE BARE TITLEBAR HIDES ITS TIMER CHIP, REFRESH DATA AND DEVELOPER TOOLS, so the palette is the way
   to them. Each entry is found by typing its label into the palette and must reach the handler the
   titlebar's own menu calls. */
describe('titlebar-only tools in the command palette', () => {
  async function runPaletteCommand(label: string): Promise<void> {
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: label } })
    fireEvent.click(await screen.findByRole('option', { name: label }))
  }

  it('refreshes the study data', async () => {
    const getStudySummary = vi.fn(window.jplearnDesktop!.getStudySummary)
    window.jplearnDesktop = { ...window.jplearnDesktop!, getStudySummary } as typeof window.jplearnDesktop
    render(<App />)
    await expectView('home')
    await waitFor(() => expect(getStudySummary).toHaveBeenCalled())
    const before = getStudySummary.mock.calls.length

    await runPaletteCommand('Refresh Data')
    await waitFor(() => expect(getStudySummary.mock.calls.length).toBeGreaterThan(before))
  })

  it('restarts the bridge, clears its caches and opens the inspector', async () => {
    const restartBridge = vi.fn(async () => ({ ok: true }))
    const clearBridgeCaches = vi.fn(async () => ({ ok: true }))
    const openInspectElement = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = {
      ...window.jplearnDesktop!, restartBridge, clearBridgeCaches, openInspectElement,
    } as unknown as typeof window.jplearnDesktop
    render(<App />)
    await expectView('home')

    await runPaletteCommand('Restart Bridge')
    await waitFor(() => expect(restartBridge).toHaveBeenCalledTimes(1))
    await runPaletteCommand('Clear Caches')
    await waitFor(() => expect(clearBridgeCaches).toHaveBeenCalledTimes(1))
    await runPaletteCommand('Inspect Element')
    await waitFor(() => expect(openInspectElement).toHaveBeenCalledTimes(1))
  })

  it('opens the developer dashboard, and runs each check inside it', async () => {
    const runCheck = vi.fn(async () => ({ ok: true, output: '' }))
    window.jplearnDesktop = { ...window.jplearnDesktop!, runCheck } as unknown as typeof window.jplearnDesktop
    render(<App />)
    await expectView('home')

    await runPaletteCommand('Developer Dashboard')
    const dashboard = await screen.findByRole('dialog', { name: 'Developer Dashboard' })
    fireEvent.click(within(dashboard).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Developer Dashboard' })).toBeNull())

    for (const [label, key] of [['Architecture Check', 'arch'], ['DB Schema Check', 'db'], ['SRS Integrity Check', 'srs']]) {
      await runPaletteCommand(label)
      const open = await screen.findByRole('dialog', { name: 'Developer Dashboard' })
      await waitFor(() => expect(runCheck).toHaveBeenLastCalledWith(key))
      fireEvent.click(within(open).getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Developer Dashboard' })).toBeNull())
    }
  })

  it('starts and pauses the focus timer, and offers it only while the timer is enabled', async () => {
    render(<App />)
    await expectView('home')
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    fireEvent.change(await screen.findByRole('textbox', { name: /search commands/i }), { target: { value: 'Focus Timer' } })
    expect(screen.queryByRole('option', { name: 'Start or Pause Focus Timer' })).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    cleanup()

    window.localStorage.setItem('jplearn-desktop-settings-v1', JSON.stringify({ pomodoroEnabled: true }))
    render(<App />)
    await expectView('home')
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeTruthy()

    await runPaletteCommand('Start or Pause Focus Timer')
    await screen.findByRole('button', { name: /^Pause timer/ })
    await runPaletteCommand('Start or Pause Focus Timer')
    await screen.findByRole('button', { name: /^Resume timer/ })
  })
})

/* A CRASHED PUZZLE, EXAM OR PASSAGE HAS NO CHROME TO LEAVE BY, so its boundary's fallback carries Back.
   App.tsx hands each of the three routes the same `onBack` the screen itself uses. */
describe('ErrorBoundary Back', () => {
  function Boom(): never {
    throw new Error('the screen broke')
  }

  it('offers no Back unless the screen gave it somewhere to go', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('the screen broke')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('shows a Back action on a crashed screen and calls it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onBack = vi.fn()
    render(<ErrorBoundary onBack={onBack}><Boom /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

describe('home number-key shortcuts', () => {
  it.each([
    ['1', 'Hiragana'],
    ['2', 'Katakana'],
    ['3', 'Kanji'],
  ])('key %s opens that deck\'s own screen', async (key) => {
    /* THEY USED TO OPEN THE SCRIPT HUB. They open the deck's block chain instead -- one screen
       further in, and inside the menu rather than out of it, so `view` never changes. */
    render(<App />)
    await expectView('home')

    fireEvent.keyDown(window, { key })
    await waitFor(() => expect(menuScreen()).toBe('deck'))
    expect(currentView()).toBe('home')
  })

  it('only fires on home — the same key in another view does not re-navigate', async () => {
    render(<App />)
    await expectView('home')

    await openDailyPuzzle()
    await expectView('daily_games')

    fireEvent.keyDown(window, { key: '1' })
    await expectView('daily_games')
  })
})
