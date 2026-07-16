import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HandwritingAnswerPanel } from './HandwritingAnswerPanel'

const mockUseHandwritingQuiz = vi.hoisted(() => vi.fn())

vi.mock('../useHandwritingQuiz', () => ({
  useHandwritingQuiz: mockUseHandwritingQuiz,
}))

afterEach(() => {
  cleanup()
  mockUseHandwritingQuiz.mockReset()
})

describe('HandwritingAnswerPanel', () => {
  it('provides restart, animation, and give-up controls without exposing the answer', () => {
    const retry = vi.fn()
    const showAnimation = vi.fn()
    const giveUp = vi.fn()
    mockUseHandwritingQuiz.mockReturnValue({
      targetRef: { current: null },
      status: 'ready',
      mistakeCount: 1,
      error: null,
      retry,
      showAnimation,
      giveUp,
    })

    render(<HandwritingAnswerPanel character="日" disabled={false} onComplete={vi.fn()} />)

    expect(screen.queryByText('日')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /restart strokes/i }))
    fireEvent.click(screen.getByRole('button', { name: /show order/i }))
    fireEvent.click(screen.getByRole('button', { name: /give up/i }))
    expect(retry).toHaveBeenCalledOnce()
    expect(showAnimation).toHaveBeenCalledOnce()
    expect(giveUp).toHaveBeenCalledOnce()
  })

  it('shows a recoverable data error instead of treating it as an incorrect answer', () => {
    const retry = vi.fn()
    mockUseHandwritingQuiz.mockReturnValue({
      targetRef: { current: null },
      status: 'error',
      mistakeCount: 0,
      error: 'The character data is unavailable or malformed.',
      retry,
      showAnimation: vi.fn(),
      giveUp: vi.fn(),
    })

    render(<HandwritingAnswerPanel character="あ" disabled={false} onComplete={vi.fn()} />)

    expect(screen.getByRole('status').textContent).toMatch(/unavailable or malformed/i)
    fireEvent.click(screen.getByRole('button', { name: /retry data load/i }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
