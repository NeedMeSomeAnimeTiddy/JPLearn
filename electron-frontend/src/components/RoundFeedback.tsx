import type { PlayableMinigame, RoundDictionaryNote } from '../types'
import { FEEDBACK_COPY } from '../constants'
import { Calendar, Timer } from 'lucide-react'
import { TypeAnimation } from 'react-type-animation'

interface RoundFeedbackProps {
  feedback: string
  tone: 'success' | 'error' | null
  comboBonus: number
  milestoneStreak: number | null
  answer: string | null
  answerLabel: string
  livesEnabled: boolean
  mode: PlayableMinigame
  actionLabel?: string
  actionTitle?: string
  onAction?: () => void
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
}

const SENTENCE_MODES = ['sentence_assembly', 'particle_cloze', 'vibe_check', 'imposter'] as const
const SPEECH_MODES = ['speech_recall'] as const
const CHOICE_MODES = ['meaning_match', 'character_match'] as const

function speedClass(ms: number, mode: PlayableMinigame): string {
  const fastThreshold = (SENTENCE_MODES as readonly string[]).includes(mode) ? 6000
    : (SPEECH_MODES as readonly string[]).includes(mode) ? 4000
    : (CHOICE_MODES as readonly string[]).includes(mode) ? 1500
    : 2500

  const normalThreshold = (SENTENCE_MODES as readonly string[]).includes(mode) ? 15000
    : (SPEECH_MODES as readonly string[]).includes(mode) ? 10000
    : (CHOICE_MODES as readonly string[]).includes(mode) ? 3500
    : 6000

  if (ms < fastThreshold) return 'round-feedback-stat--fast'
  if (ms < normalThreshold) return 'round-feedback-stat--normal'
  return 'round-feedback-stat--slow'
}

export function RoundFeedback({
  feedback,
  tone,
  comboBonus,
  milestoneStreak,
  answer,
  answerLabel,
  livesEnabled,
  mode,
  actionLabel,
  actionTitle,
  onAction,
  responseMs,
  srsResult,
  exampleSentence,
  cardCharacter,
  cardMeaning,
  cardRomaji,
  dictionaryNote,
}: RoundFeedbackProps) {
  return (
    <div
      className={`round-feedback ${
        tone === 'success'
          ? 'round-feedback-success'
          : tone === 'error'
            ? 'round-feedback-error'
            : ''
      }`}
    >
      <p className="round-feedback-message">
        {feedback}
      </p>
      <div className="round-feedback-meta">
        {comboBonus > 0 ? <span className="round-feedback-combo">+{comboBonus} combo</span> : null}
        {milestoneStreak ? <span className="round-feedback-milestone">Streak ×{milestoneStreak}</span> : null}
        {tone === 'error' && livesEnabled ? <span className="round-feedback-life">−1 life</span> : null}
      </div>
      {answer ? (
        <div className="round-feedback-answer">
          <p className="round-feedback-answer-label">{answerLabel}</p>
          <p className="round-feedback-answer-value">
            <TypeAnimation key={`ans-${answer}`} sequence={[answer]} speed={4} cursor={false} style={{ display: 'inline' }} />
          </p>
        </div>
      ) : null}
      {responseMs ? (
        <div className="round-feedback-stats">
          <span className={`round-feedback-stat ${speedClass(responseMs, mode)}`} title="Answer speed">
            <Timer size={14} aria-hidden="true" />
            {FEEDBACK_COPY.ANSWERED_IN(responseMs)}
          </span>
          {srsResult ? (
            <span className="round-feedback-stat" title="Next review">
              <Calendar size={14} aria-hidden="true" />
              {FEEDBACK_COPY.NEXT_REVIEW_IN(srsResult.interval)}
            </span>
          ) : null}
        </div>
      ) : null}
      {cardCharacter || cardMeaning ? (
        <div className="round-feedback-detail">
          <span className="round-feedback-detail-label">Card</span>
          <span className="round-feedback-detail-value">
            {cardCharacter}{cardRomaji ? ` (${cardRomaji})` : ''}{cardCharacter && cardMeaning ? ' — ' : ''}{cardMeaning}
          </span>
        </div>
      ) : null}
      {exampleSentence ? (
        <div className="round-feedback-example">
          <span className="round-feedback-detail-label">Example</span>
          <span className="round-feedback-example-jp">{exampleSentence.jp}</span>
          {exampleSentence.romaji ? (
            <span className="round-feedback-example-romaji">{exampleSentence.romaji}</span>
          ) : null}
          <span className="round-feedback-example-en">{exampleSentence.en}</span>
        </div>
      ) : null}
      {dictionaryNote ? (
        <div className="round-feedback-dictionary">
          <span className="round-feedback-detail-label">{dictionaryNote.title}</span>
          <p className="round-feedback-dictionary-copy">{dictionaryNote.copy}</p>
        </div>
      ) : null}
      {mode === 'imposter' ? (
        <p className="round-feedback-note">Story progress updates chapter access based on stage transitions.</p>
      ) : null}
      {onAction ? (
        <div className="round-feedback-advance" aria-live="polite">
          <div className="round-feedback-advance-copy">
            <button
              type="button"
              className="round-feedback-skip"
              onClick={onAction}
              aria-label={actionTitle ?? actionLabel ?? 'Continue now'}
              title={actionTitle ?? actionLabel ?? 'Continue now'}
            >
              {actionLabel ?? 'Continue now'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
