import * as wanakana from 'wanakana'

export type WanakanaImeMode = 'toHiragana' | 'toKatakana'

/**
 * Binds wanakana's romaji→kana IME to an input/textarea, but pauses its
 * conversion for the duration of any real OS-level IME composition (e.g. a
 * Japanese IME's kanji henkan session).
 *
 * Without this, wanakana rewrites the field's `value` on every native
 * 'input' event regardless of platform, which corrupts an in-progress
 * composition and makes it impossible to ever commit a kanji candidate.
 * wanakana's own built-in composition guard only activates on macOS (and
 * only for compositions it detects are already Japanese) — on Windows there
 * is no guard at all, so a plain-keyboard learner typing romaji works fine,
 * but anyone with a real Japanese IME enabled can never type kanji through
 * the same field. Setting `dataset.ignoreComposition` (the flag wanakana's
 * own input handler already checks) for the full duration of composition on
 * every platform fixes this without touching wanakana internals.
 *
 * Returns a cleanup function that unbinds everything.
 */
export function bindWanakanaIme(element: HTMLInputElement | HTMLTextAreaElement, mode: WanakanaImeMode): () => void {
  wanakana.bind(element, { IMEMode: mode })

  const onCompositionStart = () => { element.dataset.ignoreComposition = 'true' }
  const onCompositionEnd = () => { element.dataset.ignoreComposition = 'false' }
  element.addEventListener('compositionstart', onCompositionStart)
  element.addEventListener('compositionend', onCompositionEnd)

  return () => {
    element.removeEventListener('compositionstart', onCompositionStart)
    element.removeEventListener('compositionend', onCompositionEnd)
    wanakana.unbind(element)
  }
}
