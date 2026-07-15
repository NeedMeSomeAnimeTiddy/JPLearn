import type { DailyGamesStatePayload, DailyGamesWordPayload } from '../../generated/types'
import type { CrosswordClueDependencies } from './crosswordClues'

export type DailyGamesMode = 'daily' | 'practice'
export type DailyGameType = 'crossword' | 'word_search' | 'match_pairs' | 'typing_blitz'

export interface DailyGamesAttemptOutcomeInput {
  poolPosition: number
  outcome: 'correct' | 'incorrect'
}

export interface DailyGamesPracticeSeedRequest {
  day: string
  gameType: DailyGameType
}

export interface DailyGamesAttemptRequest extends DailyGamesPracticeSeedRequest {
  mode: DailyGamesMode
  score: number
  completed: boolean
  durationSeconds?: number
  outcomes: DailyGamesAttemptOutcomeInput[]
}

export interface DailyGamesClipboard {
  writeText: (value: string) => Promise<void>
}

export interface DailyGamesApi {
  getState: (day: string) => Promise<DailyGamesStatePayload>
  createPracticeSeed: (payload: DailyGamesPracticeSeedRequest) => Promise<{ seed: number }>
  recordAttempt: (payload: DailyGamesAttemptRequest) => Promise<DailyGamesStatePayload>
}

export interface DailyGamesClock {
  now: () => Date
}

export interface DailyGamesDependencies extends DailyGamesApi, DailyGamesClock {}

export interface DailyGamesSessionDependencies extends DailyGamesDependencies {
  clipboard: DailyGamesClipboard
  crosswordClues?: CrosswordClueDependencies
}

export interface MatchPair {
  id: string
  poolPosition: number
  side: 'character' | 'meaning'
  value: string
  word: DailyGamesWordPayload
}

export interface TypingBlitzWord {
  poolPosition: number
  word: DailyGamesWordPayload
}

export interface WordSearchCoordinate {
  row: number
  column: number
}

export interface WordSearchTarget {
  id: string
  poolPosition: number | null
  value: string
  path: WordSearchCoordinate[]
}

export interface WordSearchBoard {
  grid: string[][]
  isFallback: boolean
  targets: WordSearchTarget[]
}

export interface CrosswordCoordinate {
  row: number
  column: number
}

export type CrosswordDirection = 'across' | 'down'

export interface CrosswordIntersection {
  coordinate: CrosswordCoordinate
  character: string
  withEntryId: string
}

export interface CrosswordEntry {
  id: string
  poolPosition: number | null
  answer: string
  reading?: string
  clue: string
  direction: CrosswordDirection
  cells: CrosswordCoordinate[]
  intersections: CrosswordIntersection[]
}

export interface CrosswordBoard {
  grid: Array<Array<string | null>>
  entries: CrosswordEntry[]
  isFallback: boolean
  fallbackReason: 'no-suitable-answers' | null
  work: {
    sourceWords: number
    candidatePlacements: number
    solverSteps: number
  }
}

export interface DailyGamesState {
  data: DailyGamesStatePayload | null
  error: string | null
  isLoading: boolean
  mode: DailyGamesMode
  retry: () => void
  setMode: (mode: DailyGamesMode) => void
  replaceData: (data: DailyGamesStatePayload) => void
}
