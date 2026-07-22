import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('shows loading skeletons then renders readiness cards once data loads', async () => {
    installDesktopApi({
      getJLPTReadiness: async () => readinessPayload({
        n5: levelReadiness({ level: 'n5', readiness_pct: 42, mastered_vocab: 42, total_vocab: 100, mastered_kanji: 30, total_kanji: 80 }),
      }),
    })

    render(<JLPTPrepView onBack={vi.fn()} />)

    expect(document.querySelectorAll('.jlpt-readiness-card-skeleton').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(document.querySelectorAll('.jlpt-readiness-card-skeleton').length).toBe(0)
    })
    expect(screen.getByLabelText('42% mastered')).toBeTruthy()
  })

  it('locks a level whose predecessor is below the readiness threshold and hides its mode buttons', async () => {
    installDesktopApi({
      getJLPTReadiness: async () => readinessPayload({
        n5: levelReadiness({ level: 'n5', readiness_pct: 10 }),
      }),
    })

    render(<JLPTPrepView onBack={vi.fn()} />)

    await screen.findByText('Reach 30% readiness in JLPT N5 to unlock')
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0)
    expect(screen.queryByRole('group', { name: 'Start JLPT N4 session' })).toBeNull()
  })

  it('unlocks the next level once the threshold is met', async () => {
    installDesktopApi({
      getJLPTReadiness: async () => readinessPayload({
        n5: levelReadiness({ level: 'n5', readiness_pct: 30 }),
      }),
    })

    render(<JLPTPrepView onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Start JLPT N4 session' })).toBeTruthy()
    })
    expect(screen.queryByText('Reach 30% readiness in JLPT N5 to unlock')).toBeNull()
  })

  it('shows an alert banner when readiness fails to load', async () => {
    installDesktopApi({
      getJLPTReadiness: async () => { throw new Error('network down') },
    })

    render(<JLPTPrepView onBack={vi.fn()} />)

    expect((await screen.findByRole('alert')).textContent).toContain('network down')
  })

  it('shows an error and stays on the dashboard when no exam questions are available', async () => {
    installDesktopApi({
      buildJLPTExamQueue: async () => ({ level: 'n5' as const, mode: 'diagnostic' as const, questions: [] }),
    })

    render(<JLPTPrepView onBack={vi.fn()} />)

    const [diagnosticButton] = await screen.findAllByRole('button', { name: 'Diagnostic' })
    fireEvent.click(diagnosticButton)

    expect((await screen.findByRole('alert')).textContent).toContain('No questions available')
    expect(screen.getAllByRole('button', { name: 'Diagnostic' }).length).toBeGreaterThan(0)
  })

  it('runs a full exam, records the result, and shows the results panel with retry/drill actions', async () => {
    const saveJLPTExamResult = vi.fn(async () => ({ ok: true, id: 1 }))
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n5' as const,
      mode: 'diagnostic' as const,
      questions: [question({ meaning: 'one' })],
    }))
    installDesktopApi({ buildJLPTExamQueue, saveJLPTExamResult })

    render(<JLPTPrepView onBack={vi.fn()} />)

    const [diagnosticButton] = await screen.findAllByRole('button', { name: 'Diagnostic' })
    fireEvent.click(diagnosticButton)

    const correctChoice = await screen.findByRole('button', { name: 'one' })
    fireEvent.click(correctChoice)

    await waitFor(() => {
      expect(saveJLPTExamResult).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'n5', mode: 'diagnostic', correct: 1, questionsAnswered: 1, accuracy: 1 }),
      )
    })

    expect(await screen.findByText('1/1')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()

    buildJLPTExamQueue.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n5', 'diagnostic', 20))
  })

  it('drills weak areas from the results panel', async () => {
    const buildJLPTExamQueue = vi.fn(async () => ({
      level: 'n5' as const,
      mode: 'diagnostic' as const,
      questions: [question({ meaning: 'one' })],
    }))
    installDesktopApi({ buildJLPTExamQueue })

    render(<JLPTPrepView onBack={vi.fn()} />)

    const [diagnosticButton] = await screen.findAllByRole('button', { name: 'Diagnostic' })
    fireEvent.click(diagnosticButton)
    fireEvent.click(await screen.findByRole('button', { name: 'one' }))
    await screen.findByRole('button', { name: 'Drill Weak Areas' })

    buildJLPTExamQueue.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Drill Weak Areas' }))
    await waitFor(() => expect(buildJLPTExamQueue).toHaveBeenCalledWith('n5', 'weak_area_drill', 30))
  })

  it('calls onBack when the home button is clicked', async () => {
    const onBack = vi.fn()
    installDesktopApi()

    render(<JLPTPrepView onBack={onBack} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Back to home' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
