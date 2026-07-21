import { useEffect, useRef } from 'react'
import type { CompositionEvent, FormEvent } from 'react'
import { bindWanakanaIme, type WanakanaImeMode } from '../lib/wanakanaBinding'

/**
 * Wires a `<textarea>` to wanakana's romaji→kana IME, but only while
 * `enabled` is true. Flipping it off unbinds immediately and the handlers
 * collapse to a plain controlled-input `onChange` — the field behaves
 * exactly like an ordinary textarea, so a real OS Japanese IME's own kanji
 * conversion is never fought over even when wanakana isn't the thing
 * fighting it. Composition-safe in both states (see bindWanakanaIme).
 *
 * Spread `handlers` onto the textarea and attach `ref`; `onValueChange` is
 * called with the committed value however it was produced (native onChange
 * when disabled, onInput/compositionend when enabled).
 */
export function useWanakanaTextarea(
  enabled: boolean,
  mode: WanakanaImeMode,
  onValueChange: (value: string) => void,
) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const isComposingRef = useRef(false)
  const onValueChangeRef = useRef(onValueChange)
  onValueChangeRef.current = onValueChange

  useEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element) return
    return bindWanakanaIme(element, mode)
  }, [enabled, mode])

  return {
    ref,
    isComposingRef,
    handlers: {
      // wanakana rewrites the field's value on native 'input' events, so the
      // committed text is read from onInput while enabled; while disabled
      // this is a no-op and plain onChange drives everything, matching an
      // ordinary controlled textarea.
      onChange: (event: FormEvent<HTMLTextAreaElement>) => {
        if (!enabled) onValueChangeRef.current(event.currentTarget.value)
      },
      onInput: (event: FormEvent<HTMLTextAreaElement>) => {
        if (enabled && !isComposingRef.current) onValueChangeRef.current(event.currentTarget.value)
      },
      onCompositionStart: () => { isComposingRef.current = true },
      onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => {
        isComposingRef.current = false
        if (enabled) onValueChangeRef.current(event.currentTarget.value)
      },
    },
  }
}
