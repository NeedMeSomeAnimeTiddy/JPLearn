import { Check, ClipboardCopy } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { useState } from 'react'
import { DAILY_GAMES_COPY } from '../constants'
import type { DailyGamesClipboard, DailyGamesMode } from '../types'
import type { DailyGamesMissedWordPayload } from '../../../generated/types'
import { buildShareResult } from '../utils'

const shareStatus = cva('daily-game-share-status', {
  variants: { status: { success: 'is-success', error: 'is-error' } },
})

interface GameResultsOverlayProps {
  mode: DailyGamesMode
  score: number
  pairCount: number
  clipboard: DailyGamesClipboard
  onDone: () => void
  title?: string
  dailyResults?: string
  practiceResults?: string
  countLabel?: string
  missedWords?: DailyGamesMissedWordPayload[]
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

export function GameResultsOverlay({ mode, score, pairCount, clipboard, onDone, title = DAILY_GAMES_COPY.resultsTitle, dailyResults = DAILY_GAMES_COPY.dailyResults, practiceResults = DAILY_GAMES_COPY.practiceResults, countLabel = DAILY_GAMES_COPY.pairs, missedWords = [], onReviewMissedWords }: GameResultsOverlayProps) {
  const [shareState, setShareState] = useState<'idle' | 'success' | 'error'>('idle')
  const [reviewState, setReviewState] = useState<'idle' | 'loading' | 'error'>('idle')
  const canReviewMissedWords = mode === 'daily' && missedWords.length > 0 && onReviewMissedWords !== undefined

  async function shareResult(): Promise<void> {
    try {
      await clipboard.writeText(buildShareResult(score, pairCount, mode))
      setShareState('success')
    } catch {
      setShareState('error')
    }
  }

  async function reviewMissedWords(): Promise<void> {
    if (!onReviewMissedWords) return
    setReviewState('loading')
    try {
      await onReviewMissedWords(missedWords)
    } catch {
      setReviewState('error')
    }
  }

  return (
    <section className="daily-game-results" role="region" aria-labelledby="daily-game-results-title">
      <Check aria-hidden="true" size={32} />
      <h2 id="daily-game-results-title">{title}</h2>
      <p>{mode === 'daily' ? dailyResults : practiceResults}</p>
      <dl className="daily-game-results-stats">
        <div><dt>{DAILY_GAMES_COPY.score}</dt><dd>{score}</dd></div>
        <div><dt>{countLabel}</dt><dd>{pairCount}</dd></div>
      </dl>
      <div className="daily-game-results-actions">
        <button type="button" className="daily-game-button" onClick={() => void shareResult()}>
          <ClipboardCopy aria-hidden="true" size={18} />
          {DAILY_GAMES_COPY.share}
        </button>
        {canReviewMissedWords ? (
          <button type="button" className="daily-game-button" onClick={() => void reviewMissedWords()} disabled={reviewState === 'loading'}>
            {reviewState === 'loading' ? DAILY_GAMES_COPY.reviewingMissedWords : DAILY_GAMES_COPY.reviewMissedWords}
          </button>
        ) : null}
        <button type="button" className="daily-game-button is-primary" onClick={onDone}>{DAILY_GAMES_COPY.done}</button>
      </div>
      {shareState !== 'idle' ? (
        <p className={shareStatus({ status: shareState })} role="status">{shareState === 'success' ? DAILY_GAMES_COPY.shareSuccess : DAILY_GAMES_COPY.shareFailure}</p>
      ) : null}
      {reviewState === 'error' ? <p className={shareStatus({ status: 'error' })} role="status">{DAILY_GAMES_COPY.reviewMissedWordsFailure}</p> : null}
    </section>
  )
}
