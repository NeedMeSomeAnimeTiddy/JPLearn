import { useEffect, useMemo, useRef, useState } from 'react'
import { RoundWork } from '../../round'
import { puzzleHead } from '../../menu/daily'
import type { DailyGamesMissedWordPayload, DailyGamesStatePayload } from '../../../generated/types'
import { CROSSWORD_COPY, DAILY_GAMES_COPY, PUZZLE_COPY, TYPING_BLITZ_COPY, WORD_SEARCH_COPY } from '../constants'
import type { DailyGamesAttemptRequest, DailyGameType, DailyGamesMode, DailyGamesSessionDependencies, PuzzleShell } from '../types'
import { buildMatchPairs, buildTypingBlitz, buildWordSearch, fillCopy, formatClock, pad2 } from '../utils'
import { buildCrossword } from '../crossword'
import { enrichCrosswordClues } from '../crosswordClues'
import { CrosswordGame } from './CrosswordGame'
import { MatchPairsGame } from './MatchPairsGame'
import { PuzzleEnding } from './PuzzleEnding'
import { PuzzlePlate } from './PuzzlePlate'
import { WordSearchGame } from './WordSearchGame'
import { TypingBlitzGame } from './TypingBlitzGame'

interface DailyGameSessionProps {
  mode: DailyGamesMode
  data: DailyGamesStatePayload
  dependencies: DailyGamesSessionDependencies
  gameType: DailyGameType
  onBack: () => void
  onStateUpdated?: (state: DailyGamesStatePayload) => void
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

/** each puzzle's own words for itself and for its result */
const PUZZLE_TEXT: Record<DailyGameType, { title: string; resultsTitle: string; dailyResults: string; practiceResults: string; saving: string }> = {
  crossword: { title: CROSSWORD_COPY.title, resultsTitle: CROSSWORD_COPY.resultsTitle, dailyResults: CROSSWORD_COPY.dailyResults, practiceResults: CROSSWORD_COPY.practiceResults, saving: CROSSWORD_COPY.saving },
  word_search: { title: WORD_SEARCH_COPY.title, resultsTitle: WORD_SEARCH_COPY.resultsTitle, dailyResults: WORD_SEARCH_COPY.dailyResults, practiceResults: WORD_SEARCH_COPY.practiceResults, saving: DAILY_GAMES_COPY.recordingResult },
  match_pairs: { title: DAILY_GAMES_COPY.matchPairsTitle, resultsTitle: DAILY_GAMES_COPY.resultsTitle, dailyResults: DAILY_GAMES_COPY.dailyResults, practiceResults: DAILY_GAMES_COPY.practiceResults, saving: DAILY_GAMES_COPY.recordingResult },
  typing_blitz: { title: TYPING_BLITZ_COPY.title, resultsTitle: TYPING_BLITZ_COPY.resultsTitle, dailyResults: TYPING_BLITZ_COPY.dailyResults, practiceResults: TYPING_BLITZ_COPY.practiceResults, saving: TYPING_BLITZ_COPY.saving },
}

function getAttemptMissedWords(pool: DailyGamesStatePayload['pool'], attempt: DailyGamesAttemptRequest): DailyGamesMissedWordPayload[] {
  return attempt.outcomes.flatMap((outcome) => {
    const word = pool.words[outcome.poolPosition]
    return outcome.outcome === 'incorrect' && word ? [{ word, miss_count: 1 }] : []
  })
}

export function DailyGameSession({ mode, data, dependencies, gameType, onBack, onStateUpdated, onReviewMissedWords }: DailyGameSessionProps) {
  /* THE SESSION OWNS ITS POOL. It is taken once, when the puzzle opens, and everything after --
     the setup, the board, the clues, the attempt, a failed save and its retry, the result -- reads
     only this. A later `data` (the state a save returns, the next day's pool at midnight) never
     re-runs the setup or swaps the board under the learner (audit 16, F4 and N1). */
  const [pool] = useState(() => data.pool)
  const [seed, setSeed] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [attempt, setAttempt] = useState<DailyGamesAttemptRequest | null>(null)
  const [result, setResult] = useState<{ score: number; pairCount: number; isFallback: boolean; missedWords: DailyGamesMissedWordPayload[] } | null>(null)
  const [crosswordBoard, setCrosswordBoard] = useState<ReturnType<typeof buildCrossword> | null>(null)
  const [spent, setSpent] = useState(0)
  const startedAt = useRef<number | null>(null)
  const attemptedTargetCount = useRef(0)
  const text = PUZZLE_TEXT[gameType]
  const unavailable = fillCopy(DAILY_GAMES_COPY.puzzleUnavailable, { title: text.title })

  useEffect(() => {
    let active = true
    const missing = fillCopy(DAILY_GAMES_COPY.puzzleUnavailable, { title: PUZZLE_TEXT[gameType].title })
    async function prepare(): Promise<void> {
      setIsLoading(true)
      setError(null)
      startedAt.current = null
      try {
        const nextSeed = mode === 'daily'
          ? pool.game_seeds[gameType]
          : (await dependencies.createPracticeSeed({ day: pool.day, gameType })).seed
        if (typeof nextSeed !== 'number') throw new Error(missing)
        if (active) {
          startedAt.current = dependencies.now().getTime()
          setSpent(0)
          setSeed(nextSeed)
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error && caught.message ? caught.message : missing)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void prepare()
    return () => { active = false }
  }, [pool, dependencies, gameType, mode])

  useEffect(() => {
    if (gameType !== 'crossword' || seed === null) {
      setCrosswordBoard(null)
      return
    }
    const fallbackBoard = buildCrossword(pool.words, seed)
    const controller = new AbortController()
    setCrosswordBoard(fallbackBoard)
    void enrichCrosswordClues(pool.day, fallbackBoard, dependencies.crosswordClues ?? {}, controller.signal)
      .then((enrichedBoard) => {
        if (!controller.signal.aborted) setCrosswordBoard(enrichedBoard)
      })
    return () => controller.abort()
  }, [pool, dependencies.crosswordClues, gameType, seed])

  /* THE SPENT CHIP. It counts while the board is in play and stops the moment the puzzle is over,
     so the figure the result shows is the one the attempt is recorded with. */
  const running = seed !== null && attempt === null && result === null
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const now = dependencies.now().getTime()
      setSpent(Math.floor((now - (startedAt.current ?? now)) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [dependencies, running])

  async function recordAttempt(nextAttempt: DailyGamesAttemptRequest, targetCount = attemptedTargetCount.current): Promise<void> {
    setAttempt(nextAttempt)
    setError(null)
    try {
      const nextState = await dependencies.recordAttempt(nextAttempt)
      onStateUpdated?.(nextState)
      setResult({ score: nextAttempt.score, pairCount: targetCount, isFallback: false, missedWords: getAttemptMissedWords(pool, nextAttempt) })
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : unavailable)
    }
  }

  function completeGame(next: { score: number; targetCount: number; outcomes: DailyGamesAttemptRequest['outcomes'] }): void {
    attemptedTargetCount.current = next.targetCount
    const now = dependencies.now().getTime()
    const durationSeconds = Math.floor((now - (startedAt.current ?? now)) / 1000)
    /* the SPENT chip stops on the figure that is recorded, not on the last tick of its interval */
    setSpent(durationSeconds)
    if (next.outcomes.length === 0) {
      setResult({ score: next.score, pairCount: next.targetCount, isFallback: true, missedWords: [] })
      return
    }
    void recordAttempt({
      day: pool.day,
      gameType,
      mode,
      score: next.score,
      completed: true,
      durationSeconds,
      outcomes: next.outcomes,
    }, next.targetCount)
  }

  const pairs = useMemo(() => (seed === null ? [] : buildMatchPairs(pool.words, seed)), [pool.words, seed])
  const wordSearchBoard = useMemo(() => (seed === null ? null : buildWordSearch(pool.words, seed)), [pool.words, seed])
  const typingBlitzWords = useMemo(() => (seed === null ? [] : buildTypingBlitz(pool.words, seed)), [pool.words, seed])
  const isSaving = attempt !== null && error === null

  const head = puzzleHead(gameType)
  const cap = mode === 'daily' ? fillCopy(PUZZLE_COPY.dailyCap, { count: pool.words.length }) : PUZZLE_COPY.practiceCap
  const spentChip = { key: 'spent', value: formatClock(spent), label: 'SPENT' }

  /* THE ENDING, IN ITS THREE STATES -- saving, the save that failed, and the result. All three are
     the work cell of the same sheet; the board you finished stays in the prompt cell beside them. */
  function ending(): PuzzleShell['ending'] {
    if (result) {
      const shownMode = result.isFallback ? 'practice' : mode
      return {
        run: [{ key: 'score', value: pad2(result.score), of: `/ ${result.pairCount}`, label: 'SCORE' }, spentChip],
        work: (
          <PuzzleEnding
            mode={shownMode}
            puzzle={text.title}
            title={text.resultsTitle}
            message={shownMode === 'daily' ? text.dailyResults : text.practiceResults}
            score={result.score}
            count={result.pairCount}
            clipboard={dependencies.clipboard}
            onDone={onBack}
            missedWords={result.missedWords}
            onReviewMissedWords={onReviewMissedWords}
          />
        ),
      }
    }
    if (attempt && error) {
      const failed = attempt
      return {
        work: (
          <RoundWork
            kick={PUZZLE_COPY.endKick}
            kickJp={PUZZLE_COPY.endKickJp}
            slab={{ text: PUZZLE_COPY.retrySlab, jp: PUZZLE_COPY.retrySlabJp, onClick: () => void recordAttempt(failed), label: DAILY_GAMES_COPY.retryGame }}
          >
            <div className="rd-plain" role="alert">
              <h2>{unavailable}</h2>
              <p className="rd-err">{error}</p>
            </div>
          </RoundWork>
        ),
      }
    }
    if (attempt) {
      return {
        work: (
          <RoundWork
            kick={PUZZLE_COPY.endKick}
            kickJp={PUZZLE_COPY.endKickJp}
            slab={{ text: PUZZLE_COPY.savingSlab, jp: PUZZLE_COPY.savingSlabJp, tone: 'calm' }}
          >
            <div className="rd-plain" role="status"><h2>{text.saving}</h2></div>
          </RoundWork>
        ),
      }
    }
    return null
  }

  const shell: PuzzleShell = {
    head,
    cap,
    hints: [PUZZLE_COPY.escHint],
    onBack,
    backAria: DAILY_GAMES_COPY.backToGames,
    spent: spentChip,
    ending: ending(),
  }

  function body() {
    if (isLoading) {
      return (
        <PuzzlePlate
          head={head}
          cap={PUZZLE_COPY.preparingCap}
          title={fillCopy(DAILY_GAMES_COPY.loadingGame, { title: text.title })}
          tone="status"
          slab={{ text: PUZZLE_COPY.waitSlab, jp: PUZZLE_COPY.waitSlabJp, tone: 'calm' }}
          onBack={onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      )
    }
    if (error && !attempt) {
      return (
        <PuzzlePlate
          head={head}
          cap={cap}
          title={unavailable}
          body={error === unavailable ? null : error}
          tone="alert"
          slab={{ text: PUZZLE_COPY.roadSlab, jp: PUZZLE_COPY.roadSlabJp, onClick: onBack }}
          onBack={onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      )
    }
    if (gameType === 'crossword' && crosswordBoard) {
      return <CrosswordGame board={crosswordBoard} isSaving={isSaving} onComplete={completeGame} shell={shell} />
    }
    if (gameType === 'word_search' && wordSearchBoard) {
      return <WordSearchGame board={wordSearchBoard} words={pool.words} isSaving={isSaving} onComplete={completeGame} shell={shell} />
    }
    if (gameType === 'match_pairs' && seed !== null) {
      return <MatchPairsGame pairs={pairs} isSaving={isSaving} onComplete={(next) => completeGame({ ...next, targetCount: pairs.length / 2 })} shell={shell} />
    }
    if (gameType === 'typing_blitz' && seed !== null) {
      return <TypingBlitzGame words={typingBlitzWords} isSaving={isSaving} onComplete={completeGame} shell={shell} />
    }
    return null
  }

  return (
    /* THE ESCAPE GUARD. Escape leaves -- unless an IME is composing, where it cancels the
       composition, or a puzzle has already used it for something of its own (word search
       cancelling a half-made selection), which it says by preventing the default. Either way it
       stops here so the app's own Escape does not walk a level up behind the puzzle's back. */
    <section
      className="dp-session"
      aria-label={text.title}
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
      {body()}
    </section>
  )
}
