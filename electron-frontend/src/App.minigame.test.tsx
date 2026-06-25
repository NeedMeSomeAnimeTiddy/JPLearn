import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'

function findNarrativeTile(): HTMLElement {
  const tiles = Array.from(document.querySelectorAll('.game-tile')) as HTMLElement[]
  const tile = tiles.find((entry) => entry.textContent?.includes('Narrative Story'))
  if (!tile) {
    throw new Error('Narrative Story tile not found')
  }
  return tile
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
      },
    },
  }),
  getBlockProgress: async (slug: string) => ({ slug, blocks: [] }),
  getDeckCards: async (slug: 'hiragana' | 'katakana' | 'kanji_n5') => ({ slug, name: 'Deck', cards: baseCards }),
  recordGameResult: async () => ({ ok: true, card_id: 0, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }),
  resetStudyDb: async () => ({ ok: true }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
}

describe('Minigame menu', () => {
  it('shows Context Cloze option in script hub', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /hiragana/i }))

    expect(await screen.findByText(/Context Cloze/i)).toBeTruthy()
    expect(await screen.findByText(/Narrative Story/i)).toBeTruthy()
    expect(await screen.findByText(/Chapter 3 ready in pool/i)).toBeTruthy()
  })

  it('shows chapter lock messaging for Narrative Story intro', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /hiragana/i }))

    fireEvent.click(within(findNarrativeTile()).getByRole('button', { name: /^Play$/i }))

    expect(await screen.findByText(/Story chapter readiness/i)).toBeTruthy()
    expect(await screen.findByText(/Chapter 3 is still locked/i)).toBeTruthy()
    expect(await screen.findByText(/Next unlock target:/i)).toBeTruthy()
    expect(await screen.findByText(/promote 1 card to Stage 3/i)).toBeTruthy()
  })

  it('shows chapter badge during an active Narrative Story round', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /hiragana/i }))

    fireEvent.click(within(findNarrativeTile()).getByRole('button', { name: /^Play$/i }))
    const introPanel = document.querySelector('.minigame-intro') as HTMLElement | null
    expect(introPanel).toBeTruthy()
    if (!introPanel) {
      throw new Error('Minigame intro panel not found')
    }
    fireEvent.click(within(introPanel).getByRole('button', { name: /^Play$/i }))

    expect((await screen.findAllByText(/Chapter 1:/i)).length).toBeGreaterThan(0)
  })
})
