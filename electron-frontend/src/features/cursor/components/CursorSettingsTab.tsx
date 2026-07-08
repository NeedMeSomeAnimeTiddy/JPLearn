import { memo } from 'react'
import type { UseCursorReturn } from '../useCursor'

export const CursorSettingsTab = memo(function CursorSettingsTab({
  cursor,
}: {
  cursor: UseCursorReturn
}) {
  return (
    <div className="settings-control-content">
      <p className="settings-section-label">Cursor Style</p>
      <p className="settings-help">
        Choose how your cursor looks and behaves. Animated provides a smooth follower with effects.
      </p>

      <div style={{ marginTop: '1rem' }}>
        <p className="settings-help" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
          Mode
        </p>
        <div className="settings-animation-grid" role="group" aria-label="Cursor mode">
          {cursor.cursorModeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`settings-icon-entry settings-theme-entry ${cursor.cursorMode === option.key ? 'is-active' : ''}`}
              onClick={() => cursor.setCursorMode(option.key)}
              aria-pressed={cursor.cursorMode === option.key}
              title={option.description}
            >
              <span className="settings-icon-entry-label">{option.label}</span>
              <span className="settings-help" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {cursor.cursorMode !== 'system' && (
        <div style={{ marginTop: '1.25rem' }}>
          <p className="settings-help" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
            Color
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input
              type="color"
              value={cursor.cursorColor ?? '#b07a5c'}
              onChange={(event) => cursor.setCursorColor(event.target.value)}
              aria-label="Cursor color"
              style={{
                width: 36,
                height: 36,
                padding: 0,
                border: '1px solid var(--panel-border)',
                borderRadius: 2,
                background: 'transparent',
                cursor: 'pointer',
              }}
            />
            <span className="settings-help" style={{ flex: 1 }}>
              {cursor.cursorColor ? cursor.cursorColor.toUpperCase() : 'Theme accent'}
            </span>
            {cursor.cursorColor && (
              <button
                type="button"
                className="settings-icon-entry settings-theme-entry"
                onClick={() => cursor.setCursorColor(null)}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                <span className="settings-icon-entry-label">Reset</span>
              </button>
            )}
          </div>
          <p className="settings-help" style={{ marginTop: '0.4rem' }}>
            Pick a custom color or reset to use the theme accent.
          </p>
        </div>
      )}

      {cursor.cursorMode === 'animated' && (
        <div style={{ marginTop: '1.25rem' }}>
          <p className="settings-help" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
            Size
          </p>
          <div className="settings-animation-grid" role="group" aria-label="Cursor size">
            {cursor.cursorSizeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-icon-entry settings-theme-entry ${cursor.cursorSize === option.value ? 'is-active' : ''}`}
                onClick={() => cursor.setCursorSize(option.value)}
                aria-pressed={cursor.cursorSize === option.value}
                title={option.label}
              >
                <span className="settings-icon-entry-label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="settings-help" style={{ marginTop: '1rem' }}>
        {cursor.cursorMode === 'animated'
          ? 'The animated cursor automatically falls back to System mode when reduced motion is preferred or on touch devices.'
          : cursor.cursorMode === 'custom'
            ? 'Custom cursors use an SVG image rendered by the OS.'
            : 'System cursor is the native pointer provided by your operating system.'}
      </p>
    </div>
  )
})
