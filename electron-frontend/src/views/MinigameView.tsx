import {
  Activity,
  ArrowLeft,
  Heart,
  LoaderCircle,
  Settings,
  Target,
  Trophy,
  Volume2,
} from 'lucide-react'
import type { MinigameKey, NavDirection, RoundOption, ScriptKey } from '../types'
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_SCORES,
  DEFAULT_LIVES,
  MINIGAMES,
  POINTS_RULE_COPY,
  SCRIPT_LABELS,
  formatFeedbackAnswerLabel,
} from '../constants'
import { getStrokeOrderCandidates, sanitizeRomajiInput } from '../utils'
import { useSession } from '../context/SessionContext'

// Minimal card shape needed for stroke-order candidate lookup.
type BasicCard = { id: number; character: string; romaji: string }

interface MinigameViewProps {
  navDirection: NavDirection
  activeScript: ScriptKey
  activeGame: MinigameKey
  activeSectionName: string | null
  gameLoading: boolean
  gameError: string | null
  activeRunCardsLength: number
  voiceEnabled: boolean
  activeBlockCards: BasicCard[]
  onBack: () => void
  onOpenSettings: () => void
}

export function MinigameView({
  navDirection,
  activeScript,
  activeGame,
  activeSectionName,
  gameLoading,
  gameError,
  activeRunCardsLength,
  voiceEnabled,
  activeBlockCards,
  onBack,
  onOpenSettings,
}: MinigameViewProps) {
  const {
    sessionActive,
    roundState,
    roundInput,
    roundFeedback,
    roundFeedbackTone,
    roundFeedbackAnswer,
    roundFeedbackPoints,
    isRoundResolving,
    sessionScore,
    sessionRounds,
    sessionPoints,
    sessionTargetItems,
    blockSessionComplete,
    sessionRunReport,
    sessionStartPending,
    sessionSummaryLoading,
    livesEnabled,
    livesRemaining,
    confidenceCaptureEnabled,
    roundConfidenceScore,
    voiceBusy,
    voiceUnavailable,
    answerInputRef,
    startSession,
    submitAnswer,
    setRoundInput,
    setRoundConfidence,
    playAudio,
  } = useSession()
  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)

  return (
    <div className={`view-shell view-${navDirection}`}>
      <header className="topbar panel-glass">
        <button
          type="button"
          className="back-button back-button-icon-only"
          onClick={onBack}
          aria-label="Back to map"
          title="Back to map"
        >
          <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
        <div className="brand-block">
          <span className="brand-kicker">
            {SCRIPT_LABELS[activeScript]}
            {activeSectionName ? ` · ${activeSectionName}` : ' Run'}
          </span>
          <h1>{selectedGameMeta?.title ?? 'Minigame'}</h1>
        </div>
        <div className="topbar-end">
          <div className="focus-chip">
            <span className="metric-accent-skill">
              <Target aria-hidden="true" className="chip-icon" strokeWidth={2.2} />
              <strong key={`correct-${sessionScore}-${sessionRounds}`} className="live-value">
                {sessionScore}/{sessionRounds}
              </strong>{' '}
              Correct
            </span>
            <span className="metric-accent-streak">
              <Activity aria-hidden="true" className="chip-icon" strokeWidth={2.2} />
              <strong key={`points-${sessionPoints}`} className="live-value">
                {sessionPoints}
              </strong>{' '}
              Points
            </span>
            <span className="metric-accent-insight">
              <Trophy aria-hidden="true" className="chip-icon" strokeWidth={2.2} />
              <strong key={`goal-${sessionRounds}-${sessionTargetItems}`} className="live-value">
                {sessionRounds}/{sessionTargetItems}
              </strong>{' '}
              Goal
            </span>
          </div>
          <button
            type="button"
            className="topbar-settings-button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings (Ctrl+,)"
          >
            <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <section className="panel-glass game-panel">
        {blockSessionComplete && sessionActive ? (
          <article className="block-complete-banner panel-glass" role="status">
            <span className="block-complete-icon" aria-hidden="true">🎉</span>
            <h2 className="block-complete-title">Block complete!</h2>
            <p className="block-complete-copy">
              You answered every card in{' '}
              <strong>{activeSectionName ?? 'this section'}</strong>{' '}
              correctly. Head back to the map to continue your path.
            </p>
            <div className="game-actions">
              <button
                type="button"
                className="back-button back-button-icon-only"
                onClick={onBack}
                aria-label="Back to map"
                title="Back to map"
              >
                <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
              </button>
              <button type="button" onClick={() => startSession()}>
                Play Again
              </button>
            </div>
          </article>
        ) : !sessionActive ? (
          <>
            {sessionRunReport && !sessionStartPending ? (
              <article className="post-session-report" role="status" aria-live="polite">
                <div className="post-session-head">
                  <div>
                    <p className="post-session-kicker">Session Report</p>
                    <h2>
                      Run Complete ·{' '}
                      {MINIGAMES.find((game) => game.key === sessionRunReport.minigame)?.title ??
                        sessionRunReport.minigame}
                    </h2>
                  </div>
                  <span className="post-session-time">Finished {sessionRunReport.completedAt}</span>
                </div>

                <p className="post-session-note">
                  {sessionRunReport.sectionName
                    ? `${SCRIPT_LABELS[sessionRunReport.script]} · ${sessionRunReport.sectionName}`
                    : SCRIPT_LABELS[sessionRunReport.script]}
                </p>

                <div className="post-session-grid" aria-label="Session performance metrics">
                  <div className="post-session-cell">
                    <small>Accuracy</small>
                    <strong>{sessionRunReport.accuracy}%</strong>
                  </div>
                  <div className="post-session-cell">
                    <small>Correct</small>
                    <strong>{sessionRunReport.correct}</strong>
                  </div>
                  <div className="post-session-cell">
                    <small>Misses</small>
                    <strong>{sessionRunReport.wrong}</strong>
                  </div>
                  <div className="post-session-cell">
                    <small>Points</small>
                    <strong>{sessionRunReport.points}</strong>
                  </div>
                  <div className="post-session-cell">
                    <small>Goal Completion</small>
                    <strong>{sessionRunReport.goalCompletionPct}%</strong>
                  </div>
                  {sessionRunReport.livesEnabled ? (
                    <>
                      <div className="post-session-cell">
                        <small>Lives</small>
                        <strong>
                          {sessionRunReport.livesRemaining}/{DEFAULT_LIVES}
                        </strong>
                      </div>
                      <div className="post-session-cell">
                        <small>Lives Lost</small>
                        <strong>{sessionRunReport.livesLost}</strong>
                      </div>
                    </>
                  ) : null}
                  {sessionRunReport.leechFocusEnabled ? (
                    <div className="post-session-cell">
                      <small>Leech Focus</small>
                      <strong>On</strong>
                    </div>
                  ) : null}
                  {sessionRunReport.confidenceCaptureEnabled ? (
                    <>
                      <div className="post-session-cell">
                        <small>Confidence Captured</small>
                        <strong>{sessionRunReport.confidenceCapturedCount}</strong>
                      </div>
                      <div className="post-session-cell">
                        <small>Avg Confidence</small>
                        <strong>{sessionRunReport.averageConfidenceScore ?? '-'}</strong>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="post-session-insights">
                  <p>
                    <strong>Points Rule:</strong> {POINTS_RULE_COPY}
                  </p>
                  <p>
                    <strong>Goal Check:</strong>{' '}
                    {sessionRunReport.goalDelta >= 0
                      ? `Goal cleared by ${sessionRunReport.goalDelta} item${sessionRunReport.goalDelta === 1 ? '' : 's'}.`
                      : `${Math.abs(sessionRunReport.goalDelta)} item${Math.abs(sessionRunReport.goalDelta) === 1 ? '' : 's'} short of goal.`}
                  </p>
                </div>
              </article>
            ) : null}

            <div className="game-actions">
              <button
                type="button"
                onClick={() => startSession()}
                disabled={gameLoading || activeRunCardsLength === 0 || sessionSummaryLoading || sessionStartPending}
              >
                {sessionRunReport ? 'Play Again' : 'Play'}
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
              {gameLoading ? (
                <span>Loading deck...</span>
              ) : (
                <span>{activeRunCardsLength} cards available</span>
              )}
            </div>
          </>
        ) : (
          <div className="game-actions">
            <button
              type="button"
              onClick={() => startSession()}
              disabled={gameLoading || activeRunCardsLength === 0 || sessionSummaryLoading || sessionStartPending}
            >
              Restart Challenge
            </button>
            {gameLoading ? (
              <span>Loading deck...</span>
            ) : (
              <span>{activeRunCardsLength} cards available</span>
            )}
            <div className="lives-inline" aria-live="polite">
              {livesEnabled ? (
                [...Array(DEFAULT_LIVES).keys()].map((life) => (
                  <span
                    key={`life-${life}`}
                    className={`life-heart ${life < livesRemaining ? 'is-active' : 'is-lost'}`}
                    aria-hidden="true"
                  >
                    <Heart className="inline-button-icon" strokeWidth={2.2} fill="currentColor" />
                  </span>
                ))
              ) : (
                <span>Lives off</span>
              )}
            </div>
          </div>
        )}

        {(sessionStartPending && !sessionActive) || (sessionActive && !roundState) ? (
          <div className="minigame-loading" role="status" aria-live="polite">
            <LoaderCircle className="inline-button-icon spin-icon" strokeWidth={2.2} aria-hidden="true" />
            <span>
              {sessionStartPending ? 'Preparing your round...' : 'Loading next card...'}
            </span>
          </div>
        ) : null}

        {gameError ? <p className="status-line status-error">{gameError}</p> : null}

        {sessionActive && roundState ? (
          <article
            className={`game-round ${
              roundFeedbackTone === 'error'
                ? 'is-wrong'
                : roundFeedbackTone === 'success'
                  ? 'is-correct'
                  : ''
            }`}
            key={`round-${sessionRounds}-${roundState.focusText}-${roundState.answer}`}
          >
            <div className="game-round-head">
              <span>{SCRIPT_LABELS[activeScript]}</span>
              <strong>
                {selectedGameMeta?.title}
                {activeGame === 'interleave_mix'
                  ? ` · ${MINIGAMES.find((game) => game.key === roundState.mode)?.title ?? roundState.mode}`
                  : ''}
              </strong>
              <span className="stage-pill">Stage {roundState.curriculumStage}</span>
              {roundState.surprisePrompt ? <span className="surprise-pill">Surprise</span> : null}
            </div>

            <div className="game-prompt-focus">
              <p className="game-prompt-label">{roundState.promptLabel}</p>
              <p className={`game-prompt-main ${roundState.mode !== 'character_match' ? 'is-japanese' : ''}`}>
                {roundState.focusText}
              </p>
              {voiceEnabled &&
              (roundState.audioText ||
                (activeScript === 'grammar_patterns' && roundState.exampleSentenceAudioText)) ? (
                <div className="game-speak-controls">
                  {roundState.audioText ? (
                    <button
                      type="button"
                      className="game-speak-button"
                      onClick={() => playAudio(roundState.audioText)}
                      disabled={voiceBusy}
                      aria-label="Play target words"
                      title={voiceUnavailable ? 'Voice playback unavailable' : 'Play target words'}
                    >
                      <Volume2 size={16} aria-hidden="true" />
                      <span>
                        {voiceBusy
                          ? 'Loading…'
                          : voiceUnavailable
                            ? 'Voice unavailable'
                            : 'Play words'}
                      </span>
                    </button>
                  ) : null}
                  {activeScript === 'grammar_patterns' && roundState.exampleSentenceAudioText ? (
                    <button
                      type="button"
                      className="game-speak-button"
                      onClick={() => playAudio(roundState.exampleSentenceAudioText!)}
                      disabled={voiceBusy}
                      aria-label="Play example sentence"
                      title={voiceUnavailable ? 'Voice playback unavailable' : 'Play example sentence'}
                    >
                      <Volume2 size={16} aria-hidden="true" />
                      <span>
                        {voiceBusy
                          ? 'Loading…'
                          : voiceUnavailable
                            ? 'Voice unavailable'
                            : 'Play sentence'}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
              {roundState.hintText ? (
                <p className="game-hint-text">{roundState.hintText}</p>
              ) : null}
            </div>

            {roundState.mode === 'stroke_order' ? (
              <div className="stroke-order-picker">
                <div className="game-input-row">
                  <input
                    ref={answerInputRef}
                    value={roundInput}
                      onChange={(event) => setRoundInput(sanitizeRomajiInput(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      const candidates = getStrokeOrderCandidates(activeBlockCards, roundInput)
                      if (candidates.length === 1) {
                        submitAnswer(candidates[0].character)
                      }
                    }}
                    placeholder="Type romaji reading"
                    autoComplete="off"
                    disabled={isRoundResolving}
                  />
                </div>
                <div className="stroke-order-candidate-wrap" aria-label="Kanji candidates">
                  {getStrokeOrderCandidates(activeBlockCards, roundInput).length > 0 ? (
                    <div className="option-grid">
                      {getStrokeOrderCandidates(activeBlockCards, roundInput).map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className="option-button option-button-character"
                          disabled={isRoundResolving}
                          onClick={() => submitAnswer(candidate.character)}
                        >
                          <span className="option-button-main" lang="ja">
                            {candidate.character}
                          </span>
                          <span className="option-button-sub">{candidate.romaji}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="status-line">
                      Type a romaji reading to show matching kanji.
                    </p>
                  )}
                </div>
              </div>
            ) : roundState.mode === 'romaji_sprint' || roundState.mode === 'typed_recall' ? (
              <form
                className="game-input-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitAnswer(roundInput)
                }}
              >
                <input
                  ref={answerInputRef}
                  value={roundInput}
                  onChange={(event) =>
                    setRoundInput(
                      roundState.mode === 'romaji_sprint'
                        ? sanitizeRomajiInput(event.target.value)
                        : event.target.value,
                    )
                  }
                  placeholder={roundState.mode === 'romaji_sprint' ? 'Enter romaji' : 'Type meaning'}
                  autoComplete="off"
                  disabled={isRoundResolving}
                />
                <button type="submit" disabled={isRoundResolving}>
                  Check
                </button>
              </form>
            ) : (
              <div className="option-grid">
                {roundState.options.map((option: RoundOption) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`option-button ${
                      roundState.mode === 'character_match' ? 'option-button-character' : ''
                    }`}
                    disabled={isRoundResolving}
                    onClick={() => submitAnswer(option.label)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {confidenceCaptureEnabled ? (
              <section
                className="confidence-controls confidence-controls-round"
                aria-label="Confidence score controls"
              >
                <p className="interleave-controls-title">Confidence for this answer</p>
                <div
                  className="confidence-chip-row confidence-chip-row-round"
                  role="group"
                  aria-label="Select confidence score for this answer"
                >
                  {CONFIDENCE_SCORES.map((score) => (
                    <button
                      key={`round-confidence-${score}`}
                      type="button"
                      className={`confidence-chip confidence-chip-round ${
                        roundConfidenceScore === score ? 'is-active' : ''
                      }`}
                      onClick={() => setRoundConfidence(score)}
                      aria-pressed={roundConfidenceScore === score}
                      aria-label={`Confidence ${CONFIDENCE_LEVEL_LABELS[score]}`}
                      title={`Confidence: ${CONFIDENCE_LEVEL_LABELS[score]}`}
                      disabled={isRoundResolving}
                    >
                      <span className="confidence-chip-label">
                        {CONFIDENCE_LEVEL_LABELS[score]}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {roundFeedback ? (
              <div
                className={`round-feedback ${
                  roundFeedbackTone === 'success'
                    ? 'round-feedback-success'
                    : roundFeedbackTone === 'error'
                      ? 'round-feedback-error'
                      : ''
                }`}
              >
                <p className="round-feedback-message">{roundFeedback}</p>
                <div className="round-feedback-meta">
                  <span className="round-feedback-points">
                    {roundFeedbackPoints !== null ? `+${roundFeedbackPoints} pts` : '+0 pts'}
                  </span>
                  <span className="round-feedback-points-rule">Combo at streaks 3/6/9</span>
                  {roundFeedbackTone === 'error' && livesEnabled ? (
                    <span className="round-feedback-life">-1 life</span>
                  ) : null}
                </div>
                {roundFeedbackAnswer ? (
                  <div className="round-feedback-answer">
                    <p className="round-feedback-answer-label">
                      {formatFeedbackAnswerLabel(roundState.mode)}
                    </p>
                    <p className="round-feedback-answer-value">
                      {roundFeedbackAnswer}
                    </p>
                  </div>
                ) : null}
                {roundState.mode === 'narrative_story' ? (
                  <p className="round-feedback-note">
                    Story progress updates chapter access based on stage transitions.
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : null}
      </section>
    </div>
  )
}
