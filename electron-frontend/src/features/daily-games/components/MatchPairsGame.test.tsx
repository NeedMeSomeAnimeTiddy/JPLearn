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

describe('MatchPairsGame with two words of one meaning (audit 16 F3)', () => {
  function tilesFor(words: Array<[number, string, string]>): MatchPair[] {
    return words.flatMap(([poolPosition, character, meaning]) => {
      const word = { character, meaning } as MatchPair['word']
      return [
        { id: `${poolPosition}-character`, poolPosition, side: 'character' as const, value: character, word },
        { id: `${poolPosition}-meaning`, poolPosition, side: 'meaning' as const, value: meaning, word },
      ]
    })
  }
  /* 青 "blue" and 青い "Blue " read the same once case and spaces are set aside */
  const blue = tilesFor([[0, '青', 'blue'], [1, '青い', 'Blue '], [2, '猫', 'cat']])

  function pick(characterValue: string, meaningTileIndex: number, characterFirst: boolean) {
    const character = screen.getByRole('button', { name: characterValue })
    const meaning = within(screen.getByRole('group', { name: 'Meanings' })).getAllByRole('button')[meaningTileIndex]
    if (characterFirst) { fireEvent.click(character); fireEvent.click(meaning) }
    else { fireEvent.click(meaning); fireEvent.click(character) }
  }

  /* the meaning tiles render in `pairs` order: blue (0), Blue (1), cat (2) */
  for (const characterFirst of [true, false]) {
    it(`takes either "blue" for either word and completes with no miss (${characterFirst ? 'character' : 'meaning'} first)`, () => {
      const onComplete = vi.fn()
      render(<MatchPairsGame pairs={blue} isSaving={false} onComplete={onComplete} shell={shell} />)

      pick('青', 1, characterFirst)
      expect(screen.getByRole('status').textContent).not.toMatch(/do not match/)
      pick('青い', 0, characterFirst)
      expect(screen.getByRole('status').textContent).not.toMatch(/do not match/)
      pick('猫', 2, characterFirst)

      expect(onComplete).toHaveBeenCalledOnce()
      expect(onComplete).toHaveBeenCalledWith({
        score: 3,
        outcomes: [
          { poolPosition: 0, outcome: 'correct' },
          { poolPosition: 1, outcome: 'correct' },
          { poolPosition: 2, outcome: 'correct' },
        ],
      })
      expect([...document.querySelectorAll('.rd-ticks i')].map((tick) => tick.className)).toEqual(['on', 'on', 'on'])
    })
  }

  it('keeps a word missed before its cross-pick incorrect', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<MatchPairsGame pairs={blue} isSaving={false} onComplete={onComplete} shell={shell} />)

    /* a genuine mismatch: 猫 and 青's "blue" */
    pick('猫', 0, true)
    expect(screen.getByRole('status').textContent).toContain('猫 and blue do not match')
    act(() => { vi.advanceTimersByTime(400) })

    pick('青', 1, true)
    pick('青い', 0, true)
    pick('猫', 2, true)

    expect(onComplete).toHaveBeenCalledWith({
      score: 1,
      outcomes: [
        { poolPosition: 0, outcome: 'incorrect' },
        { poolPosition: 1, outcome: 'correct' },
        { poolPosition: 2, outcome: 'incorrect' },
      ],
    })
    /* the trail follows the character tiles in the order they were paired: 青, 青い, 猫 */
    expect([...document.querySelectorAll('.rd-ticks i')].map((tick) => tick.className)).toEqual(['bad', 'on', 'bad'])
  })

  it('keeps score, trail and outcomes together after a mismatch on a meaning whose own character is paired', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<MatchPairsGame pairs={blue} isSaving={false} onComplete={onComplete} shell={shell} />)

    /* 青 takes 青い's "Blue", leaving 青's own "blue" on the board */
    pick('青', 1, true)
    expect([...document.querySelectorAll('.rd-ticks i')].map((tick) => tick.className)[0]).toBe('on')

    /* then 猫 is tried against that "blue": a genuine mismatch, so 青's word is missed after all */
    pick('猫', 0, true)
    act(() => { vi.advanceTimersByTime(400) })
    expect([...document.querySelectorAll('.rd-ticks i')].map((tick) => tick.className)[0]).toBe('bad')

    pick('青い', 0, true)
    pick('猫', 2, true)

    expect(onComplete).toHaveBeenCalledWith({
      score: 1,
      outcomes: [
        { poolPosition: 0, outcome: 'incorrect' },
        { poolPosition: 1, outcome: 'correct' },
        { poolPosition: 2, outcome: 'incorrect' },
      ],
    })
    expect([...document.querySelectorAll('.rd-ticks i')].map((tick) => tick.className)).toEqual(['bad', 'on', 'bad'])
  })
})
