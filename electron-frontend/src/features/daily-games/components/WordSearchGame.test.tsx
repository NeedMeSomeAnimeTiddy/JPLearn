import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as axeCore from 'axe-core'
import type { PuzzleShell, WordSearchBoard } from '../types'
import { boardCell, buildWordSearch } from '../utils'
import { WordSearchGame } from './WordSearchGame'

const board = buildWordSearch([], 12)
const target = board.targets[0]
const diagonalBoard: WordSearchBoard = {
  grid: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'あ')),
  isFallback: false,
  targets: [{
    id: 'diagonal',
    poolPosition: 1,
    value: '山川',
    path: [{ row: 0, column: 0 }, { row: 1, column: 1 }],
  }],
}
diagonalBoard.grid[0][0] = '山'
diagonalBoard.grid[1][1] = '川'

const shell: PuzzleShell = {
  head: null, cap: '', hints: [], onBack: () => undefined, backAria: 'Back to the daily road',
  spent: { key: 'spent', value: '00:00', label: 'SPENT' }, ending: null,
}
/* the diagonal target sits at pool position 1, so its English is the second word */
const words = [
  { deck_slug: 'n5', deck_name: 'N5', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' },
  { deck_slug: 'n5', deck_name: 'N5', card_id: 2, character: '山川', romaji: 'yamakawa', meaning: 'mountains and rivers', source: 'deck' },
]

function cellName(row: number, column: number): RegExp {
  return new RegExp(`Row ${row + 1}, column ${column + 1}:`)
}

function renderGame(onComplete = vi.fn()): ReturnType<typeof render> {
  return render(<WordSearchGame board={board} words={[]} isSaving={false} onComplete={onComplete} shell={shell} />)
}

const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

afterEach(cleanup)

describe('WordSearchGame', () => {
  it('completes the fallback board through pointer drag and produces playable outcomes', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    const start = screen.getByRole('button', { name: cellName(target.path[0].row, target.path[0].column) })
    const endCoordinate = target.path[target.path.length - 1]
    const end = screen.getByRole('button', { name: cellName(endCoordinate.row, endCoordinate.column) })

    fireEvent.pointerDown(start)
    target.path.slice(1).forEach((coordinate) => fireEvent.pointerEnter(screen.getByRole('button', { name: cellName(coordinate.row, coordinate.column) })))
    fireEvent.pointerUp(end)

    expect(onComplete).toHaveBeenCalledWith({ score: 1, targetCount: 1, outcomes: [] })
    expect(screen.getByText(/Word found/i)).toBeTruthy()
  })

  it('supports arrow navigation plus keyboard start and confirm selection', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    const [startCoordinate, secondCoordinate] = target.path
    const start = screen.getByRole('button', { name: cellName(startCoordinate.row, startCoordinate.column) })
    start.focus()
    fireEvent.keyDown(start, { key: 'Enter' })
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: cellName(secondCoordinate.row, secondCoordinate.column) }))
    for (let index = 2; index < target.path.length; index += 1) fireEvent.keyDown(document.activeElement as HTMLButtonElement, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement as HTMLButtonElement, { key: ' ' })

    expect(onComplete).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toMatch(/word found/i)
  })

  it('supports diagonal keyboard selection and Escape cancellation', () => {
    const onComplete = vi.fn()
    render(<WordSearchGame board={diagonalBoard} words={words} isSaving={false} onComplete={onComplete} shell={shell} />)
    const start = screen.getByRole('button', { name: cellName(0, 0) })
    start.focus()
    fireEvent.keyDown(start, { key: 'Enter' })
    fireEvent.keyDown(start, { key: 'Escape' })
    expect(screen.getByRole('status').textContent).toMatch(/cancelled/i)

    fireEvent.keyDown(start, { key: 'Enter' })
    fireEvent.keyDown(start, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement as HTMLButtonElement, { key: 'ArrowRight' })
    fireEvent.keyDown(document.activeElement as HTMLButtonElement, { key: ' ' })

    expect(onComplete).toHaveBeenCalledWith({
      score: 1,
      targetCount: 1,
      outcomes: [{ poolPosition: 1, outcome: 'correct' }],
    })
  })

  it('clears a cancelled pointer selection so the next click selection remains usable', () => {
    const onComplete = vi.fn()
    renderGame(onComplete)
    const start = screen.getByRole('button', { name: cellName(target.path[0].row, target.path[0].column) })
    const endCoordinate = target.path[target.path.length - 1]
    const end = screen.getByRole('button', { name: cellName(endCoordinate.row, endCoordinate.column) })

    fireEvent.pointerDown(start)
    fireEvent.pointerCancel(start)
    fireEvent.click(start)
    fireEvent.click(end)

    expect(onComplete).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toMatch(/word found/i)
  })

  it('has no axe violations and exposes instructions and status', async () => {
    const { container } = renderGame()
    expect(screen.getByText(/Select a starting cell/i)).toBeTruthy()
    expect(await runAxe(container)).toHaveProperty('violations', [])
  })

  it('stands its board in the prompt cell at the solved cell size, with nothing to scroll', () => {
    renderGame()
    const boardRegion = screen.getByRole('region', { name: 'Word Search board' })
    expect(boardRegion.closest('.rd-ask')).toBeTruthy()
    const grid = boardRegion.querySelector('.dp-board') as HTMLElement
    expect(grid.style.getPropertyValue('--dp-cell')).toBe(`${boardCell(board.grid.length)}px`)
    expect(grid.style.getPropertyValue('--dp-n')).toBe(String(board.grid.length))
  })

  it('lists each target English first, Japanese beside it, and strikes it in gold once found', () => {
    render(<WordSearchGame board={diagonalBoard} words={words} isSaving={false} onComplete={vi.fn()} shell={shell} />)
    const list = screen.getByRole('list', { name: 'Words to find' })
    const row = list.querySelector('li') as HTMLElement
    expect(row.querySelector('b')?.textContent).toBe('mountains and rivers')
    expect(row.querySelector('i')?.textContent).toBe('山川')
    expect(row.classList.contains('on')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: cellName(0, 0) }))
    fireEvent.click(screen.getByRole('button', { name: cellName(1, 1) }))
    expect(list.querySelector('li')?.classList.contains('on')).toBe(true)
  })
})
