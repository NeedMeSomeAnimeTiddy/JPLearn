import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { TypeAnimation } from 'react-type-animation'
import { DictionaryNoteCard } from './DictionaryNoteCard'
import type { RoundState } from '../../types'

interface HintAssistPanelProps {
  roundState: RoundState
  isRoundResolving: boolean
  hintStep: 0 | 1 | 2
  hintRevealCount: number
  showKeyboardPrompts: boolean
  formattedAnswer: string
  onRevealHint: () => void
  onRevealMoreHint: () => void
}

export function HintAssistPanel({
  roundState,
  isRoundResolving,
  hintStep,
  hintRevealCount,
  showKeyboardPrompts,
  formattedAnswer,
  onRevealHint,
  onRevealMoreHint,
}: HintAssistPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const alwaysShowHint =
    roundState.mode !== 'romaji_sprint' &&
    roundState.mode !== 'typed_recall' &&
    roundState.mode !== 'speech_recall' &&
    roundState.mode !== 'listening_audio_first' &&
    roundState.mode !== 'dictation'

  const hasClue = Boolean(roundState.hintText || roundState.dictionaryNote)

  const hintSteps = [
    {
      key: 'study',
      label: 'Clue',
      description: roundState.hintText,
      visible: hasClue,
      revealed: hintStep >= 1,
    },
    {
      key: 'answer',
      label: 'Answer',
      description: formattedAnswer,
      visible: true,
      revealed: hintStep >= 2,
    },
  ].filter((step) => step.visible)

  const nextStepLabel =
    hintStep === 0
      ? 'Reveal clue'
      : 'Reveal answer'

  const showRevealButton = !alwaysShowHint && !isRoundResolving && hintStep < 2
  const hintStageLabel = `Stage ${hintStep}/2`

  function togglePanel() {
    setIsExpanded((value) => !value)
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      togglePanel()
    }
  }

  function handleRevealClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (!isExpanded) setIsExpanded(true)
    if (hintStep === 0) onRevealHint()
    else onRevealMoreHint()
  }

  return (
    <aside
      className={`minigame-assist-panel ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label="Round hints"
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={togglePanel}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="minigame-assist-head">
        <div className="minigame-assist-head-start">
          {showRevealButton ? (
            <button
              type="button"
              className="game-hint-toggle minigame-assist-reveal"
              onClick={handleRevealClick}
              aria-label="Show more hint"
            >
              <span className="game-hint-toggle-label">
                {showKeyboardPrompts ? `${nextStepLabel} (Space)` : nextStepLabel}
              </span>
            </button>
          ) : null}
        </div>
        <div className="minigame-assist-head-end">
          <span className="minigame-assist-stage">{hintStageLabel} · Used {hintRevealCount}</span>
          <span className="minigame-assist-toggle" aria-hidden="true">
            <ChevronDown className="inline-button-icon" strokeWidth={2.2} />
          </span>
        </div>
      </div>
      {isExpanded ? (
        <>
          {alwaysShowHint ? (
            <>
              {roundState.hintText ? (
                <p className="game-hint-text">
                  <TypeAnimation key={`hint-${roundState.hintText}`} sequence={[roundState.hintText]} speed={12} cursor={false} style={{ display: 'inline' }} />
                </p>
              ) : null}
            </>
          ) : (
            <div className="game-hint-ladder" aria-live="polite">
              <div className="game-hint-step-list" aria-label="Available hint stages">
                {hintSteps.map((step) => (
                  <div
                    key={step.key}
                    className={`game-hint-step ${step.revealed ? 'is-revealed' : 'is-waiting'}`}
                  >
                    <span className="game-hint-step-label">{step.label}</span>
                    <span className="game-hint-step-copy">
                      {step.revealed ? (
                        <TypeAnimation key={`step-${step.key}-${step.description}`} sequence={[step.description ?? '']} speed={12} cursor={false} style={{ display: 'inline' }} />
                      ) : (
                        'Locked until revealed'
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {roundState.dictionaryNote ? <DictionaryNoteCard note={roundState.dictionaryNote} /> : null}
        </>
      ) : null}
    </aside>
  )
}