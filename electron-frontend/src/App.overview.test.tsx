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

const baseDesktopApi = {
  versions: { chrome: '0', electron: '0', node: '0' },
  getBlockProgress: async (slug: string) => ({ slug, blocks: [] }),
  getDeckCards: async () => ({ slug: 'hiragana' as const, name: 'Hiragana', cards: [] }),
  getStudyQueue: async () => ({ ok: true, queue: { slug: 'hiragana' as const, card_ids: [], indices: [] } }),
  getOverviewCharacterMastery: async () => ({ blocks: { hiragana: [], katakana: [] }, kanji_cards: [] }),
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
  resetStudyDb: async () => ({ ok: true }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
}

const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'

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
          context_cloze: { mode: 'context_cloze', script_tag: 'all', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          context_cloze_by_script: {
            hiragana: { mode: 'context_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            katakana: { mode: 'context_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            kanji_n5: { mode: 'context_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            vocab_n5: { mode: 'context_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            grammar_patterns: { mode: 'context_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          },
          narrative_story: {
            mode: 'narrative_story',
            script_tag: 'all',
            attempts: 0,
            accuracy: 0,
            chapters: {
              '1': { attempts: 0, accuracy: 0, completion_rate: 100 },
              '2': { attempts: 0, accuracy: 0, completion_rate: 0 },
              '3': { attempts: 0, accuracy: 0, completion_rate: 0 },
            },
          },
          narrative_story_by_script: {
            hiragana: { mode: 'narrative_story', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            katakana: { mode: 'narrative_story', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            kanji_n5: { mode: 'narrative_story', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            vocab_n5: { mode: 'narrative_story', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            grammar_patterns: { mode: 'narrative_story', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
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
          context_cloze: { mode: 'context_cloze', script_tag: 'all', attempts: 12, accuracy: 75, accuracy_7d: 67, stage_distribution: { 1: 4, 2: 5, 3: 3 } },
          context_cloze_by_script: {
            hiragana: { mode: 'context_cloze', script_tag: 'hiragana', attempts: 7, accuracy: 71, accuracy_7d: 60, stage_distribution: { 1: 3, 2: 3, 3: 1 } },
            katakana: { mode: 'context_cloze', script_tag: 'katakana', attempts: 3, accuracy: 67, accuracy_7d: 67, stage_distribution: { 1: 1, 2: 1, 3: 1 } },
            kanji_n5: { mode: 'context_cloze', script_tag: 'kanji_n5', attempts: 2, accuracy: 100, accuracy_7d: 100, stage_distribution: { 1: 0, 2: 1, 3: 1 } },
            vocab_n5: { mode: 'context_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            grammar_patterns: { mode: 'context_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          },
          narrative_story: {
            mode: 'narrative_story',
            script_tag: 'all',
            attempts: 9,
            accuracy: 67,
            chapters: {
              '1': { attempts: 5, accuracy: 80, completion_rate: 100 },
              '2': { attempts: 3, accuracy: 67, completion_rate: 67 },
              '3': { attempts: 1, accuracy: 0, completion_rate: 25 },
            },
          },
          narrative_story_by_script: {
            hiragana: { mode: 'narrative_story', script_tag: 'hiragana', attempts: 5, accuracy: 80, chapters: { '1': { attempts: 3, accuracy: 100, completion_rate: 100 }, '2': { attempts: 1, accuracy: 0, completion_rate: 60 }, '3': { attempts: 1, accuracy: 0, completion_rate: 20 } } },
            katakana: { mode: 'narrative_story', script_tag: 'katakana', attempts: 3, accuracy: 67, chapters: { '1': { attempts: 2, accuracy: 100, completion_rate: 100 }, '2': { attempts: 1, accuracy: 0, completion_rate: 67 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            kanji_n5: { mode: 'narrative_story', script_tag: 'kanji_n5', attempts: 1, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 1, accuracy: 0, completion_rate: 50 }, '3': { attempts: 0, accuracy: 0, completion_rate: 50 } } },
            vocab_n5: { mode: 'narrative_story', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            grammar_patterns: { mode: 'narrative_story', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
          },
        },
      }),
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
    fireEvent.click((await screen.findAllByRole('button', { name: /study activity/i }))[0])
    fireEvent.click((await screen.findAllByRole('button', { name: /story progress/i }))[0])

    expect(await screen.findByText(/Last 7 Days/i)).toBeTruthy()
    expect(await screen.findByText(/Last 30 Days/i)).toBeTruthy()
    expect((await screen.findAllByText(/Story Progress/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Chapter 3 ready/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/11/)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/38/)).length).toBeGreaterThan(0)
  })

  it('shows a personalized study plan and JLPT coverage snapshot', async () => {
    window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify({
      hiragana: {},
      katakana: {},
      kanji_n5: {
        10: 4,
        11: 1,
      },
      vocab_n5: {
        20: 2,
        21: 0,
      },
      grammar_patterns: {},
    }))

    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => ({
        decks: [],
        streak: { current_days: 4, best_days: 6 },
        activity: {
          week: { days: 7, reviewed: 12, correct: 9, incorrect: 3, accuracy: 75, points_earned: 9, active_days: 5 },
          month: { days: 30, reviewed: 28, correct: 21, incorrect: 7, accuracy: 75, points_earned: 21, active_days: 11 },
        },
        mistakes: [],
        item_history: [],
        curriculum: {
          context_cloze: { mode: 'context_cloze', script_tag: 'all', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          context_cloze_by_script: {
            hiragana: { mode: 'context_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            katakana: { mode: 'context_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            kanji_n5: { mode: 'context_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            vocab_n5: { mode: 'context_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
            grammar_patterns: { mode: 'context_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
          },
          narrative_story: {
            mode: 'narrative_story',
            script_tag: 'all',
            attempts: 0,
            accuracy: 0,
            chapters: {
              '1': { attempts: 0, accuracy: 0, completion_rate: 100 },
              '2': { attempts: 0, accuracy: 0, completion_rate: 0 },
              '3': { attempts: 0, accuracy: 0, completion_rate: 0 },
            },
          },
          narrative_story_by_script: {
            hiragana: { mode: 'narrative_story', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            katakana: { mode: 'narrative_story', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            kanji_n5: { mode: 'narrative_story', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            vocab_n5: { mode: 'narrative_story', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
            grammar_patterns: { mode: 'narrative_story', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
          },
        },
      }),
      getDeckCards: async (slug: 'hiragana' | 'katakana' | 'kanji_n5' | 'kanji_n4' | 'kanji_n3' | 'kanji_n2' | 'kanji_n1' | 'vocab_n5' | 'vocab_n4' | 'vocab_n3' | 'vocab_n2' | 'vocab_n1' | 'grammar_patterns') => {
        if (slug === 'kanji_n5') {
          return {
            slug,
            name: 'Kanji N5',
            cards: [
              { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
              { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
            ],
          }
        }

        if (slug === 'vocab_n5') {
          return {
            slug,
            name: 'Vocab N5',
            cards: [
              { id: 20, character: '予定', romaji: 'yotei', meaning: 'schedule', tags: ['vocab', 'n5'], example_sentence: '予定 を たてます。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [21], character_distractor_ids: [21] },
              { id: 21, character: '計画', romaji: 'keikaku', meaning: 'plan', tags: ['vocab', 'n5'], example_sentence: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [20], character_distractor_ids: [20] },
            ],
          }
        }

        return { slug, name: 'Deck', cards: [] }
      },
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))

    expect(await screen.findByText(/Study Plan/i)).toBeTruthy()
    expect(screen.getByText(/15-minute mixed session/i)).toBeTruthy()
    expect(screen.getByText(/JLPT N5/i)).toBeTruthy()
    expect(screen.getByText(/vocab is behind/i)).toBeTruthy()
  })
})
