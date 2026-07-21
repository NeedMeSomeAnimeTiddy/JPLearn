import { ArrowLeft } from 'lucide-react'
import { SCENARIO_COPY, SCENARIO_LEVEL_DESCRIPTIONS, SCENARIO_LEVEL_LABELS } from '../constants'
import type { LearnerLevel, ScenarioDefinition } from '../types'

const LEVELS: LearnerLevel[] = ['beginner', 'intermediate']

interface ScenarioIntroProps {
  scenario: ScenarioDefinition
  selectedLevel: LearnerLevel | null
  onSelectLevel: (level: LearnerLevel) => void
  onStart: () => void
  onBack: () => void
  /** Whether an installed local model may be consulted for responses the
   * deterministic evaluator can't classify. */
  aiEvaluationActive?: boolean
}

export function ScenarioIntro({
  scenario,
  selectedLevel,
  onSelectLevel,
  onStart,
  onBack,
  aiEvaluationActive = false,
}: ScenarioIntroProps) {
  return (
    <div className="scenario-activity scenario-intro cassette-panel-body">
      <button type="button" className="scenario-intro-back" onClick={onBack} aria-label="Back to scenario list">
        <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>All scenarios</span>
      </button>

      <h3 className="scenario-intro-title">{scenario.title}</h3>
      <p className="scenario-intro-title-ja">{scenario.titleJa}</p>
      <p className="scenario-intro-description">{scenario.description}</p>

      <section aria-labelledby="scenario-intro-objectives-heading">
        <h4 id="scenario-intro-objectives-heading" className="scenario-intro-heading">Objectives</h4>
        <ul className="scenario-intro-objectives">
          {scenario.objectives.map((objective) => (
            <li key={objective.id}>
              {objective.label}
              {objective.required ? null : <span className="scenario-intro-optional-tag"> (optional)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="scenario-intro-level-heading">
        <h4 id="scenario-intro-level-heading" className="scenario-intro-heading">Learner level</h4>
        <div className="scenario-intro-level-options" role="group" aria-label="Choose a learner level">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`scenario-intro-level-option ${selectedLevel === level ? 'is-active' : ''}`}
              onClick={() => onSelectLevel(level)}
              aria-pressed={selectedLevel === level}
              aria-label={SCENARIO_LEVEL_LABELS[level]}
              aria-describedby={`scenario-intro-level-description-${level}`}
            >
              <span className="scenario-intro-level-label" aria-hidden="true">{SCENARIO_LEVEL_LABELS[level]}</span>
              <span className="scenario-intro-level-description" id={`scenario-intro-level-description-${level}`}>
                {SCENARIO_LEVEL_DESCRIPTIONS[level]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <p className="scenario-intro-evaluation-mode" role="note">
        {aiEvaluationActive ? SCENARIO_COPY.evaluationAiMode : SCENARIO_COPY.evaluationDeterministicMode}
      </p>
      <p className="scenario-intro-privacy" role="note">{SCENARIO_COPY.privacyDisclosure}</p>

      <button
        type="button"
        className="scenario-intro-start"
        onClick={onStart}
        disabled={!selectedLevel}
      >
        Start scenario
      </button>
    </div>
  )
}
