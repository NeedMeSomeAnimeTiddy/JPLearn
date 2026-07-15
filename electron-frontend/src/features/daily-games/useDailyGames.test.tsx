import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { DailyGamesStatePayload } from '../../generated/types'
import { useDailyGames } from './useDailyGames'

const state = {
  pool: { day: '2026-07-15', algorithm_version: 1, words: [], game_seeds: {} },
  streak: { last_completed_day: null, current_streak_days: 0, best_streak_days: 0, freezes_available: 0, freeze_month: null },
  attempts: [], progress: { attempt_count: 0, completed_daily_game_types: [], missed_words: [] },
} satisfies DailyGamesStatePayload

describe('useDailyGames', () => {
  afterEach(() => vi.useRealTimers())

  it('loads the injected clock day and keeps mode state local to the feature', async () => {
    const getState = vi.fn(async () => state)
    const { result } = renderHook(() => useDailyGames({
      getState,
      createPracticeSeed: async () => ({ seed: 1 }),
      recordAttempt: async () => state,
      now: () => new Date(2026, 6, 15),
    }))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getState).toHaveBeenCalledWith('2026-07-15')
    act(() => result.current.setMode('practice'))
    expect(result.current.mode).toBe('practice')
  })

  it('reloads the hub state at the next local midnight and clears its timer on unmount', async () => {
    vi.useFakeTimers()
    let now = new Date(2026, 6, 15, 23, 59, 59)
    const getState = vi.fn(async (day: string) => ({ ...state, pool: { ...state.pool, day } }))
    const dependencies = {
      getState,
      createPracticeSeed: async () => ({ seed: 1 }),
      recordAttempt: async () => state,
      now: () => now,
    }
    const { result, unmount } = renderHook(() => useDailyGames(dependencies))

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getState).toHaveBeenLastCalledWith('2026-07-15')

    now = new Date(2026, 6, 16)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    await vi.waitFor(() => expect(getState).toHaveBeenLastCalledWith('2026-07-16'))

    unmount()
    now = new Date(2026, 6, 17)
    await act(async () => { await vi.advanceTimersByTimeAsync(86_400_000) })
    expect(getState).toHaveBeenCalledTimes(2)
  })
})
