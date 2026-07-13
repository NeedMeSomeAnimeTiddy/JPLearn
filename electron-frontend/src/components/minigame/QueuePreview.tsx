import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import type { GameCard } from '../../generated/types'

interface QueuePreviewProps {
  upcomingCards: GameCard[]
  open: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

const POPOVER_WIDTH = 300
const POPOVER_GAP = 8
const PREVIEW_COUNT = 5

export function QueuePreview({
  upcomingCards,
  open,
  triggerRef,
  onClose,
}: QueuePreviewProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

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
      const popoverHeight = popover ? popover.getBoundingClientRect().height : 260

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

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const displayedCards = upcomingCards.slice(0, PREVIEW_COUNT)

  const content = (
    <AnimatePresence>
      {open && position ? (
        <motion.div
          ref={popoverRef}
          className="minigame-queue-preview"
          role="dialog"
          aria-label="Upcoming cards queue"
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
          <div className="queue-preview-head">
            <span className="cassette-brand">Up Next</span>
          </div>

          {displayedCards.length > 0 ? (
            <ol className="queue-preview-list">
              {displayedCards.map((card) => (
                <li key={card.id} className="queue-preview-card">
                  <span className="queue-card-character" lang="ja">
                    {card.character}
                  </span>
                  <span className="queue-card-info">
                    <span className="queue-card-reading">{card.romaji}</span>
                    <span className="queue-card-meaning">{card.meaning}</span>
                  </span>
                  {card.is_leech ? (
                    <span className="queue-card-leech" title="Leech item" aria-label="Leech item" />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="queue-preview-empty">
              No remaining cards in queue.
            </p>
          )}

          {upcomingCards.length > PREVIEW_COUNT ? (
            <p className="queue-preview-more">
              +{upcomingCards.length - PREVIEW_COUNT} more in queue
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
