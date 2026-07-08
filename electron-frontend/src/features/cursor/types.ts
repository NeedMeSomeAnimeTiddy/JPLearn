export type CursorMode = 'system' | 'custom' | 'animated'
export type CursorTheme = 'classic' | 'sakura' | 'ink_brush' | 'neon_dot'

export interface CursorSettings {
  mode: CursorMode
  theme: CursorTheme
  size: number
  color: string | null
}
