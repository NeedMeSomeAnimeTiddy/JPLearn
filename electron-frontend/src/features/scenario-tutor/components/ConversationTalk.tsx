import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { bindWanakanaIme } from '../../../lib/wanakanaBinding'
import { Round } from '../../round'
import type { RunChip } from '../../round'
import { screenHead } from '../../menu'
import {
  CONVERSATION_COPY, CONVERSATION_HINT_ROWS, CONVERSATION_OUTCOME, SCENARIO_COPY, SCENARIO_LEVEL_LABELS,
  SCENARIO_TTS_SPEED_SCALE,
} from '../constants'
import type { ScenarioDefinition, ScenarioSession } from '../types'
import type { UseScenarioTutorReturn } from '../useScenarioTutor'
import { pressesItself, useSheetKeys } from '../useSheetKeys'
import {
  latestNpcTurn, lineSize, objectiveFoot, objectiveTally, objectiveTickClass, type HeldAnswer,
} from '../utils'

export interface ConversationTalkProps {
  tutor: UseScenarioTutorReturn
  scenario: ScenarioDefinition
  session: ScenarioSession
  /** the answer the sheet is holding until ENTER, once the engine has graded it */
  answer: HeldAnswer | null
  onSend: () => void
  onNext: () => void
  romajiEnabled: boolean
  onToggleRomaji: () => void
  audioEnabled: boolean
  onToggleAudio: () => void
}

function micLine(tutor: UseScenarioTutorReturn): { text: string; bad: boolean } | null {
  const left = Math.max(0, Math.ceil((tutor.micMaxDurationMs - tutor.micElapsedMs) / 1000))
  switch (tutor.micState) {
    case 'requesting-permission': return { text: SCENARIO_COPY.micRequesting, bad: false }
    case 'recording': return { text: `LISTENING · ${left}S LEFT · CTRL+M TO STOP`, bad: false }
    case 'processing': return { text: SCENARIO_COPY.micTranscribing, bad: false }
    case 'error':
      if (tutor.micErrorReason === 'permission') return { text: SCENARIO_COPY.micPermissionDenied, bad: true }
      if (tutor.micErrorReason === 'no-device') return { text: SCENARIO_COPY.micNoDevice, bad: true }
      if (tutor.micErrorReason === 'unsupported') return { text: SCENARIO_COPY.micUnsupported, bad: true }
      return { text: SCENARIO_COPY.micFailed, bad: true }
    default: return null
  }
}

/* ==================================================================================================
   THE CONVERSATION ITSELF (boards ConvAsking, ConvAnswered, ConvStates).

   ASKING: the character's line is the prompt -- Japanese, its reading, and the English, which is
   always shown -- and the reply is a rule on the paper with the mic beside it. CTRL+M starts and
   stops the mic from anywhere on the sheet, including from inside the rule.

   ANSWERED: the engine grades a reply and moves on at once, so the sheet holds what just happened
   until ENTER -- what you said, stamped with how it went, the correction when there is one, and the
   character's next line underneath. Nothing about the next turn is asked of you until you have read
   about this one.

   LEAVING asks first, and asks on the slab rather than over the sheet: ESC turns the slab into the
   question, and ESC again keeps going.
   ================================================================================================== */
export function ConversationTalk({
  tutor, scenario, session, answer, onSend, onNext, romajiEnabled, onToggleRomaji, audioEnabled, onToggleAudio,
}: ConversationTalkProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const composing = useRef(false)
  const nodeId = session.currentNodeId
  /* hints are never shown until asked for, and asking is for this line only */
  const [hintsFor, setHintsFor] = useState<string | null>(null)
  const hintsOpen = hintsFor === nodeId
  const hintLevel = session.hintLevels[nodeId]
  const unlocked = typeof hintLevel === 'number' ? hintLevel + 1 : 0
  const hints = tutor.currentHints
  const shown = hintsOpen ? Math.min(unlocked, hints.length) : 0

  const confirm = tutor.confirmAction
  const active = session.status === 'active'
  const canRecord = tutor.speechInputAvailable
  const recording = tutor.micState === 'recording'
  const micBusy = tutor.micState === 'requesting-permission' || tutor.micState === 'processing'
  const inputDisabled = Boolean(confirm) || tutor.evaluatingResponse

  /* the same romaji-to-kana the typed drills use, bound to the rule itself while the switch is on */
  useEffect(() => {
    const element = inputRef.current
    if (!element || !romajiEnabled || answer) return
    return bindWanakanaIme(element, 'toHiragana')
  }, [romajiEnabled, answer])

  useEffect(() => {
    if (!answer && !confirm) inputRef.current?.focus({ preventScroll: true })
  }, [answer, confirm, nodeId])

  const toggleMic = () => {
    if (!canRecord || answer || confirm) return
    if (recording) tutor.stopRecording()
    else if (!micBusy) tutor.startRecording()
  }

  const showHint = () => {
    if (!hintsOpen) {
      setHintsFor(nodeId)
      if (unlocked === 0) tutor.revealHint()
      return
    }
    tutor.revealHint()
  }

  useSheetKeys((event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirm) tutor.cancelPendingAction()
      else if (active) tutor.requestAbandon()
      else onNext()
      return
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'm' || event.key === 'M')) {
      event.preventDefault()
      toggleMic()
      return
    }
    if (event.key === 'Enter' && answer && !confirm && !pressesItself(event.target)) {
      event.preventDefault()
      onNext()
    }
  })

  const npc = scenario.npc.name.toUpperCase()
  const asking = answer ? answer.answering : latestNpcTurn(session.transcript)
  const tally = objectiveTally(scenario, session)
  const duty = answer !== null && answer.turn.outcome !== 'correct'
  const head = screenHead('READING', 'scenes')
  const status = micLine(tutor)

  const run: RunChip[] = [
    { key: 'objectives', value: String(tally.neededMet), of: `/ ${tally.needed}`, label: 'OBJECTIVES' },
  ]
  if (hints.length > 0 && !answer) {
    run.push({ key: 'hints', value: String(shown), of: `OF ${hints.length}`, label: 'HINTS' })
  }

  const hintFrom = Math.max(0, shown - CONVERSATION_HINT_ROWS)
  const hintLabel = !hintsOpen ? SCENARIO_COPY.hintReveal
    : shown < hints.length ? SCENARIO_COPY.hintRevealMore : SCENARIO_COPY.hintAllRevealed

  const slab = (() => {
    if (confirm) {
      return (
        <div
          className="cv-ask-q"
          role="alertdialog"
          aria-label={confirm === 'abandon' ? 'Confirm leaving the scenario' : 'Confirm restarting the scenario'}
        >
          <span>{confirm === 'abandon' ? CONVERSATION_COPY.leaveAsk : CONVERSATION_COPY.restartAsk}</span>
          <button type="button" className="yes" onClick={tutor.confirmPendingAction}>{CONVERSATION_COPY.yes}</button>
          {/* the safe answer has the focus, so ENTER on a stray ESC keeps the conversation */}
          <button type="button" className="no" onClick={tutor.cancelPendingAction} autoFocus>{CONVERSATION_COPY.no}</button>
        </div>
      )
    }
    if (answer) {
      return (
        <button type="button" className="rd-slab calm go" onClick={onNext}>
          {active ? 'ENTER FOR THE NEXT LINE' : 'ENTER TO SEE HOW IT WENT'}<em>{active ? '次へ' : '結果'}</em>
        </button>
      )
    }
    if (tutor.evaluatingResponse) {
      return <div className="rd-slab calm">CHECKING YOUR ANSWER<em>判定中</em></div>
    }
    return (
      <button
        type="button"
        className="rd-slab go"
        onClick={onSend}
        disabled={inputDisabled || tutor.learnerInputValue.trim().length === 0}
        aria-label="Submit response"
      >
        SAY IT<em>送る</em>
      </button>
    )
  })()

  return (
    <Round
      head={head && duty ? { ...head, accent: 'var(--hi)' } : head}
      cap={`${scenario.title.toUpperCase()} · ${scenario.titleJa} · ${SCENARIO_LEVEL_LABELS[session.level].toUpperCase()}`}
      run={run}
      said={answer !== null}
      foot={{
        at: 0, target: 0, trail: [], note: 'OBJECTIVES',
        marks: tally.ticks.map(objectiveTickClass),
        right: objectiveFoot(tally, 'during'),
      }}
      onBack={tutor.requestAbandon}
      backLabel="Leave"
      backJp="退出"
      backAria="Leave scenario"
      onRestart={tutor.requestRestart}
      restart={{ en: 'Start over', jp: '最初から', aria: 'Restart scenario' }}
      hints={answer
        ? [{ cap: 'ENTER', en: 'Next', jp: '次へ' }, { cap: 'ESC', en: 'Leave', jp: '中断' }]
        : [
          { cap: 'ENTER', en: 'Say it', jp: '送る' },
          ...(canRecord ? [{ cap: 'CTRL+M', en: 'Speak', jp: '録音' }] : []),
          { cap: 'ESC', en: 'Leave', jp: '中断' },
        ]}
      ask={
        <div className="rd-ask">
          <div className={answer ? 'rd-kick cv-q' : 'rd-kick'}>
            <span>{answer ? `${npc} · YOU WERE ANSWERING` : `${npc} · ${scenario.npc.role.toUpperCase()}`}</span>
            {tutor.npcAudioAvailable && asking ? (
              <span className="rd-tools">
                <button
                  type="button"
                  className={tutor.npcSpeaking ? 'is-active' : undefined}
                  onClick={() => tutor.replayNpcLine(asking.line)}
                  aria-label={`${SCENARIO_COPY.replayAudio}: ${asking.line.ja}`}
                  title={SCENARIO_COPY.replayAudio}
                >
                  <Volume2 size={12} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            ) : null}
          </div>
          <div className={answer ? 'cv-line quiet' : 'cv-line'} aria-live={answer ? undefined : 'polite'}>
            {asking ? (
              <>
                <b lang="ja" style={{ fontSize: `${lineSize(asking.line.ja)}px` }}>{asking.line.ja}</b>
                {asking.line.reading && asking.line.reading !== asking.line.ja
                  ? <i lang="ja">{asking.line.reading}</i> : null}
                <p>{asking.line.en}</p>
              </>
            ) : null}
          </div>
          <div className="rd-src cv-src">
            <span className="cv-earlier">
              {asking && asking.earlier > 0
                ? `↑ ${asking.earlier} EARLIER TURN${asking.earlier === 1 ? '' : 'S'}`
                : 'THE FIRST LINE'}
            </span>
            {answer
              ? <span>ATTEMPT <i>{answer.attempt} OF {answer.maxAttempts}</i></span>
              : <span>AUDIO <i>{tutor.npcAudioAvailable ? `${SCENARIO_TTS_SPEED_SCALE[session.level]}×` : 'OFF'}</i></span>}
          </div>
        </div>
      }
      work={
        <div className="rd-work">
          {answer ? (
            <>
              <div className="rd-kick"><span>YOU SAID</span><em>回答</em></div>
              <div className={`cv-said ${answer.turn.outcome ?? ''}`} role="status">
                <b lang="ja">{answer.turn.learnerInput}</b>
                {answer.turn.outcome ? (
                  <s>
                    {CONVERSATION_OUTCOME[answer.turn.outcome].en}
                    <em>{CONVERSATION_OUTCOME[answer.turn.outcome].jp}</em>
                  </s>
                ) : null}
              </div>
              <div className="cv-slips cv-sub">
                {answer.turn.correction ? (
                  <div className="cv-slip fix">
                    <u>FIX</u>
                    <div className="t">
                      <s>{SCENARIO_COPY.correctionLabel.toUpperCase()}</s>
                      <span className="jp" lang="ja">{answer.turn.correction}</span>
                      {answer.turn.correctionReading && answer.turn.correctionReading !== answer.turn.correction
                        ? <span className="kana" lang="ja">{answer.turn.correctionReading}</span> : null}
                      {answer.turn.correctionRomaji ? <span className="ro">({answer.turn.correctionRomaji})</span> : null}
                    </div>
                  </div>
                ) : null}
                {answer.given ? (
                  <div className="cv-slip fix">
                    <u>SAY</u>
                    <div className="t">
                      <s>{SCENARIO_COPY.assistLabel.toUpperCase()}</s>
                      <span className="jp" lang="ja">{answer.given.answer}</span>
                      {answer.given.reading && answer.given.reading !== answer.given.answer
                        ? <span className="kana" lang="ja">{answer.given.reading}</span> : null}
                      {answer.given.romaji ? <span className="ro">({answer.given.romaji})</span> : null}
                    </div>
                  </div>
                ) : null}
                {answer.next.length > 0 ? (
                  <div className="cv-slip quiet">
                    <u>NEXT</u>
                    <div className="t">
                      <s>THE {npc}, NEXT</s>
                      <span className="jp" lang="ja" style={{ fontSize: '16px' }}>
                        {answer.next.map((line) => line.ja).join(' ')}
                      </span>
                      <span className="en">{answer.next.map((line) => line.en).join(' ')}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="rd-kick">
                <span>YOUR REPLY <em>回答</em></span>
                <span className="cv-kick-side">
                  <button
                    type="button"
                    className={audioEnabled ? 'cv-btn on' : 'cv-btn'}
                    aria-pressed={audioEnabled}
                    aria-label={audioEnabled ? 'Turn the character’s voice off' : 'Turn the character’s voice on'}
                    onClick={onToggleAudio}
                  >
                    SOUND {audioEnabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    className={romajiEnabled ? 'cv-btn on' : 'cv-btn'}
                    aria-pressed={romajiEnabled}
                    aria-label={romajiEnabled ? 'Turn off romaji-to-kana conversion' : 'Turn on romaji-to-kana conversion'}
                    onClick={onToggleRomaji}
                  >
                    ROMAJI → KANA {romajiEnabled ? 'ON' : 'OFF'}
                  </button>
                </span>
              </div>
              <div className="cv-rule-row">
                <input
                  ref={inputRef}
                  className="rd-rule cv-rule"
                  lang="ja"
                  value={tutor.learnerInputValue}
                  placeholder={CONVERSATION_COPY.placeholder}
                  aria-label="Your response"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={inputDisabled}
                  onChange={(event) => { if (!romajiEnabled) tutor.setLearnerInputValue(event.target.value) }}
                  onInput={(event) => {
                    if (romajiEnabled && !composing.current) tutor.setLearnerInputValue(event.currentTarget.value)
                  }}
                  onCompositionStart={() => { composing.current = true }}
                  onCompositionEnd={(event) => {
                    composing.current = false
                    if (romajiEnabled) tutor.setLearnerInputValue(event.currentTarget.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || composing.current) return
                    event.preventDefault()
                    onSend()
                  }}
                />
                {canRecord ? (
                  <button
                    type="button"
                    className={recording ? 'cv-mic on' : 'cv-mic'}
                    onClick={toggleMic}
                    disabled={inputDisabled || micBusy}
                    aria-pressed={recording}
                    aria-label={recording ? SCENARIO_COPY.micStop : SCENARIO_COPY.micStart}
                  >
                    <span><i aria-hidden="true" />{recording ? 'STOP' : 'SPEAK'}</span>
                    <u>CTRL+M</u>
                  </button>
                ) : null}
              </div>
              {tutor.heardTranscript ? (
                <p className="cv-heard" aria-live="polite">
                  <b>HEARD</b> “<span lang="ja">{tutor.heardTranscript}</span>” {SCENARIO_COPY.heardHint}
                </p>
              ) : null}
              {confirm ? (
                <p className="cv-status bad">
                  {confirm === 'abandon' ? CONVERSATION_COPY.leaveNote : CONVERSATION_COPY.restartNote}
                </p>
              ) : tutor.sttError ? (
                <p className="cv-status bad" role="alert">{tutor.sttError}</p>
              ) : tutor.evaluatingResponse ? (
                <p className="cv-status" role="status">{SCENARIO_COPY.evaluatingResponse}</p>
              ) : status ? (
                <p className={status.bad ? 'cv-status bad' : 'cv-status'} role={status.bad ? 'alert' : 'status'}>{status.text}</p>
              ) : tutor.npcSpeaking ? (
                <p className="cv-status" role="status">PLAYING THE LINE…</p>
              ) : null}
              {hints.length > 0 ? (
                <>
                  {shown > 0 ? (
                    <>
                      <div className="rd-kick cv-q cv-sub"><span>HINTS</span><em>助言</em></div>
                      <div className="cv-slips" aria-live="polite">
                        {hints.slice(hintFrom, shown).map((hint, i) => (
                          <div className="cv-slip" key={`${nodeId}-${hintFrom + i}`}>
                            <u>{hintFrom + i + 1}</u>
                            <div className="t">
                              <b>{hint.en}</b>
                              {hint.ja ? <span className="jp" lang="ja">{hint.ja}</span> : null}
                              {hint.romaji ? <span className="ro">{hint.romaji}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <div className="cv-more">
                    <button
                      type="button"
                      className="cv-btn"
                      onClick={showHint}
                      disabled={inputDisabled || (hintsOpen && shown >= hints.length)}
                      aria-label={hintLabel}
                    >
                      {hintLabel.toUpperCase()}
                    </button>
                    {hintFrom > 0 ? <span className="cv-small">+ {hintFrom} EARLIER HINT{hintFrom === 1 ? '' : 'S'}</span> : null}
                  </div>
                </>
              ) : null}
            </>
          )}
          {slab}
        </div>
      }
    />
  )
}
