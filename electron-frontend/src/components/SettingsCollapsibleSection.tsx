import { useCallback } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SettingsCollapsibleSectionProps {
  id: string
  title: string
  description?: string
  meta?: ReactNode
  collapsed: boolean
  onToggle: () => void
  className?: string
  actions?: ReactNode
  /** shown under the header whether or not the section is open, outside the header's button */
  notice?: ReactNode
  hideChevron?: boolean
  children: ReactNode
}

export function SettingsCollapsibleSection({
  id,
  title,
  description,
  meta,
  collapsed,
  onToggle,
  className,
  actions,
  notice,
  hideChevron,
  children,
}: SettingsCollapsibleSectionProps) {
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    /* ONLY THE HEADER'S OWN KEYS (audit 17, F4). A button in `actions` sits inside this header, and
       its Enter or Space bubbled here, was cancelled and toggled the section instead of pressing it. */
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }, [onToggle])

  return (
    <section className={`settings-collapsible-card${className ? ` ${className}` : ''}`}>
      <div
        className="settings-collapsible-head"
        role="button"
        tabIndex={0}
        aria-controls={`${id}-body`}
        aria-expanded={!collapsed}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-collapsible-copy">
          <p className="settings-collapsible-title">{title}</p>
          {description ? <p className="settings-collapsible-description">{description}</p> : null}
          {meta ? <p className="settings-collapsible-meta">{meta}</p> : null}
        </div>
        <div className="settings-collapsible-actions">
          {actions ? <div className="settings-collapsible-action-group">{actions}</div> : null}
          {!hideChevron ? (
            <span className={`settings-collapsible-chevron${collapsed ? '' : ' is-open'}`} aria-hidden="true">
              <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
            </span>
          ) : null}
        </div>
      </div>
      {notice ? <div className="settings-collapsible-notice">{notice}</div> : null}
      <div id={`${id}-body`} className={`settings-collapsible-body${collapsed ? '' : ' is-open'}`}>
        {!collapsed ? children : null}
      </div>
    </section>
  )
}
