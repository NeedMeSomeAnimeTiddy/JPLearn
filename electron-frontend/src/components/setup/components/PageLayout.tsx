import { btnClass } from '../styles'

export function PageLayout({
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
}: {
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
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{title}</h1>
        {subtitle && <p style={{ margin: '0.4rem 0 0', opacity: 0.65, fontSize: '0.95rem' }}>{subtitle}</p>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {!hideNav && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.5rem' }}>
          {skipLabel && onSkip && (
            <button type="button" onClick={onSkip} className={btnClass('ghost')}>{skipLabel}</button>
          )}
          {!hideBack && onBack && (
            <button type="button" onClick={onBack} className={btnClass('secondary')}>Back</button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} disabled={nextDisabled} className={btnClass('primary', nextDisabled)}>
              {nextLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
