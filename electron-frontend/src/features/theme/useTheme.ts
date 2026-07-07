import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import type { ThemeKey, ThemeMode, ThemeScope, ThemeVariableKey, ThemePalette, CustomTheme, ThemeSection } from './types'
import {
  THEME_OPTIONS,
  THEME_VARIABLE_KEYS,
  THEME_SWATCH_ACCENT,
} from './constants'
import {
  getThemeVariantForMode,
  getFallbackThemeForMode,
  readThemePalette,
  mergeThemePalette,
  makeCustomThemeId,
  parseImportedCustomThemes,
  makeCustomThemeExportPayload,
} from './utils'
export interface ThemeSettingsFields {
  themeMode: ThemeMode
  theme: ThemeKey
  themeScope: ThemeScope
  activeCustomThemeId: string | null
  customThemes: CustomTheme[]
}

export interface UseThemeReturn {
  availableThemes: Array<{ key: ThemeKey; label: string; mode: ThemeMode }>
  activeCustomTheme: CustomTheme | null
  effectiveTheme: ThemeKey
  activeBasePalette: ThemePalette | null
  customThemePreviewById: Record<string, { accent: string; baseLabel: string }>
  customThemeActionMessage: string | null
  setCustomThemeActionMessage: Dispatch<SetStateAction<string | null>>
  customThemeImportInputRef: React.RefObject<HTMLInputElement | null>
  createCustomTheme: () => void
  selectPresetTheme: (theme: ThemeKey, mode: ThemeMode) => void
  selectCustomTheme: (id: string) => void
  renameCustomTheme: (id: string, name: string) => void
  deleteCustomTheme: (id: string) => void
  duplicateCustomTheme: (id: string) => void
  importCustomThemesPayload: (payload: unknown) => number
  exportCustomThemesToFile: () => void
  copyCustomThemesToClipboard: () => Promise<void>
  openCustomThemeImportPicker: () => void
  importCustomThemesFromClipboard: () => Promise<void>
  handleCustomThemeFileImport: (event: ChangeEvent<HTMLInputElement>) => void
  updateCustomThemeBase: (id: string, mode: ThemeMode, baseTheme: ThemeKey) => void
  updateCustomThemeOverride: (id: string, mode: ThemeMode, key: ThemeVariableKey, value: string) => void
  resetCustomThemeSection: (id: string, mode: ThemeMode, section: ThemeSection) => void
  toggleThemeSectionCollapsed: (sectionId: string) => void
  setThemeMode: (mode: ThemeMode) => void
}

export function useTheme(
  settings: ThemeSettingsFields,
  setSettings: Dispatch<SetStateAction<ThemeSettingsFields>>,
  setStartupTheme?: (theme: string) => void,
  setCollapsedSettingsSections?: Dispatch<SetStateAction<Partial<Record<string, boolean>>>>,
): UseThemeReturn {
  const [customThemeActionMessage, setCustomThemeActionMessage] = useState<string | null>(null)
  const [themePaletteCache, setThemePaletteCache] = useState<Partial<Record<ThemeKey, ThemePalette>>>({})
  const customThemeImportInputRef = useRef<HTMLInputElement | null>(null)

  const availableThemes = useMemo(
    () => THEME_OPTIONS.filter((theme) => theme.mode === settings.themeMode),
    [settings.themeMode],
  )

  const activeCustomTheme = useMemo(
    () => settings.customThemes.find((theme) => theme.id === settings.activeCustomThemeId) ?? null,
    [settings.activeCustomThemeId, settings.customThemes],
  )

  const effectiveTheme = useMemo(() => {
    if (settings.themeScope === 'custom' && activeCustomTheme) {
      return activeCustomTheme.baseThemeByMode[settings.themeMode]
    }
    return getThemeVariantForMode(settings.theme, settings.themeMode)
  }, [activeCustomTheme, settings.theme, settings.themeMode, settings.themeScope])

  const ensureThemePaletteCached = useCallback((theme: ThemeKey): ThemePalette | null => {
    const cached = themePaletteCache[theme]
    if (cached) {
      return cached
    }
    const palette = readThemePalette(theme)
    if (palette) {
      setThemePaletteCache((prev) => ({ ...prev, [theme]: palette }))
    }
    return palette
  }, [themePaletteCache])

  const activeBasePalette = useMemo(() => {
    if (!activeCustomTheme) {
      return null
    }
    return themePaletteCache[activeCustomTheme.baseThemeByMode[settings.themeMode]] ?? null
  }, [activeCustomTheme, settings.themeMode, themePaletteCache])

  const customThemePreviewById = useMemo(() => {
    const previews: Record<string, { accent: string; baseLabel: string }> = {}
    for (const theme of settings.customThemes) {
      const baseTheme = theme.baseThemeByMode[settings.themeMode]
      const basePalette = themePaletteCache[baseTheme]
      const mergedPalette = basePalette ? mergeThemePalette(basePalette, theme.overridesByMode[settings.themeMode]) : null
      const baseOption = THEME_OPTIONS.find((option) => option.key === baseTheme)
      previews[theme.id] = {
        accent: mergedPalette?.['--accent'] ?? THEME_SWATCH_ACCENT[baseTheme],
        baseLabel: baseOption?.label ?? baseTheme,
      }
    }
    return previews
  }, [settings.customThemes, settings.themeMode, themePaletteCache])

  const createCustomTheme = useCallback(() => {
    setSettings((prev) => {
      const baseDark = getThemeVariantForMode(prev.theme, 'dark')
      const baseLight = getThemeVariantForMode(prev.theme, 'light')
      const nextId = makeCustomThemeId()
      const nextTheme: CustomTheme = {
        id: nextId,
        name: `Custom ${prev.customThemes.length + 1}`,
        baseThemeByMode: {
          dark: baseDark,
          light: baseLight,
        },
        overridesByMode: {
          dark: {},
          light: {},
        },
      }
      return {
        ...prev,
        themeScope: 'custom',
        activeCustomThemeId: nextId,
        customThemes: [...prev.customThemes, nextTheme],
        theme: nextTheme.baseThemeByMode[prev.themeMode],
      }
    })
  }, [setSettings])

  const selectPresetTheme = useCallback((theme: ThemeKey, mode: ThemeMode) => {
    setSettings((prev) => ({
      ...prev,
      themeScope: 'preset',
      activeCustomThemeId: null,
      themeMode: mode,
      theme,
    }))
  }, [setSettings])

  const selectCustomTheme = useCallback((id: string) => {
    setSettings((prev) => {
      const selected = prev.customThemes.find((theme) => theme.id === id)
      if (!selected) return prev
      return {
        ...prev,
        themeScope: 'custom',
        activeCustomThemeId: id,
        theme: selected.baseThemeByMode[prev.themeMode],
      }
    })
  }, [setSettings])

  const renameCustomTheme = useCallback((id: string, name: string) => {
    setSettings((prev) => ({
      ...prev,
      customThemes: prev.customThemes.map((theme) => (
        theme.id === id
          ? {
            ...theme,
            name: name.trim() || 'Custom Theme',
          }
          : theme
      )),
    }))
  }, [setSettings])

  const deleteCustomTheme = useCallback((id: string) => {
    setSettings((prev) => {
      const remaining = prev.customThemes.filter((theme) => theme.id !== id)
      if (prev.activeCustomThemeId !== id) {
        return {
          ...prev,
          customThemes: remaining,
        }
      }

      const fallbackCustom = remaining[0] ?? null
      if (fallbackCustom) {
        return {
          ...prev,
          customThemes: remaining,
          activeCustomThemeId: fallbackCustom.id,
          themeScope: 'custom',
          theme: fallbackCustom.baseThemeByMode[prev.themeMode],
        }
      }

      return {
        ...prev,
        customThemes: remaining,
        activeCustomThemeId: null,
        themeScope: 'preset',
        theme: getFallbackThemeForMode(prev.themeMode),
      }
    })
  }, [setSettings])

  const duplicateCustomTheme = useCallback((id: string) => {
    setSettings((prev) => {
      const sourceTheme = prev.customThemes.find((theme) => theme.id === id)
      if (!sourceTheme) {
        return prev
      }
      const nextId = makeCustomThemeId()
      const duplicatedTheme: CustomTheme = {
        ...sourceTheme,
        id: nextId,
        name: `${sourceTheme.name} Copy`,
        overridesByMode: {
          dark: { ...sourceTheme.overridesByMode.dark },
          light: { ...sourceTheme.overridesByMode.light },
        },
      }
      return {
        ...prev,
        themeScope: 'custom',
        activeCustomThemeId: nextId,
        customThemes: [...prev.customThemes, duplicatedTheme],
        theme: duplicatedTheme.baseThemeByMode[prev.themeMode],
      }
    })
    setCustomThemeActionMessage('Custom theme duplicated.')
  }, [setSettings])

  const importCustomThemesPayload = useCallback((payload: unknown): number => {
    const importedThemes = parseImportedCustomThemes(payload)
    if (importedThemes.length <= 0) {
      return 0
    }

    setSettings((prev) => {
      const existingIds = new Set(prev.customThemes.map((theme) => theme.id))
      const dedupedThemes = importedThemes.map((theme) => {
        let nextId = theme.id
        while (existingIds.has(nextId)) {
          nextId = makeCustomThemeId()
        }
        existingIds.add(nextId)
        return {
          ...theme,
          id: nextId,
        }
      })

      const nextCustomThemes = [...prev.customThemes, ...dedupedThemes]
      if (prev.activeCustomThemeId || dedupedThemes.length <= 0) {
        return {
          ...prev,
          customThemes: nextCustomThemes,
        }
      }

      const firstImported = dedupedThemes[0]
      return {
        ...prev,
        customThemes: nextCustomThemes,
        themeScope: 'custom',
        activeCustomThemeId: firstImported.id,
        theme: firstImported.baseThemeByMode[prev.themeMode],
      }
    })

    return importedThemes.length
  }, [setSettings])

  const exportCustomThemesToFile = useCallback(() => {
    if (settings.customThemes.length <= 0) {
      setCustomThemeActionMessage('No custom themes to export.')
      return
    }

    const payload = makeCustomThemeExportPayload(settings.customThemes)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `jplearn-custom-themes-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setCustomThemeActionMessage('Exported custom themes as JSON.')
  }, [settings.customThemes])

  const copyCustomThemesToClipboard = useCallback(async () => {
    if (settings.customThemes.length <= 0) {
      setCustomThemeActionMessage('No custom themes to copy.')
      return
    }

    try {
      const payload = makeCustomThemeExportPayload(settings.customThemes)
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCustomThemeActionMessage('Copied custom themes JSON to clipboard.')
    } catch {
      setCustomThemeActionMessage('Clipboard copy failed in this environment.')
    }
  }, [settings.customThemes])

  const openCustomThemeImportPicker = useCallback(() => {
    customThemeImportInputRef.current?.click()
  }, [])

  const importCustomThemesFromClipboard = useCallback(async () => {
    try {
      const raw = await navigator.clipboard.readText()
      const payload = JSON.parse(raw)
      const importedCount = importCustomThemesPayload(payload)
      setCustomThemeActionMessage(
        importedCount > 0
          ? `Imported ${importedCount} custom theme${importedCount === 1 ? '' : 's'} from clipboard.`
          : 'Clipboard data did not contain custom themes.',
      )
    } catch {
      setCustomThemeActionMessage('Clipboard import failed. Paste valid JSON and try again.')
    }
  }, [importCustomThemesPayload])

  const handleCustomThemeFileImport = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const rawText = typeof reader.result === 'string' ? reader.result : ''
        const payload = JSON.parse(rawText)
        const importedCount = importCustomThemesPayload(payload)
        setCustomThemeActionMessage(
          importedCount > 0
            ? `Imported ${importedCount} custom theme${importedCount === 1 ? '' : 's'} from file.`
            : 'Selected file did not contain custom themes.',
        )
      } catch {
        setCustomThemeActionMessage('Could not parse selected JSON file.')
      }
    }
    reader.onerror = () => {
      setCustomThemeActionMessage('Could not read selected file.')
    }
    reader.readAsText(file)
    event.currentTarget.value = ''
  }, [importCustomThemesPayload])

  const updateCustomThemeBase = useCallback((id: string, mode: ThemeMode, baseTheme: ThemeKey) => {
    setSettings((prev) => {
      const normalizedTheme = getThemeVariantForMode(baseTheme, mode)
      const customThemes = prev.customThemes.map((theme) => (
        theme.id === id
          ? {
            ...theme,
            baseThemeByMode: {
              ...theme.baseThemeByMode,
              [mode]: normalizedTheme,
            },
          }
          : theme
      ))
      const activeCustomTheme = customThemes.find((theme) => theme.id === prev.activeCustomThemeId)
      return {
        ...prev,
        customThemes,
        theme: prev.themeScope === 'custom' && activeCustomTheme
          ? activeCustomTheme.baseThemeByMode[prev.themeMode]
          : prev.theme,
      }
    })
  }, [setSettings])

  const updateCustomThemeOverride = useCallback((id: string, mode: ThemeMode, key: ThemeVariableKey, value: string) => {
    setSettings((prev) => {
      const trimmed = value.trim()
      return {
        ...prev,
        customThemes: prev.customThemes.map((theme) => {
          if (theme.id !== id) {
            return theme
          }
          const nextOverrides = { ...theme.overridesByMode[mode] }
          if (trimmed) {
            nextOverrides[key] = trimmed
          } else {
            delete nextOverrides[key]
          }
          return {
            ...theme,
            overridesByMode: {
              ...theme.overridesByMode,
              [mode]: nextOverrides,
            },
          }
        }),
      }
    })
  }, [setSettings])

  const resetCustomThemeSection = useCallback((id: string, mode: ThemeMode, section: ThemeSection) => {
    setSettings((prev) => ({
      ...prev,
      customThemes: prev.customThemes.map((theme) => {
        if (theme.id !== id) {
          return theme
        }
        const nextOverrides = { ...theme.overridesByMode[mode] }
        for (const key of section.keys) {
          delete nextOverrides[key]
        }
        return {
          ...theme,
          overridesByMode: {
            ...theme.overridesByMode,
            [mode]: nextOverrides,
          },
        }
      }),
    }))
  }, [setSettings])

  const toggleThemeSectionCollapsed = useCallback((sectionId: string) => {
    if (setCollapsedSettingsSections) {
      setCollapsedSettingsSections((prev) => ({
        ...prev,
        [sectionId]: !prev[sectionId],
      }))
    }
  }, [setCollapsedSettingsSections])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setSettings((prev) => {
      if (prev.themeMode === mode) return prev
      const activeCustomTheme = prev.customThemes.find((theme) => theme.id === prev.activeCustomThemeId)
      const nextTheme = prev.themeScope === 'custom' && activeCustomTheme
        ? activeCustomTheme.baseThemeByMode[mode]
        : getThemeVariantForMode(prev.theme, mode)
      return {
        ...prev,
        themeMode: mode,
        theme: nextTheme,
      }
    })
  }, [setSettings])

  useEffect(() => {
    const themeKeys = new Set<ThemeKey>()
    themeKeys.add(effectiveTheme)
    for (const customTheme of settings.customThemes) {
      themeKeys.add(customTheme.baseThemeByMode.dark)
      themeKeys.add(customTheme.baseThemeByMode.light)
    }
    themeKeys.forEach((themeKey) => {
      ensureThemePaletteCached(themeKey)
    })
  }, [effectiveTheme, ensureThemePaletteCached, settings.customThemes])

  useEffect(() => {
    document.documentElement.dataset.themeMode = settings.themeMode
    document.documentElement.dataset.theme = effectiveTheme

    for (const key of THEME_VARIABLE_KEYS) {
      document.documentElement.style.removeProperty(key)
    }

    if (settings.themeScope === 'custom' && activeCustomTheme) {
      const basePalette = themePaletteCache[effectiveTheme] ?? ensureThemePaletteCached(effectiveTheme)
      if (basePalette) {
        const mergedPalette = mergeThemePalette(basePalette, activeCustomTheme.overridesByMode[settings.themeMode])
        for (const key of THEME_VARIABLE_KEYS) {
          const value = mergedPalette[key]
          if (value) {
            document.documentElement.style.setProperty(key, value)
          }
        }
      }
    }

    void setStartupTheme?.(effectiveTheme)
  }, [activeCustomTheme, effectiveTheme, ensureThemePaletteCached, settings.themeMode, settings.themeScope, settings.customThemes, themePaletteCache, setStartupTheme])

  return {
    availableThemes,
    activeCustomTheme,
    effectiveTheme,
    activeBasePalette,
    customThemePreviewById,
    customThemeActionMessage,
    setCustomThemeActionMessage,
    customThemeImportInputRef,
    createCustomTheme,
    selectPresetTheme,
    selectCustomTheme,
    renameCustomTheme,
    deleteCustomTheme,
    duplicateCustomTheme,
    importCustomThemesPayload,
    exportCustomThemesToFile,
    copyCustomThemesToClipboard,
    openCustomThemeImportPicker,
    importCustomThemesFromClipboard,
    handleCustomThemeFileImport,
    updateCustomThemeBase,
    updateCustomThemeOverride,
    resetCustomThemeSection,
    toggleThemeSectionCollapsed,
    setThemeMode,
  }
}
