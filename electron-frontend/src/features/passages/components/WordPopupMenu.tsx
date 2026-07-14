import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BookOpen, Volume2 } from 'lucide-react'

interface WordPopupMenuProps {
  open: boolean
  x: number
  y: number
  word: string
  onDictionary: () => void
  onPlayAudio: () => void
  onClose: () => void
}

export function WordPopupMenu({
  open,
  x,
  y,
  word,
  onDictionary,
  onPlayAudio,
  onClose,
}: WordPopupMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          className="passage-word-popup"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.12 }}
          role="menu"
          aria-label={`Actions for ${word}`}
        >
          <div className="passage-word-popup-label">{word}</div>
          <button
            type="button"
            className="passage-word-popup-btn"
            role="menuitem"
            onClick={() => { onPlayAudio(); onClose() }}
          >
            <Volume2 size={15} strokeWidth={2} />
            <span>Read aloud</span>
          </button>
          <button
            type="button"
            className="passage-word-popup-btn"
            role="menuitem"
            onClick={() => { onDictionary(); onClose() }}
          >
            <BookOpen size={15} strokeWidth={2} />
            <span>Dictionary</span>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
