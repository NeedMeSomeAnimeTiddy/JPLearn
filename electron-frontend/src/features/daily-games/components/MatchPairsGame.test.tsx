import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { MatchPair } from '../types'
import { MatchPairsGame } from './MatchPairsGame'

const pairs: MatchPair[] = [
  { id: 'character-1', poolPosition: 1, side: 'character', value: '猫', word: {} as MatchPair['word'] },
  { id: 'meaning-1', poolPosition: 1, side: 'meaning', value: 'cat', word: {} as MatchPair['word'] },
  { id: 'character-2', poolPosition: 2, side: 'character', value: '犬', word: {} as MatchPair['word'] },
  { id: 'meaning-2', poolPosition: 2, side: 'meaning', value: 'dog', word: {} as MatchPair['word'] },
]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('MatchPairsGame', () => {
  it('exposes selected, matched, and mismatched state to assistive technology', () => {
    vi.useFakeTimers()
    render(<MatchPairsGame pairs={pairs} isSaving={false} onComplete={vi.fn()} />)
    const cat = screen.getByRole('button', { name: 'cat' })

    fireEvent.click(cat)
    expect(cat.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toContain('Selected cat')

    fireEvent.click(screen.getByRole('button', { name: '犬' }))
    expect(screen.getByRole('status').textContent).toContain('cat and 犬 do not match')

    act(() => { vi.advanceTimersByTime(400) })
    fireEvent.click(cat)
    fireEvent.click(screen.getByRole('button', { name: '猫' }))
    expect(screen.getByRole('status').textContent).toContain('cat matched')
    expect(cat.getAttribute('aria-pressed')).toBe('false')
  })
})
