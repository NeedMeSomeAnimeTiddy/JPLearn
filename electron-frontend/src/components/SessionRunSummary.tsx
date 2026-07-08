import { ArrowLeft, Target, Trophy } from 'lucide-react'
import { DEFAULT_LIVES, MINIGAMES, POINTS_RULE_COPY, SCRIPT_LABELS } from '../constants'
import type { SessionRunReport } from '../types'

interface SessionRunSummaryProps {
  report: SessionRunReport
  sessionStartPending: boolean
  onRestart: () => void
  onRetry: (cardIds: number[]) => void
  onBack: () => void
}

export function SessionRunSummary({
  report,
  sessionStartPending,
  onRestart,
  onRetry,
  onBack,
}: SessionRunSummaryProps) {
  const minigameTitle =
    MINIGAMES.find((game) => game.key === report.minigame)?.title ?? report.minigame
  const goalStatusCopy =
    report.goalDelta >= 0
      ? `Goal cleared by ${report.goalDelta} item${report.goalDelta === 1 ? '' : 's'}.`
      : `${Math.abs(report.goalDelta)} item${Math.abs(report.goalDelta) === 1 ? '' : 's'} short of goal.`

  return (
    <article className="post-session-report minigame-session-summary" role="status" aria-live="polite">
      <div className="post-session-head minigame-session-summary-head">
        <div className="minigame-session-summary-title">
          <p className="post-session-kicker">Run Complete</p>
          <h2>{minigameTitle}</h2>
          <p className="post-session-note minigame-session-summary-note">
            {report.sectionName
              ? `${SCRIPT_LABELS[report.script]} · ${report.sectionName}`
              : SCRIPT_LABELS[report.script]}
          </p>
        </div>

        <div className="minigame-session-summary-highlight">
          <span className="minigame-session-summary-label">Accuracy</span>
          <strong>{report.accuracy}%</strong>
          <span className="post-session-time">Finished {report.completedAt}</span>
        </div>
      </div>

      <div className="minigame-session-summary-goals" aria-label="Run outcome overview">
        <div className="minigame-session-summary-goal-card">
          <span className="minigame-session-summary-label">Session target</span>
          <strong>
            {report.rounds}/{report.targetItems}
          </strong>
        </div>
        <div className="minigame-session-summary-goal-card">
          <span className="minigame-session-summary-label">Goal completion</span>
          <strong>{report.goalCompletionPct}%</strong>
        </div>
        <div className="minigame-session-summary-goal-card">
          <span className="minigame-session-summary-label">Points earned</span>
          <strong>{report.points}</strong>
        </div>
      </div>

      <div className="post-session-grid minigame-session-summary-grid" aria-label="Session performance metrics">
        <div className="post-session-cell">
          <small>Correct</small>
          <strong>{report.correct}</strong>
        </div>
        <div className="post-session-cell">
          <small>Misses</small>
          <strong>{report.wrong}</strong>
        </div>
        <div className="post-session-cell">
          <small>Points</small>
          <strong>{report.points}</strong>
        </div>
        <div className="post-session-cell">
          <small>Goal</small>
          <strong>{report.goalCompletionPct}%</strong>
        </div>
        {report.livesEnabled ? (
          <>
            <div className="post-session-cell">
              <small>Lives Left</small>
              <strong>
                {report.livesRemaining}/{DEFAULT_LIVES}
              </strong>
            </div>
            <div className="post-session-cell">
              <small>Lives Lost</small>
              <strong>{report.livesLost}</strong>
            </div>
          </>
        ) : null}
        {report.leechFocusEnabled ? (
          <div className="post-session-cell">
            <small>Focus Mode</small>
            <strong>Leech On</strong>
          </div>
        ) : null}
        {report.confidenceCaptureEnabled ? (
          <>
            <div className="post-session-cell">
              <small>Confidence Logged</small>
              <strong>{report.confidenceCapturedCount}</strong>
            </div>
            <div className="post-session-cell">
              <small>Avg Confidence</small>
              <strong>{report.averageConfidenceScore ?? '-'}</strong>
            </div>
          </>
        ) : null}
      </div>

      <div className="post-session-insights minigame-session-summary-insights">
        <p>
          <Target aria-hidden="true" className="inline-button-icon" strokeWidth={2.1} />
          <span>{goalStatusCopy}</span>
        </p>
        <p>
          <Trophy aria-hidden="true" className="inline-button-icon" strokeWidth={2.1} />
          <span>{POINTS_RULE_COPY}</span>
        </p>
      </div>

      <div className="game-actions minigame-session-summary-actions">
        {report.wrongCardIds.length + report.nearMissCardIds.length > 0 ? (
          <button
            type="button"
            className="hub-chip-button"
            onClick={() => onRetry([...report.wrongCardIds, ...report.nearMissCardIds])}
            disabled={sessionStartPending}
          >
            Retry {report.wrongCardIds.length + report.nearMissCardIds.length} Missed
          </button>
        ) : null}
        <button type="button" className="hub-chip-button" onClick={onRestart} disabled={sessionStartPending}>
          Play Again
        </button>
        <button
          type="button"
          className="back-button back-button-icon-only"
          onClick={onBack}
          aria-label="Back to map"
          title="Back to map"
        >
          <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
      </div>
    </article>
  )
}