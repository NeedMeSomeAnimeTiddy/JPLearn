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
      /* kanji only: a digit would keep the word out of the grid (audit 16 D2) */
      character: `語${String.fromCodePoint(0x4E00 + index)}校`,
    }))

    for (let seed = 0; seed < 32; seed += 1) {
      const board = buildWordSearch(pool, seed)
      expectValidBoard(board)
      expect(board).toEqual(buildWordSearch(pool, seed))
    }
  })

  it('never hides a word that is not only kana and kanji (audit 16 D2)', () => {
    const unsuitable = ['いい; よい', 'パート (タイム)', 'こうよう もみじ', '~(て) しまう', '回る、回す']
    const pool = [...unsuitable, '学校', '先生', 'コーヒー', '人々'].map((character, card_id) => ({ ...words[0], card_id, character }))
    for (let seed = 0; seed < 32; seed += 1) {
      const board = buildWordSearch(pool, seed)
      expectValidBoard(board)
      expect(board.isFallback).toBe(false)
      for (const target of board.targets) expect(unsuitable).not.toContain(target.value)
      for (const row of board.grid) expect(row.join('')).not.toMatch(/[;()~、\s]/)
    }
  })

  it('deals the same board as before for a pool of plain words (audit 16 D2)', () => {
    const summary = (board: ReturnType<typeof buildWordSearch>) => [
      ...board.targets.map((target) => `${target.value} ${target.path.map(({ row, column }) => `${row},${column}`).join(' ')}`),
      ...board.grid.map((row) => row.join('')),
    ]
    const kanjiPool = Array.from({ length: 10 }, (_, index) => ({
      ...words[index % words.length],
      card_id: index,
      character: `語${String.fromCodePoint(0x4E00 + index)}校`,
    }))
    expect(summary(buildWordSearch(words, 117))).toMatchInlineSnapshot(`
      [
        "電車 1,6 1,7",
        "先生 2,4 1,3",
        "学校 5,1 6,1",
        "ぬつおにこつそと",
        "かとえ生うく電車",
        "とねこそ先そいき",
        "かとかうしねたと",
        "なすけきこのたと",
        "け学そそえそしい",
        "そ校にうたかなち",
        "おさおうきささち",
      ]
    `)
    expect(summary(buildWordSearch(kanjiPool, 3))).toMatchInlineSnapshot(`
      [
        "語三校 0,5 1,4 2,3",
        "語丅校 0,3 1,3 2,3",
        "語丆校 2,5 2,4 2,3",
        "語丁校 4,5 3,6 2,7",
        "語丂校 7,3 7,4 7,5",
        "語丄校 6,7 5,7 4,7",
        "語丈校 4,3 5,2 6,1",
        "語七校 6,4 5,5 4,6",
        "こあき語に語えい",
        "とつお丅三かたそ",
        "かえに校丆語な校",
        "そしつさえか丁の",
        "あにき語す語校校",
        "つき丈ぬぬ七あ丄",
        "け校にき語せか語",
        "つのけ語丂校おく",
      ]
    `)
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
