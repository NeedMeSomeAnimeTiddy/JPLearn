import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import {
  HANDWRITING_MAX_RETRIES_PER_STROKE,
  HANDWRITING_MISS_THRESHOLD,
  HANDWRITING_QUIZ_OPTIONS,
} from './constants'
import { isHandwritingOutcomeCorrect } from './utils'
import { useHandwritingQuiz } from './useHandwritingQuiz'
import type { HandwritingOutcome } from './types'

const writer = vi.hoisted(() => ({
  cancelQuiz: vi.fn(),
  quiz: vi.fn(),
  animateCharacter: vi.fn(),
}))
const createWriter = vi.hoisted(() => vi.fn(() => writer))
const loadCharacterData = vi.hoisted(() => vi.fn())

vi.mock('hanzi-writer', () => ({
  default: { create: createWriter },
}))

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>()
  return { ...actual, loadHandwritingCharacterData: loadCharacterData }
})

function QuizHarness({
  character,
  externalHintUsed = false,
  onComplete,
}: {
  character: string
  externalHintUsed?: boolean
  onComplete: (outcome: HandwritingOutcome) => void
}) {
  const { targetRef } = useHandwritingQuiz({
    character,
    disabled: false,
    externalHintUsed,
    onComplete,
  })
  return <div ref={targetRef} />
}

afterEach(() => {
  cleanup()
  writer.cancelQuiz.mockReset()
  writer.quiz.mockReset()
  writer.animateCharacter.mockReset()
  createWriter.mockClear()
  loadCharacterData.mockReset()
})

describe('useHandwritingQuiz', () => {
  it('passes substantially forgiving mouse settings to ordered-stroke validation without auto-accepting invalid strokes', async () => {
    loadCharacterData.mockResolvedValue({ strokes: ['M1'], medians: [[[0, 0]]] })
    render(<QuizHarness character="日" onComplete={vi.fn()} />)

    await waitFor(() => expect(writer.quiz).toHaveBeenCalledOnce())
    const quizOptions = writer.quiz.mock.calls[0][0]
    expect(quizOptions).toMatchObject({
      ...HANDWRITING_QUIZ_OPTIONS,
      showHintAfterMisses: HANDWRITING_MISS_THRESHOLD,
    })
    expect(quizOptions.leniency).toBe(3.2)
    expect(quizOptions.averageDistanceThreshold).toBe(600)
    expect(quizOptions.acceptBackwardsStrokes).toBe(false)
    expect(quizOptions.markStrokeCorrectAfterMisses).toBe(HANDWRITING_MAX_RETRIES_PER_STROKE)
  })

  it('allows several rejected strokes before a completed character scores correct', async () => {
    loadCharacterData.mockResolvedValue({ strokes: ['M1'], medians: [[[0, 0]]] })
    const onComplete = vi.fn()
    render(<QuizHarness character="日" onComplete={onComplete} />)
    await waitFor(() => expect(writer.quiz).toHaveBeenCalledOnce())

    act(() => writer.quiz.mock.calls[0][0].onMistake({ totalMistakes: 1, mistakesOnStroke: 1 }))
    act(() => writer.quiz.mock.calls[0][0].onMistake({ totalMistakes: 2, mistakesOnStroke: 2 }))
    act(() => writer.quiz.mock.calls[0][0].onMistake({ totalMistakes: 3, mistakesOnStroke: 3 }))
    expect(onComplete).not.toHaveBeenCalled()

    act(() => writer.quiz.mock.calls[0][0].onComplete({ totalMistakes: 3 }))
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ completed: true, mistakeCount: 3 }))
    expect(isHandwritingOutcomeCorrect(onComplete.mock.calls[0][0])).toBe(true)

  })

  it('resets its outcome and writer for each new round', async () => {
    loadCharacterData.mockResolvedValue({ strokes: ['M1'], medians: [[[0, 0]]] })
    const onComplete = vi.fn()
    const { rerender } = render(<QuizHarness character="日" onComplete={onComplete} />)
    await waitFor(() => expect(writer.quiz).toHaveBeenCalledOnce())
    act(() => writer.quiz.mock.calls[0][0].onMistake({ totalMistakes: 2, mistakesOnStroke: 2 }))

    writer.quiz.mockReset()
    rerender(<QuizHarness character="月" onComplete={onComplete} />)
    await waitFor(() => expect(writer.quiz).toHaveBeenCalledOnce())
    act(() => writer.quiz.mock.calls[0][0].onComplete({ totalMistakes: 0 }))
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ mistakeCount: 0, usedHint: false }))
    expect(createWriter).toHaveBeenCalledTimes(2)
  })

  it('advances a valid rejected curved-kana sweep with the next ordered stroke', async () => {
    const sweep = [[0, 0], [80, 10], [120, 90], [40, 170], [-100, 125], [0, 260]]
    loadCharacterData.mockResolvedValue({ strokes: ['M1', 'M2'], medians: [sweep, [[0, 0], [20, 20]]] })
    const onComplete = vi.fn()
    render(<QuizHarness character="あ" onComplete={onComplete} />)
    await waitFor(() => expect(writer.quiz).toHaveBeenCalledOnce())

    act(() => writer.quiz.mock.calls[0][0].onMistake({
      drawnPath: { points: sweep.map(([x, y]) => ({ x: x + 15, y: y - 12 })) },
      mistakesOnStroke: 1,
      strokeNum: 0,
      totalMistakes: 1,
    }))
    await waitFor(() => expect(writer.quiz).toHaveBeenCalledTimes(2))
    expect(writer.quiz.mock.calls[1][0].quizStartStrokeNum).toBe(1)

    act(() => writer.quiz.mock.calls[1][0].onComplete({ totalMistakes: 0 }))
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ completed: true, mistakeCount: 1 }))
    expect(isHandwritingOutcomeCorrect(onComplete.mock.calls[0][0])).toBe(true)
  })

  it('configures forced ordered-stroke progression after bounded failed retries', async () => {
    loadCharacterData.mockResolvedValue({ strokes: ['M1'], medians: [[[0, 0]]] })
    render(<QuizHarness character="日" onComplete={vi.fn()} />)
    await waitFor(() => expect(writer.quiz).toHaveBeenCalledOnce())

    const quizOptions = writer.quiz.mock.calls[0][0]
    expect(quizOptions.showHintAfterMisses).toBe(HANDWRITING_MISS_THRESHOLD)
    expect(quizOptions.markStrokeCorrectAfterMisses).toBe(HANDWRITING_MAX_RETRIES_PER_STROKE)
  })
})
