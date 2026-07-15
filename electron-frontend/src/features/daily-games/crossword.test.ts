import { describe, expect, it } from 'vitest'
import type { DailyGamesWordPayload } from '../../generated/types'
import {
  CROSSWORD_MAX_CANDIDATE_PLACEMENTS,
  CROSSWORD_MAX_CLUE_LENGTH,
  CROSSWORD_MAX_GRID_SIZE,
  CROSSWORD_MAX_SOLVER_STEPS,
  CROSSWORD_MAX_SOURCE_WORDS,
  CROSSWORD_MIN_GRID_SIZE,
} from './constants'
import { buildCrossword } from './crossword'

const words: DailyGamesWordPayload[] = [
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 1, character: '学校', romaji: 'gakkou', meaning: 'school', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 2, character: '校門', romaji: 'koumon', meaning: 'school gate', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 3, character: '門前', romaji: 'monzen', meaning: 'in front of a gate', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 4, character: '前日', romaji: 'zenjitsu', meaning: 'previous day', source: 'deck' },
]

function expectValidBoard(board: ReturnType<typeof buildCrossword>, pool: readonly DailyGamesWordPayload[]): void {
  expect(board.grid.length).toBeGreaterThanOrEqual(CROSSWORD_MIN_GRID_SIZE)
  expect(board.grid.length).toBeLessThanOrEqual(CROSSWORD_MAX_GRID_SIZE)
  expect(board.grid.every((row) => row.length === board.grid.length)).toBe(true)
  expect(new Set(board.entries.map((entry) => entry.answer)).size).toBe(board.entries.length)

  const charactersByCoordinate = new Map<string, string[]>()
  for (const entry of board.entries) {
    expect(entry.cells).toHaveLength(Array.from(entry.answer).length)
    expect(entry.clue.length).toBeGreaterThan(0)
    if (entry.poolPosition !== null) {
      const word = pool[entry.poolPosition]
      expect(word.character.trim()).toBe(entry.answer)
      expect([word.meaning.trim(), word.romaji.trim()]).toContain(entry.clue)
    }
    for (const [index, cell] of entry.cells.entries()) {
      expect(cell.row).toBeGreaterThanOrEqual(0)
      expect(cell.column).toBeGreaterThanOrEqual(0)
      expect(cell.row).toBeLessThan(board.grid.length)
      expect(cell.column).toBeLessThan(board.grid.length)
      expect(board.grid[cell.row][cell.column]).toBe(Array.from(entry.answer)[index])
      const key = `${cell.row}-${cell.column}`
      charactersByCoordinate.set(key, [...(charactersByCoordinate.get(key) ?? []), Array.from(entry.answer)[index]])
    }
  }
  for (const characters of charactersByCoordinate.values()) expect(new Set(characters).size).toBe(1)
  for (let index = 0; index < board.entries.length; index += 1) {
    for (const comparison of board.entries.slice(index + 1)) {
      const sharedCells = board.entries[index].cells.filter((cell) => comparison.cells.some((item) => item.row === cell.row && item.column === cell.column))
      if (sharedCells.length > 0) {
        expect(sharedCells).toHaveLength(1)
        expect(board.entries[index].direction).not.toBe(comparison.direction)
      }
    }
  }
}

describe('buildCrossword', () => {
  it('is deterministic and keeps each answer mapped to one supplied clue', () => {
    const board = buildCrossword(words, 117)
    expect(board).toEqual(buildCrossword(words, 117))
    expect(board.isFallback).toBe(false)
    expectValidBoard(board, words)
  })

  it('records valid coordinates and matching characters at every intersection', () => {
    const board = buildCrossword(words, 24)
    expectValidBoard(board, words)
    for (const entry of board.entries) {
      for (const intersection of entry.intersections) {
        const sharedEntry = board.entries.find((candidate) => candidate.id === intersection.withEntryId)
        expect(sharedEntry?.cells).toContainEqual(intersection.coordinate)
        expect(board.grid[intersection.coordinate.row][intersection.coordinate.column]).toBe(intersection.character)
      }
    }
  })

  it('returns a documented, playable non-vocabulary fallback for unsuitable pools', () => {
    const unsuitable = [
      [],
      [{ ...words[0], character: 'あ'.repeat(CROSSWORD_MAX_GRID_SIZE + 1) }],
      [{ ...words[0], meaning: ' ', romaji: ' ', character: '学校' }],
    ]
    for (const pool of unsuitable) {
      const board = buildCrossword(pool, 5)
      expect(board.isFallback).toBe(true)
      expect(board.fallbackReason).toBe('no-suitable-answers')
      expect(board.entries).toHaveLength(1)
      expect(board.entries[0].poolPosition).toBeNull()
      expectValidBoard(board, pool)
    }
  })

  it('caps candidate generation and solver work for large pools', () => {
    const largePool = Array.from({ length: 200 }, (_, index) => ({
      ...words[index % words.length],
      card_id: index,
      character: `語${index}校`,
      meaning: `word ${index}`,
    }))
    const board = buildCrossword(largePool, 8)
    expect(board.work.sourceWords).toBeLessThanOrEqual(CROSSWORD_MAX_SOURCE_WORDS)
    expect(board.work.candidatePlacements).toBeLessThanOrEqual(CROSSWORD_MAX_CANDIDATE_PLACEMENTS)
    expect(board.work.solverSteps).toBeLessThanOrEqual(CROSSWORD_MAX_SOLVER_STEPS)
    expectValidBoard(board, largePool)
  })

  it('rejects oversized answer and clue fields before expanding them', () => {
    const oversized = [{
      ...words[0],
      character: 'あ'.repeat(CROSSWORD_MAX_GRID_SIZE + 1),
      meaning: 'x'.repeat(CROSSWORD_MAX_CLUE_LENGTH + 1),
      romaji: 'x'.repeat(CROSSWORD_MAX_CLUE_LENGTH + 1),
    }]
    const board = buildCrossword(oversized, 8)
    expect(board.isFallback).toBe(true)
    expect(board.work.sourceWords).toBe(1)
  })
})
