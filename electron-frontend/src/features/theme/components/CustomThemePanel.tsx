import type { CSSProperties, RefObject, ChangeEvent } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { ThemeMode, CustomTheme } from '../types'
import { THEME_SWATCH_ACCENT } from '../constants'
import { getFallbackThemeForMode } from '../utils'

interface CustomThemePanelProps {
  customThemes: CustomTheme[]
  themeScope: string
  activeCustomThemeId: string | null
  themeMode: ThemeMode
  customThemePreviewById: Record<string, { accent: string; baseLabel: string }>
  customThemeActionMessage: string | null
  customThemeImportInputRef: RefObject<HTMLInputElement | null>
  createCustomTheme: () => void
  exportCustomThemesToFile: () => void
  copyCustomThemesToClipboard: () => Promise<void>
  openCustomThemeImportPicker: () => void
  importCustomThemesFromClipboard: () => Promise<void>
  handleCustomThemeFileImport: (event: ChangeEvent<HTMLInputElement>) => void
  selectCustomTheme: (id: string) => void
  duplicateCustomTheme: (id: string) => void
  deleteCustomTheme: (id: string) => void
}

export function CustomThemePanel({
  customThemes,
  themeScope,
  activeCustomThemeId,
  themeMode,
  customThemePreviewById,
  customThemeActionMessage,
  customThemeImportInputRef,
  createCustomTheme,
  exportCustomThemesToFile,
  copyCustomThemesToClipboard,
  openCustomThemeImportPicker,
  importCustomThemesFromClipboard,
  handleCustomThemeFileImport,
  selectCustomTheme,
  duplicateCustomTheme,
  deleteCustomTheme,
}: CustomThemePanelProps) {
  return (
    <div className="settings-theme-card settings-theme-card-custom">
      <div className="settings-theme-custom-head">
        <p className="settings-section-label">Custom Themes</p>
        <div className="settings-inline-action-group">
          <button
            type="button"
            className="settings-inline-button"
            onClick={createCustomTheme}
          >
            Create Theme
          </button>
          <button
            type="button"
            className="settings-inline-button"
            onClick={exportCustomThemesToFile}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="settings-inline-button"
            onClick={() => void copyCustomThemesToClipboard()}
          >
            <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
            <span>Copy</span>
          </button>
          <button
            type="button"
            className="settings-inline-button"
            onClick={openCustomThemeImportPicker}
          >
            Import File
          </button>
          <button
            type="button"
            className="settings-inline-button"
            onClick={() => void importCustomThemesFromClipboard()}
          >
            Paste JSON
          </button>
        </div>
      </div>
      <input
        ref={customThemeImportInputRef}
        type="file"
        accept="application/json"
        className="settings-hidden-file-input"
        onChange={handleCustomThemeFileImport}
      />
      {customThemeActionMessage ? (
        <p className="settings-help settings-help-inline">{customThemeActionMessage}</p>
      ) : null}

      {customThemes.length <= 0 ? (
        <p className="settings-help">Create a custom theme to edit every theme color variable by section.</p>
      ) : (
        <div className="settings-custom-theme-list" role="radiogroup" aria-label="Custom themes">
          {customThemes.map((customTheme) => {
            const isActive = themeScope === 'custom' && activeCustomThemeId === customTheme.id
            const preview = customThemePreviewById[customTheme.id]
            return (
              <div key={customTheme.id} className="settings-custom-theme-row">
                <button
                  type="button"
                  className={`settings-icon-entry settings-theme-entry ${isActive ? 'is-active' : ''}`}
                  style={{ '--theme-color': preview?.accent ?? THEME_SWATCH_ACCENT[getFallbackThemeForMode(themeMode)] } as CSSProperties}
                  onClick={() => selectCustomTheme(customTheme.id)}
                  aria-label={`Use custom theme ${customTheme.name}`}
                  aria-pressed={isActive}
                  title={customTheme.name}
                >
                  <span className={`settings-theme-chip ${isActive ? 'is-active' : ''}`} aria-hidden="true">
                    <span className="settings-theme-chip-core" aria-hidden="true" />
                  </span>
                  <span className="settings-custom-theme-copy">
                    <span className="settings-icon-entry-label">{customTheme.name}</span>
                    <span className="settings-theme-note">Base: {preview?.baseLabel ?? 'Preset'}</span>
                  </span>
                </button>
                <div className="settings-custom-theme-actions">
                  <button
                    type="button"
                    className="settings-inline-icon-button"
                    onClick={() => duplicateCustomTheme(customTheme.id)}
                    aria-label={`Duplicate ${customTheme.name}`}
                    title="Duplicate custom theme"
                  >
                    <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="settings-inline-icon-button"
                    onClick={() => deleteCustomTheme(customTheme.id)}
                    aria-label={`Delete ${customTheme.name}`}
                    title="Delete custom theme"
                  >
                    <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
