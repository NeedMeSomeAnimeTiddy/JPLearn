export function DropdownBadge({ children, tone = 'recommended' }: { children: React.ReactNode; tone?: 'recommended' | 'soft' | 'warning' }) {
  const isSoft = tone === 'soft'
  const isWarning = tone === 'warning'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.12rem 0.42rem',
        borderRadius: '0',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: isWarning ? 'var(--status-error)' : isSoft ? 'var(--tone-amber)' : 'var(--bg-main)',
        background: isWarning ? 'rgba(199, 77, 57, 0.18)' : isSoft ? 'rgba(242, 181, 111, 0.16)' : 'var(--accent)',
        border: isWarning ? '1px solid rgba(199, 77, 57, 0.3)' : isSoft ? '1px solid rgba(242, 181, 111, 0.24)' : '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  )
}

