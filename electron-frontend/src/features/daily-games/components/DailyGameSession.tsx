import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { DailyGamesMissedWordPayload, DailyGamesStatePayload } from '../../../generated/types'
import { CROSSWORD_COPY, DAILY_GAMES_COPY, TYPING_BLITZ_COPY, WORD_SEARCH_COPY } from '../constants'
import type { DailyGamesAttemptRequest, DailyGamesMode, DailyGamesSessionDependencies } from '../types'
import { buildMatchPairs, buildTypingBlitz, buildWordSearch } from '../utils'
import { buildCrossword } from '../crossword'
import { enrichCrosswordClues } from '../crosswordClues'
import { CrosswordGame } from './CrosswordGame'
import { GameResultsOverlay } from './GameResultsOverlay'
import { MatchPairsGame } from './MatchPairsGame'
import { WordSearchGame } from './WordSearchGame'
import { TypingBlitzGame } from './TypingBlitzGame'

interface DailyGameSessionProps {
  mode: DailyGamesMode
  data: DailyGamesStatePayload
  dependencies: DailyGamesSessionDependencies
  gameType: 'crossword' | 'match_pairs' | 'word_search' | 'typing_blitz'
  onBack: () => void
  onStateUpdated?: (state: DailyGamesStatePayload) => void
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

function getAttemptMissedWords(data: DailyGamesStatePayload, attempt: DailyGamesAttemptRequest): DailyGamesMissedWordPayload[] {
  return attempt.outcomes.flatMap((outcome) => {
    const word = data.pool.words[outcome.poolPosition]
    return outcome.outcome === 'incorrect' && word ? [{ word, miss_count: 1 }] : []
  })
}

export function DailyGameSession({ mode, data, dependencies, gameType, onBack, onStateUpdated, onReviewMissedWords }: DailyGameSessionProps) {
  const [seed, setSeed] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [attempt, setAttempt] = useState<DailyGamesAttemptRequest | null>(null)
  const [result, setResult] = useState<{ score: number; pairCount: number; isFallback: boolean; missedWords: DailyGamesMissedWordPayload[] } | null>(null)
  const [crosswordBoard, setCrosswordBoard] = useState<ReturnType<typeof buildCrossword> | null>(null)
  const startedAt = useRef<number | null>(null)
  const attemptedTargetCount = useRef(0)

  useEffect(() => {
    let active = true
    async function prepare(): Promise<void> {
      setIsLoading(true)
      setError(null)
      startedAt.current = null
      try {
        const nextSeed = mode === 'daily'
          ? data.pool.game_seeds[gameType]
          : (await dependencies.createPracticeSeed({ day: data.pool.day, gameType })).seed
        if (typeof nextSeed !== 'number') throw new Error(DAILY_GAMES_COPY.gameUnavailable)
        if (active) {
          startedAt.current = dependencies.now().getTime()
          setSeed(nextSeed)
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error && caught.message ? caught.message : DAILY_GAMES_COPY.gameUnavailable)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void prepare()
    return () => { active = false }
  }, [data.pool.day, data.pool.game_seeds, dependencies, gameType, mode])

  useEffect(() => {
    if (gameType !== 'crossword' || seed === null) {
      setCrosswordBoard(null)
      return
    }
    const fallbackBoard = buildCrossword(data.pool.words, seed)
    const controller = new AbortController()
    setCrosswordBoard(fallbackBoard)
    void enrichCrosswordClues(data.pool.day, fallbackBoard, dependencies.crosswordClues ?? {}, controller.signal)
      .then((enrichedBoard) => {
        if (!controller.signal.aborted) setCrosswordBoard(enrichedBoard)
      })
    return () => controller.abort()
  }, [data.pool.day, data.pool.words, dependencies.crosswordClues, gameType, seed])

  async function recordAttempt(nextAttempt: DailyGamesAttemptRequest, targetCount = attemptedTargetCount.current): Promise<void> {
    setAttempt(nextAttempt)
    setError(null)
    try {
      const nextState = await dependencies.recordAttempt(nextAttempt)
      onStateUpdated?.(nextState)
      setResult({ score: nextAttempt.score, pairCount: targetCount, isFallback: false, missedWords: getAttemptMissedWords(data, nextAttempt) })
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : DAILY_GAMES_COPY.gameUnavailable)
    }
  }

  function completeGame(next: { score: number; targetCount: number; outcomes: DailyGamesAttemptRequest['outcomes'] }): void {
    attemptedTargetCount.current = next.targetCount
    if (next.outcomes.length === 0) {
      setResult({ score: next.score, pairCount: next.targetCount, isFallback: true, missedWords: [] })
      return
    }
    void recordAttempt({
      day: data.pool.day,
      gameType,
      mode,
      score: next.score,
      completed: true,
      durationSeconds: Math.floor((dependencies.now().getTime() - (startedAt.current ?? dependencies.now().getTime())) / 1000),
      outcomes: next.outcomes,
    }, next.targetCount)
  }

  const pairs = seed === null ? [] : buildMatchPairs(data.pool.words, seed)
  const wordSearchBoard = seed === null ? null : buildWordSearch(data.pool.words, seed)
  const typingBlitzWords = seed === null ? [] : buildTypingBlitz(data.pool.words, seed)
  const title = gameType === 'crossword' ? CROSSWORD_COPY.title : gameType === 'word_search' ? WORD_SEARCH_COPY.title : gameType === 'typing_blitz' ? TYPING_BLITZ_COPY.title : DAILY_GAMES_COPY.matchPairsTitle
  return (
    <main
      className="daily-game-session"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        if (event.defaultPrevented || event.nativeEvent.isComposing) {
          event.stopPropagation()
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onBack()
      }}
    >
      <button type="button" className="daily-games-back" onClick={onBack}><ArrowLeft aria-hidden="true" size={18} />{DAILY_GAMES_COPY.backToGames}</button>
      {isLoading ? <div className="daily-games-skeleton" role="status" aria-label={DAILY_GAMES_COPY.loadingGame}><span /><span /></div> : null}
       {!isLoading && error && !attempt ? <section className="daily-games-state" role="alert"><h2>{DAILY_GAMES_COPY.gameUnavailable}</h2><p>{error}</p><button type="button" className="daily-games-retry" onClick={onBack}>{DAILY_GAMES_COPY.retryGame}</button></section> : null}
       {!isLoading && crosswordBoard && !result && gameType === 'crossword' ? <CrosswordGame board={crosswordBoard} isSaving={attempt !== null && error === null} onComplete={completeGame} /> : null}
       {!isLoading && seed !== null && !result && gameType === 'match_pairs' ? <MatchPairsGame pairs={pairs} isSaving={attempt !== null && error === null} onComplete={(next) => completeGame({ ...next, targetCount: pairs.length / 2 })} /> : null}
      {!isLoading && wordSearchBoard && !result && gameType === 'word_search' ? <WordSearchGame board={wordSearchBoard} isSaving={attempt !== null && error === null} onComplete={completeGame} /> : null}
      {!isLoading && seed !== null && !result && gameType === 'typing_blitz' ? <TypingBlitzGame words={typingBlitzWords} isSaving={attempt !== null && error === null} onComplete={completeGame} /> : null}
      {attempt && error ? <section className="daily-games-state" role="alert"><h2>{DAILY_GAMES_COPY.gameUnavailable}</h2><p>{error}</p><button type="button" className="daily-games-retry" onClick={() => void recordAttempt(attempt)}>{DAILY_GAMES_COPY.retryGame}</button></section> : null}
        {result ? <GameResultsOverlay mode={result.isFallback ? 'practice' : mode} score={result.score} pairCount={result.pairCount} clipboard={dependencies.clipboard} onDone={onBack} missedWords={result.missedWords} onReviewMissedWords={onReviewMissedWords} {...(gameType === 'crossword' ? { title: CROSSWORD_COPY.resultsTitle, dailyResults: CROSSWORD_COPY.dailyResults, practiceResults: CROSSWORD_COPY.practiceResults, countLabel: CROSSWORD_COPY.words } : gameType === 'word_search' ? { title: WORD_SEARCH_COPY.resultsTitle, dailyResults: WORD_SEARCH_COPY.dailyResults, practiceResults: WORD_SEARCH_COPY.practiceResults, countLabel: WORD_SEARCH_COPY.words } : gameType === 'typing_blitz' ? { title: TYPING_BLITZ_COPY.resultsTitle, dailyResults: TYPING_BLITZ_COPY.dailyResults, practiceResults: TYPING_BLITZ_COPY.practiceResults, countLabel: TYPING_BLITZ_COPY.words } : {})} /> : null}
    </main>
  )
}
