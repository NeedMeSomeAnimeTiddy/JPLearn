import type { KeyboardEvent } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/* A CONTROL INSIDE A `hidden` OR `inert` BLOCK IS NOT IN THE TAB ORDER, nor is a disabled one that
   only matched by an explicit tabindex (audit 17, F3): Settings keeps its inactive tab panels
   mounted under `hidden`, and Tab must not wrap onto them. */
function isOutOfReach(element: HTMLElement): boolean {
  return element.closest('[hidden], [inert]') !== null || element.matches(':disabled')
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    !isOutOfReach(element)
    && element.getAttribute('aria-hidden') !== 'true'
    && element.tabIndex >= 0
  ))
}

/** Whether focus can go back to `element`: still in the page, not hidden, not inert. */
export function canRestoreFocusTo(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement
    && element !== document.body
    && element.isConnected
    && !isOutOfReach(element)
}

/** Traps Tab/Shift+Tab focus cycling within `container`. Returns true if it handled the event. */
export function trapFocus(event: KeyboardEvent, container: HTMLElement): boolean {
  if (event.key !== 'Tab') return false
  const focusable = getFocusableElements(container)
  if (focusable.length === 0) {
    event.preventDefault()
    container.focus()
    return true
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeElement = document.activeElement
  if (event.shiftKey && (activeElement === first || !container.contains(activeElement))) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && (activeElement === last || !container.contains(activeElement))) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

export function isReducedMotionPreferred(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'true') {
    return true
  }
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
