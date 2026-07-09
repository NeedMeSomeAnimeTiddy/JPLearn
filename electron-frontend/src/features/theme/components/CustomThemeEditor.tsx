import type { CSSProperties } from 'react'
import type { ThemeMode, ThemeKey, CustomTheme, ThemePalette, ThemeSection, ThemeVariableKey } from '../types'
import { THEME_SECTION_DEFINITIONS, THEME_VARIABLE_DISPLAY, THEME_SWATCH_ACCENT } from '../constants'
import { formatThemeVariableLabel, supportsColorPickerForKey, isColorLikeValue, getColorInputValue, resolveThemeMode } from '../utils'

interface CustomThemeEditorProps {
  activeCustomTheme: CustomTheme | null
  themeMode: ThemeMode
  availableThemes: Array<{ key: ThemeKey; label: string; mode: ThemeMode }>
  activeBasePalette: ThemePalette | null
  collapsedSections: Partial<Record<string, boolean>>
  renameCustomTheme: (id: string, name: string) => void
  updateCustomThemeBase: (id: string, mode: ThemeMode, baseTheme: ThemeKey) => void
  updateCustomThemeOverride: (id: string, mode: ThemeMode, key: ThemeVariableKey, value: string) => void
  resetCustomThemeSection: (id: string, mode: ThemeMode, section: ThemeSection) => void
  toggleThemeSectionCollapsed: (sectionId: string) => void
}

export function CustomThemeEditor({
  activeCustomTheme,
  themeMode,
  availableThemes,
  activeBasePalette,
  collapsedSections,
  renameCustomTheme,
  updateCustomThemeBase,
  updateCustomThemeOverride,
  resetCustomThemeSection,
  toggleThemeSectionCollapsed,
}: CustomThemeEditorProps) {
  if (!activeCustomTheme) {
    return null
  }

  return (
    <div className="settings-custom-editor" aria-label="Custom theme editor">
      <div className="settings-custom-editor-head">
        <div className="settings-custom-editor-row">
          <label className="settings-small-label" htmlFor="custom-theme-name">Theme Name</label>
          <span className="settings-theme-note">Rename selected theme</span>
        </div>
        <input
          id="custom-theme-name"
          className="settings-text-input"
          value={activeCustomTheme.name}
          onChange={(event) => renameCustomTheme(activeCustomTheme.id, event.currentTarget.value)}
          placeholder="Custom Theme"
        />
      </div>

      <div className="settings-custom-editor-head">
        <label className="settings-small-label">Base Preset ({themeMode})</label>
        <div className="settings-theme-grid" role="radiogroup" aria-label={`Base preset selection for ${themeMode} mode`}>
          {availableThemes.map((theme) => {
            const isBaseTheme = activeCustomTheme.baseThemeByMode[resolveThemeMode(themeMode)] === theme.key
            return (
              <button
                key={theme.key}
                type="button"
                className={`settings-icon-entry settings-theme-entry ${isBaseTheme ? 'is-active' : ''}`}
                style={{ '--theme-color': THEME_SWATCH_ACCENT[theme.key as keyof typeof THEME_SWATCH_ACCENT] } as CSSProperties}
                onClick={() => updateCustomThemeBase(activeCustomTheme.id, themeMode, theme.key)}
                aria-label={`Use ${theme.label} as base preset`}
                aria-pressed={isBaseTheme}
                title={theme.label}
              >
                <span className={`settings-theme-chip ${isBaseTheme ? 'is-active' : ''}`} aria-hidden="true">
                  <span className="settings-theme-chip-core" aria-hidden="true" />
                </span>
                <span className="settings-icon-entry-label">{theme.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {THEME_SECTION_DEFINITIONS.map((section) => {
        const modeOverrides = activeCustomTheme.overridesByMode[resolveThemeMode(themeMode)]
        const isCollapsed = Boolean(collapsedSections[section.id])
        const overrideCount = section.keys.reduce(
          (count, key) => count + (modeOverrides[key] ? 1 : 0),
          0,
        )
        return (
          <section key={section.id} className="settings-theme-section-editor">
            <div className="settings-theme-section-head">
              <div>
                <p className="settings-theme-section-title">{section.label}</p>
                <p className="settings-theme-section-copy">{section.description}</p>
                <p className="settings-theme-section-subtitle">{overrideCount} override{overrideCount === 1 ? '' : 's'}</p>
              </div>
              <div className="settings-inline-action-group">
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={() => toggleThemeSectionCollapsed(section.id)}
                >
                  {isCollapsed ? 'Expand' : 'Collapse'}
                </button>
                <button
                  type="button"
                  className="settings-inline-button"
                  onClick={() => resetCustomThemeSection(activeCustomTheme.id, themeMode, section)}
                  disabled={overrideCount <= 0}
                >
                  Reset section
                </button>
              </div>
            </div>

            {!isCollapsed ? (
              <div className="settings-theme-variable-grid">
                {section.keys.map((key) => {
                  const overrideValue = activeCustomTheme.overridesByMode[resolveThemeMode(themeMode)][key] ?? ''
                  const baseValue = activeBasePalette?.[key] ?? ''
                  const resolvedValue = overrideValue || baseValue
                  const isOverride = Boolean(overrideValue)
                  const showColorPicker = supportsColorPickerForKey(key) && isColorLikeValue(resolvedValue)
                  const variableDisplay = THEME_VARIABLE_DISPLAY[key]
                  return (
                    <label key={key} className="settings-theme-variable-field">
                      <span className="settings-theme-variable-head">
                        <span className="settings-theme-variable-title-block">
                          <span className="settings-theme-variable-label">{formatThemeVariableLabel(key)}</span>
                          <span className="settings-theme-variable-help">{variableDisplay.description}</span>
                        </span>
                        <span className={`settings-theme-variable-badge ${isOverride ? 'is-override' : ''}`}>
                          {isOverride ? 'Override' : 'Inherited'}
                        </span>
                      </span>
                      <span className={`settings-theme-variable-input-wrap ${showColorPicker ? 'is-picker' : ''}`}>
                        {showColorPicker ? (
                          <span
                            className="settings-theme-variable-swatch settings-theme-variable-swatch-picker"
                            style={isColorLikeValue(resolvedValue) ? { background: resolvedValue } : undefined}
                            title={`Pick color for ${formatThemeVariableLabel(key)}`}
                          >
                            <input
                              type="color"
                              className="settings-theme-variable-color-picker"
                              value={getColorInputValue(resolvedValue)}
                              onChange={(event) => {
                                updateCustomThemeOverride(
                                  activeCustomTheme.id,
                                  themeMode,
                                  key,
                                  event.currentTarget.value,
                                )
                              }}
                              aria-label={`Pick color for ${formatThemeVariableLabel(key)}`}
                            />
                          </span>
                        ) : (
                          <>
                            <span
                              className="settings-theme-variable-swatch"
                              style={isColorLikeValue(resolvedValue) ? { background: resolvedValue } : undefined}
                              aria-hidden="true"
                            />
                            <input
                              className="settings-text-input"
                              value={overrideValue}
                              placeholder={baseValue || 'Enter CSS color'}
                              onChange={(event) => {
                                updateCustomThemeOverride(
                                  activeCustomTheme.id,
                                  themeMode,
                                  key,
                                  event.currentTarget.value,
                                )
                              }}
                            />
                          </>
                        )}
                      </span>
                      <span className="settings-theme-variable-key">{key}</span>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
