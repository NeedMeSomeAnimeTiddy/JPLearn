import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { openDailyGames } from './test-entry'
import App from './App'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => <span>{sequence[0]}</span>,
}))

const dailyState = {
  pool: {
    day: '2026-07-15', algorithm_version: 1, game_seeds: {},
    words: [{ deck_slug: 'vocab_n5', deck_name: 'N5 Vocabulary', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' }],
  },
  streak: { last_completed_day: null, current_streak_days: 1, best_streak_days: 1, freezes_available: 0, freeze_month: null },
  attempts: [], progress: { attempt_count: 0, completed_daily_game_types: [], missed_words: [] },
}

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
  getDailyGamesState: async () => dailyState,
  notifyStartupReady: async () => ({ ok: true }),
  setStartupTheme: async (theme: string) => ({ ok: true, theme }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
}

const deckACard = { id: 1, character: 'あ', romaji: 'a', meaning: 'a', tags: ['hiragana'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [], character_distractor_ids: [] }
const deckBCard = { ...deckACard, character: 'い', romaji: 'i', meaning: 'i', tags: ['katakana'] }

const reviewDailyState = {
  ...dailyState,
  pool: {
    ...dailyState.pool,
    game_seeds: { typing_blitz: 24 },
    words: [
      { ...dailyState.pool.words[0], deck_slug: 'deck_b', card_id: 1, character: 'い', romaji: 'i', meaning: 'i' },
      { ...dailyState.pool.words[0], deck_slug: 'deck_a', card_id: 1, character: 'あ', romaji: 'a', meaning: 'a' },
    ],
  },
}

const completedReviewDailyState = {
  ...reviewDailyState,
  progress: {
    ...reviewDailyState.progress,
    missed_words: [
      { word: reviewDailyState.pool.words[0], miss_count: 1 },
      { word: reviewDailyState.pool.words[1], miss_count: 1 },
      { word: reviewDailyState.pool.words[0], miss_count: 2 },
    ],
  },
}

function buildReviewDesktopApi(recordGameResult = vi.fn(async () => ({ ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))) {
  const getDeckCards = vi.fn(async (slug: string) => ({ slug, name: slug, cards: slug === 'deck_a' ? [deckACard] : [deckBCard] }))
  const getStudyQueue = vi.fn(async () => ({ ok: true, queue: { slug: 'hiragana', card_ids: [], indices: [], buckets_due: 0, buckets_leech: 0, buckets_new: 0, buckets_review: 0 } }))
  return {
    api: {
      ...desktopApi,
      getDailyGamesState: async () => reviewDailyState,
      recordDailyGamesAttempt: async () => completedReviewDailyState,
      getDeckCards,
      getStudyQueue,
      recordGameResult,
    },
    getDeckCards,
    getStudyQueue,
    recordGameResult,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/** Back on the front door, whichever level of the menu it landed on. */
async function backAtTheMenu(): Promise<void> {
  await waitFor(() => { expect(document.querySelector('.mn-frame')).toBeTruthy() })
}

async function openMissedWordReview(): Promise<void> {
  if (!screen.queryByRole('heading', { name: 'Typing Blitz' })) {
    await openDailyGames()
  }
  const typingTile = (await screen.findByRole('heading', { name: 'Typing Blitz' })).closest('article')
  fireEvent.click(within(typingTile!).getByRole('button', { name: 'Play' }))
  const input = await screen.findByLabelText(/type the japanese word/i)
  fireEvent.change(input, { target: { value: 'wrong' } })
  fireEvent.submit(input.closest('form')!)
  fireEvent.change(await screen.findByLabelText(/type the japanese word/i), { target: { value: 'wrong' } })
  fireEvent.submit(screen.getByLabelText(/type the japanese word/i).closest('form')!)
  fireEvent.click(await screen.findByRole('button', { name: /review missed words/i }))
  await screen.findByPlaceholderText(/enter romaji/i)
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
  vi.useRealTimers()
})

describe('Daily Games navigation', () => {
  it('opens from Home, supports Escape/back, titlebar shortcuts, history, and the command palette', async () => {
    window.jplearnDesktop = desktopApi as unknown as typeof window.jplearnDesktop
    render(<App />)

    /* THREE DOORS, AND ONE OF THEM IS NEW. `HomeView`'s Daily Games button was two of the four
       this test used to walk, and it retired with phase 6's toggle. Its replacement is the menu's
       own route -- PRACTICE, then the DAILY GAMES lane -- which is worth more than pressing the
       titlebar twice was. */
    await openDailyGames()
    expect(await screen.findByRole('heading', { name: 'Crossword' })).toBeTruthy()
    const matchPairsTile = screen.getByRole('heading', { name: 'Match Pairs' }).closest('article')
    fireEvent.click(within(matchPairsTile!).getByRole('button', { name: 'Play' }))
    expect(await screen.findByRole('button', { name: /back to games/i })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('button', { name: /back to games/i }), { key: 'Escape' })
    expect(await screen.findByRole('button', { name: 'Back to main menu' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await backAtTheMenu()

    /* the L1 row's two-step: the first press selects, the second opens. A synthetic `mouseEnter`
       does not stand in for the first, because a hover only counts after a real `pointermove` --
       see `useHoverPick`. */
    const practice = await screen.findByRole('button', { name: /PRACTICE —/i })
    fireEvent.click(practice)
    fireEvent.click(practice)
    fireEvent.click(await screen.findByRole('button', { name: /DAILY GAMES —/i }))
    expect(await screen.findByRole('heading', { name: 'Crossword' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await backAtTheMenu()

    await openDailyGames()
    expect(await screen.findByRole('heading', { name: 'Crossword' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }))
    await backAtTheMenu()

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    const commandSearch = await screen.findByRole('textbox', { name: /search commands/i })
    fireEvent.change(commandSearch, { target: { value: 'daily' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Daily Games' }))
    expect(await screen.findByRole('heading', { name: 'Crossword' })).toBeTruthy()
  })

  it('returns from an active Daily Game to the hub before leaving Daily Games', async () => {
    const review = buildReviewDesktopApi()
    window.jplearnDesktop = review.api as unknown as typeof window.jplearnDesktop
    render(<App />)

    await openDailyGames()
    const typingTile = (await screen.findByRole('heading', { name: 'Typing Blitz' })).closest('article')
    fireEvent.click(within(typingTile!).getByRole('button', { name: 'Play' }))
    const input = await screen.findByLabelText(/type the japanese word/i)

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(await screen.findByRole('heading', { name: 'Crossword' })).toBeTruthy()
    /* Escape stopped at the hub rather than carrying on out to the front door */
    expect(document.querySelector('.mn-frame')).toBeNull()
  })

  it('hydrates a deduplicated cross-deck missed-word queue in supplied order without loading the study queue', async () => {
    window.localStorage.setItem('jplearn-desktop-session-prefs-v1', JSON.stringify({
      script: 'hiragana', game: 'meaning_match', livesEnabled: false, leechFocusEnabled: false,
      confidenceCaptureEnabled: false, sessionTargetItems: 12,
    }))
    const review = buildReviewDesktopApi()
    window.jplearnDesktop = review.api as unknown as typeof window.jplearnDesktop
    render(<App />)

    await openMissedWordReview()

    expect(screen.getByText('あ')).toBeTruthy()
    expect(review.getDeckCards.mock.calls.filter(([slug]) => slug === 'deck_b' || slug === 'deck_a')).toEqual([['deck_a'], ['deck_b']])
    expect(review.getStudyQueue).not.toHaveBeenCalled()
    expect(review.recordGameResult).not.toHaveBeenCalled()
    expect(screen.getByText('JPLearn · Romaji Sprint')).toBeTruthy()
    expect(screen.queryByText('JPLearn · Meaning Match')).toBeNull()
  })

  it('does not advance explicit review while recordGameResult is pending', async () => {
    const pending = deferred<{ ok: boolean; card_id: number; repetitions: number; interval: number; next_review: string; ease_factor: number }>()
    const recordGameResult = vi.fn(() => pending.promise)
    const review = buildReviewDesktopApi(recordGameResult)
    window.jplearnDesktop = review.api as unknown as typeof window.jplearnDesktop
    render(<App />)

    await openMissedWordReview()
    fireEvent.change(screen.getByPlaceholderText(/enter romaji/i), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    await waitFor(() => expect(recordGameResult).toHaveBeenCalledOnce())

    const continueButton = screen.getByRole('button', { name: /continue immediately/i }) as HTMLButtonElement
    expect(continueButton.disabled).toBe(true)
    fireEvent.click(continueButton)
    expect(screen.getByText('あ')).toBeTruthy()

    await act(async () => pending.resolve({ ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    await waitFor(() => expect(continueButton.disabled).toBe(false))
    fireEvent.click(continueButton)
    expect(await screen.findByText('い')).toBeTruthy()
    expect(recordGameResult).toHaveBeenCalledOnce()
  })

  it('does not finish explicit review when the final recordGameResult rejects', async () => {
    const recordGameResult = vi.fn()
      .mockResolvedValueOnce({ ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 })
      .mockRejectedValueOnce(new Error('disk unavailable'))
    const review = buildReviewDesktopApi(recordGameResult)
    window.jplearnDesktop = review.api as unknown as typeof window.jplearnDesktop
    render(<App />)

    await openMissedWordReview()
    fireEvent.change(screen.getByPlaceholderText(/enter romaji/i), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    const firstContinue = screen.getByRole('button', { name: /continue immediately/i }) as HTMLButtonElement
    await waitFor(() => expect(firstContinue.disabled).toBe(false))
    fireEvent.click(firstContinue)

    expect(await screen.findByText('い')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/enter romaji/i), { target: { value: 'i' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t save this review answer/i)
    const finalContinue = screen.getByRole('button', { name: /continue immediately/i }) as HTMLButtonElement
    expect(finalContinue.disabled).toBe(true)
    fireEvent.click(finalContinue)
    expect(screen.getByText('い')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Typing Blitz' })).toBeNull()
    expect(recordGameResult).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: /leave this round/i }))
    expect(await screen.findByRole('heading', { name: 'Typing Blitz' })).toBeTruthy()
    expect(recordGameResult).toHaveBeenCalledTimes(2)
  })

  it('records only submitted explicit-review answers against each round deck and returns to Daily Games on leave or completion', async () => {
    const review = buildReviewDesktopApi()
    window.jplearnDesktop = review.api as unknown as typeof window.jplearnDesktop
    render(<App />)

    await openMissedWordReview()
    fireEvent.click(screen.getByRole('button', { name: /leave this round/i }))
    expect(await screen.findByRole('heading', { name: 'Typing Blitz' })).toBeTruthy()
    expect(review.recordGameResult).not.toHaveBeenCalled()

    await openMissedWordReview()
    const input = await screen.findByPlaceholderText(/enter romaji/i)
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    await waitFor(() => expect(review.recordGameResult).toHaveBeenCalledWith(expect.objectContaining({ slug: 'deck_a', cardId: 1 })))
    const firstContinue = screen.getByRole('button', { name: /continue immediately/i }) as HTMLButtonElement
    await waitFor(() => expect(firstContinue.disabled).toBe(false))
    fireEvent.click(firstContinue)

    expect(await screen.findByText('い')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/enter romaji/i), { target: { value: 'i' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    await waitFor(() => expect(review.recordGameResult).toHaveBeenLastCalledWith(expect.objectContaining({ slug: 'deck_b', cardId: 1 })))
    const finalContinue = screen.getByRole('button', { name: /continue immediately/i }) as HTMLButtonElement
    await waitFor(() => expect(finalContinue.disabled).toBe(false))
    fireEvent.click(finalContinue)
    expect(await screen.findByRole('heading', { name: 'Typing Blitz' })).toBeTruthy()
    expect(review.recordGameResult).toHaveBeenCalledTimes(2)
  })

  it('clears stale ordinary persistence and never stores an explicit missed-word review as resumable', async () => {
    const sessionKey = 'jplearn-desktop-session-v1'
    window.localStorage.setItem(sessionKey, JSON.stringify({
      activeScript: 'hiragana',
      activeGame: 'romaji_sprint',
      livesEnabled: false,
      leechFocusEnabled: false,
      confidenceCaptureEnabled: false,
      sessionTargetItems: 12,
      seenCardIds: [1],
      sessionStartedAt: '2026-07-15T00:00:00.000Z',
      restore: { sessionScore: 1, sessionRounds: 1, sessionPoints: 10, sessionStreak: 1, sessionBestStreak: 1, sessionConfidenceCount: 0, sessionConfidenceTotal: 0, livesRemaining: 3 },
    }))
    const review = buildReviewDesktopApi()
    window.jplearnDesktop = review.api as unknown as typeof window.jplearnDesktop
    const rendered = render(<App />)

    await openMissedWordReview()
    expect(window.localStorage.getItem(sessionKey)).toBeNull()
    expect(screen.queryByText('Resume session?')).toBeNull()

    const input = screen.getByPlaceholderText(/enter romaji/i)
    fireEvent.change(input, { target: { value: 'i' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    await waitFor(() => expect(review.recordGameResult).toHaveBeenCalledOnce())
    expect(window.localStorage.getItem(sessionKey)).toBeNull()

    rendered.unmount()
    vi.useFakeTimers()
    render(<App />)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100) })
    expect(screen.queryByText('Resume session?')).toBeNull()
  })
})
