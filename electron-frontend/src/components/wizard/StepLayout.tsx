import { useLayoutEffect, useRef } from 'react'
import { useTypewriter } from './useTypewriter'

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
  enableTypewriter?: boolean
  revealed?: boolean
  onReveal?: () => void
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
  enableTypewriter = false,
  revealed = false,
  onReveal,
}: StepLayoutProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const displayedTitle = useTypewriter(
    enableTypewriter ? title : '',
    enableTypewriter && onReveal ? onReveal : () => {},
  )

  useLayoutEffect(() => {
    if (enableTypewriter && revealed && title && wrapperRef.current) {
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
  }, [enableTypewriter, revealed, title])

  if (enableTypewriter && !revealed && title) {
    return (
      <div className="wiz-step-body">
        <div className="wiz-reveal-stage">
          <h1 className="wiz-typed-title">{displayedTitle}</h1>
        </div>
        {skipLabel && onSkip && (
          <div className="wiz-step-nav" style={{ justifyContent: 'center' }}>
            <button type="button" onClick={onSkip} className="wiz-btn wiz-btn-ghost">{skipLabel}</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="wiz-step-body">
      <div>
        {title ? <h1 className="wiz-step-title">{title}</h1> : null}
        {subtitle && <p className="wiz-step-subtitle">{subtitle}</p>}
      </div>
      <div className="wiz-content-reveal" ref={wrapperRef}>
        <div className="wiz-step-content">
          {children}
        </div>
        {!hideNav && (title !== '' || revealed) && (
          <div className="wiz-step-nav">
            {skipLabel && onSkip && (
              <button type="button" onClick={onSkip} className="wiz-btn wiz-btn-ghost">{skipLabel}</button>
            )}
            <div className="wiz-step-nav-spacer" />
            {!hideBack && onBack && (
              <button type="button" onClick={onBack} className="wiz-btn wiz-btn-secondary">Back</button>
            )}
            {onNext && (
              <button type="button" onClick={onNext} disabled={nextDisabled} className={`wiz-btn wiz-btn-primary${nextDisabled ? ' wiz-btn-disabled' : ''}`}>
                {nextLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
