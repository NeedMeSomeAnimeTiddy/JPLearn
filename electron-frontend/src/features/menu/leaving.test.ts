import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEAVE_MS, cancelLeaving, leaveBoard } from './leaving'

/* The two things this has to get right: the board is still on screen while it fades, and a second
   departure inside the fade window does not let the first one fire afterwards. */
describe('leaveBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.className = ''
  })
  afterEach(() => {
    cancelLeaving()
    vi.useRealTimers()
  })

  it('marks the body while the board fades and clears it when the level changes', () => {
    const then = vi.fn()
    leaveBoard(then)
    expect(document.body.classList.contains('mn-leaving')).toBe(true)
    expect(then).not.toHaveBeenCalled()

    vi.advanceTimersByTime(LEAVE_MS)
    expect(then).toHaveBeenCalledTimes(1)
    expect(document.body.classList.contains('mn-leaving')).toBe(false)
  })

  it('lets the last departure win when Escape repeats inside the fade', () => {
    const first = vi.fn()
    const second = vi.fn()
    leaveBoard(first)
    vi.advanceTimersByTime(LEAVE_MS / 2)
    leaveBoard(second)
    vi.advanceTimersByTime(LEAVE_MS)

    /* the first timer still fires — it is a timer — but its work is dropped, so a screen the user
       has since arrived at is not taken off the board by a press they already superseded */
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(document.body.classList.contains('mn-leaving')).toBe(false)
  })

  it('drops the class and the pending change when the screen is torn down under it', () => {
    const then = vi.fn()
    leaveBoard(then)
    cancelLeaving()
    expect(document.body.classList.contains('mn-leaving')).toBe(false)
    vi.advanceTimersByTime(LEAVE_MS * 2)
    expect(then).not.toHaveBeenCalled()
  })
})
