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
  saveScenarioSession: async (payload: { sessionId: string; scenarioId: string; scenarioVersion: number; learnerLevel: string; startedAtUtc: string; transcript: unknown[]; summary: Record<string, unknown> }) => ({
    id: payload.sessionId,
    scenario_id: payload.scenarioId,
    scenario_version: payload.scenarioVersion,
    learner_level: payload.learnerLevel,
    started_at_utc: payload.startedAtUtc,
    completed_at_utc: '2026-07-21T00:05:00.000Z',
    transcript: payload.transcript,
    summary: payload.summary,
  }),
  saveScenarioSrsCard: async (payload: { id: string; sessionId: string; scenarioId: string; front: string; back: string; reading?: string; notes?: string }) => ({
    id: payload.id,
    session_id: payload.sessionId,
    scenario_id: payload.scenarioId,
    front: payload.front,
    back: payload.back,
    reading: payload.reading ?? '',
    notes: payload.notes ?? '',
    created_at_utc: '2026-07-21T00:06:00.000Z',
  }),
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

async function openScenarioPractice() {
  await screen.findByRole('button', { name: /open shortcuts/i })
  fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
  const menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
  fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
  return screen.findByRole('dialog', { name: 'Scenario practice panel' })
}

function respondWithin(dialog: HTMLElement, text: string) {
  const input = within(dialog).getByRole('textbox', { name: 'Your response' })
  // The field is bound to the wanakana romaji→kana IME, so it reads committed
  // text from the native input event rather than React's onChange.
  fireEvent.input(input, { target: { value: text } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Submit response' }))
}

/* THE APP IS READY WHEN THE TITLEBAR IS. These suites waited on `HomeView`'s own Daily Games
   button purely as a "the app has finished loading" signal, and that screen retired with phase 6's
   toggle. The titlebar is on every surface, so its shortcuts button does not depend on which
   screen won the race. */
describe('Scenario Practice — end-to-end typed flow', () => {
  it('completes Order at a Cafe through the real UI, then replays and returns to the Tutor menu', async () => {
    mount()
    let dialog = await openScenarioPractice()

    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))

    respondWithin(dialog, 'こんにちは')
    respondWithin(dialog, 'コーヒーをください')
    respondWithin(dialog, 'レギュラーでお願いします')
    respondWithin(dialog, 'ここで食べます')
    respondWithin(dialog, 'はい、お願いします')
    respondWithin(dialog, 'ありがとうございます')

    expect(await within(dialog).findByText('Session complete!')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Replay scenario' }))
    expect(await within(dialog).findByRole('textbox', { name: 'Your response' })).toBeTruthy()

    // Return to the Tutor menu from a fresh replayed session.
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await screen.findByRole('dialog', { name: 'Tutor menu' })
  })

  it('preserves an in-progress scenario when switching to Chat and back, and on popup close/reopen', async () => {
    mount()
    let dialog = await openScenarioPractice()
    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))
    respondWithin(dialog, 'こんにちは')
    respondWithin(dialog, 'コーヒーをください')
    expect(await within(dialog).findByText('What size would you like?')).toBeTruthy()

    // Switch to Chat and back — the scenario must resume at the same node.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to Tutor menu' }))
    let menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Chat with Tutor' }))
    dialog = await screen.findByRole('dialog', { name: 'Tutor chat panel' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to Tutor menu' }))
    menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
    dialog = await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    expect(await within(dialog).findByText('What size would you like?')).toBeTruthy()

    // Close the whole popup and reopen — still resumes at the same node.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Tutor panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Tutor' }))
    menu = await screen.findByRole('dialog', { name: 'Tutor menu' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Scenario Practice' }))
    dialog = await screen.findByRole('dialog', { name: 'Scenario practice panel' })
    expect(await within(dialog).findByText('What size would you like?')).toBeTruthy()
  })

  it('persists a completed session, shows the SRS draft review step, and only saves accepted drafts', async () => {
    const saveScenarioSession = vi.fn(desktopApi.saveScenarioSession)
    const saveScenarioSrsCard = vi.fn(desktopApi.saveScenarioSrsCard)
    window.jplearnDesktop = { ...desktopApi, saveScenarioSession, saveScenarioSrsCard } as unknown as typeof window.jplearnDesktop
    render(<App />)
    const dialog = await openScenarioPractice()

    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))

    respondWithin(dialog, 'こんにちは')
    respondWithin(dialog, 'コーヒーをください')
    respondWithin(dialog, 'レギュラーでお願いします')
    respondWithin(dialog, 'ここで食べます')
    respondWithin(dialog, 'はい、お願いします')
    respondWithin(dialog, 'ありがとうございます')

    await within(dialog).findByText('Session complete!')
    await within(dialog).findByRole('button', { name: /review \d+ suggested card/i })
    expect(saveScenarioSession).toHaveBeenCalledOnce()

    fireEvent.click(within(dialog).getByRole('button', { name: /review \d+ suggested card/i }))
    await within(dialog).findByText('Review suggested SRS cards')

    const acceptButtons = within(dialog).getAllByRole('button', { name: /accept card/i })
    const dismissButtons = within(dialog).getAllByRole('button', { name: /dismiss card/i })
    expect(acceptButtons.length).toBeGreaterThan(0)

    fireEvent.click(acceptButtons[0])
    await waitFor(() => expect(saveScenarioSrsCard).toHaveBeenCalledOnce())

    if (dismissButtons.length > 0) {
      fireEvent.click(within(dialog).getAllByRole('button', { name: /dismiss card/i })[0])
    }
    // Whatever remains pending is skipped — dismissed/skipped drafts must never call saveScenarioSrsCard.
    const skipAll = within(dialog).queryByRole('button', { name: 'Skip all' })
    if (skipAll) fireEvent.click(skipAll)

    expect(saveScenarioSrsCard).toHaveBeenCalledTimes(1)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Return to Tutor menu' }))
    await screen.findByRole('dialog', { name: 'Tutor menu' })
  })

  it('requires confirmation before Leave discards the session and returns to scenario select', async () => {
    mount()
    const dialog = await openScenarioPractice()
    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave scenario' }))
    let confirmBanner = await within(dialog).findByRole('alertdialog', { name: 'Confirm leaving the scenario' })
    // Cancelling keeps the session intact.
    fireEvent.click(within(confirmBanner).getByRole('button', { name: 'Keep going' }))
    expect(within(dialog).getByRole('textbox', { name: 'Your response' })).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave scenario' }))
    confirmBanner = await within(dialog).findByRole('alertdialog', { name: 'Confirm leaving the scenario' })
    fireEvent.click(within(confirmBanner).getByRole('button', { name: 'Yes, discard' }))
    expect(await within(dialog).findByRole('button', { name: /order at a cafe/i })).toBeTruthy()
  })
})

describe('Scenario Practice — hints and corrections', () => {
  it('reveals escalating hints with kana and romaji from a hint button, without affecting the turn', async () => {
    mount()
    const dialog = await openScenarioPractice()
    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))

    // Nothing is given away until the learner asks — the hint trigger is a
    // small icon button next to the input, not an inline block under the chat.
    expect(screen.queryByRole('dialog', { name: 'Hints for this turn' })).toBeNull()
    expect(within(dialog).queryByText("kon'nichiwa")).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Need a hint?' }))
    // The popover portals to document.body (like the minigame hint popover),
    // so it is not a DOM descendant of the Tutor popup dialog.
    const popover = await screen.findByRole('dialog', { name: 'Hints for this turn' })
    expect(popover).toBeTruthy()

    // Step 0 is an English-only nudge; step 1 adds the Japanese example.
    fireEvent.click(within(popover).getByRole('button', { name: 'Show another hint' }))
    fireEvent.click(within(popover).getByRole('button', { name: 'Show another hint' }))
    // The model answer arrives in Japanese AND romaji, inside the popover only.
    expect(within(popover).getByText('こんにちは')).toBeTruthy()
    expect(within(popover).getByText("kon'nichiwa", { exact: false })).toBeTruthy()

    // Asking for hints never counts as an answer — the turn is still open.
    expect(within(dialog).getByRole('textbox', { name: 'Your response' })).toBeTruthy()
    respondWithin(dialog, 'こんにちは')
    expect(await within(dialog).findByText('What would you like to order?')).toBeTruthy()
  })

  it('shows a prominent correction with kana and romaji when an answer is only partially right', async () => {
    mount()
    const dialog = await openScenarioPractice()
    fireEvent.click(within(dialog).getByRole('button', { name: /order at a cafe/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beginner' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start scenario' }))
    respondWithin(dialog, 'こんにちは')

    // A bare drink name: understood, but missing the polite request.
    respondWithin(dialog, 'コーヒー')

    // The correction lives directly on the learner's own transcript turn —
    // there is no separate floating feedback box to duplicate it.
    const correctedTurn = await within(dialog).findByText(/Try saying it like this/)
    expect(correctedTurn.textContent).toContain('コーヒーをください')
    expect(correctedTurn.textContent).toContain('ko-hi- wo kudasai')
  })
})
