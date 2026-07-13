import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Play, SkipForward } from 'lucide-react'
import type { PomodoroDisplay } from '../types'

interface BreakOverlayProps {
  display: PomodoroDisplay | null
  onSkip: () => void
  onStartNext: () => void
}

export function BreakOverlay({ display, onSkip, onStartNext }: BreakOverlayProps) {
  useEffect(() => {
    if (!display || display.phase === 'work') return

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onSkip()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [display, onSkip])

  if (!display || display.phase === 'work' || display.phase === 'idle') return null

  const isLong = display.phase === 'long-break'

  const content = (
    <AnimatePresence>
      <motion.div
        className="pomodoro-break-overlay"
        role="dialog"
        aria-label={isLong ? 'Long break' : 'Break time'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="pomodoro-break-card">
          <h2 className="pomodoro-break-title">
            {isLong ? 'Long Break' : 'Break Time'}
          </h2>
          <p className="pomodoro-break-timer">{display.formatted}</p>
          <p className="pomodoro-break-hint">
            Step away for a moment. Look at something 20 feet away for 20 seconds.
          </p>
          <div className="pomodoro-break-actions">
            <button
              type="button"
              className="hub-chip-button"
              onClick={onStartNext}
            >
              <Play size={13} strokeWidth={2.2} aria-hidden="true" />
              Start Next Session
            </button>
            <button
              type="button"
              className="hub-chip-button pomodoro-break-skip"
              onClick={onSkip}
            >
              <SkipForward size={13} strokeWidth={2.2} aria-hidden="true" />
              Skip Break
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
