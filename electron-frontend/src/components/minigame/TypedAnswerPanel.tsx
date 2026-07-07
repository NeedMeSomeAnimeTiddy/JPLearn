import { useEffect, useRef, type RefObject } from 'react'
import { CornerDownLeft } from 'lucide-react'
import * as wanakana from 'wanakana'

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
  const boundRef = useRef(false)

  useEffect(() => {
    const el = answerInputRef.current
    if (!el || !wanakanaMode) return

    wanakana.bind(el, { IMEMode: wanakanaMode === 'hiragana' ? 'toHiragana' : 'toKatakana' })
    boundRef.current = true
    return () => {
      wanakana.unbind(el)
      boundRef.current = false
    }
  }, [answerInputRef, wanakanaMode])

  const handleInput = (rawValue: string) => {
    if (wanakanaMode) {
      onChange(rawValue)
    }
  }

  return (
      <form
        className="game-input-row minigame-answer-form"
        onSubmit={(event) => {
          event.preventDefault()
          const raw = (event.currentTarget as HTMLFormElement).querySelector('input')?.value ?? ''
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