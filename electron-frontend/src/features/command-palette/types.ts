export interface Command {
  id: string
  label: string
  category: 'navigation' | 'study' | 'settings' | 'debug'
  shortcut?: string
  action: () => void
  keywords?: string[]
}

export interface CommandPaletteState {
  isOpen: boolean
  query: string
  selectedIndex: number
}
