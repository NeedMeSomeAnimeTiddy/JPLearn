import type { UseScenarioTutorReturn } from '../useScenarioTutor'
import { ScenarioSelect } from './ScenarioSelect'
import { ScenarioIntro } from './ScenarioIntro'
import { ScenarioPlayer } from './ScenarioPlayer'
import { ScenarioSummaryPanel } from './ScenarioSummaryPanel'
import { SrsDraftReviewPanel } from './SrsDraftReviewPanel'
import { ScenarioHistoryPanel } from './ScenarioHistoryPanel'
import '../scenario-tutor.css'

interface ScenarioActivityProps {
  scenarioTutor: UseScenarioTutorReturn
  onExitToTutorMenu: () => void
  romajiConversionEnabled: boolean
}

/**
 * Scenario-side screen router (select → intro → session → summary →
 * srs-review, plus history reachable from select), rendered as the Tutor
 * popup body for mode 'scenarios'. All state and business logic live in
 * useScenarioTutor / engine.ts / evaluation.ts — this component only
 * selects which screen to render.
 */
export function ScenarioActivity({ scenarioTutor, onExitToTutorMenu, romajiConversionEnabled }: ScenarioActivityProps) {
  const {
    scenarios,
    screen,
    selectedScenario,
    selectedLevel,
    session,
    summary,
    learnerInputValue,
    confirmAction,
    error,
    persistenceNote,
    selectScenario,
    selectLevel,
    startScenario,
    setLearnerInputValue,
    submitResponse,
    requestAbandon,
    requestRestart,
    confirmPendingAction,
    cancelPendingAction,
    replayScenario,
    returnToSelect,
    srsDrafts,
    srsReviewError,
    goToSrsReview,
    editSrsDraft,
    acceptSrsDraft,
    dismissSrsDraft,
    skipAllSrsDrafts,
    historyEntries,
    historyLoading,
    historyError,
    openHistory,
    closeHistory,
    deleteHistoryEntry,
    clearHistory,
    npcAudioAvailable,
    npcSpeaking,
    replayNpcLine,
    speechInputAvailable,
    micState,
    micErrorReason,
    micElapsedMs,
    micMaxDurationMs,
    sttError,
    heardTranscript,
    startRecording,
    stopRecording,
    aiEvaluationActive,
    evaluatingResponse,
    currentHints,
    revealHint,
  } = scenarioTutor

  const exitToTutorMenu = () => {
    returnToSelect()
    onExitToTutorMenu()
  }

  if (error) {
    return (
      <div className="scenario-activity cassette-panel-body">
        <p className="assistant-chat-error" role="alert">{error}</p>
      </div>
    )
  }

  if (screen === 'history') {
    return (
      <ScenarioHistoryPanel
        entries={historyEntries}
        loading={historyLoading}
        error={historyError}
        onDelete={deleteHistoryEntry}
        onClearAll={clearHistory}
        onBack={closeHistory}
      />
    )
  }

  if (screen === 'select' || !selectedScenario) {
    return <ScenarioSelect scenarios={scenarios} onSelect={selectScenario} onOpenHistory={openHistory} />
  }

  if (screen === 'intro') {
    return (
      <ScenarioIntro
        scenario={selectedScenario}
        selectedLevel={selectedLevel}
        onSelectLevel={selectLevel}
        onStart={startScenario}
        onBack={returnToSelect}
        aiEvaluationActive={aiEvaluationActive}
      />
    )
  }

  if (screen === 'session' && session) {
    return (
      <ScenarioPlayer
        scenario={selectedScenario}
        session={session}
        learnerInputValue={learnerInputValue}
        onLearnerInputChange={setLearnerInputValue}
        onSubmit={submitResponse}
        confirmAction={confirmAction}
        onRequestAbandon={requestAbandon}
        onRequestRestart={requestRestart}
        onConfirmPendingAction={confirmPendingAction}
        onCancelPendingAction={cancelPendingAction}
        onReplayAudio={npcAudioAvailable ? replayNpcLine : undefined}
        npcSpeaking={npcSpeaking}
        evaluatingResponse={evaluatingResponse}
        speechInputAvailable={speechInputAvailable}
        micState={micState}
        micErrorReason={micErrorReason}
        micElapsedMs={micElapsedMs}
        micMaxDurationMs={micMaxDurationMs}
        sttError={sttError}
        heardTranscript={heardTranscript}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        hints={currentHints}
        onRevealHint={revealHint}
        romajiConversionEnabled={romajiConversionEnabled}
      />
    )
  }

  if (screen === 'srs-review' && session && summary) {
    return (
      <SrsDraftReviewPanel
        drafts={srsDrafts}
        error={srsReviewError}
        onEdit={editSrsDraft}
        onAccept={acceptSrsDraft}
        onDismiss={dismissSrsDraft}
        onSkipAll={skipAllSrsDrafts}
        onReplay={replayScenario}
        onReturnToTutorMenu={exitToTutorMenu}
      />
    )
  }

  if (screen === 'summary' && session && summary) {
    return (
      <ScenarioSummaryPanel
        scenario={selectedScenario}
        session={session}
        summary={summary}
        persistenceNote={persistenceNote}
        pendingSrsDraftCount={srsDrafts.filter((draft) => draft.status === 'pending').length}
        onGoToSrsReview={goToSrsReview}
        onReplay={replayScenario}
        onReturnToTutorMenu={exitToTutorMenu}
      />
    )
  }

  return (
    <div className="scenario-activity cassette-panel-body">
      <p className="assistant-chat-empty">Loading…</p>
    </div>
  )
}
