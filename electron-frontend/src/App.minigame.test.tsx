import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function clickTopMenuCard(label: string): void {
  const menuCards = Array.from(document.querySelectorAll('.menu-card')) as HTMLButtonElement[]
  const button = menuCards.find((card) => {
    const title = card.querySelector('strong')
    return title?.textContent?.trim().toLowerCase() === label.toLowerCase()
  })
  if (!button) {
    throw new Error(`Top menu card not found for ${label}`)
  }
  fireEvent.click(button)
}

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

const baseCards = [
  { id: 0, character: 'あ', romaji: 'a', meaning: 'a', tags: ['hiragana'], is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [1, 2, 3], character_distractor_ids: [1, 2, 3] },
  { id: 1, character: 'い', romaji: 'i', meaning: 'i', tags: ['hiragana'], is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 2, 3], character_distractor_ids: [0, 2, 3] },
  { id: 2, character: 'う', romaji: 'u', meaning: 'u', tags: ['hiragana'], is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 1, 3], character_distractor_ids: [0, 1, 3] },
  { id: 3, character: 'え', romaji: 'e', meaning: 'e', tags: ['hiragana'], is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 1, 2], character_distractor_ids: [0, 1, 2] },
]

const baseDesktopApi = {
  versions: { chrome: '0', electron: '0', node: '0' },
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
  getBlockProgress: async (slug: string) => ({ slug, blocks: [] }),
  getDeckCards: async (slug: 'hiragana' | 'katakana' | 'kanji_n5' | 'kanji_n4' | 'kanji_n3' | 'kanji_n2' | 'kanji_n1' | 'vocab_n5' | 'vocab_n4' | 'vocab_n3' | 'vocab_n2' | 'vocab_n1' | 'grammar_patterns') => ({ slug, name: 'Deck', cards: baseCards }),
  getStudyQueue: async (slug: 'hiragana' | 'katakana' | 'kanji_n5' | 'kanji_n4' | 'kanji_n3' | 'kanji_n2' | 'kanji_n1' | 'vocab_n5' | 'vocab_n4' | 'vocab_n3' | 'vocab_n2' | 'vocab_n1' | 'grammar_patterns') => ({
    ok: true,
    queue: {
      slug,
      card_ids: baseCards.map((card) => card.id),
      indices: baseCards.map((_, index) => index),
    },
  }),
  getOverviewCharacterMastery: async () => ({ blocks: { hiragana: [], katakana: [] }, kanji_cards: [] }),
  notifyStartupReady: async () => ({ ok: true }),
  setStartupTheme: async (theme: string) => ({ ok: true, theme }),
  recordGameResult: async () => ({ ok: true, card_id: 0, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }),
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

describe('Minigame menu', () => {
  it('hides context and narrative games for alphabet tracks', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('heading', { name: /^JPLearn$/i })
    clickTopMenuCard('Hiragana')

    expect((await screen.findAllByText(/Romaji Sprint/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Meaning Match/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Character Match/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Context Cloze/i)).toBeNull()
    expect(screen.queryByText(/Narrative Story/i)).toBeNull()
  })

  it('removes romaji sprint for words track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('heading', { name: /^JPLearn$/i })
    clickTopMenuCard('Words')

    expect((await screen.findAllByText(/Context Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Narrative Story/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Romaji Sprint/i)).toBeNull()
  })

  it('supports typed recall and forwards confidence score to record payload', async () => {
    const recordGameResult = vi.fn(async (_payload: { minigame: string; confidenceScore?: number }) => ({ ok: true, card_id: 0, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      recordGameResult,
    }

    render(<App />)
    await screen.findByRole('heading', { name: /^JPLearn$/i })
    clickTopMenuCard('Words')

    const typedTiles = await screen.findAllByRole('button', { name: /Typed Recall/i })
    fireEvent.click(within((typedTiles[0].closest('.game-tile') ?? typedTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    fireEvent.click(await screen.findByRole('button', { name: /toggle confidence capture/i }))
    fireEvent.click(await screen.findByRole('button', { name: '5' }))
    const introPlayButtons = await screen.findAllByRole('button', { name: /^Play$/i })
    fireEvent.click(introPlayButtons[0])

    const typedInput = await screen.findByPlaceholderText(/Type meaning/i)
    fireEvent.change(typedInput, { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /^Check$/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'typed_recall',
      confidenceScore: 5,
    }))
  })

  it('removes romaji sprint for conversational track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('heading', { name: /^JPLearn$/i })
    clickTopMenuCard('Conversational')

    expect((await screen.findAllByText(/Context Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Narrative Story/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Romaji Sprint/i)).toBeNull()
  })

  it('renders context cloze prompts in words track with card-specific context', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('heading', { name: /^JPLearn$/i })
    clickTopMenuCard('Words')
    const contextTiles = await screen.findAllByRole('button', { name: /Context Cloze/i })
    fireEvent.click(within((contextTiles[0].closest('.game-tile') ?? contextTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    const introPanels = Array.from(document.querySelectorAll('.minigame-intro')) as HTMLElement[]
    const introPanel = introPanels[introPanels.length - 1] ?? null
    expect(introPanel).toBeTruthy()
    if (introPanel === null) {
      throw new Error('Minigame intro panel not found')
    }
    fireEvent.click(within(introPanel).getByRole('button', { name: /^Play$/i }))

    const promptMain = await screen.findByText((content, node) => {
      if (!node || !node.classList.contains('game-prompt-main')) return false
      return ['あ', 'い', 'う', 'え'].some((character) => content.includes(character))
    })
    expect(promptMain).toBeTruthy()
  })
})
