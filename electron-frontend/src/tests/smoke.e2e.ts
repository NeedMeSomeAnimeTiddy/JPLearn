import { describe, expect, it } from 'vitest'
import { launchApp, waitForReactApp } from './e2e-helpers'

describe('JPLearn Electron app', () => {
  it('renders the React app inside #root', async () => {
    const { app, main } = await launchApp()
    await waitForReactApp(main)
    await app.close()
  })

  it('does not show the splash screen after startup', async () => {
    const { app, main } = await launchApp()

    // The main window title should NOT be the splash title
    const title = await main.title()
    expect(title).not.toContain('Starting JPLearn')

    await app.close()
  })
})
