import type { BackgroundStyle } from './types'

export const BACKGROUND_BLUR_MIN = 0
export const BACKGROUND_BLUR_MAX = 12
export const BACKGROUND_BLUR_DEFAULT = 4
export const CUSTOM_BACKGROUND_MAX_BYTES = 15 * 1024 * 1024
export const CUSTOM_BACKGROUND_MAX_EDGE = 2200
export const CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH = 6_500_000

export const BACKGROUND_OPTIONS: Array<{
  key: BackgroundStyle
  label: string
  note: string
  imagePath?: string
}> = [
  {
    key: 'classic_scene',
    label: 'No Background',
    note: 'Uses a neutral app background with no image overlay.',
  },
  {
    key: 'fuji_view',
    label: 'Fuji Outlook',
    note: 'Pagoda and mountain skyline.',
    imagePath: 'backgrounds/fuji.jpg',
  },
  {
    key: 'torii_gate',
    label: 'Water Torii',
    note: 'Floating torii at dusk on calm water.',
    imagePath: 'backgrounds/torii.jpg',
  },
  {
    key: 'temple_reflection',
    label: 'Temple Reflection',
    note: 'Temple architecture mirrored in still water.',
    imagePath: 'backgrounds/house.jpg',
  },
  {
    key: 'garden_bridge',
    label: 'Garden Bridge',
    note: 'Red bridge across deep green garden water.',
    imagePath: 'backgrounds/bridge.jpg',
  },
  {
    key: 'autumn_pond',
    label: 'Autumn Pond',
    note: 'Warm maple tones and morning light rays.',
    imagePath: 'backgrounds/lake.jpg',
  },
  {
    key: 'custom_upload',
    label: 'Custom Image',
    note: 'Use your own image from device storage.',
  },
]
