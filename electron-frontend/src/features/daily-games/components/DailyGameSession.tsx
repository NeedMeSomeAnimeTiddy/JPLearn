import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { RoundWork } from '../../round'
import { puzzleHead } from '../../menu/daily'
import type { DailyGamesMissedWordPayload, DailyGamesStatePayload } from '../../../generated/types'
import { CROSSWORD_COPY, DAILY_GAMES_COPY, PUZZLE_COPY, TYPING_BLITZ_COPY, WORD_SEARCH_COPY } from '../constants'
import type { DailyGamesAttemptRequest, DailyGameType, DailyGamesMode, DailyGamesSessionDependencies, PuzzleShell } from '../types'
import { buildMatchPairs, buildTypingBlitz, buildWordSearch, fillCopy, formatClock, pad2 } from '../utils'
import { buildCrossword } from '../crossword'
import { enrichCrosswordClues } from '../crosswordClues'
import { CrosswordGame } from './CrosswordGame'
import { GameResultsOverlay } from './GameResultsOverlay'
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

/* shortcut: the puzzles not yet moved onto the sheet keep their old board and result overlay until
   their own step of the build order lands; this set empties as they move */
const ON_THE_SHEET: ReadonlySet<DailyGameType> = new Set(['typing_blitz', 'match_pairs'])

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
  const [spent, setSpent] = useState(0)
  const startedAt = useRef<number | null>(null)
  const attemptedTargetCount = useRef(0)
  const text = PUZZLE_TEXT[gameType]

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
          setSpent(0)
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

  const pairs = useMemo(() => (seed === null ? [] : buildMatchPairs(data.pool.words, seed)), [data.pool.words, seed])
  const wordSearchBoard = useMemo(() => (seed === null ? null : buildWordSearch(data.pool.words, seed)), [data.pool.words, seed])
  const typingBlitzWords = useMemo(() => (seed === null ? [] : buildTypingBlitz(data.pool.words, seed)), [data.pool.words, seed])
  const isSaving = attempt !== null && error === null

  const head = puzzleHead(gameType)
  const cap = mode === 'daily' ? fillCopy(PUZZLE_COPY.dailyCap, { count: data.pool.words.length }) : PUZZLE_COPY.practiceCap
  const spentChip = { key: 'spent', value: formatClock(spent), label: PUZZLE_COPY.spent }

  /* THE ENDING, IN ITS THREE STATES -- saving, the save that failed, and the result. All three are
     the work cell of the same sheet; the board you finished stays in the prompt cell beside them. */
  function ending(): PuzzleShell['ending'] {
    if (result) {
      const shownMode = result.isFallback ? 'practice' : mode
      return {
        run: [{ key: 'score', value: pad2(result.score), of: `/ ${result.pairCount}`, label: PUZZLE_COPY.score }, spentChip],
        work: (
          <PuzzleEnding
            mode={shownMode}
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
              <h2>{fillCopy(DAILY_GAMES_COPY.puzzleUnavailable, { title: text.title })}</h2>
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
          tone="busy"
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
          title={fillCopy(DAILY_GAMES_COPY.puzzleUnavailable, { title: text.title })}
          body={error}
          tone="alert"
          slab={{ text: PUZZLE_COPY.roadSlab, jp: PUZZLE_COPY.roadSlabJp, onClick: onBack }}
          onBack={onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      )
    }
    if (gameType === 'match_pairs' && seed !== null) {
      return <MatchPairsGame pairs={pairs} isSaving={isSaving} onComplete={(next) => completeGame({ ...next, targetCount: pairs.length / 2 })} shell={shell} />
    }
    if (gameType === 'typing_blitz' && seed !== null) {
      return <TypingBlitzGame words={typingBlitzWords} isSaving={isSaving} onComplete={completeGame} shell={shell} />
    }
    return null
  }

  if (ON_THE_SHEET.has(gameType)) {
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

  return (
    <main
      className="daily-game-session"
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
      <button type="button" className="daily-games-back" onClick={onBack}><ArrowLeft aria-hidden="true" size={18} />{DAILY_GAMES_COPY.backToGames}</button>
      {isLoading ? <div className="daily-games-skeleton" role="status" aria-label={fillCopy(DAILY_GAMES_COPY.loadingGame, { title: text.title })}><span /><span /></div> : null}
      {!isLoading && error && !attempt ? <section className="daily-games-state" role="alert"><h2>{DAILY_GAMES_COPY.gameUnavailable}</h2><p>{error}</p><button type="button" className="daily-games-retry" onClick={onBack}>{DAILY_GAMES_COPY.retryGame}</button></section> : null}
      {!isLoading && crosswordBoard && !result && gameType === 'crossword' ? <CrosswordGame board={crosswordBoard} isSaving={isSaving} onComplete={completeGame} /> : null}
      {!isLoading && wordSearchBoard && !result && gameType === 'word_search' ? <WordSearchGame board={wordSearchBoard} isSaving={isSaving} onComplete={completeGame} /> : null}
      {attempt && error ? <section className="daily-games-state" role="alert"><h2>{DAILY_GAMES_COPY.gameUnavailable}</h2><p>{error}</p><button type="button" className="daily-games-retry" onClick={() => void recordAttempt(attempt)}>{DAILY_GAMES_COPY.retryGame}</button></section> : null}
      {result ? <GameResultsOverlay mode={result.isFallback ? 'practice' : mode} score={result.score} pairCount={result.pairCount} clipboard={dependencies.clipboard} onDone={onBack} missedWords={result.missedWords} onReviewMissedWords={onReviewMissedWords} {...(gameType === 'crossword' ? { title: CROSSWORD_COPY.resultsTitle, dailyResults: CROSSWORD_COPY.dailyResults, practiceResults: CROSSWORD_COPY.practiceResults, countLabel: CROSSWORD_COPY.words } : gameType === 'word_search' ? { title: WORD_SEARCH_COPY.resultsTitle, dailyResults: WORD_SEARCH_COPY.dailyResults, practiceResults: WORD_SEARCH_COPY.practiceResults, countLabel: WORD_SEARCH_COPY.words } : {})} /> : null}
    </main>
  )
}
