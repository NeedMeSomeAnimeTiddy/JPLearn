import { afterEach, describe, expect, it, beforeEach } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { TRAVERSE, useTraversal } from './useTraversal'

/* EXPLICIT, BECAUSE THIS SUITE DOES NOT RUN TESTING-LIBRARY'S AUTOMATIC CLEANUP. Without it every
   render stacks up in the same document and the second test onward finds two strips. */
afterEach(cleanup)

/* a strip that reports every step it is told to take */
function Reel({ log }: { log: number[] }) {
  const reel = useTraversal('reel', { step: (d) => log.push(d) })
  return <div data-testid="strip" ref={reel.ref} onPointerDown={reel.onPointerDown} style={{ width: 400 }} />
}

/* a rail of five bands 100 apart, so the absolute mapping has something to land on */
function Rail({ picks, enabled = true }: { picks: number[]; enabled?: boolean }) {
  const rail = useTraversal('rail', {
    enabled,
    step: (d) => picks.push(1000 + d),
    bands: () => [0, 100, 200, 300, 400],
    pick: (i) => picks.push(i),
  })
  return <div data-testid="rail" ref={rail.ref} onPointerDown={rail.onPointerDown} />
}

const wheel = (el: HTMLElement, deltaY: number) => {
  el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
}

/* MOUSEEVENT, NOT `fireEvent.pointerDown`. jsdom has no constructible `PointerEvent`, so
   testing-library falls back to a bare `Event` and every init property beyond bubbles is dropped --
   `button` and `clientX` both arrive undefined, which made the first version of this suite prove
   only that the hook ignores events with no coordinates. A MouseEvent carries both and React
   dispatches it to `onPointerDown` all the same. */
const press = (el: HTMLElement, clientX: number, button = 0) => {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX, button, bubbles: true, cancelable: true }))
  })
}
const move = (clientX: number) => {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX, bubbles: true }))
  })
}
const release = () => {
  act(() => { window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })) })
}

describe('the wheel', () => {
  let log: number[]
  beforeEach(() => { log = [] })

  it('moves one step per notch', () => {
    render(<Reel log={log} />)
    wheel(screen.getByTestId('strip'), TRAVERSE.wheelStep)
    expect(log).toEqual([1])
  })

  it('accumulates a trackpad\'s many small deltas to the same place', () => {
    render(<Reel log={log} />)
    const el = screen.getByTestId('strip')
    for (let i = 0; i < 4; i++) wheel(el, TRAVERSE.wheelStep / 4)
    expect(log).toEqual([1])
  })

  it('never moves more than one step on one event', () => {
    /* a free-spinning wheel and a trackpad flick both deliver enormous deltas in a single event;
       without the cap the screen jumps a dozen blocks from one flick */
    render(<Reel log={log} />)
    wheel(screen.getByTestId('strip'), TRAVERSE.wheelStep * 40)
    expect(log).toEqual([1])
  })

  it('goes backwards as readily as forwards', () => {
    render(<Reel log={log} />)
    wheel(screen.getByTestId('strip'), -TRAVERSE.wheelStep)
    expect(log).toEqual([-1])
  })

  it('is quiet under the threshold, so a nudge is not a step', () => {
    render(<Reel log={log} />)
    wheel(screen.getByTestId('strip'), TRAVERSE.wheelStep - 1)
    expect(log).toEqual([])
  })

  it('takes the event, or the screen behind it scrolls too', () => {
    render(<Reel log={log} />)
    const ev = new WheelEvent('wheel', { deltaY: TRAVERSE.wheelStep, bubbles: true, cancelable: true })
    screen.getByTestId('strip').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})

describe('the reel drag', () => {
  let log: number[]
  beforeEach(() => { log = [] })

  it('pulls earlier steps toward you when you drag right, the way a reel behaves', () => {
    render(<Reel log={log} />)
    const el = screen.getByTestId('strip')
    press(el, 500, 0)
    move(500 + TRAVERSE.dragStep)
    release()
    expect(log).toEqual([-1])
  })

  it('is heavier than the wheel, so pushing the road is a decision rather than a twitch', () => {
    expect(TRAVERSE.dragStep).toBeGreaterThan(100)
    render(<Reel log={log} />)
    const el = screen.getByTestId('strip')
    press(el, 0, 0)
    move(TRAVERSE.dragStep - 1)
    expect(log).toEqual([])
  })

  it('keeps the remainder, so a slow drag still gets there', () => {
    render(<Reel log={log} />)
    const el = screen.getByTestId('strip')
    press(el, 0, 0)
    for (let x = 20; x <= TRAVERSE.dragStep * 2; x += 20) move(-x)
    expect(log).toEqual([1, 1])
  })

  it('stops listening once the pointer is up', () => {
    render(<Reel log={log} />)
    const el = screen.getByTestId('strip')
    press(el, 0, 0)
    release()
    move(-TRAVERSE.dragStep * 3)
    expect(log).toEqual([])
  })

  it('ignores a right-click, which belongs to the context menu', () => {
    render(<Reel log={log} />)
    press(screen.getByTestId('strip'), 0, 2)
    move(-TRAVERSE.dragStep)
    expect(log).toEqual([])
  })
})

describe('the rail drag', () => {
  let picks: number[]
  beforeEach(() => { picks = [] })

  it('commits the band under the pointer on the first press', () => {
    /* the rail is a MAP: the block under the pointer is the block you get */
    render(<Rail picks={picks} />)
    press(screen.getByTestId('rail'), 250, 0)
    expect(picks).toEqual([2])
  })

  it('holds still inside the deadband, which is where a hand\'s wobble lives', () => {
    render(<Rail picks={picks} />)
    const el = screen.getByTestId('rail')
    press(el, 250, 0)
    move(250 + TRAVERSE.railDead - 1)
    expect(picks).toEqual([2])
  })

  it('re-arms from every commit, so it still lands exactly where you point', () => {
    render(<Rail picks={picks} />)
    const el = screen.getByTestId('rail')
    press(el, 0, 0)
    for (let x = 0; x <= 400; x += TRAVERSE.railDead + 2) move(x)
    /* CLEAR OF THE DEADBAND, or this asserts the opposite of what it means to. The loop above ends
       at 384, and a final nudge to 400 is 16 pixels -- inside the band, correctly refused, and the
       last commit stays on block 3. Landing where you point means travelling there. */
    move(430)
    expect(picks[0]).toBe(0)
    expect(picks[picks.length - 1]).toBe(4)
  })

  it('takes an absolute position, not a relative push', () => {
    render(<Rail picks={picks} />)
    const el = screen.getByTestId('rail')
    press(el, 420, 0)
    expect(picks).toEqual([4])
  })

  it('is off while a sheet owns the screen', () => {
    render(<Rail picks={picks} enabled={false} />)
    press(screen.getByTestId('rail'), 250, 0)
    wheel(screen.getByTestId('rail'), TRAVERSE.wheelStep)
    expect(picks).toEqual([])
  })
})

describe('the click at the end of a drag', () => {
  it('is disowned once the pointer has travelled', () => {
    /* the browser fires one anyway, and on the road it would enter the step you stopped on */
    const log: number[] = []
    let dragged: (() => boolean) | null = null
    function Probe() {
      const t = useTraversal('reel', { step: (d) => log.push(d) })
      dragged = t.dragged
      return <div data-testid="strip" ref={t.ref} onPointerDown={t.onPointerDown} />
    }
    render(<Probe />)
    const el = screen.getByTestId('strip')
    press(el, 0, 0)
    move(-TRAVERSE.dragStep)
    release()
    expect(dragged!()).toBe(true)
  })

  it('is still a click when the pointer never moved', () => {
    let dragged: (() => boolean) | null = null
    function Probe() {
      const t = useTraversal('reel', { step: () => {} })
      dragged = t.dragged
      return <div data-testid="strip" ref={t.ref} onPointerDown={t.onPointerDown} />
    }
    render(<Probe />)
    press(screen.getByTestId('strip'), 40, 0)
    release()
    expect(dragged!()).toBe(false)
  })
})
