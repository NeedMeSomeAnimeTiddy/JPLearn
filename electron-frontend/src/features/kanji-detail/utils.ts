import { formatTagLabel } from '../../utils'
import type { KeyboardEvent } from 'react'

const HAN_IDEOGRAPH = /^\p{Unified_Ideograph}$/u
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function extractKanjiCharacters(value: string): string[] {
  const seen = new Set<string>()
  return Array.from(value).filter((character) => {
    if (!HAN_IDEOGRAPH.test(character) || seen.has(character)) return false
    seen.add(character)
    return true
  })
}

export function formatKanjiReading(reading: string): string {
  return reading.replaceAll('.', '・')
}

export function formatKanjiDetailTag(tag: string): string {
  return formatTagLabel(tag)
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hidden
    && element.getAttribute('aria-hidden') !== 'true'
    && element.tabIndex >= 0
  ))
}

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
