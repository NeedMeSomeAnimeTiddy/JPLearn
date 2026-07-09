import type { KeyboardShortcut } from './types'

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'Ctrl + ,', description: 'Open Settings', context: 'global' },
  { key: 'Escape', description: 'Close modal / go back', context: 'global' },

  { key: '1 – 5', description: 'Jump to script hub (Hiragana → Grammar)', context: 'home' },
  { key: '6', description: 'Open Study Overview', context: 'home' },
  { key: '7', description: 'Jump to Sentence Examples', context: 'home' },

  { key: 'Enter', description: 'Skip feedback delay', context: 'minigame' },
  { key: 'F', description: 'Toggle fullscreen focus mode', context: 'minigame' },
  { key: 'Space / H', description: 'Advance hint', context: 'minigame' },
  { key: 'P', description: 'Replay audio prompt', context: 'minigame' },

  { key: '← → / ↑ ↓', description: 'Navigate multiple-choice options', context: 'minigame_mc' },
  { key: 'Enter', description: 'Submit selected option', context: 'minigame_mc' },
  { key: '1 – 4', description: 'Select & submit option by number', context: 'minigame_mc' },

  { key: '← →', description: 'Scroll script carousel', context: 'carousel' },
  { key: 'Enter / Space', description: 'Play selected script', context: 'carousel' },
]

export const CONTEXT_LABELS: Record<KeyboardShortcut['context'], string> = {
  global: 'Global',
  home: 'Home View',
  minigame: 'Minigame',
  minigame_mc: 'Minigame — Multiple Choice',
  carousel: 'Script Carousel',
}
