import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  getStudyQueue: async () => ({ ok: true, queue: { slug: 'hiragana' as const, card_ids: [], indices: [], buckets_due: 0, buckets_leech: 0, buckets_new: 0, buckets_review: 0 } }),
  getOverviewCharacterMastery: async () => ({
    blocks: { hiragana: [], katakana: [] },
    category_blocks: { vocab_n5: [], grammar_patterns: [] },
    kanji_cards: [],
  }),
  getCardNote: async () => ({ note: null }),
  saveCardNote: async (payload: { noteKey: string; noteText: string }) => ({
    note_key: payload.noteKey,
    note_text: payload.noteText,
    created_at_utc: '2026-01-01T00:00:00+00:00',
    updated_at_utc: '2026-01-01T00:00:00+00:00',
  }),
  deleteCardNote: async (noteKey: string) => ({ note_key: noteKey, deleted: true }),
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

/** A zeroed `getStudySummary` payload, for tests that only care about mastery. */
const zeroSummary = {
  decks: [],
  streak: { current_days: 0, best_days: 0, freezes_available: 0 },
  activity: {
    week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
    month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
  },
  mistakes: [],
  minigame_performance: [],
  session_history: [],
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
      mode: 'imposter', script_tag: 'all', attempts: 0, accuracy: 0,
      chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } },
    },
    imposter_by_script: {
      hiragana: { mode: 'imposter', script_tag: 'hiragana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      katakana: { mode: 'imposter', script_tag: 'katakana', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      kanji_n5: { mode: 'imposter', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      vocab_n5: { mode: 'imposter', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
      grammar_patterns: { mode: 'imposter', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, chapters: { '1': { attempts: 0, accuracy: 0, completion_rate: 100 }, '2': { attempts: 0, accuracy: 0, completion_rate: 0 }, '3': { attempts: 0, accuracy: 0, completion_rate: 0 } } },
    },
  },
}

/* ==================================================================================================
   WHAT THIS FILE COVERS NOW, AND WHAT LEFT WITH THE PANEL IT COVERED.

   THE ACTIVITY PANEL'S TWO TESTS WENT WITH THE PANEL and the behaviour did not: the WEEK is the menu
   chrome's chip panel (`statPanels.test.ts`) and the THIRTY DAYS is a line on the ledger's MASTERED
   sheet (`Ledger.test.tsx`).

   THE KANJI BROWSER'S FIVE WENT WITH THE BROWSER, and that behaviour did NOT move anywhere -- so it
   is worth saying plainly rather than quietly. Searching 2,218 kanji by reading or meaning, filtering
   them by theme and by mastery bucket, and paging forty-five at a time was an interface for finding
   a card, and the app already has one of those on `/`. What the overlay draws instead is where you
   are: every set's share, every block's bar, and every character's own score, which answers "how am
   I doing" rather than "where is 山". The mastery-bucket filter is the one thing with no other home;
   PRACTICE's weak-area drill acts on the same fact instead of listing it.

   What is left here is the wiring: that the app opens the overlay, hands it real counts, and lets a
   kanji through to the panel that draws one. The overlay's own three columns are covered in
   `features/mastery/MasteryOverlay.test.tsx`, without an App around them.
   ================================================================================================== */

describe('Every character, from the app', () => {
  const kanjiCards = [
    { id: 1, note_key: `note:v1:builtin:${'a'.repeat(64)}`, character: '日', romaji: 'nichi', meaning: 'sun', tags: ['kanji', 'n5'], example_sentence: null, theme: 'Numbers & Time' },
    { id: 2, note_key: `note:v1:builtin:${'b'.repeat(64)}`, character: '月', romaji: 'getsu', meaning: 'moon', tags: ['kanji', 'n5'], example_sentence: null, theme: 'Numbers & Time' },
    { id: 3, note_key: `note:v1:builtin:${'c'.repeat(64)}`, character: '山', romaji: 'san', meaning: 'mountain', tags: ['kanji', 'n5'], example_sentence: null, theme: 'Nature & World' },
  ]

  async function open(): Promise<void> {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => zeroSummary,
      getOverviewCharacterMastery: async () => ({
        blocks: { hiragana: [], katakana: [] },
        category_blocks: { vocab_n5: [], grammar_patterns: [] },
        kanji_cards: kanjiCards,
      }),
    }
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))
  }

  it('opens on the sets the account has, counted off the bridge', async () => {
    await open()
    await waitFor(() => {
      expect(document.querySelector('.mx-sheet')).toBeTruthy()
    })
    await waitFor(() => {
      const rail = [...document.querySelectorAll('.mx-rail button')].map((b) => b.textContent ?? '')
      expect(rail.some((r) => r.includes('KANJI N5'))).toBe(true)
    })
    /* the two blocks these three cards are taught in, named the way the deck screen names them */
    const blocks = [...document.querySelectorAll('.mx-list button')].map((b) => b.textContent ?? '')
    expect(blocks.some((b) => b.includes('Numbers & Time'))).toBe(true)
    expect(blocks.some((b) => b.includes('Nature & World'))).toBe(true)
  })

  it('lets a kanji through to the panel that draws one properly', async () => {
    await open()
    await waitFor(() => expect(document.querySelectorAll('.mx-chip').length).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: /^日, nichi, sun/ }))
    await screen.findByRole('dialog', { name: 'Kanji details: 日' })
    expect(document.querySelector('.mx-sheet')).toBeNull()
  })
})
