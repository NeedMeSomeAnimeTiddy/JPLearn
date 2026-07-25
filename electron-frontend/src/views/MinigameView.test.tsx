import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MinigameView } from './MinigameView'
import { SessionProvider } from '../context/SessionContext'
import type { SessionContextValue } from '../context/SessionContext'
import type { RoundState } from '../types'

// The feedback panel types its message out with react-type-animation, which keeps scheduling
// animation frames after the test environment tears down. None of the assertions here depend
// on the animation, so render the text directly.
vi.mock('react-type-animation', () => ({
  TypeAnimation: ({ sequence }: { sequence: (string | number)[] }) => <>{String(sequence[0] ?? '')}</>,
}))

if (typeof document.documentElement.requestFullscreen !== 'function') {
  document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve())
}
if (typeof document.exitFullscreen !== 'function') {
  document.exitFullscreen = vi.fn(() => Promise.resolve())
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function roundState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    cardId: 1,
    mode: 'meaning_match',
    audioText: '',
    exampleSentenceAudioText: null,
    surprisePrompt: false,
    curriculumStage: 1,
    chapterNumber: null,
    chapterLabel: null,
    hintText: null,
    dictionarySeedQuery: null,
    dictionaryNote: null,
    promptLabel: 'What does this mean?',
    focusText: '一',
    answer: 'one',
    options: [
      { id: 'a', label: 'one' },
      { id: 'b', label: 'two' },
      { id: 'c', label: 'three' },
      { id: 'd', label: 'four' },
    ],
    ...overrides,
  }
}

function sessionValue(overrides: Partial<SessionContextValue> = {}): SessionContextValue {
  return {
    sessionActive: false,
    roundState: null,
    roundInput: '',
    roundFeedback: null,
    roundFeedbackTone: null,
    roundFeedbackAnswer: null,
    roundFeedbackPoints: null,
    roundPerformanceLabel: null,
    roundResponseMs: null,
    roundSrsResult: null,
    roundExampleSentence: null,
    isRoundResolving: false,
    roundAdvancePending: false,
    roundAdvanceError: false,

    sessionScore: 0,
    sessionRounds: 0,
    sessionPoints: 0,
    sessionStreak: 0,
    sessionBestStreak: 0,
    sessionTargetItems: 10,
    retryTargetItems: null,
    blockSessionComplete: false,

    roundComboBonus: 0,
    roundMilestoneStreak: null,

    sessionRunReport: null,
    sessionStartPending: false,
    sessionSummaryLoading: false,
    sessionGoalError: null,
    lastSessionSummary: null,

    livesEnabled: false,
    livesRemaining: 3,

    leechFocusEnabled: false,
    confidenceCaptureEnabled: false,
    roundConfidenceScore: 0,
    activeSessionLengthPreset: null,

    upcomingCards: [],
    queueBucketCounts: null,

    voiceBusy: false,
    voiceUnavailable: false,

    answerInputRef: { current: null },

    startSession: vi.fn(),
    submitAnswer: vi.fn(),
    continueLastSession: vi.fn(),
    skipFeedback: vi.fn(),
    setRoundInput: vi.fn(),
    setRoundConfidence: vi.fn(),
    setSessionLength: vi.fn(),
    toggleLives: vi.fn(),
    toggleLeechFocus: vi.fn(),
    toggleConfidence: vi.fn(),
    playAudio: vi.fn(),
    ...overrides,
  }
}

const baseProps: ComponentProps<typeof MinigameView> = {
  navDirection: 'forward' as const,
  activeScript: 'kanji_n5' as const,
  activeGame: 'meaning_match' as const,
  activeSectionName: null,
  gameLoading: false,
  gameError: null,
  activeRunCardsLength: 20,
  voiceEnabled: false,
  showKeyboardPrompts: true,
  furiganaEnabled: false,
  furiganaAutoHideMastered: false,
  activeBlockCards: [],
  activeRoundCard: null,
  onBack: vi.fn(),
  onOpenDictionary: vi.fn(),
  onOpenSettings: vi.fn(),
  onRetry: vi.fn(),
  onHandwritingOutcome: vi.fn(),
}

function renderView(sessionOverrides: Partial<SessionContextValue> = {}, propOverrides: Partial<ComponentProps<typeof MinigameView>> = {}) {
  return render(
    <SessionProvider value={sessionValue(sessionOverrides)}>
      <MinigameView {...baseProps} {...propOverrides} />
    </SessionProvider>,
  )
}

describe('MinigameView', () => {
  it('shows Play controls before a session starts and starts a session on click', () => {
    const startSession = vi.fn()
    renderView({ startSession })

    const playButton = screen.getByRole('button', { name: 'Play' })
    expect(playButton).toBeTruthy()
    fireEvent.click(playButton)
    expect(startSession).toHaveBeenCalledOnce()
  })

  it('disables Play while the deck is loading and shows a loading message', () => {
    renderView({}, { gameLoading: true })
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Loading deck...')).toBeTruthy()
  })

  it('disables Play when there are no cards available', () => {
    renderView({}, { activeRunCardsLength: 0 })
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('0 cards available')).toBeTruthy()
  })

  it('calls onBack from the map back button', () => {
    const onBack = vi.fn()
    renderView({}, { onBack })
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to map' })[0])
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows a loading indicator once a session is active but no round has loaded yet', () => {
    renderView({ sessionActive: true, roundState: null })
    expect(screen.getByText('Loading next card...')).toBeTruthy()
  })

  it('surfaces gameError as a status line', () => {
    renderView({}, { gameError: 'Failed to load deck' })
    expect(screen.getByText('Failed to load deck')).toBeTruthy()
  })

  it('renders the active round prompt and choice options, submitting the clicked answer', async () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: true, roundState: roundState(), submitAnswer })

    await waitFor(() => expect(screen.getByText('What does this mean?')).toBeTruthy())
    const twoButton = screen.getByRole('button', { name: 'two' })
    fireEvent.click(twoButton)
    expect(submitAnswer).toHaveBeenCalledWith('two')
  })

  it('selects and submits a choice option via the number-key shortcut', () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: true, roundState: roundState(), submitAnswer })

    fireEvent.keyDown(window, { key: '2' })
    expect(submitAnswer).toHaveBeenCalledWith('two')
  })

  it('toggles focus mode with the F key', () => {
    const { container } = renderView({ sessionActive: true, roundState: roundState() })
    const shell = container.querySelector('.minigame-shell') as HTMLElement
    expect(shell.className).not.toContain('minigame-focus-mode')

    fireEvent.keyDown(window, { key: 'f' })
    expect(shell.className).toContain('minigame-focus-mode')
  })

  it('does not treat keystrokes as shortcuts when no session is active', () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: false, roundState: null, submitAnswer })
    fireEvent.keyDown(window, { key: '1' })
    expect(submitAnswer).not.toHaveBeenCalled()
  })

  describe('grammar explanations (issue #25)', () => {
    const grammarCard = {
      id: 8,
      character: '〜を',
      romaji: '〜 wo',
      meaning: 'Direct object marker',
      tags: ['grammar', 'n5'],
    }

    function renderGrammarRound(
      cardOverrides: Partial<typeof grammarCard> = {},
      sessionOverrides: Partial<SessionContextValue> = {},
    ) {
      return renderView(
        {
          sessionActive: true,
          roundState: roundState({ cardId: 8 }),
          roundFeedback: 'Not quite.',
          roundFeedbackTone: 'error',
          ...sessionOverrides,
        },
        { activeRoundCard: { ...grammarCard, ...cardOverrides } },
      )
    }

    it('explains the pattern after a wrong answer on a grammar card', () => {
      renderGrammarRound()

      expect(screen.getByRole('region', { name: /Grammar explanation/ })).toBeTruthy()
      expect(screen.getByText('〜を — direct object marker')).toBeTruthy()
      expect(screen.getByText(/Marks the thing the verb acts on/)).toBeTruthy()
      expect(screen.getByText('ごはんを たべます。')).toBeTruthy()
      expect(screen.getByText(/Intransitive verbs take が/)).toBeTruthy()
    })

    it('stays hidden when the answer was correct', () => {
      renderGrammarRound({}, { roundFeedback: 'Nice.', roundFeedbackTone: 'success' })
      expect(screen.queryByRole('region', { name: /Grammar explanation/ })).toBeNull()
    })

    it('stays hidden for cards that are not tagged grammar', () => {
      renderGrammarRound({ tags: ['kanji', 'n5'] })
      expect(screen.queryByRole('region', { name: /Grammar explanation/ })).toBeNull()
    })

    it('stays hidden for grammar-tagged cards that are not patterns', () => {
      // `sentence_examples` cards also carry the `grammar` tag, but their character is a
      // whole sentence, so no explanation exists for them.
      renderGrammarRound({ id: 900, character: 'これは ほんです。', romaji: 'kore wa hon desu.' })
      expect(screen.queryByRole('region', { name: /Grammar explanation/ })).toBeNull()
    })
  })
})
