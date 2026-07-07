import type { ReactNode } from 'react'
import { CONFIDENCE_LEVEL_LABELS, CONFIDENCE_SCORES } from '../../constants'
import { RoundFeedback } from '../RoundFeedback'
import type { PlayableMinigame, RoundDictionaryNote } from '../../types'

interface MinigameResponsePanelProps {
  isRoundResolving: boolean
  mode: PlayableMinigame
  title: string
  copy: string
  confidenceCaptureEnabled: boolean
  roundConfidenceScore: number
  onSetRoundConfidence: (score: number) => void
  feedback: string | null
  feedbackTone: 'success' | 'error' | null
  feedbackComboBonus: number
  feedbackMilestoneStreak: number | null
  feedbackAnswer: string | null
  feedbackAnswerLabel: string
  livesEnabled: boolean
  showKeyboardPrompts: boolean
  onSkipFeedback: () => void
  responseMs: number | null
  srsResult: {
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
  } | null
  exampleSentence: {
    jp: string
    en: string
    romaji: string
  } | null
  cardCharacter: string
  cardMeaning: string
  cardRomaji: string
  dictionaryNote: RoundDictionaryNote | null
  children: ReactNode
}

export function MinigameResponsePanel({
  isRoundResolving,
  mode,
  title,
  copy,
  confidenceCaptureEnabled,
  roundConfidenceScore,
  onSetRoundConfidence,
  feedback,
  feedbackTone,
  feedbackComboBonus,
  feedbackMilestoneStreak,
  feedbackAnswer,
  feedbackAnswerLabel,
  livesEnabled,
  showKeyboardPrompts,
  onSkipFeedback,
  responseMs,
  srsResult,
  exampleSentence,
  cardCharacter,
  cardMeaning,
  cardRomaji,
  dictionaryNote,
  children,
}: MinigameResponsePanelProps) {
  const isChoiceMode =
    mode === 'meaning_match' ||
    mode === 'character_match' ||
    mode === 'particle_cloze' ||
    mode === 'vibe_check' ||
    mode === 'imposter' ||
    mode === 'listening_audio_first' ||
    mode === 'listening_prompt_first'

  const shortcutHints = showKeyboardPrompts
    ? [
      ...(isChoiceMode ? ['1–4: pick', 'Enter ↵: submit'] : ['Enter ↵: submit']),
      'Space: hint',
    ]
    : []

  return (
    <div className="minigame-response-column">
      {feedback ? (
        <div className="minigame-feedback-wrap">
          <RoundFeedback
            feedback={feedback}
            tone={feedbackTone}
            comboBonus={feedbackComboBonus}
            milestoneStreak={feedbackMilestoneStreak}
            answer={feedbackAnswer}
            answerLabel={feedbackAnswerLabel}
            livesEnabled={livesEnabled}
            mode={mode}
            onAction={onSkipFeedback}
            actionLabel={showKeyboardPrompts ? 'Next now ↵' : 'Next now'}
            actionTitle={showKeyboardPrompts ? 'Continue immediately (Enter)' : 'Continue immediately'}
            responseMs={responseMs}
            srsResult={srsResult}
            exampleSentence={exampleSentence}
            cardCharacter={cardCharacter}
            cardMeaning={cardMeaning}
            cardRomaji={cardRomaji}
            dictionaryNote={dictionaryNote}
          />
        </div>
      ) : (
        <section className="minigame-response-card" aria-label="Answer challenge">
          <div className="minigame-response-head">
            <div className="minigame-response-head-copy">
              <span className="minigame-response-kicker">Answer</span>
              <strong className="minigame-response-title">{title}</strong>
            </div>
            <span className="minigame-response-status">{isRoundResolving ? 'Resolving…' : 'Your move'}</span>
          </div>

          <p className="minigame-response-copy">{copy}</p>

          {children}

          {shortcutHints.length > 0 ? (
            <div className="minigame-shortcut-row" aria-label="Keyboard shortcuts">
              {shortcutHints.map((hint) => (
                <span key={hint} className="minigame-shortcut-chip">{hint}</span>
              ))}
            </div>
          ) : null}

          {confidenceCaptureEnabled ? (
            <section
              className="confidence-controls confidence-controls-round"
              aria-label="Confidence score controls"
            >
              <p className="interleave-controls-title">Confidence for this answer</p>
              <div
                className="confidence-chip-row confidence-chip-row-round"
                role="group"
                aria-label="Select confidence score for this answer"
              >
                {CONFIDENCE_SCORES.map((score) => (
                  <button
                    key={`round-confidence-${score}`}
                    type="button"
                    className={`confidence-chip confidence-chip-round ${
                      roundConfidenceScore === score ? 'is-active' : ''
                    }`}
                    onClick={() => onSetRoundConfidence(score)}
                    aria-pressed={roundConfidenceScore === score}
                    aria-label={`Confidence ${CONFIDENCE_LEVEL_LABELS[score]}`}
                    title={`Confidence: ${CONFIDENCE_LEVEL_LABELS[score]}`}
                    disabled={isRoundResolving}
                  >
                    <span className="confidence-chip-label">
                      {CONFIDENCE_LEVEL_LABELS[score]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      )}
    </div>
  )
}