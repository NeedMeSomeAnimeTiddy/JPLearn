import { useCallback, useEffect, useRef } from 'react'

/* ==================================================================================================
   THE MOUSE CAN WALK THESE SCREENS NOW.

   Until this landed the road and the deck rail answered the arrow keys and the click, and nothing
   in between: no drag, no wheel. On a 76-block deck that means clicking a fifteen-pixel band or
   pressing an arrow key seventy-six times.

   TWO OBJECTS, TWO METAPHORS, AND SWAPPING THEM WOULD BE WRONG. This is the mockup's call and the
   reasoning holds in code:

     - THE RAIL IS A MAP. It shows the whole deck at once at a fixed scale, so dragging across it is
       ABSOLUTE -- the block under the pointer is the block you get, the way a scrubber works.
     - THE ROAD IS A REEL. It shows nine of however many and re-centres on whatever is selected, so
       dragging it is RELATIVE -- you push the reel and it travels under a fixed centre.

   An absolute drag on the road would fight its own re-centring; a relative drag on the rail would
   throw away the one thing the rail has, which is that every block already has a place on it.

   THE REEL CURRENTLY HAS NO CALLER, and that is stated here rather than left to be discovered. The
   course was the road, and the course is the chain now, so `'rail'` is the only mode in use. The
   reel is kept because the road itself is not retired -- the design system moved it onto the daily
   puzzles -- and its behaviour is covered by `useTraversal.test.tsx` in the meantime.

   THE GESTURE LIVES ON `window`, NOT ON THE ELEMENT. A drag that moves the selection re-renders the
   panel it started in, so `pointermove` bound to the rail would be listening to a node React has
   already replaced. The element gets `pointerdown` and nothing else.
   ================================================================================================== */

export const TRAVERSE = {
  /* THE DRAG IS DELIBERATELY HEAVIER THAN THE WHEEL. 130px is most of a tablet's width, so pushing
     the road along is a decision rather than a twitch. */
  dragStep: 130,
  /* ONE NOTCH IS ONE STEP. A desktop mouse wheel sends deltaY 100 to 120 per detent in Chrome, so
     the threshold is that -- the mockup's first version used 40, which turned every notch into two
     or three blocks and made a 76-block deck impossible to land on. A trackpad sends many small
     deltas instead and they accumulate to the same place, which is the whole point of accumulating
     rather than counting events. */
  wheelStep: 120,
  /* THE RAIL'S DEADBAND. Absolute mapping is right for a map, but 1,128 pixels over 76 blocks is
     fifteen each -- inside the wobble of a hand holding a mouse still. The pointer has to travel
     this far from wherever the last change was committed before another one is, which kills the
     jitter without breaking the metaphor: keep moving and it still lands exactly where you point,
     because every commit re-arms from the new position. */
  railDead: 22,
  /* how far the pointer has to travel before the gesture stops counting as a click */
  slop: 4,
}

interface Gesture {
  kind: 'reel' | 'rail'
  lastX: number
  moved: number
  /** rail only: where the last commit happened, for the deadband */
  armed: number
}

export interface Traversal {
  /** put this on the element the gesture starts in */
  onPointerDown: (event: React.PointerEvent) => void
  /** and this on the same element; it must not be passive, so it is bound by hand — see below */
  ref: (node: HTMLElement | null) => void
  /**
   * True when the pointer travelled far enough that the click the browser fires at the end of a
   * drag should be ignored.
   *
   * A DRAG THAT TRAVELLED IS NOT A CLICK. The browser fires one anyway, and without this the block
   * under the pointer would be picked a second time — harmless on the rail, but on the road it
   * would enter the step you happened to stop on.
   */
  dragged: () => boolean
}

interface Options {
  /** move the selection by whole steps; the sign is "later is positive" on both screens */
  step: (delta: number) => void
  /** rail only: the client-x left edge of every band, ascending, read fresh at each press */
  bands?: () => number[]
  /** rail only: commit an absolute index */
  pick?: (index: number) => void
  /** off while a sheet or overlay owns the screen */
  enabled?: boolean
}

/**
 * Drag and wheel for one traversable list.
 *
 * `kind` decides which metaphor: a reel takes relative pushes, a rail takes an absolute position.
 */
export function useTraversal(kind: 'reel' | 'rail', opts: Options): Traversal {
  const { step, bands, pick, enabled = true } = opts
  const drag = useRef<Gesture | null>(null)
  const wheelAcc = useRef(0)
  const endedAt = useRef(0)
  const node = useRef<HTMLElement | null>(null)

  /* the callbacks change every render; the listeners below must not, so they read through refs */
  const live = useRef({ step, bands, pick, enabled })
  live.current = { step, bands, pick, enabled }

  const commitRail = useCallback((x: number, force: boolean) => {
    const g = drag.current
    const { bands: bandsOf, pick: onPick } = live.current
    if (!g || !bandsOf || !onPick) return
    /* the first press commits immediately; after that the pointer must clear the deadband */
    if (!force && Math.abs(x - g.armed) < TRAVERSE.railDead) return
    const list = bandsOf()
    if (!list.length) return
    let i = 0
    for (let k = 0; k < list.length; k++) if (x >= list[k]) i = k
    onPick(i)
    g.armed = x
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const g = drag.current
      if (!g) return
      g.moved += Math.abs(event.clientX - g.lastX)
      if (g.kind === 'rail') { commitRail(event.clientX, false); g.lastX = event.clientX; return }
      const by = Math.trunc((event.clientX - g.lastX) / TRAVERSE.dragStep)
      if (!by) return
      g.lastX += by * TRAVERSE.dragStep
      /* DRAGGING RIGHT PULLS EARLIER STEPS TOWARD YOU, which is how a physical reel behaves */
      live.current.step(-by)
    }
    const onUp = () => {
      const g = drag.current
      if (!g) return
      document.body.classList.remove('is-dragging')
      if (g.moved > TRAVERSE.slop) endedAt.current = performance.now()
      drag.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [commitRail])

  const onWheelRef = useRef((event: WheelEvent) => {
    if (!live.current.enabled) return
    event.preventDefault()
    wheelAcc.current += event.deltaY
    let by = Math.trunc(wheelAcc.current / TRAVERSE.wheelStep)
    if (!by) return
    wheelAcc.current -= by * TRAVERSE.wheelStep
    /* NO SINGLE EVENT MOVES MORE THAN ONE STEP. A free-spinning wheel and a trackpad flick both
       deliver enormous deltas in one event, and without this the screen jumps a dozen blocks from
       one flick. Capping per event turns a hard push into a fast scroll instead of a teleport. */
    by = Math.max(-1, Math.min(1, by))
    live.current.step(by)
  })

  /* BOUND BY HAND, BECAUSE REACT'S `onWheel` IS PASSIVE. A passive listener may not call
     `preventDefault`, so the wheel would move the selection AND scroll whatever is behind it. */
  const ref = useCallback((el: HTMLElement | null) => {
    if (node.current) node.current.removeEventListener('wheel', onWheelRef.current)
    node.current = el
    if (el) el.addEventListener('wheel', onWheelRef.current, { passive: false })
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    /* `> 0` AND NOT `!== 0`, so a press that carries no `button` at all is still a press. That is
       every synthetic pointer event jsdom makes -- the property is simply absent -- and `!== 0`
       turned all of them into right-clicks and refused the gesture outright. Secondary buttons are
       1 and up; this is the test that names them without assuming the field exists. */
    if (!live.current.enabled || event.button > 0) return
    drag.current = { kind, lastX: event.clientX, moved: 0, armed: event.clientX }
    document.body.classList.add('is-dragging')
    if (kind === 'rail') commitRail(event.clientX, true)
  }, [kind, commitRail])

  const dragged = useCallback(() => performance.now() - endedAt.current < 250, [])

  return { onPointerDown, ref, dragged }
}
