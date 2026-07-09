import { X } from 'lucide-react'
import { KEYBOARD_SHORTCUTS, CONTEXT_LABELS } from '../constants'
import type { KeyboardShortcut } from '../types'

const CONTEXT_ORDER: KeyboardShortcut['context'][] = ['global', 'home', 'minigame', 'minigame_mc', 'carousel']

interface KeyboardCheatsheetProps {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardCheatsheet({ isOpen, onClose }: KeyboardCheatsheetProps) {
  if (!isOpen) return null

  const shortcutsByContext = CONTEXT_ORDER
    .map((ctx) => ({
      context: ctx,
      label: CONTEXT_LABELS[ctx],
      shortcuts: KEYBOARD_SHORTCUTS.filter((s) => s.context === ctx),
    }))
    .filter((g) => g.shortcuts.length > 0)

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel crt-scanlines"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        style={{ maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Keyboard Shortcuts</h2>
          <button
            type="button"
            className="settings-inline-icon-button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        {shortcutsByContext.map((group) => (
          <div key={group.context} style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.7, margin: '0 0 0.5rem' }}>
              {group.label}
            </p>
            <div className="settings-shortcuts">
              {group.shortcuts.map((shortcut) => (
                <div key={`${shortcut.context}-${shortcut.key}`} style={{ display: 'contents' }}>
                  <code className="command-hint">{shortcut.key}</code>
                  <span>{shortcut.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p style={{ opacity: 0.55, fontSize: '0.8rem', marginTop: '1rem' }}>
          Press <code className="command-hint">?</code> anywhere to show this overlay. Press <kbd>Esc</kbd> or click outside to close.
        </p>
      </div>
    </div>
  )
}
