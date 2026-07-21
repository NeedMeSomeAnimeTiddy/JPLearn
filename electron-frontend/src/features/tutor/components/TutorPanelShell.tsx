import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { getFocusableElements, trapFocus } from '../../../lib/focusTrap'
import type { TutorPanelMode } from '../types'

interface TutorPanelShellProps {
  mode: TutorPanelMode
  title: string
  catalog: string
  ariaLabel: string
  panelId: string
  /** Present on every mode except 'menu'. */
  onBack?: () => void
  onClose: () => void
  headerActions?: ReactNode
  children: ReactNode
}

/**
 * The reusable Tutor popup shell: backdrop, dialog chrome, header (title +
 * Back/Close + per-mode actions), focus trapping, Escape handling, and
 * enter/exit animation. Every activity gets the same window size, so
 * switching modes never resizes the popup under the pointer. It owns presentation only — it knows
 * nothing about chat, OCR, or scenario behaviour, and never imports from
 * scenario-tutor. `TutorPanel` supplies the body and header configuration
 * per mode; this component only renders what it's given.
 */
export function TutorPanelShell({
  mode,
  title,
  catalog,
  ariaLabel,
  panelId,
  onBack,
  onClose,
  headerActions,
  children,
}: TutorPanelShellProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = dialogRef.current
    if (!container) return
    // A body (currently only TutorMenu, restoring focus to the item that
    // opened the activity being returned from) may mark one element as the
    // priority autofocus target; otherwise focus the first focusable element.
    const priority = container.querySelector<HTMLElement>('[data-autofocus="true"]')
    const focusable = getFocusableElements(container)
    ;(priority ?? focusable[0] ?? container).focus()
  }, [mode])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab' && dialogRef.current) {
      trapFocus(event, dialogRef.current)
      return
    }
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (mode === 'menu') {
        onClose()
      } else {
        ;(onBack ?? onClose)()
      }
    }
  }

  return (
    <div
      className="modal-backdrop assistant-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        id={panelId}
        ref={dialogRef}
        className="assistant-chat-panel assistant-chat-window crt-scanlines"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="crt-vhs-line" />
        <header className="assistant-chat-header">
          <div className="tutor-panel-header-leading">
            {onBack ? (
              <button
                type="button"
                className="panel-action-button"
                onClick={onBack}
                aria-label="Back to Tutor menu"
                title="Back"
              >
                <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="cassette-panel-header-center">
            <span className="cassette-panel-header-catalog">{catalog}</span>
            <h2 className="cassette-panel-header-title">{title}</h2>
          </div>
          <div className="assistant-chat-header-actions">
            {headerActions}
            <button
              type="button"
              className="panel-close-button"
              onClick={onClose}
              aria-label="Close Tutor panel"
            >
              <X size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </header>
        {children}
      </section>
    </div>
  )
}
