import { Grid2X2, Keyboard, Search, Shuffle } from 'lucide-react'
import type { DailyGamesMode } from './types'

export const DAILY_GAMES_COPY = {
  title: 'Daily Games',
  back: 'Back to Home',
  loading: 'Loading today’s games',
  unavailable: 'Daily Games is unavailable right now.',
  retry: 'Try again',
  emptyTitle: 'Build your game pool',
  emptyBody: 'Add words to a deck, then return to find today’s game set.',
  dailyMode: 'Daily',
  practiceMode: 'Practice',
  dailyDescription: 'A shared set of four games for today’s study pool.',
  practiceDescription: 'Practice uses your available words without changing today’s progress.',
  streak: 'Daily streak',
  freezes: 'Freezes',
  new: 'New',
  complete: 'Complete',
  practice: 'Practice',
  play: 'Play',
  matchPairsHint: 'Match each Japanese word with its meaning.',
  typingBlitzHint: 'Type each Japanese word before time runs out.',
  loadingGame: 'Preparing Match Pairs',
  gameUnavailable: 'Match Pairs is unavailable right now.',
  backToGames: 'Back to games',
  retryGame: 'Try again',
  matchPairsTitle: 'Match Pairs',
  matchPairsInstructions: 'Select a Japanese word, then its matching meaning.',
  matchPairsProgress: 'Pairs matched',
  matchPairsComplete: 'All pairs matched.',
  matchPairsSelection: 'Selected {value}. Choose its match.',
  matchPairsMatched: '{value} matched.',
  matchPairsMismatched: '{first} and {second} do not match.',
  recordingResult: 'Saving your result',
  resultsTitle: 'Match Pairs complete',
  dailyResults: 'Today’s Match Pairs is complete and your streak has been updated.',
  practiceResults: 'Practice complete. Today’s daily progress and streak are unchanged.',
  score: 'Score',
  pairs: 'Pairs',
  share: 'Share result',
  shareSuccess: 'Result copied to your clipboard.',
  shareFailure: 'Could not copy the result. Try again.',
  shareFormat: 'JPLearn Match Pairs: {score}/{pairCount} pairs matched ({mode}).',
  reviewMissedWords: 'Review missed words',
  reviewingMissedWords: 'Opening review',
  reviewMissedWordsFailure: 'Could not open missed-word review. Try again.',
  done: 'Done',
} as const

export const TYPING_BLITZ_MAX_WORDS = 10
export const TYPING_BLITZ_DURATION_SECONDS = 60

export const TYPING_BLITZ_COPY = {
  title: 'Typing Blitz',
  instructions: 'Type the Japanese word shown. Press Enter to check your answer.',
  progress: 'Words completed',
  timeRemaining: 'Time remaining',
  target: 'Japanese target',
  reading: 'Reading',
  meaning: 'Meaning',
  inputLabel: 'Type the Japanese word',
  inputPlaceholder: 'Type in Japanese',
  submit: 'Check answer',
  correct: 'Correct.',
  incorrect: 'Not quite. Moving to the next word.',
  saving: 'Saving your result',
  resultsTitle: 'Typing Blitz complete',
  dailyResults: 'Today’s Typing Blitz is complete and your streak has been updated.',
  practiceResults: 'Practice complete. Today’s daily progress and streak are unchanged.',
  words: 'Words',
} as const

export const DAILY_GAMES_MODES: ReadonlyArray<{ value: DailyGamesMode; label: string }> = [
  { value: 'daily', label: DAILY_GAMES_COPY.dailyMode },
  { value: 'practice', label: DAILY_GAMES_COPY.practiceMode },
]

export const DAILY_GAME_TILES = [
  { type: 'crossword', title: 'Crossword', icon: Grid2X2 },
  { type: 'word_search', title: 'Word Search', icon: Search },
  { type: 'match_pairs', title: 'Match Pairs', icon: Shuffle },
  { type: 'typing_blitz', title: 'Typing Blitz', icon: Keyboard },
] as const

export const MATCH_PAIRS_MIN_WORDS = 8
export const MATCH_PAIRS_MAX_WORDS = 12

export const WORD_SEARCH_MIN_GRID_SIZE = 8
export const WORD_SEARCH_MAX_GRID_SIZE = 12
export const WORD_SEARCH_MAX_TARGETS = 8
export const WORD_SEARCH_FALLBACK_TARGET = '練習'
export const WORD_SEARCH_FILLER_CHARACTERS = Array.from('あいうえおかきくけこさしすせそたちつてとなにぬねの')

export const WORD_SEARCH_COPY = {
  title: 'Word Search',
  hint: 'Find each Japanese word in the grid.',
  instructions: 'Select a starting cell, then select the last cell in a horizontal, vertical, or diagonal line. You can drag across cells, or use arrow keys and Enter or Space.',
  progress: 'Words found',
  targetList: 'Words to find',
  found: 'Found',
  selectionReady: 'Starting cell selected. Choose the last cell.',
  selectionInvalid: 'That line does not match a word. Try another line.',
  selectionCancelled: 'Selection cancelled.',
  selectionMatched: 'Word found.',
  cellLabel: 'Row {row}, column {column}: {character}',
  boardLabel: 'Word Search board',
  resultsTitle: 'Word Search complete',
  dailyResults: 'Today’s Word Search is complete and your streak has been updated.',
  practiceResults: 'Practice complete. Today’s daily progress and streak are unchanged.',
  words: 'Words',
} as const

export const CROSSWORD_MIN_GRID_SIZE = 7
export const CROSSWORD_MAX_GRID_SIZE = 12
export const CROSSWORD_MAX_TARGETS = 6
export const CROSSWORD_MIN_TARGETS = 2
export const CROSSWORD_MAX_SOURCE_WORDS = 32
export const CROSSWORD_MAX_CANDIDATE_PLACEMENTS = 96
export const CROSSWORD_MAX_SOLVER_STEPS = 384
export const CROSSWORD_MAX_CLUE_LENGTH = 120
export const CROSSWORD_FALLBACK_ANSWER = '練習'

export const CROSSWORD_COPY = {
  title: 'Crossword',
  hint: 'Fill the Japanese crossword from its English clues.',
  instructions: 'Choose a clue, then fill its Japanese answer. Use arrow keys to move between cells and submit when you are ready.',
  clueList: 'Clues',
  currentClue: 'Current clue',
  clueLabel: 'Clue {number}: {clue}',
  cellLabel: 'Row {row}, column {column}',
  boardLabel: 'Crossword board',
  submit: 'Check crossword',
  complete: 'Crossword complete.',
  incomplete: 'Check the clues and try again.',
  saving: 'Saving your result',
  resultsTitle: 'Crossword complete',
  dailyResults: 'Today’s Crossword is complete and your streak has been updated.',
  practiceResults: 'Practice complete. Today’s daily progress and streak are unchanged.',
  words: 'Words',
  fallbackClue: 'Practice',
} as const
