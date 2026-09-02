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
   THE ACTIVITY PANEL'S TWO TESTS WENT WITH THE PANEL, AND THE BEHAVIOUR DID NOT.

   This modal used to draw a "Last 7 Days" and a "Last 30 Days" card. Both windows are still read
   and still shown, in the two places that already had a claim on them:

     - THE WEEK is the menu chrome's WEEK chip panel, and `statPanels.test.ts` pins it — reviewed,
       correct with accuracy, active days and points, off the same `summary.activity.week`.
     - THE THIRTY DAYS is a line on the ledger's MASTERED sheet, pinned in `Ledger.test.tsx`. It was
       the one window with no home: the chip has the week and the year band has the year.

   What remains in this file is the six tests for the kanji browser, which is the whole reason the
   modal is still here — search, theme, mastery buckets and paging over 2,218 cards is an interface,
   and the ledger's sheets are four lines and a caveat.
   ================================================================================================== */

describe('Overview kanji browser', () => {
  const kanjiCards = [
    { id: 1, note_key: `note:v1:builtin:${'a'.repeat(64)}`, character: '日', romaji: 'nichi', meaning: 'sun', tags: ['kanji', 'n5'], example_sentence: null, theme: 'Numbers & Time' },
    { id: 2, note_key: `note:v1:builtin:${'b'.repeat(64)}`, character: '月', romaji: 'getsu', meaning: 'moon', tags: ['kanji', 'n5'], example_sentence: null, theme: 'Numbers & Time' },
    { id: 3, note_key: `note:v1:builtin:${'c'.repeat(64)}`, character: '山', romaji: 'san', meaning: 'mountain', tags: ['kanji', 'n5'], example_sentence: null, theme: 'Nature & World' },
  ]

  async function openKanjiLevel(): Promise<void> {
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
    fireEvent.click(document.querySelector('.char-mastery-toggle') as HTMLButtonElement)
    fireEvent.click(await screen.findByRole('button', { name: /^JLPT N5:/ }))
  }

  function chipLabels(): string[] {
    return (Array.from(document.querySelectorAll('.char-mastery-chip-kanji')) as HTMLElement[])
      .map((chip) => chip.querySelector('.char-mastery-chip-glyph')?.textContent ?? '')
  }

  it('narrows the chips by meaning, reading, or the character itself', async () => {
    await openKanjiLevel()
    const search = screen.getByRole('searchbox', { name: /search jlpt n5 kanji/i })

    fireEvent.change(search, { target: { value: 'moon' } })
    await waitFor(() => expect(chipLabels()).toEqual(['月']))

    fireEvent.change(search, { target: { value: 'san' } })
    await waitFor(() => expect(chipLabels()).toEqual(['山']))

    // Pasting the kanji is the fastest route to one card, so it must match raw.
    fireEvent.change(search, { target: { value: '日' } })
    await waitFor(() => expect(chipLabels()).toEqual(['日']))
  })

  it('says so when nothing matches, rather than showing an empty grid', async () => {
    await openKanjiLevel()
    fireEvent.change(screen.getByRole('searchbox', { name: /search jlpt n5 kanji/i }), {
      target: { value: 'zzz' },
    })

    expect(await screen.findByText(/no jlpt n5 kanji match that search/i)).toBeTruthy()
    expect(chipLabels()).toEqual([])
  })

  it('filters by theme, which is the only grouping a kanji card carries', async () => {
    await openKanjiLevel()
    const select = screen.getByRole('combobox', { name: /filter jlpt n5 by theme/i })

    fireEvent.change(select, { target: { value: 'Nature & World' } })
    await waitFor(() => expect(chipLabels()).toEqual(['山']))

    fireEvent.change(select, { target: { value: 'Numbers & Time' } })
    await waitFor(() => expect(chipLabels()).toEqual(['日', '月']))

    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(chipLabels()).toEqual(['日', '月', '山']))
  })

  it('combines the theme with search', async () => {
    await openKanjiLevel()
    fireEvent.change(screen.getByRole('combobox', { name: /filter jlpt n5 by theme/i }), {
      target: { value: 'Numbers & Time' },
    })
    fireEvent.change(screen.getByRole('searchbox', { name: /search jlpt n5 kanji/i }), {
      target: { value: 'moon' },
    })

    await waitFor(() => expect(chipLabels()).toEqual(['月']))
  })

  it('filters by mastery bucket, with a count on each chip', async () => {
    window.localStorage.setItem('jplearn-card-scores-v2', JSON.stringify({
      kanji_n5: { 1: 4, 2: 2 }, // 日 mastered, 月 learning, 山 untouched
    }))
    await openKanjiLevel()

    expect(screen.getByRole('button', { name: /^Mastered/ }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: /^Learning/ }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: /^Not started/ }).textContent).toContain('1')

    fireEvent.click(screen.getByRole('button', { name: /^Mastered/ }))
    await waitFor(() => expect(chipLabels()).toEqual(['日']))

    fireEvent.click(screen.getByRole('button', { name: /^Not started/ }))
    await waitFor(() => expect(chipLabels()).toEqual(['山']))

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    await waitFor(() => expect(chipLabels()).toEqual(['日', '月', '山']))
  })
})
