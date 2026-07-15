import type { DailyGamesStatePayload, DailyGamesWordPayload } from '../../generated/types'
import {
  DAILY_GAMES_COPY,
  MATCH_PAIRS_MAX_WORDS,
  MATCH_PAIRS_MIN_WORDS,
  TYPING_BLITZ_MAX_WORDS,
  WORD_SEARCH_FALLBACK_TARGET,
  WORD_SEARCH_FILLER_CHARACTERS,
  WORD_SEARCH_MAX_GRID_SIZE,
  WORD_SEARCH_MAX_TARGETS,
  WORD_SEARCH_MIN_GRID_SIZE,
} from './constants'
import type { MatchPair, TypingBlitzWord, WordSearchBoard, WordSearchCoordinate, WordSearchTarget } from './types'

export function toLocalDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isDailyGameComplete(data: DailyGamesStatePayload, gameType: string): boolean {
  return data.progress.completed_daily_game_types.includes(gameType)
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function buildMatchPairs(words: readonly DailyGamesWordPayload[], seed: number): MatchPair[] {
  const pairCount = Math.min(words.length, Math.max(MATCH_PAIRS_MIN_WORDS, Math.min(words.length, MATCH_PAIRS_MAX_WORDS)))
  const random = seededRandom(seed)
  const selected = shuffle(words.map((word, poolPosition) => ({ word, poolPosition })), random).slice(0, pairCount)
  const pairs = selected.flatMap(({ word, poolPosition }) => [
    { id: `${poolPosition}-character`, poolPosition, side: 'character' as const, value: word.character, word },
    { id: `${poolPosition}-meaning`, poolPosition, side: 'meaning' as const, value: word.meaning, word },
  ])
  return shuffle(pairs, random)
}

export function buildTypingBlitz(words: readonly DailyGamesWordPayload[], seed: number): TypingBlitzWord[] {
  const random = seededRandom(seed)
  return shuffle(words.map((word, poolPosition) => ({ word, poolPosition })), random).slice(0, TYPING_BLITZ_MAX_WORDS)
}

const wordSearchDirections: readonly WordSearchCoordinate[] = [
  { row: 0, column: 1 },
  { row: 0, column: -1 },
  { row: 1, column: 0 },
  { row: -1, column: 0 },
  { row: 1, column: 1 },
  { row: 1, column: -1 },
  { row: -1, column: 1 },
  { row: -1, column: -1 },
]

interface WordSearchCandidate {
  poolPosition: number
  value: string
  characters: string[]
}

function getWordSearchCandidates(words: readonly DailyGamesWordPayload[], random: () => number): WordSearchCandidate[] {
  const selectedValues = new Set<string>()
  return shuffle(words.map((word, poolPosition) => ({ poolPosition, value: word.character.trim(), characters: Array.from(word.character.trim()) })), random)
    .filter((word) => {
      const isEligible = word.characters.length > 0 && word.characters.length <= WORD_SEARCH_MAX_GRID_SIZE && !selectedValues.has(word.value)
      if (isEligible) selectedValues.add(word.value)
      return isEligible
    })
    .slice(0, WORD_SEARCH_MAX_TARGETS)
}

function getWordSearchGridSize(candidates: readonly WordSearchCandidate[]): number {
  const longestTarget = Math.max(...candidates.map(({ characters }) => characters.length), 0)
  const totalCharacters = candidates.reduce((total, { characters }) => total + characters.length, 0)
  return Math.min(
    WORD_SEARCH_MAX_GRID_SIZE,
    Math.max(WORD_SEARCH_MIN_GRID_SIZE, longestTarget, Math.ceil(Math.sqrt(totalCharacters * 2))),
  )
}

function getPath(start: WordSearchCoordinate, direction: WordSearchCoordinate, length: number): WordSearchCoordinate[] {
  return Array.from({ length }, (_, index) => ({
    row: start.row + direction.row * index,
    column: start.column + direction.column * index,
  }))
}

function canPlaceWord(grid: readonly (string | null)[][], characters: readonly string[], path: readonly WordSearchCoordinate[]): boolean {
  return path.every(({ row, column }, index) => grid[row]?.[column] === null || grid[row]?.[column] === characters[index])
}

function buildPlacedBoard(candidates: readonly WordSearchCandidate[], random: () => number): WordSearchBoard | null {
  const size = getWordSearchGridSize(candidates)
  const grid = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  const targets: WordSearchTarget[] = []
  for (const candidate of candidates) {
    const placements = shuffle(wordSearchDirections, random).flatMap((direction) => shuffle(
      Array.from({ length: size * size }, (_, index) => ({ row: Math.floor(index / size), column: index % size })),
      random,
    ).map((start) => ({ path: getPath(start, direction, candidate.characters.length), direction })))
      .filter(({ path }) => path.every(({ row, column }) => row >= 0 && row < size && column >= 0 && column < size))
    const placement = placements.find(({ path }) => canPlaceWord(grid, candidate.characters, path))
    if (!placement) return null
    placement.path.forEach(({ row, column }, index) => { grid[row][column] = candidate.characters[index] })
    targets.push({ id: `word-search-${candidate.poolPosition}`, poolPosition: candidate.poolPosition, value: candidate.value, path: placement.path })
  }
  let fillerIndex = 0
  return {
    grid: grid.map((row) => row.map((character) => {
      if (character !== null) return character
      const filler = WORD_SEARCH_FILLER_CHARACTERS[(fillerIndex + Math.floor(random() * WORD_SEARCH_FILLER_CHARACTERS.length)) % WORD_SEARCH_FILLER_CHARACTERS.length]
      fillerIndex += 1
      return filler
    })),
    isFallback: false,
    targets,
  }
}

function buildWordSearchFallback(seed: number, poolPosition: number | null): WordSearchBoard {
  const random = seededRandom(seed)
  const size = WORD_SEARCH_MIN_GRID_SIZE
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => WORD_SEARCH_FILLER_CHARACTERS[Math.floor(random() * WORD_SEARCH_FILLER_CHARACTERS.length)]))
  const characters = Array.from(WORD_SEARCH_FALLBACK_TARGET)
  const row = Math.floor(random() * size)
  const startColumn = Math.floor(random() * (size - characters.length + 1))
  const path = getPath({ row, column: startColumn }, { row: 0, column: 1 }, characters.length)
  path.forEach(({ row: targetRow, column }, index) => { grid[targetRow][column] = characters[index] })
  return {
    grid,
    isFallback: true,
    targets: [{ id: 'word-search-fallback', poolPosition, value: WORD_SEARCH_FALLBACK_TARGET, path }],
  }
}

export function buildWordSearch(words: readonly DailyGamesWordPayload[], seed: number): WordSearchBoard {
  const random = seededRandom(seed)
  const candidates = getWordSearchCandidates(words, random)
  return candidates.length === 0
    ? buildWordSearchFallback(seed, null)
    : buildPlacedBoard(candidates, random) ?? buildWordSearchFallback(seed, null)
}

export function buildShareResult(score: number, pairCount: number, mode: string): string {
  return DAILY_GAMES_COPY.shareFormat
    .replace('{score}', String(score))
    .replace('{pairCount}', String(pairCount))
    .replace('{mode}', mode)
}
