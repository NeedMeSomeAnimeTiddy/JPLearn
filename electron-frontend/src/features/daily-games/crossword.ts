import type { DailyGamesWordPayload } from '../../generated/types'
import {
  CROSSWORD_MAX_CANDIDATE_PLACEMENTS,
  CROSSWORD_MAX_CLUE_LENGTH,
  CROSSWORD_MAX_GRID_SIZE,
  CROSSWORD_MAX_SOLVER_STEPS,
  CROSSWORD_MAX_SOURCE_WORDS,
  CROSSWORD_MAX_TARGETS,
  CROSSWORD_FALLBACK_ANSWER,
  CROSSWORD_MIN_GRID_SIZE,
  CROSSWORD_MIN_TARGETS,
  CROSSWORD_COPY,
} from './constants'
import type { CrosswordBoard, CrosswordCoordinate, CrosswordDirection, CrosswordEntry } from './types'

interface CrosswordCandidate {
  poolPosition: number
  answer: string
  reading: string
  characters: string[]
  clue: string
}

interface CrosswordPlacement {
  cells: CrosswordCoordinate[]
  direction: CrosswordDirection
}

interface CrosswordWork {
  sourceWords: number
  candidatePlacements: number
  solverSteps: number
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

function getCandidates(words: readonly DailyGamesWordPayload[], random: () => number): CrosswordCandidate[] {
  const answers = new Set<string>()
  return shuffle(words.slice(0, CROSSWORD_MAX_SOURCE_WORDS).map((word, poolPosition) => {
    const answer = word.character.length <= CROSSWORD_MAX_GRID_SIZE ? word.character.trim() : ''
    const meaning = word.meaning.length <= CROSSWORD_MAX_CLUE_LENGTH ? word.meaning.trim() : ''
    const reading = word.romaji.length <= CROSSWORD_MAX_CLUE_LENGTH ? word.romaji.trim() : ''
    return { poolPosition, answer, reading, characters: Array.from(answer), clue: meaning || reading }
  }), random)
    .filter((candidate) => {
      const isEligible = candidate.characters.length >= 2
        && candidate.characters.length <= CROSSWORD_MAX_GRID_SIZE
        && candidate.clue.length > 0
        && !answers.has(candidate.answer)
      if (isEligible) answers.add(candidate.answer)
      return isEligible
    })
    .slice(0, CROSSWORD_MAX_TARGETS)
}

function getGridSize(candidates: readonly CrosswordCandidate[]): number {
  const longestAnswer = Math.max(...candidates.map((candidate) => candidate.characters.length), CROSSWORD_MIN_GRID_SIZE)
  return Math.min(CROSSWORD_MAX_GRID_SIZE, Math.max(CROSSWORD_MIN_GRID_SIZE, longestAnswer + 2))
}

function getPath(start: CrosswordCoordinate, direction: CrosswordDirection, length: number): CrosswordCoordinate[] {
  const vector = direction === 'across' ? { row: 0, column: 1 } : { row: 1, column: 0 }
  return Array.from({ length }, (_, index) => ({ row: start.row + vector.row * index, column: start.column + vector.column * index }))
}

function isInBounds(cells: readonly CrosswordCoordinate[], size: number): boolean {
  return cells.every(({ row, column }) => row >= 0 && row < size && column >= 0 && column < size)
}

function coordinateKey({ row, column }: CrosswordCoordinate): string {
  return `${row}-${column}`
}

function canPlace(
  grid: readonly (string | null)[][],
  characters: readonly string[],
  cells: readonly CrosswordCoordinate[],
  direction: CrosswordDirection,
  entries: readonly CrosswordEntry[],
): boolean {
  let crossings = 0
  for (const [index, cell] of cells.entries()) {
    const existingCharacter = grid[cell.row][cell.column]
    if (existingCharacter === null) continue
    if (existingCharacter !== characters[index]) return false
    const overlaps = entries.filter((entry) => entry.cells.some((item) => coordinateKey(item) === coordinateKey(cell)))
    if (overlaps.length !== 1 || overlaps[0].direction === direction) return false
    crossings += 1
  }
  return crossings === 1
}

function getCrossingPlacements(
  candidate: CrosswordCandidate,
  entries: readonly CrosswordEntry[],
  size: number,
  work: CrosswordWork,
): CrosswordPlacement[] {
  const placements: CrosswordPlacement[] = []
  const placementKeys = new Set<string>()
  for (const entry of entries) {
    const direction: CrosswordDirection = entry.direction === 'across' ? 'down' : 'across'
    for (const cell of entry.cells) {
      const existingCharacterIndex = entry.cells.findIndex((item) => coordinateKey(item) === coordinateKey(cell))
      const existingCharacter = Array.from(entry.answer)[existingCharacterIndex]
      for (const [candidateIndex, character] of candidate.characters.entries()) {
        if (character !== existingCharacter || work.candidatePlacements >= CROSSWORD_MAX_CANDIDATE_PLACEMENTS) continue
        const start = direction === 'across'
          ? { row: cell.row, column: cell.column - candidateIndex }
          : { row: cell.row - candidateIndex, column: cell.column }
        const cells = getPath(start, direction, candidate.characters.length)
        work.candidatePlacements += 1
        const key = `${direction}-${coordinateKey(start)}`
        if (isInBounds(cells, size) && !placementKeys.has(key)) {
          placementKeys.add(key)
          placements.push({ cells, direction })
        }
      }
    }
  }
  return placements
}

function buildFallback(work: CrosswordWork): CrosswordBoard {
  const size = CROSSWORD_MIN_GRID_SIZE
  const answer = CROSSWORD_FALLBACK_ANSWER
  const cells = getPath({ row: Math.floor(size / 2), column: Math.floor((size - Array.from(answer).length) / 2) }, 'across', Array.from(answer).length)
  const grid = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  cells.forEach((cell, index) => { grid[cell.row][cell.column] = Array.from(answer)[index] })
  return {
    grid,
    isFallback: true,
    fallbackReason: 'no-suitable-answers',
    work,
    entries: [{ id: 'crossword-fallback', poolPosition: null, answer, clue: CROSSWORD_COPY.fallbackClue, direction: 'across', cells, intersections: [] }],
  }
}

function addIntersections(entries: CrosswordEntry[], grid: readonly (string | null)[][]): CrosswordEntry[] {
  return entries.map((entry) => ({
    ...entry,
    intersections: entry.cells.flatMap((coordinate) => entries
      .filter((candidate) => candidate.id !== entry.id && candidate.cells.some((cell) => coordinateKey(cell) === coordinateKey(coordinate)))
      .map((candidate) => ({ coordinate, character: grid[coordinate.row][coordinate.column] as string, withEntryId: candidate.id }))),
  }))
}

export function buildCrossword(words: readonly DailyGamesWordPayload[], seed: number): CrosswordBoard {
  const random = seededRandom(seed)
  const work: CrosswordWork = { sourceWords: Math.min(words.length, CROSSWORD_MAX_SOURCE_WORDS), candidatePlacements: 0, solverSteps: 0 }
  const candidates = getCandidates(words, random)
  if (candidates.length < CROSSWORD_MIN_TARGETS) return buildFallback(work)

  const size = getGridSize(candidates)
  const grid = Array.from({ length: size }, () => Array<string | null>(size).fill(null))
  const firstCandidate = candidates[0]
  const firstCells = getPath(
    { row: Math.floor(size / 2), column: Math.floor((size - firstCandidate.characters.length) / 2) },
    'across',
    firstCandidate.characters.length,
  )
  if (!isInBounds(firstCells, size)) return buildFallback(work)
  firstCells.forEach((cell, index) => { grid[cell.row][cell.column] = firstCandidate.characters[index] })
  const entries: CrosswordEntry[] = [{
    id: `crossword-${firstCandidate.poolPosition}`,
    poolPosition: firstCandidate.poolPosition,
    answer: firstCandidate.answer,
    reading: firstCandidate.reading,
    clue: firstCandidate.clue,
    direction: 'across',
    cells: firstCells,
    intersections: [],
  }]

  for (const candidate of candidates.slice(1)) {
    if (work.solverSteps >= CROSSWORD_MAX_SOLVER_STEPS || work.candidatePlacements >= CROSSWORD_MAX_CANDIDATE_PLACEMENTS) break
    const placements = shuffle(getCrossingPlacements(candidate, entries, size, work), random)
    const placement = placements.find((option) => {
      if (work.solverSteps >= CROSSWORD_MAX_SOLVER_STEPS) return false
      work.solverSteps += 1
      return canPlace(grid, candidate.characters, option.cells, option.direction, entries)
    })
    if (!placement) continue
    placement.cells.forEach((cell, index) => { grid[cell.row][cell.column] = candidate.characters[index] })
    entries.push({
      id: `crossword-${candidate.poolPosition}`,
      poolPosition: candidate.poolPosition,
      answer: candidate.answer,
      reading: candidate.reading,
      clue: candidate.clue,
      direction: placement.direction,
      cells: placement.cells,
      intersections: [],
    })
  }

  if (entries.length < CROSSWORD_MIN_TARGETS) return buildFallback(work)
  return { grid, entries: addIntersections(entries, grid), isFallback: false, fallbackReason: null, work }
}
