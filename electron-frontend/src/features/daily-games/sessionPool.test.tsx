/**
 * A Daily Games session owns the pool it opened with (audit 16, F4 and N1). A save hands the view a
 * fresh state over IPC (always a new object), and midnight brings the next day's pool; neither may
 * re-run the puzzle's setup, swap its board, or change the day its attempt is recorded against.
 *
 * Every test that goes through the view's `replaceData` pins the clock to the fixture's pool day
 * (2026-07-15): `replaceData` ignores a state for another day, which would hide the bug.
 */
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DailyGamesStatePayload } from '../../generated/types'
import type { DailyGamesAttemptRequest, DailyGamesSessionDependencies } from './types'
import { buildCrossword } from './crossword'
import { DailyGameSession } from './components/DailyGameSession'
import { DailyGameView } from './components/DailyGameView'

function poolState(day: string, words: Array<[string, string]>, seeds = { crossword: 117, match_pairs: 42, word_search: 91, typing_blitz: 24 }): DailyGamesStatePayload {
  return {
    pool: {
      day,
      algorithm_version: 1,
      game_seeds: seeds,
      words: words.map(([character, meaning], index) => ({
        deck_slug: 'vocab_n5', deck_name: 'N5 Vocabulary', card_id: index + 1, character, romaji: `r${index}`, meaning, source: 'deck',
      })),
    },
    streak: { last_completed_day: null, current_streak_days: 0, best_streak_days: 0, freezes_available: 0, freeze_month: null },
    attempts: [],
    progress: { completed_daily_game_types: [] },
  } as unknown as DailyGamesStatePayload
}

const today = poolState('2026-07-15', [['猫', 'cat'], ['犬', 'dog']])
const tomorrow = poolState('2026-07-16', [['鳥', 'bird'], ['魚', 'fish']], { crossword: 5, match_pairs: 6, word_search: 7, typing_blitz: 8 })

function dependencies(overrides: Partial<DailyGamesSessionDependencies> = {}): DailyGamesSessionDependencies {
  return {
    getState: async () => structuredClone(today),
    createPracticeSeed: async () => ({ seed: 7 }),
    /* the state comes back over IPC: always a new object, even when nothing in it changed */
    recordAttempt: async () => structuredClone(today),
    clipboard: { writeText: async () => undefined },
    now: () => new Date(2026, 6, 15, 9, 0, 0),
    ...overrides,
  }
}

const strict = (node: ReactNode) => <StrictMode>{node}</StrictMode>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function pick(character: string, meaning: string): void {
  fireEvent.click(screen.getByRole('button', { name: character }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Meanings' })).getByRole('button', { name: meaning }))
}

function spentChip(): string | null | undefined {
  return [...document.querySelectorAll('.rd-run .stat-chip')].find((chip) => chip.textContent?.includes('SPENT'))?.textContent
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a save does not re-run the puzzle\'s setup (audit 16 F4)', () => {
  it('shows the real time SPENT after the saved state comes back', async () => {
    let clock = new Date(2026, 6, 15, 9, 0, 0).getTime()
    const recordAttempt = vi.fn(async () => structuredClone(today))
    render(strict(
      <DailyGameView gameType="typing_blitz" mode="daily" onBack={vi.fn()} dependencies={dependencies({ recordAttempt, now: () => new Date(clock) })} />,
    ))
    await screen.findByLabelText(/type the japanese word/i)
    clock += 42_000
    for (let index = 0; index < 2; index += 1) {
      const shown = screen.getByLabelText(/type the japanese word/i)
      fireEvent.change(shown, { target: { value: 'wrong' } })
      fireEvent.submit(shown.closest('form')!)
    }

    await screen.findByRole('region', { name: /typing blitz complete/i })
    expect(recordAttempt).toHaveBeenCalledOnce()
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 42 }))
    await act(async () => {})
    expect(spentChip()).toContain('00:42')
  })

  it('asks for one practice seed, and the save asks for none', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 3 }))
    const recordAttempt = vi.fn(async () => structuredClone(today))
    render(<DailyGameView gameType="match_pairs" mode="practice" onBack={vi.fn()} dependencies={dependencies({ createPracticeSeed, recordAttempt })} />)

    await screen.findByRole('button', { name: '猫' })
    pick('猫', 'cat')
    pick('犬', 'dog')
    await screen.findByRole('region', { name: /match pairs complete/i })
    await act(async () => {})

    expect(recordAttempt).toHaveBeenCalledOnce()
    expect(createPracticeSeed).toHaveBeenCalledOnce()
    /* the result stays: no "preparing" plate, no re-dealt board beside it */
    expect(screen.getByRole('region', { name: /match pairs complete/i })).toBeTruthy()
  })

  it('makes no further setup, seed or clue request after a save, under StrictMode', async () => {
    const crosswordDay = poolState('2026-07-15', [['学校', 'school'], ['校門', 'school gate'], ['門前', 'in front of a gate']])
    const createPracticeSeed = vi.fn(async () => ({ seed: 117 }))
    const getCachedClues = vi.fn(async () => null)
    const generateClues = vi.fn(async () => null)
    const recordAttempt = vi.fn(async () => structuredClone(crosswordDay))
    render(strict(
      <DailyGameView
        gameType="crossword"
        mode="practice"
        onBack={vi.fn()}
        dependencies={dependencies({
          getState: async () => structuredClone(crosswordDay),
          createPracticeSeed,
          recordAttempt,
          crosswordClues: { getCachedClues, generateClues },
        })}
      />,
    ))

    const board = buildCrossword(crosswordDay.pool.words, 117)
    await screen.findAllByRole('textbox', { name: /row \d+, column \d+/i })
    await waitFor(() => expect(generateClues).toHaveBeenCalled())
    const settled = { seeds: createPracticeSeed.mock.calls.length, cache: getCachedClues.mock.calls.length, generated: generateClues.mock.calls.length }

    for (const entry of board.entries) {
      for (const [index, cell] of entry.cells.entries()) {
        const input = screen.getByRole('textbox', { name: new RegExp(`Row ${cell.row + 1}, column ${cell.column + 1}`) })
        fireEvent.change(input, { target: { value: Array.from(entry.answer)[index] } })
      }
    }
    fireEvent.click(screen.getByRole('button', { name: /check crossword/i }))
    await screen.findByRole('region', { name: /crossword complete/i })
    await act(async () => {})

    expect(recordAttempt).toHaveBeenCalledOnce()
    expect(createPracticeSeed).toHaveBeenCalledTimes(settled.seeds)
    expect(getCachedClues).toHaveBeenCalledTimes(settled.cache)
    expect(generateClues).toHaveBeenCalledTimes(settled.generated)
    expect(screen.getByRole('region', { name: /crossword complete/i })).toBeTruthy()
  })

  it('keeps a practice board when a later state changes the daily seeds', async () => {
    const createPracticeSeed = vi.fn(async () => ({ seed: 3 }))
    const deps = dependencies({ createPracticeSeed })
    const { rerender } = render(<DailyGameSession mode="practice" data={today} dependencies={deps} gameType="match_pairs" onBack={vi.fn()} />)
    await screen.findByRole('button', { name: '猫' })
    const before = [...document.querySelectorAll('.dp-tile')].map((tile) => tile.textContent)

    rerender(<DailyGameSession mode="practice" data={{ ...today, pool: { ...today.pool, game_seeds: { ...today.pool.game_seeds, match_pairs: 999 } } }} dependencies={deps} gameType="match_pairs" onBack={vi.fn()} />)
    await act(async () => {})

    expect(createPracticeSeed).toHaveBeenCalledOnce()
    expect([...document.querySelectorAll('.dp-tile')].map((tile) => tile.textContent)).toEqual(before)
  })

  it('ignores a practice seed that arrives for a cleaned-up setup, under StrictMode', async () => {
    const answers = [deferred<{ seed: number }>(), deferred<{ seed: number }>()]
    let call = 0
    const createPracticeSeed = vi.fn(() => answers[call++].promise)
    const recordAttempt = vi.fn(async (_attempt: DailyGamesAttemptRequest) => structuredClone(today))
    render(strict(<DailyGameSession mode="practice" data={today} dependencies={dependencies({ createPracticeSeed, recordAttempt })} gameType="match_pairs" onBack={vi.fn()} />))
    await waitFor(() => expect(createPracticeSeed).toHaveBeenCalledTimes(2))

    /* the live setup's seed lands first; the cleaned-up one's arrives late and must not re-deal */
    await act(async () => { answers[1].resolve({ seed: 5 }) })
    await screen.findByRole('button', { name: '猫' })
    const dealt = [...document.querySelectorAll('.dp-tile')].map((tile) => tile.textContent)
    await act(async () => { answers[0].resolve({ seed: 6 }) })
    expect([...document.querySelectorAll('.dp-tile')].map((tile) => tile.textContent)).toEqual(dealt)

    pick('猫', 'cat')
    pick('犬', 'dog')
    await screen.findByRole('region', { name: /match pairs complete/i })
    expect(createPracticeSeed).toHaveBeenCalledTimes(2)
  })

  it('ignores clues that arrive for a cleaned-up crossword request', async () => {
    const crosswordDay = poolState('2026-07-15', [['学校', 'school'], ['校門', 'school gate'], ['門前', 'in front of a gate']])
    const board = buildCrossword(crosswordDay.pool.words, 117)
    const answers = [deferred<string>(), deferred<string>()]
    let call = 0
    const generateClues = vi.fn(() => answers[call++].promise)
    const clues = (label: string) => JSON.stringify(board.entries.map((entry, index) => ({ poolPosition: entry.poolPosition, clue: `${label} clue ${index + 1}` })))
    const session = () => (
      /* a fresh clue adapter each render: the clue effect re-runs and cleans up the first request */
      <DailyGameSession mode="daily" data={crosswordDay} dependencies={dependencies({ crosswordClues: { generateClues } })} gameType="crossword" onBack={vi.fn()} />
    )
    const { rerender } = render(session())
    await waitFor(() => expect(generateClues).toHaveBeenCalledOnce())
    rerender(session())
    await waitFor(() => expect(generateClues).toHaveBeenCalledTimes(2))

    await act(async () => { answers[1].resolve(clues('Live')) })
    await screen.findByText('Live clue 1')
    await act(async () => { answers[0].resolve(clues('Stale')) })
    expect(screen.queryByText('Stale clue 1')).toBeNull()
    expect(screen.getByText('Live clue 1')).toBeTruthy()
  })
})

describe('midnight while a puzzle is open (audit 16 N1)', () => {
  /* the clock stands a moment before midnight; the view's midnight timer keeps re-arming until
     the test moves the clock to the next day */
  function midnightClock() {
    let clock = new Date(2026, 6, 15, 23, 59, 59, 900).getTime()
    return { now: () => new Date(clock), toMidnight: () => { clock = new Date(2026, 6, 16, 0, 0, 0, 100).getTime() } }
  }

  async function passMidnight(clock: ReturnType<typeof midnightClock>, getState: unknown) {
    clock.toMidnight()
    await waitFor(() => expect(getState).toHaveBeenCalledWith('2026-07-16'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  }

  for (const refresh of ['succeeds', 'fails', 'returns no words'] as const) {
    it(`keeps a partly played board and records against the session's day when the refresh ${refresh}`, async () => {
      const clock = midnightClock()
      const getState = vi.fn(async (day: string) => {
        if (day === '2026-07-15') return structuredClone(today)
        if (refresh === 'fails') throw new Error('offline')
        return refresh === 'succeeds' ? structuredClone(tomorrow) : { ...structuredClone(tomorrow), pool: { ...tomorrow.pool, words: [] } }
      })
      const recordAttempt = vi.fn(async () => structuredClone(today))
      render(strict(<DailyGameView gameType="match_pairs" mode="daily" onBack={vi.fn()} dependencies={dependencies({ getState, recordAttempt, now: clock.now })} />))

      await screen.findByRole('button', { name: '猫' })
      pick('猫', 'cat')
      await passMidnight(clock, getState)

      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByText(/loading/i)).toBeNull()
      expect(screen.queryByRole('button', { name: '鳥' })).toBeNull()
      pick('犬', 'dog')
      await screen.findByRole('region', { name: /match pairs complete/i })
      expect(recordAttempt).toHaveBeenCalledOnce()
      expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({
        day: '2026-07-15',
        outcomes: [{ poolPosition: 0, outcome: 'correct' }, { poolPosition: 1, outcome: 'correct' }],
      }))
    })
  }

  it('keeps the board while a save is in flight across midnight', async () => {
    const clock = midnightClock()
    const getState = vi.fn(async (day: string) => (day === '2026-07-15' ? structuredClone(today) : structuredClone(tomorrow)))
    const save = deferred<DailyGamesStatePayload>()
    const recordAttempt = vi.fn(() => save.promise)
    render(strict(<DailyGameView gameType="match_pairs" mode="daily" onBack={vi.fn()} dependencies={dependencies({ getState, recordAttempt, now: clock.now })} />))

    await screen.findByRole('button', { name: '猫' })
    pick('猫', 'cat')
    pick('犬', 'dog')
    expect(recordAttempt).toHaveBeenCalledOnce()
    await passMidnight(clock, getState)

    expect(screen.getByRole('button', { name: '猫' })).toBeTruthy()
    await act(async () => { save.resolve(structuredClone(today)) })
    await screen.findByRole('region', { name: /match pairs complete/i })
    expect(recordAttempt).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-07-15' }))
  })

  for (const refresh of ['succeeds', 'fails'] as const) {
    it(`retries a failed save against the session's day after midnight when the refresh ${refresh}`, async () => {
      const clock = midnightClock()
      const getState = vi.fn(async (day: string) => {
        if (day === '2026-07-15') return structuredClone(today)
        if (refresh === 'fails') throw new Error('offline')
        return structuredClone(tomorrow)
      })
      const recordAttempt = vi.fn()
        .mockRejectedValueOnce(new Error('disk unavailable'))
        .mockResolvedValueOnce(structuredClone(today))
      render(strict(<DailyGameView gameType="match_pairs" mode="daily" onBack={vi.fn()} dependencies={dependencies({ getState, recordAttempt, now: clock.now })} />))

      await screen.findByRole('button', { name: '猫' })
      pick('猫', 'cat')
      pick('犬', 'dog')
      expect((await screen.findByRole('alert')).textContent).toMatch(/disk unavailable/i)
      await passMidnight(clock, getState)

      expect(screen.getByRole('alert').textContent).toMatch(/disk unavailable/i)
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))
      await screen.findByRole('region', { name: /match pairs complete/i })
      expect(recordAttempt).toHaveBeenCalledTimes(2)
      expect(recordAttempt.mock.calls[1][0]).toEqual(recordAttempt.mock.calls[0][0])
      expect(recordAttempt.mock.calls[1][0]).toEqual(expect.objectContaining({ day: '2026-07-15' }))
    })
  }

  it('takes the new day\'s pool when the puzzle is closed and opened again', async () => {
    let day = '2026-07-15'
    const getState = vi.fn(async () => structuredClone(day === '2026-07-15' ? today : tomorrow))
    const deps = dependencies({ getState, now: () => (day === '2026-07-15' ? new Date(2026, 6, 15, 9) : new Date(2026, 6, 16, 9)) })
    const { rerender } = render(strict(<DailyGameView gameType="match_pairs" mode="daily" onBack={vi.fn()} dependencies={deps} />))
    await screen.findByRole('button', { name: '猫' })

    rerender(strict(<DailyGameView gameType={null} mode="daily" onBack={vi.fn()} dependencies={deps} />))
    day = '2026-07-16'
    rerender(strict(<DailyGameView gameType="match_pairs" mode="daily" onBack={vi.fn()} dependencies={deps} />))

    expect(await screen.findByRole('button', { name: '鳥' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '猫' })).toBeNull()
  })
})
