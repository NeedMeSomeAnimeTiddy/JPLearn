import { Volume2 } from 'lucide-react'
import { SCENARIO_COPY } from '../constants'
import { LearnerInputPanel } from './LearnerInputPanel'
import { ScenarioHintPanel } from './ScenarioHintPanel'
import type { MicRecorderErrorReason, MicRecorderState } from '../../../hooks/useMicRecorder'
import type { NpcLine, ScenarioConfirmAction, ScenarioDefinition, ScenarioHint, ScenarioSession } from '../types'

interface ScenarioPlayerProps {
  scenario: ScenarioDefinition
  session: ScenarioSession
  learnerInputValue: string
  onLearnerInputChange: (value: string) => void
  onSubmit: () => void
  confirmAction: ScenarioConfirmAction
  onRequestAbandon: () => void
  onRequestRestart: () => void
  onConfirmPendingAction: () => void
  onCancelPendingAction: () => void
  /** Present only when NPC audio can actually play — the line's text, reading,
   * and translation are rendered either way. */
  onReplayAudio?: (line: NpcLine) => void
  npcSpeaking?: boolean
  /** True while an uncertain response is with the local model. The turn is
   * already committed; this only blocks a second submission. */
  evaluatingResponse?: boolean
  speechInputAvailable?: boolean
  micState?: MicRecorderState
  micErrorReason?: MicRecorderErrorReason | null
  micElapsedMs?: number
  micMaxDurationMs?: number
  sttError?: string | null
  heardTranscript?: string | null
  onStartRecording?: () => void
  onStopRecording?: () => void
  hints?: ScenarioHint[]
  onRevealHint?: () => void
  romajiConversionEnabled: boolean
}

export function ScenarioPlayer({
  scenario,
  session,
  learnerInputValue,
  onLearnerInputChange,
  onSubmit,
  confirmAction,
  onRequestAbandon,
  onRequestRestart,
  onConfirmPendingAction,
  onCancelPendingAction,
  onReplayAudio,
  npcSpeaking = false,
  evaluatingResponse = false,
  speechInputAvailable = false,
  micState,
  micErrorReason,
  micElapsedMs,
  micMaxDurationMs,
  sttError,
  heardTranscript,
  onStartRecording,
  onStopRecording,
  hints = [],
  onRevealHint,
  romajiConversionEnabled,
}: ScenarioPlayerProps) {
  const requiredObjectives = scenario.objectives.filter((objective) => objective.required)
  const metRequired = requiredObjectives.filter((objective) => session.objectiveStatus[objective.id] === 'met').length
  const currentNode = scenario.nodes[session.currentNodeId]
  const currentHintLevel = currentNode?.kind === 'learner'
    ? session.hintLevels[session.currentNodeId]
    : undefined
  const inputDisabled = !!confirmAction || evaluatingResponse

  return (
    <div className="scenario-activity scenario-player">
      <div className="scenario-player-header">
        <span className="scenario-player-title">{scenario.title}</span>
        <span className="scenario-player-progress" aria-live="polite">
          {metRequired}/{requiredObjectives.length} objectives
        </span>
      </div>

      <div className="assistant-chat-log scenario-conversation-log" role="log" aria-live="polite">
        {session.transcript.map((turn) => {
          if (turn.npcLine) {
            return (
              <div key={turn.turnIndex} className="assistant-chat-turn assistant-chat-turn-assistant">
                <div className="assistant-chat-message-card">
                  <div className="assistant-chat-card-header">
                    <span className="assistant-chat-role-label">{scenario.npc.name.toUpperCase()}</span>
                    {onReplayAudio ? (
                      <button
                        type="button"
                        className="scenario-replay-audio"
                        onClick={() => onReplayAudio(turn.npcLine!)}
                        aria-label={`${SCENARIO_COPY.replayAudio}: ${turn.npcLine.ja}`}
                        title={SCENARIO_COPY.replayAudio}
                      >
                        <Volume2 size={12} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <p className="assistant-chat-message-text">{turn.npcLine.ja}</p>
                  <p className="scenario-npc-reading">{turn.npcLine.reading}</p>
                  <p className="scenario-npc-translation">{turn.npcLine.en}</p>
                  {turn.assistedAnswer ? (
                    <p className="scenario-turn-assist">
                      <span className="scenario-turn-assist-label">{SCENARIO_COPY.assistLabel}</span>{' '}
                      {turn.assistedAnswer}
                      {turn.assistedAnswerReading && turn.assistedAnswerReading !== turn.assistedAnswer
                        ? <span className="scenario-turn-romaji"> {turn.assistedAnswerReading}</span> : null}
                      {turn.assistedAnswerRomaji ? <span className="scenario-turn-romaji"> ({turn.assistedAnswerRomaji})</span> : null}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          }
          return (
            <div key={turn.turnIndex} className="assistant-chat-turn assistant-chat-turn-user">
              <div className="assistant-chat-message-card">
                <div className="assistant-chat-card-header">
                  <span className="assistant-chat-role-label">YOU</span>
                  {turn.outcome ? <span className={`scenario-outcome-badge scenario-outcome-${turn.outcome}`}>{turn.outcome}</span> : null}
                </div>
                <p className="assistant-chat-message-text">{turn.learnerInput}</p>
                {turn.correction ? (
                  <p className="scenario-turn-correction">
                    {SCENARIO_COPY.correctionLabel}: {turn.correction}
                    {turn.correctionReading && turn.correctionReading !== turn.correction
                      ? <span className="scenario-turn-romaji"> {turn.correctionReading}</span> : null}
                    {turn.correctionRomaji ? <span className="scenario-turn-romaji"> ({turn.correctionRomaji})</span> : null}
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {evaluatingResponse ? (
        <p className="scenario-evaluating" role="status">{SCENARIO_COPY.evaluatingResponse}</p>
      ) : null}
      {npcSpeaking ? <p className="scenario-npc-speaking" role="status">Playing audio…</p> : null}

      {confirmAction ? (
        <div className="scenario-confirm-banner" role="alertdialog" aria-label={confirmAction === 'abandon' ? 'Confirm leaving the scenario' : 'Confirm restarting the scenario'}>
          <p>{confirmAction === 'abandon' ? SCENARIO_COPY.leaveConfirm : SCENARIO_COPY.restartConfirm}</p>
          <div className="scenario-confirm-actions">
            <button type="button" className="scenario-confirm-yes" onClick={onConfirmPendingAction}>
              {SCENARIO_COPY.confirmYes}
            </button>
            <button type="button" className="scenario-confirm-no" onClick={onCancelPendingAction}>
              {SCENARIO_COPY.confirmNo}
            </button>
          </div>
        </div>
      ) : null}

      <LearnerInputPanel
        value={learnerInputValue}
        onChange={onLearnerInputChange}
        onSubmit={onSubmit}
        disabled={inputDisabled}
        speechInputAvailable={speechInputAvailable}
        micState={micState}
        micErrorReason={micErrorReason}
        micElapsedMs={micElapsedMs}
        micMaxDurationMs={micMaxDurationMs}
        sttError={sttError}
        heardTranscript={heardTranscript}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        onRequestRestart={onRequestRestart}
        onRequestAbandon={onRequestAbandon}
        romajiConversionEnabled={romajiConversionEnabled}
        hintSlot={onRevealHint ? (
          <ScenarioHintPanel
            hints={hints}
            revealedLevel={typeof currentHintLevel === 'number' ? currentHintLevel : null}
            onRevealHint={onRevealHint}
            disabled={inputDisabled}
            resetKey={session.currentNodeId}
          />
        ) : undefined}
      />
    </div>
  )
}
