import { useEffect, useRef } from 'react'

/**
 * THE CONVERSATION'S KEYS, and only while nothing is standing over it.
 *
 * The listener is on the window, the way every other sheet's is (`PassageHubView`), so a key works
 * wherever focus happens to be on the sheet -- including nowhere. It hands over only the keys that
 * belong to the conversation: ones pressed on its own subtree or on the page itself, never ones
 * typed into Look it up, the kanji sheet, settings or the palette, which are portalled modals and
 * keep their keys. A handler that has already been taken (`defaultPrevented`) is left alone.
 */
export function useSheetKeys(onKey: (event: KeyboardEvent) => void): void {
  const latest = useRef(onKey)
  latest.current = onKey

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
      const target = event.target
      const root = document.querySelector('.cv-root')
      const ours = target === document.body
        || target === document.documentElement
        || (root !== null && target instanceof Node && root.contains(target))
      if (ours) latest.current(event)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}

/** true when ENTER on this target is already a press -- a button clicks itself */
export function pressesItself(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button') !== null
}
