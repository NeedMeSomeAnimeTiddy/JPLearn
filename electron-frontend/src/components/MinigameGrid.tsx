import type { ReactNode } from 'react'

interface MinigameGridProps {
  children: ReactNode
  ariaLabel?: string
}

export function MinigameGrid({ children, ariaLabel = 'Minigame grid' }: MinigameGridProps) {
  return (
    <div className="minigame-grid" role="listbox" aria-label={ariaLabel}>
      {children}
    </div>
  )
}
