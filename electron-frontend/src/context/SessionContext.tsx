/* eslint-disable react-refresh/only-export-components -- intentional: context file exports both provider and hook */
import { createContext, useContext } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  FeedbackTone,
  MinigameKey,
  RoundState,
  SessionRunReport,
} from '../types'

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
  isRoundResolving: boolean

  // Session metrics
  sessionScore: number
  sessionRounds: number
  sessionPoints: number
  sessionTargetItems: number
  blockSessionComplete: boolean

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
  startSession: (game?: MinigameKey) => void
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
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (ctx === null) {
    throw new Error('useSession must be used inside <SessionProvider>')
  }
  return ctx
}
