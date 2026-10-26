import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  // A QUESTION is answerable only with a chat runtime to send to
  sendAssistantChatMessage: async () => ({ text: 'ok', provider: 'llama' }),
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

async function palette(label: string) {
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
  const search = await screen.findByRole('textbox', { name: /search commands/i })
  fireEvent.change(search, { target: { value: label } })
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

function route(name: RegExp) {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

async function closeLookup() {
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'What to look up' }), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Look it up' })).toBeNull())
}

/* THE TUTOR POP-UP IS RETIRED. Its chat is Look it up's A QUESTION, its image translation is A
   SCREENSHOT, and its scenarios are a screen of their own on The World's scenes. These are the
   pop-up's navigation promises, kept against where each thing lives now (tools.html, plate 9). */
describe('The tutor, now inside Look it up', () => {
  it('renders exactly one tutor entry point in the titlebar (no separate Tutor-chat or OCR buttons)', async () => {
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })
    expect(screen.getAllByRole('button', { name: /the tutor \(look it up\)/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /open ocr translator|close ocr translator/i })).toBeNull()
  })

  it('the titlebar button toggles Look it up, and focus goes back to it when it closes', async () => {
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })
    const button = screen.getByRole('button', { name: 'Open the tutor (Look it up)' })
    button.focus()
    fireEvent.click(button)
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect(screen.getByRole('button', { name: 'Close the tutor (Look it up)' }).getAttribute('aria-expanded')).toBe('true')
    // The menu that used to stand between the button and the activities is gone.
    expect(screen.queryByRole('dialog', { name: 'Tutor menu' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close lookup' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Look it up' })).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open the tutor (Look it up)' }))
  })

  it('the chat-disabled setting dims only A QUESTION, never the button, the screenshot route, or the scenes', async () => {
    window.localStorage.setItem('jplearn-desktop-settings-v1', JSON.stringify({ assistantChatEnabled: false }))
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })

    expect(screen.getByRole('button', { name: 'Open the tutor (Look it up)' })).toBeTruthy()
    await palette('Chat with Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect(route(/A QUESTION/).disabled).toBe(true)
    expect(screen.getByText('Chatbot is disabled in settings.')).toBeTruthy()
    expect(route(/A SCREENSHOT/)).toBeTruthy()
    await closeLookup()

    await palette('Scenario Practice')
    expect(await screen.findByRole('group', { name: 'Conversations' })).toBeTruthy()
  })

  it('all four command palette entries open the right place', async () => {
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })

    /* Scenario Practice is a screen now: the palette lands on The World's scenes, not a pop-up */
    await palette('Scenario Practice')
    await screen.findByRole('group', { name: 'Conversations' })
    expect(screen.queryByRole('dialog', { name: 'Scenario practice panel' })).toBeNull()

    await palette('Image Translation')
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect(route(/A SCREENSHOT/).getAttribute('aria-pressed')).toBe('true')
    await closeLookup()

    await palette('Chat with Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect(route(/A QUESTION/).getAttribute('aria-pressed')).toBe('true')
    await closeLookup()

    // The fourth entry opens Look it up empty, standing on no model route.
    await palette('Open Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect((screen.getByRole('textbox', { name: 'What to look up' }) as HTMLInputElement).value).toBe('')
    expect(route(/A QUESTION/).getAttribute('aria-pressed')).toBe('false')
    expect(route(/A SCREENSHOT/).getAttribute('aria-pressed')).toBe('false')
  })
})


describe('Romaji-to-kana conversion toggle', () => {
  function typeInto(field: HTMLElement, value: string) {
    fireEvent.input(field, { target: { value } })
  }

  it('is on by default on A QUESTION, and its chip toggles it off and back on', async () => {
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })
    await palette('Chat with Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })

    const field = screen.getByRole('textbox', { name: 'What to look up' }) as HTMLInputElement
    typeInto(field, 'koohii')
    expect(field.value).toBe('こおひい')

    fireEvent.click(screen.getByRole('button', { name: 'Turn off romaji-to-kana conversion' }))
    typeInto(field, 'koohii')
    expect(field.value).toBe('koohii')

    fireEvent.click(screen.getByRole('button', { name: 'Turn on romaji-to-kana conversion' }))
    typeInto(field, 'koohii')
    expect(field.value).toBe('こおひい')
  })

  it('shares the same switch with a conversation — turning it off in Look it up also turns it off there', async () => {
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })
    await palette('Chat with Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off romaji-to-kana conversion' }))
    await closeLookup()

    await palette('Scenario Practice')
    const scenes = await screen.findByRole('group', { name: 'Conversations' })
    fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start scenario' }))

    // The conversation's chip shows the switch already off (shared state).
    const field = await screen.findByRole('textbox', { name: 'Your response' }) as HTMLInputElement
    expect(screen.getByRole('button', { name: 'Turn on romaji-to-kana conversion' })).toBeTruthy()
    typeInto(field, 'koohii')
    expect(field.value).toBe('koohii')

    fireEvent.click(screen.getByRole('button', { name: 'Turn on romaji-to-kana conversion' }))
    typeInto(field, 'koohii')
    expect(field.value).toBe('こおひい')
  })

  it('persists the choice across Look it up closing and opening again', async () => {
    mount()
    await screen.findByRole('button', { name: /open shortcuts/i })
    await palette('Chat with Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off romaji-to-kana conversion' }))
    await closeLookup()

    await palette('Chat with Tutor')
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect(screen.getByRole('button', { name: 'Turn on romaji-to-kana conversion' })).toBeTruthy()
  })
})
