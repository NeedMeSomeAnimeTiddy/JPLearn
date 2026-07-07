import { X } from 'lucide-react'
import { TypeAnimation } from 'react-type-animation'

interface TutorBannerProps {
  headline: string
  body: string
  cta: string
  messageType: 'congratulation' | 'encouragement' | 'guidance' | 'acknowledgement'
  onDismiss: () => void
}

export function TutorBanner({ headline, body, cta, messageType, onDismiss }: TutorBannerProps) {
  return (
    <aside
      className={`tutor-banner tutor-banner-${messageType}`}
      role="status"
      aria-live="polite"
      aria-label="Tutor message"
    >
      <div className="tutor-banner-content">
        <strong className="tutor-banner-headline">{headline}</strong>
        {body && <p className="tutor-banner-body"><TypeAnimation key={body} sequence={[body, 0]} speed={10} cursor={false} /></p>}
        {cta && <span className="tutor-banner-cta">{cta}</span>}
      </div>
      <button
        type="button"
        className="tutor-banner-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss tutor message"
      >
        <X aria-hidden="true" strokeWidth={2.2} className="tutor-banner-dismiss-icon" />
      </button>
    </aside>
  )
}
