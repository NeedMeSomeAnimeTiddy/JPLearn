/* THE INSTALLED APP OFFERS NO DEVELOPER COMMANDS (audit 8 F4): their routes refuse there, so the
   palette leaves out Developer Dashboard, Inspect Element, the three checks, Restart Bridge and
   Clear Caches. Running from source, they stay. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { DEFAULT_RECORD_RESULT, fakeAnswerQueue } from '../test-fixtures/answerQueue'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => (
    <span>{typeof sequence[0] === 'string' ? sequence[0] : ''}</span>
  ),
}))

vi.mock('../features/onboarding/useTypewriter', () => ({
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

const DEVELOPER_LABELS = [
  'Developer Dashboard',
  'Inspect Element',
  'Architecture Check',
  'DB Schema Check',
  'SRS Integrity Check',
  'Restart Bridge',
  'Clear Caches',
]

const emptyActivity = {
  days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0,
}

function makeApi(isPackagedApp: () => Promise<boolean>) {
  return {
    versions: { chrome: '0', electron: '0', node: '0' },
    isPackagedApp,
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
    ...fakeAnswerQueue(() => ({ ...DEFAULT_RECORD_RESULT, card_id: 1, repetitions: 0 })),
    notifyStartupReady: async () => ({ ok: true }),
    setStartupTheme: async () => ({ ok: true, theme: 'lofi_dusk' }),
    getCardNote: async () => ({ note: null }),
  } as unknown as typeof window.jplearnDesktop
}

/* The palette filters as it is typed into, so each label is looked for by searching for it, as the
   learner would. */
async function offered(label: string): Promise<boolean> {
  if (!screen.queryByRole('textbox', { name: /search commands/i })) {
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
  }
  const search = await screen.findByRole('textbox', { name: /search commands/i })
  fireEvent.change(search, { target: { value: label } })
  return screen.queryAllByRole('option').some((option) => (option.textContent ?? '').includes(label))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('developer commands in the command palette', () => {
  it('leaves them out of the installed app', async () => {
    const isPackagedApp = vi.fn(async () => true)
    window.jplearnDesktop = makeApi(isPackagedApp)
    render(<App />)
    await waitFor(() => expect(isPackagedApp).toHaveBeenCalled())

    expect(await offered('Refresh Data')).toBe(true)
    for (const label of DEVELOPER_LABELS) {
      expect(await offered(label), `${label} should be hidden`).toBe(false)
    }
  })

  it('leaves them out when the main process cannot say', async () => {
    window.jplearnDesktop = makeApi(vi.fn(async () => { throw new Error('refused') }))
    render(<App />)

    expect(await offered('Refresh Data')).toBe(true)
    expect(await offered('Developer Dashboard')).toBe(false)
  })

  it('offers them all when running from source', async () => {
    const isPackagedApp = vi.fn(async () => false)
    window.jplearnDesktop = makeApi(isPackagedApp)
    render(<App />)
    await waitFor(() => expect(isPackagedApp).toHaveBeenCalled())

    await waitFor(async () => expect(await offered('Developer Dashboard')).toBe(true))
    for (const label of DEVELOPER_LABELS) {
      expect(await offered(label), `${label} should be offered`).toBe(true)
    }
  })
})

describe('developer tools in the titlebar shortcut menu (audit 8 review)', () => {
  const developerSubmenuShown = () =>
    screen.queryAllByRole('menuitem').some((item) => (item.textContent ?? '').includes('Developer Tools'))
    || screen.queryAllByRole('button').some((item) => (item.textContent ?? '').trim() === 'Developer Tools')

  it('leaves the Developer Tools submenu out of the installed app', async () => {
    let answered = false
    const isPackagedApp = vi.fn(async () => {
      answered = true
      return true
    })
    window.jplearnDesktop = makeApi(isPackagedApp)
    render(<App />)
    await waitFor(() => expect(answered).toBe(true))
    // Let the answer reach the hook before looking, so a gate that opens late is caught too.
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Open shortcuts' }))
    expect(developerSubmenuShown()).toBe(false)
  })

  it('shows it when running from source', async () => {
    const isPackagedApp = vi.fn(async () => false)
    window.jplearnDesktop = makeApi(isPackagedApp)
    render(<App />)
    await waitFor(() => expect(isPackagedApp).toHaveBeenCalled())

    fireEvent.click(await screen.findByRole('button', { name: 'Open shortcuts' }))
    await waitFor(() => expect(developerSubmenuShown()).toBe(true))
  })
})
