// Programmatic palette helpers for the Lofi Dusk restyle.
//
// Centralizes color math (via culori) so view components never call the color
// library directly. Radix Colors scales can be layered on top of these ramps
// when a fully generated custom theme is needed. The CSS files in index.css
// remain the source of truth for the shipped presets; this module exists to
// generate coherent warm-dusk ramps for custom themes and future tooling.

import { converter, formatHex, formatRgb, interpolate } from 'culori'

const toOklch = converter('oklch')

export type ThemeMode = 'dark' | 'light'

/**
 * Produce a perceptually-even ramp of `steps` colors between two endpoints.
 * Interpolates in OKLCH so warm dusk gradients stay smooth without muddy
 * mid-tones.
 */
export function buildColorRamp(fromColor: string, toColor: string, steps: number): string[] {
  const safeSteps = Math.max(2, Math.floor(steps))
  const mixer = interpolate([fromColor, toColor], 'oklch')
  const ramp: string[] = []
  for (let index = 0; index < safeSteps; index += 1) {
    const position = index / (safeSteps - 1)
    ramp.push(formatHex(mixer(position)))
  }
  return ramp
}

/**
 * Lighten or darken a color by shifting its OKLCH lightness. Positive amounts
 * lighten, negative amounts darken. Amount is clamped to keep values in gamut.
 */
export function shiftLightness(baseColor: string, amount: number): string {
  const parsed = toOklch(baseColor)
  if (!parsed) return baseColor
  const nextLightness = Math.min(1, Math.max(0, (parsed.l ?? 0) + amount))
  return formatHex({ ...parsed, l: nextLightness })
}

/**
 * Return an `rgba(...)` string for a color at the given alpha. Useful for the
 * translucent panel/blob tokens the theme system relies on.
 */
export function withAlpha(baseColor: string, alpha: number): string {
  const parsed = toOklch(baseColor)
  if (!parsed) return baseColor
  const clampedAlpha = Math.min(1, Math.max(0, alpha))
  return formatRgb({ ...parsed, alpha: clampedAlpha }) ?? baseColor
}

/**
 * Warm-dusk accent anchors used by the Lofi Dusk presets. Exposed so custom
 * theme generation and preview swatches share one definition.
 */
export const LOFI_DUSK_ACCENTS: Record<ThemeMode, { accent: string; accentSoft: string }> = {
  dark: { accent: '#b07a5c', accentSoft: '#d9b38c' },
  light: { accent: '#b07a5c', accentSoft: '#d9b38c' },
}
