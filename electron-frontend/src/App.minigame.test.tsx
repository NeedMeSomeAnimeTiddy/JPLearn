import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { openGame } from './test-entry'
import { PREFS_STORAGE_KEY } from './lib/appStorage'
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

vi.mock('./features/handwriting/components/HandwritingAnswerPanel', () => ({
  HandwritingAnswerPanel: ({ onComplete }: { onComplete: (outcome: { completed: boolean; mistakeCount: number; usedHint: boolean; usedAnimation: boolean; gaveUp: boolean }) => void }) => (
    <div>
      <button type="button" onClick={() => onComplete({ completed: true, mistakeCount: 0, usedHint: false, usedAnimation: false, gaveUp: false })}>
        Complete unassisted handwriting
      </button>
      <button type="button" onClick={() => onComplete({ completed: true, mistakeCount: 3, usedHint: true, usedAnimation: true, gaveUp: false })}>
        Complete handwriting after retries
      </button>
      <button type="button" onClick={() => onComplete({ completed: false, mistakeCount: 0, usedHint: false, usedAnimation: false, gaveUp: true })}>
        Give up handwriting
      </button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

/* THE TWO SURFACES THAT REPLACED THE SCRIPT HUB, for the tests that were about the hub itself
   rather than about a round. `openGame` is one drill on one deck through the titlebar's map tree;
   these two reach the other half -- the list of what a deck offers, and the road where a mode that
   cannot run says so. */

/** Every mode the titlebar's map tree lists under one deck. */
async function deckModes(label: string): Promise<string[]> {
  fireEvent.click(await screen.findByRole('button', { name: /open shortcuts/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /^All Maps/ }))
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${label} Map`, 'i') }))
  const tree = await screen.findByRole('group', { name: new RegExp(`^${label} minigames`, 'i') })
  return Array.from(tree.querySelectorAll('[role="menuitem"]'))
    .map((item) => item.textContent?.trim() ?? '')
    .filter((name) => name !== 'Open Map')
}

/** PRACTICE -> DRILLS: the road, which is where a mode is chosen and where a lock is drawn. */
async function openDrillsRoad(): Promise<void> {
  const root = () => document.querySelector('.mn-open') as Element
  await screen.findByRole('button', { name: /open shortcuts/i })
  await waitFor(() => expect(root()).not.toBeNull())
  fireEvent.keyDown(root(), { key: 'ArrowDown' })
  fireEvent.keyDown(root(), { key: 'ArrowDown' })
  fireEvent.keyDown(root(), { key: 'Enter' })
  await waitFor(() => expect(document.querySelectorAll('.pr-lane')).toHaveLength(3))
  fireEvent.click(document.querySelectorAll('.pr-lane')[1])
  await waitFor(() => expect(document.querySelector('.dr-run')).not.toBeNull())
}

/** Walk the catalogue to a named mode. Bounded: seventeen is the whole of it. */
function selectDrill(title: string): void {
  for (let step = 0; step < 20; step++) {
    if (document.querySelector('.dr-hen')?.textContent?.trim() === title) return
    fireEvent.keyDown(document.querySelector('.mn-open') as Element, { key: 'ArrowDown' })
  }
  throw new Error(`The list never reached ${title}. It stopped on `
    + `${document.querySelector('.dr-hen')?.textContent}`)
}

async function openHandwritingRound(): Promise<void> {
  render(<App />)
  await openGame('Hiragana', 'Handwriting')
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
].map((card) => ({
  ...card,
  note_key: `note:v1:builtin:${card.id.toString(16).padStart(64, '0')}`,
}))

const kanjiStudyPlanCards = [
  { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', dictionary_summary: { character: '日', reading: 'にち', primary_gloss: 'day', glosses: ['day', 'sun'], source: 'offline_dictionary', pitch_accents: [] }, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
  { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
].map((card) => ({
  ...card,
  note_key: `note:v1:builtin:${card.id.toString(16).padStart(64, '0')}`,
}))

const vocabStudyPlanCards = [
  { id: 20, character: '予定', romaji: 'yotei', meaning: 'schedule', tags: ['vocab', 'n5'], example_sentence: '予定 を たてます。', dictionary_summary: { character: '予定', reading: 'よてい', primary_gloss: 'schedule', glosses: ['schedule', 'plan'], source: 'offline_dictionary', pitch_accents: [] }, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [21], character_distractor_ids: [21] },
  { id: 21, character: '計画', romaji: 'keikaku', meaning: 'plan', tags: ['vocab', 'n5'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [20], character_distractor_ids: [20] },
].map((card) => ({
  ...card,
  note_key: `note:v1:builtin:${card.id.toString(16).padStart(64, '0')}`,
}))

const CARD_SCORES_STORAGE_KEY = 'jplearn-card-scores-v2'

const kanjiStrokeCards = [
  { id: 10, character: '日', romaji: 'nichi', meaning: 'day', tags: ['kanji', 'n5'], example_sentence: '日 を つかいます。', dictionary_summary: { character: '日', reading: 'にち', primary_gloss: 'day', glosses: ['day', 'sun'], source: 'offline_dictionary', pitch_accents: [] }, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [11], character_distractor_ids: [11] },
  { id: 11, character: '月', romaji: 'getsu', meaning: 'month', tags: ['kanji', 'n5'], example_sentence: null, dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [10], character_distractor_ids: [10] },
].map((card) => ({
  ...card,
  note_key: `note:v1:builtin:${card.id.toString(16).padStart(64, '0')}`,
}))

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
      buckets_due: 0,
      buckets_leech: 0,
      buckets_new: 0,
      buckets_review: 0,
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
    // The "Up next" block is the Python engine's output now, not derived from
    // the summary — see domain/study_route.py. A fixture that omits this
    // renders no block at all.
    getRecommendations: async () => ({
      recommendations: [
        {
          node_id: 'vocabulary_n5',
          display_label: 'Start studying Vocabulary',
          review_count: 15,
          difficulty: 'normal',
          reason: 'new_content_ready',
          priority: 1,
          section: 'vocab_n5',
          minigame: 'meaning_match',
          section_label: 'Vocabulary',
          leech_focus_enabled: null,
        },
      ],
      learner_stage: 'starter',
      stage_label: 'Starter-safe',
      session_minutes: 10,
      session_note: 'Start with Vocabulary and move on once it feels steady.',
    }),
    getStudySummary: async () => ({
      decks: [],
      streak: { current_days: 0, best_days: 0, freezes_available: 0 },
      activity: {
        week: { days: 7, reviewed: 2, correct: 2, incorrect: 0, accuracy: 100, points_earned: 2, active_days: 1 },
        month: { days: 30, reviewed: 4, correct: 4, incorrect: 0, accuracy: 100, points_earned: 4, active_days: 2 },
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

/* WHICH MODES A DECK OFFERS, asked of the surface that still lists them.
   These four read the script hub's cassette shelf. The hub is gone, and the titlebar's map tree is
   now the one place in the app that names every mode of every deck -- the drills road draws the
   same set, but folds what a deck does not offer to width zero rather than removing it, so a text
   query there would find a stone that is not on the road. */
describe('what each deck offers', () => {
  it('includes the grammar-shaped modes on the alphabet tracks', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    const modes = await deckModes('Hiragana')

    for (const name of ['Romaji Sprint', 'Meaning Match', 'Character Match', 'Sentence Assembly',
      'Particle Cloze', 'Imposter', 'Interleave Mix']) {
      expect(modes).toContain(name)
    }
  })

  it('drops romaji sprint from the words track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    const modes = await deckModes('Vocabulary')

    expect(modes).toEqual(expect.arrayContaining(['Particle Cloze', 'Imposter', 'Interleave Mix']))
    expect(modes).not.toContain('Romaji Sprint')
  })

  it('offers dictation on the words track', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    expect(await deckModes('Vocabulary')).toContain('Dictation')
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
    await waitFor(() => expect(document.querySelector('.rd-slips')).not.toBeNull())

    expect(screen.queryByRole('button', { name: /^(play|launch)$/i })).toBeNull()
    expect(screen.queryByText(/Session Report/i)).toBeNull()
  })

  it('uses the backend-ranked study queue for the first launched minigame card', async () => {
    const getStudyQueue = vi.fn(async (slug: string) => ({
      ok: true,
      queue: {
        slug,
        card_ids: [3, 2, 1, 0],
        indices: [3, 2, 1, 0],
        buckets_due: 1,
        buckets_leech: 0,
        buckets_new: 0,
        buckets_review: 3,
      },
    }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudyQueue,
    }

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    fireEvent.click(screen.getByRole('button', { name: /open shortcuts/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /all maps/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /vocabulary map/i }))
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      fireEvent.click(screen.getByRole('menuitem', { name: /typed recall/i }))
      await waitFor(() => {
        expect(document.querySelector('.rd-focus')?.textContent).toBe('え')
      })
    } finally {
      randomSpy.mockRestore()
    }

    // The JLPT level deck, not a category. Since issue #78 the categories are
    // blocks over this deck, and a selection can hold blocks no category covers —
    // queueing a category slug would rank a narrower pool than the one on screen.
    expect(getStudyQueue).toHaveBeenCalledWith('vocab_n5')
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

    /* CONFIDENCE CAPTURE IS A PERSISTED PREFERENCE, and its switch moved with the other three from
       the script hub to the drills road (`L3.test.tsx` pins the switch itself). This test is about
       what reaches the record payload, so it starts from the pref rather than walking two screens
       to set it. */
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ confidenceCaptureEnabled: true }))

    render(<App />)
    await openGame('Vocabulary', 'Typed Recall')

    const typedInput = await screen.findByPlaceholderText(/Type the meaning/i)
    fireEvent.click(screen.getByRole('button', { name: /confidence high/i }))
    fireEvent.change(typedInput, { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'typed_recall',
      confidenceScore: 5,
    }))
  })

  it("the menu's hero runs the drill it names, rather than opening a section", async () => {
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

    /* THE CARD NAMES THE DRILL AND SAYS WHAT PRESSING IT DOES. `HomeView`'s "Up next" row was the
       only thing in the app that launched the engine's own choice, and it retired with the toggle
       -- which left this card reading REVIEW THESE over a named drill and then dropping the learner
       at a section to pick one for themselves. */
    const hero = await screen.findByRole('button', { name: /UP NEXT/i })
    expect(hero.textContent).toContain('Meaning Match')
    expect(hero.textContent).toMatch(/REVIEW THESE|START THIS/)
    fireEvent.click(hero)

    /* AND NOW IT ACTUALLY DOES IT. Until the script hub was retired this press landed on the hub,
       which drew the deck's seventeen cassettes and asked the learner to choose one -- so the card
       promised a named drill and delivered a menu. It runs the drill. */
    await waitFor(() => expect(document.querySelector('.rd-sheet')).not.toBeNull())
    expect(document.body.textContent).toContain('Meaning Match')
  })

  it('drops romaji sprint from the grammar track too', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    const modes = await deckModes('Grammar')

    expect(modes).toEqual(expect.arrayContaining(['Particle Cloze', 'Imposter', 'Interleave Mix']))
    expect(modes).not.toContain('Romaji Sprint')
  })

  it('plays both target words and example sentence in grammar rounds', async () => {
    const conversationalCards = [
      { id: 30, character: 'です', romaji: 'desu', meaning: 'to be', tags: ['grammar_patterns'], example_sentence: 'これは ほん です。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [31, 32, 33], character_distractor_ids: [31, 32, 33] },
      { id: 31, character: 'ます', romaji: 'masu', meaning: 'polite verb ending', tags: ['grammar_patterns'], example_sentence: 'べんきょう します。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 32, 33], character_distractor_ids: [30, 32, 33] },
      { id: 32, character: 'から', romaji: 'kara', meaning: 'because', tags: ['grammar_patterns'], example_sentence: 'あめ です から。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 31, 33], character_distractor_ids: [30, 31, 33] },
      { id: 33, character: 'けど', romaji: 'kedo', meaning: 'but', tags: ['grammar_patterns'], example_sentence: 'いきたい けど、いけません。', dictionary_summary: null, is_leech: false, curriculum_stage: 1, meaning_distractor_ids: [30, 31, 32], character_distractor_ids: [30, 31, 32] },
    ].map((card) => ({
      ...card,
      note_key: `note:v1:builtin:${card.id.toString(16).padStart(64, '0')}`,
    }))
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
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
          : {
            ok: true,
            queue: {
              slug,
              card_ids: baseCards.map((card) => card.id),
              indices: baseCards.map((_, index) => index),
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
      ),
    }

    render(<App />)
    await openGame('Grammar', 'Typed Recall')

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
    await openGame('Vocabulary', 'Particle Cloze')

    // Wait for the round to render, then check .rd-focus text
    await waitFor(() => {
      const promptMain = document.querySelector('.rd-focus')
      expect(promptMain?.textContent).toMatch(/[あいうえ]/)
    })
    fireEvent.click(await screen.findByRole('button', { name: /toggle hint/i }))
    await screen.findByText((content) => content.includes('あさです') || content.includes('いまです') || content.includes('うみです') || content.includes('えきです'))
  })

  it('renders imposter passages in words track using example sentences', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    await openGame('Vocabulary', 'Imposter')

    await waitFor(() => {
      const storyPassage = document.querySelector('.rd-focus')
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
          ? { ok: true, queue: { slug, card_ids: kanjiStudyPlanCards.map((card) => card.id), indices: kanjiStudyPlanCards.map((_, index) => index), buckets_due: 0, buckets_leech: 0, buckets_new: 0, buckets_review: 0 } }
          : { ok: true, queue: { slug, card_ids: baseCards.map((card) => card.id), indices: baseCards.map((_, index) => index), buckets_due: 0, buckets_leech: 0, buckets_new: 0, buckets_review: 0 } }
      ),
    }

    render(<App />)
    await openGame('Kanji', 'Character Match')

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
          source_id: 'test-entry',
          note_key: 'note:v1:offline_dictionary:jmdict:test-entry',
          character: '日',
          romaji: 'にち',
          meaning: 'day',
          tags: ['offline_dictionary'],
          example_sentence: null,
          pitch_accents: [],
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
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
          : {
            ok: true,
            queue: {
              slug,
              card_ids: baseCards.map((card) => card.id),
              indices: baseCards.map((_, index) => index),
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
      ),
    }

    render(<App />)
    await openGame('Kanji', 'Typed Recall')

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
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
          : {
            ok: true,
            queue: {
              slug,
              card_ids: baseCards.map((card) => card.id),
              indices: baseCards.map((_, index) => index),
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
      ),
    }

    render(<App />)
    await openGame('Kanji', 'Stroke Order')

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

  it('records an unassisted handwriting completion as correct and keeps the feedback aligned', async () => {
    const recordGameResult = vi.fn(async () => ({ ok: true, card_id: 0, repetitions: 1, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult }

    await openHandwritingRound()
    expect(document.querySelector('.minigame-response-copy')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: /complete unassisted handwriting/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'handwriting',
      isCorrect: true,
    })))
    expect(screen.getByText(/stroke order complete/i)).toBeTruthy()
    expect(screen.getByText(/your answer/i)).toBeTruthy()
    expect(screen.getByText(/the answer/i)).toBeTruthy()
    const completedAnswerValues = Array.from(document.querySelectorAll('.rd-verdict-answers b')).map((value) => value.textContent)
    expect(completedAnswerValues).toHaveLength(2)
    expect(completedAnswerValues[0]).toBe(completedAnswerValues[1])
  })

  it('records a completed handwriting round with retries and assistance as correct', async () => {
    const recordGameResult = vi.fn(async () => ({ ok: true, card_id: 0, repetitions: 1, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult }

    await openHandwritingRound()
    fireEvent.click(await screen.findByRole('button', { name: /complete handwriting after retries/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'handwriting',
      isCorrect: true,
    })))
    expect(screen.getByText(/stroke order complete/i)).toBeTruthy()
    expect(screen.queryByText(/stroke-order animation|rejected strokes|guide hint/i)).toBeNull()
    const retryAnswerValues = Array.from(document.querySelectorAll('.rd-verdict-answers b')).map((value) => value.textContent)
    expect(retryAnswerValues).toHaveLength(2)
    expect(retryAnswerValues[0]).toBe(retryAnswerValues[1])
  })

  it('records a given-up handwriting round as incomplete and incorrect', async () => {
    const recordGameResult = vi.fn(async () => ({ ok: true, card_id: 0, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }))
    window.jplearnDesktop = { ...baseDesktopApi, recordGameResult }

    await openHandwritingRound()
    fireEvent.click(await screen.findByRole('button', { name: /give up handwriting/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'handwriting',
      isCorrect: false,
    })))
    expect(screen.getByText(/character not completed/i)).toBeTruthy()
    expect(Array.from(document.querySelectorAll('.rd-verdict-answers b')).map((value) => value.textContent)[0]).toBe('Not completed')
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
    ].map((card) => ({
      ...card,
      note_key: `note:v1:builtin:${card.id.toString(16).padStart(64, '0')}`,
    }))

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
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
          : {
            ok: true,
            queue: {
              slug,
              card_ids: baseCards.map((card) => card.id),
              indices: baseCards.map((_, index) => index),
              buckets_due: 0,
              buckets_leech: 0,
              buckets_new: 0,
              buckets_review: 0,
            },
          }
      ),
    }

    render(<App />)
    await openGame('Grammar', 'Sentence Assembly')

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

  it('offers both listening modes on both alphabet tracks', async () => {
    window.jplearnDesktop = baseDesktopApi

    render(<App />)
    const hiragana = await deckModes('Hiragana')
    expect(hiragana).toEqual(expect.arrayContaining(['Recognition', 'Dictation']))

    cleanup()
    window.localStorage.clear()
    /* this test re-renders App mid-way, and the clear above took the front-door flag with it */

    window.jplearnDesktop = baseDesktopApi
    render(<App />)
    const katakana = await deckModes('Katakana')
    expect(katakana).toEqual(expect.arrayContaining(['Recognition', 'Dictation']))
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
    await openGame('Vocabulary', 'Recognition')

    // Play audio prompt button must be present (it replaces the character display)
    await screen.findByRole('button', { name: /replay audio/i })

    // Reveal element must exist in blurred state (not yet revealed)
    const revealEl = document.querySelector('.rd-focus')
    expect(revealEl).not.toBeNull()
    expect(revealEl?.classList.contains('is-hidden')).toBe(true)

    // Select the first option to submit an answer
    const optionGrid = document.querySelector('.rd-slips')!
    const optionButtons = within(optionGrid as HTMLElement).getAllByRole('button')
    fireEvent.click(optionButtons[0])

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'listening_audio_first',
    }))

    /* and it stops being hidden once the answer is in — the reveal is the class coming OFF now,
       which is the same state change read the other way round */
    await waitFor(() => {
      const revealed = document.querySelector('.rd-focus')
      expect(revealed?.classList.contains('is-hidden')).toBe(false)
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
    await openGame('Hiragana', 'Dictation')

    // Play audio prompt button must be present (it replaces the character display)
    await screen.findByRole('button', { name: /replay audio/i })

    // Reveal element must exist in blurred state (not yet revealed)
    const revealEl = document.querySelector('.rd-focus')
    expect(revealEl).not.toBeNull()
    expect(revealEl?.classList.contains('is-hidden')).toBe(true)

    // Type the kana sequence in the text input (multi-character: あい for ai)
    const dictationInput = await screen.findByPlaceholderText(/becomes kana/i)
    fireEvent.input(dictationInput, { target: { value: 'あい' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }))

    await waitFor(() => expect(recordGameResult).toHaveBeenCalled())
    expect(recordGameResult).toHaveBeenCalledWith(expect.objectContaining({
      minigame: 'dictation',
    }))

    /* and it stops being hidden once the answer is in — the reveal is the class coming OFF now,
       which is the same state change read the other way round */
    await waitFor(() => {
      const revealed = document.querySelector('.rd-focus')
      expect(revealed?.classList.contains('is-hidden')).toBe(false)
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
    await openDrillsRoad()

    /* both audio modes carry the runtime's own words, not a generic "locked" */
    selectDrill('Recognition')
    expect(document.querySelector('.dr-slab')?.className).toContain('shut')
    expect(document.querySelector('.dr-slab')?.textContent)
      .toContain('VOICEVOX RUNTIME IS NOT RUNNING')

    selectDrill('Dictation')
    expect(document.querySelector('.dr-slab')?.className).toContain('shut')

    // and the press is refused rather than starting a round that has no audio to play
    fireEvent.click(document.querySelector('.dr-slab') as Element)
    expect(document.querySelector('.rd-sheet')).toBeNull()
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
    await openDrillsRoad()
    selectDrill('Speech Recall')

    expect(document.querySelector('.dr-slab')?.className).toContain('shut')
    expect(document.querySelector('.dr-slab')?.textContent).toContain('SPEECH RECOGNITION MODEL')

    fireEvent.click(document.querySelector('.dr-slab') as Element)
    expect(document.querySelector('.rd-sheet')).toBeNull()
  })

  it('keeps the drills road walkable when reduced motion is on', async () => {
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
      await openDrillsRoad()

      /* the rows are skewed and the selected one overhangs its column; with animation off it
         still has to be a list you can walk and a slab you can press */
      expect(document.querySelectorAll('.dr-mode').length).toBeGreaterThan(0)
      const slab = document.querySelector('.dr-slab') as HTMLButtonElement
      expect(slab).not.toBeNull()
      expect(slab.disabled).toBe(false)
      selectDrill('Meaning Match')
      expect(document.querySelector('.dr-hen')?.textContent).toBe('Meaning Match')
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})


