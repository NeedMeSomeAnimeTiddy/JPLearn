/**
 * The Kanji and Vocabulary level bars (audit 3, F5).
 *
 * They read "0% of 0 cards" on every chip for as long as they existed: the per-level card lists
 * behind them had no setter. Each level's figure is now its deck's summed 0..4 counters over four
 * times its size, which the bridge's `level-progress` read reports per level slug.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { openDeck } from './test-entry'
import App from './App'
import { baseDesktopApi } from './test-fixtures/desktopApi'
import type { LevelProgressPayload } from './generated/types'

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

const level = (family: 'kanji' | 'vocab', lv: string, total: number, scoreSum: number) => ({
  family, level: lv, slug: `${family}_${lv}`, total, score_sum: scoreSum,
})

/* N5 kanji: 80 cards with 160 of 320 points = 50%. N4: 300 cards, 30 of 1,200 = 3% (2.5 rounds up). */
const PAYLOAD: LevelProgressPayload = {
  levels: [
    level('kanji', 'n5', 80, 160),
    level('kanji', 'n4', 300, 30),
    level('kanji', 'n3', 370, 0),
    level('kanji', 'n2', 370, 0),
    level('kanji', 'n1', 1200, 0),
    level('vocab', 'n5', 700, 700),
    level('vocab', 'n4', 600, 0),
    level('vocab', 'n3', 2000, 0),
    level('vocab', 'n2', 1800, 0),
    level('vocab', 'n1', 2900, 0),
  ],
}

function chipLabels(): string[] {
  return Array.from(document.querySelectorAll('.lvb-chip'))
    .map((chip) => chip.getAttribute('aria-label') ?? '')
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('the level bars', () => {
  it('reads the kanji levels from the summed counters, not 0% of 0 cards', async () => {
    const getLevelProgress = vi.fn(async () => PAYLOAD)
    window.jplearnDesktop = { ...baseDesktopApi, getLevelProgress } as unknown as typeof window.jplearnDesktop

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    await waitFor(() => expect(getLevelProgress).toHaveBeenCalled())
    openDeck('Kanji')

    await waitFor(() => expect(chipLabels()[0]).toBe('N5: 50% of 80 cards'))
    expect(chipLabels()).toEqual([
      'N5: 50% of 80 cards',
      'N4: 3% of 300 cards',
      'N3: 0% of 370 cards',
      'N2: 0% of 370 cards',
      'N1: 0% of 1,200 cards',
    ])
  })

  it('reads the vocabulary levels from their own family', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi, getLevelProgress: async () => PAYLOAD,
    } as unknown as typeof window.jplearnDesktop

    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    openDeck('Vocabulary')

    /* 700 of 2,800 points is 25% */
    await waitFor(() => expect(chipLabels()[0]).toBe('N5: 25% of 700 cards'))
    expect(chipLabels()[4]).toBe('N1: 0% of 2,900 cards')
  })
})
