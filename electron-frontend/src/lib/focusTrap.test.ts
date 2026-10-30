// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { KeyboardEvent } from 'react'
import { canRestoreFocusTo, getFocusableElements, trapFocus, isReducedMotionPreferred } from './focusTrap'

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

/* audit 17, F3: Settings keeps its inactive tab panels mounted under `hidden` */
describe('getFocusableElements, out of reach', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('skips controls inside a hidden or inert block, and disabled ones matched by tabindex', () => {
    const container = document.createElement('div')
    container.innerHTML = [
      '<button id="shown">a</button>',
      '<div hidden><button id="in-hidden">b</button></div>',
      '<div inert><input id="in-inert" /></div>',
      '<button id="disabled-tabbable" disabled tabindex="0">c</button>',
      '<fieldset disabled><input id="in-disabled-set" tabindex="0" /></fieldset>',
      '<div tabindex="0" id="plain">d</div>',
    ].join('')
    document.body.appendChild(container)
    expect(getFocusableElements(container).map((element) => element.id)).toEqual(['shown', 'plain'])
  })

  it('wraps Shift+Tab to the last control when the panel itself has focus', () => {
    const container = document.createElement('div')
    container.tabIndex = -1
    container.innerHTML = '<button id="one">a</button><button id="two">b</button>'
    document.body.appendChild(container)
    container.focus()
    const event = makeKeyboardEvent('Tab', true)
    expect(trapFocus(event, container)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('two')
  })

  it('restores focus only to something still in the page and in reach', () => {
    const container = document.createElement('div')
    container.innerHTML = '<button id="ok">a</button><div hidden><button id="gone-hidden">b</button></div>'
    document.body.appendChild(container)
    expect(canRestoreFocusTo(document.getElementById('ok'))).toBe(true)
    expect(canRestoreFocusTo(document.getElementById('gone-hidden'))).toBe(false)
    const detached = document.createElement('button')
    expect(canRestoreFocusTo(detached)).toBe(false)
    expect(canRestoreFocusTo(document.body)).toBe(false)
    expect(canRestoreFocusTo(null)).toBe(false)
  })
})
