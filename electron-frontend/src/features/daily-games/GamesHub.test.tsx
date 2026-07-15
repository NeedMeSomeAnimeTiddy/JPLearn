import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as axeCore from 'axe-core'
import type { DailyGamesStatePayload } from '../../generated/types'
import type { DailyGamesSessionDependencies } from './types'
import { GamesHub } from './components/GamesHub'
import { buildCrossword } from './crossword'

const readyState: DailyGamesStatePayload = {
  pool: {
    day: '2026-07-15', algorithm_version: 1, game_seeds: {},
    words: [{ deck_slug: 'vocab_n5', deck_name: 'N5 Vocabulary', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' }],
  },
  streak: { last_completed_day: null, current_streak_days: 3, best_streak_days: 5, freezes_available: 1, freeze_month: null },
  attempts: [],
  progress: { attempt_count: 1, completed_daily_game_types: ['word_search'], missed_words: [] },
}

const dependencies = (getState: () => Promise<DailyGamesStatePayload>): DailyGamesSessionDependencies => ({
  getState: (_day: string) => getState(),
  createPracticeSeed: async () => ({ seed: 2 }),
  recordAttempt: async () => readyState,
  clipboard: { writeText: async () => undefined },
  now: () => new Date(2026, 6, 15),
})

const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('GamesHub', () => {
  it('keeps an active game on its original state without replacing the rolled-over hub on completion', async () => {
    vi.useFakeTimers()
    let now = new Date(2026, 6, 15, 23, 59, 59)
    const words = [
      { ...readyState.pool.words[0], card_id: 1, character: '学校', meaning: 'school' },
      { ...readyState.pool.words[0], card_id: 2, character: '校門', meaning: 'school gate' },
      { ...readyState.pool.words[0], card_id: 3, character: '門前', meaning: 'in front of a gate' },
    ]
    const oldDayState = {
      ...readyState,
      pool: { ...readyState.pool, words, game_seeds: { crossword: 12 } },
      progress: { ...readyState.progress, completed_daily_game_types: [] },
    }
    const getState = vi.fn(async (day: string) => ({
      ...oldDayState,
      pool: { ...oldDayState.pool, day },
    }))
    const recordAttempt = vi.fn(async () => ({
      ...oldDayState,
      progress: { ...oldDayState.progress, completed_daily_game_types: ['crossword'] },
    }))
    const sessionDependencies: DailyGamesSessionDependencies = {
      getState,
      createPracticeSeed: async () => ({ seed: 2 }),
      recordAttempt,
      clipboard: { writeText: async () => undefined },
      now: () => now,
    }
    render(<GamesHub dependencies={sessionDependencies} />)

    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'Crossword' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0])
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'Crossword' })).toBeTruthy()

    now = new Date(2026, 6, 16)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(getState).toHaveBeenLastCalledWith('2026-07-16')
    expect(screen.getByRole('heading', { name: 'Crossword' })).toBeTruthy()

    const board = buildCrossword(words, 12)
    for (const entry of board.entries) {
      for (const [index, cell] of entry.cells.entries()) {
        fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`Row ${cell.row + 1}, column ${cell.column + 1}`) }), { target: { value: Array.from(entry.answer)[index] } })
      }
    }
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))
    await act(async () => {})
    expect(screen.getByRole('region', { name: /crossword complete/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const crosswordTile = screen.getByRole('heading', { name: 'Crossword' }).closest('article')
    expect(within(crosswordTile!).getByText('New')).toBeTruthy()
    expect(within(crosswordTile!).queryByText('Complete')).toBeNull()
  })

  it('uses nested Escape navigation and lets Word Search cancel its selection first', async () => {
    const wordSearchState = {
      ...readyState,
      pool: { ...readyState.pool, game_seeds: { word_search: 91 } },
    }
    render(<GamesHub dependencies={dependencies(async () => wordSearchState)} />)
    const tile = (await screen.findByRole('heading', { name: 'Word Search' })).closest('article')
    fireEvent.click(within(tile!).getByRole('button', { name: 'Play' }))
    const firstCell = await screen.findAllByRole('button', { name: /Row 1, column/i })
    fireEvent.keyDown(firstCell[0], { key: 'Enter' })
    fireEvent.keyDown(firstCell[0], { key: 'Escape' })

    expect(screen.getByRole('status').textContent).toMatch(/cancelled/i)
    expect(screen.getByRole('button', { name: /back to games/i })).toBeTruthy()

    fireEvent.keyDown(firstCell[0], { key: 'Escape' })
    expect(await screen.findByRole('heading', { name: 'Match Pairs' })).toBeTruthy()
  })

  it('shows a loading state, then Crossword, Word Search, Match Pairs, and Typing Blitz as playable daily games', async () => {
    let resolveState: (value: DailyGamesStatePayload) => void = () => undefined
    const getState = vi.fn(() => new Promise<DailyGamesStatePayload>((resolve) => { resolveState = resolve }))
    render(<GamesHub dependencies={dependencies(getState)} />)

    expect(screen.getByRole('status', { name: /loading today/i })).toBeTruthy()
    resolveState(readyState)
    expect(await screen.findByRole('heading', { name: 'Crossword' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Word Search' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Match Pairs' })).toBeTruthy()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(4)
    expect(screen.getByText('Complete')).toBeTruthy()
    expect(screen.getAllByText('New')).toHaveLength(3)
  })

  it('replays a completed daily game in practice mode', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 2 }))
    const sessionDependencies = {
      ...dependencies(async () => readyState),
      createPracticeSeed,
    }
    render(<GamesHub dependencies={sessionDependencies} />)

    const tile = (await screen.findByRole('heading', { name: 'Word Search' })).closest('article')
    fireEvent.click(within(tile!).getByRole('button', { name: 'Play' }))

    await waitFor(() => expect(createPracticeSeed).toHaveBeenCalledWith({ day: '2026-07-15', gameType: 'word_search' }))
  })

  it('retries an error and supports Daily and Practice modes', async () => {
    const getState = vi.fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(readyState)
    render(<GamesHub dependencies={dependencies(getState)} />)

    expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText(/shared set of four/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }))
    expect(screen.getByText(/without changing today.s progress/i)).toBeTruthy()
    expect(screen.queryByText('Complete')).toBeNull()
  })

  it('renders an empty state when the pool has no words', async () => {
    render(<GamesHub dependencies={dependencies(async () => ({ ...readyState, pool: { ...readyState.pool, words: [] } }))} />)

    expect(await screen.findByRole('heading', { name: /build your game pool/i })).toBeTruthy()
  })

  it('has no axe violations in ready, error, and empty states', async () => {
    const { container, rerender } = render(<GamesHub dependencies={dependencies(async () => readyState)} />)
    await screen.findByRole('heading', { name: 'Word Search' })
    expect((await runAxe(container)).violations).toEqual([])

    rerender(<GamesHub dependencies={dependencies(async () => { throw new Error('Network unavailable') })} />)
    await screen.findByRole('alert')
    expect((await runAxe(container)).violations).toEqual([])

    rerender(<GamesHub dependencies={dependencies(async () => ({ ...readyState, pool: { ...readyState.pool, words: [] } }))} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: /build your game pool/i })).toBeTruthy())
    expect((await runAxe(container)).violations).toEqual([])
  })
})
