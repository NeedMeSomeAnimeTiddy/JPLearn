import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TutorPanelShell } from './TutorPanelShell'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function renderShell(mode: 'menu' | 'chat' | 'scenarios' | 'ocr', overrides: Partial<{
  onBack: () => void
  onClose: () => void
}> = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const onBack = mode === 'menu' ? undefined : (overrides.onBack ?? vi.fn())
  const view = render(
    <TutorPanelShell
      mode={mode}
      title="TITLE"
      catalog="CATALOG"
      ariaLabel={`${mode} panel`}
      panelId="tutor-panel"
      onBack={onBack}
      onClose={onClose}
    >
      <div className="assistant-chat-log">
        <button type="button">First</button>
        <button type="button">Second</button>
      </div>
    </TutorPanelShell>,
  )
  return { view, onClose, onBack }
}

describe('TutorPanelShell', () => {
  it('uses accessible dialog semantics and renders Close but not Back at the menu', async () => {
    renderShell('menu')
    const dialog = screen.getByRole('dialog', { name: 'menu panel' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Back to Tutor menu' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close Tutor panel' })).toBeTruthy()
  })

  it('renders Back in every non-menu mode', () => {
    for (const mode of ['chat', 'scenarios', 'ocr'] as const) {
      const { view } = renderShell(mode)
      expect(screen.getByRole('button', { name: 'Back to Tutor menu' })).toBeTruthy()
      view.unmount()
    }
  })

  it('gives every activity the identical window, so switching modes never resizes the popup', () => {
    const classNames = new Set<string>()
    for (const mode of ['menu', 'chat', 'scenarios', 'ocr'] as const) {
      const { view } = renderShell(mode)
      classNames.add(screen.getByRole('dialog').className)
      view.unmount()
    }
    expect(classNames.size).toBe(1)
    expect([...classNames][0]).toContain('assistant-chat-window')
  })

  it('focuses the first focusable element inside the dialog on mount', async () => {
    renderShell('chat')
    const first = screen.getByRole('button', { name: 'Back to Tutor menu' })
    await waitFor(() => expect(document.activeElement).toBe(first))
  })

  it('traps Tab focus cycling within the dialog', () => {
    renderShell('chat')
    const dialog = screen.getByRole('dialog')
    const first = screen.getByRole('button', { name: 'Back to Tutor menu' })
    // The dialog's actual last focusable element is "Second" (the mock body
    // content), not the Close button — Close/Back are earlier in DOM order.
    const last = screen.getByRole('button', { name: 'Second' })

    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('Escape at the menu closes the popup', () => {
    const { onClose } = renderShell('menu')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape inside an activity returns to the menu instead of closing', () => {
    const { onBack, onClose } = renderShell('scenarios')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onBack).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking the backdrop closes the popup, clicking inside the dialog does not', () => {
    const onClose = vi.fn()
    renderShell('menu', { onClose })
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    // The backdrop is the presentation-role wrapper around the dialog.
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders supplied header actions alongside Close', () => {
    render(
      <TutorPanelShell
        mode="chat"
        title="T"
        catalog="C"
        ariaLabel="chat panel"
        panelId="tutor-panel"
        onBack={vi.fn()}
        onClose={vi.fn()}
        headerActions={<button type="button">Clear</button>}
      >
        <div />
      </TutorPanelShell>,
    )
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close Tutor panel' })).toBeTruthy()
  })
})
