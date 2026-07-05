import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MinigameCard } from './MinigameCard'
import type { MinigameCardData } from './MinigameCard'

const baseCard: MinigameCardData = {
  key: 'romaji_sprint',
  title: 'Romaji Sprint',
  description: 'Type the romaji reading.',
  skillGroupKey: 'recognition',
  difficultyLevel: 'easy',
  locked: false,
  lockReason: null,
}

describe('MinigameCard', () => {
  it('renders title and description', () => {
    render(<MinigameCard card={baseCard} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Romaji Sprint')).toBeInTheDocument()
    expect(screen.getByText('Type the romaji reading.')).toBeInTheDocument()
  })

  it('calls onSelect on click', () => {
    const onSelect = vi.fn()
    render(<MinigameCard card={baseCard} isSelected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByLabelText('Romaji Sprint'))
    expect(onSelect).toHaveBeenCalledWith('romaji_sprint')
  })

  it('shows selected state class', () => {
    const { container } = render(<MinigameCard card={baseCard} isSelected={true} onSelect={vi.fn()} />)
    expect(container.firstChild).toHaveClass('minigame-card--selected')
  })

  it('shows locked state and does not call onSelect', () => {
    const onSelect = vi.fn()
    const lockedCard = { ...baseCard, locked: true, lockReason: 'Speech model not installed' }
    render(<MinigameCard card={lockedCard} isSelected={false} onSelect={onSelect} />)
    const card = screen.getByLabelText(/Romaji Sprint.*locked/)
    expect(card).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(card)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('calls onPlay on double-click', () => {
    const onPlay = vi.fn()
    render(<MinigameCard card={baseCard} isSelected={false} onSelect={vi.fn()} onPlay={onPlay} />)
    fireEvent.doubleClick(screen.getByLabelText('Romaji Sprint'))
    expect(onPlay).toHaveBeenCalledWith('romaji_sprint')
  })

  it('calls onSelect on Enter key', () => {
    const onSelect = vi.fn()
    render(<MinigameCard card={baseCard} isSelected={false} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByLabelText('Romaji Sprint'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('romaji_sprint')
  })

  it('calls onSelect on Space key', () => {
    const onSelect = vi.fn()
    render(<MinigameCard card={baseCard} isSelected={false} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByLabelText('Romaji Sprint'), { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('romaji_sprint')
  })

  it('does not call onPlay on double-click when locked', () => {
    const onPlay = vi.fn()
    const lockedCard = { ...baseCard, locked: true, lockReason: 'Test' }
    render(<MinigameCard card={lockedCard} isSelected={false} onSelect={vi.fn()} onPlay={onPlay} />)
    fireEvent.doubleClick(screen.getByLabelText(/Romaji Sprint.*locked/))
    expect(onPlay).not.toHaveBeenCalled()
  })
})
