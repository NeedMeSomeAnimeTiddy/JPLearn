import type { DifficultyLabel, ReaderSettings } from './types'

export const DIFFICULTY_LABELS: Record<DifficultyLabel, string> = {
  beginner: 'Beginner',
  elementary: 'Elementary',
}

export const DIFFICULTY_ORDER: Record<DifficultyLabel, number> = {
  beginner: 0,
  elementary: 1,
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  furiganaVisible: true,
  fontSize: 'medium',
}

export const FONT_SIZE_MAP: Record<ReaderSettings['fontSize'], string> = {
  small: '14px',
  medium: '18px',
  large: '24px',
}
