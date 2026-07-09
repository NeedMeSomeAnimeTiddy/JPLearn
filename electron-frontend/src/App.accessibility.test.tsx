/**
 * Automated accessibility checks using axe-core.
 * Covers the app in onboarding state and post-onboarding home state.
 * Zero violations is the pass threshold.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
// axe-core ships as a CJS export = module; Vite handles interop at runtime.
import axe from 'axe-core'
import App from './App'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence, style, className }: { sequence: (string | number)[]; style?: React.CSSProperties; className?: string }) => {
    const text = typeof sequence[0] === 'string' ? sequence[0] : ''
    return <span className={className} style={style}>{text}</span>
  },
}))

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

const emptyCurriculumStub = {
  particle_cloze: {
    mode: 'particle_cloze', script_tag: 'all', attempts: 0, accuracy: 0, accuracy_7d: 0,
    stage_distribution: { 1: 0, 2: 0, 3: 0 },
  },
  particle_cloze_by_script: {
    hiragana: { mode: 'particle_cloze', script_tag: 'hiragana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
    katakana: { mode: 'particle_cloze', script_tag: 'katakana', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
    kanji_n5: { mode: 'particle_cloze', script_tag: 'kanji_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
    vocab_n5: { mode: 'particle_cloze', script_tag: 'vocab_n5', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
    grammar_patterns: { mode: 'particle_cloze', script_tag: 'grammar_patterns', attempts: 0, accuracy: 0, accuracy_7d: 0, stage_distribution: { 1: 0, 2: 0, 3: 0 } },
  },
  imposter: {
    mode: 'imposter', script_tag: 'all', attempts: 0, accuracy: 0,
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
}

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
    curriculum: emptyCurriculumStub,
  }),
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
  recordGameResult: async () => ({
    ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5,
  }),
  startSessionGoal: async () => ({
    ok: true,
    goal: {
      session_id: 'test', target_items: 10, target_minutes: null,
      target_accuracy: null, started_at_utc: '2026-01-01T00:00:00+00:00',
    },
  }),
  getSessionSummary: async () => ({
    ok: true,
    summary: {
      session_id: 'test', target_items: 10, completed_items: 0,
      reviewed: 0, correct: 0, accuracy: 0, target_accuracy: null, goal_met: false,
    },
  }),
  applyExpertiseLevel: async (level: 'total_beginner' | 'know_hiragana' | 'know_kana' | 'jlpt_n5_foundation' | 'jlpt_n4_foundation' | 'jlpt_n3_foundation' | 'jlpt_n2_foundation' | 'jlpt_n1_foundation') => ({ ok: true, level, seeded_cards: 0, decks: [] as string[] }),
  resetStudyDb: async () => ({ ok: true }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
}

function formatViolations(violations: Array<{ id: string; description: string; nodes: unknown[] }>): string {
  return violations
    .map((v) => `  [${v.id}] ${v.description} (${v.nodes.length} node(s))`)
    .join('\n')
}

describe('Accessibility — zero axe violations', () => {
  it('onboarding view has no violations', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in onboarding view:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })

  it('home view has no violations', async () => {
    window.localStorage.setItem('onboarding_complete', 'true')
    window.jplearnDesktop = baseDesktopApi
    const { container } = render(<App />)
    await act(async () => {})
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    if (results.violations.length > 0) {
      throw new Error(`axe violations in home view:\n${formatViolations(results.violations)}`)
    }
    expect(results.violations).toHaveLength(0)
  })
})

