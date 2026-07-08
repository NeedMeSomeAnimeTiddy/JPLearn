import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import type { AppRegionStyle } from './types'

// ── Styles ─────────────────────────────────────────────────────────────────────

export const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'block',
  background: 'transparent',
  zIndex: 9999,
}

export const cardStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  borderRadius: 0,
  background: 'rgba(25, 35, 48, 0.86)',
  border: 'none',
  boxShadow: 'none',
  color: 'var(--text-main)',
  fontFamily: 'inherit',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  backdropFilter: 'blur(4px)',
}

export const dragBarStyle: AppRegionStyle = {
  height: '34px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 0.9rem',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))',
  WebkitAppRegion: 'drag',
}

export const dragBarTitleStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.68,
  fontWeight: 700,
  userSelect: 'none',
  pointerEvents: 'none',
}

export const cardViewportStyle: AppRegionStyle = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '0.4rem 1.25rem 1.4rem',
  WebkitAppRegion: 'no-drag',
}

export const stepDotsRowStyle: AppRegionStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '0.75rem 1.25rem 0.2rem',
  WebkitAppRegion: 'no-drag',
}

export const cardBodyStyle: AppRegionStyle = {
  padding: '2rem',
  width: '100%',
  maxWidth: '760px',
  margin: 0,
  WebkitAppRegion: 'no-drag',
}

export const button = cva(
  'sw-btn',
  {
    variants: {
      variant: {
        primary: 'sw-btn-primary',
        secondary: 'sw-btn-secondary',
        ghost: 'sw-btn-ghost',
      },
    },
  },
)

export function btnClass(variant: 'primary' | 'secondary' | 'ghost', disabled = false): string {
  return clsx(button({ variant }), disabled && 'sw-btn-disabled')
}


