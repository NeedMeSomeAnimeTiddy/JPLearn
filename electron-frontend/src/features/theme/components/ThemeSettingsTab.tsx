import type { ThemeMode, ThemeKey, CustomTheme } from '../types'
import type { UseThemeReturn } from '../useTheme'
import { PresetThemeGrid } from './PresetThemeGrid'
import { CustomThemePanel } from './CustomThemePanel'
import { CustomThemeEditor } from './CustomThemeEditor'

interface ThemeSettingsTabProps extends UseThemeReturn {
  settings: {
    themeMode: ThemeMode
    theme: ThemeKey
    themeScope: string
    activeCustomThemeId: string | null
    customThemes: CustomTheme[]
  }
  collapsedSettingsSections: Partial<Record<string, boolean>>
}

export function ThemeSettingsTab({
  settings,
  availableThemes,
  activeCustomTheme,
  activeBasePalette,
  customThemePreviewById,
  customThemeActionMessage,
  customThemeImportInputRef,
  collapsedSettingsSections,
  createCustomTheme,
  selectPresetTheme,
  selectCustomTheme,
  renameCustomTheme,
  deleteCustomTheme,
  duplicateCustomTheme,
  exportCustomThemesToFile,
  copyCustomThemesToClipboard,
  exportSingleCustomThemeToFile,
  copySingleCustomThemeToClipboard,
  openCustomThemeImportPicker,
  importCustomThemesFromClipboard,
  handleCustomThemeFileImport,
  updateCustomThemeBase,
  updateCustomThemeOverride,
  resetCustomThemeSection,
  toggleThemeSectionCollapsed,
  setThemeMode,
}: ThemeSettingsTabProps) {
  return (
    <div className="settings-theme-card">
      <PresetThemeGrid
        themeMode={settings.themeMode}
        availableThemes={availableThemes}
        themeScope={settings.themeScope}
        currentTheme={settings.theme}
        selectPresetTheme={selectPresetTheme}
        setThemeMode={setThemeMode}
      />

      <CustomThemePanel
        customThemes={settings.customThemes}
        themeScope={settings.themeScope}
        activeCustomThemeId={settings.activeCustomThemeId}
        themeMode={settings.themeMode}
        customThemePreviewById={customThemePreviewById}
        customThemeActionMessage={customThemeActionMessage}
        customThemeImportInputRef={customThemeImportInputRef}
        createCustomTheme={createCustomTheme}
        exportCustomThemesToFile={exportCustomThemesToFile}
        copyCustomThemesToClipboard={copyCustomThemesToClipboard}
        openCustomThemeImportPicker={openCustomThemeImportPicker}
        importCustomThemesFromClipboard={importCustomThemesFromClipboard}
        handleCustomThemeFileImport={handleCustomThemeFileImport}
        selectCustomTheme={selectCustomTheme}
        duplicateCustomTheme={duplicateCustomTheme}
        deleteCustomTheme={deleteCustomTheme}
        exportSingleCustomThemeToFile={exportSingleCustomThemeToFile}
        copySingleCustomThemeToClipboard={copySingleCustomThemeToClipboard}
      />

      {activeCustomTheme ? (
        <CustomThemeEditor
          activeCustomTheme={activeCustomTheme}
          themeMode={settings.themeMode}
          availableThemes={availableThemes}
          activeBasePalette={activeBasePalette}
          collapsedSections={collapsedSettingsSections}
          renameCustomTheme={renameCustomTheme}
          updateCustomThemeBase={updateCustomThemeBase}
          updateCustomThemeOverride={updateCustomThemeOverride}
          resetCustomThemeSection={resetCustomThemeSection}
          toggleThemeSectionCollapsed={toggleThemeSectionCollapsed}
        />
      ) : null}
    </div>
  )
}
