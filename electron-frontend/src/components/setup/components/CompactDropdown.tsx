import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CompactDropdownOption } from '../types'
import { DropdownBadge } from './DropdownBadge'

export function CompactDropdown({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string
  options: CompactDropdownOption[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0] ?? null

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.75rem',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        position: 'relative',
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.16)',
          background: 'rgba(255,255,255,0.06)',
          color: 'inherit',
          padding: '0.7rem 0.8rem',
          fontSize: '0.92rem',
          fontWeight: 600,
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label ?? 'Choose an option'}</span>
          {selected?.badge ? (
            <DropdownBadge tone={selected.badgeTone}>{selected.badge}</DropdownBadge>
          ) : null}
          {selected?.meta ? (
            <span style={{ opacity: 0.58, fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.meta}
            </span>
          ) : null}
        </span>
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" style={{ opacity: 0.72, flexShrink: 0 }} />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            left: '0.75rem',
            right: '0.75rem',
            top: 'calc(100% - 0.15rem)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            padding: '0.4rem',
            borderRadius: '10px',
            background: 'rgba(18, 27, 37, 0.98)',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 18px 38px rgba(0,0,0,0.34)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {options.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                style={{
                  borderRadius: '8px',
                  border: isActive ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  padding: '0.58rem 0.68rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{option.label}</span>
                  {option.badge ? <DropdownBadge tone={option.badgeTone}>{option.badge}</DropdownBadge> : null}
                </span>
                {option.meta ? (
                  <span style={{ fontSize: '0.76rem', opacity: 0.6, whiteSpace: 'nowrap' }}>{option.meta}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

