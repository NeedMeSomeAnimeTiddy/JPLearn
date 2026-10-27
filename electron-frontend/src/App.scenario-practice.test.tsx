import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { DEFAULT_RECORD_RESULT, fakeAnswerQueue } from './test-fixtures/answerQueue'

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
  ...fakeAnswerQueue(() => ({ ...DEFAULT_RECORD_RESULT, card_id: 1, repetitions: 0 })),
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

/* THE SCENES ARE THE WAY IN. Every route into a scenario -- the palette, the curriculum, The
   World's TALK lane -- lands on The World's scenes at level three, and picking one opens the
   conversation on the round's sheet. */
async function openScenes() {
  await screen.findByRole('button', { name: /open shortcuts/i })
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
  const search = await screen.findByRole('textbox', { name: /search commands/i })
  fireEvent.change(search, { target: { value: 'Scenario Practice' } })
  fireEvent.click(await screen.findByRole('option', { name: 'Scenario Practice' }))
  return screen.findByRole('group', { name: 'Conversations' })
}

async function startCafe() {
  const scenes = await openScenes()
  fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start scenario' }))
  await screen.findByRole('textbox', { name: 'Your response' })
}

/** says a line, reads the held answer, and goes on with ENTER */
async function respond(text: string) {
  const input = screen.getByRole('textbox', { name: 'Your response' })
  // The field is bound to the wanakana romaji→kana IME, so it reads committed
  // text from the native input event rather than React's onChange.
  fireEvent.input(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
  await screen.findByText('YOU SAID')
  fireEvent.keyDown(document.body, { key: 'Enter' })
}

const CAFE = ['こんにちは', 'コーヒーをください', 'レギュラーでお願いします', 'ここで食べます', 'はい、お願いします', 'ありがとうございます']

/* THE APP IS READY WHEN THE TITLEBAR IS. These suites waited on `HomeView`'s own Daily Games
   button purely as a "the app has finished loading" signal, and that screen retired with phase 6's
   toggle. The titlebar is on every surface, so its shortcuts button does not depend on which
   screen won the race. */
describe('Scenario Practice — end-to-end typed flow', () => {
  it('completes Order at a Cafe through the real UI, then replays, and leaves back to the scenes', async () => {
    mount()
    await startCafe()
    for (const line of CAFE) await respond(line)

    expect(await screen.findByText('SESSION COMPLETE')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Replay scenario' }))
    expect(await screen.findByRole('textbox', { name: 'Your response' })).toBeTruthy()

    // Leaving a fresh replayed session asks first, then goes back to the scenes.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    const ask = await screen.findByRole('alertdialog', { name: 'Confirm leaving the scenario' })
    fireEvent.click(within(ask).getByRole('button', { name: 'YES, DISCARD' }))
    expect(await screen.findByRole('group', { name: 'Conversations' })).toBeTruthy()
  })

  it('preserves an in-progress scenario across Look it up and across leaving the screen', async () => {
    mount()
    await startCafe()
    await respond('こんにちは')
    await respond('コーヒーをください')
    expect(await screen.findByText('What size would you like?')).toBeTruthy()

    // Look it up stands over the conversation and closes back onto it.
    fireEvent.keyDown(document.body, { key: '/' })
    await screen.findByRole('dialog', { name: 'Look it up' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'What to look up' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Look it up' })).toBeNull())
    expect(screen.getByText('What size would you like?')).toBeTruthy()
    // ...and its ESC was the lookup's, not a request to leave the conversation.
    expect(screen.queryByRole('alertdialog')).toBeNull()

    // Leave the screen for somewhere else entirely, then come back through the scenes.
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Go to Study' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Go to Study' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Your response' })).toBeNull())

    const scenes = await openScenes()
    fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
    // The same scene resumes where it stood, rather than asking for a level again.
    expect(await screen.findByText('What size would you like?')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start scenario' })).toBeNull()
  })

  it('keeps a held correction across leaving the screen, and ENTER is still what moves on', async () => {
    mount()
    await startCafe()
    await respond('こんにちは')
    fireEvent.input(screen.getByRole('textbox', { name: 'Your response' }), { target: { value: 'コーヒー' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))
    await screen.findByText('TRY SAYING IT LIKE THIS')

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Go to Study' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Go to Study' }))
    await waitFor(() => expect(screen.queryByText('YOU SAID')).toBeNull())

    const scenes = await openScenes()
    fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
    const corrected = (await screen.findByText('TRY SAYING IT LIKE THIS')).closest('.cv-slip') as HTMLElement
    expect(corrected.textContent).toContain('コーヒーをください')
    expect(screen.getByText('PARTIAL')).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(await screen.findByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.queryByText('TRY SAYING IT LIKE THIS')).toBeNull()
  })

  it('asks before another scene replaces the one under way: KEEP GOING keeps it, YES opens the other', async () => {
    mount()
    await startCafe()
    await respond('こんにちは')
    expect(await screen.findByText('What would you like to order?')).toBeTruthy()

    /* back out to the scenes (the session is kept) and pick the other one */
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const search = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(search, { target: { value: 'Go to Study' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Go to Study' }))
    let scenes = await openScenes()
    fireEvent.click(within(scenes).getByRole('button', { name: /directions in shinjuku/i }))

    let ask = await screen.findByRole('alertdialog', { name: 'Confirm switching to another scene' })
    expect(within(ask).getByText('START ASK FOR DIRECTIONS IN SHINJUKU INSTEAD?')).toBeTruthy()
    /* the conversation under it is still the cafe, untouched */
    expect(screen.getByText('What would you like to order?')).toBeTruthy()
    fireEvent.click(within(ask).getByRole('button', { name: 'KEEP GOING' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.getByText('What would you like to order?')).toBeTruthy()

    /* still resumable from the scenes after saying no */
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    fireEvent.change(await screen.findByRole('textbox', { name: /search commands/i }), { target: { value: 'Go to Study' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Go to Study' }))
    scenes = await openScenes()
    fireEvent.click(within(scenes).getByRole('button', { name: /order at a cafe/i }))
    expect(await screen.findByText('What would you like to order?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start scenario' })).toBeNull()

    /* and saying yes ends it and opens the other scene at choosing how much help */
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    fireEvent.change(await screen.findByRole('textbox', { name: /search commands/i }), { target: { value: 'Go to Study' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Go to Study' }))
    scenes = await openScenes()
    fireEvent.click(within(scenes).getByRole('button', { name: /directions in shinjuku/i }))
    ask = await screen.findByRole('alertdialog', { name: 'Confirm switching to another scene' })
    fireEvent.click(within(ask).getByRole('button', { name: 'YES, DISCARD' }))
    expect(await screen.findByRole('button', { name: 'Start scenario' })).toBeTruthy()
    expect(screen.getByText('新宿で道を尋ねる')).toBeTruthy()
  })

  it('persists a completed session, opens one drafted card at a time, and only saves accepted drafts', async () => {
    const saveScenarioSession = vi.fn(desktopApi.saveScenarioSession)
    const saveScenarioSrsCard = vi.fn(desktopApi.saveScenarioSrsCard)
    window.jplearnDesktop = { ...desktopApi, saveScenarioSession, saveScenarioSrsCard } as unknown as typeof window.jplearnDesktop
    render(<App />)
    await startCafe()
    for (const line of CAFE) await respond(line)

    await screen.findByText('SESSION COMPLETE')
    const accept = await screen.findByRole('button', { name: /^Accept card: / })
    expect(saveScenarioSession).toHaveBeenCalledOnce()
    // One card open, one ACCEPT on the slab.
    expect(screen.getAllByRole('button', { name: /^Accept card: / })).toHaveLength(1)

    fireEvent.click(accept)
    await waitFor(() => expect(saveScenarioSrsCard).toHaveBeenCalledOnce())

    const dismiss = screen.queryByRole('button', { name: /^Dismiss card: / })
    if (dismiss) fireEvent.click(dismiss)
    // Whatever remains pending is skipped — dismissed/skipped drafts must never call saveScenarioSrsCard.
    const skipAll = screen.queryByRole('button', { name: 'Skip all' })
    if (skipAll) fireEvent.click(skipAll)

    expect(saveScenarioSrsCard).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/NO CARDS LEFT TO REVIEW/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to the scenes' }))
    expect(await screen.findByRole('group', { name: 'Conversations' })).toBeTruthy()
  })

  it('leaves an ESC an input method is still composing with to the input method, not to leaving', async () => {
    mount()
    await startCafe()
    const rule = screen.getByRole('textbox', { name: 'Your response' })
    fireEvent.keyDown(rule, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(rule, { key: 'Escape', keyCode: 229 })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Your response' })).toBeTruthy()
    /* a committed ESC still asks */
    fireEvent.keyDown(rule, { key: 'Escape' })
    expect(await screen.findByRole('alertdialog', { name: 'Confirm leaving the scenario' })).toBeTruthy()
  })

  it('requires confirmation before Leave discards the session and returns to the scenes', async () => {
    mount()
    await startCafe()

    fireEvent.click(screen.getByRole('button', { name: 'Leave scenario' }))
    let confirmBanner = await screen.findByRole('alertdialog', { name: 'Confirm leaving the scenario' })
    // Cancelling keeps the session intact.
    fireEvent.click(within(confirmBanner).getByRole('button', { name: 'KEEP GOING' }))
    expect(screen.getByRole('textbox', { name: 'Your response' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Leave scenario' }))
    confirmBanner = await screen.findByRole('alertdialog', { name: 'Confirm leaving the scenario' })
    fireEvent.click(within(confirmBanner).getByRole('button', { name: 'YES, DISCARD' }))
    const scenes = await screen.findByRole('group', { name: 'Conversations' })
    expect(within(scenes).getByRole('button', { name: /order at a cafe/i })).toBeTruthy()
  })
})

describe('Scenario Practice — hints and corrections', () => {
  it('reveals escalating hints with kana and romaji when asked, without affecting the turn', async () => {
    mount()
    await startCafe()

    // Nothing is given away until the learner asks.
    expect(screen.queryByText("kon'nichiwa")).toBeNull()

    // Step 0 is an English-only nudge; step 1 adds the Japanese example.
    fireEvent.click(screen.getByRole('button', { name: 'Need a hint?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show another hint' }))
    // The model answer arrives in Japanese AND romaji.
    expect(screen.getByText('こんにちは')).toBeTruthy()
    expect(screen.getByText("kon'nichiwa", { exact: false })).toBeTruthy()

    // Asking for hints never counts as an answer — the turn is still open.
    expect(screen.getByRole('textbox', { name: 'Your response' })).toBeTruthy()
    await respond('こんにちは')
    expect(await screen.findByText('What would you like to order?')).toBeTruthy()
  })

  it('shows a prominent correction with kana and romaji when an answer is only partially right, held until ENTER', async () => {
    mount()
    await startCafe()
    await respond('こんにちは')

    // A bare drink name: understood, but missing the polite request.
    const input = screen.getByRole('textbox', { name: 'Your response' })
    fireEvent.input(input, { target: { value: 'コーヒー' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }))

    const corrected = (await screen.findByText('TRY SAYING IT LIKE THIS')).closest('.cv-slip') as HTMLElement
    expect(corrected.textContent).toContain('コーヒーをください')
    expect(corrected.textContent).toContain('ko-hi- wo kudasai')
    expect(screen.getByText('PARTIAL')).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(await screen.findByRole('textbox', { name: 'Your response' })).toBeTruthy()
    expect(screen.queryByText('TRY SAYING IT LIKE THIS')).toBeNull()
  })
})

describe('Scenario Practice — the ways in', () => {
  it('the palette lands on the scenes at level three, and FREE TALK asks the tutor in Look it up', async () => {
    mount()
    const scenes = await openScenes()
    expect(within(scenes).getAllByRole('button').length).toBeGreaterThan(1)
    // No pop-up opened on the way.
    expect(screen.queryByRole('dialog', { name: /tutor|scenario practice panel/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /free talk/i }))
    await screen.findByRole('dialog', { name: 'Look it up' })
    expect(screen.getByRole('button', { name: /A QUESTION/ }).getAttribute('aria-pressed')).toBe('true')
  })
})
