import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { baseDesktopApi } from '../test-fixtures/desktopApi'

// The settings modal was extracted from App.tsx in issue #69. tsc proves every prop
// is present and correctly typed, but it cannot catch two same-typed props being
// transposed — a miswired setter still renders fine and fails silently. The System
// tab is already covered by the reset flow in App.minigame.test.tsx; these tests
// cover the Appearance and Assistant tabs by driving a control and asserting the
// change actually sticks.

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

vi.mock('../features/onboarding/components/WelcomeStep', () => ({
  WelcomeStep: ({ onReveal }: { onReveal: () => void }) => {
    setTimeout(() => onReveal(), 0)
    return <h1 className="obn-hero-title">Welcome to JPLearn</h1>
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

async function openSettings(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /open shortcuts/i })
  const settingsButtons = screen.getAllByRole('button', { name: /open settings/i })
  fireEvent.click(settingsButtons[settingsButtons.length - 1])
  await screen.findByRole('dialog', { name: /control panel/i })
}

describe('settings modal wiring', () => {
  it('toggles a control on the Appearance tab and keeps the new state', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openSettings()

    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }))
    // Sections render their children only when expanded.
    fireEvent.click(screen.getByRole('button', { name: /^Animations/ }))

    // Reduce motion starts disabled; its accessible name encodes the current state,
    // so a miswired setSettings would leave the name unchanged.
    const toggle = await screen.findByRole('button', { name: /reduce motion disabled/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(toggle)

    const enabled = await screen.findByRole('button', { name: /reduce motion enabled/i })
    expect(enabled.getAttribute('aria-pressed')).toBe('true')

    // and toggling back returns it, proving the setter is not write-once
    fireEvent.click(enabled)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reduce motion disabled/i }).getAttribute('aria-pressed'))
        .toBe('false')
    })
  })

  it('persists an Appearance change into the settings store', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openSettings()

    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Animations/ }))
    fireEvent.click(await screen.findByRole('button', { name: /reduce motion disabled/i }))

    await waitFor(() => {
      const raw = window.localStorage.getItem('jplearn-desktop-settings-v1')
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw as string).reducedMotion).toBe(true)
    })
  })

  it('renders the Assistant tab sections, so its feature-hook props arrived', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openSettings()

    fireEvent.click(screen.getByRole('tab', { name: /assistant/i }))

    // These sections are driven by the tutor/models/voice props; if any had been
    // dropped or miswired during extraction the tab would not render them.
    expect(await screen.findByRole('button', { name: /^Tutor Assistant/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Tutor models/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Offline Dictionary/ })).toBeTruthy()

    // This button's accessible name is derived from models.tutorInstallInfo, so its
    // presence proves the `models` prop arrived rather than just static copy rendering.
    expect(screen.getByRole('button', { name: /download offline dictionary/i })).toBeTruthy()
  })

  it('closes from the header button', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openSettings()

    fireEvent.click(screen.getByRole('button', { name: /close settings/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /control panel/i })).toBeNull()
    })
  })
})
