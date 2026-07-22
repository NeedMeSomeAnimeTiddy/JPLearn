/**
 * Characterization tests for the study-session state machine that App.tsx owns:
 * lives, combo/points, streak and per-session totals.
 *
 * Written BEFORE the issue #69 Phase 4 extraction of `features/study-session/`,
 * deliberately: these behaviours live in submitAnswer and are the ones that break
 * silently when state moves. MinigameView.test.tsx hand-builds a SessionContextValue,
 * so it covers the view's rendering but not this logic. These drive the real App.
 *
 * They assert current behaviour, not desired behaviour — if a change here fails,
 * the extraction changed semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { POINT_COMBO_THRESHOLDS } from './constants'

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => (
    <span>{typeof sequence[0] === 'string' ? sequence[0] : ''}</span>
  ),
}))

vi.mock('./features/onboarding/useTypewriter', () => ({
  useTypewriter: (text: string, onComplete: () => void) => {
    onComplete()
    return text
  },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class MockObserver {
  constructor(_c?: unknown) {}
  disconnect(): void {}
  observe(_t?: Element): void {}
  unobserve(_t?: Element): void {}
  takeRecords(): [] { return [] }
}
Object.defineProperty(window, 'IntersectionObserver', { writable: true, value: MockObserver })
Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: MockObserver })
Object.defineProperty(window, 'ResizeObserver', { writable: true, value: MockObserver })
Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: MockObserver })
if (!Element.prototype.scrollBy) {
  Element.prototype.scrollBy = function scrollBy() {}
}

// Four hiragana cards, each other card acting as the distractor pool, so that
// meaning_match always has four options and one unambiguous correct answer.
const cards = [
  { id: 0, character: 'あ', romaji: 'a', meaning: 'a-meaning' },
  { id: 1, character: 'い', romaji: 'i', meaning: 'i-meaning' },
  { id: 2, character: 'う', romaji: 'u', meaning: 'u-meaning' },
  { id: 3, character: 'え', romaji: 'e', meaning: 'e-meaning' },
].map((c) => ({
  ...c,
  tags: ['hiragana'],
  example_sentence: null,
  dictionary_summary: null,
  is_leech: false,
  curriculum_stage: 1,
  meaning_distractor_ids: [0, 1, 2, 3].filter((i) => i !== c.id),
  character_distractor_ids: [0, 1, 2, 3].filter((i) => i !== c.id),
  note_key: `note:v1:builtin:${c.id.toString(16).padStart(64, '0')}`,
}))

const emptyActivity = {
  days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0,
}

function makeApi() {
  return {
    versions: { chrome: '0', electron: '0', node: '0' },
    getStudySummary: async () => ({
      decks: [], streak: { current_days: 0, best_days: 0, freezes_available: 0 },
      activity: { week: emptyActivity, month: { ...emptyActivity, days: 30 } },
      mistakes: [], minigame_performance: [], session_history: [], item_history: [],
      generated_at: '2026-01-01T00:00:00+00:00',
    }),
    getDeckCards: async () => ({ cards }),
    getBlockProgress: async () => ({ blocks: [] }),
    getStudyQueue: async () => ({ items: [] }),
    getOverviewCharacterMastery: async () => ({
      blocks: { hiragana: [], katakana: [] },
      category_blocks: { vocab_n5: [], grammar_patterns: [] },
      kanji_cards: [],
    }),
    recordGameResult: async () => ({
      ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5,
    }),
    startSessionGoal: async () => ({
      ok: true,
      goal: {
        session_id: 'test-session', target_items: 10, target_minutes: null,
        target_accuracy: null, started_at_utc: '2026-01-01T00:00:00+00:00',
      },
    }),
    getSessionSummary: async () => ({
      ok: true,
      summary: {
        session_id: 'test-session', target_items: 10, completed_items: 0,
        reviewed: 0, correct: 0, accuracy: 0, target_accuracy: null, goal_met: false,
      },
    }),
    notifyStartupReady: async () => ({ ok: true }),
    setStartupTheme: async () => ({ ok: true, theme: 'lofi_dusk' }),
    getCardNote: async () => ({ note: null }),
  } as unknown as typeof window.jplearnDesktop
}

beforeEach(() => {
  window.localStorage.clear()
  window.jplearnDesktop = makeApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// The cassette carousel needs two clicks: the first focuses the cassette, the
// second launches it. Mirrors the helpers in App.minigame.test.tsx.
function clickTopMenuCard(label: string): void {
  const menuCards = Array.from(document.querySelectorAll('.cassette')) as HTMLButtonElement[]
  const button = menuCards.find(
    (card) => card.querySelector('.cassette-title')?.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )
  if (!button) throw new Error(`Top menu card not found for ${label}`)
  fireEvent.click(button)
  fireEvent.click(button)
}

function clickTilePrimaryAction(tileButton: HTMLElement): void {
  const cassette = (tileButton.closest('.cassette') ?? tileButton) as HTMLElement
  fireEvent.click(cassette)
  fireEvent.click(cassette)
}

/** Reads the "<correct>/<rounds>" HUD stat. */
function readScore(): { correct: number; rounds: number } | null {
  const stats = Array.from(document.querySelectorAll('.game-hud-stat'))
  for (const s of stats) {
    const m = (s.textContent ?? '').match(/^(\d+)\/(\d+)$/)
    if (m) return { correct: Number(m[1]), rounds: Number(m[2]) }
  }
  return null
}

function readPoints(): number {
  const stat = Array.from(document.querySelectorAll('.game-hud-stat'))
    .find((s) => (s.textContent ?? '').includes('pts'))
  return Number((stat?.textContent ?? '').match(/(\d+)/)?.[1] ?? 0)
}

function livesRemaining(): number {
  return document.querySelectorAll('.life-heart.is-active').length
}

/**
 * Reads the current round synchronously. Returns null unless the prompt and the
 * rendered options are mutually consistent — they re-render independently between
 * rounds, so a split read can pair a stale prompt with fresh options.
 */
function readRound(): { expected: string; options: HTMLButtonElement[] } | null {
  const options = Array.from(document.querySelectorAll('.option-button')) as HTMLButtonElement[]
  if (options.length === 0) return null

  const promptEl = Array.from(document.querySelectorAll('span, div, p, h1, h2'))
    .find((el) => /^[あいうえ]$/.test((el.textContent ?? '').trim()))
  const expected = cards.find((c) => c.character === (promptEl?.textContent ?? '').trim())?.meaning
  if (!expected) return null

  // Only consider the round ready once the options actually belong to this prompt.
  if (!options.some((o) => (o.textContent ?? '').trim() === expected)) return null
  return { expected, options }
}

/** Answers the current meaning_match round; `correct` picks the matching option. */
async function answerRound(correct: boolean): Promise<void> {
  const roundsBefore = readScore()?.rounds ?? 0

  await waitFor(() => expect(readRound()).not.toBeNull(), { timeout: 4000 })

  // Re-read after the wait settles: elements captured inside waitFor can be
  // detached by a later re-render, and clicking a detached node does nothing.
  const round = readRound()
  if (!round) throw new Error('round became unreadable after settling')
  const target = correct
    ? round.options.find((o) => (o.textContent ?? '').trim() === round.expected)
    : round.options.find((o) => (o.textContent ?? '').trim() !== round.expected)
  if (!target) throw new Error(`no ${correct ? 'correct' : 'incorrect'} option available`)

  fireEvent.click(target)
  await waitFor(() => expect(readScore()?.rounds).toBe(roundsBefore + 1), { timeout: 4000 })

  // The round then holds on a feedback card until the learner continues; advance
  // it so the next call sees a fresh round rather than the feedback state.
  const next = screen.queryByRole('button', { name: /continue immediately/i })
  if (next && !next.disabled) {
    fireEvent.click(next)
  }
}

async function startMeaningMatch(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  clickTopMenuCard('Hiragana')
  const tiles = await screen.findAllByRole('button', { name: /Meaning Match/i })
  clickTilePrimaryAction(tiles[0])
  await waitFor(() => expect(readScore()).not.toBeNull())
}

describe('session scoring state machine', () => {
  it('counts a correct answer toward both score and round total', async () => {
    await startMeaningMatch()
    expect(readScore()).toEqual({ correct: 0, rounds: 0 })

    await answerRound(true)

    await waitFor(() => expect(readScore()).toEqual({ correct: 1, rounds: 1 }))
  })

  it('counts a wrong answer as a round but not a score', async () => {
    await startMeaningMatch()

    await answerRound(false)

    await waitFor(() => expect(readScore()).toEqual({ correct: 0, rounds: 1 }))
  })

  it('awards one point for a correct answer below the first combo threshold', async () => {
    await startMeaningMatch()
    expect(readPoints()).toBe(0)

    await answerRound(true)

    // calculateAwardedPoints(1) === 1 while the streak is under POINT_COMBO_THRESHOLDS[0]
    await waitFor(() => expect(readPoints()).toBe(1))
    expect(POINT_COMBO_THRESHOLDS[0]).toBeGreaterThan(1)
  })

  it('resets the streak on a wrong answer but keeps points already earned', async () => {
    await startMeaningMatch()

    await answerRound(true)
    await waitFor(() => expect(readPoints()).toBe(1))

    await answerRound(false)

    await waitFor(() => expect(readScore()).toEqual({ correct: 1, rounds: 2 }))
    // points are cumulative — a miss must not claw back the earned point
    expect(readPoints()).toBe(1)
  })
})

describe('lives mode', () => {
  async function startWithLives(): Promise<void> {
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    clickTopMenuCard('Hiragana')
    fireEvent.click(await screen.findByRole('button', { name: /lives mode off/i }))
    await screen.findByRole('button', { name: /lives mode on/i })
    const tiles = await screen.findAllByRole('button', { name: /Meaning Match/i })
    clickTilePrimaryAction(tiles[0])
    await waitFor(() => expect(readScore()).not.toBeNull())
  }

  it('starts a lives run with a full set of hearts', async () => {
    await startWithLives()
    expect(livesRemaining()).toBe(3)
  })

  it('loses a heart on a wrong answer and keeps them on a correct one', async () => {
    await startWithLives()

    await answerRound(false)
    await waitFor(() => expect(livesRemaining()).toBe(2))

    await answerRound(true)
    await waitFor(() => expect(readScore()?.rounds).toBe(2))
    expect(livesRemaining()).toBe(2)
  })
})

