import type { RoundOption } from '../types'

interface OptionGridProps {
  options: RoundOption[]
  onSelect: (label: string) => void
  disabled: boolean
  characterMode?: boolean
}

export function OptionGrid({ options, onSelect, disabled, characterMode = false }: OptionGridProps) {
  return (
    <div className="option-grid">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`option-button ${characterMode ? 'option-button-character' : ''}`}
          disabled={disabled}
          onClick={() => onSelect(option.label)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
