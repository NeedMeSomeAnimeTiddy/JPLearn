import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'

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

const baseDesktopApi = {
  versions: { chrome: '0', electron: '0', node: '0' },
  getBlockProgress: async (slug: string) => ({ slug, blocks: [] }),
  getDeckCards: async () => ({ slug: 'hiragana' as const, name: 'Hiragana', cards: [] }),
  resetStudyDb: async () => ({ ok: true }),
  minimizeWindow: async () => ({ ok: true }),
  toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
  isWindowMaximized: async () => ({ isMaximized: false }),
  closeWindow: async () => ({ ok: true }),
}

describe('Overview activity panel', () => {
  it('shows empty-state message when there is no activity', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => ({
        decks: [],
        streak: { current_days: 0, best_days: 0 },
        activity: {
          week: { days: 7, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
          month: { days: 30, reviewed: 0, correct: 0, incorrect: 0, accuracy: 0, points_earned: 0, active_days: 0 },
        },
        mistakes: [],
        item_history: [],
      }),
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))

    expect(await screen.findByText(/No recent activity yet/i)).toBeTruthy()
  })

  it('renders 7-day and 30-day cards when activity exists', async () => {
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getStudySummary: async () => ({
        decks: [],
        streak: { current_days: 2, best_days: 5 },
        activity: {
          week: { days: 7, reviewed: 11, correct: 8, incorrect: 3, accuracy: 73, points_earned: 8, active_days: 4 },
          month: { days: 30, reviewed: 38, correct: 28, incorrect: 10, accuracy: 74, points_earned: 28, active_days: 12 },
        },
        mistakes: [],
        item_history: [],
      }),
    }

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /open study overview/i }))

    expect(await screen.findByText(/Last 7 Days/i)).toBeTruthy()
    expect(await screen.findByText(/Last 30 Days/i)).toBeTruthy()
    expect(await screen.findByText(/11/)).toBeTruthy()
    expect(await screen.findByText(/38/)).toBeTruthy()
  })
})
