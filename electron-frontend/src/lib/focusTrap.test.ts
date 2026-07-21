// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { KeyboardEvent } from 'react'
import { getFocusableElements, trapFocus, isReducedMotionPreferred } from './focusTrap'

function makeKeyboardEvent(key: string, shiftKey = false): KeyboardEvent {
  return { key, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

describe('getFocusableElements', () => {
  it('returns interactive elements and excludes disabled/hidden/aria-hidden ones', () => {
    document.body.innerHTML = `
      <div id="container">
        <button id="a">A</button>
        <button id="b" disabled>B</button>
        <a id="c" href="#">C</a>
        <input id="d" />
        <button id="e" hidden>E</button>
        <button id="f" aria-hidden="true">F</button>
        <div id="g" tabindex="-1">G</div>
        <div id="h" tabindex="0">H</div>
      </div>
    `
    const container = document.getElementById('container')!
    const ids = getFocusableElements(container).map((el) => el.id)
    expect(ids).toEqual(['a', 'c', 'd', 'h'])
  })
})

describe('trapFocus', () => {
  function setup() {
    document.body.innerHTML = `
      <div id="container" tabindex="-1">
        <button id="first">First</button>
        <button id="middle">Middle</button>
        <button id="last">Last</button>
      </div>
    `
    return document.getElementById('container')!
  }

  it('ignores non-Tab keys', () => {
    const container = setup()
    const event = makeKeyboardEvent('Enter')
    expect(trapFocus(event, container)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('wraps focus from the last element to the first on Tab', () => {
    const container = setup()
    const last = document.getElementById('last')!
    last.focus()
    const event = makeKeyboardEvent('Tab')
    const handled = trapFocus(event, container)
    expect(handled).toBe(true)
    expect(document.activeElement?.id).toBe('first')
  })

  it('wraps focus from the first element to the last on Shift+Tab', () => {
    const container = setup()
    const first = document.getElementById('first')!
    first.focus()
    const event = makeKeyboardEvent('Tab', true)
    const handled = trapFocus(event, container)
    expect(handled).toBe(true)
    expect(document.activeElement?.id).toBe('last')
  })

  it('does not interfere with Tab between interior elements', () => {
    const container = setup()
    const middle = document.getElementById('middle')!
    middle.focus()
    const event = makeKeyboardEvent('Tab')
    const handled = trapFocus(event, container)
    expect(handled).toBe(false)
  })

  it('focuses the container itself when there is nothing focusable inside', () => {
    document.body.innerHTML = '<div id="empty" tabindex="-1"></div>'
    const container = document.getElementById('empty')!
    const event = makeKeyboardEvent('Tab')
    const handled = trapFocus(event, container)
    expect(handled).toBe(true)
    expect(document.activeElement).toBe(container)
  })
})

describe('isReducedMotionPreferred', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    delete document.documentElement.dataset.reducedMotion
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    delete document.documentElement.dataset.reducedMotion
  })

  it('returns true when the reducedMotion dataset flag is set', () => {
    document.documentElement.dataset.reducedMotion = 'true'
    expect(isReducedMotionPreferred()).toBe(true)
  })

  it('falls back to matchMedia when the dataset flag is absent', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    expect(isReducedMotionPreferred()).toBe(true)
  })

  it('returns false when neither signal indicates a preference', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    expect(isReducedMotionPreferred()).toBe(false)
  })
})
