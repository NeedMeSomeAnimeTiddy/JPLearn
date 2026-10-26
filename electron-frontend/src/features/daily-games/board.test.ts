import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

/* THE SHEET'S COLOUR LAW, held in the stylesheet: gold is earned, so the entry you are on and the
   line you are still drawing are ink; and a label that does not fit wraps rather than vanishing
   behind an ellipsis. */
describe('the puzzle stylesheet', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/features/daily-games/daily-games.css'), 'utf8')
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`)
    expect(at, `${selector} is styled`).toBeGreaterThanOrEqual(0)
    return css.slice(at, css.indexOf('}', at))
  }

  it('never marks selected or in-progress in gold', () => {
    expect(rule('.dp-cell.here')).not.toMatch(/gold/)
    expect(rule('.dp-cell.here')).toMatch(/var\(--ink\)/)
  })

  it('wraps the clue you are on and lets a tile take two lines', () => {
    expect(rule('.dp-row.here b')).toMatch(/white-space: normal/)
    const tile = rule('.dp-tile > span')
    expect(tile).toMatch(/-webkit-line-clamp: 2/)
    expect(tile).toMatch(/white-space: normal/)
    expect(tile).toMatch(/line-height: 1\.1/)
  })

  it('never rounds a corner', () => {
    expect(css.includes('border-radius')).toBe(false)
  })
})
