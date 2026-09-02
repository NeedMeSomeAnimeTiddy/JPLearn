import { afterEach, describe, expect, it } from 'vitest'
import { REF_ASPECT, SHAKE_SECONDS, VIEW, createViewpoint, fittedFov } from './viewpoint'

const made: { dispose: () => void }[] = []
const make = (still = false) => {
  const v = createViewpoint(still)
  made.push(v)
  return v
}
afterEach(() => { while (made.length) made.pop()!.dispose() })

/** how wide the view is, in degrees, at a given vertical field and window shape */
const horizontal = (fovY: number, aspect: number) =>
  (Math.atan(Math.tan((fittedFov(fovY, aspect) * Math.PI) / 360) * aspect) * 360) / Math.PI

describe('the fitted lens', () => {
  it('leaves 16:9 exactly alone, which is what everything was composed against', () => {
    expect(fittedFov(43, REF_ASPECT)).toBe(43)
  })

  it('holds the horizontal field on any window narrower than that', () => {
    /* THE WHOLE POINT. Every plate and rail in this menu is placed as a fraction of the frame's
       WIDTH, so the width is the thing that may not move. Below the reference aspect the vertical
       opens up instead, which costs nothing but sky and ground. */
    const wide = horizontal(43, REF_ASPECT)
    for (const a of [1.75, 1.6, 1.5, 1.33, 0.9, 0.46]) {
      expect(horizontal(43, a)).toBeCloseTo(wide, 6)
      expect(fittedFov(43, a)).toBeGreaterThan(43)
    }
  })

  it('does nothing at all on a window wider than 16:9', () => {
    /* wider simply GAINS sky and ground; there is nothing to correct and narrowing the vertical
       field to keep the width would throw away the extra */
    for (const a of [1.78, 2.0, 2.4, 3.5]) expect(fittedFov(43, a)).toBe(43)
  })

  it('is the number this window actually renders at, measured', () => {
    /* the app's own window came back at aspect 1.557, where an authored 43 draws as 48.4 -- so
       this is not a hypothetical about phones, it is every non-maximised window */
    expect(fittedFov(43, 1.5571776155717763)).toBeCloseTo(48.43, 2)
  })

  it('survives a window with no area rather than returning a NaN lens', () => {
    /* a minimised window reports zero height, and a NaN fov is a black frame that stays black
       after the window comes back */
    for (const a of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Number.isFinite(fittedFov(43, a))).toBe(true)
    }
  })
})

describe('the breath', () => {
  it('starts at rest, so the first frame is the composed shot and not an offset one', () => {
    const v = make()
    v.tick(0)
    expect(v.eye.x).toBeCloseTo(0, 6)
    expect(v.eye.y).toBeCloseTo(0, 6)
  })

  it('rises and drifts by the amounts the mockup holds a camera with', () => {
    const v = make()
    /* a full half-period on each clock puts both at the far end of their travel */
    let seenY = 0
    let seenX = 0
    for (let i = 0; i < 2000; i++) {
      v.tick(0.01)
      seenY = Math.max(seenY, v.eye.y)
      seenX = Math.max(seenX, v.eye.x)
    }
    expect(seenY).toBeCloseTo(VIEW.breath.y, 1)
    expect(seenX).toBeCloseTo(VIEW.breath.x, 1)
  })

  it('never goes negative, because it is a rise rather than a wobble', () => {
    const v = make()
    for (let i = 0; i < 3000; i++) {
      v.tick(0.01)
      expect(v.eye.y).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('runs its two clocks at different rates, or it is one diagonal drift', () => {
    expect(VIEW.breath.secX).not.toBeCloseTo(VIEW.breath.secY, 2)
  })

  it('stands perfectly still when motion is reduced', () => {
    const v = make(true)
    for (let i = 0; i < 500; i++) v.tick(0.016)
    expect(v.eye.length()).toBe(0)
    expect(v.aim.length()).toBe(0)
  })
})

describe('the lean', () => {
  it('eases toward the pointer rather than tracking it', () => {
    /* a flicked mouse is a lean, not a jolt: one frame gets 5% of the distance */
    const v = make()
    v.point(1, 0)
    v.tick(0.016)
    const first = v.aim.x
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(VIEW.par.aimX * 0.1)
  })

  it('arrives at the full offset if the pointer stays put', () => {
    const v = make()
    v.point(1, 1)
    for (let i = 0; i < 400; i++) v.tick(0.016)
    expect(v.aim.x).toBeCloseTo(VIEW.par.aimX, 1)
    expect(v.aim.y).toBeCloseTo(-VIEW.par.aimY, 1)
  })

  it('swings the aim the opposite way to the eye, which is what parallax IS', () => {
    /* moving the eye and the aim the same way is a pan; opposing them slides the near ground
       against the far ranges, which is the only depth cue a still camera has */
    const v = make()
    v.point(1, 0)
    for (let i = 0; i < 400; i++) v.tick(0.016)
    /* the eye goes right with the pointer and the aim goes right too -- but the eye moves 26 and
       the aim 10, so the LINE OF SIGHT rotates back across the world */
    expect(v.eye.x).toBeGreaterThan(v.aim.x)
  })
})

describe('the knock', () => {
  it('hits hardest on the first beat, not after a wind-up', () => {
    /* a damped sine starts at zero, so the first thing a refused press does is nothing */
    const v = make(true)
    v.punch(1)
    v.tick(0.02)
    const early = Math.abs(v.eye.x)
    v.tick(0.1)
    expect(early).toBeGreaterThan(Math.abs(v.eye.x))
  })

  it('ends exactly where it started, and inside a quarter of a second', () => {
    const v = make(true)
    v.punch(1)
    for (let i = 0; i < 40; i++) v.tick(0.01)
    expect(SHAKE_SECONDS).toBeLessThan(0.25)
    expect(v.eye.length()).toBe(0)
  })

  it('scales, so a hard refusal and a soft one are the same shape', () => {
    const hard = make(true)
    const soft = make(true)
    hard.punch(1)
    soft.punch(0.5)
    hard.tick(0.02)
    soft.tick(0.02)
    expect(Math.abs(hard.eye.x)).toBeCloseTo(Math.abs(soft.eye.x) * 2, 5)
  })

  it('restarts rather than queueing, because two refusals are one frustrated person', () => {
    const v = make(true)
    v.punch(1)
    for (let i = 0; i < 20; i++) v.tick(0.01)
    v.punch(1)
    v.tick(0.02)
    expect(Math.abs(v.eye.x)).toBeGreaterThan(1)
  })

  it('still fires when motion is reduced, because it is feedback and not decoration', () => {
    /* with the flash it is the only thing that says a press was heard and declined; it lasts
       230 ms and ends where it started */
    const v = make(true)
    v.punch(1)
    v.tick(0.02)
    expect(v.eye.length()).toBeGreaterThan(0)
  })
})
