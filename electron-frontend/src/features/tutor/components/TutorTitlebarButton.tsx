import type { ButtonHTMLAttributes } from 'react'
import { GraduationCap } from 'lucide-react'

interface TutorTitlebarButtonProps extends Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** whether Look it up is open */
  open: boolean
}

/**
 * The tutor's one entry in the titlebar. The tutor's chat and image translation are Look it up's
 * A QUESTION and A SCREENSHOT routes, so the button toggles Look it up -- the same door `/` is.
 * Always rendered: with no model running, those two routes say what is missing rather than the
 * door disappearing.
 */
export function TutorTitlebarButton({ open, onClick }: TutorTitlebarButtonProps) {
  return (
    <button
      type="button"
      className="window-nav-button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? 'Close the tutor (Look it up)' : 'Open the tutor (Look it up)'}
      title={open ? 'Close Look it up' : 'Ask the tutor or read a screenshot in Look it up (/)'}
    >
      <GraduationCap className="window-nav-icon" strokeWidth={2.2} aria-hidden="true" />
    </button>
  )
}
