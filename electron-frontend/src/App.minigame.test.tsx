import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

// Mock TypeAnimation to render text immediately instead of character-by-character.
// This avoids timing issues in jsdom where incremental typing never completes quickly enough.
vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence, style, className }: { sequence: (string | number)[]; style?: React.CSSProperties; className?: string }) => {
    // Pick the first string from sequence — that's the text to display.
    const text = typeof sequence[0] === 'string' ? sequence[0] : ''
    return <span className={className} style={style}>{text}</span>
  },
}))

// Mock useTypewriter to render text immediately.
vi.mock('./features/onboarding/useTypewriter', () => ({
  useTypewriter: (text: string, onComplete: () => void) => {
    onComplete()
    return text
  },
}))

// Mock WelcomeStep to render text immediately (uses inline setInterval typewriter).
vi.mock('./features/onboarding/components/WelcomeStep', () => ({
  WelcomeStep: ({ onReveal }: { onReveal: () => void }) => {
    setTimeout(() => onReveal(), 0)
    return (
      <div className="obn-hero">
        <div className="obn-hero-badge">日本語</div>
        <h1 className="obn-hero-title">Welcome to JPLearn</h1>
        <p className="obn-hero-subtitle">Let&apos;s take two minutes...</p>
      </div>
    )
  },
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function clickTopMenuCard(label: string): void {
  const menuCards = Array.from(document.querySelectorAll('.cassette')) as HTMLButtonElement[]
  const button = menuCards.find((card) => {
    const title = card.querySelector('.cassette-title')
    return title?.textContent?.trim().toLowerCase() === label.toLowerCase()
  })
  if (!button) {
    throw new Error(`Top menu card not found for ${label}`)
  }
  fireEvent.click(button)
  fireEvent.click(button)
}

function clickTilePrimaryAction(tileButton: HTMLElement): void {
  // Cassette carousel: first click focuses/selects the cassette, second click
  // launches the now-focused minigame.
  const cassette = (tileButton.closest('.cassette') ?? tileButton) as HTMLElement
  fireEvent.click(cassette)
  fireEvent.click(cassette)
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

class MockIntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}

  disconnect(): void {}
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

class MockResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}

  disconnect(): void {}
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
})

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
})

if (!Element.prototype.scrollBy) {
  Element.prototype.scrollBy = function scrollBy(_x?: number | ScrollToOptions, _y?: number) {}
}

const baseCards = [
  { id: 0, character: 'あ', romaji: 'a', meaning: 'a', tags: ['hiragana'], example_sentence: 'あさです。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [1, 2, 3], character_distractor_ids: [1, 2, 3] },
  { id: 1, character: 'い', romaji: 'i', meaning: 'i', tags: ['hiragana'], example_sentence: 'いまです。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 2, 3], character_distractor_ids: [0, 2, 3] },
  { id: 2, character: 'う', romaji: 'u', meaning: 'u', tags: ['hiragana'], example_sentence: 'うみです。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 1, 3], character_distractor_ids: [0, 1, 3] },
  { id: 3, character: 'え', romaji: 'e', meaning: 'e', tags: ['hiragana'], example_sentence: 'えきです。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [0, 1, 2], character_distractor_ids: [0, 1, 2] },
]

const kanjiStudyPlanCards = [
  { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', dictionary_summary: { character: '日', reading: 'にち', primary_gloss: 'day', glosses: ['day', 'sun'], source: 'offline_dictionary' }, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
  { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
]

const vocabStudyPlanCards = [
  { id: 20, character: '予定', romaji: 'yotei', meaning: 'schedule', tags: ['vocab', 'n5'], example_sentence: '予定 を たてます。', dictionary_summary: { character: '予定', reading: 'よてい', primary_gloss: 'schedule', glosses: ['schedule', 'plan'], source: 'offline_dictionary' }, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [21], character_distractor_ids: [21] },
  { id: 21, character: '計画', romaji: 'keikaku', meaning: 'plan', tags: ['vocab', 'n5'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [20], character_distractor_ids: [20] },
]

const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'

const kanjiStrokeCards = [
  { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', dictionary_summary: { character: '日', reading: 'にち', primary_gloss: 'day', glosses: ['day', 'sun'], source: 'offline_dictionary' }, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
  { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
]

const baseDesktopApi = {
  versions: { chrome: '0', electron: '0', node: '0' },
  getStudySummary: async () => ({
    decks: [],
    streak: { current_days: 0, best_days: 0, freezes_available: 0 },
    activity: {
      week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
      month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
    },
    mistakes: [],
    minigame_performance: [],
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
  searchDictionary: async (query: string) => ({
    query,
    source: 'offline_dictionary' as const,
    results: [],
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
  getVoiceStatus: async () => ({
    available: true,
    modelReady: true,
    downloading: false,
    downloadProgress: 1,
    modelName: 'voicevox',
    lastError: null,
  }),
  getSetupSystemInfo: async () => ({
    totalRamGb: 16,
    gpuVramGb: null,
    models: [],
    recommendedTier: 'low',
    activeModelTier: null,
    activeEmbedderTier: null,
    activeEmbedderLabel: null,
    activeEmbedderInstalled: false,
    activeEmbedderEnabled: false,
    llamaCppInstalled: false,
    voiceInstalled: true,
    voiceModels: [{ tier: '0.6b' as const, label: 'VOICEVOX', description: 'Local Japanese speech synthesis', installed: true, combinedSizeMb: 0, filename: '', sizeMb: 0 }],
    activeVoiceModel: '0.6b',
    fontsInstalled: false,
    dictionaryInstalled: false,
    llamaCppEstimatedDownloadMinutes: null,
    dictionaryEstimatedDownloadMinutes: null,
    speechModels: [],
    recommendedSpeechTier: 'low',
    activeSpeechModelTier: null,
    ocrModels: [],
    recommendedOcrTier: 'low',
    activeOcrModelTier: null,
    ocrInstalled: false,
    translationModels: [],
    recommendedTranslationTier: 'low',
    activeTranslationModelTier: null,
    translationInstalled: false,
    translationProfiles: [],
    activeTranslationProfileTier: null,
    isPackaged: false,
  } as any),
}

function buildStudyPlanDesktopApi() {
  return {
    ...baseDesktopApi,
    getStudySummary: async () => ({
      decks: [],
      streak: { current_days: 0, best_days: 0, freezes_available: 0 },
      activity: {
        week: { days: 7, reviewed: 2, correct: 2, incorrect: 0, accuracy: 100, points_earned: 2, active_days: 1 },
        month: { days: 30, reviewed: 4, correct: 4, incorrect: 0, accuracy: 100, points_earned: 4, active_days: 2 },
      },
      mistakes: [],
      minigame_performance: [],
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
  it('includes grammar gameplay modes for alphabet tracks', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Hiragana')

    expect((await screen.findAllByText(/Romaji Sprint/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Meaning Match/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Character Match/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Sentence Assembly/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Particle Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Imposter/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
  })

  it('removes romaji sprint for words track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    expect((await screen.findAllByText(/Particle Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Imposter/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Romaji Sprint/i)).toBeNull()
  })

  it('shows dictation mode in vocabulary track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')

    expect((await screen.findAllByText(/Dictation/i)).length).toBeGreaterThan(0)
  })

  it('starts a fresh run when launching a minigame from the shortcuts menu', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    fireEvent.click(screen.getByRole('button', { name: /open shortcuts/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /all maps/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /hiragana map/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /meaning match/i }))

    await screen.findByText(/Meaning Match/i)
    await screen.findByRole('button', { name: /restart challenge/i })

    expect(screen.queryByRole('button', { name: /^(play|launch)$/i })).toBeNull()
    expect(screen.queryByText(/Session Report/i)).toBeNull()
  })

  it('exits the minigame and shows onboarding after resetting data from settings', async () => {
    const resetStudyDb = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      resetStudyDb,
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    fireEvent.click(screen.getByRole('button', { name: /open shortcuts/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /all maps/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /hiragana map/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /meaning match/i }))

    await screen.findByText(/Meaning Match/i)

    const settingsButtons = screen.getAllByRole('button', { name: /open settings/i })
    fireEvent.click(settingsButtons[settingsButtons.length - 1])
    fireEvent.click(await screen.findByRole('tab', { name: /system/i }))
    fireEvent.click(await screen.findByRole('button', { name: /data management/i }))
    fireEvent.click(await screen.findByRole('button', { name: /reset all progress/i }))
    fireEvent.click(await screen.findByRole('button', { name: /i understand/i }))
    fireEvent.click(await screen.findByRole('button', { name: /yes, delete everything/i }))

    await waitFor(() => expect(resetStudyDb).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: /Welcome to JPLearn/i })).toBeTruthy()
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
    clickTilePrimaryAction(typedTiles[0])

    const typedInput = await screen.findByPlaceholderText(/Type meaning/i)
    fireEvent.click(screen.getByRole('button', { name: /confidence high/i }))
    fireEvent.change(typedInput, { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

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

    const shortcutButton = await screen.findByRole('button', { name: /meaning match/i })
    fireEvent.click(shortcutButton)

    expect(await screen.findByRole('heading', { name: /Mini Game Map/i })).toBeTruthy()
    expect((await screen.findAllByText(/Meaning Match/i)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /back to map/i })).toBeNull()
  })

  it('removes romaji sprint for grammar track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Grammar')

    expect((await screen.findAllByText(/Particle Cloze/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Imposter/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Interleave Mix/i)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Romaji Sprint/i)).toBeNull()
  })

  it('plays both target words and example sentence in grammar rounds', async () => {
    const conversationalCards = [
      { id: 30, character: 'です', romaji: 'desu', meaning: 'to be', tags: ['grammar_patterns'], example_sentence: 'これは ほん です。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [31, 32, 33], character_distractor_ids: [31, 32, 33] },
      { id: 31, character: 'ます', romaji: 'masu', meaning: 'polite verb ending', tags: ['grammar_patterns'], example_sentence: 'べんきょう します。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 32, 33], character_distractor_ids: [30, 32, 33] },
      { id: 32, character: 'から', romaji: 'kara', meaning: 'because', tags: ['grammar_patterns'], example_sentence: 'あめ です から。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 31, 33], character_distractor_ids: [30, 31, 33] },
      { id: 33, character: 'けど', romaji: 'kedo', meaning: 'but', tags: ['grammar_patterns'], example_sentence: 'いきたい けど、いけません。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 31, 32], character_distractor_ids: [30, 31, 32] },
    ]
    const speakText = vi.fn(async (_payload: string | { text: string; speaker?: string | number; speed?: number }) => ({
      ok: true,
      format: 'wav' as const,
      sampleRate: 24000,
      voiceId: 'male_kenji',
      audioBase64: '',
    }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      speakText,
      getDeckCards: async (slug: string) => (
        slug === 'grammar_patterns'
          ? { slug, name: 'Grammar Deck', cards: conversationalCards }
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
    clickTopMenuCard('Grammar')

    const typedTiles = await screen.findAllByRole('button', { name: /Typed Recall/i })
    clickTilePrimaryAction(typedTiles[0])

    fireEvent.click(await screen.findByRole('button', { name: /play target words/i }))
    fireEvent.click(await screen.findByRole('button', { name: /play example sentence/i }))

    await waitFor(() => expect(speakText).toHaveBeenCalledTimes(2))
    const expectedWords = new Set(conversationalCards.map((card) => card.character))
    const expectedSentences = new Set(conversationalCards.map((card) => card.example_sentence))
    const calls = speakText.mock.calls as Array<[string | { text: string; speaker?: string | number; speed?: number }]>
    const firstPayload = calls[0][0]
    const secondPayload = calls[1][0]
    const firstText = typeof firstPayload === 'string' ? firstPayload : firstPayload.text
    const secondText = typeof secondPayload === 'string' ? secondPayload : secondPayload.text
    expect(expectedWords.has(firstText)).toBe(true)
    expect(expectedSentences.has(secondText)).toBe(true)
  })

  it('renders particle cloze prompts in words track with card-specific context', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')
    const contextTiles = await screen.findAllByRole('button', { name: /Particle Cloze/i })
    clickTilePrimaryAction(contextTiles[0])

    // Wait for the round to render, then check .game-prompt-main text
    await waitFor(() => {
      const promptMain = document.querySelector('.game-prompt-main')
      expect(promptMain?.textContent).toMatch(/[あいうえ]/)
    })
    fireEvent.click(await screen.findByRole('button', { name: /toggle hint/i }))
    await screen.findByText((content) => content.includes('あさです') || content.includes('いまです') || content.includes('うみです') || content.includes('えきです'))
  })

  it('renders imposter passages in words track using example sentences', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Vocabulary')
    const storyTiles = await screen.findAllByRole('button', { name: /Imposter/i })
    clickTilePrimaryAction(storyTiles[0])

    await waitFor(() => {
      const storyPassage = document.querySelector('.game-prompt-main')
      expect(storyPassage?.textContent).toMatch(/[あさです。いまです。うみです。えきです。]/)
    })
    fireEvent.click(await screen.findByRole('button', { name: /toggle hint/i }))
    const hintText = document.querySelector('.minigame-hint-popover-text')
    expect(hintText?.textContent).toContain('choose its meaning')
  })

  it('shows a stroke-memory hint for kanji character matches', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getDeckCards: async (slug: string) => (
        slug.includes('kanji')
          ? { slug, name: 'Kanji Deck', cards: kanjiStudyPlanCards }
          : { slug: slug as any, name: 'Deck', cards: baseCards }
      ),
      getStudyQueue: async (slug: string) => (
        slug.includes('kanji')
          ? { ok: true, queue: { slug, card_ids: kanjiStudyPlanCards.map((card) => card.id), indices: kanjiStudyPlanCards.map((_, index) => index) } }
          : { ok: true, queue: { slug, card_ids: baseCards.map((card) => card.id), indices: baseCards.map((_, index) => index) } }
      ),
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Kanji')
    const matchTiles = await screen.findAllByRole('button', { name: /Character Match/i })
    clickTilePrimaryAction(matchTiles[0])

    fireEvent.click(await screen.findByRole('button', { name: /toggle hint/i }))
    await waitFor(() => {
      const hintText = document.querySelector('.minigame-hint-popover-text')
      expect(hintText?.textContent).toContain('Think about how this kanji looks')
    })
  })

  it('renders mode-specific dictionary help and seeds dictionary lookup from the active card', async () => {
    const searchDictionary = vi.fn(async (query: string) => ({
      query,
      source: 'offline_dictionary' as const,
      results: [
        {
          id: 900,
          character: '日',
          romaji: 'にち',
          meaning: 'day',
          tags: ['offline_dictionary'],
          example_sentence: null,
        },
      ],
    }))

    window.jplearnDesktop = {
      ...baseDesktopApi,
      searchDictionary,
      getDeckCards: async (slug: string) => (
        slug.includes('kanji')
          ? { slug, name: 'Kanji Deck', cards: kanjiStudyPlanCards }
          : { slug: slug as any, name: 'Deck', cards: baseCards }
      ),
      getStudyQueue: async (slug: string) => (
        slug.includes('kanji')
          ? {
            ok: true,
            queue: {
              slug,
              card_ids: [kanjiStudyPlanCards[0].id],
              indices: [0],
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

    const typedTiles = await screen.findAllByRole('button', { name: /Typed Recall/i })
    clickTilePrimaryAction(typedTiles[0])

    fireEvent.click(await screen.findByRole('button', { name: /toggle hint/i }))

    const dictionaryButtons = screen.getAllByRole('button', { name: /open dictionary/i })
    fireEvent.click(dictionaryButtons[dictionaryButtons.length - 1])

    const searchInput = await screen.findByRole('searchbox', { name: /dictionary search/i }) as HTMLInputElement
    const seededQuery = searchInput.value
    expect(seededQuery.length).toBeGreaterThan(0)
    await waitFor(() => expect(searchDictionary).toHaveBeenCalledWith(seededQuery))
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
    clickTilePrimaryAction(strokeTiles[0])

    expect(await screen.findByText(/Type the romaji reading to see kanji options/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/Type romaji reading/i)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /toggle hint/i }))
    await waitFor(() => {
      const hintText = document.querySelector('.minigame-hint-popover-text')
      expect(hintText?.textContent).toContain('Type the reading, then select the matching kanji from the options')
    })

    fireEvent.change(screen.getByPlaceholderText(/Type romaji reading/i), { target: { value: 'nichi' } })
    const candidateList = await screen.findByLabelText(/kanji candidates/i)
    const candidateButtons = within(candidateList).getAllByRole('button')
    fireEvent.click(candidateButtons[0])

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({ minigame: 'stroke_order' }))
  })

  it('runs sentence assembly via bridge payload and records the sentence_assembly minigame', async () => {
    const grammarCards = [
      {
        id: 40,
        character: '私',
        romaji: 'watashi',
        meaning: 'I',
        tags: ['grammar_patterns'],
        example_sentence: '私 は 学生です。',
        dictionary_summary: null,
        is_leech: false,
        curriculum_stage: 1,
        meaning_distractor_ids: [41, 42, 43],
        character_distractor_ids: [41, 42, 43],
      },
      {
        id: 41,
        character: '彼',
        romaji: 'kare',
        meaning: 'he',
        tags: ['grammar_patterns'],
        example_sentence: '彼 は 学生です。',
        dictionary_summary: null,
        is_leech: false,
        curriculum_stage: 1,
        meaning_distractor_ids: [40, 42, 43],
        character_distractor_ids: [40, 42, 43],
      },
      {
        id: 42,
        character: '先生',
        romaji: 'sensei',
        meaning: 'teacher',
        tags: ['grammar_patterns'],
        example_sentence: '先生 は ここです。',
        dictionary_summary: null,
        is_leech: false,
        curriculum_stage: 1,
        meaning_distractor_ids: [40, 41, 43],
        character_distractor_ids: [40, 41, 43],
      },
      {
        id: 43,
        character: '友達',
        romaji: 'tomodachi',
        meaning: 'friend',
        tags: ['grammar_patterns'],
        example_sentence: '友達 は 元気です。',
        dictionary_summary: null,
        is_leech: false,
        curriculum_stage: 1,
        meaning_distractor_ids: [40, 41, 42],
        character_distractor_ids: [40, 41, 42],
      },
    ]

    const recordGameResult = vi.fn(async () => ({
      ok: true,
      card_id: 40,
      repetitions: 1,
      interval: 1,
      next_review: '2026-01-01',
      ease_factor: 2.5,
      curriculum_stage: 2,
    }))
    const getGrammarMinigameData = vi.fn(async () => ({
      ok: true,
      game_type: 'sentence_assembly' as const,
      sentence: '私は学生です。',
      seed: 0,
      data: {
        game_type: 'sentence_assembly',
        sentence: '私は学生です。',
        chunks: [
          { id: 'chunk-0', text: '私' },
          { id: 'chunk-1', text: 'は' },
          { id: 'chunk-2', text: '学生です。' },
        ],
        shuffled_chunks: [
          { id: 'chunk-0', text: '私' },
          { id: 'chunk-2', text: '学生です。' },
          { id: 'chunk-1', text: 'は' },
        ],
        answer_order: ['chunk-0', 'chunk-1', 'chunk-2'],
      },
    }))

    window.jplearnDesktop = {
      ...baseDesktopApi,
      recordGameResult,
      getGrammarMinigameData,
      getDeckCards: async (slug: string) => (
        slug === 'grammar_patterns'
          ? { slug, name: 'Grammar Deck', cards: grammarCards }
          : { slug: slug as any, name: 'Deck', cards: baseCards }
      ),
      getStudyQueue: async (slug: string) => (
        slug === 'grammar_patterns'
          ? {
            ok: true,
            queue: {
              slug,
              card_ids: grammarCards.map((card) => card.id),
              indices: grammarCards.map((_, index) => index),
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
    clickTopMenuCard('Grammar')

    const assemblyTiles = await screen.findAllByRole('button', { name: /Sentence Assembly/i })
    clickTilePrimaryAction(assemblyTiles[0])

    fireEvent.click(await screen.findByRole('button', { name: /move 学生です。 later/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit order/i }))

    await waitFor(() => expect(getGrammarMinigameData).toHaveBeenCalled())
    expect(getGrammarMinigameData).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'sentence_assembly',
    }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'sentence_assembly',
      curriculumStage: 1,
    }))
  })

  it('shows listening modes for hiragana and katakana tracks', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    // Hiragana: listening modes should appear
    clickTopMenuCard('Hiragana')
    await screen.findAllByText(/Romaji Sprint/i)
    expect((await screen.findAllByText(/Recognition/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Dictation/i)).length).toBeGreaterThan(0)

    cleanup()
    window.localStorage.clear()

    window.jplearnDesktop = baseDesktopApi
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    // Katakana: both listening modes must appear
    clickTopMenuCard('Katakana')
    expect((await screen.findAllByText(/Recognition/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Dictation/i)).length).toBeGreaterThan(0)
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

    const audioTiles = await screen.findAllByRole('button', { name: /Recognition/i })
    clickTilePrimaryAction(audioTiles[0])

    // Play audio prompt button must be present (it replaces the character display)
    await screen.findByRole('button', { name: /replay audio/i })

    // Reveal element must exist in blurred state (not yet revealed)
    const revealEl = document.querySelector('.game-listen-reveal')
    expect(revealEl).not.toBeNull()
    expect(revealEl?.classList.contains('is-revealed')).toBe(false)

    // Select the first option to submit an answer
    const optionGrid = document.querySelector('.option-grid')!
    const optionButtons = within(optionGrid as HTMLElement).getAllByRole('button')
    fireEvent.click(optionButtons[0])

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'listening_audio_first',
    }))

    // Character must be revealed after answering
    await waitFor(() => {
      const revealed = document.querySelector('.game-listen-reveal.is-revealed')
      expect(revealed).not.toBeNull()
      expect(revealed?.textContent).toMatch(/[あいうえ]/)
    })
  })

  it('dictation mode hides character prompt and records correct minigame key', async () => {
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
    clickTopMenuCard('Hiragana')

    const dictationTiles = await screen.findAllByRole('button', { name: /Dictation/i })
    clickTilePrimaryAction(dictationTiles[0])

    // Play audio prompt button must be present (it replaces the character display)
    await screen.findByRole('button', { name: /replay audio/i })

    // Reveal element must exist in blurred state (not yet revealed)
    const revealEl = document.querySelector('.game-listen-reveal')
    expect(revealEl).not.toBeNull()
    expect(revealEl?.classList.contains('is-revealed')).toBe(false)

    // Type the kana sequence in the text input (multi-character: あい for ai)
    const dictationInput = await screen.findByPlaceholderText(/auto-converts/i)
    fireEvent.input(dictationInput, { target: { value: 'あい' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'dictation',
    }))

    // Character must be revealed after answering
    await waitFor(() => {
      const revealed = document.querySelector('.game-listen-reveal.is-revealed')
      expect(revealed).not.toBeNull()
      expect(revealed?.textContent).toMatch(/[あいうえ]/)
    })
  })

  it('keeps locked listening cards non-interactive when voice runtime is unavailable', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getVoiceStatus: async () => ({
        available: false,
        modelReady: false,
        downloading: false,
        downloadProgress: 0,
        modelName: 'voicevox',
        lastError: 'Runtime offline',
      }),
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Hiragana')

    const lockedCassette = await screen.findByRole('button', { name: /recognition is locked/i })
    expect(lockedCassette.className).toContain('is-locked')

    // Dictation should also be locked when VOICEVOX is unavailable
    const lockedDictation = screen.getByRole('button', { name: /dictation is locked/i })
    expect(lockedDictation.className).toContain('is-locked')

    // Clicking a locked cassette must never start a session.
    fireEvent.click(lockedCassette)
    fireEvent.click(lockedCassette)
    expect(await screen.findByRole('heading', { name: /mini game map/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /recognition/i })).toBeNull()
  })

  it('keeps Speech Recall locked when no speech model is enabled', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getSetupSystemInfo: async () => ({
        totalRamGb: 16,
        gpuVramGb: null,
        models: [],
        recommendedTier: 'low',
        activeModelTier: null,
        activeEmbedderTier: null,
        activeEmbedderLabel: null,
        activeEmbedderInstalled: false,
        activeEmbedderEnabled: false,
        llamaCppInstalled: false,
        voiceInstalled: false,
        voiceModels: [],
        activeVoiceModel: null,
        fontsInstalled: false,
        dictionaryInstalled: false,
        llamaCppEstimatedDownloadMinutes: null,
        dictionaryEstimatedDownloadMinutes: null,
        speechModels: [],
        recommendedSpeechTier: 'fast' as const,
        activeSpeechModelTier: null,
        ocrModels: [],
        recommendedOcrTier: 'low',
        activeOcrModelTier: null,
        ocrInstalled: false,
        translationModels: [],
        recommendedTranslationTier: 'low',
        activeTranslationModelTier: null,
        translationInstalled: false,
        translationProfiles: [],
        activeTranslationProfileTier: null,
        isPackaged: false,
      } as any),
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Hiragana')

    const lockedCassette = await screen.findByRole('button', { name: /speech recall is locked/i })
    expect(lockedCassette.className).toContain('is-locked')

    // Clicking a locked cassette must never start a session.
    fireEvent.click(lockedCassette)
    fireEvent.click(lockedCassette)
    expect(await screen.findByRole('heading', { name: /mini game map/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /speech recall/i })).toBeNull()
  })

  it('keeps minigame controls available when reduced motion preference is enabled', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })

    try {
      window.jplearnDesktop = baseDesktopApi

      render(<App />)
      await screen.findByRole('button', { name: /open shortcuts/i })
      clickTopMenuCard('Hiragana')

      const cassettes = await screen.findAllByRole('button', { name: /focus |launch |is locked/i })
      expect(cassettes.length).toBeGreaterThan(0)

      // Verify the first non-locked cassette is enabled (no separate Launch button exists)
      const enabledCassette = cassettes.find((btn) => !(btn as HTMLButtonElement).disabled)
      expect(enabledCassette).toBeTruthy()
      expect((enabledCassette as HTMLButtonElement).disabled).toBe(false)
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})


