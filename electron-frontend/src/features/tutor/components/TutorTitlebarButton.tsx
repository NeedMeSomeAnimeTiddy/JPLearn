import type { ButtonHTMLAttributes, Ref } from 'react'
import { GraduationCap } from 'lucide-react'

interface TutorTitlebarButtonProps extends Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  tutorPanelOpen: boolean
  ref?: Ref<HTMLButtonElement>
}

/**
 * The single Tutor entry point in the titlebar — replaces the old separate
 * Tutor-chat and OCR buttons. Always rendered (never hidden by settings):
 * disabling chat only hides the Chat menu item, never this button, so
 * Scenario Practice and Image Translation stay reachable regardless.
 */
export function TutorTitlebarButton({ tutorPanelOpen, onClick, ref }: TutorTitlebarButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className="window-nav-button"
      onClick={onClick}
      aria-expanded={tutorPanelOpen}
      aria-controls="tutor-panel"
      aria-label={tutorPanelOpen ? 'Close Tutor' : 'Open Tutor'}
      title={tutorPanelOpen ? 'Close Tutor' : 'Open Tutor'}
    >
      <GraduationCap className="window-nav-icon" strokeWidth={2.2} aria-hidden="true" />
    </button>
  )
}
