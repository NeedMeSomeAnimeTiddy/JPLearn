import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SetupWizard } from './SetupWizard'

function installApi(skipSetup: () => Promise<unknown>) {
  window.jplearnDesktop = {
    skipSetup: vi.fn(skipSetup),
    minimizeWindow: async () => ({ ok: true }),
    toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
    closeWindow: async () => ({ ok: true }),
  } as unknown as Window['jplearnDesktop']
  return window.jplearnDesktop.skipSetup as unknown as ReturnType<typeof vi.fn>
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/* audit 11, F2: a rejected skip used to be dropped, so the wizard's buttons did nothing and said
   nothing. It says why now, and the same button tries again. */
describe('SetupWizard: leaving the wizard', () => {
  it('shows why Skip setup failed, stays open, and leaves on a retry that works', async () => {
    let attempt = 0
    const skipSetup = installApi(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('Python bridge exited')
      return { ok: true }
    })
    const onComplete = vi.fn()
    render(<SetupWizard onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent', "Couldn't finish setup: Python bridge exited",
    )
    expect(onComplete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(skipSetup).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends one request however many times the button is pressed while it is out', async () => {
    let release!: () => void
    const skipSetup = installApi(() => new Promise((resolve) => { release = () => resolve({ ok: true }) }))
    const onComplete = vi.fn()
    render(<SetupWizard onComplete={onComplete} />)

    const skip = screen.getByRole('button', { name: 'Skip setup' })
    fireEvent.click(skip)
    fireEvent.click(skip)
    fireEvent.click(skip)
    expect(skipSetup).toHaveBeenCalledTimes(1)

    release()
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })
})
