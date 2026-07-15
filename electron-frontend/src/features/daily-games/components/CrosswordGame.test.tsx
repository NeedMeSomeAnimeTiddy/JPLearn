import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as axeCore from 'axe-core'
import type { DailyGamesWordPayload } from '../../../generated/types'
import { buildCrossword } from '../crossword'
import { CrosswordGame } from './CrosswordGame'

const words: DailyGamesWordPayload[] = [
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 1, character: '学校', romaji: 'gakkou', meaning: 'school', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 2, character: '校門', romaji: 'koumon', meaning: 'school gate', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 3, character: '門前', romaji: 'monzen', meaning: 'in front of a gate', source: 'deck' },
]

const board = buildCrossword(words, 117)
const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

function cellName(row: number, column: number): RegExp {
  return new RegExp(`Row ${row + 1}, column ${column + 1}`)
}

function renderGame(onComplete = vi.fn()): ReturnType<typeof render> {
  return render(<CrosswordGame board={board} isSaving={false} onComplete={onComplete} />)
}

function fillBoard(): void {
  for (const entry of board.entries) {
    for (const [index, cell] of entry.cells.entries()) {
      fireEvent.change(screen.getByRole('textbox', { name: cellName(cell.row, cell.column) }), { target: { value: Array.from(entry.answer)[index] } })
    }
  }
}

afterEach(cleanup)

describe('CrosswordGame', () => {
  it('supports clue navigation, visible current clues, and arrow-key cell navigation', () => {
    renderGame()
    const clue = screen.getByRole('button', { name: /clue 1:/i })
    fireEvent.click(clue)
    expect(screen.getAllByRole('status')[0].textContent).toContain(board.entries[0].clue)

    const [firstCell, secondCell] = board.entries[0].cells
    const firstInput = screen.getByRole('textbox', { name: cellName(firstCell.row, firstCell.column) })
    expect(document.activeElement).toBe(firstInput)
    firstInput.focus()
    fireEvent.keyDown(firstInput, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: cellName(secondCell.row, secondCell.column) }))
  })

  it('submits mapped correct outcomes for every supplied crossword answer', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    fillBoard()
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))

    expect(onComplete).toHaveBeenCalledWith({
      score: board.entries.length,
      targetCount: board.entries.length,
      outcomes: board.entries.map((entry) => ({ poolPosition: entry.poolPosition as number, outcome: 'correct' })),
    })
  })

  it('keeps the board editable after an incomplete check', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))

    expect(screen.getByText(/check the clues and try again/i)).toBeTruthy()
    expect(onComplete).not.toHaveBeenCalled()
    const firstCell = board.entries[0].cells[0]
    const input = screen.getByRole('textbox', { name: cellName(firstCell.row, firstCell.column) })
    expect(input).not.toHaveProperty('disabled', true)
  })

  it('preserves Japanese IME pre-edit text, commits one character, and blocks Enter submission while composing', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    const firstCell = board.entries[0].cells[0]
    const input = screen.getByRole('textbox', { name: cellName(firstCell.row, firstCell.column) }) as HTMLInputElement

    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'がっこう' } })
    expect(input.value).toBe('がっこう')
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(false)
    fireEvent.submit(input.closest('form')!)
    expect(screen.getAllByRole('status').at(-1)?.textContent).toBe('')
    expect(onComplete).not.toHaveBeenCalled()

    fireEvent.compositionEnd(input, { data: '学校', target: { value: '学校' } })
    expect(input.value).toBe('学')
  })

  it('completes the fallback without fabricating a vocabulary outcome', () => {
    const onComplete = vi.fn()
    const fallback = buildCrossword([], 5)
    render(<CrosswordGame board={fallback} isSaving={false} onComplete={onComplete} />)
    const entry = fallback.entries[0]
    entry.cells.forEach((cell, index) => {
      fireEvent.change(screen.getByRole('textbox', { name: cellName(cell.row, cell.column) }), { target: { value: Array.from(entry.answer)[index] } })
    })
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))

    expect(onComplete).toHaveBeenCalledWith({ score: 1, targetCount: 1, outcomes: [] })
  })

  it('has no axe violations', async () => {
    const { container } = renderGame()
    expect(screen.getByText(/choose a clue/i)).toBeTruthy()
    expect((await runAxe(container)).violations).toEqual([])
  })

  it('contains its board in a labelled, keyboard-focusable scroll region', () => {
    renderGame()
    const boardRegion = screen.getByRole('region', { name: 'Crossword board' })
    expect(boardRegion.getAttribute('tabindex')).toBe('0')
    expect(boardRegion.classList.contains('daily-game-board-scroll')).toBe(true)
  })
})
