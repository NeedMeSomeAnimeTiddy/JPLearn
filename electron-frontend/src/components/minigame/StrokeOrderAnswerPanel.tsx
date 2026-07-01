import type { RefObject } from 'react'
import { getStrokeOrderCandidates, sanitizeRomajiInput } from '../../utils'

type BasicCard = { id: number; character: string; romaji: string }

interface StrokeOrderAnswerPanelProps {
  activeBlockCards: BasicCard[]
  answerInputRef: RefObject<HTMLInputElement | null>
  roundInput: string
  disabled: boolean
  onInputChange: (value: string) => void
  onSelect: (character: string) => void
}

export function StrokeOrderAnswerPanel({
  activeBlockCards,
  answerInputRef,
  roundInput,
  disabled,
  onInputChange,
  onSelect,
}: StrokeOrderAnswerPanelProps) {
  const candidates = getStrokeOrderCandidates(activeBlockCards, roundInput)

  return (
    <div className="stroke-order-picker">
      <div className="game-input-row">
        <input
          ref={answerInputRef}
          value={roundInput}
          onChange={(event) => onInputChange(sanitizeRomajiInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (candidates.length === 1) {
              onSelect(candidates[0].character)
            }
          }}
          placeholder="Type romaji reading"
          autoComplete="off"
          disabled={disabled}
        />
      </div>
      <div className="stroke-order-candidate-wrap" aria-label="Kanji candidates">
        {candidates.length > 0 ? (
          <div className="option-grid">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="option-button option-button-character"
                disabled={disabled}
                onClick={() => onSelect(candidate.character)}
              >
                <span className="option-button-main" lang="ja">
                  {candidate.character}
                </span>
                <span className="option-button-sub">{candidate.romaji}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="status-line">
            Type a romaji reading to show matching kanji.
          </p>
        )}
      </div>
    </div>
  )
}