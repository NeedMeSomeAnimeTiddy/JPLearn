import { useEffect, useRef, useState, type RefObject } from 'react'
import { CornerDownLeft } from 'lucide-react'
import * as wanakana from 'wanakana'
import { bindWanakanaIme } from '../../lib/wanakanaBinding'

interface TypedAnswerPanelProps {
  answerInputRef: RefObject<HTMLInputElement | null>
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  wanakanaMode?: 'hiragana' | 'katakana'
}

export function TypedAnswerPanel({
  answerInputRef,
  value,
  placeholder,
  disabled,
  onChange,
  onSubmit,
  wanakanaMode,
}: TypedAnswerPanelProps) {
  const isComposingRef = useRef(false)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    const el = answerInputRef.current
    if (!el || !wanakanaMode) return
    // Composition-safe: without this, an active Japanese IME (kanji henkan)
    // gets corrupted by wanakana rewriting the field on every keystroke —
    // see bindWanakanaIme for why plain-keyboard romaji still works fine.
    return bindWanakanaIme(el, wanakanaMode === 'hiragana' ? 'toHiragana' : 'toKatakana')
  }, [answerInputRef, wanakanaMode])

  const handleInput = (rawValue: string) => {
    if (wanakanaMode && !isComposingRef.current) {
      onChange(rawValue)
    }
  }

  return (
      <form
        className={`game-input-row minigame-answer-form${shaking ? ' game-input-row-shake' : ''}`}
        onAnimationEnd={() => setShaking(false)}
        onSubmit={(event) => {
          event.preventDefault()
          const raw = (event.currentTarget as HTMLFormElement).querySelector('input')?.value ?? ''
          if (raw.trim().length === 0) {
            setShaking(true)
            return
          }
          if (wanakanaMode) {
            const finalized = wanakanaMode === 'hiragana'
              ? wanakana.toHiragana(raw)
              : wanakana.toKatakana(raw)
            onSubmit(finalized)
          } else {
            onSubmit(raw)
          }
        }}
      >
      <input
        ref={answerInputRef}
        value={value}
        onChange={(event) => {
          if (!wanakanaMode) {
            onChange(event.target.value)
          }
        }}
        onInput={(event) => {
          if (wanakanaMode) {
            handleInput(event.currentTarget.value)
          }
        }}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false
          if (wanakanaMode) onChange(event.currentTarget.value)
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />
      <button type="submit" disabled={disabled} aria-label="Submit answer">
        <CornerDownLeft aria-hidden="true" size={18} strokeWidth={2.2} />
      </button>
    </form>
  )
}