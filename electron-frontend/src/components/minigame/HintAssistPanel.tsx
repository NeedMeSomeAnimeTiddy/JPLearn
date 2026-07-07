import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { TypeAnimation } from 'react-type-animation'
import { DictionaryNoteCard } from './DictionaryNoteCard'
import type { RoundState } from '../../types'

interface HintAssistPanelProps {
  roundState: RoundState
  isRoundResolving: boolean
  hintStep: 0 | 1 | 2 | 3
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

  const hintSteps = [
    {
      key: 'prompt',
      label: 'Prompt cue',
      description: roundState.promptLabel,
      visible: true,
      revealed: hintStep >= 1,
    },
    {
      key: 'study',
      label: 'Study clue',
      description: roundState.hintText ?? 'Dictionary support',
      visible: Boolean(roundState.hintText || roundState.dictionaryNote),
      revealed: hintStep >= 2,
    },
    {
      key: 'answer',
      label: 'Answer reveal',
      description: formattedAnswer,
      visible: true,
      revealed: hintStep >= 3,
    },
  ].filter((step) => step.visible)

  const nextStepCopy =
    hintStep === 0
      ? 'Reveal prompt cue'
      : hintStep === 1 && (roundState.hintText || roundState.dictionaryNote)
        ? 'Reveal study clue'
        : 'Reveal answer'

  const showRevealButton = !alwaysShowHint && !isRoundResolving && hintStep < 3
  const hintStageLabel = hintStep === 0 ? 'Stage 0/3' : `Stage ${hintStep}/3`

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
      aria-label="Round support and hints"
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={togglePanel}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="minigame-assist-head">
        <div className="minigame-assist-head-start">
          <span className="minigame-assist-kicker">Support</span>
          {showRevealButton ? (
            <button
              type="button"
              className="game-hint-toggle minigame-assist-reveal"
              onClick={handleRevealClick}
              aria-label="Show more hint"
            >
              <span className="game-hint-toggle-label">
                {showKeyboardPrompts ? `${nextStepCopy} (Space)` : nextStepCopy}
              </span>
            </button>
          ) : null}
        </div>
        <div className="minigame-assist-head-end">
          <span className="minigame-assist-shortcut">
            {showKeyboardPrompts ? 'Space to reveal hints' : 'Hints available'}
          </span>
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
                        <TypeAnimation key={`step-${step.key}-${step.description}`} sequence={[step.description]} speed={12} cursor={false} style={{ display: 'inline' }} />
                      ) : 'Locked until revealed'}
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