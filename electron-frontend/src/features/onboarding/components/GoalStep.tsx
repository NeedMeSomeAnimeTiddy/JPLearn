import { LEARNING_GOALS } from '../constants'

interface GoalStepProps {
  goal: string | undefined
  onChange: (goal: string | undefined) => void
  disabled: boolean
}

export function GoalStep({ goal, onChange, disabled }: GoalStepProps) {
  return (
    <div className="obn-goal-grid" role="radiogroup" aria-label="Learning goal">
      {LEARNING_GOALS.map((g) => (
        <button
          key={g.key}
          type="button"
          className={`obn-goal-card${goal === g.key ? ' is-selected' : ''}`}
          aria-pressed={goal === g.key}
          onClick={() => onChange(goal === g.key ? undefined : g.key)}
          disabled={disabled}
        >
          <span className="obn-goal-emoji" aria-hidden="true">{g.emoji}</span>
          <span className="obn-goal-label">{g.label}</span>
        </button>
      ))}
    </div>
  )
}
