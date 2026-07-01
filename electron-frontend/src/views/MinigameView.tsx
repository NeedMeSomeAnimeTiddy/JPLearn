import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  LoaderCircle,
} from 'lucide-react'
import { ChallengePromptCard } from '../components/minigame/ChallengePromptCard'
import { ChoiceAnswerPanel } from '../components/minigame/ChoiceAnswerPanel'
import { HintAssistPanel } from '../components/minigame/HintAssistPanel'
import { MinigameHud } from '../components/minigame/MinigameHud'
import { MinigameResponsePanel } from '../components/minigame/MinigameResponsePanel'
import { MinigameStageRail } from '../components/minigame/MinigameStageRail'
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
    roundFeedbackPoints,
    isRoundResolving,
    feedbackAdvanceMs,
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
    skipFeedback,
  } = useSession()
  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const resolvedGameTitle =
    activeGame === 'interleave_mix'
      ? (MINIGAMES.find((game) => game.key === roundState?.mode)?.title ?? 'Mixed Round')
      : (selectedGameMeta?.title ?? 'Minigame')
  const activeRoundIndex = sessionActive && roundState
    ? Math.min(sessionRounds + 1, Math.max(1, sessionTargetItems))
    : Math.min(sessionRounds, Math.max(1, sessionTargetItems))
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

  // ── Phase 7: Progressive hint ladder ────────────────────────────────────────
  // 0 = no hint shown, 1 = prompt type label, 2 = hintText, 3 = full answer giveaway
  const [hintStep, setHintStep] = useState<0 | 1 | 2 | 3>(0)

  // Reset hint when a new round starts.
  useEffect(() => {
    setHintStep(0)
  }, [roundState?.cardId])

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

      // H: increment hint step (only while waiting for answer, not during feedback)
      if ((event.key === 'h' || event.key === 'H') && !isRoundResolving && !isInputFocused) {
        event.preventDefault()
        setHintStep((s) => (s < 3 ? ((s + 1) as 0 | 1 | 2 | 3) : 3))
        return
      }

      // Space: replay audio (only when not typing)
      if (event.key === ' ' && voiceEnabled && activeRound.audioText && !isInputFocused) {
        event.preventDefault()
        playAudio(activeRound.audioText)
        return
      }

      // 1-4: select MC option (only for multiple-choice modes, not while resolving, not in input)
      if (isMultipleChoice && !isRoundResolving && !isInputFocused && !isTyped) {
        const index = parseInt(event.key, 10) - 1
        if (index >= 0 && index < activeRound.options.length) {
          event.preventDefault()
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
    playAudio,
    submitAnswer,
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
    <div className={`view-shell view-${navDirection} minigame-shell`}>
      <MinigameHud
        activeScript={activeScript}
        activeSectionName={activeSectionName}
        title={selectedGameMeta?.title ?? 'Minigame'}
        sessionRounds={sessionRounds}
        sessionTargetItems={sessionTargetItems}
        sessionStatusCopy={sessionStatusCopy}
        sessionScore={sessionScore}
        sessionPoints={sessionPoints}
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
            ) : null}

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
              <div className="minigame-challenge-badges">
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
                <ChallengePromptCard
                  roundState={roundState}
                  activeScript={activeScript}
                  voiceEnabled={voiceEnabled}
                  voiceBusy={voiceBusy}
                  voiceUnavailable={voiceUnavailable}
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
                  feedbackPoints={roundFeedbackPoints}
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
                  showKeyboardPrompts={showKeyboardPrompts}
                  formattedAnswer={formatExpectedAnswer(roundState.answer)}
                  onRevealHint={() => setHintStep(1)}
                  onRevealMoreHint={() => setHintStep((s) => (s < 3 ? (s + 1) as 0 | 1 | 2 | 3 : 3))}
                />

                <MinigameStageRail
                  currentRound={activeRoundIndex}
                  targetRounds={sessionTargetItems}
                  modeTitle={resolvedGameTitle}
                  sessionPoints={sessionPoints}
                  livesEnabled={livesEnabled}
                  livesRemaining={livesRemaining}
                />
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </div>
  )
}
