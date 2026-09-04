import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Lightbulb, Volume2 } from 'lucide-react'
import { HintPopover } from '../components/minigame/HintPopover'
import { QueuePreview } from '../components/minigame/QueuePreview'
import { SentenceAssemblyAnswerPanel } from '../components/minigame/SentenceAssemblyAnswerPanel'
import { StrokeOrderAnswerPanel } from '../components/minigame/StrokeOrderAnswerPanel'
import { SpeechAnswerPanel } from '../components/minigame/SpeechAnswerPanel'
import { HandwritingAnswerPanel } from '../features/handwriting'
import type { HandwritingOutcome } from '../features/handwriting'
import { screenHead } from '../features/menu'
import type { MenuSectionKey } from '../features/menu'
import {
  EMPTY_TRAIL, Round, RoundAsk, RoundConfidence, RoundGloss, RoundSlips, RoundTyped, RoundVerdict,
  RoundWork, promptSize, roundCopy, roundKind, stepTrail,
} from '../features/round'
import type { MinigameKey, NavDirection, ScriptKey } from '../types'
import {
  CONFIDENCE_LEVEL_LABELS, CONFIDENCE_SCORES, FEEDBACK_COPY, MINIGAMES,
  formatExpectedAnswer, formatFeedbackAnswerLabel,
} from '../constants'
import { formatTagLabel } from '../utils'
import { lookupGrammarExplanation } from '../lib/grammarExplanations'
import { isGrammarCurriculumMode, sanitizeRomajiInput } from '../utils'
import { useSession } from '../context/SessionContext'

/* ==================================================================================================
   THE ROUND — the last screen in the app still drawn in the old language, and the most used one.

   WHAT WAS HERE: a cassette deck. A CRT surface, four glitch corners, a VHS line, three crystals, a
   sweep, four particles, a DOLBY NR badge and a TYPE II · HIGH BIAS badge, around a character
   floating in a brown void over a boxed answer panel. The run's four numbers were set in 9px
   monospace between the title and the card — the one place on the screen the eye has to cross on
   every single answer.

   WHAT IS HERE NOW is the sheet: one washi plate on the stage, split into a prompt cell and a work
   cell, with the run's numbers in the crown where the app keeps every other number about you and the
   whole round as a strip of marks in the foot band. See `round.css` for the argument and
   `design-system/components/past-three.html` for the plate it is built from.

   THIS FILE KEPT ITS JOB AND LOST ITS LAYOUT. Every effect, every shortcut and all sixteen modes are
   the ones that were here; what moved out is where things go (`features/round`) and the two
   eleven-branch ternaries that decided what each mode's panel was called (`ROUND_COPY`). Four modes
   bring a board of their own — handwriting, stroke order, sentence assembly and speech — and those
   panels are hosted in the work cell unchanged rather than redrawn, which is a staged port and is
   said out loud rather than hidden.
   ================================================================================================== */

// Minimal card shape needed for stroke-order answer candidates.
type BasicCard = { id: number; character: string; romaji: string; meaning: string; dictionary_summary?: { reading: string } | null; tags?: string[] }

interface MinigameViewProps {
  navDirection: NavDirection
  activeScript: ScriptKey
  activeGame: MinigameKey
  activeSectionName: string | null
  /** which section of the menu this round was entered from, for the heading slab's trail */
  menuSection: MenuSectionKey | null
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
  navDirection: _navDirection,
  activeScript,
  activeGame,
  activeSectionName,
  menuSection,
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
  onOpenDictionary: _onOpenDictionary,
  onOpenSettings: _onOpenSettings,
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
    sessionRunReport,
    sessionStartPending,
    sessionSummaryLoading,
    livesEnabled,
    livesRemaining,
    roundResponseMs,
    roundSrsResult,
    roundExampleSentence,
    roundComboBonus,
    roundMilestoneStreak,
    confidenceCaptureEnabled,
    roundConfidenceScore,
    setRoundConfidence,
    voiceBusy,
    voiceUnavailable,
    answerInputRef,
    startSession,
    submitAnswer,
    setRoundInput,
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
  // Grammar cards get drilled through every mode, so gate on the card's tag rather than the
  // minigame. `roundState.focusText` is the sentence for grammar modes — the pattern the
  // explanation is keyed on lives on the card itself.
  const roundGrammarExplanation = displayedRoundCard?.tags?.includes('grammar')
    ? lookupGrammarExplanation(displayedRoundCard.character)
    : null

  // ── Phase 7: Progressive hint ladder ────────────────────────────────────────
  // 0 = no hint shown, 1 = clue, 2 = full answer giveaway
  const [hintStep, setHintStep] = useState<0 | 1 | 2>(0)
  const [activeChoiceIndex, setActiveChoiceIndex] = useState(0)
  const [speechFallbackToTyped, setSpeechFallbackToTyped] = useState(false)
  const [hintRevealCount, setHintRevealCount] = useState(0)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const previousSessionActiveRef = useRef(false)
  const [hintPopoverOpen, setHintPopoverOpen] = useState(false)
  const [handwritingHintUsed, setHandwritingHintUsed] = useState(false)
  const hintButtonRef = useRef<HTMLButtonElement | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const queueButtonRef = useRef<HTMLButtonElement | null>(null)
  /* WHAT YOU PRESSED, so the slips can carry the verdict rather than be replaced by a panel that
     states it. `roundFeedbackAnswer` is the session's own record of it and is the source; this is
     only here for the modes that do not set one. */
  const [chose, setChose] = useState<string | null>(null)

  /* THE RUN'S OWN TRAIL, derived rather than stored — see `stepTrail`. The session counts how many
     rounds have gone and how many were right; the foot band needs the order, and the order is the
     difference between those two numbers each time either moves. */
  const [trail, pushTrail] = useReducer(
    (state: typeof EMPTY_TRAIL, next: { rounds: number; score: number }) =>
      stepTrail(state, next.rounds, next.score),
    EMPTY_TRAIL,
  )
  useEffect(() => {
    pushTrail({ rounds: sessionRounds, score: sessionScore })
  }, [sessionRounds, sessionScore])

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
    if (roundState?.mode === 'handwriting') setHandwritingHintUsed(true)
  }, [roundState?.mode])

  // Reset hint when a new round starts.
  useEffect(() => {
    setHintStep(0)
    setHintPopoverOpen(false)
    setHandwritingHintUsed(false)
    setChose(null)
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
    setSpeechFallbackToTyped(false)
  }, [roundState?.cardId, roundState?.mode])

  const kind = roundState ? roundKind(roundState.mode) : 'choice'
  /* speech falls back to a typed answer when the microphone will not have it */
  const fill = kind === 'panel' && roundState?.mode === 'speech_recall' && speechFallbackToTyped
    ? 'typed'
    : kind

  // ── Phase 6 + 7: Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    if (!sessionActive || !roundState) return
    const activeRound = roundState
    const isChoice = roundKind(activeRound.mode) === 'choice'

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

      if (isChoice && !isRoundResolving && !isInputFocused) {
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
          if (selected) { setChose(selected.label); submitAnswer(selected.label) }
          return
        }

        // 1-4: select an option outright
        const index = parseInt(event.key, 10) - 1
        if (index >= 0 && index < activeRound.options.length) {
          event.preventDefault()
          setActiveChoiceIndex(index)
          setChose(activeRound.options[index].label)
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

  /* ==================================================================================================
     WHAT THE CROWN SAYS. The heading slab is the menu's own — the section you came in through on its
     own accent, the drill's name beside it — and the chips are the RUN's rather than the app's. */
  const head = useMemo(
    () => screenHead(menuSection ?? 'DRILLS', 'drills', { en: resolvedGameTitle.toUpperCase(), jp: '演習' }),
    [menuSection, resolvedGameTitle],
  )
  /* THE DECK, NOT THE SCRIPT. `SCRIPT_LABELS.kanji_n5` is "Kanji", and a round on N3 kanji captioned
     KANJI is the same half-truth the drills road already fixed for its own slab — the slug carries
     the level and the label does not. */
  const cap = [activeScript.replace(/_/g, ' '), activeSectionName].filter(Boolean).join(' · ').toUpperCase()
  const accuracy = sessionRounds > 0 ? Math.round((sessionScore / sessionRounds) * 100) : null
  const run = useMemo(() => {
    const chips = [
      {
        key: 'round',
        value: String(Math.min(sessionRounds + (sessionActive ? 1 : 0), effectiveTargetItems)).padStart(2, '0'),
        of: `/ ${effectiveTargetItems}`,
        label: 'ROUND',
      },
      { key: 'streak', value: `×${sessionStreak}`, label: 'STREAK' },
      { key: 'points', value: String(sessionPoints), label: 'PTS' },
    ]
    if (accuracy !== null) {
      chips.push({ key: 'clean', value: `${accuracy}%`, label: 'CLEAN' })
    }
    if (livesEnabled) {
      chips.push({
        key: 'lives', value: String(livesRemaining), label: 'LIVES', duty: livesRemaining <= 1,
      } as typeof chips[number] & { duty: boolean })
    }
    return chips
  }, [sessionRounds, sessionActive, effectiveTargetItems, sessionStreak, sessionPoints, accuracy, livesEnabled, livesRemaining])

  const said = roundFeedback !== null
  const copy = roundState ? roundCopy(roundState.mode) : roundCopy('meaning_match')
  const correct = roundState
    ? (roundState.mode === 'sentence_assembly' ? (roundState.answerDisplay ?? roundState.answer) : roundState.answer)
    : ''
  const chosen = roundFeedbackAnswer ?? chose

  const hints = useMemo(() => {
    if (!sessionActive || !roundState) {
      return [
        { cap: 'ENTER', en: 'Start', jp: '開始' },
        { cap: 'ESC', en: 'Leave', jp: '戻る' },
      ]
    }
    const rows = [
      fill === 'choice'
        ? { cap: '1–4', en: 'Answer', jp: '回答' }
        : { cap: 'ENTER', en: 'Answer', jp: '回答' },
      { cap: 'H', en: 'Hint', jp: '助言' },
    ]
    if (voiceEnabled && roundState.audioText) rows.push({ cap: 'P', en: 'Hear it', jp: '音声' })
    rows.push({ cap: 'F', en: 'Focus', jp: '集中' })
    rows.push({ cap: '/', en: 'Look up', jp: '辞書' })
    rows.push({ cap: 'ESC', en: 'Leave', jp: '中断' })
    return rows
  }, [sessionActive, roundState, fill, voiceEnabled])

  /* ==================================================================================================
     THE PROMPT. A specimen up to six glyphs and a wrapped stem past that — see `promptSize`. The
     reading rides over it when furigana are on, which is the one place the old screen's
     `ChallengePromptCard` did something this cell has to keep doing. */
  const focusText = roundState?.focusText ?? ''
  const hideMastered = furiganaAutoHideMastered && Boolean(roundState?.isMastered)
  const reading = furiganaEnabled && !hideMastered
    ? (displayedRoundCard?.dictionary_summary?.reading ?? null)
    : null
  /* LISTENING AND DICTATION DO NOT SHOW YOU THE ANSWER BEFORE YOU HEAR IT, which is the whole of
     those two modes. Sentence assembly does not either, and in place of the prompt it puts the
     button that plays it — the one affordance that cannot be a keycap, because there is nothing
     else on that half of the sheet to press. */
  const heardFirst = roundState?.mode === 'listening_audio_first' || roundState?.mode === 'dictation'
  const assembling = roundState?.mode === 'sentence_assembly'
  const focusNode = !roundState
    ? null
    : assembling && !said
      ? (
        <button
          type="button"
          className="rd-listen"
          onClick={() => playAudio(roundState.audioText)}
          disabled={voiceBusy || !voiceEnabled}
          aria-label="Play sentence audio"
        >
          <Volume2 size={26} aria-hidden="true" />
          <span>{voiceBusy ? 'LOADING…' : voiceUnavailable ? 'VOICE UNAVAILABLE' : 'LISTEN'}</span>
        </button>
      )
      : reading && reading !== focusText
        ? <ruby>{focusText}<rp>(</rp><rt>{reading}</rt><rp>)</rp></ruby>
        : focusText

  /* THE HINT BULB AND THE SPEAKER. `H` and `P` do the same jobs and are written in the hint row, but
     a key is not an affordance for anybody using a mouse — and these two were the whole reason the
     old prompt card had a head. Which speaker it is depends on the mode: on a listening round the
     audio IS the prompt, so it says replay. */
  const wordAudio = roundState != null && !heardFirst && !assembling
    && voiceEnabled && Boolean(roundState.audioText)
  const listenAudio = roundState != null && heardFirst && voiceEnabled && Boolean(roundState.audioText)
  const sentenceAudio = roundState != null && !heardFirst && !assembling
    && activeScript === 'grammar_patterns' && voiceEnabled && Boolean(roundState.exampleSentenceAudioText)
  const tools = roundState ? (
    <>
      <button
        ref={hintButtonRef}
        type="button"
        className={hintPopoverOpen ? 'is-active' : undefined}
        onClick={(event) => {
          event.stopPropagation()
          if (roundState.mode === 'handwriting') setHandwritingHintUsed(true)
          setHintPopoverOpen((v) => !v)
        }}
        aria-label="Toggle hint"
        title={showKeyboardPrompts ? 'Toggle hint (H)' : 'Toggle hint'}
      >
        <Lightbulb size={13} aria-hidden="true" />
      </button>
      {wordAudio || listenAudio ? (
        <button
          type="button"
          onClick={() => playAudio(roundState.audioText)}
          disabled={voiceBusy}
          aria-label={listenAudio ? 'Replay audio' : 'Play target words'}
          title={voiceUnavailable
            ? 'Voice playback unavailable'
            : showKeyboardPrompts ? 'Play (P)' : 'Play'}
        >
          <Volume2 size={13} aria-hidden="true" />
        </button>
      ) : null}
      {sentenceAudio ? (
        <button
          type="button"
          onClick={() => playAudio(roundState.exampleSentenceAudioText!)}
          disabled={voiceBusy}
          aria-label="Play example sentence"
          title={voiceUnavailable ? 'Voice playback unavailable' : 'Play example sentence'}
        >
          <Volume2 size={11} aria-hidden="true" />
        </button>
      ) : null}
    </>
  ) : null

  /* WHAT THE WRONG ANSWER EARNS. A grammar pattern if the card has one, the dictionary's own note if
     it does not, and the card's meaning under the answer either way — the three things the old
     feedback panel carried, in the cell that is already open rather than in a panel that appears. */
  const glossBody = roundGrammarExplanation
    ? `${roundGrammarExplanation.formation} ${roundGrammarExplanation.commonMistake}`
    : roundState?.dictionaryNote?.copy ?? roundExampleSentence?.en ?? null
  /* THE PATTERN'S NAME BEATS THE CARD'S FIELDS. A grammar card drilled through Meaning Match is
     still a grammar card -- the old screen gated its explanation on the card's tag rather than on
     the mode for exactly this reason, and the line under the answer has to agree with it. */
  const glossUnder = roundGrammarExplanation
    ? roundGrammarExplanation.name
    : roundState && !isGrammarCurriculumMode(roundState.mode)
      /* AND NOT THE ANSWER AGAIN. On a kana deck the card's romaji, its meaning and the answer are
         all the same word, so the honest line under `sha` was `sha · sha`. Anything that is only
         the answer restated is dropped, and if that empties the line there is no line. */
      ? [displayedRoundCard?.romaji ?? '', displayedRoundCard?.meaning ?? '']
        .filter((part) => part && part.trim().toLowerCase() !== correct.trim().toLowerCase())
        .filter((part, index, all) => all.indexOf(part) === index)
        .join(' · ') || null
      : null

  const back = (
    <>
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
            if (roundState.mode === 'handwriting') setHandwritingHintUsed(true)
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
    </>
  )

  /* ==================================================================================================
     THE THREE STATES THAT ARE NOT A QUESTION, on the same sheet — see the note in `round.css`. */
  if (!sessionActive || !roundState) {
    const report = sessionRunReport
    const loading = (sessionStartPending && !sessionActive) || (sessionActive && !roundState)
    const canStart = !gameLoading && activeRunCardsLength > 0 && !sessionSummaryLoading && !sessionStartPending

    if (report && !sessionStartPending) {
      const missed = report.wrongCardIds.length
      return (
        <>
          <Round
            head={head}
            cap={cap}
            run={run}
            foot={{ at: report.rounds, target: report.rounds, trail: trail.trail, note: 'RUN COMPLETE' }}
            onBack={onBack}
            backLabel="Back"
            backJp="戻る"
            hints={[
              { cap: 'ENTER', en: 'Again', jp: '再開' },
              { cap: 'ESC', en: 'Back', jp: '戻る' },
            ]}
            ask={
              <div className="rd-ask">
                <div className="rd-kick"><span>HOW IT WENT</span><em>結果</em></div>
                <div className="rd-score">
                  <b>{report.accuracy}<sup>%</sup></b>
                  <i>{report.correct} OF {report.rounds} CLEAN</i>
                </div>
                <div className="rd-src">FINISHED <i>{report.completedAt}</i></div>
              </div>
            }
            work={
              <div className="rd-work">
                <div className="rd-kick"><span>THE RUN</span><em>記録</em></div>
                <div className="rd-body">
                  <div className="rd-tally">
                    <div className="rd-tally-row">Points earned<s /><b>{report.points}</b></div>
                    <div className="rd-tally-row">
                      Goal<s>{report.goalCompletionPct}% OF {report.targetItems}</s>
                    </div>
                    <div className="rd-tally-row">Missed<s /><b>{missed}</b></div>
                    {report.livesEnabled ? (
                      <div className="rd-tally-row">Lives left<s /><b>{report.livesRemaining}</b></div>
                    ) : null}
                    {report.nearMissCardIds.length > 0 ? (
                      <div className="rd-tally-row">
                        Near misses<s /><b>{report.nearMissCardIds.length}</b>
                      </div>
                    ) : null}
                  </div>
                  <div className="rd-acts">
                    <button
                      type="button"
                      className="rd-slab go"
                      onClick={() => startSession()}
                      disabled={sessionStartPending}
                    >
                      RUN IT AGAIN<em>再開</em>
                    </button>
                    {missed > 0 ? (
                      <button
                        type="button"
                        className="rd-slab calm go"
                        onClick={() => onRetry(report.wrongCardIds)}
                      >
                        THE {missed} YOU MISSED<em>復習</em>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            }
          />
          {back}
        </>
      )
    }

    return (
      <>
        <Round
          head={head}
          cap={cap}
          run={run}
          foot={{ at: 0, target: effectiveTargetItems, trail: [], note: 'NOT STARTED' }}
          onBack={onBack}
          backLabel="Back"
          backJp="戻る"
          hints={hints}
          ask={
            <div className="rd-ask">
              <div className="rd-kick"><span>{loading ? 'ONE MOMENT' : 'READY'}</span><em>準備</em></div>
              <div className="rd-focus" style={{ fontSize: '96px' }}>{loading ? '…' : '始'}</div>
              <div className="rd-src">DECK <i>{activeRunCardsLength} CARDS</i></div>
            </div>
          }
          work={
            <div className="rd-work">
              <div className="rd-kick"><span>{resolvedGameTitle.toUpperCase()}</span><em>演習</em></div>
              <div className="rd-body">
                <div className="rd-plain">
                  <h2>{loading ? (sessionStartPending ? 'Preparing your round...' : 'Loading next card...') : resolvedGameTitle}</h2>
                  <p>
                    {gameError
                      ? <span className="rd-err">{gameError}</span>
                      : gameLoading
                        ? 'Loading deck...'
                        : `${activeRunCardsLength} cards available`}
                  </p>
                </div>
                <button
                  type="button"
                  className="rd-slab go"
                  onClick={() => startSession()}
                  disabled={!canStart}
                  aria-label="Play"
                >
                  {sessionRunReport ? 'PLAY AGAIN' : 'PLAY'}<em>開始</em>
                </button>
              </div>
            </div>
          }
        />
        {back}
      </>
    )
  }

  /* ==================================================================================================
     AND THE ROUND ITSELF. */
  const slab = said
    ? {
      /* the failure's full sentence is in the verdict, where there is room for it; the slab says
         only that the way on is shut, because a slab is one line */
      text: roundAdvanceError ? 'THAT REVIEW DID NOT SAVE' : 'ENTER FOR THE NEXT ONE',
      jp: roundAdvanceError ? undefined : '次へ',
      tone: 'calm' as const,
      onClick: skipFeedback,
      disabled: roundAdvancePending || roundAdvanceError,
      /* THE NAME THE REST OF THE APP KNOWS THIS CONTROL BY. It has been "Continue immediately" since
         the feedback card had a skip button, and it is what a screen reader and four test files
         both reach for; the slab is the same control wearing the sheet's clothes. */
      label: showKeyboardPrompts ? 'Continue immediately (Enter)' : 'Continue immediately',
    }
    : {
      text: fill === 'choice' ? '1–4 OR ENTER TO ANSWER' : 'ENTER TO ANSWER',
      jp: '回答',
      tone: 'duty' as const,
    }

/* THE INTERVAL IS THE ONE FACT A SPACED-REPETITION APP EXISTS TO TELL YOU, and it was an 8.5px
     chip in a metadata row -- fifth of five -- while the stopwatch, which decides nothing, had the
     prompt cell's whole dedicated line to itself. THEY SWAP: the interval takes the line and the
     time keeps the footnote it deserves, so nothing is said twice and the loud slot carries the
     fact worth being loud about. */
  const nextReview = said && roundSrsResult ? roundSrsResult.interval : null
  const src = nextReview != null
    ? { label: 'NEXT REVIEW', value: `${nextReview}D` }
    : said && roundResponseMs != null
      ? { label: 'ANSWERED IN', value: `${(roundResponseMs / 1000).toFixed(1)}S` }
      : roundState.isMastered
        ? { label: 'THIS ONE IS', value: 'MASTERED' }
        : null

  return (
    <>
      <Round
        head={head}
        cap={cap}
        run={run}
        said={said}
        foot={{ at: sessionRounds, target: effectiveTargetItems, trail: trail.trail }}
        onBack={onBack}
        onRestart={() => startSession()}
        hints={hints}
        ask={
          <RoundAsk
            kick={said ? (roundFeedbackTone === 'error' ? 'NOT QUITE' : 'THAT IS IT') : copy.ask}
            kickJp={said ? (roundFeedbackTone === 'error' ? '不正解' : '正解') : copy.askJp}
            tools={tools}
            tags={(displayedRoundCard?.tags ?? []).map(formatTagLabel)}
            hidden={heardFirst && !said}
            size={assembling && !said ? 16 : promptSize(focusText)}
            src={src}
            gloss={said ? (
              <RoundGloss
                answer={correct}
                answerIsJp={roundState.mode === 'character_match' || roundState.mode === 'particle_cloze'}
                under={glossUnder}
                body={glossBody}
              />
            ) : null}
          >
            {focusNode}
          </RoundAsk>
        }
        work={
          <RoundWork
            kick={copy.work}
            kickJp={copy.workJp}
            /* THE ROUND'S OWN INSTRUCTION BEATS THE TABLE'S. `promptLabel` comes with the card and
               says what THIS one wants -- "Type the romaji reading to see kanji options" -- where
               `ROUND_COPY` only knows the mode. Printed only when it is not the kicker again. */
            note={said ? null : (
              roundState.promptLabel && roundState.promptLabel.toUpperCase() !== copy.ask
                ? roundState.promptLabel
                : copy.note
            )}
            slab={slab}
            after={said ? (
              <RoundVerdict
                message={roundFeedback ?? ''}
                tone={roundFeedbackTone}
                comboBonus={roundComboBonus}
                milestoneStreak={roundMilestoneStreak}
                livesEnabled={livesEnabled}
                yours={chosen}
                yoursLabel={formatFeedbackAnswerLabel(roundState.mode)}
                answer={roundFeedbackTone === 'error' || roundState.mode === 'handwriting'
                  ? formatExpectedAnswer(correct)
                  : null}
                /* the slips already say both, so only a typed or drawn round needs them spelled out */
                showAnswers={fill !== 'choice'}
                /* the time only where the prompt cell's line is not already carrying it */
                responseMs={nextReview != null ? roundResponseMs : null}
                example={roundExampleSentence}
                note={roundState.dictionaryNote
                  ? { title: roundState.dictionaryNote.title, copy: roundState.dictionaryNote.copy }
                  : null}
                saving={roundAdvancePending}
                saveFailed={roundAdvanceError}
                savingCopy={FEEDBACK_COPY.REVIEW_SAVING}
                saveFailedCopy={FEEDBACK_COPY.REVIEW_SAVE_FAILURE}
              />
            ) : confidenceCaptureEnabled ? (
              <RoundConfidence
                scores={CONFIDENCE_SCORES}
                labels={CONFIDENCE_LEVEL_LABELS}
                value={roundConfidenceScore}
                disabled={isRoundResolving}
                onSet={setRoundConfidence}
              />
            ) : null}
          >
            {fill === 'choice' ? (
              <RoundSlips
                options={roundState.options}
                activeIndex={activeChoiceIndex}
                disabled={isRoundResolving}
                answer={said ? correct : null}
                chose={chosen}
                jp={roundState.mode === 'character_match' || roundState.mode === 'particle_cloze'}
                onActiveIndexChange={setActiveChoiceIndex}
                onSelect={(label) => { setChose(label); submitAnswer(label) }}
              />
            ) : fill === 'typed' ? (
              <RoundTyped
                inputRef={answerInputRef}
                value={roundInput}
                placeholder={
                  roundState.mode === 'romaji_sprint'
                    ? 'Enter romaji'
                    : roundState.mode === 'dictation' || roundState.mode === 'conjugation_drill'
                      ? 'Type here — it becomes kana'
                      : 'Type the meaning'
                }
                disabled={isRoundResolving}
                onChange={(value) =>
                  setRoundInput(roundState.mode === 'romaji_sprint' ? sanitizeRomajiInput(value) : value)
                }
                onSubmit={(value) => {
                  const answer = roundState.mode === 'romaji_sprint' ? sanitizeRomajiInput(value) : value
                  setChose(answer)
                  submitAnswer(answer)
                }}
                wanakanaMode={
                  roundState.mode === 'conjugation_drill'
                    ? 'hiragana'
                    : roundState.mode === 'dictation'
                      ? (activeScript === 'katakana' ? 'katakana' : 'hiragana')
                      : undefined
                }
              />
            ) : (
              /* THE FOUR THAT BRING A BOARD OF THEIR OWN. Hosted in the cell rather than redrawn —
                 a canvas, a stroke grid, a drag-to-order strip and a microphone are four screens of
                 their own and are the next thing to port, not a detail of this one. */
              <div className="rd-panel">
                {roundState.mode === 'handwriting' ? (
                  <HandwritingAnswerPanel
                    character={roundState.answer}
                    disabled={isRoundResolving}
                    externalHintUsed={handwritingHintUsed}
                    onComplete={onHandwritingOutcome}
                  />
                ) : roundState.mode === 'stroke_order' ? (
                  <StrokeOrderAnswerPanel
                    activeBlockCards={activeBlockCards}
                    answerInputRef={answerInputRef}
                    roundInput={roundInput}
                    disabled={isRoundResolving}
                    onInputChange={setRoundInput}
                    onSelect={(label) => { setChose(label); submitAnswer(label) }}
                  />
                ) : roundState.mode === 'sentence_assembly' ? (
                  <SentenceAssemblyAnswerPanel
                    options={roundState.options}
                    disabled={isRoundResolving}
                    onSubmit={(label) => { setChose(label); submitAnswer(label) }}
                  />
                ) : (
                  <SpeechAnswerPanel
                    expectedAnswer={roundState.answer}
                    disabled={isRoundResolving}
                    onResult={({ transcript }) => { setChose(transcript); submitAnswer(transcript) }}
                    onFallbackToTyped={() => setSpeechFallbackToTyped(true)}
                  />
                )}
              </div>
            )}
          </RoundWork>
        }
      />
      {back}
    </>
  )
}
