import { useMemo } from 'react'
import { puzzleHead } from '../../menu/daily'
import { DAILY_GAMES_COPY, PUZZLE_COPY } from '../constants'
import type { DailyGameType, DailyGamesMode, DailyGamesSessionDependencies } from '../types'
import type { DailyGamesMissedWordPayload } from '../../../generated/types'
import { getDefaultDailyGamesSessionDependencies, useDailyGames } from '../useDailyGames'
import { DailyGameSession } from './DailyGameSession'
import { PuzzlePlate } from './PuzzlePlate'
import '../daily-games.css'

/* ==================================================================================================
   ONE PUZZLE, ALREADY CHOSEN.

   THIS IS WHAT IS LEFT OF `GamesHub` ONCE THE PICKING MOVED. The hub was a mode toggle, a streak
   badge and four tiles with a Play button on each — a screen between the menu and the work, asking
   which of four you wanted when the menu had already offered exactly that. The daily road (PRACTICE
   → DAILY) picks now, and this is entered with the puzzle and the mode already decided, the way the
   exam run is entered with the level and the mode decided.

   IT STANDS ON THE SHEET IN EVERY STATE. `past-three.html` plate THREE draws the puzzle on the
   round's own sheet, and the day loading, the day failing and a pool with nothing in it are the
   same sheet with no board on it yet -- see `PuzzlePlate`. `.dp-puzzle` is the one root all of
   them share, which is what the routing tests find the view by.
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
  const head = puzzleHead(gameType)

  function body() {
    if (isLoading) {
      return (
        <PuzzlePlate
          head={head}
          cap={PUZZLE_COPY.loadingCap}
          title={DAILY_GAMES_COPY.loading}
          tone="busy"
          slab={{ text: PUZZLE_COPY.waitSlab, jp: PUZZLE_COPY.waitSlabJp, tone: 'calm' }}
          onBack={onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      )
    }
    if (error || !data) {
      return (
        <PuzzlePlate
          head={head}
          cap={PUZZLE_COPY.unavailableCap}
          title={DAILY_GAMES_COPY.unavailable}
          body={error}
          tone="alert"
          slab={{ text: PUZZLE_COPY.retrySlab, jp: PUZZLE_COPY.retrySlabJp, onClick: retry, label: DAILY_GAMES_COPY.retry }}
          onBack={onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      )
    }
    if (data.pool.words.length === 0) {
      return (
        <PuzzlePlate
          head={head}
          cap={PUZZLE_COPY.emptyCap}
          title={DAILY_GAMES_COPY.emptyTitle}
          body={DAILY_GAMES_COPY.emptyBody}
          tone="plain"
          slab={{ text: PUZZLE_COPY.roadSlab, jp: PUZZLE_COPY.roadSlabJp, onClick: onBack }}
          onBack={onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      )
    }
    return (
      <DailyGameSession
        mode={mode}
        data={data}
        dependencies={deps}
        gameType={gameType}
        onBack={onBack}
        onStateUpdated={replaceData}
        onReviewMissedWords={onReviewMissedWords}
      />
    )
  }

  return <div className="dp-puzzle" data-puzzle={gameType}>{body()}</div>
}

export default DailyGameView
