import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
// axe-core ships as a CJS export = module; Vite handles interop at runtime.
import axe from 'axe-core'
import { TutorMenu } from './TutorMenu'

afterEach(() => {
  cleanup()
})

describe('TutorMenu', () => {
  it('renders all three activities when chat is enabled', () => {
    render(<TutorMenu assistantChatEnabled returnFocusMode={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Chat with Tutor' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scenario Practice' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Image Translation' })).toBeTruthy()
  })

  it('hides Chat with Tutor when chat is disabled, but keeps Scenario Practice and Image Translation reachable', () => {
    render(<TutorMenu assistantChatEnabled={false} returnFocusMode={null} onSelect={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Chat with Tutor' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Scenario Practice' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Image Translation' })).toBeTruthy()
  })

  it('calls onSelect with the chosen mode', () => {
    const onSelect = vi.fn()
    render(<TutorMenu assistantChatEnabled returnFocusMode={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenario Practice' }))
    expect(onSelect).toHaveBeenCalledWith('scenarios')
  })

  it('marks the item matching returnFocusMode for autofocus (Back-target restoration)', () => {
    render(<TutorMenu assistantChatEnabled returnFocusMode="ocr" onSelect={vi.fn()} />)
    const ocrButton = screen.getByRole('button', { name: 'Image Translation' })
    expect(ocrButton.getAttribute('data-autofocus')).toBe('true')
    const chatButton = screen.getByRole('button', { name: 'Chat with Tutor' })
    expect(chatButton.getAttribute('data-autofocus')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = render(<TutorMenu assistantChatEnabled returnFocusMode={null} onSelect={vi.fn()} />)
    const results = await (axe as { run: (el: Element) => Promise<{ violations: Array<{ id: string; description: string; nodes: unknown[] }> }> }).run(container)
    expect(results.violations).toHaveLength(0)
  })
})
