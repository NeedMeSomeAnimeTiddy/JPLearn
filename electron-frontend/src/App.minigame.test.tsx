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
  { id: 0, character: 'あ', romaji: 'a', meaning: 'a', tags: ['hiragana'], example_sentence: 'あさです。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [1, 2, 3], character_distractor_ids: [1, 2, 3] },
  { id: 1, character: 'い', romaji: 'i', meaning: 'i', tags: ['hiragana'], example_sentence: 'いまです。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 2, 3], character_distractor_ids: [0, 2, 3] },
  { id: 2, character: 'う', romaji: 'u', meaning: 'u', tags: ['hiragana'], example_sentence: 'うみです。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 1, 3], character_distractor_ids: [0, 1, 3] },
  { id: 3, character: 'え', romaji: 'e', meaning: 'e', tags: ['hiragana'], example_sentence: 'えきです。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 1, 2], character_distractor_ids: [0, 1, 2] },
]

const kanjiStudyPlanCards = [
  { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
  { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
]

const vocabStudyPlanCards = [
  { id: 20, character: '予定', romaji: 'yotei', meaning: 'schedule', tags: ['vocab', 'n5'], example_sentence: '予定 を たてます。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [21], character_distractor_ids: [21] },
  { id: 21, character: '計画', romaji: 'keikaku', meaning: 'plan', tags: ['vocab', 'n5'], example_sentence: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [20], character_distractor_ids: [20] },
]

const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'

const kanjiStrokeCards = [
  { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
  { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
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
  getDeckCards: async (slug: string) => ({ slug: slug as any, name: 'Deck', cards: baseCards }),
  getStudyQueue: async (slug: string) => ({
    ok: true,
    queue: {
      slug,
      card_ids: baseCards.map((card) => card.id),
      indices: baseCards.map((_, index) => index),
    },
  }),
  getOverviewCharacterMastery: async () => ({
    blocks: { hiragana: [], katakana: [] },
    category_blocks: { vocab_n5: [], grammar_patterns: [] },
    kanji_cards: [],
  }),
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

function buildStudyPlanDesktopApi() {
  return {
    ...baseDesktopApi,
    getStudySummary: async () => ({
      decks: [],
      streak: { current_days: 0, best_days: 0 },
      activity: {
        week: { days: 7, reviewed: 2, correct: 2, incorrect: 0, accuracy: 100, points_earned: 2, active_days: 1 },
        month: { days: 30, reviewed: 4, correct: 4, incorrect: 0, accuracy: 100, points_earned: 4, active_days: 2 },
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
    getDeckCards: async (slug: string) => {
      if (slug === 'kanji_n5') {
        return { slug, name: 'Kanji N5', cards: kanjiStudyPlanCards }
      }

      if (slug === 'vocab_n5') {
        return { slug, name: 'Vocab N5', cards: vocabStudyPlanCards }
      }

      return { slug: slug as any, name: 'Deck', cards: baseCards }
    },
  }
}

describe('Minigame menu', () => {
  it('hides context and narrative games for alphabet tracks', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
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
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    expect((await screen.findAllByText(/Context Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Narrative Story/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Romaji Sprint/i)).toBeNull()
  })

  it('starts a fresh run when launching a minigame from the shortcuts menu', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    fireEvent.click(screen.getByRole('button', { name: /open shortcuts/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /all maps/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /hiragana map/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /meaning match/i }))

    await screen.findByRole('heading', { name: /Meaning Match/i })
    await screen.findByRole('button', { name: /restart challenge/i })

    expect(screen.queryByRole('button', { name: /^Play$/i })).toBeNull()
    expect(screen.queryByText(/Session Report/i)).toBeNull()
  })

  it('supports typed recall and forwards confidence score to record payload', async () => {
    const recordGameResult = vi.fn(async (_payload: { minigame: string; confidenceScore?: number }) => ({ ok: true, card_id: 0, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      recordGameResult,
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    fireEvent.click(await screen.findByRole('button', { name: /toggle answer confidence capture/i }))

    const typedTiles = await screen.findAllByRole('button', { name: /Typed Recall/i })
    fireEvent.click(within((typedTiles[0].closest('.game-tile') ?? typedTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    const typedInput = await screen.findByPlaceholderText(/Type meaning/i)
    fireEvent.click(screen.getByRole('button', { name: /confidence high/i }))
    fireEvent.change(typedInput, { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /^Check$/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'typed_recall',
      confidenceScore: 5,
    }))
  })

  it('shows a starter-safe study plan strip on the main menu and opens the suggested setup page', async () => {
    window.localStorage.setItem(CARD_SCORES_STORAGE_KEY, JSON.stringify({
      hiragana: {},
      katakana: {},
      kanji_n5: {
        10: 1,
        11: 0,
      },
      vocab_n5: {
        20: 1,
        21: 0,
      },
      grammar_patterns: {},
    }))

    window.jplearnDesktop = buildStudyPlanDesktopApi()

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    expect(await screen.findByText(/Study Plan/i)).toBeTruthy()
    expect(screen.getByText(/starter-safe session/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /study plan/i }))
    const shortcutButton = await screen.findByRole('button', { name: /meaning match/i })
    fireEvent.click(shortcutButton)

    expect(await screen.findByRole('heading', { name: /Mini Game Map/i })).toBeTruthy()
    expect((await screen.findAllByText(/Meaning Match/i)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /back to map/i })).toBeNull()
  })

  it('removes romaji sprint for conversational track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Conversational')

    expect((await screen.findAllByText(/Context Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Narrative Story/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Romaji Sprint/i)).toBeNull()
  })

  it('plays both target words and example sentence in conversational rounds', async () => {
    const conversationalCards = [
      { id: 30, character: 'です', romaji: 'desu', meaning: 'to be', tags: ['grammar_patterns'], example_sentence: 'これは ほん です。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [31, 32, 33], character_distractor_ids: [31, 32, 33] },
      { id: 31, character: 'ます', romaji: 'masu', meaning: 'polite verb ending', tags: ['grammar_patterns'], example_sentence: 'べんきょう します。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 32, 33], character_distractor_ids: [30, 32, 33] },
      { id: 32, character: 'から', romaji: 'kara', meaning: 'because', tags: ['grammar_patterns'], example_sentence: 'あめ です から。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 31, 33], character_distractor_ids: [30, 31, 33] },
      { id: 33, character: 'けど', romaji: 'kedo', meaning: 'but', tags: ['grammar_patterns'], example_sentence: 'いきたい けど、いけません。', is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 31, 32], character_distractor_ids: [30, 31, 32] },
    ]
    const speakText = vi.fn(async (_payload: string | { text: string; speaker?: number; speed?: number }) => ({
      ok: true,
      format: 'wav' as const,
      sampleRate: 24000,
      voiceId: 13,
      audioBase64: '',
    }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      speakText,
      getDeckCards: async (slug: string) => (
        slug === 'grammar_patterns'
          ? { slug, name: 'Conversational Deck', cards: conversationalCards }
          : { slug: slug as any, name: 'Deck', cards: baseCards }
      ),
      getStudyQueue: async (slug: string) => (
        slug === 'grammar_patterns'
          ? {
            ok: true,
            queue: {
              slug,
              card_ids: conversationalCards.map((card) => card.id),
              indices: conversationalCards.map((_, index) => index),
            },
          }
          : {
            ok: true,
            queue: {
              slug,
              card_ids: baseCards.map((card) => card.id),
              indices: baseCards.map((_, index) => index),
            },
          }
      ),
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Conversational')

    const typedTiles = await screen.findAllByRole('button', { name: /Typed Recall/i })
    fireEvent.click(within((typedTiles[0].closest('.game-tile') ?? typedTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    fireEvent.click(await screen.findByRole('button', { name: /play target words/i }))
    fireEvent.click(await screen.findByRole('button', { name: /play example sentence/i }))

    await waitFor(() => expect(speakText).toHaveBeenCalledTimes(2))
    const expectedWords = new Set(conversationalCards.map((card) => card.character))
    const expectedSentences = new Set(conversationalCards.map((card) => card.example_sentence))
    const calls = speakText.mock.calls as Array<[string | { text: string; speaker?: number; speed?: number }]>
    const firstPayload = calls[0][0]
    const secondPayload = calls[1][0]
    const firstText = typeof firstPayload === 'string' ? firstPayload : firstPayload.text
    const secondText = typeof secondPayload === 'string' ? secondPayload : secondPayload.text
    expect(expectedWords.has(firstText)).toBe(true)
    expect(expectedSentences.has(secondText)).toBe(true)
  })

  it('renders context cloze prompts in words track with card-specific context', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')
    const contextTiles = await screen.findAllByRole('button', { name: /Context Cloze/i })
    fireEvent.click(within((contextTiles[0].closest('.game-tile') ?? contextTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    const promptMain = await screen.findByText((content, node) => {
      if (!node || !node.classList.contains('game-prompt-main')) return false
      return ['あ', 'い', 'う', 'え'].some((character) => content.includes(character))
    })
    expect(promptMain).toBeTruthy()
    expect(screen.getByText(/Example:\s*(あさです。|いまです。|うみです。|えきです。)/i)).toBeTruthy()
  })

  it('renders reading practice passages in words track using example sentences', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')
    const storyTiles = await screen.findAllByRole('button', { name: /Narrative Story/i })
    fireEvent.click(within((storyTiles[0].closest('.game-tile') ?? storyTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    const storyPassage = await screen.findByText((content, node) => {
      if (!node || !node.classList.contains('game-prompt-main')) return false
      return ['あさです。', 'いまです。', 'うみです。', 'えきです。'].some((line) => content.includes(line))
    })
    expect(storyPassage).toBeTruthy()
    expect(screen.getByText(/The sentence uses (あ|い|う|え).*choose its meaning/i)).toBeTruthy()
  })

  it('shows a stroke-memory hint for kanji character matches', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Kanji')
    const matchTiles = await screen.findAllByRole('button', { name: /Character Match/i })
    fireEvent.click(within((matchTiles[0].closest('.game-tile') ?? matchTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    expect(await screen.findByText(/Think about how this kanji looks/i)).toBeTruthy()
  })

  it('renders a stroke-order writing drill for kanji rounds', async () => {
    const recordGameResult = vi.fn(async () => ({ ok: true, card_id: 10, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      recordGameResult,
      getDeckCards: async (slug: string) => (
        slug.includes('kanji')
          ? { slug, name: 'Kanji Deck', cards: kanjiStrokeCards }
          : { slug: slug as any, name: 'Deck', cards: baseCards }
      ),
      getStudyQueue: async (slug: string) => (
        slug.includes('kanji')
          ? {
            ok: true,
            queue: {
              slug,
              card_ids: kanjiStrokeCards.map((card) => card.id),
              indices: kanjiStrokeCards.map((_, index) => index),
            },
          }
          : {
            ok: true,
            queue: {
              slug,
              card_ids: baseCards.map((card) => card.id),
              indices: baseCards.map((_, index) => index),
            },
          }
      ),
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Kanji')
    const strokeTiles = await screen.findAllByRole('button', { name: /Stroke Order/i })
    fireEvent.click(within((strokeTiles[0].closest('.game-tile') ?? strokeTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    expect(await screen.findByText(/Type the romaji reading to see kanji options/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/Type romaji reading/i)).toBeTruthy()
    expect(screen.getByText(/Type the reading, then select the matching kanji/i)).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(/Type romaji reading/i), { target: { value: 'nichi' } })
    const candidateList = await screen.findByLabelText(/kanji candidates/i)
    const candidateButtons = within(candidateList).getAllByRole('button')
    fireEvent.click(candidateButtons[0])

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({ minigame: 'stroke_order' }))
  })

  it('shows listening modes for kanji and vocab tracks but not for hiragana', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    // Hiragana: listening modes must not appear
    clickTopMenuCard('Hiragana')
    await screen.findAllByText(/Romaji Sprint/i)
    expect(screen.queryByText(/Listening: Audio First/i)).toBeNull()
    expect(screen.queryByText(/Listening: Prompt First/i)).toBeNull()

    cleanup()
    window.localStorage.clear()

    window.jplearnDesktop = baseDesktopApi
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    // Vocabulary: both listening modes must appear
    clickTopMenuCard('Vocabulary')
    expect((await screen.findAllByText(/Listening: Audio First/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Listening: Prompt First/i)).length).toBeGreaterThan(0)
  })

  it('listening audio first mode hides character prompt and records correct minigame key', async () => {
    const recordGameResult = vi.fn(async () => ({
      ok: true,
      card_id: 0,
      repetitions: 0,
      interval: 1,
      next_review: '2026-01-01',
      ease_factor: 2.5,
    }))
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    const audioTiles = await screen.findAllByRole('button', { name: /Listening: Audio First/i })
    fireEvent.click(within((audioTiles[0].closest('.game-tile') ?? audioTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    // Play audio prompt button must be present (it replaces the character display)
    await screen.findByRole('button', { name: /play audio prompt/i })

    // Character text must NOT appear in the prompt-main area before answer
    const promptMainWithChar = screen.queryByText((content, node) => {
      if (!node || !node.classList.contains('game-prompt-main')) return false
      return ['あ', 'い', 'う', 'え'].some((c) => content.includes(c))
    })
    expect(promptMainWithChar).toBeNull()

    // Select the first option to submit an answer
    const optionGrid = document.querySelector('.option-grid')!
    const optionButtons = within(optionGrid as HTMLElement).getAllByRole('button')
    fireEvent.click(optionButtons[0])

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'listening_audio_first',
    }))

    // Character must be revealed in feedback
    expect(await screen.findByText((content, node) => {
      if (!node || !node.classList.contains('game-prompt-main')) return false
      return ['あ', 'い', 'う', 'え'].some((c) => content.includes(c))
    })).toBeTruthy()
  })

  it('listening prompt first mode shows character and records correct minigame key', async () => {
    const recordGameResult = vi.fn(async () => ({
      ok: true,
      card_id: 0,
      repetitions: 0,
      interval: 1,
      next_review: '2026-01-01',
      ease_factor: 2.5,
    }))
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    const promptTiles = await screen.findAllByRole('button', { name: /Listening: Prompt First/i })
    fireEvent.click(within((promptTiles[0].closest('.game-tile') ?? promptTiles[0]) as HTMLElement).getByRole('button', { name: /^Play$/i }))

    // Character must be visible in the prompt-main area
    expect(await screen.findByText((content, node) => {
      if (!node || !node.classList.contains('game-prompt-main')) return false
      return ['あ', 'い', 'う', 'え'].some((c) => content.includes(c))
    })).toBeTruthy()

    // Select the first option to submit an answer
    const optionGrid = document.querySelector('.option-grid')!
    const optionButtons = within(optionGrid as HTMLElement).getAllByRole('button')
    fireEvent.click(optionButtons[0])

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'listening_prompt_first',
    }))
  })
})

