import type { RefObject } from 'react'
import { CornerDownLeft } from 'lucide-react'

interface TypedAnswerPanelProps {
  answerInputRef: RefObject<HTMLInputElement | null>
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export function TypedAnswerPanel({
  answerInputRef,
  value,
  placeholder,
  disabled,
  onChange,
  onSubmit,
}: TypedAnswerPanelProps) {
  return (
    <form
      className="game-input-row minigame-answer-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <input
        ref={answerInputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled} aria-label="Submit answer">
        <CornerDownLeft aria-hidden="true" size={18} strokeWidth={2.2} />
      </button>
    </form>
  )
}