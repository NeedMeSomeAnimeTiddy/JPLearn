import { DictionaryNoteCard } from './DictionaryNoteCard'
import type { RoundState } from '../../types'

interface HintAssistPanelProps {
  roundState: RoundState
  isRoundResolving: boolean
  hintStep: 0 | 1 | 2 | 3
  showKeyboardPrompts: boolean
  formattedAnswer: string
  onRevealHint: () => void
  onRevealMoreHint: () => void
}

export function HintAssistPanel({
  roundState,
  isRoundResolving,
  hintStep,
  showKeyboardPrompts,
  formattedAnswer,
  onRevealHint,
  onRevealMoreHint,
}: HintAssistPanelProps) {
  const alwaysShowHint =
    roundState.mode !== 'romaji_sprint' &&
    roundState.mode !== 'typed_recall' &&
    roundState.mode !== 'listening_audio_first'

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

  return (
    <aside className="minigame-assist-panel" aria-label="Round support and hints">
      <div className="minigame-assist-head">
        <span className="minigame-assist-kicker">Support</span>
        <span className="minigame-assist-shortcut">
          {showKeyboardPrompts ? 'H to reveal hints' : 'Hints available'}
        </span>
      </div>
      {alwaysShowHint ? (
        <>
          {roundState.hintText ? <p className="game-hint-text">{roundState.hintText}</p> : null}
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
                  {step.revealed ? step.description : 'Locked until revealed'}
                </span>
              </div>
            ))}
          </div>

          {hintStep >= 1 ? (
            <p className="game-hint-text game-hint-type">{roundState.promptLabel}</p>
          ) : null}
          {hintStep >= 2 && roundState.hintText ? (
            <p className="game-hint-text">{roundState.hintText}</p>
          ) : null}
          {hintStep >= 3 ? (
            <p className="game-hint-text game-hint-answer">
              Answer: {formattedAnswer}
            </p>
          ) : null}

          {!isRoundResolving && hintStep < 3 ? (
            <button
              type="button"
              className="game-hint-toggle"
              onClick={hintStep === 0 ? onRevealHint : onRevealMoreHint}
              aria-label="Show more hint"
            >
              <span className="game-hint-toggle-label">
                {showKeyboardPrompts ? `${nextStepCopy} (H)` : nextStepCopy}
              </span>
            </button>
          ) : null}
        </div>
      )}
      {roundState.dictionaryNote ? <DictionaryNoteCard note={roundState.dictionaryNote} /> : null}
    </aside>
  )
}