import type { PlayableMinigame } from '../types'
import type { AssistantToast } from '../features/tutor'
import type { TypedAnswerState } from './answerAssessment'
import { POINT_COMBO_THRESHOLDS, formatRoundModeLabel } from '../constants'

export const PERFORMANCE_PERFECT_MS = 700

export const PERFORMANCE_GOOD_MS = 2200

export function calculateAwardedPoints(streakAfterCorrect: number): number {
  const comboBonus = POINT_COMBO_THRESHOLDS.reduce(
    (count, threshold) => count + (streakAfterCorrect >= threshold ? 1 : 0),
    0,
  )
  return 1 + comboBonus
}

export function classifyRoundPerformance(isCorrect: boolean, responseMs: number): 'PERFECT' | 'GOOD' | 'SLOW' | 'MISS' {
  if (!isCorrect) return 'MISS'
  if (responseMs <= PERFORMANCE_PERFECT_MS) return 'PERFECT'
  if (responseMs <= PERFORMANCE_GOOD_MS) return 'GOOD'
  return 'SLOW'
}

export function getRoundRecoveryTip(mode: PlayableMinigame): string {
  if (mode === 'romaji_sprint') return 'Take a breath and try the next reading.'
  if (mode === 'meaning_match') return 'You are close. Trust your first clear meaning.'
  if (mode === 'character_match') return 'You are building pattern memory one step at a time.'
  if (mode === 'stroke_order') return 'Nice attempt. Visual memory gets stronger with reps.'
  if (mode === 'handwriting') return 'Nice attempt. Stroke order becomes clearer with each careful repetition.'
  if (mode === 'typed_recall') return 'Great effort. Keep the next answer short and clear.'
  if (mode === 'speech_recall') return 'Great effort. Speak the next answer clearly and confidently.'
  if (mode === 'sentence_assembly') return 'Good try. Keep the chunk order natural and grammatically smooth.'
  if (mode === 'particle_cloze') return 'Good try. Follow the sentence flow and particle role.'
  if (mode === 'vibe_check') return 'Good try. Read the sentence ending and tone cues before deciding register.'
  if (mode === 'imposter') return 'Good attempt. Scan for the token that breaks grammar flow.'
  if (mode === 'listening_audio_first') return 'Keep listening. Audio recognition builds over time.'
  if (mode === 'dictation') return 'Listen carefully and type the romaji for what you hear.'
  if (mode === 'kanji_compound_builder') return 'Good try. Think about what each kanji contributes to the meaning.'
  if (mode === 'context_cloze') return 'Good try. Use the surrounding sentence context to infer the missing word.'
  return 'Good attempt. Keep the next answer short and clear.'
}

export function buildRoundCoachToast(
  id: number,
  payload: {
    isCorrect: boolean
    mode: PlayableMinigame
    nextStreak: number
    answer: string
    completedRoundsAfterAnswer: number
    targetRounds: number
    typedAssessment: TypedAnswerState | null
  },
): AssistantToast | null {
  if (!payload.isCorrect) {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_recovery',
      title: 'You are still doing great',
      body: getRoundRecoveryTip(payload.mode),
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Keep going',
    }
  }

  if (payload.mode === 'typed_recall' && payload.typedAssessment === 'near_miss') {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_near_miss',
      title: 'Nice save',
      body: 'That was close and you handled it well.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Got it',
    }
  }

  if (payload.mode === 'speech_recall' && payload.typedAssessment === 'near_miss') {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_near_miss',
      title: 'Nice save',
      body: 'Close call on the transcript, but that counts.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Got it',
    }
  }

  if (payload.nextStreak === 3 || payload.nextStreak === 6 || payload.nextStreak === 9) {
    return {
      id,
      priority: 'celebration',
      eventType: 'round_feedback',
      messageKey: 'coach.round_streak',
      title: `Streak x${payload.nextStreak}`,
      body: `Lovely rhythm. ${formatRoundModeLabel(payload.mode)} is clicking for you.`,
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Nice',
    }
  }

  if (payload.completedRoundsAfterAnswer === payload.targetRounds - 1) {
    return {
      id,
      priority: 'coaching',
      eventType: 'round_feedback',
      messageKey: 'coach.round_final_push',
      title: 'Almost there',
      body: 'One more card. You have got this.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Finish run',
    }
  }

  if (payload.nextStreak > 0 && payload.nextStreak % 2 === 0) {
    return {
      id,
      priority: 'info',
      eventType: 'round_feedback',
      messageKey: 'coach.round_encouragement',
      title: 'Nice one',
      body: 'Clean answer. Keep this gentle pace.',
      targetMode: null,
      focusArea: null,
      actionType: null,
      actionLabel: 'Yay',
    }
  }

  return null
}
