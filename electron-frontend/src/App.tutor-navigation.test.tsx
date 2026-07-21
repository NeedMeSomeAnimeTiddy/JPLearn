import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => <span>{sequence[0]}</span>,
}))

const desktopApi = {
  versions: { chrome: '0', electron: '0', node: '0' },
  getStudySummary: async () => ({
    decks: [], streak: { current_days: 0, best_days: 0, freezes_available: 0 },
    activity: {
      week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
      month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
    },
    mistakes: [], minigame_performance: [], session_history: [], item_history: [],
    curriculum: { particle_cloze: { attempts: 0, accuracy: 0 }, particle_cloze_by_script: {}, imposter: { attempts: 0, accuracy: 0 }, imposter_by_script: {} },
  }),
  getBlockProgress: async (slug: string) => ({ slug, blocks: [] }),
  getDeckCards: async () => ({ slug: 'hiragana', name: 'Hiragana', cards: [] }),
  getStudyQueue: async () => ({ ok: true, queue: { slug: 'hiragana', card_ids: [], indices: [], buckets_due: 0, buckets_leech: 0, buckets_new: 0, buckets_review: 0 } }),
  getOverviewCharacterMastery: async () => ({ blocks: { hiragana: [], katakana: [] }, category_blocks: { vocab_n5: [], grammar_patterns: [] }, kanji_cards: [] }),
  recordGameResult: async () => ({ ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }),
  startSessionGoal: async () => ({ ok: true, goal: { session_id: 'test', target_items: 10, target_minutes: null, target_accuracy: null, started_at_utc: '2026-01-01T00:00:00+00:00' } }),
  getSessionSummary: async () => ({ ok: true }),
  applyExpertiseLevel: async (level: string) => ({ ok: true, level, seeded_cards: 0, decks: [] }),
  resetStudyDb: async () => ({ ok: true }),
  getDailyGamesState: async () => ({
    pool: { day: '2026-07-15', algorithm_version: 1, game_seeds: {}, words: [] },
    streak: { last_completed_day: null, current_streak_days: 0, best_streak_days: 0, freezes_available: 0, freeze_month: null },
    attempts: [], progress: { attempt_count: 0, completed_daily_game_types: [], missed_words: [] },
  }),
  notifyStartupReady: async () => ({ ok: true }),
  setStartupTheme: async (theme: string) => ({ ok: true, theme }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
  getAssistantChatHistory: async () => ({ ok: true, turns: [] }),
  getPreloadedAssistantChatHistory: async () => ({ ok: false, runtimeActive: false, turns: [] }),
  getAssistantChatRuntimeStatus: async () => ({ loaded: false, loadedAtUtc: null, lastUsedAtUtc: null, inactivityUnloadMs: 0 }),
  getAssistantEvents: async () => ({ ok: true, events: [] }),
  consumeAssistantEvents: async () => ({ ok: true }),
  getAssistantSnapshot: async () => ({ ok: true }),
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function mount() {
  window.jplearnDesktop = desktopApi as unknown as typeof window.jplearnDesktop
  return render(<App />)
}

describe('Shared Tutor popup navigation', () => {
  it('renders exactly one Tutor entry point in the titlebar (no separate Tutor-chat or OCR buttons)', async () => {
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })
    expect(screen.getAllByRole('button', { name: /open tutor|close tutor/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /open ocr translator|close ocr translator/i })).toBeNull()
  })

  it('opens the Tutor menu by default and navigates into an activity via Back/Close semantics', async () => {
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })

    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tutor menu' })
    expect(within(dialog).getByRole('button', { name: 'Chat with Tutor' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Scenario Practice' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Image Translation' })).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Scenario Practice' }))
    await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    expect(screen.getByRole('button', { name: 'Back to Tutor menu' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Tutor menu' }))
    await screen.findByRole('dialog', { name: 'Tutor menu' })

    fireEvent.click(screen.getByRole('button', { name: 'Close Tutor panel' }))
    expect(screen.queryByRole('dialog', { name: 'Tutor menu' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Tutor' }))
  })

  it('the chat-disabled setting hides only the Chat menu item, never the Tutor button, Scenario Practice, or Image Translation', async () => {
    window.localStorage.setItem('jplearn-desktop-settings-v1', JSON.stringify({ assistantChatEnabled: false }))
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })

    expect(screen.getByRole('button', { name: 'Open Tutor' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tutor menu' })
    expect(within(dialog).queryByRole('button', { name: 'Chat with Tutor' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Scenario Practice' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Image Translation' })).toBeTruthy()
  })

  it('all four command palette entries open the shared popup at the right place', async () => {
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    let search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Scenario Practice' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Scenario Practice' }))
    await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    expect(screen.getByRole('button', { name: 'Back to Tutor menu' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close Tutor panel' }))

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Image Translation' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Image Translation' }))
    await screen.findByRole('dialog', { name: 'OCR translator panel' })
    expect(screen.getByRole('button', { name: 'Back to Tutor menu' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close Tutor panel' }))

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Chat with Tutor' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Chat with Tutor' }))
    await screen.findByRole('dialog', { name: 'Tutor chat panel' })
    fireEvent.click(screen.getByRole('button', { name: 'Close Tutor panel' }))

    // The fourth entry lands on the menu itself rather than an activity.
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Open Tutor' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Open Tutor' }))
    const menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    // The menu has no Back — it is the popup's root.
    expect(within(menu).queryByRole('button', { name: 'Back to Tutor menu' })).toBeNull()
  })
})


describe('Romaji-to-kana conversion toggle', () => {
  function typeInto(field: HTMLElement, value: string) {
    fireEvent.input(field, { target: { value } })
  }

  it('is on by default in the Tutor chat input, and a shared button toggles it off and back on', async () => {
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    const menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Chat with Tutor' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tutor chat panel' })

    const field = within(dialog).getByRole('textbox') as HTMLTextAreaElement
    typeInto(field, 'koohii')
    expect(field.value).toBe('こおひい')

    const toggle = within(dialog).getByRole('button', { name: 'Turn off romaji-to-kana conversion' })
    fireEvent.click(toggle)
    typeInto(field, 'koohii')
    expect(field.value).toBe('koohii')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on romaji-to-kana conversion' }))
    typeInto(field, 'koohii')
    expect(field.value).toBe('こおひい')
  })

  it('shares the same toggle state with Scenario Practice — turning it off in chat also turns it off there', async () => {
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    let menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Chat with Tutor' }))
    let dialog = await screen.findByRole('dialog', { name: 'Tutor chat panel' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off romaji-to-kana conversion' }))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to Tutor menu' }))
    menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
    dialog = await screen.findByRole('dialog', { name: 'Scenario practice panel' })

    // The scenario header shows the toggle already off (shared state).
    expect(within(dialog).getByRole('button', { name: 'Turn on romaji-to-kana conversion' })).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))

    const field = within(dialog).getByRole('textbox', { name: 'Your response' }) as HTMLTextAreaElement
    typeInto(field, 'koohii')
    expect(field.value).toBe('koohii')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on romaji-to-kana conversion' }))
    typeInto(field, 'koohii')
    expect(field.value).toBe('こおひい')
  })

  it('persists the toggle choice across a popup close and reopen', async () => {
    mount()
    await screen.findByRole('button', { name: 'Daily Games' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    const menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Chat with Tutor' }))
    let dialog = await screen.findByRole('dialog', { name: 'Tutor chat panel' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off romaji-to-kana conversion' }))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Tutor panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    const reopenedMenu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(reopenedMenu).getByRole('button', { name: 'Chat with Tutor' }))
    dialog = await screen.findByRole('dialog', { name: 'Tutor chat panel' })
    expect(within(dialog).getByRole('button', { name: 'Turn on romaji-to-kana conversion' })).toBeTruthy()
  })
})
