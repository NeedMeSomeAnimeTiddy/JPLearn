import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import * as wanakana from 'wanakana'
import { RoundAsk, RoundGloss, RoundWork, promptSize } from '../../round'
import { TYPING_BLITZ_COPY, TYPING_BLITZ_DURATION_SECONDS, TYPING_BLITZ_WARN_SECONDS } from '../constants'
import type { DailyGamesAttemptOutcomeInput, PuzzleShell, TypingBlitzWord } from '../types'
import { formatClock, pad2 } from '../utils'
import { PuzzleRound, PuzzleRows } from './PuzzleRound'

/* ==================================================================================================
   TYPING BLITZ ON THE SHEET. The word is the prompt cell's specimen with its meaning and reading
   under it -- English first, since the meaning is what you read it by -- and the work cell is the
   rule you type on with your last answers under it, gold right and vermilion wrong.

   THE INPUT'S BEHAVIOUR IS UNTOUCHED. `wanakana.bind` in hiragana mode, the composition guard that
   stops Enter submitting a half-converted word, and the reading-or-word check are the same lines
   they were; what changed is the paper they are drawn on.
   ================================================================================================== */

interface TypingBlitzGameProps {
  words: readonly TypingBlitzWord[]
  isSaving: boolean
  onComplete: (result: { score: number; targetCount: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
  shell: PuzzleShell
}

interface BlitzAnswer {
  word: TypingBlitzWord
  typed: string
  correct: boolean
}

/** how many of your last answers stand under the rule before the rest become a count */
const RECENT_ROWS = 4

export function TypingBlitzGame({ words, isSaving, onComplete, shell }: TypingBlitzGameProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [answers, setAnswers] = useState<BlitzAnswer[]>([])
  const [remainingSeconds, setRemainingSeconds] = useState(TYPING_BLITZ_DURATION_SECONDS)
  const completed = useRef(false)
  const composing = useRef(false)
  const presentedIndex = useRef(0)
  const outcomes = useRef<DailyGamesAttemptOutcomeInput[]>([])
  const correctCount = useRef(0)
  const timeoutId = useRef<number | null>(null)
  const intervalId = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function stopTimer(): void {
    if (timeoutId.current !== null) window.clearTimeout(timeoutId.current)
    if (intervalId.current !== null) window.clearInterval(intervalId.current)
    timeoutId.current = null
    intervalId.current = null
  }

  useEffect(() => {
    const el = inputRef.current
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
    setAnswers((current) => [...current, { word, typed: trimmed, correct: isCorrect }])
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
  /* newest first: the answer you have just given is the one you want to see */
  const recent = answers.map((answer, index) => ({ ...answer, no: index + 1 })).reverse()
  return (
    <PuzzleRound
      shell={shell}
      run={[
        { key: 'words', value: pad2(answers.length), of: `/ ${words.length}`, label: 'WORDS' },
        /* THE ONE CHIP THAT GETS LOUDER, and only once it is about to matter -- the exam's rule */
        { key: 'clock', value: formatClock(remainingSeconds), label: 'LEFT', duty: remainingSeconds < TYPING_BLITZ_WARN_SECONDS },
      ]}
      foot={{ at: answers.length, target: words.length, trail: answers.map((answer) => answer.correct) }}
      hints={[{ cap: 'ENTER', en: 'Check', jp: '確認' }]}
      ask={(
        <RoundAsk
          kick="TYPE THIS WORD"
          kickJp="早打ち"
          size={promptSize(current.word.character)}
          gloss={<RoundGloss answer={current.word.meaning} under={current.word.romaji} />}
        >
          <span lang="ja">{current.word.character}</span>
        </RoundAsk>
      )}
      work={(
        <RoundWork
          kick="TYPE IT IN JAPANESE"
          kickJp="入力"
          note={TYPING_BLITZ_COPY.instructions}
          slab={{ text: 'CHECK', jp: '確認', onClick: submit, disabled: isSaving, label: TYPING_BLITZ_COPY.submit }}
          after={<p className="dp-status" role="status">{status}</p>}
        >
          <form className="rd-type dp-type" onSubmit={handleSubmit}>
            <div className="rd-type-row">
              <input
                ref={inputRef}
                aria-label={TYPING_BLITZ_COPY.inputLabel}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={input}
                placeholder={TYPING_BLITZ_COPY.inputPlaceholder}
                disabled={isSaving}
                onChange={(event) => setInput(event.target.value)}
                onInput={(event) => setInput(event.currentTarget.value)}
                onCompositionStart={() => { composing.current = true }}
                onCompositionEnd={() => { composing.current = false }}
                onKeyDown={handleKeyDown}
              />
            </div>
          </form>
          <PuzzleRows
            items={recent}
            label="Your answers"
            limit={RECENT_ROWS}
            render={(answer) => (
              <li key={answer.no} className={answer.correct ? 'dp-row on' : 'dp-row bad'}>
                <u aria-hidden="true">{pad2(answer.no)}</u>
                <b lang="ja" className="jp">{answer.word.word.character}</b>
                <i>{answer.word.word.romaji}</i>
                {answer.correct
                  ? <s>RIGHT</s>
                  : <s className="typed"><span className="sr-only">You typed </span>{answer.typed || '―'}</s>}
              </li>
            )}
          />
        </RoundWork>
      )}
    />
  )
}
