import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

// Elements that own their own click behaviour and must never start a drag.
// The titlebar nests its nav/window-control buttons inside the drag bar, so a
// hit test is needed rather than relying on the element the handler sits on.
const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(', ')

export interface WindowDragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onLostPointerCapture: () => void
}

/**
 * Drag handlers for a frameless-window titlebar.
 *
 * The titlebar deliberately does not use `-webkit-app-region: drag`: on Windows
 * that turns the strip into non-client area (HTCAPTION), which stops every
 * mouse event reaching the renderer and lets the OS paint its own arrow. That
 * froze the custom animated cursor and made the system cursor flash. Dragging
 * is driven from the main process instead, which polls the OS cursor position.
 */
export function useWindowDrag(): WindowDragHandlers {
  const draggingRef = useRef(false)

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    void window.jplearnDesktop?.endWindowDrag?.()
  }, [])

  // A titlebar unmounting mid-drag must not leave the main-process loop running.
  useEffect(() => endDrag, [endDrag])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary) return

    const target = event.target as Element | null
    if (target?.closest?.(INTERACTIVE_SELECTOR)) return
    if (!window.jplearnDesktop?.startWindowDrag) return

    draggingRef.current = true
    // Keeps pointerup reaching us even when the cursor outruns the window.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* capture is best-effort; the drag still ends on pointerup */
    }
    void window.jplearnDesktop.startWindowDrag()
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    endDrag()
  }, [endDrag])

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture: endDrag,
  }
}
