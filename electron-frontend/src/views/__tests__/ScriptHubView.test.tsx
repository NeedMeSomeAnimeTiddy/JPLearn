import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScriptHubView } from '../ScriptHubView'
import type { MinigameKey } from '../../types'

vi.mock('../../context/SessionContext', () => ({
  useSession: () => ({
    livesEnabled: false,
    leechFocusEnabled: false,
    confidenceCaptureEnabled: false,
    activeSessionLengthPreset: null,
    setSessionLength: vi.fn(),
    toggleLives: vi.fn(),
    toggleLeechFocus: vi.fn(),
    toggleConfidence: vi.fn(),
  }),
}))

const defaultProps = {
  navDirection: 'forward' as const,
  activeScript: 'hiragana' as const,
  activeGame: 'romaji_sprint' as MinigameKey,
  activeBlockIndex: 0,
  gameLoading: false,
  gameError: null,
  blockProgressWithMastery: [
    { index: 0, name: 'Block 1', sample_chars: ['あ'], unlocked: true, mastery: 0.5, card_ids: [1, 2] },
  ],
  activeBlockCards: [{ id: 1, is_leech: false }, { id: 2, is_leech: false }],
  kanjiLevelProgress: [],
  vocabLevelProgress: [],
  activeKanjiLevel: 'n5' as const,
  activeVocabLevel: 'n5' as const,
  kanjiCategoryProgress: [],
  vocabCategoryProgress: [],
  activeKanjiCategory: 'numbers_time' as const,
  activeVocabCategory: 'greetings' as const,
  learningPathExpanded: false,
  learningPathTrackRows: [],
  leechCardsLength: 0,
  activeScriptStats: { bestStreak: 5 },
  activeSectionName: 'Block 1',
  isSheet: false,
  availableMinigames: ['romaji_sprint', 'meaning_match', 'character_match'] as MinigameKey[],
  minigameStats: {
    hiragana: {
      romaji_sprint: { attempted: 10, correct: 7, currentStreak: 3, bestStreak: 3, points: 50 },
      meaning_match: { attempted: 5, correct: 4, currentStreak: 2, bestStreak: 2, points: 20 },
      character_match: { attempted: 0, correct: 0, currentStreak: 0, bestStreak: 0, points: 0 },
    },
  } as any,
  minigameLockReasons: {},
  onBack: vi.fn(),
  onOpenSettings: vi.fn(),
  onSelectBlock: vi.fn(),
  onSelectKanjiLevel: vi.fn(),
  onSelectVocabLevel: vi.fn(),
  onSelectKanjiCategory: vi.fn(),
  onSelectVocabCategory: vi.fn(),
  onToggleLearningPath: vi.fn(),
  onSelectGame: vi.fn(),
  onPlayGame: vi.fn(),
}

afterEach(cleanup)

describe('ScriptHubView — minigame grid mode', () => {
  it('renders compact mode by default (no grid, browse button present)', () => {
    render(<ScriptHubView {...defaultProps} />)
    // Hero-kicker shows block info in compact mode when blocks exist
    expect(screen.getByText(/Block 1 · 2 cards/)).toBeTruthy()
    expect(screen.getByText('Browse All Minigames')).toBeTruthy()
    // Grid elements should NOT be visible
    expect(screen.queryByText('Collapse')).toBeNull()
  })

  it('toggling browse button shows grid and hides EQ section', () => {
    render(<ScriptHubView {...defaultProps} activeGame={'' as MinigameKey} />)
    const browseBtn = screen.getByText('Browse All Minigames')
    fireEvent.click(browseBtn)
    // Now grid should be visible
    expect(screen.getByText('Collapse')).toBeTruthy()
    // Detail panel should show empty state
    expect(screen.getByText(/Select a minigame/i)).toBeTruthy()
  })

  it('collapse button returns to compact mode', () => {
    render(<ScriptHubView {...defaultProps} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getByText('Collapse')).toBeTruthy()
    fireEvent.click(screen.getByText('Collapse'))
    expect(screen.getByText('Browse All Minigames')).toBeTruthy()
    expect(screen.queryByText('Collapse')).toBeNull()
  })

  it('renders filter/sort controls in expanded mode', () => {
    render(<ScriptHubView {...defaultProps} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getAllByText('Recognition').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Recall').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onSelectGame when card is clicked in expanded mode', () => {
    const onSelectGame = vi.fn()
    render(<ScriptHubView {...defaultProps} onSelectGame={onSelectGame} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    const matches = screen.getAllByText('Meaning Match')
    fireEvent.click(matches[0])
    expect(onSelectGame).toHaveBeenCalledWith('meaning_match')
  })

  it('calls onPlayGame when play button is clicked in detail panel', () => {
    const onPlayGame = vi.fn()
    render(
      <ScriptHubView
        {...defaultProps}
        activeGame="meaning_match"
        onPlayGame={onPlayGame}
      />,
    )
    fireEvent.click(screen.getByText('Browse All Minigames'))
    const playBtn = screen.getByRole('button', { name: /play/i })
    fireEvent.click(playBtn)
    expect(onPlayGame).toHaveBeenCalledWith('meaning_match')
  })

  it('shows empty state when availableMinigames is empty', () => {
    render(<ScriptHubView {...defaultProps} availableMinigames={[]} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getByText(/no minigames available/i)).toBeTruthy()
  })

  it('shows filter-empty state with reset button when filters exclude all cards', () => {
    render(<ScriptHubView {...defaultProps} availableMinigames={['romaji_sprint']} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    const recallBtn = screen.getByRole('button', { name: 'Recall' })
    fireEvent.click(recallBtn)
    expect(screen.getByText(/no minigames match/i)).toBeTruthy()
    const resetBtn = screen.getByRole('button', { name: /reset filters/i })
    fireEvent.click(resetBtn)
    expect(screen.queryByText(/no minigames match/i)).toBeNull()
  })

  it('shows lock reason in detail panel for the locked selected game', () => {
    const lockReasons = { meaning_match: 'Complete the previous level first' } as any
    render(
      <ScriptHubView
        {...defaultProps}
        activeGame="meaning_match"
        minigameLockReasons={lockReasons}
      />,
    )
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getByText('Complete the previous level first')).toBeTruthy()
  })

  it('shows lock overlay on card for a locked minigame', () => {
    const lockReasons = { meaning_match: 'locked' } as any
    render(<ScriptHubView {...defaultProps} minigameLockReasons={lockReasons} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getAllByLabelText('Locked').length).toBeGreaterThanOrEqual(1)
  })

  it('shows detail panel with stats for selected game', () => {
    render(<ScriptHubView {...defaultProps} activeGame="meaning_match" />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getAllByText('Meaning Match').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/80%/)).toBeTruthy()
  })

  it('shows empty detail panel when no game is selected', () => {
    render(<ScriptHubView {...defaultProps} activeGame={'' as MinigameKey} />)
    fireEvent.click(screen.getByText('Browse All Minigames'))
    expect(screen.getByText(/select a minigame/i)).toBeTruthy()
  })

  it('compact mode still shows hero-kicker with block info', () => {
    render(<ScriptHubView {...defaultProps} />)
    expect(screen.getByText(/Block 1 · 2 cards/)).toBeTruthy()
  })
})
