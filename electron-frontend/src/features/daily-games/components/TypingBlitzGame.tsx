import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import * as wanakana from 'wanakana'
import { TYPING_BLITZ_COPY, TYPING_BLITZ_DURATION_SECONDS } from '../constants'
import type { DailyGamesAttemptOutcomeInput, TypingBlitzWord } from '../types'

interface TypingBlitzGameProps {
  words: readonly TypingBlitzWord[]
  isSaving: boolean
  onComplete: (result: { score: number; targetCount: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
}

export function TypingBlitzGame({ words, isSaving, onComplete }: TypingBlitzGameProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState(TYPING_BLITZ_DURATION_SECONDS)
  const completed = useRef(false)
  const composing = useRef(false)
  const presentedIndex = useRef(0)
  const outcomes = useRef<DailyGamesAttemptOutcomeInput[]>([])
  const correctCount = useRef(0)
  const timeoutId = useRef<number | null>(null)
  const intervalId = useRef<number | null>(null)

  function stopTimer(): void {
    if (timeoutId.current !== null) window.clearTimeout(timeoutId.current)
    if (intervalId.current !== null) window.clearInterval(intervalId.current)
    timeoutId.current = null
    intervalId.current = null
  }

  useEffect(() => {
    const el = document.getElementById('typing-blitz-input') as HTMLInputElement | null
    if (!el) return
    wanakana.bind(el, { IMEMode: 'toHiragana' })
    return () => { wanakana.unbind(el) }
  }, [])

  function finish(): void {
    if (completed.current) return
    completed.current = true
    stopTimer()
    const presentedOutcomes = words
      .slice(0, presentedIndex.current + 1)
      .map(({ poolPosition }, index) => outcomes.current[index] ?? { poolPosition, outcome: 'incorrect' as const })
    onComplete({ score: correctCount.current, targetCount: words.length, outcomes: presentedOutcomes })
  }

  const finishTimer = useEffectEvent(finish)

  useEffect(() => {
    intervalId.current = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1))
    }, 1000)
    timeoutId.current = window.setTimeout(() => { finishTimer() }, TYPING_BLITZ_DURATION_SECONDS * 1000)
    return stopTimer
  }, [])

  function submit(): void {
    if (isSaving || completed.current || composing.current || !words[currentIndex]) return
    const word = words[currentIndex]
    const trimmed = input.trim()
    const targetChar = word.word.character.trim()
    const targetReading = word.word.romaji.trim()
    const isCorrect = trimmed === targetChar || wanakana.toHiragana(trimmed) === wanakana.toHiragana(targetReading)
    outcomes.current[currentIndex] = { poolPosition: word.poolPosition, outcome: isCorrect ? 'correct' : 'incorrect' }
    if (isCorrect) correctCount.current += 1
    setStatus(isCorrect ? TYPING_BLITZ_COPY.correct : TYPING_BLITZ_COPY.incorrect)
    setInput('')
    if (currentIndex + 1 === words.length) {
      finish()
      return
    }
    const nextIndex = currentIndex + 1
    presentedIndex.current = nextIndex
    setCurrentIndex(nextIndex)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && composing.current) event.preventDefault()
  }

  const current = words[currentIndex]
  if (!current) return null
  return (
    <section className="typing-blitz-game" aria-labelledby="typing-blitz-title">
      <header className="typing-blitz-header">
        <div>
          <h1 id="typing-blitz-title">{TYPING_BLITZ_COPY.title}</h1>
          <p>{TYPING_BLITZ_COPY.instructions}</p>
        </div>
        <dl className="typing-blitz-status">
          <div><dt>{TYPING_BLITZ_COPY.progress}</dt><dd>{currentIndex}/{words.length}</dd></div>
          <div><dt>{TYPING_BLITZ_COPY.timeRemaining}</dt><dd>{remainingSeconds}</dd></div>
        </dl>
      </header>
      <div className="typing-blitz-target">
        <p>{TYPING_BLITZ_COPY.target}</p>
        <strong lang="ja">{current.word.character}</strong>
        <dl>
          <div><dt>{TYPING_BLITZ_COPY.reading}</dt><dd>{current.word.romaji}</dd></div>
          <div><dt>{TYPING_BLITZ_COPY.meaning}</dt><dd>{current.word.meaning}</dd></div>
        </dl>
      </div>
      <form className="typing-blitz-form" onSubmit={handleSubmit}>
        <label htmlFor="typing-blitz-input">{TYPING_BLITZ_COPY.inputLabel}</label>
        <input id="typing-blitz-input" autoComplete="off" autoCapitalize="off" spellCheck={false} value={input} placeholder={TYPING_BLITZ_COPY.inputPlaceholder} disabled={isSaving} onChange={(event) => setInput(event.target.value)} onInput={(event) => setInput(event.currentTarget.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onKeyDown={handleKeyDown} />
        <button type="submit" className="daily-game-button is-primary" disabled={isSaving}>{TYPING_BLITZ_COPY.submit}</button>
      </form>
      <p className="typing-blitz-feedback" role="status">{status}</p>
      {isSaving ? <p className="daily-game-saving" role="status">{TYPING_BLITZ_COPY.saving}</p> : null}
    </section>
  )
}
