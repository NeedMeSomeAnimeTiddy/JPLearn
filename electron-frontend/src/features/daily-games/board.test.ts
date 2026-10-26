import { describe, expect, it } from 'vitest'
import { CROSSWORD_MAX_GRID_SIZE, CROSSWORD_MIN_GRID_SIZE, PUZZLE_ASK_W, PUZZLE_BOARD_GAP, WORD_SEARCH_MAX_GRID_SIZE } from './constants'
import { boardCell } from './utils'

/* THE BOARD IS THE PROMPT CELL, and the prompt cell is 278 wide whatever the board is -- so the
   widest board either builder makes has to fit it at a size a character can still be read at. */
describe('boardCell', () => {
  it('gives twelve columns at least 22px inside the 278px content box', () => {
    expect(PUZZLE_ASK_W).toBe(278)
    expect(PUZZLE_BOARD_GAP).toBe(1)
    expect(Math.max(CROSSWORD_MAX_GRID_SIZE, WORD_SEARCH_MAX_GRID_SIZE)).toBe(12)
    const cell = boardCell(12)
    expect(cell).toBeGreaterThanOrEqual(22)
    expect(12 * cell + 11 * PUZZLE_BOARD_GAP).toBeLessThanOrEqual(PUZZLE_ASK_W)
  })

  it('floors to whole pixels and always fits, from the smallest board to the largest', () => {
    for (let n = CROSSWORD_MIN_GRID_SIZE; n <= 12; n++) {
      const cell = boardCell(n)
      expect(Number.isInteger(cell)).toBe(true)
      expect(n * cell + (n - 1) * PUZZLE_BOARD_GAP).toBeLessThanOrEqual(PUZZLE_ASK_W)
      expect(n * (cell + 1) + (n - 1) * PUZZLE_BOARD_GAP).toBeGreaterThan(PUZZLE_ASK_W)
    }
  })
})
