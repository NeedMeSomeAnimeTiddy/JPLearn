export type ThemeKey =
  | 'lofi_dusk'
  | 'harbor_mist'
  | 'sakura_dawn'
  | 'forest_ink'
  | 'sunset_lacquer'
  | 'midnight_neon'
  | 'paper_crane'
  | 'matcha_stone'
  | 'ocean_glass'
  | 'ember_night'
  | 'plum_garden'
  | 'lofi_dusk_light'
  | 'harbor_mist_light'
  | 'sakura_dawn_light'
  | 'sunset_lacquer_light'
  | 'midnight_neon_light'
  | 'paper_crane_light'
  | 'ember_night_light'
  | 'forest_ink_light'
  | 'ocean_glass_light'
  | 'plum_garden_light'
  | 'matcha_stone_light'
  | 'high_contrast'
  | 'high_contrast_light'
export type ThemeMode = 'dark' | 'light' | 'auto'
export type ResolvedThemeMode = 'dark' | 'light'
export type ThemeScope = 'preset' | 'custom'
export type ThemeVariableKey =
  | '--bg-main'
  | '--bg-subtle'
  | '--text-main'
  | '--text-soft'
  | '--accent'
  | '--accent-soft'
  | '--accent-ink'
  | '--blob-left'
  | '--blob-right'
  | '--blob-top'
  | '--panel-bg'
  | '--panel-bg-alt'
  | '--panel-border'
  | '--panel-shadow'
  | '--tile-bg'
  | '--tile-border'
  | '--tile-shadow'
  | '--chip-bg'
  | '--chip-border'
  | '--button-border'
  | '--button-bg-top'
  | '--button-bg-bottom'
  | '--card-border'
  | '--card-bg-top'
  | '--card-bg-bottom'
  | '--track-bg'
  | '--xp-shell-border'
  | '--xp-shell-bg'
  | '--xp-badge-bg'
  | '--xp-badge-text'
  | '--xp-badge-ring'
  | '--xp-badge-glow'
  | '--xp-track-bg'
  | '--xp-fill-start'
  | '--xp-fill-end'
  | '--xp-label'
  | '--streak-shell-border'
  | '--streak-shell-bg'
  | '--streak-shell-text'
  | '--streak-icon'
  | '--streak-popover-border'
  | '--streak-popover-glow'
  | '--streak-popover-title'
  | '--streak-divider'
  | '--status-error'
  | '--tone-teal'
  | '--tone-ocean'
  | '--tone-amber'
  | '--tone-rose'
export type ThemeVariableOverrides = Partial<Record<ThemeVariableKey, string>>
export type ThemePalette = Record<ThemeVariableKey, string>

export interface CustomTheme {
  id: string
  name: string
  baseThemeByMode: Record<ResolvedThemeMode, ThemeKey>
  overridesByMode: Record<ResolvedThemeMode, ThemeVariableOverrides>
}

export interface ThemeSection {
  id: string
  label: string
  description: string
  keys: ThemeVariableKey[]
}

export interface CustomThemeExportPayload {
  version: 1
  exportedAtUtc: string
  themes: CustomTheme[]
}
