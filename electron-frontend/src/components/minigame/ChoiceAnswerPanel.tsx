import type { RoundOption } from '../../types'

interface ChoiceAnswerPanelProps {
  options: RoundOption[]
  disabled: boolean
  characterMode: boolean
  showKeyboardPrompts: boolean
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (label: string) => void
}

export function ChoiceAnswerPanel({
  options,
  disabled,
  characterMode,
  showKeyboardPrompts,
  activeIndex,
  onActiveIndexChange,
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
          data-active={index === activeIndex}
          onFocus={() => onActiveIndexChange(index)}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => {
            onActiveIndexChange(index)
            onSelect(option.label)
          }}
        >
          {showKeyboardPrompts ? <span className="option-key-hint" aria-hidden="true">[{index + 1}]</span> : null}
          {option.label}
        </button>
      ))}
    </div>
  )
}