import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { baseDesktopApi } from '../test-fixtures/desktopApi'

// The titlebar was extracted from App.tsx in issue #69. The prop passing itself is
// mechanically generated and checked by tsc, but the handlers that were lifted out of
// inline JSX closures are hand-written bodies tsc cannot verify. The shortcut-menu
// tests in App.minigame.test.tsx already drive jumpToScriptHub* and toggleAllMapsFlyout;
// these cover the rest.

vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => (
    <span>{typeof sequence[0] === 'string' ? sequence[0] : ''}</span>
  ),
}))

vi.mock('../features/onboarding/useTypewriter', () => ({
  useTypewriter: (text: string, onComplete: () => void) => {
    onComplete()
    return text
  },
}))

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

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

async function openShortcutMenu(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  fireEvent.click(screen.getByRole('button', { name: /open shortcuts/i }))
}

describe('titlebar navigation handlers', () => {
  it('navigates to JLPT Prep and closes the shortcut menu', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openShortcutMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /jlpt prep/i }))

    // jumpToJlptPrep both switches the view and closes the menu — assert both halves.
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /jlpt prep/i })).toBeNull()
    })
    expect(document.querySelector('.view-shell')).toBeTruthy()
  })

  it('navigates to Passages and closes the shortcut menu', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openShortcutMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /^passages$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /^passages$/i })).toBeNull()
    })
  })

  it('expands and collapses the Developer Tools flyout', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openShortcutMenu()

    const devTools = screen.getByRole('menuitem', { name: /developer tools/i })
    expect(devTools.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(devTools)
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /developer tools/i }).getAttribute('aria-expanded'))
        .toBe('true')
    })

    // toggleDevToolsFlyout collapses from either the dev_tools or dev_checks state
    fireEvent.click(screen.getByRole('menuitem', { name: /developer tools/i }))
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /developer tools/i }).getAttribute('aria-expanded'))
        .toBe('false')
    })
  })

  it('opens the Run Checks submenu underneath Developer Tools', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openShortcutMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /developer tools/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /run checks/i }))

    // toggleDevChecksFlyout must keep Developer Tools open while revealing the children
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /developer tools/i }).getAttribute('aria-expanded'))
        .toBe('true')
    })
    expect(screen.getByRole('group', { name: /run checks/i })).toBeTruthy()
  })

  it('toggles the streak details popover', async () => {
    window.jplearnDesktop = baseDesktopApi
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })

    const streakChip = screen.getByRole('button', { name: /\d+ day streak/i })
    expect(streakChip.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(streakChip)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\d+ day streak/i }).getAttribute('aria-expanded'))
        .toBe('true')
    })

    // toggleStreakDetails is a plain inverting setter; clicking again must close it
    // rather than latch open.
    fireEvent.click(screen.getByRole('button', { name: /\d+ day streak/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\d+ day streak/i }).getAttribute('aria-expanded'))
        .toBe('false')
    })
  })
})
