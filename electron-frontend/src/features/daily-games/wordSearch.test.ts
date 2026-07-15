import { describe, expect, it } from 'vitest'
import type { DailyGamesWordPayload } from '../../generated/types'
import { WORD_SEARCH_MAX_GRID_SIZE, WORD_SEARCH_MIN_GRID_SIZE } from './constants'
import { buildWordSearch } from './utils'

const words: DailyGamesWordPayload[] = [
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 1, character: '学校', romaji: 'gakkou', meaning: 'school', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 2, character: '先生', romaji: 'sensei', meaning: 'teacher', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 3, character: '電車', romaji: 'densha', meaning: 'train', source: 'deck' },
]

function expectValidBoard(board: ReturnType<typeof buildWordSearch>): void {
  expect(board.grid.length).toBeGreaterThanOrEqual(WORD_SEARCH_MIN_GRID_SIZE)
  expect(board.grid.length).toBeLessThanOrEqual(WORD_SEARCH_MAX_GRID_SIZE)
  expect(board.targets.length).toBeGreaterThan(0)
  for (const target of board.targets) {
    expect(target.path).toHaveLength(Array.from(target.value).length)
    expect(target.path.map(({ row, column }) => board.grid[row][column]).join('')).toBe(target.value)
  }
}

describe('buildWordSearch', () => {
  it('is deterministic and preserves every target at its recorded Unicode-safe path', () => {
    const board = buildWordSearch(words, 117)
    expect(board).toEqual(buildWordSearch(words, 117))
    expectValidBoard(board)
  })

  it('preserves every recorded target path across varied seeded pools', () => {
    const pool = Array.from({ length: 10 }, (_, index) => ({
      ...words[index % words.length],
      card_id: index,
      character: `語${index}校`,
    }))

    for (let seed = 0; seed < 32; seed += 1) {
      const board = buildWordSearch(pool, seed)
      expectValidBoard(board)
      expect(board).toEqual(buildWordSearch(pool, seed))
    }
  })

  it('returns a playable fallback board for empty, overlong, and unplaceable pools', () => {
    const unsuitable = [
      [],
      [{ ...words[0], character: 'あ'.repeat(WORD_SEARCH_MAX_GRID_SIZE + 1) }],
    ]
    for (const pool of unsuitable) {
      const board = buildWordSearch(pool, 5)
      expect(board.isFallback).toBe(true)
      expectValidBoard(board)
    }
    expect(buildWordSearch(unsuitable[1], 5).targets[0].poolPosition).toBeNull()
  })
})
