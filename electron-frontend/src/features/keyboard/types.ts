export interface KeyboardShortcut {
  key: string
  description: string
  context: 'global' | 'home' | 'minigame' | 'minigame_mc' | 'carousel'
}
