import { describe, expect, it, vi } from 'vitest'
import { buildCrossword } from './crossword'
import { enrichCrosswordClues } from './crosswordClues'
import type { DailyGamesWordPayload } from '../../generated/types'

const words: DailyGamesWordPayload[] = [
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 1, character: '学校', romaji: 'gakkou', meaning: 'school', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 2, character: '校門', romaji: 'koumon', meaning: 'school gate', source: 'deck' },
  { deck_slug: 'vocab', deck_name: 'Vocabulary', card_id: 3, character: '門前', romaji: 'monzen', meaning: 'in front of a gate', source: 'deck' },
]
const board = buildCrossword(words, 117)
const fallbacks = board.entries.map((entry) => entry.clue)
const valid = () => JSON.stringify(board.entries.map((entry, index) => ({ poolPosition: entry.poolPosition, clue: `English definition ${index + 1}` })))

describe('crossword clue adapter', () => {
  it.each([
    ['missing model', undefined],
    ['invalid JSON', async () => 'not json'],
    ['partial output', async () => JSON.stringify([{ poolPosition: board.entries[0].poolPosition, clue: 'Only one' }])],
    ['leaked answer', async () => JSON.stringify(board.entries.map((entry) => ({ poolPosition: entry.poolPosition, clue: `Means ${entry.answer}` })) )],
    ['transliterated answer', async () => JSON.stringify(board.entries.map((entry) => ({ poolPosition: entry.poolPosition, clue: `Sounds like ${entry.reading}` })))],
    ['partial Japanese answer leakage', async () => JSON.stringify(board.entries.map((entry) => ({ poolPosition: entry.poolPosition, clue: `A place involving ${Array.from(entry.answer)[0]}` })))],
    ['unrelated Japanese script', async () => JSON.stringify(board.entries.map((entry, index) => ({ poolPosition: entry.poolPosition, clue: `English clue ${index + 1} with ね` })))],
  ])('silently retains fallbacks for %s', async (_name, generateClues) => {
    const result = await enrichCrosswordClues('2026-07-15', board, { generateClues })
    expect(result.entries.map((entry) => entry.clue)).toEqual(fallbacks)
  })

  it('retains fallbacks for timeout and cancellation', async () => {
    const slow = () => new Promise<never>(() => undefined)
    await expect(enrichCrosswordClues('2026-07-15', board, { generateClues: slow, timeoutMs: 1 })).resolves.toEqual(board)
    const controller = new AbortController()
    controller.abort()
    await expect(enrichCrosswordClues('2026-07-15', board, { generateClues: vi.fn(async () => valid()) }, controller.signal)).resolves.toEqual(board)
  })

  it('cancels an in-flight clue request without waiting for the model response', async () => {
    const controller = new AbortController()
    const inFlight = enrichCrosswordClues(
      '2026-07-15',
      board,
      { generateClues: async () => new Promise<string>(() => undefined) },
      controller.signal,
    )
    controller.abort()

    await expect(inFlight).resolves.toEqual(board)
  })

  it('uses accepted daily clues stably and saves only complete validated output', async () => {
    const getCachedClues = vi.fn(async () => JSON.parse(valid()))
    const generateClues = vi.fn(async () => valid())
    const saveCachedClues = vi.fn(async () => undefined)
    const result = await enrichCrosswordClues('2026-07-15', board, { getCachedClues, generateClues, saveCachedClues })
    expect(result.entries.map((entry) => entry.clue)).toEqual(['English definition 1', 'English definition 2', 'English definition 3'])
    expect(generateClues).not.toHaveBeenCalled()
    expect(saveCachedClues).not.toHaveBeenCalled()
  })

  it('uses the persisted first clue set after a concurrent cache save', async () => {
    const result = await enrichCrosswordClues('2026-07-15', board, {
      generateClues: async () => valid(),
      saveCachedClues: async () => board.entries.map((entry, index) => ({
        poolPosition: entry.poolPosition as number,
        clue: `First accepted clue ${index + 1}`,
      })),
    })

    expect(result.entries.map((entry) => entry.clue)).toEqual([
      'First accepted clue 1',
      'First accepted clue 2',
      'First accepted clue 3',
    ])
  })

  it('falls back when the tutor is concurrently active and accepts a complete safe response otherwise', async () => {
    const concurrentTutor = vi.fn(async () => { throw new Error('Tutor inference active') })
    await expect(enrichCrosswordClues('2026-07-15', board, { generateClues: concurrentTutor })).resolves.toEqual(board)
    const result = await enrichCrosswordClues('2026-07-15', board, { generateClues: async () => valid() })
    expect(result.entries.map((entry) => entry.clue)).not.toEqual(fallbacks)
  })
})
