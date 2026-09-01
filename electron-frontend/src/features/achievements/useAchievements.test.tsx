import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAchievements } from './useAchievements'

function installAchievementsApi(overrides: Partial<Window['jplearnDesktop']> = {}) {
  window.jplearnDesktop = {
    getFeatureState: vi.fn(async () => ({ features: [] })),
    getAchievementMilestones: vi.fn(async () => ({
      total_reviews: 0,
      best_streak_days: 0,
      milestones: [
        { descriptor: 'reviews_100', threshold: 100, earned: false },
        { descriptor: 'reviews_500', threshold: 500, earned: false },
        { descriptor: 'reviews_1000', threshold: 1000, earned: false },
      ],
      streak_milestones: [
        { descriptor: 'streak_3', threshold: 3, earned: false },
        { descriptor: 'streak_7', threshold: 7, earned: false },
        { descriptor: 'streak_14', threshold: 14, earned: false },
        { descriptor: 'streak_30', threshold: 30, earned: false },
        { descriptor: 'streak_100', threshold: 100, earned: false },
      ],
      node_mastery_badges: [
        { descriptor: 'tutorial_complete', node_id: 'tutorial', earned: false },
        { descriptor: 'hiragana_mastered', node_id: 'hiragana', earned: false },
        { descriptor: 'katakana_mastered', node_id: 'katakana', earned: false },
        { descriptor: 'scripted_conversation_complete', node_id: 'scripted_conv', earned: false },
        { descriptor: 'free_conversation_unlocked', node_id: 'free_conv', earned: false },
        { descriptor: 'reading_unlocked', node_id: 'reading', earned: false },
        { descriptor: 'jlpt_n5_passed', node_id: 'jlpt_n5', earned: false },
        { descriptor: 'jlpt_n4_passed', node_id: 'jlpt_n4', earned: false },
        { descriptor: 'jlpt_n3_passed', node_id: 'jlpt_n3', earned: false },
        { descriptor: 'jlpt_n2_passed', node_id: 'jlpt_n2', earned: false },
        { descriptor: 'jlpt_n1_passed', node_id: 'jlpt_n1', earned: false },
      ],
    })),
    ...overrides,
  } as Window['jplearnDesktop']
}

describe('useAchievements', () => {
  beforeEach(() => {
    installAchievementsApi()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('merges feature-unlock badges and review-count milestone badges into one list', async () => {
    installAchievementsApi({
      getFeatureState: vi.fn(async () => ({
        features: [
          { feature_id: 'listening_mode', name: 'Listening', category: 'learning_mode', is_unlocked: true, badges: ['listening_mode_unlocked'], just_unlocked: false, unlocked_at: '2026-08-31T00:00:00+00:00', requires: [{ node_id: 'hiragana', status: 'mastered' }] },
        ],
      })),
      getAchievementMilestones: vi.fn(async () => ({
        total_reviews: 100,
        best_streak_days: 0,
        milestones: [
          { descriptor: 'reviews_100', threshold: 100, earned: true },
          { descriptor: 'reviews_500', threshold: 500, earned: false },
          { descriptor: 'reviews_1000', threshold: 1000, earned: false },
        ],
        streak_milestones: [],
        node_mastery_badges: [],
      })),
    })

    const { result } = renderHook(() => useAchievements())

    await waitFor(() => expect(result.current.loading).toBe(false))

    const byDescriptor = Object.fromEntries(result.current.badges.map((b) => [b.descriptor, b.earned]))
    expect(byDescriptor.listening_mode_unlocked).toBe(true)
    expect(byDescriptor.reviews_100).toBe(true)
    expect(byDescriptor.reviews_500).toBe(false)
    expect(result.current.earnedCount).toBe(2)
  })

  it('merges streak and node-mastery badges into the same list', async () => {
    installAchievementsApi({
      getAchievementMilestones: vi.fn(async () => ({
        total_reviews: 0,
        best_streak_days: 7,
        milestones: [
          { descriptor: 'reviews_100', threshold: 100, earned: false },
          { descriptor: 'reviews_500', threshold: 500, earned: false },
          { descriptor: 'reviews_1000', threshold: 1000, earned: false },
        ],
        streak_milestones: [
          { descriptor: 'streak_3', threshold: 3, earned: true },
          { descriptor: 'streak_7', threshold: 7, earned: true },
          { descriptor: 'streak_14', threshold: 14, earned: false },
          { descriptor: 'streak_30', threshold: 30, earned: false },
          { descriptor: 'streak_100', threshold: 100, earned: false },
        ],
        node_mastery_badges: [
          { descriptor: 'tutorial_complete', node_id: 'tutorial', earned: true },
          { descriptor: 'hiragana_mastered', node_id: 'hiragana', earned: true },
          { descriptor: 'katakana_mastered', node_id: 'katakana', earned: false },
          { descriptor: 'jlpt_n5_passed', node_id: 'jlpt_n5', earned: false },
        ],
      })),
    })

    const { result } = renderHook(() => useAchievements())

    await waitFor(() => expect(result.current.loading).toBe(false))

    const byDescriptor = Object.fromEntries(result.current.badges.map((b) => [b.descriptor, b.earned]))
    expect(byDescriptor.streak_3).toBe(true)
    expect(byDescriptor.streak_7).toBe(true)
    expect(byDescriptor.streak_14).toBe(false)
    expect(byDescriptor.tutorial_complete).toBe(true)
    expect(byDescriptor.hiragana_mastered).toBe(true)
    expect(byDescriptor.katakana_mastered).toBe(false)
    expect(byDescriptor.jlpt_n5_passed).toBe(false)
  })

  it('does not treat a locked feature as earning its badge even if listed', async () => {
    installAchievementsApi({
      getFeatureState: vi.fn(async () => ({
        features: [
          { feature_id: 'listening_mode', name: 'Listening', category: 'learning_mode', is_unlocked: false, badges: ['listening_mode_unlocked'], just_unlocked: false, unlocked_at: null, requires: [{ node_id: 'hiragana', status: 'mastered' }] },
        ],
      })),
    })

    const { result } = renderHook(() => useAchievements())

    await waitFor(() => expect(result.current.loading).toBe(false))
    const byDescriptor = Object.fromEntries(result.current.badges.map((b) => [b.descriptor, b.earned]))
    expect(byDescriptor.listening_mode_unlocked).toBe(false)
  })

  it('surfaces an error message when the bridge call fails', async () => {
    installAchievementsApi({
      getFeatureState: vi.fn(async () => { throw new Error('bridge unavailable') }),
    })

    const { result } = renderHook(() => useAchievements())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('bridge unavailable')
  })

  it('refetch reloads badge state', async () => {
    const getAchievementMilestones = vi.fn(async () => ({
      total_reviews: 0,
      best_streak_days: 0,
      milestones: [
        { descriptor: 'reviews_100', threshold: 100, earned: false },
        { descriptor: 'reviews_500', threshold: 500, earned: false },
        { descriptor: 'reviews_1000', threshold: 1000, earned: false },
      ],
      streak_milestones: [],
      node_mastery_badges: [],
    }))
    installAchievementsApi({ getAchievementMilestones })

    const { result } = renderHook(() => useAchievements())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getAchievementMilestones).toHaveBeenCalledTimes(1)

    await act(async () => { await result.current.refetch() })
    expect(getAchievementMilestones).toHaveBeenCalledTimes(2)
  })
})
