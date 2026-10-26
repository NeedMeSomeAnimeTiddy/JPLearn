import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as axeCore from 'axe-core'
import type { DailyGamesWordPayload } from '../../../generated/types'
import { buildCrossword } from '../crossword'
import type { PuzzleShell } from '../types'
import { boardCell } from '../utils'
import { CrosswordGame } from './CrosswordGame'

const words: DailyGamesWordPayload[] = [
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 1, character: '学校', romaji: 'gakkou', meaning: 'school', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 2, character: '校門', romaji: 'koumon', meaning: 'school gate', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 3, character: '門前', romaji: 'monzen', meaning: 'in front of a gate', source: 'deck' },
]

const board = buildCrossword(words, 117)
const shell: PuzzleShell = {
  head: null, cap: '', hints: [], onBack: () => undefined, backAria: 'Back to the daily road',
  spent: { key: 'spent', value: '00:00', label: 'SPENT' }, ending: null,
}
const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

function cellName(row: number, column: number): RegExp {
  return new RegExp(`Row ${row + 1}, column ${column + 1}`)
}

function renderGame(onComplete = vi.fn()): ReturnType<typeof render> {
  return render(<CrosswordGame board={board} isSaving={false} onComplete={onComplete} shell={shell} />)
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

  it('converts romaji to kana via wanakana, commits one character per cell, auto-advances, and blocks Enter during OS IME', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    const entry = board.entries[0]
    const [firstCell, secondCell] = entry.cells
    const firstInput = screen.getByRole('textbox', { name: cellName(firstCell.row, firstCell.column) }) as HTMLInputElement

    fireEvent.change(firstInput, { target: { value: 'が' } })
    expect(firstInput.value).toBe('が')

    fireEvent.keyDown(firstInput, { key: 'Enter', isComposing: true })
    fireEvent.submit(firstInput.closest('form')!)
    expect(onComplete).not.toHaveBeenCalled()

    const secondInput = screen.getByRole('textbox', { name: cellName(secondCell.row, secondCell.column) }) as HTMLInputElement
    fireEvent.change(secondInput, { target: { value: 'っ' } })
    expect(secondInput.value).toBe('っ')
  })

  it('completes the fallback without fabricating a vocabulary outcome', () => {
    const onComplete = vi.fn()
    const fallback = buildCrossword([], 5)
    render(<CrosswordGame board={fallback} isSaving={false} onComplete={onComplete} shell={shell} />)
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

  it('stands its board in the prompt cell at the solved cell size, with nothing to scroll', () => {
    renderGame()
    const boardRegion = screen.getByRole('region', { name: 'Crossword board' })
    expect(boardRegion.closest('.rd-ask')).toBeTruthy()
    const grid = boardRegion.querySelector('.dp-board') as HTMLElement
    expect(grid.style.getPropertyValue('--dp-cell')).toBe(`${boardCell(board.grid[0].length)}px`)
  })

  it('lists every clue, marks a filled one FILLED in ink without saying if it is right, and completes from the CHECK slab', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    const clues = screen.getByRole('list', { name: 'Clues' })
    expect(clues.querySelectorAll('li')).toHaveLength(board.entries.length)

    const entry = board.entries[0]
    entry.cells.forEach((cell) => {
      fireEvent.change(screen.getByRole('textbox', { name: cellName(cell.row, cell.column) }), { target: { value: 'ア' } })
    })
    const first = screen.getByRole('button', { name: /clue 1:/i })
    expect(first.textContent).toContain('FILLED')
    expect(first.className).not.toMatch(/\b(on|bad)\b/)
    expect(document.querySelectorAll('.rd-ticks i.on, .rd-ticks i.bad')).toHaveLength(0)

    fillBoard()
    const slab = screen.getByRole('button', { name: /check crossword/i })
    expect(slab.classList.contains('rd-slab')).toBe(true)
    fireEvent.click(slab)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(document.querySelectorAll('.rd-ticks i.on')).toHaveLength(board.entries.length)
  })

  it('shows an incomplete check as the round verdict', () => {
    renderGame()
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))
    const verdict = document.querySelector('.rd-verdict') as HTMLElement
    expect(verdict.classList.contains('is-error')).toBe(true)
    expect(verdict.textContent).toMatch(/check the clues and try again/i)
  })
})
