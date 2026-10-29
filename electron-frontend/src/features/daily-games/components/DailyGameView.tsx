import { useMemo, useState } from 'react'
import { screenHead } from '../../menu'
import { puzzleHead } from '../../menu/daily'
import { DAILY_GAME_TILES, DAILY_GAMES_COPY, PUZZLE_COPY } from '../constants'
import type { DailyGameType, DailyGamesMode, DailyGamesSessionDependencies } from '../types'
import type { DailyGamesMissedWordPayload, DailyGamesStatePayload } from '../../../generated/types'
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
  /** null when the route was reached with nothing chosen -- history forward, say */
  gameType: DailyGameType | null
  mode: DailyGamesMode
  onBack: () => void
  dependencies?: DailyGamesSessionDependencies
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

export function DailyGameView({ gameType, ...rest }: DailyGameViewProps) {
  /* NOTHING CHOSEN IS STILL A SHEET. The route can be reached without a puzzle -- the titlebar's
     forward after Back cleared it -- and a blank window is the shape of a broken screen. It says
     so and offers the road, without fetching a day it has no puzzle to deal from. */
  if (!gameType) {
    return (
      <div className="dp-puzzle">
        <h1 className="sr-only">{DAILY_GAMES_COPY.title}</h1>
        <PuzzlePlate
          head={screenHead('DRILLS', 'daily')}
          cap={PUZZLE_COPY.noPuzzleCap}
          title={PUZZLE_COPY.noPuzzleTitle}
          body={PUZZLE_COPY.noPuzzleBody}
          tone="status"
          slab={{ text: PUZZLE_COPY.roadSlab, jp: PUZZLE_COPY.roadSlabJp, onClick: rest.onBack }}
          onBack={rest.onBack}
          backAria={DAILY_GAMES_COPY.backToGames}
        />
      </div>
    )
  }
  return <ChosenPuzzle gameType={gameType} {...rest} />
}

function ChosenPuzzle({
  gameType, mode, onBack, dependencies, onReviewMissedWords,
}: DailyGameViewProps & { gameType: DailyGameType }) {
  const deps = useMemo(
    () => dependencies ?? getDefaultDailyGamesSessionDependencies(),
    [dependencies],
  )
  const { data, error, isLoading, retry, replaceData } = useDailyGames(deps)
  const head = puzzleHead(gameType)

  /* AN OPEN PUZZLE OUTRANKS THE DAY. Once a session has opened on a pool, a refresh behind it --
     the state a save returns, midnight's new day, a refresh that fails or comes back empty --
     never swaps it for a plate; the session keeps the pool it opened with (audit 16, F4 and N1).
     Leaving the puzzle unmounts this view, so the next one opened takes the day as it is then. */
  const sessionKey = `${gameType}:${mode}`
  const [opened, setOpened] = useState<{ key: string; data: DailyGamesStatePayload } | null>(null)
  const openable = !isLoading && !error && data !== null && data.pool.words.length > 0 ? data : null
  if (openable && opened?.key !== sessionKey) setOpened({ key: sessionKey, data: openable })
  const sessionData = opened?.key === sessionKey ? opened.data : openable

  function body() {
    if (sessionData) {
      return (
        <DailyGameSession
          key={sessionKey}
          mode={mode}
          data={sessionData}
          dependencies={deps}
          gameType={gameType}
          onBack={onBack}
          onStateUpdated={replaceData}
          onReviewMissedWords={onReviewMissedWords}
        />
      )
    }
    if (isLoading) {
      return (
        <PuzzlePlate
          head={head}
          cap={PUZZLE_COPY.loadingCap}
          title={DAILY_GAMES_COPY.loading}
          tone="status"
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
    return (
      <PuzzlePlate
        head={head}
        cap={PUZZLE_COPY.emptyCap}
        title={DAILY_GAMES_COPY.emptyTitle}
        body={DAILY_GAMES_COPY.emptyBody}
        tone="status"
        slab={{ text: PUZZLE_COPY.roadSlab, jp: PUZZLE_COPY.roadSlabJp, onClick: onBack }}
        onBack={onBack}
        backAria={DAILY_GAMES_COPY.backToGames}
      />
    )
  }

  /* ONE PAGE HEADING FOR EVERY STATE -- the plates and the board alike; the slab's title is not one */
  return (
    <div className="dp-puzzle" data-puzzle={gameType}>
      <h1 className="sr-only">{DAILY_GAME_TILES.find((tile) => tile.type === gameType)?.title}</h1>
      {body()}
    </div>
  )
}

export default DailyGameView
