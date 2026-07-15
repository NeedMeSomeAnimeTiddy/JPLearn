import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as axeCore from 'axe-core'
import { TYPING_BLITZ_DURATION_SECONDS } from '../constants'
import type { TypingBlitzWord } from '../types'
import { TypingBlitzGame } from './TypingBlitzGame'

const words: TypingBlitzWord[] = [
  { poolPosition: 0, word: { deck_slug: 'n5', deck_name: 'N5', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' } },
  { poolPosition: 1, word: { deck_slug: 'n5', deck_name: 'N5', card_id: 2, character: '犬', romaji: 'inu', meaning: 'dog', source: 'deck' } },
]

const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TypingBlitzGame', () => {
  it('records answers through accessible input interaction', () => {
    const onComplete = vi.fn()
    render(<TypingBlitzGame words={words} isSaving={false} onComplete={onComplete} />)

    const input = screen.getByLabelText(/type the japanese word/i)
    fireEvent.change(input, { target: { value: '猫' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByText('犬')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.submit(input.closest('form')!)
    expect(onComplete).toHaveBeenCalledWith({
      score: 1,
      targetCount: 2,
      outcomes: [{ poolPosition: 0, outcome: 'correct' }, { poolPosition: 1, outcome: 'incorrect' }],
    })
  })

  it('does not submit Enter while an IME composition is active, then submits after composition ends', () => {
    const onComplete = vi.fn()
    render(<TypingBlitzGame words={[words[0]]} isSaving={false} onComplete={onComplete} />)
    const input = screen.getByLabelText(/type the japanese word/i)
    fireEvent.change(input, { target: { value: '猫' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.submit(input.closest('form')!)
    expect(onComplete).not.toHaveBeenCalled()

    fireEvent.compositionEnd(input)
    fireEvent.submit(input.closest('form')!)
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('times out exactly once under fake timers and marks only the active word incorrect', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<TypingBlitzGame words={words} isSaving={false} onComplete={onComplete} />)

    act(() => { vi.advanceTimersByTime(TYPING_BLITZ_DURATION_SECONDS * 1000) })
    act(() => { vi.advanceTimersByTime(TYPING_BLITZ_DURATION_SECONDS * 1000) })
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      score: 0,
      outcomes: [{ poolPosition: 0, outcome: 'incorrect' }],
    }))
  })

  it('cleans up timers on unmount', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    const { unmount } = render(<TypingBlitzGame words={words} isSaving={false} onComplete={onComplete} />)
    unmount()
    act(() => { vi.advanceTimersByTime(TYPING_BLITZ_DURATION_SECONDS * 1000) })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(<TypingBlitzGame words={words} isSaving={false} onComplete={vi.fn()} />)
    expect((await runAxe(container)).violations).toEqual([])
  })
})
