import type { MinigameKey } from '../types'
import { MINIGAME_ICONS } from '../constants'

export function MinigameIcon({ game }: { game: MinigameKey }) {
  const Icon = MINIGAME_ICONS[game]
  return <Icon aria-hidden="true" className="glyph-svg" strokeWidth={2.25} />
}
