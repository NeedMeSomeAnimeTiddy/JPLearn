import type { RoundOption } from '../../types'

interface ChoiceAnswerPanelProps {
  options: RoundOption[]
  disabled: boolean
  characterMode: boolean
  showKeyboardPrompts: boolean
  onSelect: (label: string) => void
}

export function ChoiceAnswerPanel({
  options,
  disabled,
  characterMode,
  showKeyboardPrompts,
  onSelect,
}: ChoiceAnswerPanelProps) {
  return (
    <div className="option-grid minigame-option-grid">
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          className={`option-button ${characterMode ? 'option-button-character' : ''}`}
          disabled={disabled}
          onClick={() => onSelect(option.label)}
        >
          {showKeyboardPrompts ? <span className="option-key-hint" aria-hidden="true">[{index + 1}]</span> : null}
          {option.label}
        </button>
      ))}
    </div>
  )
}