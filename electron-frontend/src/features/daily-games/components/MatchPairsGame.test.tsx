import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MatchPair, PuzzleShell } from '../types'
import { MatchPairsGame } from './MatchPairsGame'

const pairs: MatchPair[] = [
  { id: 'character-1', poolPosition: 1, side: 'character', value: '猫', word: {} as MatchPair['word'] },
  { id: 'meaning-1', poolPosition: 1, side: 'meaning', value: 'cat', word: {} as MatchPair['word'] },
  { id: 'character-2', poolPosition: 2, side: 'character', value: '犬', word: {} as MatchPair['word'] },
  { id: 'meaning-2', poolPosition: 2, side: 'meaning', value: 'dog', word: {} as MatchPair['word'] },
]

const shell: PuzzleShell = {
  head: null, cap: '', hints: [], onBack: () => undefined, backAria: 'Back to the daily road',
  spent: { key: 'spent', value: '00:00', label: 'SPENT' }, ending: null,
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('MatchPairsGame', () => {
  it('exposes selected, matched, and mismatched state to assistive technology', () => {
    vi.useFakeTimers()
    render(<MatchPairsGame pairs={pairs} isSaving={false} onComplete={vi.fn()} shell={shell} />)
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

  it('puts the Japanese in the prompt cell and the meanings in the work cell, two columns of up to six', () => {
    const twelve: MatchPair[] = Array.from({ length: 12 }, (_, index) => [
      { id: `c-${index}`, poolPosition: index, side: 'character' as const, value: `語${index}`, word: {} as MatchPair['word'] },
      { id: `m-${index}`, poolPosition: index, side: 'meaning' as const, value: `word ${index}`, word: {} as MatchPair['word'] },
    ]).flat()
    render(<MatchPairsGame pairs={twelve} isSaving={false} onComplete={vi.fn()} shell={shell} />)

    const japanese = screen.getByRole('group', { name: 'Japanese words' })
    const meanings = screen.getByRole('group', { name: 'Meanings' })
    expect(japanese.closest('.rd-ask')).toBeTruthy()
    expect(meanings.closest('.rd-work')).toBeTruthy()
    expect(within(japanese).getAllByRole('button')).toHaveLength(12)
    expect(within(meanings).getAllByRole('button')).toHaveLength(12)
    /* twelve tiles a side is six rows of two -- the grid's two columns are the stylesheet's */
    expect(japanese.style.getPropertyValue('--dp-rows')).toBe('6')
    expect(meanings.style.getPropertyValue('--dp-rows')).toBe('6')
    const css = readFileSync(resolve(process.cwd(), 'src/features/daily-games/daily-games.css'), 'utf8')
    expect(css).toMatch(/\.dp-tiles \{[^}]*grid-template-columns: 1fr 1fr;/)
  })

  it('marks a word that was mismatched before it was paired with a vermilion tick, in the order pairs were made', () => {
    vi.useFakeTimers()
    const three: MatchPair[] = [
      ...pairs,
      { id: 'character-3', poolPosition: 3, side: 'character', value: '鳥', word: {} as MatchPair['word'] },
      { id: 'meaning-3', poolPosition: 3, side: 'meaning', value: 'bird', word: {} as MatchPair['word'] },
    ]
    render(<MatchPairsGame pairs={three} isSaving={false} onComplete={vi.fn()} shell={shell} />)

    fireEvent.click(screen.getByRole('button', { name: 'cat' }))
    fireEvent.click(screen.getByRole('button', { name: '犬' }))
    expect(screen.getByRole('button', { name: 'cat' }).classList.contains('bad')).toBe(true)
    act(() => { vi.advanceTimersByTime(400) })

    fireEvent.click(screen.getByRole('button', { name: '鳥' }))
    fireEvent.click(screen.getByRole('button', { name: 'bird' }))
    fireEvent.click(screen.getByRole('button', { name: '猫' }))
    fireEvent.click(screen.getByRole('button', { name: 'cat' }))

    const ticks = [...document.querySelectorAll('.rd-ticks i')].map((tick) => tick.className)
    expect(ticks).toEqual(['on', 'bad', 'here'])
    /* a made pair turns gold on both sides of the hairline and stays put */
    expect(screen.getByRole('button', { name: '鳥' }).classList.contains('on')).toBe(true)
    expect(screen.getByRole('button', { name: 'bird' }).classList.contains('on')).toBe(true)
  })
})
