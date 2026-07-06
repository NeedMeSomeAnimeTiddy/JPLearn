import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MinigameSelectView } from '../MinigameSelectView'
import type { MinigameKey } from '../../types'

const defaultProps = {
  navDirection: 'forward' as const,
  activeScript: 'hiragana' as const,
  activeGame: 'romaji_sprint' as MinigameKey,
  availableMinigames: ['romaji_sprint', 'meaning_match', 'character_match'] as MinigameKey[],
  minigameStats: {
    hiragana: {
      romaji_sprint: { attempted: 10, correct: 7, currentStreak: 3, bestStreak: 3, points: 50 },
      meaning_match: { attempted: 5, correct: 4, currentStreak: 2, bestStreak: 2, points: 20 },
      character_match: { attempted: 0, correct: 0, currentStreak: 0, bestStreak: 0, points: 0 },
    },
  } as any,
  activeScriptStats: { bestStreak: 5 },
  minigameLockReasons: {},
  onBack: vi.fn(),
  onSelectGame: vi.fn(),
  onPlayGame: vi.fn(),
  onOpenSettings: vi.fn(),
}

afterEach(cleanup)

describe('MinigameSelectView', () => {
  it('renders top bar with title and game count', () => {
    render(<MinigameSelectView {...defaultProps} />)
    expect(screen.getByText('Browse Minigames')).toBeTruthy()
    expect(screen.getByText(/3 games/)).toBeTruthy()
  })

  it('renders filter/sort controls', () => {
    render(<MinigameSelectView {...defaultProps} />)
    // Use getAllByText since 'Recognition' appears in filter chips and card badges
    expect(screen.getAllByText('Recognition').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Recall').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('calls onSelectGame when card is clicked', () => {
    render(<MinigameSelectView {...defaultProps} />)
    // Use getAllByText since 'Meaning Match' appears in card title and detail panel
    const matches = screen.getAllByText('Meaning Match')
    fireEvent.click(matches[0])
    expect(defaultProps.onSelectGame).toHaveBeenCalledWith('meaning_match')
  })

  it('calls onBack when back button is clicked', () => {
    render(<MinigameSelectView {...defaultProps} />)
    const backBtn = screen.getByLabelText('Back to script hub')
    fireEvent.click(backBtn)
    expect(defaultProps.onBack).toHaveBeenCalled()
  })

  it('shows empty hint in detail panel when no minigames available', () => {
    render(<MinigameSelectView {...defaultProps} availableMinigames={[]} />)
    expect(screen.getByText(/no minigames available/i)).toBeTruthy()
  })
})
