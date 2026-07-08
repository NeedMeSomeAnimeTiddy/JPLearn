import { FAMILIARITY_ITEMS } from '../constants'

interface KnowledgeStepProps {
  checkedItems: Set<string>
  onToggle: (key: string) => void
  disabled: boolean
}

export function KnowledgeStep({ checkedItems, onToggle, disabled }: KnowledgeStepProps) {
  return (
    <div className="obn-section" role="group" aria-label="Prior knowledge checklist">
      <div className="obn-check-list">
        {FAMILIARITY_ITEMS.map((item) => {
          const checked = checkedItems.has(item.key)
          return (
            <button
              key={item.key}
              type="button"
              className={`obn-check-item${checked ? ' is-checked' : ''}`}
              aria-pressed={checked}
              onClick={() => onToggle(item.key)}
              disabled={disabled}
            >
              <span className="obn-check-box" aria-hidden="true" />
              <span className="obn-check-text">
                <span className="obn-check-title">{item.label}</span>
                <span className="obn-check-desc">{item.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
