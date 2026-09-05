import { useMemo } from 'react'
import { DAILY_GAMES_COPY } from '../constants'
import type { DailyGameType, DailyGamesMode, DailyGamesSessionDependencies } from '../types'
import type { DailyGamesMissedWordPayload } from '../../../generated/types'
import { getDefaultDailyGamesSessionDependencies, useDailyGames } from '../useDailyGames'
import { DailyGameSession } from './DailyGameSession'
import '../daily-games.css'

/* ==================================================================================================
   ONE PUZZLE, ALREADY CHOSEN.

   THIS IS WHAT IS LEFT OF `GamesHub` ONCE THE PICKING MOVED. The hub was a mode toggle, a streak
   badge and four tiles with a Play button on each — a screen between the menu and the work, asking
   which of four you wanted when the menu had already offered exactly that. The daily road (PRACTICE
   → DAILY) picks now, and this is entered with the puzzle and the mode already decided, the way the
   exam run is entered with the level and the mode decided.

   THE PUZZLES THEMSELVES ARE STILL THE OLD LANGUAGE. `design-system/components/past-three.html`
   draws one of the four on the sheet and calls the other three the same job; none of them is built.
   This file does not pretend otherwise — it fetches the day and hands it to the board that exists.
   ================================================================================================== */

export interface DailyGameViewProps {
  gameType: DailyGameType
  mode: DailyGamesMode
  onBack: () => void
  dependencies?: DailyGamesSessionDependencies
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

export function DailyGameView({
  gameType, mode, onBack, dependencies, onReviewMissedWords,
}: DailyGameViewProps) {
  const deps = useMemo(
    () => dependencies ?? getDefaultDailyGamesSessionDependencies(),
    [dependencies],
  )
  const { data, error, isLoading, retry, replaceData } = useDailyGames(deps)

  if (isLoading) {
    return (
      <div className="daily-games-hub">
        <div className="daily-games-skeleton" role="status" aria-label={DAILY_GAMES_COPY.loading}>
          <span /><span /><span /><span />
        </div>
      </div>
    )
  }

  if (error || !data || data.pool.words.length === 0) {
    return (
      <div className="daily-games-hub">
        <section className="daily-games-state" role={error ? 'alert' : undefined}>
          <h2>{error ? DAILY_GAMES_COPY.unavailable : DAILY_GAMES_COPY.emptyTitle}</h2>
          <p>{error ?? DAILY_GAMES_COPY.emptyBody}</p>
          <button type="button" className="daily-games-retry" onClick={error ? retry : onBack}>
            {error ? DAILY_GAMES_COPY.retry : DAILY_GAMES_COPY.backToGames}
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="daily-games-hub">
      <DailyGameSession
        mode={mode}
        data={data}
        dependencies={deps}
        gameType={gameType}
        onBack={onBack}
        onStateUpdated={replaceData}
        onReviewMissedWords={onReviewMissedWords}
      />
    </div>
  )
}

export default DailyGameView
