import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MinigameView } from './MinigameView'
import { SessionProvider } from '../context/SessionContext'
import type { SessionContextValue } from '../context/SessionContext'
import type { RoundState, SessionRunReport } from '../types'

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

function runReport(overrides: Partial<SessionRunReport> = {}): SessionRunReport {
  return {
    script: 'kanji_n5',
    minigame: 'meaning_match',
    sectionName: null,
    completedAt: '23:40',
    rounds: 10,
    correct: 8,
    wrong: 2,
    accuracy: 80,
    points: 240,
    targetItems: 10,
    goalCompletionPct: 100,
    goalDelta: 0,
    livesEnabled: false,
    livesRemaining: 3,
    livesLost: 0,
    leechFocusEnabled: false,
    confidenceCaptureEnabled: false,
    confidenceCapturedCount: 0,
    averageConfidenceScore: null,
    wrongCardIds: [4, 7],
    nearMissCardIds: [],
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
    setLeechFocus: vi.fn(),
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
  menuSection: 'DRILLS' as const,
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

function renderView(
  sessionOverrides: Partial<SessionContextValue> = {},
  propOverrides: Partial<ComponentProps<typeof MinigameView>> = {},
) {
  return render(
    <SessionProvider value={sessionValue(sessionOverrides)}>
      <MinigameView {...baseProps} {...propOverrides} />
    </SessionProvider>,
  )
}

/** the slip carrying one answer, whatever state it is in — its digit is decoration, so the
    accessible name is the answer alone */
const slip = (label: string) => screen.getByRole('button', { name: label })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MinigameView — the sheet', () => {
  it('stands on the stage rather than in a cassette deck', () => {
    const { container } = renderView({ sessionActive: true, roundState: roundState() })
    expect(container.querySelector('.mn-frame')).toBeTruthy()
    expect(container.querySelector('.rd-sheet')).toBeTruthy()
    /* the old shell and every piece of its furniture */
    expect(container.querySelector('.minigame-shell')).toBeNull()
    expect(container.querySelector('.hub-crt-surface')).toBeNull()
    expect(container.querySelector('.hub-deck-badge')).toBeNull()
  })

  it('names the drill in the heading and the deck in the caption', () => {
    renderView({ sessionActive: true, roundState: roundState() }, { activeSectionName: 'Numbers' })
    expect(screen.getByText('MEANING MATCH')).toBeTruthy()
    expect(screen.getByText('KANJI N5 · NUMBERS')).toBeTruthy()
  })

  it('puts the run’s numbers in the crown, where the app keeps its own', () => {
    const { container } = renderView({
      sessionActive: true, roundState: roundState(), sessionRounds: 3, sessionScore: 2, sessionStreak: 2,
    })
    const run = container.querySelector('.rd-run') as HTMLElement
    expect(run).toBeTruthy()
    expect(run.textContent).toContain('04')
    expect(run.textContent).toContain('×2')
    expect(run.textContent).toContain('67')
  })
})

describe('MinigameView — asking', () => {
  it('renders the prompt and the four slips, submitting the one clicked', async () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: true, roundState: roundState(), submitAnswer })

    await waitFor(() => expect(screen.getByText('WHAT DOES THIS MEAN?')).toBeTruthy())
    expect(screen.getByText('一')).toBeTruthy()
    fireEvent.click(slip('two'))
    expect(submitAnswer).toHaveBeenCalledWith('two')
  })

  it('selects and submits a slip via the number-key shortcut', () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: true, roundState: roundState(), submitAnswer })

    fireEvent.keyDown(window, { key: '2' })
    expect(submitAnswer).toHaveBeenCalledWith('two')
  })

  it('walks the slips with the arrows and takes the one under the cursor on Enter', () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: true, roundState: roundState(), submitAnswer })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(submitAnswer).toHaveBeenCalledWith('two')
  })

  it('solves the prompt’s size from its own length', () => {
    const { container, rerender } = renderView({ sessionActive: true, roundState: roundState() })
    const size = () => (container.querySelector('.rd-focus') as HTMLElement).style.fontSize
    expect(size()).toBe('132px')

    rerender(
      <SessionProvider value={sessionValue({
        sessionActive: true,
        roundState: roundState({ focusText: 'きのう、としょかんでほんをかりました。' }),
      })}>
        <MinigameView {...baseProps} />
      </SessionProvider>,
    )
    expect(Number.parseInt(size(), 10)).toBeLessThan(132)
  })

  it('takes a typed answer on the modes that want one, and never draws slips for them', () => {
    const submitAnswer = vi.fn()
    const { container } = renderView({
      sessionActive: true,
      roundState: roundState({ mode: 'romaji_sprint' }),
      /* the input is controlled by the session, so the value has to come from there rather than
         from a change event a mocked setter never applies */
      roundInput: 'ichi',
      submitAnswer,
    })
    expect(container.querySelector('.rd-slips')).toBeNull()
    const input = screen.getByLabelText('Enter romaji') as HTMLInputElement
    expect(input.value).toBe('ichi')
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(submitAnswer).toHaveBeenCalledWith('ichi')
  })

  it('knocks rather than submitting nothing at all', () => {
    const submitAnswer = vi.fn()
    const { container } = renderView({
      sessionActive: true, roundState: roundState({ mode: 'typed_recall' }), submitAnswer,
    })
    fireEvent.submit(container.querySelector('form.rd-type') as HTMLFormElement)
    expect(submitAnswer).not.toHaveBeenCalled()
    expect(container.querySelector('form.rd-type')?.className).toContain('knock')
  })
})

describe('MinigameView — answered', () => {
  const answered = {
    sessionActive: true,
    roundState: roundState(),
    roundFeedback: 'Not quite.',
    roundFeedbackTone: 'error' as const,
    roundFeedbackAnswer: 'three',
  }

  it('opens the answer under the prompt instead of replacing the slips', () => {
    const { container } = renderView(answered)
    expect(container.querySelector('.rd-gloss')).toBeTruthy()
    expect(screen.getByText('NOT QUITE')).toBeTruthy()
    /* the slips are still there, carrying the verdict */
    expect(slip('one').className).toContain('right')
    expect(slip('three').className).toContain('wrong')
    expect(slip('two').className).toContain('dead')
  })

  it('says so on the sheet, so the crown’s mark is not the only signal', () => {
    const { container } = renderView(answered)
    expect(container.querySelector('.rd-sheet')?.className).toContain('said')
  })

  it('turns the slab from what you owe into what comes next', () => {
    const { container } = renderView(answered)
    const slab = container.querySelector('.rd-slab') as HTMLElement
    expect(slab.className).toContain('calm')
    expect(slab.textContent).toContain('ENTER FOR THE NEXT ONE')
  })

  it('advances on Enter', () => {
    const skipFeedback = vi.fn()
    renderView({ ...answered, isRoundResolving: true, skipFeedback })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(skipFeedback).toHaveBeenCalledOnce()
  })

  it('explains the pattern after a wrong answer on a grammar card', () => {
    renderView(
      { ...answered, roundState: roundState({ cardId: 8 }) },
      {
        activeRoundCard: {
          id: 8, character: '〜を', romaji: '〜 wo', meaning: 'Direct object marker',
          tags: ['grammar', 'n5'],
        },
      },
    )
    expect(screen.getByText('〜を — direct object marker')).toBeTruthy()
    expect(screen.getByText(/Marks the thing the verb acts on/)).toBeTruthy()
  })

  it('says nothing about grammar for a card that is not a pattern', () => {
    renderView(
      { ...answered, roundState: roundState({ cardId: 900 }) },
      {
        activeRoundCard: {
          id: 900, character: 'これは ほんです。', romaji: 'kore wa hon desu.',
          meaning: 'This is a book', tags: ['grammar', 'n5'],
        },
      },
    )
    expect(screen.queryByText(/Marks the thing the verb acts on/)).toBeNull()
  })
})

describe('MinigameView — the foot band', () => {
  it('draws one mark per card, and where you are among them', () => {
    const { container, rerender } = renderView({
      sessionActive: true, roundState: roundState(), sessionTargetItems: 5,
    })
    const ticks = () => [...container.querySelectorAll('.rd-ticks i')].map((i) => i.className)
    expect(ticks()).toEqual(['here', '', '', '', ''])

    const next = sessionValue({
      sessionActive: true, roundState: roundState({ cardId: 2 }), sessionTargetItems: 5,
      sessionRounds: 1, sessionScore: 1,
    })
    rerender(<SessionProvider value={next}><MinigameView {...baseProps} /></SessionProvider>)
    expect(ticks()).toEqual(['on', 'here', '', '', ''])
  })

  it('marks a missed card in the strip rather than only in the tally', () => {
    const { container, rerender } = renderView({
      sessionActive: true, roundState: roundState(), sessionTargetItems: 3,
    })
    const next = sessionValue({
      sessionActive: true, roundState: roundState({ cardId: 2 }), sessionTargetItems: 3,
      sessionRounds: 1, sessionScore: 0,
    })
    rerender(<SessionProvider value={next}><MinigameView {...baseProps} /></SessionProvider>)
    expect([...container.querySelectorAll('.rd-ticks i')].map((i) => i.className))
      .toEqual(['bad', 'here', ''])
  })

  it('folds into a figure rather than drawing a hundred two-pixel marks', () => {
    const { container } = renderView({
      sessionActive: true, roundState: roundState(), sessionTargetItems: 120, sessionRounds: 4,
    })
    expect(container.querySelector('.rd-ticks')).toBeNull()
    expect(screen.getByText('4 OF 120 ANSWERED')).toBeTruthy()
  })
})

describe('MinigameView — before and after the run', () => {
  it('offers Play before a session starts and starts one on click', () => {
    const startSession = vi.fn()
    renderView({ startSession })
    const play = screen.getByRole('button', { name: 'Play' })
    fireEvent.click(play)
    expect(startSession).toHaveBeenCalledOnce()
  })

  it('disables Play while the deck is loading and says so', () => {
    renderView({}, { gameLoading: true })
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Loading deck...')).toBeTruthy()
  })

  it('disables Play when there are no cards', () => {
    renderView({}, { activeRunCardsLength: 0 })
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('0 cards available')).toBeTruthy()
  })

  it('surfaces a deck error on the sheet', () => {
    renderView({}, { gameError: 'Failed to load deck' })
    expect(screen.getByText('Failed to load deck')).toBeTruthy()
  })

  it('waits visibly while a session has started but no card has arrived', () => {
    renderView({ sessionActive: true, roundState: null })
    expect(screen.getByText('Loading next card...')).toBeTruthy()
  })

  it('shows the run’s score on the same sheet, and offers the cards you missed', () => {
    const onRetry = vi.fn()
    renderView({ sessionRunReport: runReport() }, { onRetry })
    expect(screen.getByText('80')).toBeTruthy()
    expect(screen.getByText('8 OF 10 CLEAN')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /THE 2 YOU MISSED/ }))
    expect(onRetry).toHaveBeenCalledWith([4, 7])
  })

  it('offers nothing to retry when nothing was missed', () => {
    renderView({ sessionRunReport: runReport({ wrongCardIds: [], accuracy: 100, correct: 10, wrong: 0 }) })
    expect(screen.queryByRole('button', { name: /YOU MISSED/ })).toBeNull()
  })
})

describe('MinigameView — leaving and the keys', () => {
  it('leaves by the back tab', () => {
    const onBack = vi.fn()
    renderView({}, { onBack })
    fireEvent.click(screen.getByRole('button', { name: 'Leave this round' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('toggles focus mode with F', () => {
    renderView({ sessionActive: true, roundState: roundState() })
    const enter = document.documentElement.requestFullscreen as ReturnType<typeof vi.fn>
    fireEvent.keyDown(window, { key: 'f' })
    expect(enter).toHaveBeenCalled()
  })

  it('does not treat keystrokes as shortcuts when no session is active', () => {
    const submitAnswer = vi.fn()
    renderView({ sessionActive: false, roundState: null, submitAnswer })
    fireEvent.keyDown(window, { key: '1' })
    expect(submitAnswer).not.toHaveBeenCalled()
  })
})
