import HanziWriter from 'hanzi-writer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HANDWRITING_MISS_THRESHOLD, HANDWRITING_QUIZ_OPTIONS } from './constants'
import type { HandwritingCharacterData, HandwritingOutcome, HandwritingStatus } from './types'
import {
  isCurvedKanaStroke,
  loadHandwritingCharacterData,
  matchesCurvedKanaFallback,
  resolveHandwritingColors,
} from './utils'
import type { HandwritingColors } from './utils'

interface UseHandwritingQuizOptions {
  character: string
  disabled: boolean
  externalHintUsed: boolean
  onComplete: (outcome: HandwritingOutcome) => void
  /**
   * The three colours the writer draws with, where the surface hosting it is not the app's own
   * theme. Left out, they are resolved off the document root as before -- which is right for a
   * dark panel and wrong on the round sheet's cream paper, where `--text-main` is near-white.
   */
  colors?: HandwritingColors
  /**
   * The square the writer draws in, in CSS pixels. HanziWriter sizes its SVG by attribute and sets
   * no viewBox, so the drawing cannot be scaled down afterwards without clipping it -- a host that
   * has less room than the default 280 has to say so here.
   */
  size?: number
}

function createOutcome(usedHint = false): HandwritingOutcome {
  return {
    completed: false,
    mistakeCount: 0,
    usedHint,
    usedAnimation: false,
    gaveUp: false,
  }
}

function getHandwritingColors() {
  const root = document.documentElement
  const style = getComputedStyle(root)
  return resolveHandwritingColors(
    root.dataset.themeMode === 'light' ? 'light' : 'dark',
    {
      textMain: style.getPropertyValue('--text-main').trim(),
      toneTeal: style.getPropertyValue('--tone-teal').trim(),
      toneAmber: style.getPropertyValue('--tone-amber').trim(),
    },
  )
}

export function useHandwritingQuiz({
  character, disabled, externalHintUsed, onComplete, colors, size = 280,
}: UseHandwritingQuizOptions) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const characterDataRef = useRef<HandwritingCharacterData | null>(null)
  const outcomeRef = useRef<HandwritingOutcome>(createOutcome())
  const completedRef = useRef(false)
  const disabledRef = useRef(disabled)
  const fallbackAdvancePendingRef = useRef(false)
  const startQuizRef = useRef<(startStrokeNum?: number) => void>(() => undefined)
  const onCompleteRef = useRef(onComplete)
  const externalHintUsedRef = useRef(externalHintUsed)
  const colorsRef = useRef(colors)
  colorsRef.current = colors
  const sizeRef = useRef(size)
  sizeRef.current = size
  const [status, setStatus] = useState<HandwritingStatus>('loading')
  const [mistakeCount, setMistakeCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    disabledRef.current = disabled
    onCompleteRef.current = onComplete
  }, [disabled, onComplete])

  useEffect(() => {
    externalHintUsedRef.current = externalHintUsed
    if (externalHintUsed && !completedRef.current) {
      outcomeRef.current = { ...outcomeRef.current, usedHint: true }
    }
  }, [externalHintUsed])

  const finish = useCallback((outcome: HandwritingOutcome) => {
    if (completedRef.current) return
    completedRef.current = true
    outcomeRef.current = outcome
    setStatus('complete')
    onCompleteRef.current(outcome)
  }, [])

  const startQuiz = useCallback((startStrokeNum = 0) => {
    const writer = writerRef.current
    if (!writer || disabledRef.current || completedRef.current) return
    fallbackAdvancePendingRef.current = false
    writer.cancelQuiz()
    void writer.quiz({
      showHintAfterMisses: HANDWRITING_MISS_THRESHOLD,
      highlightOnComplete: true,
      ...HANDWRITING_QUIZ_OPTIONS,
      onMistake: ({ drawnPath, mistakesOnStroke, strokeNum, totalMistakes }) => {
        const nextMistakeCount = Math.max(outcomeRef.current.mistakeCount, totalMistakes)
        const nextOutcome = {
          ...outcomeRef.current,
          mistakeCount: nextMistakeCount,
          usedHint: outcomeRef.current.usedHint || mistakesOnStroke >= HANDWRITING_MISS_THRESHOLD,
        }
        outcomeRef.current = nextOutcome
        setMistakeCount(nextMistakeCount)

        const characterData = characterDataRef.current
        const expectedMedian = characterData?.medians[strokeNum]
        const shouldAdvanceCurvedKana =
          !fallbackAdvancePendingRef.current &&
          expectedMedian !== undefined &&
          isCurvedKanaStroke(character, expectedMedian) &&
          matchesCurvedKanaFallback(drawnPath.points, expectedMedian)

        if (!shouldAdvanceCurvedKana) return

        fallbackAdvancePendingRef.current = true
        const nextStrokeNum = strokeNum + 1
        const strokeCount = characterData?.strokes.length ?? 0
        queueMicrotask(() => {
          if (completedRef.current || disabledRef.current) return
          if (nextStrokeNum >= strokeCount) {
            writer.cancelQuiz()
            finish({ ...outcomeRef.current, completed: true, mistakeCount: nextMistakeCount })
            return
          }
          startQuizRef.current(nextStrokeNum)
        })
      },
      onComplete: () => {
        finish({ ...outcomeRef.current, completed: true, mistakeCount: outcomeRef.current.mistakeCount })
      },
      quizStartStrokeNum: startStrokeNum,
    })
  }, [character, finish])

  startQuizRef.current = startQuiz

  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    let disposed = false
    target.replaceChildren()
    writerRef.current = null
    characterDataRef.current = null
    outcomeRef.current = createOutcome(externalHintUsedRef.current)
    completedRef.current = false
    setMistakeCount(0)
    setError(null)
    setStatus('loading')

    void loadHandwritingCharacterData(character)
      .then((data) => {
        if (disposed || !targetRef.current) return
        characterDataRef.current = data
        const writer = HanziWriter.create(targetRef.current, character, {
          width: sizeRef.current,
          height: sizeRef.current,
          padding: 12,
          showCharacter: false,
          showOutline: false,
          ...(colorsRef.current ?? getHandwritingColors()),
          charDataLoader: () => data,
          onLoadCharDataError: () => {
            if (!disposed) {
              setError('The character data could not be prepared.')
              setStatus('error')
            }
          },
        })
        if (disposed) {
          writer.cancelQuiz()
          return
        }
        writerRef.current = writer
        setStatus('ready')
      })
      .catch(() => {
        if (!disposed) {
          setError('The character data is unavailable or malformed.')
          setStatus('error')
        }
      })

    return () => {
      disposed = true
      writerRef.current?.cancelQuiz()
      writerRef.current = null
      characterDataRef.current = null
    }
  }, [character, reloadKey])

  useEffect(() => {
    if (status === 'ready' && !disabledRef.current) startQuiz()
  }, [startQuiz, status])

  const retry = useCallback(() => {
    if (disabled) return
    if (status === 'error') {
      setReloadKey((value) => value + 1)
      return
    }
    if (status !== 'ready') return
    startQuiz()
  }, [disabled, startQuiz, status])

  const showAnimation = useCallback(() => {
    const writer = writerRef.current
    if (!writer || status !== 'ready' || disabled || completedRef.current) return
    outcomeRef.current = { ...outcomeRef.current, usedAnimation: true }
    writer.cancelQuiz()
    void writer.animateCharacter({ onComplete: () => startQuiz() })
  }, [disabled, startQuiz, status])

  const giveUp = useCallback(() => {
    if (status !== 'ready' || disabled) return
    writerRef.current?.cancelQuiz()
    finish({ ...outcomeRef.current, gaveUp: true, completed: false })
  }, [disabled, finish, status])

  return {
    targetRef,
    status,
    mistakeCount,
    error,
    retry,
    showAnimation,
    giveUp,
  }
}
