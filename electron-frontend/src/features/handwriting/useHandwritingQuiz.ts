import HanziWriter from 'hanzi-writer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HANDWRITING_MISS_THRESHOLD } from './constants'
import type { HandwritingOutcome, HandwritingStatus } from './types'
import { loadHandwritingCharacterData } from './utils'

interface UseHandwritingQuizOptions {
  character: string
  disabled: boolean
  onComplete: (outcome: HandwritingOutcome) => void
}

function createOutcome(): HandwritingOutcome {
  return {
    completed: false,
    mistakeCount: 0,
    usedHint: false,
    usedAnimation: false,
    gaveUp: false,
  }
}

export function useHandwritingQuiz({ character, disabled, onComplete }: UseHandwritingQuizOptions) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const outcomeRef = useRef<HandwritingOutcome>(createOutcome())
  const completedRef = useRef(false)
  const [status, setStatus] = useState<HandwritingStatus>('loading')
  const [mistakeCount, setMistakeCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const finish = useCallback((outcome: HandwritingOutcome) => {
    if (completedRef.current) return
    completedRef.current = true
    outcomeRef.current = outcome
    setStatus('complete')
    onComplete(outcome)
  }, [onComplete])

  const startQuiz = useCallback(() => {
    const writer = writerRef.current
    if (!writer || disabled || completedRef.current) return
    writer.cancelQuiz()
    void writer.quiz({
      showHintAfterMisses: HANDWRITING_MISS_THRESHOLD,
      highlightOnComplete: true,
      onMistake: ({ totalMistakes, mistakesOnStroke }) => {
        const nextOutcome = {
          ...outcomeRef.current,
          mistakeCount: totalMistakes,
          usedHint: outcomeRef.current.usedHint || mistakesOnStroke >= HANDWRITING_MISS_THRESHOLD,
        }
        outcomeRef.current = nextOutcome
        setMistakeCount(totalMistakes)
      },
      onComplete: ({ totalMistakes }) => {
        finish({ ...outcomeRef.current, completed: true, mistakeCount: totalMistakes })
      },
    })
  }, [disabled, finish])

  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    let disposed = false
    target.replaceChildren()
    writerRef.current = null
    outcomeRef.current = createOutcome()
    completedRef.current = false
    setMistakeCount(0)
    setError(null)
    setStatus('loading')

    void loadHandwritingCharacterData(character)
      .then((data) => {
        if (disposed || !targetRef.current) return
        const writer = HanziWriter.create(targetRef.current, character, {
          width: 280,
          height: 280,
          padding: 12,
          showCharacter: false,
          showOutline: false,
          strokeColor: '#f9f6e7',
          drawingColor: '#75d5c8',
          highlightColor: '#f2b95c',
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
    }
  }, [character, reloadKey])

  useEffect(() => {
    if (status === 'ready' && !disabled) startQuiz()
  }, [disabled, startQuiz, status])

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
    void writer.animateCharacter({ onComplete: startQuiz })
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
