import { useState } from 'react'
import { X, Minimize2, Power } from 'lucide-react'

interface CloseConfirmDialogProps {
  isOpen: boolean
  onMinimizeToTray: (remember: boolean) => void
  onQuit: (remember: boolean) => void
  onClose: () => void
}

export function CloseConfirmDialog({ isOpen, onMinimizeToTray, onQuit, onClose }: CloseConfirmDialogProps) {
  const [remember, setRemember] = useState(false)

  if (!isOpen) return null

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
        aria-label="Close options"
        style={{ maxWidth: '380px', padding: '1.5rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Close JPLearn?</h2>
          <button
            type="button"
            className="settings-inline-icon-button"
            onClick={onClose}
            aria-label="Cancel"
          >
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
          Choose what happens when you close the window.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className="settings-tab-button"
            style={{ justifyContent: 'flex-start', gap: '0.6rem', padding: '0.65rem 0.75rem' }}
            onClick={() => onMinimizeToTray(remember)}
          >
            <Minimize2 size={16} strokeWidth={2.2} aria-hidden="true" />
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Minimize to Tray</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>App stays running in the system tray</span>
            </span>
          </button>

          <button
            type="button"
            className="settings-tab-button"
            style={{ justifyContent: 'flex-start', gap: '0.6rem', padding: '0.65rem 0.75rem' }}
            onClick={() => onQuit(remember)}
          >
            <Power size={16} strokeWidth={2.2} aria-hidden="true" />
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Quit</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Fully close the application</span>
            </span>
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', opacity: 0.7, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ accentColor: 'var(--accent, #7c6fe0)' }}
          />
          Remember my choice
        </label>
      </div>
    </div>
  )
}
