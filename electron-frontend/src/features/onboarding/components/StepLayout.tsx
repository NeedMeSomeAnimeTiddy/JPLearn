import { useLayoutEffect, useRef } from 'react'
import { useTypewriter } from '../useTypewriter'

interface StepLayoutProps {
  title: string
  subtitle?: string
  children?: React.ReactNode
  onNext?: () => void
  onBack?: () => void
  onSkip?: () => void
  nextLabel?: string
  skipLabel?: string
  nextDisabled?: boolean
  hideNav?: boolean
  hideBack?: boolean
  revealed: boolean
  onReveal: () => void
}

export function StepLayout({
  title,
  subtitle,
  children,
  onNext,
  onBack,
  onSkip,
  nextLabel = 'Next',
  skipLabel,
  nextDisabled = false,
  hideNav = false,
  hideBack = false,
  revealed,
  onReveal,
}: StepLayoutProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const displayedTitle = useTypewriter(title, onReveal)

  useLayoutEffect(() => {
    if (revealed && title && wrapperRef.current) {
      const el = wrapperRef.current
      el.style.opacity = '0'
      el.style.transform = 'translateY(24px)'
      let raf1: number
      let raf2: number
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          el.style.opacity = ''
          el.style.transform = ''
        })
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
  }, [revealed, title])

  // Typing stage: centered title types out character by character
  if (!revealed && title) {
    return (
      <div className="obn-step-body">
        <div className="obn-reveal-stage">
          <h1 className="obn-typed-title">{displayedTitle}</h1>
        </div>
        {skipLabel && onSkip && (
          <div className="obn-step-nav" style={{ justifyContent: 'center' }}>
            <button type="button" onClick={onSkip} className="obn-btn obn-btn-ghost">{skipLabel}</button>
          </div>
        )}
      </div>
    )
  }

  // Revealed stage: title stays, content transitions in
  return (
    <div className="obn-step-body">
      <div>
        {title ? <h1 className="obn-step-title">{title}</h1> : null}
        {subtitle && <p className="obn-step-subtitle">{subtitle}</p>}
      </div>
      <div className="obn-content-reveal" ref={wrapperRef}>
        <div className="obn-step-content">
          {children}
        </div>
        {!hideNav && (title !== '' || revealed) && (
          <div className="obn-step-nav">
            {skipLabel && onSkip && (
              <button type="button" onClick={onSkip} className="obn-btn obn-btn-ghost">{skipLabel}</button>
            )}
            <div className="obn-step-nav-spacer" />
            {!hideBack && onBack && (
              <button type="button" onClick={onBack} className="obn-btn obn-btn-secondary">Back</button>
            )}
            {onNext && (
              <button type="button" onClick={onNext} disabled={nextDisabled} className={`obn-btn obn-btn-primary${nextDisabled ? ' obn-btn-disabled' : ''}`}>
                {nextLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
