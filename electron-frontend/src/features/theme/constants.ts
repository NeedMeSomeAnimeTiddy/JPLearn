import type { LucideIcon } from 'lucide-react'
import { Moon, Sun, Monitor } from 'lucide-react'
import type { ThemeKey, ThemeMode, ThemeVariableKey, ThemeSection } from './types'

export const THEME_OPTIONS: Array<{ key: ThemeKey; label: string; mode: ThemeMode }> = [
  { key: 'lofi_dusk', label: 'Lofi Dusk', mode: 'dark' },
  { key: 'harbor_mist', label: 'Harbor Mist', mode: 'dark' },
  { key: 'sakura_dawn', label: 'Sakura Dawn', mode: 'dark' },
  { key: 'forest_ink', label: 'Forest Ink', mode: 'dark' },
  { key: 'sunset_lacquer', label: 'Sunset Lacquer', mode: 'dark' },
  { key: 'midnight_neon', label: 'Midnight Neon', mode: 'dark' },
  { key: 'paper_crane', label: 'Paper Crane', mode: 'dark' },
  { key: 'matcha_stone', label: 'Matcha Stone', mode: 'dark' },
  { key: 'ocean_glass', label: 'Ocean Glass', mode: 'dark' },
  { key: 'ember_night', label: 'Ember Night', mode: 'dark' },
  { key: 'plum_garden', label: 'Plum Garden', mode: 'dark' },
  { key: 'lofi_dusk_light', label: 'Lofi Dusk Light', mode: 'light' },
  { key: 'harbor_mist_light', label: 'Harbor Mist Light', mode: 'light' },
  { key: 'sakura_dawn_light', label: 'Sakura Dawn Light', mode: 'light' },
  { key: 'sunset_lacquer_light', label: 'Sunset Lacquer Light', mode: 'light' },
  { key: 'midnight_neon_light', label: 'Midnight Neon Light', mode: 'light' },
  { key: 'paper_crane_light', label: 'Paper Crane Light', mode: 'light' },
  { key: 'ember_night_light', label: 'Ember Night Light', mode: 'light' },
  { key: 'forest_ink_light', label: 'Forest Ink Light', mode: 'light' },
  { key: 'ocean_glass_light', label: 'Ocean Glass Light', mode: 'light' },
  { key: 'plum_garden_light', label: 'Plum Garden Light', mode: 'light' },
  { key: 'matcha_stone_light', label: 'Matcha Stone Light', mode: 'light' },
  { key: 'high_contrast', label: 'High Contrast', mode: 'dark' },
  { key: 'high_contrast_light', label: 'High Contrast Light', mode: 'light' },
]

export const THEME_MODE_SECTIONS: Array<{ key: ThemeMode; label: string }> = [
  { key: 'dark', label: 'Dark Mode' },
  { key: 'light', label: 'Light Mode' },
  { key: 'auto', label: 'Auto Mode' },
]

export const DEFAULT_THEME_BY_MODE: Record<ThemeMode, ThemeKey> = {
  dark: 'lofi_dusk',
  light: 'lofi_dusk_light',
  auto: 'lofi_dusk',
}

export const THEME_MODE_ICON: Record<ThemeMode, LucideIcon> = {
  dark: Moon,
  light: Sun,
  auto: Monitor,
}

export const THEME_SWATCH_ACCENT: Record<ThemeKey, string> = {
  lofi_dusk: '#d4a56a',
  harbor_mist: '#7bc5df',
  sakura_dawn: '#f5a0b4',
  forest_ink: '#7ec99a',
  sunset_lacquer: '#f0945c',
  midnight_neon: '#6cbfff',
  paper_crane: '#c89868',
  matcha_stone: '#a4c878',
  ocean_glass: '#6cc8c4',
  ember_night: '#f08050',
  plum_garden: '#b88cf0',
  lofi_dusk_light: '#c8905c',
  harbor_mist_light: '#5aa0bc',
  sakura_dawn_light: '#d47894',
  sunset_lacquer_light: '#d07a50',
  midnight_neon_light: '#5a98d0',
  paper_crane_light: '#b88058',
  ember_night_light: '#d47454',
  forest_ink_light: '#68a87a',
  ocean_glass_light: '#5aaaa4',
  plum_garden_light: '#a070dc',
  matcha_stone_light: '#8eac5a',
  high_contrast: '#ffdd00',
  high_contrast_light: '#0055cc',
}

export const THEME_KEY_SET = new Set<ThemeKey>(THEME_OPTIONS.map((theme) => theme.key))
export const THEME_VARIABLE_KEYS: ThemeVariableKey[] = [
  '--bg-main',
  '--bg-subtle',
  '--text-main',
  '--text-soft',
  '--accent',
  '--accent-soft',
  '--accent-ink',
  '--blob-left',
  '--blob-right',
  '--blob-top',
  '--panel-bg',
  '--panel-bg-alt',
  '--panel-border',
  '--panel-shadow',
  '--tile-bg',
  '--tile-border',
  '--tile-shadow',
  '--chip-bg',
  '--chip-border',
  '--button-border',
  '--button-bg-top',
  '--button-bg-bottom',
  '--card-border',
  '--card-bg-top',
  '--card-bg-bottom',
  '--track-bg',
  '--xp-shell-border',
  '--xp-shell-bg',
  '--xp-badge-bg',
  '--xp-badge-text',
  '--xp-badge-ring',
  '--xp-badge-glow',
  '--xp-track-bg',
  '--xp-fill-start',
  '--xp-fill-end',
  '--xp-label',
  '--streak-shell-border',
  '--streak-shell-bg',
  '--streak-shell-text',
  '--streak-icon',
  '--streak-popover-border',
  '--streak-popover-glow',
  '--streak-popover-title',
  '--streak-divider',
  '--status-error',
  '--tone-teal',
  '--tone-ocean',
  '--tone-amber',
  '--tone-rose',
]

export const THEME_SECTION_DEFINITIONS: ThemeSection[] = [
  {
    id: 'surfaces',
    label: 'Background and Surfaces',
    description: 'Main app background and panel surfaces used across cards and chips.',
    keys: ['--bg-main', '--bg-subtle', '--panel-bg', '--panel-bg-alt', '--tile-bg', '--chip-bg', '--track-bg'],
  },
  {
    id: 'text',
    label: 'Text and Readability',
    description: 'Primary text, secondary text, and accent ink for readable contrast.',
    keys: ['--text-main', '--text-soft', '--accent-ink'],
  },
  {
    id: 'accents',
    label: 'Accent Glow and Highlights',
    description: 'Accent colors and ambient gradient glows used for emphasis.',
    keys: ['--accent', '--accent-soft', '--blob-left', '--blob-right', '--blob-top'],
  },
  {
    id: 'borders',
    label: 'Borders and Depth Effects',
    description: 'Panel borders and shadow depth that define component edges.',
    keys: ['--panel-border', '--tile-border', '--tile-shadow', '--chip-border', '--button-border', '--card-border', '--panel-shadow'],
  },
  {
    id: 'components',
    label: 'Buttons and Cards',
    description: 'Button and card gradient colors plus error feedback color.',
    keys: ['--button-bg-top', '--button-bg-bottom', '--card-bg-top', '--card-bg-bottom', '--status-error'],
  },
  {
    id: 'xp',
    label: 'XP Bar',
    description: 'Colors used by the home and titlebar XP indicators.',
    keys: ['--xp-shell-border', '--xp-shell-bg', '--xp-badge-bg', '--xp-badge-text', '--xp-badge-ring', '--xp-badge-glow', '--xp-track-bg', '--xp-fill-start', '--xp-fill-end', '--xp-label'],
  },
  {
    id: 'streak',
    label: 'Streak Chip',
    description: 'Colors used by the titlebar streak chip and its details popover.',
    keys: ['--streak-shell-border', '--streak-shell-bg', '--streak-shell-text', '--streak-icon', '--streak-popover-border', '--streak-popover-glow', '--streak-popover-title', '--streak-divider'],
  },
  {
    id: 'tones',
    label: 'Status and Utility Tones',
    description: 'Reusable teal, ocean, amber, and rose semantic tones.',
    keys: ['--tone-teal', '--tone-ocean', '--tone-amber', '--tone-rose'],
  },
]

export const THEME_VARIABLE_SET = new Set<ThemeVariableKey>(THEME_VARIABLE_KEYS)
export const THEME_VARIABLE_DISPLAY: Record<ThemeVariableKey, { label: string; description: string }> = {
  '--bg-main': {
    label: 'Main Background',
    description: 'The primary app background color.',
  },
  '--bg-subtle': {
    label: 'Secondary Background',
    description: 'The softer background layer used in gradients.',
  },
  '--text-main': {
    label: 'Main Text',
    description: 'The default text color for most content.',
  },
  '--text-soft': {
    label: 'Muted Text',
    description: 'Used for hints, labels, and less important text.',
  },
  '--accent': {
    label: 'Primary Accent',
    description: 'Main highlight color for active elements.',
  },
  '--accent-soft': {
    label: 'Soft Accent',
    description: 'A softer accent tone used in glow and gradients.',
  },
  '--accent-ink': {
    label: 'Accent Text',
    description: 'Text color used on accent-heavy backgrounds.',
  },
  '--blob-left': {
    label: 'Left Glow',
    description: 'Decorative ambient glow color on the left side.',
  },
  '--blob-right': {
    label: 'Right Glow',
    description: 'Decorative ambient glow color on the right side.',
  },
  '--blob-top': {
    label: 'Top Glow',
    description: 'Decorative ambient glow color near the top.',
  },
  '--panel-bg': {
    label: 'Main Panel Background',
    description: 'Background color for larger UI panels.',
  },
  '--panel-bg-alt': {
    label: 'Secondary Panel Background',
    description: 'Alternate panel/card surface background.',
  },
  '--panel-border': {
    label: 'Panel Border',
    description: 'Border color around panel containers.',
  },
  '--panel-shadow': {
    label: 'Panel Shadow',
    description: 'Shadow style for elevated panel depth.',
  },
  '--tile-bg': {
    label: 'Tile Background',
    description: 'Background for small metric or snapshot tiles.',
  },
  '--tile-border': {
    label: 'Tile Border',
    description: 'Border color for small tiles.',
  },
  '--tile-shadow': {
    label: 'Tile Shadow',
    description: 'Shadow style for elevated tile depth.',
  },
  '--chip-bg': {
    label: 'Tag Background',
    description: 'Background color for chip/tag elements.',
  },
  '--chip-border': {
    label: 'Tag Border',
    description: 'Border color for chip/tag elements.',
  },
  '--button-border': {
    label: 'Button Border',
    description: 'Border color around buttons.',
  },
  '--button-bg-top': {
    label: 'Button Gradient Top',
    description: 'Top color of button gradient fill.',
  },
  '--button-bg-bottom': {
    label: 'Button Gradient Bottom',
    description: 'Bottom color of button gradient fill.',
  },
  '--card-border': {
    label: 'Card Border',
    description: 'Border color around card elements.',
  },
  '--card-bg-top': {
    label: 'Card Gradient Top',
    description: 'Top color of card gradient fill.',
  },
  '--card-bg-bottom': {
    label: 'Card Gradient Bottom',
    description: 'Bottom color of card gradient fill.',
  },
  '--track-bg': {
    label: 'Track Background',
    description: 'Background for progress and slider tracks.',
  },
  '--xp-shell-border': {
    label: 'XP Shell Border',
    description: 'Border color around XP bar shells.',
  },
  '--xp-shell-bg': {
    label: 'XP Shell Background',
    description: 'Background behind the XP bar shell.',
  },
  '--xp-badge-bg': {
    label: 'XP Badge Background',
    description: 'Background color of the circular XP level badge.',
  },
  '--xp-badge-text': {
    label: 'XP Badge Text',
    description: 'Text color shown inside the XP level badge.',
  },
  '--xp-badge-ring': {
    label: 'XP Badge Ring',
    description: 'Ring color around the XP level badge for emphasis.',
  },
  '--xp-badge-glow': {
    label: 'XP Badge Glow',
    description: 'Glow color behind the XP level badge.',
  },
  '--xp-track-bg': {
    label: 'XP Track Background',
    description: 'Background color of the XP progress track.',
  },
  '--xp-fill-start': {
    label: 'XP Fill Gradient Start',
    description: 'Starting color of the XP fill gradient.',
  },
  '--xp-fill-end': {
    label: 'XP Fill Gradient End',
    description: 'Ending color of the XP fill gradient.',
  },
  '--xp-label': {
    label: 'XP Label Text',
    description: 'Text color used by XP percentage and value labels.',
  },
  '--streak-shell-border': {
    label: 'Streak Chip Border',
    description: 'Border color around the streak chip button.',
  },
  '--streak-shell-bg': {
    label: 'Streak Chip Background',
    description: 'Background color of the streak chip button.',
  },
  '--streak-shell-text': {
    label: 'Streak Chip Text',
    description: 'Text color of the streak chip value.',
  },
  '--streak-icon': {
    label: 'Streak Icon Color',
    description: 'Color used by the streak flame icon.',
  },
  '--streak-popover-border': {
    label: 'Streak Popover Border',
    description: 'Border color around the streak details popover.',
  },
  '--streak-popover-glow': {
    label: 'Streak Popover Glow',
    description: 'Glow color used in the streak details popover background.',
  },
  '--streak-popover-title': {
    label: 'Streak Popover Title',
    description: 'Title color in the streak details popover.',
  },
  '--streak-divider': {
    label: 'Streak Divider',
    description: 'Divider color for streak popover helper text.',
  },
  '--status-error': {
    label: 'Error Color',
    description: 'Used for errors and critical feedback.',
  },
  '--tone-teal': {
    label: 'Teal Utility Tone',
    description: 'Reusable teal tone for UI accents.',
  },
  '--tone-ocean': {
    label: 'Ocean Utility Tone',
    description: 'Reusable blue tone for UI accents.',
  },
  '--tone-amber': {
    label: 'Amber Utility Tone',
    description: 'Reusable warm warning/support tone.',
  },
  '--tone-rose': {
    label: 'Rose Utility Tone',
    description: 'Reusable rose tone for warnings and emphasis.',
  },
}
