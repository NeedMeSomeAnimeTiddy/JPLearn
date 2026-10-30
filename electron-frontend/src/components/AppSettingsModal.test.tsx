import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { baseDesktopApi } from '../test-fixtures/desktopApi'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { getFocusableElements } from '../lib/focusTrap'

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

  it('shows the stored automatic update setting and saves a change as a boolean', async () => {
    const getConfigValue = vi.fn(async (key: string) => ({ ok: true, key, value: false }))
    const setConfigValue = vi.fn(async (key: string, value: unknown) => ({ ok: true, key, value }))
    window.jplearnDesktop = { ...baseDesktopApi, getConfigValue, setConfigValue } as unknown as typeof window.jplearnDesktop
    await openSettings()

    fireEvent.click(screen.getByRole('tab', { name: /system/i }))
    // Sections render their children only when expanded; Startup starts collapsed.
    fireEvent.click(screen.getByRole('button', { name: /^Startup/ }))

    // The stored value (off) replaces the on default once it loads.
    const off = await screen.findByRole('radio', { name: 'Check for updates automatically: Off' })
    await waitFor(() => expect(off.getAttribute('aria-checked')).toBe('true'))
    expect(getConfigValue).toHaveBeenCalledWith('autoUpdateEnabled')
    expect(screen.getByText('Only installed copies check. Turning this off stops checking straight away.')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Check for updates automatically: On' }))

    expect(setConfigValue).toHaveBeenCalledWith('autoUpdateEnabled', true)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Check for updates automatically: On' }).getAttribute('aria-checked'))
        .toBe('true')
    })
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

/* ── audit 17 ────────────────────────────────────────────────────────────────────────────────── */

const SMALL_MODEL = {
  tier: 'low', label: 'Small model', description: 'A small model', sizeMb: 900,
  installed: false, estimatedDownloadMinutes: 3,
}

function setupInfo(over: Record<string, unknown> = {}) {
  return async () => ({
    totalRamGb: 16, gpuVramGb: 8, models: [SMALL_MODEL], recommendedTier: 'low',
    llamaCppInstalled: true, fontsInstalled: true, dictionaryInstalled: false,
    ...over,
  })
}

function unhandledRejections(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = []
  const listener = (event: PromiseRejectionEvent) => { seen.push(event.reason) }
  window.addEventListener('unhandledrejection', listener)
  const onProcess = (reason: unknown) => { seen.push(reason) }
  process.on('unhandledRejection', onProcess)
  return {
    seen,
    stop: () => {
      window.removeEventListener('unhandledrejection', listener)
      process.off('unhandledRejection', onProcess)
    },
  }
}

describe('a Settings action that fails says so beside its control (F2)', () => {
  it('shows a failed model download in that model row, with the reason under it', async () => {
    const rejections = unhandledRejections()
    const downloadModel = vi.fn(async () => {
      throw new Error("Error invoking remote method 'setup:download-model': Error: Model download failed: getaddrinfo ENOTFOUND huggingface.co")
    })
    window.jplearnDesktop = { ...baseDesktopApi, getSetupSystemInfo: setupInfo(), downloadModel } as unknown as typeof window.jplearnDesktop
    await openSettings()
    fireEvent.click(screen.getByRole('tab', { name: /assistant/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Tutor models/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download Small model' }))

    const headline = await screen.findByText('DOWNLOAD FAILED. CHECK YOUR CONNECTION AND TRY AGAIN.')
    const row = headline.closest('.settings-failure')?.parentElement as HTMLElement
    expect(row.textContent).toContain('Small model')
    expect(row.textContent).toContain('Model download failed: getaddrinfo ENOTFOUND huggingface.co')
    expect(row.textContent).not.toContain('Error invoking remote method')
    expect(headline.closest('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
    await new Promise((resolve) => setTimeout(resolve, 0))
    rejections.stop()
    expect(rejections.seen).toEqual([])
  })

  it('clears a failure only when the same action is tried again', async () => {
    let attempt = 0
    const downloadModel = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('Model download failed: offline')
      return { ok: true }
    })
    window.jplearnDesktop = { ...baseDesktopApi, getSetupSystemInfo: setupInfo(), downloadModel } as unknown as typeof window.jplearnDesktop
    await openSettings()
    fireEvent.click(screen.getByRole('tab', { name: /assistant/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Tutor models/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download Small model' }))
    await screen.findByText('Model download failed: offline')
    fireEvent.click(screen.getByRole('button', { name: 'Download Small model' }))
    await waitFor(() => expect(screen.queryByText('Model download failed: offline')).toBeNull())
  })

  it('keeps a failed dictionary download in view with its section shut', async () => {
    const downloadDictionary = vi.fn(async () => { throw new Error('Dictionary download failed: socket hang up') })
    window.jplearnDesktop = { ...baseDesktopApi, getSetupSystemInfo: setupInfo(), downloadDictionary } as unknown as typeof window.jplearnDesktop
    await openSettings()
    fireEvent.click(screen.getByRole('tab', { name: /assistant/i }))
    const header = screen.getByRole('button', { name: /^Offline Dictionary/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(await screen.findByRole('button', { name: 'Download offline dictionary' }))
    expect(await screen.findByText('Dictionary download failed: socket hang up')).toBeTruthy()
    expect(screen.getByText('DOWNLOAD FAILED. CHECK YOUR CONNECTION AND TRY AGAIN.')).toBeTruthy()
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('says a scheduler reset failed and keeps saying the personalised weights are in use', async () => {
    const resetFSRSWeights = vi.fn(async () => { throw new Error('Failed to reset FSRS weights: database is locked') })
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getFSRSWeights: async () => ({ is_custom: true }),
      resetFSRSWeights,
    } as unknown as typeof window.jplearnDesktop
    await openSettings()
    fireEvent.click(screen.getByRole('tab', { name: /system/i }))
    fireEvent.click(screen.getByRole('button', { name: /^FSRS Optimization/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reset to default FSRS weights' }))
    expect(await screen.findByText("COULDN'T RESET THE SCHEDULER. TRY AGAIN.")).toBeTruthy()
    expect(screen.getByText('Failed to reset FSRS weights: database is locked')).toBeTruthy()
    expect(screen.getByText('Personalized weights are active based on your review patterns.')).toBeTruthy()
  })
})

describe('a preference shows its new value only once it is saved (F6)', () => {
  it('snaps back to the saved choice and says so when the save fails', async () => {
    const setConfigValue = vi.fn(async () => { throw new Error('EPERM: operation not permitted') })
    const getConfigValue = vi.fn(async (key: string) => ({ ok: true, key, value: key === 'closeBehavior' ? 'ask' : false }))
    window.jplearnDesktop = { ...baseDesktopApi, getConfigValue, setConfigValue } as unknown as typeof window.jplearnDesktop
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await openSettings()
    fireEvent.click(screen.getByRole('tab', { name: /system/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Window Close Behavior/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /^Quit:/ }))

    expect(await screen.findByText("COULDN'T SAVE THIS SETTING. TRY AGAIN.")).toBeTruthy()
    expect(screen.getByText('EPERM: operation not permitted')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Ask:/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /^Quit:/ }).getAttribute('aria-checked')).toBe('false')
    expect(setConfigValue).toHaveBeenCalledWith('closeBehavior', 'quit')
    warn.mockRestore()
  })

  it('shows the new value once the save has landed', async () => {
    let finish: () => void = () => {}
    const setConfigValue = vi.fn((key: string, value: unknown) => new Promise((resolve) => {
      finish = () => resolve({ ok: true, key, value })
    }))
    const getConfigValue = vi.fn(async (key: string) => ({ ok: true, key, value: false }))
    window.jplearnDesktop = { ...baseDesktopApi, getConfigValue, setConfigValue } as unknown as typeof window.jplearnDesktop
    await openSettings()
    fireEvent.click(screen.getByRole('tab', { name: /system/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Startup/ }))
    const on = await screen.findByRole('radio', { name: /^On: Start when you log in/ })
    fireEvent.click(on)
    expect(on.getAttribute('aria-checked')).toBe('false')
    finish()
    await waitFor(() => expect(screen.getByRole('radio', { name: /^On: Start when you log in/ }).getAttribute('aria-checked')).toBe('true'))
  })
})

describe('the Settings dialog takes, traps and returns focus (F3)', () => {
  async function openFromTitlebar() {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    const openers = screen.getAllByRole('button', { name: /open settings/i })
    const opener = openers[openers.length - 1]
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: /control panel/i })
    return { user, opener, dialog }
  }

  it('opens with focus on the tab you are on', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { dialog } = await openFromTitlebar()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: /appearance/i })))
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('wraps Tab and Shift+Tab inside the dialog, skipping the hidden tab panels', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { user, dialog } = await openFromTitlebar()
    const close = screen.getByRole('button', { name: /close settings/i })
    const reachable = getFocusableElements(dialog)
    expect(reachable[0]).toBe(close)
    for (const element of reachable) expect(element.closest('[hidden]')).toBeNull()

    close.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(reachable[reachable.length - 1])
    await user.tab()
    expect(document.activeElement).toBe(close)
    for (let i = 0; i < reachable.length + 2; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('names a real panel from every tab, and only the active one is shown', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openFromTitlebar()
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '')
      expect(panel?.getAttribute('role')).toBe('tabpanel')
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id)
      expect(panel?.hidden).toBe(tab.getAttribute('aria-selected') !== 'true')
    }
  })

  it('has no button that does nothing', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { user } = await openFromTitlebar()
    await user.click(screen.getByRole('tab', { name: /system/i }))
    for (const name of [/^Window Close Behavior/, /^Startup/, /^FSRS Optimization/]) {
      await user.click(screen.getByRole('button', { name }))
    }
    for (const name of ['Close behavior setting', 'Startup setting', 'FSRS optimization']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('gives focus back to what opened it when it closes', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { user, opener } = await openFromTitlebar()
    await user.click(screen.getByRole('button', { name: /close settings/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /control panel/i })).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('gives focus back on Escape too', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { user, opener } = await openFromTitlebar()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /control panel/i })).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('lets Close options over it own focus, and hands it back to Settings', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { user, dialog } = await openFromTitlebar()
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    const before = document.activeElement
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    const options = await screen.findByRole('dialog', { name: 'Close options' })
    await waitFor(() => expect(options.contains(document.activeElement)).toBe(true))
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(options.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Close options' })).toBeNull())
    expect(screen.getByRole('dialog', { name: /control panel/i })).toBeTruthy()
    expect(document.activeElement).toBe(before)
  })

  it('has no accessibility violations while open', async () => {
    window.jplearnDesktop = baseDesktopApi
    const { dialog } = await openFromTitlebar()
    const results = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

describe('Reset all progress clears the two screen marks (Q1)', () => {
  const OVERRIDES_KEY = 'jplearn-progression-overrides-v1'
  const UNLOCK_KEY = 'jplearn.menu.unlockSeen'

  async function resetAllProgress() {
    fireEvent.click(screen.getByRole('tab', { name: /system/i }))
    fireEvent.click(await screen.findByRole('button', { name: /data management/i }))
    fireEvent.click(await screen.findByRole('button', { name: /reset all progress/i }))
    fireEvent.click(await screen.findByRole('button', { name: /i understand/i }))
    fireEvent.click(await screen.findByRole('button', { name: /yes, delete everything/i }))
  }

  it('removes the open-anyway choices and the unlock mark', async () => {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(['kanji_n5']))
    window.localStorage.setItem(UNLOCK_KEY, '2026-09-01T12:00:00+00:00')
    const resetStudyDb = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = { ...baseDesktopApi, resetStudyDb } as unknown as typeof window.jplearnDesktop
    await openSettings()
    await resetAllProgress()
    await waitFor(() => expect(resetStudyDb).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.localStorage.getItem(OVERRIDES_KEY)).toBeNull())
    expect(window.localStorage.getItem(UNLOCK_KEY)).toBeNull()
  })

  it('still clears the live state when storage refuses every write after the database reset', async () => {
    const resetStudyDb = vi.fn(async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
      return { ok: true }
    })
    window.jplearnDesktop = { ...baseDesktopApi, resetStudyDb } as unknown as typeof window.jplearnDesktop
    await openSettings()
    await resetAllProgress()
    await waitFor(() => expect(resetStudyDb).toHaveBeenCalledTimes(1))
    /* the dialog closes and onboarding comes back, as after any reset; no reset error is raised */
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /control panel/i })).toBeNull())
    expect(await screen.findByRole('heading', { name: /Welcome to JPLearn/i })).toBeTruthy()
    expect(screen.queryByText(/QuotaExceededError|Unknown reset error/)).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('a storage write that is refused is not an app error (N2)', () => {
  it('still applies an appearance change to the page', async () => {
    window.jplearnDesktop = baseDesktopApi
    await openSettings()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Animations/ }))
    fireEvent.click(await screen.findByRole('button', { name: /reduce motion disabled/i }))
    await waitFor(() => expect(document.documentElement.dataset.reducedMotion).toBe('true'))
    expect(setItem).toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /control panel/i })).toBeTruthy()
    setItem.mockRestore()
  })
})

describe('Remember my choice (F6)', () => {
  it('saves the choice before it quits', async () => {
    let finishSave: () => void = () => {}
    const setConfigValue = vi.fn((key: string, value: unknown) => new Promise((resolve) => {
      finishSave = () => resolve({ ok: true, key, value })
    }))
    const quitApp = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getConfigValue: async (key: string) => ({ ok: true, key, value: key === 'closeBehavior' ? 'ask' : false }),
      setConfigValue,
      quitApp,
    } as unknown as typeof window.jplearnDesktop
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    await screen.findByRole('dialog', { name: 'Close options' })
    fireEvent.click(screen.getByRole('checkbox', { name: /remember my choice/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Quit/ }))

    await waitFor(() => expect(setConfigValue).toHaveBeenCalledWith('closeBehavior', 'quit'))
    expect(quitApp).not.toHaveBeenCalled()
    finishSave()
    await waitFor(() => expect(quitApp).toHaveBeenCalledTimes(1))
  })

  it('still quits when the save fails, and logs why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const quitApp = vi.fn(async () => ({ ok: true }))
    window.jplearnDesktop = {
      ...baseDesktopApi,
      getConfigValue: async (key: string) => ({ ok: true, key, value: key === 'closeBehavior' ? 'ask' : false }),
      setConfigValue: async () => { throw new Error('EPERM') },
      quitApp,
    } as unknown as typeof window.jplearnDesktop
    render(<App />)
    await screen.findByRole('button', { name: /open shortcuts/i })
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    await screen.findByRole('dialog', { name: 'Close options' })
    fireEvent.click(screen.getByRole('checkbox', { name: /remember my choice/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Quit/ }))
    await waitFor(() => expect(quitApp).toHaveBeenCalledTimes(1))
    expect(warn).toHaveBeenCalledWith('[settings] could not save closeBehavior:', expect.any(Error))
    warn.mockRestore()
  })
})
