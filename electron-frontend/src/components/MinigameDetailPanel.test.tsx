import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MinigameDetailPanel } from './MinigameDetailPanel'
import type { MinigameStats } from '../types'
import '@testing-library/jest-dom/vitest'

const baseStats: MinigameStats = {
  attempted: 10,
  correct: 7,
  currentStreak: 3,
  bestStreak: 5,
  points: 42,
}

describe('MinigameDetailPanel', () => {
  it('renders title, description, and Play button', () => {
    render(
      <MinigameDetailPanel
        gameKey="romaji_sprint"
        title="Romaji Sprint"
        description="Type the romaji..."
        stats={baseStats}
        locked={false}
        lockReason={null}
        difficultyLevel="easy"
        accuracy={70}
        onPlay={vi.fn()}
      />
    )
    expect(screen.getByText('Romaji Sprint')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('Play')).toBeInTheDocument()
  })

  it('shows stats when not locked and stats exist', () => {
    render(
      <MinigameDetailPanel
        gameKey="romaji_sprint"
        title="Romaji Sprint"
        description="..."
        stats={baseStats}
        locked={false}
        lockReason={null}
        difficultyLevel="easy"
        accuracy={70}
        onPlay={vi.fn()}
      />
    )
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('disables Play button when locked', () => {
    render(
      <MinigameDetailPanel
        gameKey="speech_recall"
        title="Speech Recall"
        description="..."
        stats={null}
        locked={true}
        lockReason="Requires speech model"
        difficultyLevel="hard"
        accuracy={0}
        onPlay={vi.fn()}
      />
    )
    expect(screen.getByText('Play').closest('button')).toBeDisabled()
    expect(screen.getByText(/requires speech model/i)).toBeInTheDocument()
  })

  it('calls onPlay when Play button clicked', () => {
    const onPlay = vi.fn()
    render(
      <MinigameDetailPanel
        gameKey="romaji_sprint"
        title="Romaji Sprint"
        description="..."
        stats={baseStats}
        locked={false}
        lockReason={null}
        difficultyLevel="easy"
        accuracy={70}
        onPlay={onPlay}
      />
    )
    fireEvent.click(screen.getByText('Play'))
    expect(onPlay).toHaveBeenCalledWith('romaji_sprint')
  })

  it('does not render stats when stats is null', () => {
    render(
      <MinigameDetailPanel
        gameKey="romaji_sprint"
        title="Romaji Sprint"
        description="..."
        stats={null}
        locked={false}
        lockReason={null}
        difficultyLevel="easy"
        accuracy={0}
        onPlay={vi.fn()}
      />
    )
    expect(screen.queryByText('Accuracy')).not.toBeInTheDocument()
  })
})
