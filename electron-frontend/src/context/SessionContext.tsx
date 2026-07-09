/* eslint-disable react-refresh/only-export-components -- intentional: context file exports both provider and hook */
import { createContext, useContext } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  FeedbackTone,
  MinigameKey,
  RoundState,
  SessionRunReport,
} from '../types'
import type { GameCard } from '../generated/types'

// ── Supporting types ─────────────────────────────────────────────────────────

interface LastSessionSummary {
  goal_met: boolean
  completed_items: number
  target_items: number
  accuracy: number
  reviewed: number
  correct: number
}

interface SessionLengthPreset {
  key: string
  label: string
  items: number
}

export type RoundPerformanceLabel = 'PERFECT' | 'GOOD' | 'SLOW' | 'MISS'

// ── Context shape ─────────────────────────────────────────────────────────────

export interface SessionContextValue {
  // Round state
  sessionActive: boolean
  roundState: RoundState | null
  roundInput: string
  roundFeedback: string | null
  roundFeedbackTone: FeedbackTone
  roundFeedbackAnswer: string | null
  roundFeedbackPoints: number | null
  roundPerformanceLabel: RoundPerformanceLabel | null
  roundResponseMs: number | null
  roundSrsResult: {
    repetitions: number
    interval: number
    next_review: string
    ease_factor: number
  } | null
  roundExampleSentence: {
    jp: string
    en: string
    romaji: string
  } | null
  isRoundResolving: boolean

  // Session metrics
  sessionScore: number
  sessionRounds: number
  sessionPoints: number
  sessionStreak: number
  sessionBestStreak: number
  sessionTargetItems: number
  retryTargetItems: number | null
  blockSessionComplete: boolean

  // Round reward metadata (UI only)
  roundComboBonus: number
  roundMilestoneStreak: number | null

  // Session flow
  sessionRunReport: SessionRunReport | null
  sessionStartPending: boolean
  sessionSummaryLoading: boolean
  sessionGoalError: string | null
  lastSessionSummary: LastSessionSummary | null

  // Lives
  livesEnabled: boolean
  livesRemaining: number

  // Session configuration
  leechFocusEnabled: boolean
  confidenceCaptureEnabled: boolean
  roundConfidenceScore: number
  activeSessionLengthPreset: SessionLengthPreset | null

  // Audio
  voiceBusy: boolean
  voiceUnavailable: boolean

  // DOM ref for input focus
  answerInputRef: RefObject<HTMLInputElement | null>

  // Actions
  startSession: (game?: MinigameKey, customCards?: GameCard[], customTargetItems?: number) => void
  submitAnswer: (answer: string) => void
  continueLastSession: () => void
  skipFeedback: () => void
  setRoundInput: (value: string) => void
  setRoundConfidence: (score: number) => void
  setSessionLength: (items: number) => void
  toggleLives: () => void
  toggleLeechFocus: () => void
  toggleConfidence: () => void
  playAudio: (text: string) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const SessionContext = createContext<SessionContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function SessionProvider({
  value,
  children,
}: {
  value: SessionContextValue
  children: ReactNode
}) {
  return <SessionContext value={value}>{children}</SessionContext>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (ctx === null) {
    throw new Error('useSession must be used inside <SessionProvider>')
  }
  return ctx
}
