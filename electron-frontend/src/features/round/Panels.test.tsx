import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RoundDraw, RoundOrder } from './components/Panels'
import { candidateSize } from './utils'

const mockUseHandwritingQuiz = vi.hoisted(() => vi.fn())

vi.mock('../handwriting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../handwriting')>()),
  useHandwritingQuiz: mockUseHandwritingQuiz,
}))

afterEach(() => {
  cleanup()
  mockUseHandwritingQuiz.mockReset()
})

/* These are the two behaviours the panels this cell replaced were tested for, kept against the
   drawing that replaced them: the reorder that a keyboard can reach, and the stroke-data failure
   that must not be scored as a wrong answer. */
describe('the order the chunks are left in', () => {
  const CHUNKS = [
    { id: 'chunk-0', label: '私' },
    { id: 'chunk-1', label: 'は' },
    { id: 'chunk-2', label: '学生です。' },
  ]

  it('moves a chunk later without a pointer', () => {
    const onOrder = vi.fn()
    render(
      <RoundOrder
        options={CHUNKS}
        disabled={false}
        order={['chunk-0', 'chunk-1', 'chunk-2']}
        onOrder={onOrder}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /move 私 later/i }))
    expect(onOrder).toHaveBeenCalledWith(['chunk-1', 'chunk-0', 'chunk-2'])
  })

  it('offers the deal back only once the arrangement has moved', () => {
    const onOrder = vi.fn()
    const { rerender } = render(
      <RoundOrder
        options={CHUNKS}
        disabled={false}
        order={['chunk-0', 'chunk-1', 'chunk-2']}
        onOrder={onOrder}
      />,
    )
    expect(screen.queryByRole('button', { name: /put it back/i })).toBeNull()

    rerender(
      <RoundOrder
        options={CHUNKS}
        disabled={false}
        order={['chunk-1', 'chunk-0', 'chunk-2']}
        onOrder={onOrder}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /put it back/i }))
    expect(onOrder).toHaveBeenCalledWith(['chunk-0', 'chunk-1', 'chunk-2'])
  })
})

describe('the square you draw in', () => {
  it('offers the three controls without ever printing the character', () => {
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

    render(
      <RoundDraw
        character="日"
        disabled={false}
        hintUsed={false}
        errorCopy="nope"
        onComplete={vi.fn()}
      />,
    )

    expect(screen.queryByText('日')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /start over/i }))
    fireEvent.click(screen.getByRole('button', { name: /show order/i }))
    fireEvent.click(screen.getByRole('button', { name: /give up/i }))
    expect(retry).toHaveBeenCalledOnce()
    expect(showAnimation).toHaveBeenCalledOnce()
    expect(giveUp).toHaveBeenCalledOnce()
  })

  it('draws in the sheet ink rather than the app theme', () => {
    mockUseHandwritingQuiz.mockReturnValue({
      targetRef: { current: null },
      status: 'ready',
      mistakeCount: 0,
      error: null,
      retry: vi.fn(),
      showAnimation: vi.fn(),
      giveUp: vi.fn(),
    })
    render(
      <RoundDraw
        character="日"
        disabled={false}
        hintUsed={false}
        errorCopy="nope"
        onComplete={vi.fn()}
      />,
    )
    /* the whole of the bug: `--text-main` in this app's dark theme is very nearly white, and the
       cell it draws in is cream paper */
    const colors = mockUseHandwritingQuiz.mock.calls[0][0].colors
    expect(colors.strokeColor).toBe('#14110d')
    expect(colors.drawingColor).toBe('#14110d')
  })

  it('shows a recoverable data error rather than scoring it as a wrong answer', () => {
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

    render(
      <RoundDraw
        character="あ"
        disabled={false}
        hintUsed={false}
        errorCopy="nope"
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByRole('status').textContent).toMatch(/unavailable or malformed/i)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe('a candidate is sized off how many arrived', () => {
  it('gives one candidate a specimen and eight of them a grid', () => {
    expect(candidateSize(1)).toBeGreaterThan(candidateSize(8))
    expect(candidateSize(8)).toBeGreaterThanOrEqual(26)
    expect(candidateSize(1)).toBeLessThanOrEqual(76)
  })
})
