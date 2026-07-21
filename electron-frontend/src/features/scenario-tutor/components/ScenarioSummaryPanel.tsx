import { useState } from 'react'
import type { ScenarioDefinition, ScenarioSession, ScenarioSummary } from '../types'

interface ScenarioSummaryPanelProps {
  scenario: ScenarioDefinition
  session: ScenarioSession
  summary: ScenarioSummary
  persistenceNote: string | null
  pendingSrsDraftCount: number
  onGoToSrsReview: () => void
  onReplay: () => void
  onReturnToTutorMenu: () => void
}

export function ScenarioSummaryPanel({
  scenario,
  session,
  summary,
  persistenceNote,
  pendingSrsDraftCount,
  onGoToSrsReview,
  onReplay,
  onReturnToTutorMenu,
}: ScenarioSummaryPanelProps) {
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const isSuccess = session.status === 'success'

  return (
    <div className="scenario-activity scenario-summary cassette-panel-body">
      <h3 className="scenario-summary-heading">
        {isSuccess ? 'Session complete!' : 'You ended the conversation early'}
      </h3>
      <p className="scenario-summary-subheading">{scenario.title}</p>
      {persistenceNote ? <p className="scenario-persistence-note" role="status">{persistenceNote}</p> : null}

      <section aria-labelledby="scenario-summary-objectives-heading">
        <h4 id="scenario-summary-objectives-heading" className="scenario-intro-heading">Objectives</h4>
        <ul className="scenario-summary-objectives">
          {summary.objectives.map((objective) => (
            <li key={objective.id} className={`scenario-summary-objective scenario-summary-objective-${objective.status}`}>
              {objective.label} — {objective.status}
            </li>
          ))}
        </ul>
      </section>

      {summary.corrections.length > 0 ? (
        <section aria-labelledby="scenario-summary-corrections-heading">
          <h4 id="scenario-summary-corrections-heading" className="scenario-intro-heading">Corrections</h4>
          <ul className="scenario-summary-list">
            {summary.corrections.map((correction) => (
              <li key={correction.turnIndex}>{correction.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.vocabularyPractised.length > 0 ? (
        <section aria-labelledby="scenario-summary-vocab-heading">
          <h4 id="scenario-summary-vocab-heading" className="scenario-intro-heading">Vocabulary practised</h4>
          <p className="scenario-summary-tags">{summary.vocabularyPractised.join('、')}</p>
        </section>
      ) : null}

      {summary.grammarPractised.length > 0 ? (
        <section aria-labelledby="scenario-summary-grammar-heading">
          <h4 id="scenario-summary-grammar-heading" className="scenario-intro-heading">Grammar practised</h4>
          <p className="scenario-summary-tags">{summary.grammarPractised.join('、')}</p>
        </section>
      ) : null}

      {summary.recurringMistakes.length > 0 ? (
        <section aria-labelledby="scenario-summary-mistakes-heading">
          <h4 id="scenario-summary-mistakes-heading" className="scenario-intro-heading">Recurring mistakes</h4>
          <ul className="scenario-summary-list">
            {summary.recurringMistakes.map((mistake) => (
              <li key={mistake.id}>{mistake.explanation} ({mistake.count}×)</li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.suggestedNextSteps.length > 0 ? (
        <section aria-labelledby="scenario-summary-next-heading">
          <h4 id="scenario-summary-next-heading" className="scenario-intro-heading">Suggested next steps</h4>
          <ul className="scenario-summary-list">
            {summary.suggestedNextSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        className="scenario-summary-transcript-toggle"
        onClick={() => setTranscriptExpanded((expanded) => !expanded)}
        aria-expanded={transcriptExpanded}
        aria-controls="scenario-summary-transcript"
      >
        {transcriptExpanded ? 'Hide full transcript' : 'Show full transcript'}
      </button>
      {transcriptExpanded ? (
        <ol id="scenario-summary-transcript" className="scenario-summary-transcript">
          {session.transcript.map((turn) => (
            <li key={turn.turnIndex}>
              {turn.npcLine ? `${scenario.npc.name}: ${turn.npcLine.ja}` : `You: ${turn.learnerInput}`}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="scenario-summary-actions">
        {pendingSrsDraftCount > 0 ? (
          <button type="button" className="scenario-summary-srs-review" onClick={onGoToSrsReview}>
            Review {pendingSrsDraftCount} suggested card{pendingSrsDraftCount === 1 ? '' : 's'}
          </button>
        ) : null}
        <button type="button" className="scenario-summary-replay" onClick={onReplay}>
          Replay scenario
        </button>
        <button type="button" className="scenario-summary-exit" onClick={onReturnToTutorMenu}>
          Return to Tutor menu
        </button>
      </div>
    </div>
  )
}
