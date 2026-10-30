import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsCollapsibleSection } from './SettingsCollapsibleSection'

/* audit 17, F4: a button in a section header's `actions` works from the keyboard. user-event runs
   the browser's own activation (Enter clicks on keydown, Space on keyup), which fireEvent cannot. */
function renderSection() {
  const onToggle = vi.fn()
  const onDownload = vi.fn()
  render(
    <SettingsCollapsibleSection
      id="offline-dictionary"
      title="Offline Dictionary"
      collapsed
      onToggle={onToggle}
      actions={(
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onDownload() }}
          aria-label="Download offline dictionary"
        >
          Download
        </button>
      )}
    >
      <p>body</p>
    </SettingsCollapsibleSection>,
  )
  return { onToggle, onDownload }
}

describe('SettingsCollapsibleSection', () => {
  afterEach(() => cleanup())

  it('lets Enter press the header action once, without toggling the section', async () => {
    const user = userEvent.setup()
    const { onToggle, onDownload } = renderSection()
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Download offline dictionary' }))
    await user.keyboard('{Enter}')
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('lets Space press the header action once, without toggling the section', async () => {
    const user = userEvent.setup()
    const { onToggle, onDownload } = renderSection()
    screen.getByRole('button', { name: 'Download offline dictionary' }).focus()
    await user.keyboard(' ')
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('still toggles from the header itself, by key and by mouse', async () => {
    const user = userEvent.setup()
    const { onToggle, onDownload } = renderSection()
    const header = screen.getByRole('button', { name: /^Offline Dictionary/ })
    header.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onToggle).toHaveBeenCalledTimes(2)
    await user.click(header)
    expect(onToggle).toHaveBeenCalledTimes(3)
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('keeps a notice in view while the section is shut', () => {
    render(
      <SettingsCollapsibleSection id="s" title="S" collapsed onToggle={vi.fn()} notice={<p>KEPT</p>}>
        <p>hidden body</p>
      </SettingsCollapsibleSection>,
    )
    expect(screen.getByText('KEPT')).toBeTruthy()
    expect(screen.queryByText('hidden body')).toBeNull()
  })
})
