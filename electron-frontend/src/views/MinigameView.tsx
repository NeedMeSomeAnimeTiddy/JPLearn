import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence } from 'motion/react'
import {
  Activity,
  ArrowLeft,
  Flame,
  LoaderCircle,
  Play,
  Target,
  Trophy,
} from 'lucide-react'
import { ChallengePromptCard } from '../components/minigame/ChallengePromptCard'
import { ChoiceAnswerPanel } from '../components/minigame/ChoiceAnswerPanel'
import { HintPopover } from '../components/minigame/HintPopover'
import { MinigameHud } from '../components/minigame/MinigameHud'
import { MinigameResponsePanel } from '../components/minigame/MinigameResponsePanel'
import { QueuePreview } from '../components/minigame/QueuePreview'
import { SentenceAssemblyAnswerPanel } from '../components/minigame/SentenceAssemblyAnswerPanel'
import { StrokeOrderAnswerPanel } from '../components/minigame/StrokeOrderAnswerPanel'
import { TypedAnswerPanel } from '../components/minigame/TypedAnswerPanel'
import { SpeechAnswerPanel } from '../components/minigame/SpeechAnswerPanel'
import { HandwritingAnswerPanel } from '../features/handwriting'
import type { HandwritingOutcome } from '../features/handwriting'
import { SessionRunSummary } from '../components/SessionRunSummary'
import type { MinigameKey, NavDirection, ScriptKey } from '../types'
import {
  MINIGAMES,
  SCRIPT_LABELS,
  formatExpectedAnswer,
  formatFeedbackAnswerLabel,
} from '../constants'
import { isGrammarCurriculumMode, sanitizeRomajiInput } from '../utils'
import { useSession } from '../context/SessionContext'

// Minimal card shape needed for stroke-order answer candidates.
type BasicCard = { id: number; character: string; romaji: string; meaning: string; dictionary_summary?: { reading: string } | null; tags?: string[] }

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
  furiganaEnabled: boolean
  furiganaAutoHideMastered: boolean
  activeBlockCards: BasicCard[]
  activeRoundCard?: BasicCard | null
  onBack: () => void
  onOpenDictionary: (seedQuery?: string) => void
  onOpenSettings: () => void
  onRetry: (cardIds: number[]) => void
  onHandwritingOutcome: (outcome: HandwritingOutcome) => void
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
  furiganaEnabled,
  furiganaAutoHideMastered,
  activeBlockCards,
  activeRoundCard,
  onBack,
  onOpenDictionary,
  onOpenSettings,
  onRetry,
  onHandwritingOutcome,
}: MinigameViewProps) {
  const {
    sessionActive,
    roundState,
    roundInput,
    roundFeedback,
    roundFeedbackTone,
    roundFeedbackAnswer,
    isRoundResolving,
    roundAdvancePending,
    roundAdvanceError,
    sessionScore,
    sessionRounds,
    sessionPoints,
    sessionStreak,
    sessionTargetItems,
    retryTargetItems,
    roundComboBonus,
    roundMilestoneStreak,
    sessionRunReport,
    sessionStartPending,
    sessionSummaryLoading,
    livesEnabled,
    livesRemaining,
    confidenceCaptureEnabled,
    roundConfidenceScore,
    roundResponseMs,
    roundSrsResult,
    roundExampleSentence,
    voiceBusy,
    voiceUnavailable,
    answerInputRef,
    startSession,
    submitAnswer,
    setRoundInput,
    setRoundConfidence,
    playAudio,
    skipFeedback,
    upcomingCards,
  } = useSession()
  const selectedGameMeta = MINIGAMES.find((game) => game.key === activeGame)
  const effectiveTargetItems = retryTargetItems ?? sessionTargetItems
  const resolvedGameTitle =
    activeGame === 'interleave_mix'
      ? (MINIGAMES.find((game) => game.key === roundState?.mode)?.title ?? 'Mixed Round')
      : (selectedGameMeta?.title ?? 'Minigame')
  const displayedRoundCard = activeRoundCard ?? activeBlockCards.find((card) => card.id === roundState?.cardId) ?? null
  const roundProgressValue = effectiveTargetItems > 0 ? Math.min(sessionRounds / effectiveTargetItems, 1) : 0
  const remainingRounds = Math.max(effectiveTargetItems - sessionRounds, 0)
  const sessionStatusCopy = sessionActive
    ? `${remainingRounds} ${remainingRounds === 1 ? 'challenge' : 'challenges'} left`
    : sessionRunReport
      ? 'Run complete'
      : 'Ready to begin'

  // ── Phase 7: Progressive hint ladder ────────────────────────────────────────
  // 0 = no hint shown, 1 = clue, 2 = full answer giveaway
  const [hintStep, setHintStep] = useState<0 | 1 | 2>(0)
  const [activeChoiceIndex, setActiveChoiceIndex] = useState(0)
  const [speechFallbackToTyped, setSpeechFallbackToTyped] = useState(false)
  const [hintRevealCount, setHintRevealCount] = useState(0)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const [pointsGainPulse, setPointsGainPulse] = useState(false)
  const [pointsGainAmount, setPointsGainAmount] = useState<number | null>(null)
  const previousPointsRef = useRef(sessionPoints)
  const previousSessionActiveRef = useRef(false)
  const [hintPopoverOpen, setHintPopoverOpen] = useState(false)
  const hintButtonRef = useRef<HTMLButtonElement | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const queueButtonRef = useRef<HTMLButtonElement | null>(null)

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
      if (current >= 2) return current
      setHintRevealCount((value) => value + 1)
      return (current + 1) as 0 | 1 | 2
    })
    setHintPopoverOpen(true)
  }, [])

  // Reset hint when a new round starts.
  useEffect(() => {
    setHintStep(0)
    setHintPopoverOpen(false)
  }, [roundState?.cardId])

  // Brief pulse + floating "+N" label whenever points increase.
  useEffect(() => {
    if (sessionPoints <= previousPointsRef.current) {
      previousPointsRef.current = sessionPoints
      return
    }

    const gained = sessionPoints - previousPointsRef.current
    previousPointsRef.current = sessionPoints
    setPointsGainAmount(gained)
    setPointsGainPulse(true)

    const timeoutHandle = window.setTimeout(() => {
      setPointsGainPulse(false)
      setPointsGainAmount(null)
    }, 700)

    return () => window.clearTimeout(timeoutHandle)
  }, [sessionPoints])

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
    setSpeechFallbackToTyped(false)
  }, [roundState?.cardId, roundState?.mode])

  // ── Phase 6 + 7: Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    if (!sessionActive || !roundState) return
    const activeRound = roundState

    const isMultipleChoice =
      activeRound.mode === 'meaning_match' ||
      activeRound.mode === 'character_match' ||
      activeRound.mode === 'particle_cloze' ||
      activeRound.mode === 'vibe_check' ||
      activeRound.mode === 'imposter' ||
      activeRound.mode === 'listening_audio_first' ||
      activeRound.mode === 'kanji_compound_builder' ||
      activeRound.mode === 'context_cloze'

    const isTyped =
      activeRound.mode === 'romaji_sprint' ||
      activeRound.mode === 'typed_recall' ||
      activeRound.mode === 'speech_recall' ||
      activeRound.mode === 'stroke_order' ||
      activeRound.mode === 'dictation'

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
      roundState.mode !== 'dictation' &&
      roundState.mode !== 'sentence_assembly'
    ) return
    if (!voiceEnabled || !roundState.audioText) return
    playAudio(roundState.audioText)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundState?.cardId, roundState?.mode])

  const tapeToneVar =
    activeScript === 'hiragana' || activeScript === 'katakana' ? 'var(--tone-teal)'
    : activeScript === 'kanji_n5' ? 'var(--tone-rose)'
    : 'var(--tone-amber)'
  const tapeStyle = { '--tape-tone': tapeToneVar } as CSSProperties

  return (
    <div className={`view-shell view-${navDirection} minigame-shell ${focusModeEnabled ? 'minigame-focus-mode' : ''}`}>
      <div className="hub-crt-surface" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
      <div className="hub-vhs-line" aria-hidden="true" />
      <div className="hub-crystal hub-crystal--a" aria-hidden="true" />
      <div className="hub-crystal hub-crystal--b" aria-hidden="true" />
      <div className="hub-crystal hub-crystal--c" aria-hidden="true" />

      <MinigameHud
        activeScript={activeScript}
        activeSectionName={activeSectionName}
        title={resolvedGameTitle}
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
        onToggleQueue={() => setQueueOpen((prev) => !prev)}
        queueOpen={queueOpen}
        queueButtonRef={queueButtonRef}
      />

      <div className="hub-studio">
        <div className="hub-player">
          <div className="hub-sweep minigame-focus-optional" aria-hidden="true" />
          <div className="hub-particle hub-particle--1 minigame-focus-optional" aria-hidden="true" />
          <div className="hub-particle hub-particle--2 minigame-focus-optional" aria-hidden="true" />
          <div className="hub-particle hub-particle--3 minigame-focus-optional" aria-hidden="true" />
          <div className="hub-particle hub-particle--4 minigame-focus-optional" aria-hidden="true" />

          {sessionActive ? (
            <div className="hub-player-header minigame-focus-optional">
              <p className="hero-kicker">
                <span className="hub-rec-dot" aria-hidden="true" />{' '}
                Round {sessionRounds + 1} of {effectiveTargetItems} · {SCRIPT_LABELS[activeScript]}{activeSectionName ? ` · ${activeSectionName}` : ''}
              </p>
            </div>
          ) : null}

          <div className="hub-deck-badge minigame-focus-optional" aria-hidden="true">
            <span>DOLBY NR</span>
            <span className="hub-deck-dot" />
          </div>

          <section className="minigame-stage-panel">
            {!sessionActive ? (
              <>
                {sessionRunReport && !sessionStartPending ? (
                  <div className="minigame-open-playfield" style={tapeStyle}>
                    <SessionRunSummary
                      report={sessionRunReport}
                      sessionStartPending={sessionStartPending}
                      onRestart={() => startSession()}
                      onRetry={onRetry}
                      onBack={onBack}
                    />
                  </div>
                ) : (
                  <div className="hub-controls" aria-label="Game controls">
                    <div className="hub-control-group" role="group">
                      <button
                        type="button"
                        className="hub-chip-button"
                        onClick={() => startSession()}
                        disabled={gameLoading || activeRunCardsLength === 0 || sessionSummaryLoading || sessionStartPending}
                      >
                        <Play size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>{sessionRunReport ? 'Play Again' : 'Play'}</span>
                      </button>
                      <button
                        type="button"
                        className="hub-chip-button"
                        onClick={onBack}
                        aria-label="Back to map"
                        title="Back to map"
                      >
                        <ArrowLeft size={13} strokeWidth={2.2} aria-hidden="true" />
                        <span>Back</span>
                      </button>
                    </div>
                    <div className="hub-control-divider" aria-hidden="true" />
                    <p className="hero-kicker minigame-state-actions">
                      <span className="hub-rec-dot" aria-hidden="true" />{' '}
                      {gameLoading ? 'Loading deck...' : `${activeRunCardsLength} cards available`}
                    </p>
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
              <AnimatePresence mode="wait">
                <article className="minigame-open-playfield" key={roundState.cardId} style={tapeStyle} data-feedback={roundFeedback !== null ? '' : undefined}>

                  <div className="minigame-cassette-label">
                    <span className="cassette-brand">JPLearn · {resolvedGameTitle}</span>
                    <div
                      className="minigame-round-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={effectiveTargetItems}
                      aria-valuenow={Math.min(sessionRounds, effectiveTargetItems)}
                      aria-valuetext={`${sessionRounds} of ${effectiveTargetItems} challenges, ${sessionStatusCopy}`}
                      title={`${sessionRounds}/${effectiveTargetItems} · ${sessionStatusCopy}`}
                    >
                      <div className="minigame-round-progress-fill" style={{ width: `${roundProgressValue * 100}%` }} />
                    </div>

                    {roundState.chapterLabel || roundState.surprisePrompt ? (
                      <div className="minigame-cassette-label-meta">
                        {roundState.chapterLabel ? (
                          <span className="chapter-pill">
                            {roundState.chapterNumber ? `Chapter ${roundState.chapterNumber}` : 'Chapter'} · {roundState.chapterLabel}
                          </span>
                        ) : null}
                        {roundState.surprisePrompt ? <span className="surprise-pill">Surprise</span> : null}
                      </div>
                    ) : null}

                    <div className="game-hud-whisper" aria-live="polite">
                      <span className={`game-hud-stat ${pointsGainPulse ? 'is-gaining' : ''}`}>
                        <Activity aria-hidden="true" size={11} strokeWidth={2.2} />
                        <strong>{sessionPoints}</strong>
                        <span>pts</span>
                        {pointsGainAmount ? <span className="game-hud-stat-gain">+{pointsGainAmount}</span> : null}
                      </span>
                      <span className="game-hud-stat">
                        <Flame aria-hidden="true" size={11} strokeWidth={2.2} />
                        <strong>{sessionStreak}</strong>
                        <span>x</span>
                      </span>
                      <span className="game-hud-stat">
                        <Target aria-hidden="true" size={11} strokeWidth={2.2} />
                        <strong>{sessionScore}/{sessionRounds}</strong>
                      </span>
                      <span className="game-hud-stat">
                        <Trophy aria-hidden="true" size={11} strokeWidth={2.2} />
                        <strong>{sessionRounds}/{effectiveTargetItems}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="minigame-cassette-window">
                    <ChallengePromptCard
                      roundState={roundState}
                      activeScript={activeScript}
                      voiceEnabled={voiceEnabled}
                      voiceBusy={voiceBusy}
                      voiceUnavailable={voiceUnavailable}
                      showKeyboardPrompts={showKeyboardPrompts}
                      furiganaEnabled={furiganaEnabled}
                      furiganaAutoHideMastered={furiganaAutoHideMastered}
                      focusReading={furiganaEnabled ? (displayedRoundCard?.dictionary_summary?.reading ?? null) : null}
                      showRevealText={roundFeedback !== null}
                      isMastered={Boolean(roundState.isMastered)}
                      cardTags={displayedRoundCard?.tags ?? []}
                      hintPopoverOpen={hintPopoverOpen}
                      hintButtonRef={hintButtonRef}
                      onPlayAudio={playAudio}
                      onToggleHintPopover={() => setHintPopoverOpen((v) => !v)}
                    />
                  </div>

                  <div className="minigame-cassette-body">
                    <MinigameResponsePanel
                      isRoundResolving={isRoundResolving}
                      mode={roundState.mode}
                      title={
                        roundState.mode === 'stroke_order'
                          ? 'Build the matching kanji'
                          : roundState.mode === 'handwriting'
                            ? 'Draw the character'
                          : roundState.mode === 'romaji_sprint'
                            ? 'Type the reading'
                            : roundState.mode === 'sentence_assembly'
                              ? 'Assemble the sentence'
                            : roundState.mode === 'typed_recall'
                              ? 'Type the meaning'
                              : roundState.mode === 'speech_recall'
                                ? 'Speak the meaning'
                                : roundState.mode === 'particle_cloze'
                                  ? 'Choose the missing particle'
                                  : roundState.mode === 'vibe_check'
                                    ? 'Read the register vibe'
                                  : roundState.mode === 'imposter'
                                    ? 'Spot the grammar imposter'
                                  : roundState.mode === 'dictation'
                                    ? 'Type the romaji'
                                : 'Choose the best answer'
                      }
                      copy={
                        roundState.mode === 'stroke_order'
                          ? 'Type the romaji reading to narrow the kanji candidates.'
                          : roundState.mode === 'handwriting'
                            ? 'Draw one character in stroke order. Guided feedback appears only after repeated misses.'
                          : roundState.mode === 'romaji_sprint'
                            ? 'Submit as soon as the reading is clear in your head.'
                            : roundState.mode === 'sentence_assembly'
                              ? 'Drag chunks into natural order, then submit.'
                            : roundState.mode === 'typed_recall'
                              ? 'Short, direct answers work best.'
                              : roundState.mode === 'speech_recall'
                                ? speechFallbackToTyped
                                  ? 'Short, direct answers work best.'
                                  : 'Tap the mic and say your answer clearly.'
                                : roundState.mode === 'particle_cloze'
                                  ? 'Use syntax and particle role to choose the best fit.'
                                  : roundState.mode === 'vibe_check'
                                    ? 'Use sentence endings like です, ます, or ください as tone clues.'
                                  : roundState.mode === 'imposter'
                                    ? 'Pick the token that introduces the grammar error.'
                                    : roundState.mode === 'dictation'
                                      ? 'Type the romaji for what you hear. Use English letters.'
                                : 'Commit to one answer and keep the run moving.'
                      }
                      confidenceCaptureEnabled={confidenceCaptureEnabled}
                      roundConfidenceScore={roundConfidenceScore}
                      onSetRoundConfidence={setRoundConfidence}
                      feedback={roundFeedback}
                      feedbackTone={roundFeedbackTone}
                      feedbackComboBonus={roundComboBonus}
                      feedbackMilestoneStreak={roundMilestoneStreak}
                      feedbackAnswer={roundFeedbackAnswer}
                      feedbackAnswerLabel={formatFeedbackAnswerLabel(roundState.mode)}
                      feedbackCorrectAnswer={
                        roundState.mode === 'sentence_assembly'
                          ? (roundState.answerDisplay ?? roundState.answer)
                          : roundState.answer
                      }
                      livesEnabled={livesEnabled}
                      showKeyboardPrompts={showKeyboardPrompts}
                      onSkipFeedback={skipFeedback}
                      feedbackAdvancePending={roundAdvancePending}
                      feedbackAdvanceError={roundAdvanceError}
                      responseMs={roundResponseMs}
                      srsResult={roundSrsResult}
                      exampleSentence={roundExampleSentence}
                      cardCharacter={roundState.focusText}
                      cardMeaning={!isGrammarCurriculumMode(roundState.mode) ? (displayedRoundCard?.meaning ?? '') : ''}
                      cardRomaji={!isGrammarCurriculumMode(roundState.mode) ? (displayedRoundCard?.romaji ?? '') : ''}
                      dictionaryNote={roundState.dictionaryNote}
                    >
                        {roundState.mode === 'handwriting' ? (
                          <HandwritingAnswerPanel
                            character={roundState.answer}
                            disabled={isRoundResolving}
                            onComplete={onHandwritingOutcome}
                          />
                        ) : roundState.mode === 'stroke_order' ? (
                          <StrokeOrderAnswerPanel
                            activeBlockCards={activeBlockCards}
                            answerInputRef={answerInputRef}
                            roundInput={roundInput}
                            disabled={isRoundResolving}
                            onInputChange={setRoundInput}
                            onSelect={submitAnswer}
                          />
                        ) : roundState.mode === 'sentence_assembly' ? (
                          <SentenceAssemblyAnswerPanel
                            options={roundState.options}
                            disabled={isRoundResolving}
                            onSubmit={submitAnswer}
                          />
                        ) : roundState.mode === 'speech_recall' && !speechFallbackToTyped ? (
                          <SpeechAnswerPanel
                            expectedAnswer={roundState.answer}
                            disabled={isRoundResolving}
                            onResult={({ transcript }) => submitAnswer(transcript)}
                            onFallbackToTyped={() => setSpeechFallbackToTyped(true)}
                          />
                        ) : roundState.mode === 'romaji_sprint' || roundState.mode === 'typed_recall' || roundState.mode === 'speech_recall' || roundState.mode === 'dictation' ? (
                          <TypedAnswerPanel
                            answerInputRef={answerInputRef}
                            value={roundInput}
                            placeholder={
                              roundState.mode === 'romaji_sprint'
                                ? 'Enter romaji'
                                : roundState.mode === 'dictation'
                                  ? 'Type here (auto-converts to kana)'
                                  : 'Type meaning'
                            }
                            disabled={isRoundResolving}
                            onChange={(value) =>
                              setRoundInput(
                                roundState.mode === 'romaji_sprint'
                                  ? sanitizeRomajiInput(value)
                                  : value,
                              )
                            }
                            onSubmit={(v) =>
                              submitAnswer(
                                roundState.mode === 'romaji_sprint'
                                  ? sanitizeRomajiInput(v)
                                  : v,
                              )
                            }
                            wanakanaMode={roundState.mode === 'dictation' ? (activeScript === 'katakana' ? 'katakana' : 'hiragana') : undefined}
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

                </article>
              </AnimatePresence>
            ) : null}
            {roundState ? (
              <HintPopover
                roundState={roundState}
                hintStep={hintStep}
                hintRevealCount={hintRevealCount}
                showKeyboardPrompts={showKeyboardPrompts}
                formattedAnswer={roundState.answerDisplay ?? formatExpectedAnswer(roundState.answer)}
                open={hintPopoverOpen}
                triggerRef={hintButtonRef}
                onClose={() => setHintPopoverOpen(false)}
                onRevealHint={() => {
                  if (hintStep < 1) setHintRevealCount((value) => value + 1)
                  setHintStep(1)
                }}
                onRevealMoreHint={advanceHintStep}
              />
            ) : null}
            {sessionActive ? (
              <QueuePreview
                upcomingCards={upcomingCards}
                open={queueOpen}
                triggerRef={queueButtonRef}
                onClose={() => setQueueOpen(false)}
              />
            ) : null}
          </section>

          <div className="hub-deck-badge hub-deck-badge--right minigame-focus-optional" aria-hidden="true">
            <span>TYPE II · HIGH BIAS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
