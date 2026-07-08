import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

const originalCSS = (globalThis as any).CSS
;(globalThis as any).CSS = { ...originalCSS, supports: () => true }

const baseDesktopApi = {
  versions: { chrome: '0', electron: '0', node: '0' },
  getBlockProgress: async (slug: string) => ({ slug, blocks: [] }),
  getDeckCards: async () => ({ slug: 'hiragana' as const, name: 'Hiragana', cards: [] }),
  getStudyQueue: async () => ({ ok: true, queue: { slug: 'hiragana' as const, card_ids: [], indices: [] } }),
  getOverviewCharacterMastery: async () => ({
    blocks: { hiragana: [], katakana: [] },
    category_blocks: { vocab_n5: [], grammar_patterns: [] },
    kanji_cards: [],
  }),
  notifyStartupReady: async () => ({ ok: true }),
  setStartupTheme: async (theme: string) => ({ ok: true, theme }),
  recordGameResult: async () => ({ ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }),
  startSessionGoal: async () => ({
    ok: true,
    goal: {
      session_id: 'session-test',
      target_items: 10,
      target_minutes: null,
      target_accuracy: null,
      started_at_utc: '2026-01-01T00:00:00+00:00',
    },
  }),
  getSessionSummary: async () => ({
    ok: true,
    summary: {
      session_id: 'session-test',
      target_items: 10,
      completed_items: 0,
      reviewed: 0,
      correct: 0,
      accuracy: 0,
      target_accuracy: null,
      goal_met: false,
    },
  }),
  applyExpertiseLevel: async (level: 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation' | 'jlpt_n4_foundation' | 'jlpt_n3_foundation' | 'jlpt_n2_foundation' | 'jlpt_n1_foundation') => ({
    ok: true,
    level,
    seeded_cards: 0,
    decks: [],
  }),
  resetStudyDb: async () => ({ ok: true }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
}

describe('Overview activity panel', () => {
  it('shows empty-state message when there is no activity', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => ({
        decks: [],
        streak: { current_days: 0, best_days: 0 },
        activity: {
          week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
          month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
        },
        mistakes: [],
        item_history: [],
        curriculum: {
          particle_cloze: { mode: 'particle_cloze', script_tag: 'all', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          particle_cloze_by_script: {
            hiragana: { mode: 'particle_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            katakana: { mode: 'particle_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            kanji_n5: { mode: 'particle_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            vocab_n5: { mode: 'particle_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            grammar_patterns: { mode: 'particle_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          },
          imposter: {
            mode: 'imposter',
            script_tag: 'all',
            attempts: 0,
            accuracy: 0,
            chapters: {
              '1': { attempts: 0, accuracy: 0, completion_rate: 100 },
              '2': { attempts: 0, accuracy: 0, completion_rate: 0 },
              '3': { attempts: 0, accuracy: 0, completion_rate: 0 },
            },
          },
          imposter_by_script: {
            hiragana: { mode: 'imposter', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            katakana: { mode: 'imposter', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            kanji_n5: { mode: 'imposter', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            vocab_n5: { mode: 'imposter', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            grammar_patterns: { mode: 'imposter', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
          },
        },
      }),
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
    fireEvent.click((await screen.findAllByRole('button', { name: /study activity/i }))[0])

    expect(await screen.findByText(/No recent activity yet/i)).toBeTruthy()
  })

  it('renders 7-day and 30-day cards when activity exists', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => ({
        decks: [],
        streak: { current_days: 2, best_days: 5 },
        activity: {
          week: { days: 7, reviewed: 11, correct: 8, incorrect: 3, accuracy: 73, points_earned: 8, active_days: 4 },
          month: { days: 30, reviewed: 38, correct: 28, incorrect: 10, accuracy: 74, points_earned: 28, active_days: 12 },
        },
        mistakes: [],
        item_history: [],
        curriculum: {
          particle_cloze: { mode: 'particle_cloze', script_tag: 'all', attempts: 12, accuracy: 75, accuracy_7d: 67, stage_distribution: { 1: 4, 2: 5, 3: 3 } },
          particle_cloze_by_script: {
            hiragana: { mode: 'particle_cloze', script_tag: 'hiragana', attempts: 7, accuracy: 71, accuracy_7d: 60, stage_distribution: { 1: 3, 2: 3, 3: 1 } },
            katakana: { mode: 'particle_cloze', script_tag: 'katakana', attempts: 3, accuracy: 67, accuracy_7d: 67, stage_distribution: { 1: 1, 2: 1, 3: 1 } },
            kanji_n5: { mode: 'particle_cloze', script_tag: 'kanji_n5', attempts: 2, accuracy: 100, accuracy_7d: 100, stage_distribution: { 1: 0, 2: 1, 3: 1 } },
            vocab_n5: { mode: 'particle_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            grammar_patterns: { mode: 'particle_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          },
          imposter: {
            mode: 'imposter',
            script_tag: 'all',
            attempts: 9,
            accuracy: 67,
            chapters: {
              '1': { attempts: 5, accuracy: 80, completion_rate: 100 },
              '2': { attempts: 3, accuracy: 67, completion_rate: 67 },
              '3': { attempts: 1, accuracy: 0, completion_rate: 25 },
            },
          },
          imposter_by_script: {
            hiragana: { mode: 'imposter', script_tag: 'hiragana', attempts: 5, accuracy: 80, chapters: { '1': { attempts: 3, accuracy: 100, completion_rate: 100 }, '2': { attempts: 1, accuracy: 0, completion_rate: 60 }, '3': { attempts: 1, accuracy: 0, completion_rate: 20 } } },
            katakana: { mode: 'imposter', script_tag: 'katakana', attempts: 3, accuracy: 67, chapters: { '1': { attempts: 2, accuracy: 100, completion_rate: 100 }, '2': { attempts: 1, accuracy: 0, completion_rate: 67 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            kanji_n5: { mode: 'imposter', script_tag: 'kanji_n5', attempts: 1, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 1, accuracy: 0, completion_rate: 50 }, '3': { attempts: 0, accuracy: 0, completion_rate: 50 } } },
            vocab_n5: { mode: 'imposter', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            grammar_patterns: { mode: 'imposter', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
          },
        },
      }),
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
    fireEvent.click((await screen.findAllByRole('button', { name: /study activity/i }))[0])

    expect(await screen.findByText(/Last 7 Days/i)).toBeTruthy()
    expect(await screen.findByText(/Last 30 Days/i)).toBeTruthy()
    expect((await screen.findAllByText(/11/)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/38/)).length).toBeGreaterThan(0)
  })

  it('shows vocabulary and grammar sections in character mastery', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => ({
        decks: [],
        streak: { current_days: 0, best_days: 0 },
        activity: {
          week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
          month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
        },
        mistakes: [],
        item_history: [],
        curriculum: {
          particle_cloze: { mode: 'particle_cloze', script_tag: 'all', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          particle_cloze_by_script: {
            hiragana: { mode: 'particle_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            katakana: { mode: 'particle_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            kanji_n5: { mode: 'particle_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            vocab_n5: { mode: 'particle_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            grammar_patterns: { mode: 'particle_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          },
          imposter: {
            mode: 'imposter',
            script_tag: 'all',
            attempts: 0,
            accuracy: 0,
            chapters: {
              '1': { attempts: 0, accuracy: 0, completion_rate: 100 },
              '2': { attempts: 0, accuracy: 0, completion_rate: 0 },
              '3': { attempts: 0, accuracy: 0, completion_rate: 0 },
            },
          },
          imposter_by_script: {
            hiragana: { mode: 'imposter', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            katakana: { mode: 'imposter', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            kanji_n5: { mode: 'imposter', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            vocab_n5: { mode: 'imposter', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            grammar_patterns: { mode: 'imposter', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
          },
        },
      }),
      getOverviewCharacterMastery: async () => ({
        blocks: { hiragana: [], katakana: [] },
        category_blocks: {
          vocab_n5: [
            {
              index: 0,
              name: 'Greetings',
              card_ids: [200, 201],
              sample_chars: ['日本', '先生'],
              characters: ['日本', '先生'],
              meanings: ['Japan', 'teacher'],
              romajis: ['nihon', 'sensei'],
              mastery: 0,
              unlocked: true,
            },
          ],
          grammar_patterns: [
            {
              index: 0,
              name: 'Common Patterns',
              card_ids: [300],
              sample_chars: ['です'],
              characters: ['です'],
              meanings: ['copula'],
              romajis: ['desu'],
              mastery: 0,
              unlocked: true,
            },
          ],
        },
        kanji_cards: [],
      }),
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
    const masteryToggle = document.querySelector('.char-mastery-toggle') as HTMLButtonElement | null
    if (!masteryToggle) {
      throw new Error('Expected mastery toggle button to be present')
    }
    fireEvent.click(masteryToggle)

    expect(await screen.findByText('Greetings')).toBeTruthy()
    expect(await screen.findByText('Common Patterns')).toBeTruthy()
  })

})

