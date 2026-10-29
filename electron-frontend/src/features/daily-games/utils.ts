import type { DailyGamesStatePayload, DailyGamesWordPayload } from '../../generated/types'
import { normalizeText } from '../../lib/deckUtils'
import {
  DAILY_GAMES_COPY,
  MATCH_PAIRS_MAX_WORDS,
  MATCH_PAIRS_MIN_WORDS,
  PUZZLE_ASK_W,
  PUZZLE_BOARD_GAP,
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

/**
 * Whether a word is written only in kana (with ー) and kanji (with 々), so every cell of a board
 * can be typed or found. Stored forms such as "いい; よい" or "パート (タイム)" carry spaces and
 * punctuation that a crossword cell can never match (audit 16, F2).
 */
export function isKanaKanjiWord(value: string): boolean {
  return /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]+$/u.test(value)
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
  /* two words written the same (市 "market", 市 "city") would show twin character tiles, so only
     the first of each is dealt (audit 16, F3); a pool without such a pair deals as before */
  const writtenForms = new Set<string>()
  const selected = shuffle(words.map((word, poolPosition) => ({ word, poolPosition })), random)
    .filter(({ word }) => {
      const written = word.character.trim()
      if (writtenForms.has(written)) return false
      writtenForms.add(written)
      return true
    })
    .slice(0, pairCount)
  const pairs = selected.flatMap(({ word, poolPosition }) => [
    { id: `${poolPosition}-character`, poolPosition, side: 'character' as const, value: word.character, word },
    { id: `${poolPosition}-meaning`, poolPosition, side: 'meaning' as const, value: word.meaning, word },
  ])
  return shuffle(pairs, random)
}

/**
 * Whether a character tile and a meaning tile make a pair: the same word, or a word whose meaning
 * reads the same as the meaning tile (青 and 青い are both "blue", so either "blue" tile counts;
 * audit 16, F3). No two dealt words are written the same, so tiles that belong together form
 * classes by meaning with as many character tiles as meaning tiles, and any accepted pick leaves
 * the board completable.
 */
export function pairsBelongTogether(characterTile: MatchPair, meaningTile: MatchPair): boolean {
  if (characterTile.poolPosition === meaningTile.poolPosition) return true
  const characterMeaning = characterTile.word?.meaning
  return characterMeaning !== undefined && normalizeText(characterMeaning) === normalizeText(meaningTile.value)
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
      const isEligible = word.characters.length > 0
        && word.characters.length <= WORD_SEARCH_MAX_GRID_SIZE
        && isKanaKanjiWord(word.value)
        && !selectedValues.has(word.value)
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

export function buildShareResult(score: number, pairCount: number, mode: string, title: string): string {
  return DAILY_GAMES_COPY.shareFormat
    .replace('{title}', title)
    .replace('{score}', String(score))
    .replace('{pairCount}', String(pairCount))
    .replace('{mode}', mode)
}

/* ==================================================================================================
   THE BOARD'S CELL, SOLVED FROM THE CELL IT STANDS IN.

   The prompt cell's content box is `PUZZLE_ASK_W` wide and a board is between seven and twelve
   columns, so the size is the width less the hairlines, shared out and floored -- a fraction of a
   pixel would blur every one of them. Twelve columns is the widest any builder makes and comes out
   at 22, which is what the IME's romaji tail is allowed to clip inside.
   ================================================================================================== */
export function boardCell(columns: number, width = PUZZLE_ASK_W, gap = PUZZLE_BOARD_GAP): number {
  const n = Math.max(1, columns)
  return Math.floor((width - (n - 1) * gap) / n)
}

/** mm:ss, for the run's clock chips */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

/** a count as the chips print it -- two figures, the way the round prints its own */
export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** fill a `{name}` copy template */
export function fillCopy(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template)
}
