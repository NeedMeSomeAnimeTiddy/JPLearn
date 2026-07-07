import type { CSSProperties } from 'react'
import type { ThemeKey, ThemeMode } from '../types'
import { THEME_MODE_SECTIONS, THEME_MODE_ICON, THEME_SWATCH_ACCENT } from '../constants'

interface PresetThemeGridProps {
  themeMode: ThemeMode
  availableThemes: Array<{ key: ThemeKey; label: string; mode: ThemeMode }>
  themeScope: string
  currentTheme: ThemeKey
  selectPresetTheme: (theme: ThemeKey, mode: ThemeMode) => void
  setThemeMode: (mode: ThemeMode) => void
}

export function PresetThemeGrid({
  themeMode,
  availableThemes,
  themeScope,
  currentTheme,
  selectPresetTheme,
  setThemeMode,
}: PresetThemeGridProps) {
  return (
    <div className="settings-theme-card">
      <p className="settings-section-label">Theme</p>
      <div className="settings-theme-mode-toggle" role="radiogroup" aria-label="Appearance mode">
        {THEME_MODE_SECTIONS.map((modeSection) => {
          const ModeIcon = THEME_MODE_ICON[modeSection.key]
          const isActive = themeMode === modeSection.key
          return (
            <button
              key={modeSection.key}
              type="button"
              className={`settings-icon-entry settings-theme-mode-entry ${isActive ? 'is-active' : ''}`}
              onClick={() => setThemeMode(modeSection.key)}
              aria-label={`Use ${modeSection.label}`}
              aria-pressed={isActive}
              title={modeSection.label}
            >
              <span className={`settings-mode-icon-button ${isActive ? 'is-enabled' : ''}`} aria-hidden="true">
                <ModeIcon size={18} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <span className="settings-icon-entry-label">{modeSection.label}</span>
            </button>
          )
        })}
      </div>
      <p className="settings-theme-mode-label">
        {themeMode === 'dark' ? 'Dark Mode Themes' : 'Light Mode Themes'}
      </p>
      <div className="settings-theme-grid" role="radiogroup" aria-label={`${themeMode} premade theme selection`}>
        {availableThemes.map((theme) => (
          <button
            key={theme.key}
            type="button"
            className={`settings-icon-entry settings-theme-entry ${themeScope === 'preset' && currentTheme === theme.key ? 'is-active' : ''}`}
            style={{ '--theme-color': THEME_SWATCH_ACCENT[theme.key as keyof typeof THEME_SWATCH_ACCENT] } as CSSProperties}
            onClick={() => selectPresetTheme(theme.key, theme.mode)}
            aria-label={`Use ${theme.label} theme`}
            aria-pressed={themeScope === 'preset' && currentTheme === theme.key}
            title={theme.label}
          >
            <span className={`settings-theme-chip ${themeScope === 'preset' && currentTheme === theme.key ? 'is-active' : ''}`} aria-hidden="true">
              <span className="settings-theme-chip-core" aria-hidden="true" />
            </span>
            <span className="settings-icon-entry-label">{theme.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
