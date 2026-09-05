import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Daily } from './components/Daily'
import { dailyNote, dailyRows } from './daily'
import type { DailyGamesStatePayload } from '../../generated/types'
import type { DailyGamesSessionDependencies } from '../daily-games'

/* ==================================================================================================
   THE DAILY ROAD. What these hold onto: the four are counted off the day rather than assumed, a
   puzzle already played opens as practice rather than as today's, and a road that cannot read the
   day says so instead of drawing four empty tablets as if they were untouched.
   ================================================================================================== */

const word = { deck_slug: 'vocab_n5', deck_name: 'N5', card_id: 1, character: '猫', romaji: 'neko', meaning: 'cat', source: 'deck' }

function state(over: Partial<DailyGamesStatePayload> = {}): DailyGamesStatePayload {
  return {
    pool: { day: '2026-07-15', algorithm_version: 1, game_seeds: {}, words: [word] },
    streak: { last_completed_day: null, current_streak_days: 3, best_streak_days: 5, freezes_available: 0, freeze_month: null },
    attempts: [],
    progress: { attempt_count: 0, completed_daily_game_types: [], missed_words: [] },
    ...over,
  } as DailyGamesStatePayload
}

const attempt = (over: Record<string, unknown> = {}) => ({
  attempt_id: 1, pool_day: '2026-07-15', game_type: 'crossword', mode: 'daily',
  score: 8, completed: true, duration_seconds: null, completed_at_utc: '2026-07-15T00:00:00+00:00',
  outcomes: [
    { pool_position: 0, outcome: 'correct' },
    { pool_position: 1, outcome: 'correct' },
    { pool_position: 2, outcome: 'incorrect' },
    { pool_position: 3, outcome: 'correct' },
  ],
  ...over,
})

function deps(over: Partial<DailyGamesSessionDependencies> = {}): DailyGamesSessionDependencies {
  return {
    getState: async () => state(),
    createPracticeSeed: async () => ({ seed: 1 }),
    recordAttempt: async () => state(),
    now: () => new Date('2026-07-15T09:00:00'),
    ...over,
  } as DailyGamesSessionDependencies
}

const show = (over: Partial<Parameters<typeof Daily>[0]> = {}) => render(
  <Daily onPlay={vi.fn()} onUp={vi.fn()} dependencies={deps()} {...over} />,
)

const tablets = () => [...document.querySelectorAll('.pa-row')].map((r) => (r.textContent ?? '').trim())
const hero = () => document.querySelector('.pa-here')?.textContent ?? ''

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('dailyRows', () => {
  it('names all four whether or not the day has been read', () => {
    expect(dailyRows(null).map((r) => [r.no, r.en]))
      .toEqual([['01', 'CROSSWORD'], ['02', 'WORD SEARCH'], ['03', 'MATCH PAIRS'], ['04', 'TYPING BLITZ']])
    expect(dailyRows(null).every((r) => r.pct === null && !r.done)).toBe(true)
  })

  it('counts the per-cent off the outcomes rather than off the score', () => {
    /* four games do not share a currency: a crossword's score and a blitz's are different numbers.
       Right-out-of-asked is the one figure that means the same thing on all four. */
    const rows = dailyRows(state({ attempts: [attempt()] } as Partial<DailyGamesStatePayload>))
    expect(rows[0].pct).toBe(75)
    expect(rows[0].count).toBe('3 OF 4 RIGHT')
  })

  it('falls back to the clock when a game reports no per-word outcomes', () => {
    const rows = dailyRows(state({
      attempts: [attempt({ game_type: 'typing_blitz', outcomes: [], duration_seconds: 44 })],
    } as Partial<DailyGamesStatePayload>))
    expect(rows[3].count).toBe('44s')
  })

  it('keeps yesterday out of today', () => {
    const rows = dailyRows(state({
      attempts: [attempt({ pool_day: '2026-07-14' })],
    } as Partial<DailyGamesStatePayload>))
    expect(rows[0].pct).toBeNull()
  })

  it('says nothing about a streak of nought rather than printing one', () => {
    const none = state({ streak: { last_completed_day: null, current_streak_days: 0, best_streak_days: 0, freezes_available: 0, freeze_month: null } } as Partial<DailyGamesStatePayload>)
    expect(dailyNote(dailyRows(none), none)).not.toContain('STREAK')
    expect(dailyNote(dailyRows(state()), state())).toContain('3 DAY STREAK')
  })
})

describe('Daily', () => {
  it('draws four tablets and stands on the first', async () => {
    show()
    await waitFor(() => expect(tablets().length).toBe(4))
    expect(tablets()[0]).toContain('クロスワード')
    expect(document.querySelector('.pa-row.on')?.textContent).toContain('CROSSWORD')
    expect(hero()).toContain('NOT PLAYED TODAY')
  })

  it('walks the four with the arrows', async () => {
    show()
    await waitFor(() => expect(tablets().length).toBe(4))
    fireEvent.keyDown(document.querySelector('.pa-course')!, { key: 'ArrowDown' })
    expect(document.querySelector('.pa-row.on')?.textContent).toContain('WORD SEARCH')
  })

  it('opens an unplayed puzzle as today’s, and a played one as practice', async () => {
    const onPlay = vi.fn()
    show({
      onPlay,
      dependencies: deps({
        getState: async () => state({
          progress: { attempt_count: 1, completed_daily_game_types: ['crossword'], missed_words: [] },
          attempts: [attempt()],
        } as Partial<DailyGamesStatePayload>),
      }),
    })
    await waitFor(() => expect(tablets().length).toBe(4))

    /* THE MODE SWITCH THE HUB CARRIED IS THE TABLET YOU ARE ON. */
    fireEvent.click(document.querySelector('.pa-row.on')!)
    expect(onPlay).toHaveBeenCalledWith('crossword', 'practice')

    fireEvent.keyDown(document.querySelector('.pa-course')!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.querySelector('.pa-course')!, { key: 'Enter' })
    expect(onPlay).toHaveBeenLastCalledWith('word_search', 'daily')
  })

  it('needs two presses on a tablet it is not standing on', async () => {
    const onPlay = vi.fn()
    show({ onPlay })
    await waitFor(() => expect(tablets().length).toBe(4))

    const rows = [...document.querySelectorAll('.pa-row')]
    fireEvent.click(rows[2])
    expect(onPlay).not.toHaveBeenCalled()
    fireEvent.click([...document.querySelectorAll('.pa-row')][2])
    expect(onPlay).toHaveBeenCalledWith('match_pairs', 'daily')
  })

  it('says why there are no puzzles rather than offering four that cannot open', async () => {
    const onPlay = vi.fn()
    show({
      onPlay,
      dependencies: deps({ getState: async () => state({ pool: { day: '2026-07-15', algorithm_version: 1, game_seeds: {}, words: [] } } as Partial<DailyGamesStatePayload>) }),
    })
    await waitFor(() => {
      expect(document.querySelector('.pj-empty')?.textContent).toContain('NOTHING IN TODAY')
    })
    fireEvent.click(document.querySelector('.pa-row.on')!)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('offers a way to ask again when the day could not be read', async () => {
    let tries = 0
    show({
      dependencies: deps({
        getState: async () => {
          tries += 1
          throw new Error('bridge is down')
        },
      }),
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('bridge is down'))
    expect(document.querySelector('.pa-run')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }))
    await waitFor(() => expect(tries).toBeGreaterThan(1))
  })

  it('counts the day on the heading rather than on a badge of its own', async () => {
    show({
      dependencies: deps({
        getState: async () => state({
          progress: { attempt_count: 2, completed_daily_game_types: ['crossword', 'word_search'], missed_words: [] },
        } as Partial<DailyGamesStatePayload>),
      }),
    })
    await waitFor(() => {
      expect(document.querySelector('.pj-note')?.textContent).toContain('2 OF 4 DONE TODAY')
    })
    expect(document.querySelector('.pj-note')?.textContent).toContain('3 DAY STREAK')
  })
})
