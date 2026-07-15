import type { CrosswordBoard } from './types'
import { CROSSWORD_MAX_CLUE_LENGTH } from './constants'

export interface CrosswordClueRequest {
  poolPosition: number
  answer: string
  reading?: string
  fallbackClue: string
}

export interface CrosswordClueResponse {
  poolPosition: number
  clue: string
}

export interface CrosswordClueDependencies {
  getCachedClues?: (day: string) => Promise<unknown>
  saveCachedClues?: (day: string, clues: CrosswordClueResponse[]) => Promise<unknown>
  generateClues?: (entries: CrosswordClueRequest[]) => Promise<unknown>
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 8_000
const JAPANESE_SCRIPT_PATTERN = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u

function normalize(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase()
}

function requestedEntries(board: CrosswordBoard): CrosswordClueRequest[] {
  return board.entries.flatMap((entry) => entry.poolPosition === null ? [] : [{
    poolPosition: entry.poolPosition,
    answer: entry.answer,
    reading: entry.reading,
    fallbackClue: entry.clue,
  }])
}

function parseClues(value: unknown, requested: readonly CrosswordClueRequest[]): Map<number, string> | null {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== requested.length) return null

  const requestedByPosition = new Map(requested.map((entry) => [entry.poolPosition, entry]))
  const clues = new Map<number, string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null
    const poolPosition = (item as { poolPosition?: unknown }).poolPosition
    const clue = (item as { clue?: unknown }).clue
    if (!Number.isInteger(poolPosition) || typeof clue !== 'string') return null
    const position = poolPosition as number
    const requestedEntry = requestedByPosition.get(position)
    const normalizedClue = clue.trim()
    if (!requestedEntry || clues.has(position) || !normalizedClue || normalizedClue.length > CROSSWORD_MAX_CLUE_LENGTH) return null
    if (JAPANESE_SCRIPT_PATTERN.test(normalizedClue)) return null
    if (normalize(normalizedClue).includes(normalize(requestedEntry.answer))) return null
    const normalizedReading = normalize(requestedEntry.reading ?? '').trim()
    const clueWords = normalize(normalizedClue).split(/[^a-z0-9]+/u)
    if (normalizedReading && clueWords.includes(normalizedReading)) return null
    clues.set(position, normalizedClue)
  }
  return clues.size === requested.length ? clues : null
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let timeout: number | undefined
  const cancelled = new Promise<T>((_resolve, reject) => {
    if (!signal) return
    if (signal.aborted) {
      reject(new Error('Crossword clue request cancelled'))
      return
    }
    signal.addEventListener('abort', () => reject(new Error('Crossword clue request cancelled')), { once: true })
  })
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = window.setTimeout(() => reject(new Error('Crossword clue request timed out')), timeoutMs)
      }),
      cancelled,
    ])
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout)
  }
}

function applyClues(board: CrosswordBoard, clues: ReadonlyMap<number, string>): CrosswordBoard {
  return {
    ...board,
    entries: board.entries.map((entry) => entry.poolPosition === null
      ? entry
      : { ...entry, clue: clues.get(entry.poolPosition) ?? entry.clue }),
  }
}

/** Uses only validated, complete clue sets. Every failure intentionally leaves fallback meanings in place. */
export async function enrichCrosswordClues(
  day: string,
  board: CrosswordBoard,
  dependencies: CrosswordClueDependencies,
  signal?: AbortSignal,
): Promise<CrosswordBoard> {
  const requested = requestedEntries(board)
  if (requested.length === 0 || signal?.aborted) return board

  try {
    const cached = dependencies.getCachedClues ? await dependencies.getCachedClues(day) : null
    const cachedClues = parseClues(cached, requested)
    if (cachedClues) return applyClues(board, cachedClues)
  } catch {
    // Cache availability is optional.
  }

  if (!dependencies.generateClues || signal?.aborted) return board
  try {
    const generated = await withTimeout(dependencies.generateClues(requested), dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal)
    if (signal?.aborted) return board
    const clues = parseClues(generated, requested)
    if (!clues) return board
    const accepted = [...clues.entries()].map(([poolPosition, clue]) => ({ poolPosition, clue }))
    try {
      const saved = await dependencies.saveCachedClues?.(day, accepted)
      const stableClues = parseClues(saved, requested)
      if (stableClues) return applyClues(board, stableClues)
    } catch {
      // Durable cache failures must not change accepted renderer state.
    }
    return applyClues(board, clues)
  } catch {
    return board
  }
}

export function getCrosswordClueRequests(board: CrosswordBoard): CrosswordClueRequest[] {
  return requestedEntries(board)
}
