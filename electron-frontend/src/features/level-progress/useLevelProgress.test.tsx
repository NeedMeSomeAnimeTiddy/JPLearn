import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLevelProgress } from './useLevelProgress'
import { emptyCardScores } from '../../lib/cardScores'
import type { LevelProgressPayload } from '../../generated/types'

const payload = (n5Sum: number): LevelProgressPayload => ({
  levels: [{ family: 'kanji', level: 'n5', slug: 'kanji_n5', total: 10, score_sum: n5Sum }],
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLevelProgress', () => {
  it('reads on launch, waits out a session, and re-reads once it ends', async () => {
    const getLevelProgress = vi.fn()
      .mockResolvedValueOnce(payload(0))
      .mockResolvedValueOnce(payload(20))
    window.jplearnDesktop = { getLevelProgress } as unknown as typeof window.jplearnDesktop
    const initial = emptyCardScores()

    const { result, rerender } = renderHook(
      (props: { cardScores: ReturnType<typeof emptyCardScores>; paused: boolean }) => useLevelProgress(props),
      { initialProps: { cardScores: initial, paused: false } },
    )
    await waitFor(() => expect(result.current.kanji[0].total).toBe(10))
    expect(getLevelProgress).toHaveBeenCalledTimes(1)

    /* answers during a session move the counters, but the bar is not re-read per answer */
    rerender({ cardScores: initial, paused: true })
    rerender({ cardScores: { ...initial, kanji_n5: { 1: 1 } }, paused: true })
    expect(getLevelProgress).toHaveBeenCalledTimes(1)

    rerender({ cardScores: { ...initial, kanji_n5: { 1: 1 } }, paused: false })
    await waitFor(() => expect(result.current.kanji[0].mastery).toBeCloseTo(20 / 40))
    expect(getLevelProgress).toHaveBeenCalledTimes(2)
  })

  it('keeps the last figures when a read fails', async () => {
    const getLevelProgress = vi.fn()
      .mockResolvedValueOnce(payload(40))
      .mockRejectedValueOnce(new Error('bridge down'))
    window.jplearnDesktop = { getLevelProgress } as unknown as typeof window.jplearnDesktop

    const { result, rerender } = renderHook(
      (props: { cardScores: ReturnType<typeof emptyCardScores> }) => useLevelProgress({ ...props, paused: false }),
      { initialProps: { cardScores: emptyCardScores() } },
    )
    await waitFor(() => expect(result.current.kanji[0].mastery).toBe(1))

    rerender({ cardScores: emptyCardScores() })
    await waitFor(() => expect(getLevelProgress).toHaveBeenCalledTimes(2))
    expect(result.current.kanji[0].mastery).toBe(1)
  })
})
