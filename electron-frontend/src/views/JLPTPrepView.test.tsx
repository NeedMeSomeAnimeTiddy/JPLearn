import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JLPTPrepView } from './JLPTPrepView'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function levelReadiness(overrides: Partial<JLPTLevelReadiness> = {}): JLPTLevelReadiness {
  return {
    level: 'n5',
    mastered_vocab: 0,
    total_vocab: 100,
    mastered_kanji: 0,
    total_kanji: 80,
    readiness_pct: 0,
    is_ready: false,
    pass_mark: 60,
    vocab_grammar_section_max: 120,
    vocab_grammar_pass_mark: 38,
    ...overrides,
  }
}

type JLPTLevelReadiness = {
  level: 'n5' | 'n4' | 'n3' | 'n2' | 'n1'
  mastered_vocab: number
  total_vocab: number
  mastered_kanji: number
  total_kanji: number
  readiness_pct: number
  is_ready: boolean
  pass_mark: number
  vocab_grammar_section_max: number
  vocab_grammar_pass_mark: number
}

function readinessPayload(levels: Partial<Record<'n5' | 'n4' | 'n3' | 'n2' | 'n1', JLPTLevelReadiness>>) {
  return {
    recommended_target: 'n5' as const,
    levels: {
      n5: levelReadiness({ level: 'n5' }),
      n4: levelReadiness({ level: 'n4' }),
      n3: levelReadiness({ level: 'n3' }),
      n2: levelReadiness({ level: 'n2' }),
      n1: levelReadiness({ level: 'n1' }),
      ...levels,
    },
  }
}

function question(overrides: Partial<{ card_id: number; meaning: string; distractors: string[] }> = {}) {
  const meaning = overrides.meaning ?? 'one'
  return {
    card_id: overrides.card_id ?? 1,
    deck: 'kanji_n5',
    question_type: 'meaning_match',
    level: 'n5' as const,
    card: { id: overrides.card_id ?? 1, character: '一', romaji: 'ichi', meaning, tags: [], example_sentence: null },
    distractor_meanings: overrides.distractors ?? ['two', 'three', 'four'],
    distractor_card_ids: [2, 3, 4],
  }
}

function installDesktopApi(overrides: Record<string, unknown> = {}) {
  const api = {
    getJLPTReadiness: async () => readinessPayload({}),
    getJLPTExamHistory: async () => ({ results: [] }),
    buildJLPTExamQueue: async () => ({ level: 'n5' as const, mode: 'diagnostic' as const, questions: [question()] }),
    saveJLPTExamResult: async () => ({ ok: true, id: 1 }),
    recordGameResult: async () => ({ ok: true, card_id: 1, repetitions: 0, interval: 1, next_review: '2026-01-01', ease_factor: 2.5 }),
    ...overrides,
  }
  // @ts-expect-error partial desktop API is sufficient for this view's calls
  window.jplearnDesktop = api
  return api
}

describe('JLPTPrepView', () => {
  /* ================================================================================================
     WHAT THIS VIEW IS FOR NOW. It used to open on a readiness dashboard -- five level cards, four
     mode buttons on each -- which is exactly what the menu's ASCENT and EXAM LEVEL screens draw, so
     pressing "Diagnostic" there brought you here to press "Diagnostic" again. The dashboard is gone
     and this view is entered with the level and the mode already decided.

     The three tests that covered the dashboard's LOCK RULE did not go with it: that rule lives in
     `ascentRungs` now, and it is tested there, in `L3.test.tsx`. A rule that moves needs its test
     to move, not to be deleted.
     ================================================================================================ */

  const show = (over: Partial<{ level: 'n5' | 'n4'; mode: 'diagnostic' | 'mock_exam'; onBack: () => void }> = {}) =>
    render(
      <JLPTPrepView
        level={over.level ?? 'n5'}
        mode={over.mode ?? 'diagnostic'}
        onBack={over.onBack ?? vi.fn()}
      />,
    )

  it('builds the exam on arrival, without being asked a second time', async () => {
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n5' as const, mode: 'diagnostic' as const, questions: [question({ meaning: 'one' })],
    }))
    installDesktopApi({ buildJLPTExamQueue })

    show()

    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n5', 'diagnostic', 20))
    expect(await screen.findByRole('button', { name: 'one' })).toBeTruthy()
  })

  it('carries the level and the mode it was given, not a default', async () => {
    /* the old view defaulted to n5 and mock_exam because it had a dashboard to change them on;
       there is no dashboard now, so a wrong default would be an unfixable wrong exam */
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n4' as const, mode: 'mock_exam' as const, questions: [question()],
    }))
    installDesktopApi({ buildJLPTExamQueue })

    show({ level: 'n4', mode: 'mock_exam' })

    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n4', 'mock_exam', 30))
  })

  it('says why there is no exam rather than showing an empty one', async () => {
    installDesktopApi({
      buildJLPTExamQueue: async () => ({ level: 'n5' as const, mode: 'diagnostic' as const, questions: [] }),
    })

    show()

    expect((await screen.findByRole('alert')).textContent).toContain('No questions available')
  })

  it('shows an alert banner when readiness fails to load', async () => {
    /* readiness is still read here -- the results panel projects a mock score off it */
    installDesktopApi({
      getJLPTReadiness: async () => { throw new Error('network down') },
      buildJLPTExamQueue: async () => ({ level: 'n5' as const, mode: 'diagnostic' as const, questions: [] }),
    })

    show()

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert').map((a) => a.textContent ?? '')
      expect(alerts.some((t) => t.includes('network down'))).toBe(true)
    })
  })

  it('runs a full exam, records the result, and shows the results panel with retry/drill actions', async () => {
    const saveJLPTExamResult = vi.fn(async () => ({ ok: true, id: 1 }))
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n5' as const, mode: 'diagnostic' as const, questions: [question({ meaning: 'one' })],
    }))
    installDesktopApi({ buildJLPTExamQueue, saveJLPTExamResult })

    show()

    fireEvent.click(await screen.findByRole('button', { name: 'one' }))

    await waitFor(() => {
      expect(saveJLPTExamResult).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'n5', mode: 'diagnostic', correct: 1, questionsAnswered: 1, accuracy: 1 }),
      )
    })

    expect(await screen.findByText('1 OF 1 RIGHT')).toBeTruthy()
    /* the per-cent is `100<sup>%</sup>`, and `getByText` reads only an element's own text nodes --
       so it is asked for as the figure it is rather than as a string that spans two elements */
    expect(document.querySelector('.rd-score b')?.textContent).toBe('100%')

    buildJLPTExamQueue.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /SIT IT AGAIN/ }))
    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n5', 'diagnostic', 20))
  })

  it('drills weak areas from the results panel', async () => {
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n5' as const, mode: 'diagnostic' as const, questions: [question({ meaning: 'one' })],
    }))
    installDesktopApi({ buildJLPTExamQueue })

    show()

    fireEvent.click(await screen.findByRole('button', { name: 'one' }))
    await screen.findByRole('button', { name: /DRILL THE WEAK AREAS/ })

    buildJLPTExamQueue.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /DRILL THE WEAK AREAS/ }))
    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n5', 'weak_area_drill', 30))
  })

  it('does not rebuild the exam when a retry changes the mode under it', async () => {
    /* the start-on-arrival effect reads `level` and `mode`, and a drill changes what the view is
       running -- if that effect fired again it would throw away the drill and re-run the original */
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n5' as const, mode: 'diagnostic' as const, questions: [question({ meaning: 'one' })],
    }))
    installDesktopApi({ buildJLPTExamQueue })

    show()
    fireEvent.click(await screen.findByRole('button', { name: 'one' }))
    await screen.findByRole('button', { name: /DRILL THE WEAK AREAS/ })
    fireEvent.click(screen.getByRole('button', { name: /DRILL THE WEAK AREAS/ }))

    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n5', 'weak_area_drill', 30))
    expect(buildJLPTExamQueue).toHaveBeenCalledTimes(2)
  })

  /* ================================================================================================
     THE TWO THINGS THE OLD RUNNER GOT WRONG, both of which the sheet made visible by printing the
     keys on the screen and the clock in the crown. */

  it('answers on the number keys the hint row says answer', async () => {
    /* the old runner drew 1-4 on nothing and bound no keys at all -- the numbers on the slips were
       decoration. The sheet prints `1-4 TO ANSWER` on the slab and in the hint row, so they have to */
    const saveJLPTExamResult = vi.fn(async () => ({ ok: true, id: 1 }))
    installDesktopApi({
      saveJLPTExamResult,
      buildJLPTExamQueue: async () => ({
        level: 'n5' as const,
        mode: 'diagnostic' as const,
        /* alphabetical, so the slips read four / one / three / two and the answer is the second */
        questions: [question({ meaning: 'one', distractors: ['two', 'three', 'four'] })],
      }),
    })

    show()
    await screen.findByRole('button', { name: 'one' })

    fireEvent.keyDown(window, { key: '2' })

    await waitFor(() => {
      expect(saveJLPTExamResult).toHaveBeenCalledWith(expect.objectContaining({ correct: 1 }))
    })
  })

  it('reports the answers it has when the mock clock runs out, not zero', async () => {
    /* THE BUG THIS REPLACES: the countdown's interval closed over `correct` at mount, so whatever
       you had answered, a timed-out mock exam was saved as nought right. Nothing on the old screen
       showed the clock's own reading either -- it was a bar. */
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const saveJLPTExamResult = vi.fn(async () => ({ ok: true, id: 1 }))
      installDesktopApi({
        saveJLPTExamResult,
        buildJLPTExamQueue: async () => ({
          level: 'n5' as const,
          mode: 'mock_exam' as const,
          questions: [
            question({ card_id: 1, meaning: 'one' }),
            question({ card_id: 2, meaning: 'five', distractors: ['six', 'seven', 'eight'] }),
          ],
        }),
      })

      show({ mode: 'mock_exam' })
      fireEvent.click(await screen.findByRole('button', { name: 'one' }))

      /* past the reveal, onto question two, and then let the whole half hour go by */
      await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 2000) })

      expect(saveJLPTExamResult).toHaveBeenCalledWith(
        expect.objectContaining({ correct: 1, questionsAnswered: 1, accuracy: 1 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('goes back to the ladder it came from, since there is nothing below it any more', async () => {
    const onBack = vi.fn()
    installDesktopApi({
      buildJLPTExamQueue: async () => ({ level: 'n5' as const, mode: 'diagnostic' as const, questions: [] }),
    })

    show({ onBack })

    fireEvent.click(await screen.findByRole('button', { name: 'Back to the exam ladder' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
