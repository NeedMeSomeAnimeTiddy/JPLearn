import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lightbulb } from 'lucide-react'
import { SCENARIO_COPY } from '../constants'
import type { ScenarioHint } from '../types'

interface ScenarioHintPanelProps {
  hints: ScenarioHint[]
  /** Index of the deepest step the session currently allows revealing (may
   * already be ahead of 0 after a failed attempt) — null when nothing has
   * been unlocked yet. This only bounds what CAN show; it never opens the
   * popover by itself. */
  revealedLevel: number | null
  onRevealHint: () => void
  disabled?: boolean
  /** Changing this (e.g. the current node id) closes the popover — a hint
   * left open must not carry over into the next turn. */
  resetKey: string
}

const POPOVER_WIDTH = 280
const POPOVER_GAP = 6

/**
 * The scenario equivalent of the minigame hint button: a small icon trigger
 * that opens a floating popover on click. Closed by default and never opened
 * by the engine — asking for a hint is entirely the learner's choice. The
 * node's hint ladder can still unlock further steps automatically after a
 * failed attempt (`revealedLevel`), but nothing is ever shown until this
 * button is pressed.
 */
export function ScenarioHintPanel({ hints, revealedLevel, onRevealHint, disabled = false, resetKey }: ScenarioHintPanelProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setOpen(false) }, [resetKey])

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPosition(null)
      return
    }
    function calculate() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 160
      let top = rect.top - popoverHeight - POPOVER_GAP
      if (top < 8) top = rect.bottom + POPOVER_GAP
      let left = Math.max(8, rect.left)
      if (left + POPOVER_WIDTH > window.innerWidth - 8) left = window.innerWidth - POPOVER_WIDTH - 8
      setPosition({ top, left })
    }
    calculate()
    window.addEventListener('resize', calculate, { passive: true })
    return () => window.removeEventListener('resize', calculate)
  }, [open, revealedLevel])

  useEffect(() => {
    if (!open) return
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) }
    }
    function handleClickOutside(event: globalThis.MouseEvent) {
      const target = event.target as HTMLElement
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', handleEscape, true)
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => {
      document.removeEventListener('keydown', handleEscape, true)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [open])

  if (hints.length === 0) return null

  const revealedCount = revealedLevel === null ? 0 : revealedLevel + 1
  const hasMore = revealedCount < hints.length

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`scenario-hint-trigger${revealedCount > 0 ? ' is-open' : ''}`}
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        aria-label={SCENARIO_COPY.hintReveal}
        aria-expanded={open}
        title={SCENARIO_COPY.hintReveal}
      >
        <Lightbulb size={16} strokeWidth={2.2} aria-hidden="true" />
        {revealedCount > 0 ? <span className="scenario-hint-trigger-badge" aria-hidden="true">{revealedCount}</span> : null}
      </button>
      {open && position ? createPortal(
        <div
          ref={popoverRef}
          className="scenario-hint-popover"
          role="dialog"
          aria-label="Hints for this turn"
          style={{ position: 'fixed', top: position.top, left: position.left, width: POPOVER_WIDTH, zIndex: 1000 }}
        >
          {revealedCount === 0 ? (
            <p className="scenario-hint-popover-empty">{SCENARIO_COPY.hintReveal}</p>
          ) : (
            <ol className="scenario-hint-steps">
              {hints.slice(0, revealedCount).map((hint, index) => (
                <li key={`${hint.en}-${index}`} className="scenario-hint-step">
                  <p className="scenario-hint-step-en">{hint.en}</p>
                  {hint.ja ? <p className="scenario-hint-step-ja" lang="ja">{hint.ja}{hint.romaji ? <span className="scenario-hint-step-romaji"> · {hint.romaji}</span> : null}</p> : null}
                </li>
              ))}
            </ol>
          )}
          <button
            type="button"
            className="scenario-hint-popover-more"
            onClick={onRevealHint}
            disabled={!hasMore}
          >
            {hasMore ? SCENARIO_COPY.hintRevealMore : SCENARIO_COPY.hintAllRevealed}
          </button>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
