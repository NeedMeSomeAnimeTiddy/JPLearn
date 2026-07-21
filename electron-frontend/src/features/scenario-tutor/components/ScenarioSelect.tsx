import { History } from 'lucide-react'
import type { ScenarioDefinition } from '../types'

interface ScenarioSelectProps {
  scenarios: ScenarioDefinition[]
  onSelect: (scenarioId: string) => void
  onOpenHistory: () => void
}

export function ScenarioSelect({ scenarios, onSelect, onOpenHistory }: ScenarioSelectProps) {
  return (
    <div className="scenario-activity cassette-panel-body">
      <button type="button" className="scenario-history-open" onClick={onOpenHistory}>
        <History size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>Past sessions</span>
      </button>
      {scenarios.length === 0 ? (
        <p className="assistant-chat-empty">No scenarios are available yet.</p>
      ) : (
        <ul className="scenario-select-list" role="list">
          {scenarios.map((scenario) => (
            <li key={scenario.id}>
              <button
                type="button"
                className="scenario-select-item"
                onClick={() => onSelect(scenario.id)}
                aria-label={`${scenario.title} — ${scenario.description}`}
              >
                <span className="scenario-select-item-copy">
                  <span className="scenario-select-item-title">{scenario.title}</span>
                  <span className="scenario-select-item-title-ja">{scenario.titleJa}</span>
                  <span className="scenario-select-item-description">{scenario.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
