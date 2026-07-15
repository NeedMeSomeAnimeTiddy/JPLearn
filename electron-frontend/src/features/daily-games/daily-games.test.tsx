import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as axeCore from 'axe-core'
import type { DailyGamesStatePayload } from '../../generated/types'
import type { DailyGamesSessionDependencies } from './types'
import { buildMatchPairs, buildTypingBlitz, buildWordSearch } from './utils'
import { buildCrossword } from './crossword'
import { DailyGameSession } from './components/DailyGameSession'
import { GameResultsOverlay } from './components/GameResultsOverlay'

const state: DailyGamesStatePayload = {
  pool: {
    day: '2026-07-15', algorithm_version: 1, game_seeds: { crossword: 117, match_pairs: 42, word_search: 91, typing_blitz: 24 },
    words: [{ deck_slug: 'vocab_n5', deck_name: 'N5 Vocabulary', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' }],
  },
  streak: { last_completed_day: null, current_streak_days: 0, best_streak_days: 0, freezes_available: 0, freeze_month: null },
  attempts: [], progress: { attempt_count: 0, completed_daily_game_types: [], missed_words: [] },
}

function dependencies(overrides: Partial<DailyGamesSessionDependencies> = {}): DailyGamesSessionDependencies {
  return {
    getState: async () => state,
    createPracticeSeed: async () => ({ seed: 7 }),
    recordAttempt: async () => state,
    clipboard: { writeText: async () => undefined },
    now: () => new Date(2026, 6, 15),
    ...overrides,
  }
}

const runAxe = (axeCore as unknown as { default?: typeof axeCore; run?: typeof axeCore.run }).default?.run ?? axeCore.run

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Daily Game lifecycle', () => {
  it('builds the same bounded Match Pairs board for a supplied seed', () => {
    const words = Array.from({ length: 15 }, (_, index) => ({ ...state.pool.words[0], card_id: index, character: `語${index}`, meaning: `word ${index}` }))
    expect(buildMatchPairs(words, 42)).toEqual(buildMatchPairs(words, 42))
    expect(buildMatchPairs(words, 42)).toHaveLength(24)
  })

  it('builds the same Typing Blitz sequence from a pool and supplied seed', () => {
    const words = Array.from({ length: 12 }, (_, index) => ({ ...state.pool.words[0], card_id: index, character: `語${index}` }))
    expect(buildTypingBlitz(words, 24)).toEqual(buildTypingBlitz(words, 24))
    expect(buildTypingBlitz(words, 24)).toHaveLength(10)
  })

  it('records one daily completion with its outcomes and shows a shareable result', async () => {
    const recordAttempt = vi.fn(async () => state)
    const clipboard = { writeText: vi.fn(async () => undefined) }
    render(<DailyGameSession mode="daily" data={state} dependencies={dependencies({ recordAttempt, clipboard })} gameType="match_pairs" onBack={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: '猫' }))
    fireEvent.click(screen.getByRole('button', { name: 'cat' }))

    expect(await screen.findByRole('region', { name: /match pairs complete/i })).toBeTruthy()
    expect(recordAttempt).toHaveBeenCalledOnce()
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({
      day: '2026-07-15', gameType: 'match_pairs', mode: 'daily', completed: true,
      outcomes: [{ poolPosition: 0, outcome: 'correct' }],
    }))

    fireEvent.click(screen.getByRole('button', { name: /share result/i }))
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledOnce())
    expect(screen.getByRole('status').textContent).toMatch(/copied/i)
  })

  it('uses the explicit practice seed and retains daily state boundaries', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 3 }))
    const recordAttempt = vi.fn(async () => state)
    render(<DailyGameSession mode="practice" data={state} dependencies={dependencies({ createPracticeSeed, recordAttempt })} gameType="match_pairs" onBack={vi.fn()} />)

    expect(await screen.findByRole('button', { name: '猫' })).toBeTruthy()
    expect(createPracticeSeed).toHaveBeenCalledWith({ day: '2026-07-15', gameType: 'match_pairs' })
    fireEvent.click(screen.getByRole('button', { name: '猫' }))
    fireEvent.click(screen.getByRole('button', { name: 'cat' }))
    await screen.findByRole('region', { name: /match pairs complete/i })
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ mode: 'practice' }))
    expect(screen.getByText(/daily progress and streak are unchanged/i)).toBeTruthy()
  })

  it('uses the daily Word Search seed and records its word outcome through recordAttempt', async () => {
    const recordAttempt = vi.fn(async () => state)
    render(<DailyGameSession mode="daily" data={state} dependencies={dependencies({ recordAttempt })} gameType="word_search" onBack={vi.fn()} />)
    const target = buildWordSearch(state.pool.words, 91).targets[0]
    const first = target.path[0]
    const last = target.path[target.path.length - 1]
    const firstCell = await screen.findByRole('button', { name: new RegExp(`Row ${first.row + 1}, column ${first.column + 1}:`) })
    fireEvent.click(firstCell)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Row ${last.row + 1}, column ${last.column + 1}:`) }))

    expect(await screen.findByRole('region', { name: /word search complete/i })).toBeTruthy()
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'word_search', mode: 'daily', outcomes: [{ poolPosition: 0, outcome: 'correct' }],
    }))
  })

  it('uses the daily Crossword seed and records only its mapped pool outcomes', async () => {
    const crosswordState: DailyGamesStatePayload = {
      ...state,
      pool: {
        ...state.pool,
        words: [
          { ...state.pool.words[0], card_id: 1, character: '学校', meaning: 'school', romaji: 'gakkou' },
          { ...state.pool.words[0], card_id: 2, character: '校門', meaning: 'school gate', romaji: 'koumon' },
          { ...state.pool.words[0], card_id: 3, character: '門前', meaning: 'in front of a gate', romaji: 'monzen' },
        ],
      },
    }
    const recordAttempt = vi.fn(async () => crosswordState)
    render(<DailyGameSession mode="daily" data={crosswordState} dependencies={dependencies({ recordAttempt })} gameType="crossword" onBack={vi.fn()} />)
    const board = buildCrossword(crosswordState.pool.words, 117)
    for (const entry of board.entries) {
      for (const [index, cell] of entry.cells.entries()) {
        const input = await screen.findByRole('textbox', { name: new RegExp(`Row ${cell.row + 1}, column ${cell.column + 1}`) })
        fireEvent.change(input, { target: { value: Array.from(entry.answer)[index] } })
      }
    }
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))

    expect(await screen.findByRole('region', { name: /crossword complete/i })).toBeTruthy()
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'crossword',
      mode: 'daily',
      outcomes: board.entries.map((entry) => ({ poolPosition: entry.poolPosition, outcome: 'correct' })),
    }))
  })

  it('uses an explicit practice Crossword seed and never records a fallback vocabulary outcome', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 7 }))
    const recordAttempt = vi.fn(async () => state)
    render(<DailyGameSession mode="practice" data={state} dependencies={dependencies({ createPracticeSeed, recordAttempt })} gameType="crossword" onBack={vi.fn()} />)
    const fallback = buildCrossword(state.pool.words, 7)
    for (const [index, cell] of fallback.entries[0].cells.entries()) {
      const input = await screen.findByRole('textbox', { name: new RegExp(`Row ${cell.row + 1}, column ${cell.column + 1}`) })
      fireEvent.change(input, { target: { value: Array.from(fallback.entries[0].answer)[index] } })
    }
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))

    expect(await screen.findByRole('region', { name: /crossword complete/i })).toBeTruthy()
    expect(createPracticeSeed).toHaveBeenCalledWith({ day: '2026-07-15', gameType: 'crossword' })
    expect(recordAttempt).not.toHaveBeenCalled()
    expect(screen.getByText(/daily progress and streak are unchanged/i)).toBeTruthy()
  })

  it('completes an unsuitable pool fallback without recording a fabricated vocabulary outcome', async () => {
    const fallbackState: DailyGamesStatePayload = {
      ...state,
      pool: { ...state.pool, words: [{ ...state.pool.words[0], character: 'あ'.repeat(13) }] },
    }
    const recordAttempt = vi.fn(async () => fallbackState)
    render(<DailyGameSession mode="daily" data={fallbackState} dependencies={dependencies({ recordAttempt })} gameType="word_search" onBack={vi.fn()} />)
    const target = buildWordSearch(fallbackState.pool.words, 91).targets[0]
    const first = target.path[0]
    const last = target.path[target.path.length - 1]

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Row ${first.row + 1}, column ${first.column + 1}:`) }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Row ${last.row + 1}, column ${last.column + 1}:`) }))

    expect(await screen.findByRole('region', { name: /word search complete/i })).toBeTruthy()
    expect(recordAttempt).not.toHaveBeenCalled()
    expect(screen.getByText(/daily progress and streak are unchanged/i)).toBeTruthy()
  })

  it('uses an explicit practice seed for Word Search', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 7 }))
    const recordAttempt = vi.fn(async () => state)
    render(<DailyGameSession mode="practice" data={state} dependencies={dependencies({ createPracticeSeed, recordAttempt })} gameType="word_search" onBack={vi.fn()} />)
    const target = buildWordSearch(state.pool.words, 7).targets[0]
    const first = target.path[0]
    const last = target.path[target.path.length - 1]
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Row ${first.row + 1}, column ${first.column + 1}:`) }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Row ${last.row + 1}, column ${last.column + 1}:`) }))

    await screen.findByRole('region', { name: /word search complete/i })
    expect(createPracticeSeed).toHaveBeenCalledWith({ day: '2026-07-15', gameType: 'word_search' })
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ gameType: 'word_search', mode: 'practice' }))
  })

  it('uses the daily Typing Blitz seed and records correct and incorrect presented words', async () => {
    const typingState: DailyGamesStatePayload = {
      ...state,
      pool: { ...state.pool, words: [state.pool.words[0], { ...state.pool.words[0], card_id: 2, character: '犬', romaji: 'inu', meaning: 'dog' }] },
    }
    const recordAttempt = vi.fn(async () => typingState)
    render(<DailyGameSession mode="daily" data={typingState} dependencies={dependencies({ recordAttempt })} gameType="typing_blitz" onBack={vi.fn()} />)
    const sequence = buildTypingBlitz(typingState.pool.words, 24)
    const input = await screen.findByLabelText(/type the japanese word/i)
    fireEvent.change(input, { target: { value: sequence[0].word.character } })
    fireEvent.submit(input.closest('form')!)
    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByRole('region', { name: /typing blitz complete/i })).toBeTruthy()
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'typing_blitz', mode: 'daily', outcomes: [
        { poolPosition: sequence[0].poolPosition, outcome: 'correct' },
        { poolPosition: sequence[1].poolPosition, outcome: 'incorrect' },
      ],
    }))
  })

  it('uses an explicit practice seed for Typing Blitz', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 7 }))
    render(<DailyGameSession mode="practice" data={state} dependencies={dependencies({ createPracticeSeed })} gameType="typing_blitz" onBack={vi.fn()} />)
    expect(await screen.findByLabelText(/type the japanese word/i)).toBeTruthy()
    expect(createPracticeSeed).toHaveBeenCalledWith({ day: '2026-07-15', gameType: 'typing_blitz' })
  })

  it('does not leave Typing Blitz when Escape is pressed during IME composition', async () => {
    const onBack = vi.fn()
    const appEscapeHandler = vi.fn()
    window.addEventListener('keydown', appEscapeHandler)
    render(<DailyGameSession mode="daily" data={state} dependencies={dependencies()} gameType="typing_blitz" onBack={onBack} />)

    fireEvent.keyDown(await screen.findByLabelText(/type the japanese word/i), { key: 'Escape', isComposing: true })

    expect(onBack).not.toHaveBeenCalled()
    expect(appEscapeHandler).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/type the japanese word/i)).toBeTruthy()
    window.removeEventListener('keydown', appEscapeHandler)
  })

  it('does not leave Crossword when Escape is pressed during IME composition', async () => {
    const onBack = vi.fn()
    const appEscapeHandler = vi.fn()
    window.addEventListener('keydown', appEscapeHandler)
    render(<DailyGameSession mode="daily" data={state} dependencies={dependencies()} gameType="crossword" onBack={onBack} />)

    const [input] = await screen.findAllByRole('textbox', { name: /row \d+, column \d+/i })
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })

    expect(onBack).not.toHaveBeenCalled()
    expect(appEscapeHandler).not.toHaveBeenCalled()
    expect(input).toBeTruthy()
    window.removeEventListener('keydown', appEscapeHandler)
  })

  it('cleans up Typing Blitz timers when navigating away', async () => {
    vi.useFakeTimers()
    const recordAttempt = vi.fn(async () => state)
    const onBack = vi.fn()
    const { rerender } = render(<DailyGameSession mode="daily" data={state} dependencies={dependencies({ recordAttempt })} gameType="typing_blitz" onBack={onBack} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /back to games/i }))
    rerender(<div />)
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(onBack).toHaveBeenCalledOnce()
    expect(recordAttempt).not.toHaveBeenCalled()
  })

  it('announces clipboard failures through the injected clipboard dependency', async () => {
    const clipboard = { writeText: vi.fn(async () => { throw new Error('Denied') }) }
    render(<GameResultsOverlay mode="practice" score={1} pairCount={1} clipboard={clipboard} onDone={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /share result/i }))
    expect((await screen.findByRole('status')).textContent).toMatch(/could not copy/i)
  })

  it('offers missed-word review only for daily results with misses and forwards the untouched payload', async () => {
    const missedWords = [{ word: { ...state.pool.words[0], deck_slug: 'vocab_food', card_id: 7 }, miss_count: 2 }]
    const onReviewMissedWords = vi.fn(async () => undefined)
    const { rerender } = render(
      <GameResultsOverlay
        mode="daily"
        score={0}
        pairCount={1}
        clipboard={{ writeText: async () => undefined }}
        onDone={vi.fn()}
        missedWords={missedWords}
        onReviewMissedWords={onReviewMissedWords}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /review missed words/i }))
    await waitFor(() => expect(onReviewMissedWords).toHaveBeenCalledWith(missedWords))

    rerender(<GameResultsOverlay mode="practice" score={0} pairCount={1} clipboard={{ writeText: async () => undefined }} onDone={vi.fn()} missedWords={missedWords} onReviewMissedWords={onReviewMissedWords} />)
    expect(screen.queryByRole('button', { name: /review missed words/i })).toBeNull()
  })

  it('forwards only misses from the completed attempt instead of aggregate historical misses', async () => {
    const words = [
      { ...state.pool.words[0], card_id: 1, character: '猫', meaning: 'cat' },
      { ...state.pool.words[0], card_id: 2, character: '犬', meaning: 'dog' },
      { ...state.pool.words[0], card_id: 3, character: '鳥', meaning: 'bird' },
    ]
    const attemptState = { ...state, pool: { ...state.pool, words } }
    const sequence = buildTypingBlitz(words, 24)
    const aggregateState = {
      ...attemptState,
      progress: {
        ...attemptState.progress,
        missed_words: words.map((word, index) => ({ word, miss_count: index + 2 })),
      },
    }
    const onReviewMissedWords = vi.fn(async () => undefined)
    render(<DailyGameSession mode="daily" data={attemptState} dependencies={dependencies({ recordAttempt: async () => aggregateState })} gameType="typing_blitz" onBack={vi.fn()} onReviewMissedWords={onReviewMissedWords} />)

    let input = await screen.findByLabelText(/type the japanese word/i)
    fireEvent.change(input, { target: { value: 'wrong' } })
    fireEvent.submit(input.closest('form')!)
    for (const item of sequence.slice(1)) {
      input = await screen.findByLabelText(/type the japanese word/i)
      fireEvent.change(input, { target: { value: item.word.character } })
      fireEvent.submit(input.closest('form')!)
    }

    fireEvent.click(await screen.findByRole('button', { name: /review missed words/i }))
    await waitFor(() => expect(onReviewMissedWords).toHaveBeenCalledWith([
      { word: sequence[0].word, miss_count: 1 },
    ]))
  })

  it('has no axe violations for the game and results states', async () => {
    const { container, rerender } = render(<DailyGameSession mode="daily" data={state} dependencies={dependencies()} gameType="match_pairs" onBack={vi.fn()} />)
    await screen.findByRole('button', { name: '猫' })
    expect((await runAxe(container)).violations).toEqual([])

    rerender(<GameResultsOverlay mode="daily" score={1} pairCount={1} clipboard={{ writeText: async () => undefined }} onDone={vi.fn()} />)
    expect((await runAxe(container)).violations).toEqual([])
  })
})
