import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { canRestoreFocusTo, getFocusableElements, trapFocus } from '../lib/focusTrap'

/* A MODAL TAKES, TRAPS AND RETURNS FOCUS (audit 17, F3), with the shared `trapFocus`. Mounting is
   opening: focus goes to `initialFocus` (or the first control, or the panel), Tab and Shift+Tab
   wrap inside, and unmounting hands focus back to whatever had it before, unless that is gone,
   hidden or inert. A dialog opened over another takes focus from it and gives it back to it, so the
   topmost one always owns the keyboard. */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialFocus?: (container: HTMLElement) => HTMLElement | null,
): (event: ReactKeyboardEvent<HTMLElement>) => void {
  const initialFocusRef = useRef(initialFocus)
  initialFocusRef.current = initialFocus

  useEffect(() => {
    const previous = document.activeElement
    const container = containerRef.current
    if (container) {
      const target = initialFocusRef.current?.(container) ?? getFocusableElements(container)[0] ?? container
      target.focus()
    }
    return () => {
      if (canRestoreFocusTo(previous)) previous.focus()
    }
  }, [containerRef])

  return useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const container = containerRef.current
    if (container) trapFocus(event, container)
  }, [containerRef])
}
