import { useState } from 'react'
import { DAILY_GAMES_COPY, PUZZLE_COPY } from '../constants'
import type { DailyGamesClipboard, DailyGamesMode } from '../types'
import type { DailyGamesMissedWordPayload } from '../../../generated/types'
import { buildShareResult, fillCopy } from '../utils'
import { PuzzleRows } from './PuzzleRound'

/* ==================================================================================================
   THE WORK CELL ONCE THE PUZZLE IS OVER -- what `GameResultsOverlay` said, on the sheet.

   THE MISSED WORDS ARE THE RESULT, so they are the cell's body: one slip each, vermilion, which is
   what you owe. The score has gone up into the run chips where the run's figures always are.

   ONE SLAB TO PRESS AND ONE TO NOT. A daily run with misses offers the review they hand on to;
   anything else offers the road back. Sharing stays, quietly, as the second half of the floor.
   ================================================================================================== */

interface PuzzleEndingProps {
  mode: DailyGamesMode
  /** the puzzle's own name, which the shared result names */
  puzzle: string
  title: string
  message: string
  score: number
  count: number
  clipboard: DailyGamesClipboard
  onDone: () => void
  missedWords?: DailyGamesMissedWordPayload[]
  onReviewMissedWords?: (missedWords: DailyGamesMissedWordPayload[]) => Promise<void>
}

export function PuzzleEnding({
  mode, puzzle, title, message, score, count, clipboard, onDone, missedWords = [], onReviewMissedWords,
}: PuzzleEndingProps) {
  const [shareState, setShareState] = useState<'idle' | 'success' | 'error'>('idle')
  const [reviewState, setReviewState] = useState<'idle' | 'loading' | 'error'>('idle')
  const canReviewMissedWords = mode === 'daily' && missedWords.length > 0 && onReviewMissedWords !== undefined

  async function shareResult(): Promise<void> {
    try {
      await clipboard.writeText(buildShareResult(score, count, mode, puzzle))
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
    <div className="rd-work">
      <div className="rd-kick"><span>{PUZZLE_COPY.endKick}</span><em>{PUZZLE_COPY.endKickJp}</em></div>
      <section className="rd-body dp-end" aria-label={title}>
        <p className="rd-note">{message}</p>
        {missedWords.length > 0 ? (
          <PuzzleRows
            items={missedWords}
            label={PUZZLE_COPY.missedKick}
            render={(missed, index) => (
              <li key={`${missed.word.deck_slug}-${missed.word.card_id}-${index}`} className="dp-row bad">
                <u aria-hidden="true">{String(index + 1).padStart(2, '0')}</u>
                <b>{missed.word.meaning}</b>
                <i lang="ja">{missed.word.character}</i>
              </li>
            )}
          />
        ) : <p className="dp-fold">{PUZZLE_COPY.noMisses}</p>}
        {shareState !== 'idle' ? (
          <p className={shareState === 'error' ? 'dp-status is-bad' : 'dp-status'} role="status">
            {shareState === 'success' ? DAILY_GAMES_COPY.shareSuccess : DAILY_GAMES_COPY.shareFailure}
          </p>
        ) : null}
        {reviewState === 'error' ? (
          <p className="dp-status is-bad" role="alert">{DAILY_GAMES_COPY.reviewMissedWordsFailure}</p>
        ) : null}
      </section>
      <div className="rd-acts">
        {canReviewMissedWords ? (
          <button
            type="button"
            className="rd-slab go"
            onClick={() => void reviewMissedWords()}
            disabled={reviewState === 'loading'}
            aria-label={reviewState === 'loading'
              ? DAILY_GAMES_COPY.reviewingMissedWords
              : fillCopy(PUZZLE_COPY.reviewLabel, { count: missedWords.length })}
          >
            {reviewState === 'loading'
              ? PUZZLE_COPY.reviewingSlab
              : fillCopy(PUZZLE_COPY.reviewSlab, { count: missedWords.length })}
            <em>{PUZZLE_COPY.reviewSlabJp}</em>
          </button>
        ) : (
          <button type="button" className="rd-slab go" onClick={onDone}>
            {PUZZLE_COPY.roadSlab}<em>{PUZZLE_COPY.roadSlabJp}</em>
          </button>
        )}
        <button
          type="button"
          className="rd-slab calm go"
          onClick={() => void shareResult()}
          aria-label={DAILY_GAMES_COPY.share}
        >
          {PUZZLE_COPY.shareSlab}<em>{PUZZLE_COPY.shareSlabJp}</em>
        </button>
      </div>
    </div>
  )
}
