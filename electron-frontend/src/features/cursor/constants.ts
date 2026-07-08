import type { CursorMode, CursorTheme } from './types'

export const CURSOR_MODE_OPTIONS: Array<{ key: CursorMode; label: string; description: string }> = [
  { key: 'system', label: 'System', description: 'Native OS cursor' },
  { key: 'custom', label: 'Custom', description: 'Static themed cursor' },
  { key: 'animated', label: 'Animated', description: 'Smooth follower with effects' },
]

export const CURSOR_THEME_OPTIONS: Array<{ key: CursorTheme; label: string; description: string }> = [
  { key: 'sakura', label: 'Sakura', description: 'Cherry blossom petal' },
  { key: 'ink_brush', label: 'Ink Brush', description: 'Japanese brush tip' },
  { key: 'neon_dot', label: 'Neon Dot', description: 'Glowing dot with halo' },
  { key: 'classic', label: 'Classic', description: 'Refined pointer arrow' },
]

export const CURSOR_SIZE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Small' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Large' },
]

export const CURSOR_SIZE_MAP: Record<number, { dot: number; ring: number }> = {
  1: { dot: 6, ring: 18 },
  2: { dot: 8, ring: 24 },
  3: { dot: 10, ring: 30 },
}

export const CURSOR_HOTSPOTS: Record<CursorTheme, { x: number; y: number }> = {
  classic: { x: 4, y: 4 },
  sakura: { x: 12, y: 12 },
  ink_brush: { x: 8, y: 4 },
  neon_dot: { x: 14, y: 14 },
}

export const CURSOR_DEFAULT_SETTINGS = {
  mode: 'animated' as CursorMode,
  theme: 'neon_dot' as CursorTheme,
  size: 2,
  color: null as string | null,
}

export const CURSOR_THEME_DOT_COLORS: Record<CursorTheme, string> = {
  sakura: 'color-mix(in oklab, var(--tone-rose) 90%, var(--accent))',
  ink_brush: 'var(--text-main)',
  neon_dot: 'var(--accent)',
  classic: 'color-mix(in oklab, var(--tone-ocean) 85%, var(--accent))',
}

export const CURSOR_THEME_RING_BORDERS: Record<CursorTheme, string> = {
  sakura: 'color-mix(in oklab, var(--tone-rose) 55%, var(--text-main))',
  ink_brush: 'color-mix(in oklab, var(--text-main) 40%, var(--text-soft))',
  neon_dot: 'color-mix(in oklab, var(--accent) 62%, var(--text-main))',
  classic: 'color-mix(in oklab, var(--tone-ocean) 55%, var(--text-main))',
}
