import type { ThemeKey, ThemeMode, ThemeScope, ThemeVariableKey, ThemeVariableOverrides, ThemePalette, CustomTheme, CustomThemeExportPayload } from './types'
import {
  THEME_OPTIONS,
  THEME_KEY_SET,
  THEME_VARIABLE_KEYS,
  THEME_VARIABLE_SET,
  THEME_VARIABLE_DISPLAY,
  DEFAULT_THEME_BY_MODE,
} from './constants'

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

export function isThemeScope(value: unknown): value is ThemeScope {
  return value === 'preset' || value === 'custom'
}

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && THEME_KEY_SET.has(value as ThemeKey)
}

export function isThemeVariableKey(value: unknown): value is ThemeVariableKey {
  return typeof value === 'string' && THEME_VARIABLE_SET.has(value as ThemeVariableKey)
}

export function getThemeModeForTheme(theme: ThemeKey): ThemeMode {
  const themeOption = THEME_OPTIONS.find((option) => option.key === theme)
  return themeOption?.mode ?? 'dark'
}

export function getThemeVariantForMode(theme: ThemeKey, mode: ThemeMode): ThemeKey {
  if (getThemeModeForTheme(theme) === mode) {
    return theme
  }

  const candidate = mode === 'light'
    ? `${theme}_light`
    : theme.replace(/_light$/, '')
  return isThemeKey(candidate) ? candidate : getFallbackThemeForMode(mode)
}

export function getFallbackThemeForMode(mode: ThemeMode): ThemeKey {
  const firstTheme = THEME_OPTIONS.find((theme) => theme.mode === mode)
  return firstTheme?.key ?? DEFAULT_THEME_BY_MODE.dark
}

export function createThemePalette(root: HTMLElement): ThemePalette {
  const style = getComputedStyle(root)
  const palette = {} as ThemePalette
  for (const key of THEME_VARIABLE_KEYS) {
    palette[key] = style.getPropertyValue(key).trim()
  }
  return palette
}

export function readThemePalette(theme: ThemeKey): ThemePalette | null {
  if (typeof document === 'undefined') {
    return null
  }

  const root = document.documentElement
  const previousMode = root.dataset.themeMode
  const previousTheme = root.dataset.theme
  const previousInline = new Map<ThemeVariableKey, string>()

  for (const key of THEME_VARIABLE_KEYS) {
    previousInline.set(key, root.style.getPropertyValue(key))
    root.style.removeProperty(key)
  }

  root.dataset.themeMode = getThemeModeForTheme(theme)
  root.dataset.theme = theme
  const palette = createThemePalette(root)

  if (previousMode) {
    root.dataset.themeMode = previousMode
  } else {
    delete root.dataset.themeMode
  }

  if (previousTheme) {
    root.dataset.theme = previousTheme
  } else {
    delete root.dataset.theme
  }

  for (const key of THEME_VARIABLE_KEYS) {
    const inlineValue = previousInline.get(key) ?? ''
    if (inlineValue) {
      root.style.setProperty(key, inlineValue)
    } else {
      root.style.removeProperty(key)
    }
  }

  return palette
}

export function normalizeThemeOverrides(value: unknown): ThemeVariableOverrides {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const normalized: ThemeVariableOverrides = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isThemeVariableKey(key) || typeof raw !== 'string') {
      continue
    }
    const trimmed = raw.trim()
    if (!trimmed) {
      continue
    }
    normalized[key] = trimmed
  }
  return normalized
}

export function normalizeCustomTheme(value: unknown): CustomTheme | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const candidate = value as Partial<CustomTheme>
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    return null
  }

  const baseByMode = candidate.baseThemeByMode
  const darkBase = isThemeKey(baseByMode?.dark) ? baseByMode.dark : DEFAULT_THEME_BY_MODE.dark
  const lightBase = isThemeKey(baseByMode?.light) ? baseByMode.light : DEFAULT_THEME_BY_MODE.light

  const overrides = candidate.overridesByMode
  return {
    id: candidate.id,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : 'Custom Theme',
    baseThemeByMode: {
      dark: getThemeVariantForMode(darkBase, 'dark'),
      light: getThemeVariantForMode(lightBase, 'light'),
    },
    overridesByMode: {
      dark: normalizeThemeOverrides(overrides?.dark),
      light: normalizeThemeOverrides(overrides?.light),
    },
  }
}

export function makeCustomThemeId(seed = Date.now()): string {
  const randomPart = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return `custom_${seed.toString(36)}_${randomPart}`
}

export function formatThemeVariableLabel(key: ThemeVariableKey): string {
  return THEME_VARIABLE_DISPLAY[key].label
}

export function mergeThemePalette(base: ThemePalette, overrides: ThemeVariableOverrides): ThemePalette {
  const merged = { ...base }
  for (const key of THEME_VARIABLE_KEYS) {
    const overrideValue = overrides[key]
    if (overrideValue && overrideValue.trim()) {
      merged[key] = overrideValue.trim()
    }
  }
  return merged
}

export function isColorLikeValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('#')
    || normalized.startsWith('rgb(')
    || normalized.startsWith('rgba(')
    || normalized.startsWith('hsl(')
    || normalized.startsWith('hsla(')
    || normalized.startsWith('oklch(')
    || normalized.startsWith('oklab(')
    || normalized.startsWith('color(')
}

export function supportsColorPickerForKey(key: ThemeVariableKey): boolean {
  return key !== '--panel-shadow'
}

export function getColorInputValue(value: string | undefined): string {
  const normalized = (value ?? '').trim()
  if (/^#[\da-f]{6}$/i.test(normalized)) {
    return normalized
  }
  if (/^#[\da-f]{3}$/i.test(normalized)) {
    const r = normalized[1]
    const g = normalized[2]
    const b = normalized[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#7bc5df'
}

export function parseImportedCustomThemes(value: unknown): CustomTheme[] {
  const candidateThemes: unknown[] = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && Array.isArray((value as Partial<CustomThemeExportPayload>).themes)
      ? (value as Partial<CustomThemeExportPayload>).themes ?? []
      : [])

  return candidateThemes
    .map((item) => normalizeCustomTheme(item))
    .filter((item): item is CustomTheme => item !== null)
}

export function makeCustomThemeExportPayload(themes: CustomTheme[]): CustomThemeExportPayload {
  return {
    version: 1,
    exportedAtUtc: new Date().toISOString(),
    themes,
  }
}
