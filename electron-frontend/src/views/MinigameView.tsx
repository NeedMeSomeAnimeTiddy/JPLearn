import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  LoaderCircle,
} from 'lucide-react'
import { ChallengePromptCard } from '../components/minigame/ChallengePromptCard'
import { ChoiceAnswerPanel } from '../components/minigame/ChoiceAnswerPanel'
import { HintAssistPanel } from '../components/minigame/HintAssistPanel'
import { MinigameHud } from '../components/minigame/MinigameHud'
import { MinigameResponsePanel } from '../components/minigame/MinigameResponsePanel'
import { StrokeOrderAnswerPanel } from '../components/minigame/StrokeOrderAnswerPanel'
import { TypedAnswerPanel } from '../components/minigame/TypedAnswerPanel'
import { SessionRunSummary } from '../components/SessionRunSummary'
import type { MinigameKey, NavDirection, ScriptKey } from '../types'
import {
  MINIGAMES,
  SCRIPT_LABELS,
  formatExpectedAnswer,
  formatFeedbackAnswerLabel,
} from '../constants'
import { sanitizeRomajiInput } from '../utils'
import { useSession } from '../context/SessionContext'

// Minimal card shape needed for stroke-order answer candidates.
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
  showKeyboardPrompts: boolean
  activeBlockCards: BasicCard[]
  onBack: () => void
  onOpenDictionary: (seedQuery?: string) => void
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
  showKeyboardPrompts,
  activeBlockCards,
  onBack,
  onOpenDictionary,
  onOpenSettings,
}: MinigameViewProps) {
  const {
    sessionActive,
    roundState,
    roundInput,
    roundFeedback,
    roundFeedbackTone,
    roundFeedbackAnswer,
    roundPerformanceLabel,
    isRoundResolving,
    feedbackAdvanceMs,
    sessionScore,
    sessionRounds,
    sessionPoints,
    sessionStreak,
    sessionTargetItems,
    blockSessionComplete,
    roundComboBonus,
    roundMilestoneStreak,
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
    skipFeedback,
  } = useSession()
  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const resolvedGameTitle =
    activeGame === 'interleave_mix'
      ? (MINIGAMES.find((game) => game.key === roundState?.mode)?.title ?? 'Mixed Round')
      : (selectedGameMeta?.title ?? 'Minigame')
  const roundProgressValue = sessionTargetItems > 0 ? Math.min(sessionRounds / sessionTargetItems, 1) : 0
  const remainingRounds = Math.max(sessionTargetItems - sessionRounds, 0)
  const sessionStatusCopy = sessionActive
    ? `${remainingRounds} ${remainingRounds === 1 ? 'challenge' : 'challenges'} left`
    : sessionRunReport
      ? 'Run complete'
      : 'Ready to begin'
  const feedbackAdvanceLabel =
    roundFeedbackTone === 'error' && livesEnabled && livesRemaining === 0
      ? 'Ending run...'
      : sessionRounds >= sessionTargetItems
        ? 'Wrapping up this run...'
        : 'Advancing automatically...'
  const progressCheckpoints = [25, 50, 75, 100]
  const completedCount = Math.min(sessionRounds, sessionTargetItems)

  // ── Phase 7: Progressive hint ladder ────────────────────────────────────────
  // 0 = no hint shown, 1 = prompt type label, 2 = hintText, 3 = full answer giveaway
  const [hintStep, setHintStep] = useState<0 | 1 | 2 | 3>(0)
  const [activeChoiceIndex, setActiveChoiceIndex] = useState(0)
  const [hintRevealCount, setHintRevealCount] = useState(0)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const previousSessionActiveRef = useRef(false)

  const toggleFocusMode = useCallback(() => {
    const next = !focusModeEnabled
    setFocusModeEnabled(next)

    if (next) {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => undefined)
      }
      return
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
  }, [focusModeEnabled])

  const advanceHintStep = useCallback(() => {
    setHintStep((current) => {
      if (current >= 3) return current
      setHintRevealCount((value) => value + 1)
      return (current + 1) as 0 | 1 | 2 | 3
    })
  }, [])

  // Reset hint when a new round starts.
  useEffect(() => {
    setHintStep(0)
  }, [roundState?.cardId])

  useEffect(() => {
    const previouslyActive = previousSessionActiveRef.current
    previousSessionActiveRef.current = sessionActive

    if (sessionActive && !previouslyActive) {
      setHintRevealCount(0)
    }
  }, [sessionActive])

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        setFocusModeEnabled(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    setActiveChoiceIndex(0)
  }, [roundState?.cardId, roundState?.mode])

  // ── Phase 6 + 7: Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    if (!sessionActive || !roundState) return
    const activeRound = roundState

    const isMultipleChoice =
      activeRound.mode === 'meaning_match' ||
      activeRound.mode === 'character_match' ||
      activeRound.mode === 'context_cloze' ||
      activeRound.mode === 'narrative_story' ||
      activeRound.mode === 'listening_audio_first' ||
      activeRound.mode === 'listening_prompt_first'

    const isTyped =
      activeRound.mode === 'romaji_sprint' ||
      activeRound.mode === 'typed_recall' ||
      activeRound.mode === 'stroke_order'

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Enter: skip feedback delay when in resolving phase
      if (event.key === 'Enter' && isRoundResolving && roundFeedback !== null && !isInputFocused) {
        event.preventDefault()
        skipFeedback()
        return
      }

      // F: toggle distraction-free focus mode + fullscreen
      if ((event.key === 'f' || event.key === 'F') && !isInputFocused) {
        event.preventDefault()
        toggleFocusMode()
        return
      }

      // Space/H: increment hint step (only while waiting for answer, not during feedback)
      if ((event.key === ' ' || event.key === 'h' || event.key === 'H') && !isRoundResolving && !isInputFocused) {
        event.preventDefault()
        advanceHintStep()
        return
      }

      // P: replay audio prompt (only when not typing)
      if ((event.key === 'p' || event.key === 'P') && voiceEnabled && activeRound.audioText && !isInputFocused) {
        event.preventDefault()
        playAudio(activeRound.audioText)
        return
      }

      if (isMultipleChoice && !isRoundResolving && !isInputFocused && !isTyped) {
        if (activeRound.options.length === 0) return

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault()
          setActiveChoiceIndex((current) => (current + 1) % activeRound.options.length)
          return
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveChoiceIndex((current) => {
            if (current <= 0) return activeRound.options.length - 1
            return current - 1
          })
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          const selected = activeRound.options[activeChoiceIndex]
          if (selected) submitAnswer(selected.label)
          return
        }
      }

      // 1-4: select MC option (only for multiple-choice modes, not while resolving, not in input)
      if (isMultipleChoice && !isRoundResolving && !isInputFocused && !isTyped) {
        const index = parseInt(event.key, 10) - 1
        if (index >= 0 && index < activeRound.options.length) {
          event.preventDefault()
          setActiveChoiceIndex(index)
          submitAnswer(activeRound.options[index].label)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    sessionActive,
    roundState,
    isRoundResolving,
    roundFeedback,
    voiceEnabled,
    skipFeedback,
    toggleFocusMode,
    advanceHintStep,
    playAudio,
    submitAnswer,
    activeChoiceIndex,
  ])

  // Auto-play audio when a listening round starts.
  useEffect(() => {
    if (!roundState) return
    if (
      roundState.mode !== 'listening_audio_first' &&
      roundState.mode !== 'listening_prompt_first'
    ) return
    if (!voiceEnabled || !roundState.audioText) return
    playAudio(roundState.audioText)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundState?.cardId, roundState?.mode])

  return (
    <div className={`view-shell view-${navDirection} minigame-shell ${focusModeEnabled ? 'minigame-focus-mode' : ''}`}>
      <MinigameHud
        activeScript={activeScript}
        activeSectionName={activeSectionName}
        title={selectedGameMeta?.title ?? 'Minigame'}
        sessionRounds={sessionRounds}
        sessionTargetItems={sessionTargetItems}
        sessionScore={sessionScore}
        sessionPoints={sessionPoints}
        sessionStreak={sessionStreak}
        focusModeEnabled={focusModeEnabled}
        dictionarySeed={roundState?.dictionarySeedQuery ?? roundState?.audioText ?? roundState?.answer ?? ''}
        sessionActive={sessionActive}
        activeRunCardsLength={activeRunCardsLength}
        gameLoading={gameLoading}
        sessionSummaryLoading={sessionSummaryLoading}
        sessionStartPending={sessionStartPending}
        livesEnabled={livesEnabled}
        livesRemaining={livesRemaining}
        onRestart={() => startSession()}
        onBack={onBack}
        onOpenDictionary={onOpenDictionary}
        onOpenSettings={onOpenSettings}
        onToggleFocusMode={toggleFocusMode}
      />

      <section className="panel-glass game-panel minigame-stage-panel">
        {blockSessionComplete && sessionActive ? (
          <article className="block-complete-banner panel-glass minigame-state-card" role="status">
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
              <SessionRunSummary
                report={sessionRunReport}
                sessionStartPending={sessionStartPending}
                onRestart={() => startSession()}
                onBack={onBack}
              />
            ) : (
              <div className="game-actions minigame-state-actions">
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
            )}
          </>
        ) : null}

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
            className={`game-round minigame-challenge ${
              roundFeedbackTone === 'error'
                ? 'is-wrong'
                : roundFeedbackTone === 'success'
                  ? 'is-correct'
                  : ''
            }`}
            key={`round-${sessionRounds}-${roundState.focusText}-${roundState.answer}`}
          >
            <div className="game-round-head minigame-challenge-head">
              <div className="minigame-challenge-titles">
                <span>{SCRIPT_LABELS[activeScript]}</span>
                <strong>{resolvedGameTitle}</strong>
              </div>
              <div className="minigame-challenge-badges minigame-focus-optional">
                {roundState.chapterLabel ? (
                  <span className="chapter-pill">
                    {roundState.chapterNumber ? `Chapter ${roundState.chapterNumber}` : 'Chapter'} · {roundState.chapterLabel}
                  </span>
                ) : null}
                <span className="stage-pill">Stage {roundState.curriculumStage}</span>
                {roundState.surprisePrompt ? <span className="surprise-pill">Surprise</span> : null}
              </div>
            </div>

            <div className="minigame-challenge-body">
              <div className="minigame-core-column">
                <div
                  className="minigame-round-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={sessionTargetItems}
                  aria-valuenow={Math.min(sessionRounds, sessionTargetItems)}
                  aria-valuetext={`${sessionRounds} of ${sessionTargetItems} challenges, ${sessionStatusCopy}`}
                  title={`${sessionRounds}/${sessionTargetItems} · ${sessionStatusCopy}`}
                >
                  <div className="minigame-round-progress-fill" style={{ width: `${roundProgressValue * 100}%` }} />
                </div>
                <div className="minigame-progress-footer" aria-live="polite">
                  <span className="minigame-progress-count">{completedCount}/{sessionTargetItems}</span>
                  <div className="minigame-progress-pips" aria-label="Session completion checkpoints">
                    {progressCheckpoints.map((checkpoint) => {
                      const checkpointRounds = Math.max(1, Math.ceil((sessionTargetItems * checkpoint) / 100))
                      const reached = completedCount >= checkpointRounds

                      return (
                        <span
                          key={`pip-${checkpoint}`}
                          className={`minigame-progress-pip ${reached ? 'is-reached' : ''}`}
                          aria-label={`${checkpoint}% ${reached ? 'reached' : 'pending'}`}
                        />
                      )
                    })}
                  </div>
                  <span className="minigame-progress-remaining">{sessionStatusCopy}</span>
                </div>

                <ChallengePromptCard
                  roundState={roundState}
                  activeScript={activeScript}
                  voiceEnabled={voiceEnabled}
                  voiceBusy={voiceBusy}
                  voiceUnavailable={voiceUnavailable}
                  showKeyboardPrompts={showKeyboardPrompts}
                  showRevealText={roundFeedback !== null}
                  onPlayAudio={playAudio}
                />

                <MinigameResponsePanel
                  isRoundResolving={isRoundResolving}
                  mode={roundState.mode}
                  title={
                    roundState.mode === 'stroke_order'
                      ? 'Build the matching kanji'
                      : roundState.mode === 'romaji_sprint'
                        ? 'Type the reading'
                        : roundState.mode === 'typed_recall'
                          ? 'Type the meaning'
                          : 'Choose the best answer'
                  }
                  copy={
                    roundState.mode === 'stroke_order'
                      ? 'Type the romaji reading to narrow the kanji candidates.'
                      : roundState.mode === 'romaji_sprint'
                        ? 'Submit as soon as the reading is clear in your head.'
                        : roundState.mode === 'typed_recall'
                          ? 'Short, direct answers work best.'
                          : 'Commit to one answer and keep the run moving.'
                  }
                  confidenceCaptureEnabled={confidenceCaptureEnabled}
                  roundConfidenceScore={roundConfidenceScore}
                  onSetRoundConfidence={setRoundConfidence}
                  feedback={roundFeedback}
                  feedbackTone={roundFeedbackTone}
                  feedbackPerformanceLabel={roundPerformanceLabel}
                  feedbackComboBonus={roundComboBonus}
                  feedbackMilestoneStreak={roundMilestoneStreak}
                  feedbackAnswer={roundFeedbackAnswer}
                  feedbackAnswerLabel={formatFeedbackAnswerLabel(roundState.mode)}
                  livesEnabled={livesEnabled}
                  feedbackAdvanceMs={feedbackAdvanceMs}
                  feedbackAdvanceLabel={feedbackAdvanceLabel}
                  showKeyboardPrompts={showKeyboardPrompts}
                  onSkipFeedback={skipFeedback}
                >
                    {roundState.mode === 'stroke_order' ? (
                      <StrokeOrderAnswerPanel
                        activeBlockCards={activeBlockCards}
                        answerInputRef={answerInputRef}
                        roundInput={roundInput}
                        disabled={isRoundResolving}
                        onInputChange={setRoundInput}
                        onSelect={submitAnswer}
                      />
                    ) : roundState.mode === 'romaji_sprint' || roundState.mode === 'typed_recall' ? (
                      <TypedAnswerPanel
                        answerInputRef={answerInputRef}
                        value={roundInput}
                        placeholder={roundState.mode === 'romaji_sprint' ? 'Enter romaji' : 'Type meaning'}
                        disabled={isRoundResolving}
                        onChange={(value) =>
                          setRoundInput(
                            roundState.mode === 'romaji_sprint'
                              ? sanitizeRomajiInput(value)
                              : value,
                          )
                        }
                        onSubmit={() => submitAnswer(roundInput)}
                      />
                    ) : (
                      <ChoiceAnswerPanel
                        options={roundState.options}
                        disabled={isRoundResolving}
                        characterMode={roundState.mode === 'character_match'}
                        showKeyboardPrompts={showKeyboardPrompts}
                        activeIndex={activeChoiceIndex}
                        onActiveIndexChange={setActiveChoiceIndex}
                        onSelect={submitAnswer}
                      />
                    )}
                </MinigameResponsePanel>
              </div>

              <div className="minigame-support-row">
                <HintAssistPanel
                  roundState={roundState}
                  isRoundResolving={isRoundResolving}
                  hintStep={hintStep}
                  hintRevealCount={hintRevealCount}
                  showKeyboardPrompts={showKeyboardPrompts}
                  formattedAnswer={formatExpectedAnswer(roundState.answer)}
                  onRevealHint={() => {
                    if (hintStep < 1) {
                      setHintRevealCount((value) => value + 1)
                    }
                    setHintStep(1)
                  }}
                  onRevealMoreHint={advanceHintStep}
                />
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  )
}
