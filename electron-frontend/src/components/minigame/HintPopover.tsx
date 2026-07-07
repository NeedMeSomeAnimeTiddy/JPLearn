import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Lightbulb, LightbulbOff } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { TypeAnimation } from 'react-type-animation'
import type { RoundState } from '../../types'

interface HintPopoverProps {
  roundState: RoundState
  hintStep: 0 | 1 | 2
  hintRevealCount: number
  showKeyboardPrompts: boolean
  formattedAnswer: string
  open: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onRevealHint: () => void
  onRevealMoreHint: () => void
}

const POPOVER_WIDTH = 320
const POPOVER_GAP = 8

export function HintPopover({
  roundState,
  hintStep,
  hintRevealCount,
  showKeyboardPrompts,
  formattedAnswer,
  open,
  triggerRef,
  onClose,
  onRevealHint,
  onRevealMoreHint,
}: HintPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const isAnswering = hintStep < 2
  const hasClue = Boolean(roundState.hintText || roundState.dictionaryNote)

  const alwaysShowHint =
    roundState.mode !== 'romaji_sprint' &&
    roundState.mode !== 'typed_recall' &&
    roundState.mode !== 'speech_recall' &&
    roundState.mode !== 'listening_audio_first' &&
    roundState.mode !== 'dictation'

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null)
      return
    }

    function calculate() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const popover = popoverRef.current
      const popoverHeight = popover ? popover.getBoundingClientRect().height : 200

      let top = rect.bottom + POPOVER_GAP
      let left = Math.max(8, rect.left - POPOVER_WIDTH + rect.width)

      if (top + popoverHeight > window.innerHeight - 16) {
        top = rect.top - popoverHeight - POPOVER_GAP
      }

      if (left + POPOVER_WIDTH > window.innerWidth - 8) {
        left = window.innerWidth - POPOVER_WIDTH - 8
      }

      setPosition({ top, left })
    }

    calculate()
    window.addEventListener('resize', calculate, { passive: true })
    window.addEventListener('scroll', calculate, { passive: true, capture: true })

    return () => {
      window.removeEventListener('resize', calculate)
      window.removeEventListener('scroll', calculate, { capture: true })
    }
  }, [open, triggerRef])

  useEffect(() => {
    if (!open) return

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    function handleClickOutside(event: globalThis.MouseEvent) {
      const target = event.target as HTMLElement
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside, true)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [open, onClose, triggerRef])

  function handleReveal(event: MouseEvent) {
    event.stopPropagation()
    if (hintStep === 0) onRevealHint()
    else if (hintStep === 1) onRevealMoreHint()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const clueText = roundState.hintText ?? ''
  const note = roundState.dictionaryNote
  const glosses = note ? [note.primaryGloss, ...note.secondaryGlosses] : []

  const content = (
    <AnimatePresence>
      {open && position ? (
        <motion.div
          ref={popoverRef}
          className="minigame-hint-popover"
          role="dialog"
          aria-label="Hint popover"
          initial={{ opacity: 0, y: 4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: POPOVER_WIDTH,
            zIndex: 1000,
          }}
          onKeyDown={handleKeyDown}
        >
          <div className="minigame-hint-popover-arrow" />
          <div className="minigame-hint-popover-body">
            <div className="minigame-hint-popover-head">
              <Lightbulb size={14} aria-hidden="true" className="minigame-hint-popover-icon" />
              <span className="minigame-hint-popover-title">Hint</span>
              <span className="minigame-hint-popover-stage">
                Stage {hintStep}/2 &middot; {hintRevealCount}x
              </span>
              <button
                type="button"
                className="minigame-hint-popover-dismiss"
                onClick={onClose}
                aria-label="Close hint"
                tabIndex={0}
              >
                <ChevronDown size={14} strokeWidth={2.2} />
              </button>
            </div>

            {alwaysShowHint ? (
              <div className="minigame-hint-popover-content">
                <div className="minigame-hint-popover-stage-body">
                  {roundState.hintText ? (
                    <p className="minigame-hint-popover-text">
                      <TypeAnimation
                        key={`popover-hint-${roundState.hintText}`}
                        sequence={[roundState.hintText]}
                        speed={12}
                        cursor={false}
                        style={{ display: 'inline' }}
                      />
                    </p>
                  ) : null}
                  {note ? (
                    <div className="minigame-hint-dict-inline">
                      <span className="minigame-hint-dict-chip" lang="ja">{note.character}</span>
                      <span className="minigame-hint-dict-chip minigame-hint-dict-reading">{note.reading}</span>
                      {glosses.slice(0, 2).map((g, i) => (
                        <span key={g} className={`minigame-hint-dict-gloss ${i === 0 ? 'is-primary' : ''}`}>
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : hintStep === 0 ? (
              <div className="minigame-hint-popover-content">
                <p className="minigame-hint-popover-text">Need a hint?</p>
                {hasClue ? (
                  <button type="button" className="minigame-hint-popover-reveal" onClick={handleReveal}>
                    {showKeyboardPrompts ? 'Reveal clue (Space)' : 'Reveal clue'}
                  </button>
                ) : (
                  <p className="minigame-hint-popover-empty">No clues available for this round.</p>
                )}
              </div>
            ) : hintStep === 1 ? (
              <div className="minigame-hint-popover-content">
                <div className="minigame-hint-popover-stage-body">
                  {clueText ? (
                    <p className="minigame-hint-popover-text">
                      <TypeAnimation
                        key={`popover-clue-${clueText}`}
                        sequence={[clueText]}
                        speed={12}
                        cursor={false}
                        style={{ display: 'inline' }}
                      />
                    </p>
                  ) : null}
                  {note ? (
                    <div className="minigame-hint-dict-inline">
                      <span className="minigame-hint-dict-chip" lang="ja">{note.character}</span>
                      <span className="minigame-hint-dict-chip minigame-hint-dict-reading">{note.reading}</span>
                      {glosses.slice(0, 2).map((g, i) => (
                        <span key={g} className={`minigame-hint-dict-gloss ${i === 0 ? 'is-primary' : ''}`}>
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button type="button" className="minigame-hint-popover-reveal" onClick={handleReveal}>
                  {showKeyboardPrompts ? 'Reveal answer (Space)' : 'Reveal answer'}
                </button>
              </div>
            ) : (
              <div className="minigame-hint-popover-content">
                <div className="minigame-hint-popover-stage-body">
                  <p className="minigame-hint-popover-answer" lang="ja">
                    <TypeAnimation
                      key={`popover-ans-${formattedAnswer}`}
                      sequence={[formattedAnswer]}
                      speed={12}
                      cursor={false}
                      style={{ display: 'inline' }}
                    />
                  </p>
                  {note ? (
                    <div className="minigame-hint-dict-inline">
                      <span className="minigame-hint-dict-chip" lang="ja">{note.character}</span>
                      <span className="minigame-hint-dict-chip minigame-hint-dict-reading">{note.reading}</span>
                      {glosses.slice(0, 2).map((g, i) => (
                        <span key={g} className={`minigame-hint-dict-gloss ${i === 0 ? 'is-primary' : ''}`}>
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <div className="minigame-hint-popover-footer">
              <LightbulbOff size={11} aria-hidden="true" />
              <span>
                {isAnswering ? `Stage ${hintStep}/2 — ${hintRevealCount} hint${hintRevealCount !== 1 ? 's' : ''} used` : 'Answer revealed'}
              </span>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
