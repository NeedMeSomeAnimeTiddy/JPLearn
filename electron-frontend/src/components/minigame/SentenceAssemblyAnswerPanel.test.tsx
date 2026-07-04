import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SentenceAssemblyAnswerPanel } from './SentenceAssemblyAnswerPanel'

afterEach(() => {
  cleanup()
})

describe('SentenceAssemblyAnswerPanel', () => {
  it('submits reordered chunk ids after moving a chunk later', () => {
    const onSubmit = vi.fn()

    render(
      <SentenceAssemblyAnswerPanel
        options={[
          { id: 'chunk-0', label: '私' },
          { id: 'chunk-1', label: 'は' },
          { id: 'chunk-2', label: '学生です。' },
        ]}
        disabled={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /move 私 later/i }))

    fireEvent.click(screen.getByRole('button', { name: /submit order/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('chunk-1|chunk-0|chunk-2')
  })

  it('restores original order when reset is clicked', () => {
    const onSubmit = vi.fn()

    render(
      <SentenceAssemblyAnswerPanel
        options={[
          { id: 'chunk-0', label: '明日' },
          { id: 'chunk-1', label: 'に' },
          { id: 'chunk-2', label: '行きます。' },
        ]}
        disabled={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /move 明日 later/i }))

    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit order/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('chunk-0|chunk-1|chunk-2')
  })
})
