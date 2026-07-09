import { useEffect, useRef } from 'react'
import { Search, ArrowRight } from 'lucide-react'
import type { Command } from '../types'
import { getCategoryLabel } from '../utils'
import { CATEGORY_ORDER } from '../constants'

interface CommandPaletteProps {
  isOpen: boolean
  query: string
  onQueryChange: (query: string) => void
  commands: Command[]
  selectedIndex: number
  onSelect: (index: number) => void
  onExecute: (command: Command) => void
  onClose: () => void
}

export function CommandPalette({
  isOpen,
  query,
  onQueryChange,
  commands,
  selectedIndex,
  onSelect,
  onExecute,
  onClose,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!isOpen) return null

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: getCategoryLabel(cat),
    commands: commands.filter((c) => c.category === cat),
  })).filter((g) => g.commands.length > 0)

  let flatIndex = 0

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel crt-scanlines"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{ maxWidth: '520px', width: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Search size={18} strokeWidth={2.2} style={{ opacity: 0.5, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search commands..."
            aria-label="Search commands"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'inherit',
              fontSize: '0.95rem',
              fontFamily: 'inherit',
            }}
          />
          <code className="command-hint" style={{ fontSize: '0.7rem', opacity: 0.5 }}>Esc</code>
        </div>

        <div ref={listRef} role="listbox" style={{ overflowY: 'auto', flex: 1, padding: '0.35rem 0' }}>
          {commands.length === 0 ? (
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>
              No commands found
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category}>
                <div
                  style={{
                    padding: '0.5rem 1rem 0.2rem',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    opacity: 0.45,
                    letterSpacing: '0.05em',
                  }}
                >
                  {group.label}
                </div>
                {group.commands.map((cmd) => {
                  const idx = flatIndex++
                  const isSelected = idx === selectedIndex
                  return (
                    <div
                      key={cmd.id}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => onSelect(idx)}
                      onClick={() => onExecute(cmd)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        margin: '0 0.35rem',
                        background: isSelected ? 'rgba(255,255,255,0.07)' : 'transparent',
                        transition: 'background 80ms',
                      }}
                    >
                      <span style={{ fontSize: '0.88rem' }}>{cmd.label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {cmd.shortcut ? (
                          <code className="command-hint" style={{ fontSize: '0.65rem' }}>{cmd.shortcut}</code>
                        ) : null}
                        {isSelected ? (
                          <ArrowRight size={14} strokeWidth={2.5} style={{ opacity: 0.5 }} />
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: '0.35rem 1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: '0.65rem',
            opacity: 0.4,
            display: 'flex',
            gap: '0.75rem',
          }}
        >
          <span><kbd style={{ fontWeight: 600 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontWeight: 600 }}>↵</kbd> execute</span>
          <span><kbd style={{ fontWeight: 600 }}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
