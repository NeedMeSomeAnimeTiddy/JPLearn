import { Check } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import { CROSSWORD_COPY, DAILY_GAMES_COPY, DAILY_GAMES_MODES, DAILY_GAME_TILES, WORD_SEARCH_COPY } from '../constants'
import type { DailyGamesSessionDependencies, DailyGameType, DailyGamesMode } from '../types'
import type { DailyGamesMissedWordPayload } from '../../../generated/types'
import { getDefaultDailyGamesSessionDependencies, useDailyGames } from '../useDailyGames'
import { isDailyGameComplete } from '../utils'
import { DailyStreakBadge } from './DailyStreakBadge'
import { DailyGameSession } from './DailyGameSession'
import '../daily-games.css'

const modeControl = cva('daily-games-mode-control', {
  variants: { active: { true: 'is-active', false: 'is-inactive' } },
  defaultVariants: { active: false },
})

const tile = cva('daily-game-tile', {
  variants: {
    status: {
      complete: 'is-complete',
      new: 'is-new',
      practice: 'is-practice',
    },
  },
  defaultVariants: { status: 'new' },
})

interface GamesHubProps {
  dependencies?: DailyGamesSessionDependencies
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

export function GamesHub({ dependencies, onReviewMissedWords }: GamesHubProps) {
  const sessionDependencies = useMemo(() => dependencies ?? getDefaultDailyGamesSessionDependencies(), [dependencies])
  const { data, error, isLoading, mode, retry, replaceData, setMode } = useDailyGames(sessionDependencies)
  const [activeSession, setActiveSession] = useState<{ data: NonNullable<typeof data>; gameType: DailyGameType; mode: DailyGamesMode } | null>(null)

  if (activeSession) {
    return <DailyGameSession mode={activeSession.mode} data={activeSession.data} dependencies={sessionDependencies} gameType={activeSession.gameType} onBack={() => setActiveSession(null)} onStateUpdated={replaceData} onReviewMissedWords={onReviewMissedWords} />
  }

  return (
    <div className="daily-games-hub" aria-labelledby="daily-games-title">

      {isLoading ? <div className="daily-games-skeleton" role="status" aria-label={DAILY_GAMES_COPY.loading}><span /><span /><span /><span /></div> : null}

      {!isLoading && error ? (
        <section className="daily-games-state" role="alert">
          <h2>{DAILY_GAMES_COPY.unavailable}</h2>
          <p>{error}</p>
          <button type="button" className="daily-games-retry" onClick={retry}>{DAILY_GAMES_COPY.retry}</button>
        </section>
      ) : null}

      {!isLoading && !error && data?.pool.words.length === 0 ? (
        <section className="daily-games-state">
          <h2>{DAILY_GAMES_COPY.emptyTitle}</h2>
          <p>{DAILY_GAMES_COPY.emptyBody}</p>
        </section>
      ) : null}

      {!isLoading && !error && data && data.pool.words.length > 0 ? (
        <section className="daily-games-content" aria-label={DAILY_GAMES_COPY.title}>
          <div className="daily-games-mode-list" role="group" aria-label={DAILY_GAMES_COPY.title}>
            {DAILY_GAMES_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                className={modeControl({ active: mode === option.value })}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="daily-games-summary">
            <p>{mode === 'daily' ? DAILY_GAMES_COPY.dailyDescription : DAILY_GAMES_COPY.practiceDescription}</p>
            {mode === 'daily' ? <DailyStreakBadge streak={data.streak} /> : null}
          </div>
          <div className="daily-games-tile-grid" aria-label={DAILY_GAMES_COPY.title}>
            {DAILY_GAME_TILES.map((game) => {
              const complete = mode === 'daily' && isDailyGameComplete(data, game.type)
              const status = mode === 'practice' ? 'practice' : complete ? 'complete' : 'new'
              const statusLabel = complete
                ? DAILY_GAMES_COPY.complete
                : mode === 'practice'
                  ? DAILY_GAMES_COPY.practice
                  : DAILY_GAMES_COPY.new
              const Icon = game.icon
              return (
               <article key={game.type} className={clsx(tile({ status }))} aria-label={game.title}>
                <Icon aria-hidden="true" size={28} />
                <div>
                  <h2>{game.title}</h2>
                    <p>{game.type === 'crossword' ? CROSSWORD_COPY.hint : game.type === 'match_pairs' ? DAILY_GAMES_COPY.matchPairsHint : game.type === 'word_search' ? WORD_SEARCH_COPY.hint : DAILY_GAMES_COPY.typingBlitzHint}</p>
                </div>
                  {game.type === 'crossword' || game.type === 'match_pairs' || game.type === 'word_search' || game.type === 'typing_blitz' ? (
                   <>
                     <span className="daily-game-tile-status">
                       {complete ? <Check aria-hidden="true" size={18} /> : null}
                       {statusLabel}
                     </span>
                       <button type="button" className="daily-game-button is-primary" onClick={() => setActiveSession({ gameType: game.type, data, mode: complete ? 'practice' : mode })}>{DAILY_GAMES_COPY.play}</button>
                   </>
                ) : (
                  <span className="daily-game-tile-status">
                    {complete ? <Check aria-hidden="true" size={18} /> : statusLabel}
                    {complete ? <span className="sr-only">{statusLabel}</span> : null}
                  </span>
                )}
              </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default GamesHub
