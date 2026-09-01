import { describe, expect, it } from 'vitest'
import { WALK, WALK_LOOPS, walkLoop, walkRnd } from './walk'
import { DESTINATIONS } from './destinations'

const flat = () => 0

describe('the loops', () => {
  it('close, and every sample sits on the ground it was given', () => {
    for (const spec of WALK_LOOPS) {
      const L = walkLoop(spec, () => -300)
      /* getSpacedPoints repeats the seam on a closed curve, and a duplicated point is a zero-length
         segment the walker's search loop can sit on forever */
      expect(L.pts[0].distanceTo(L.pts[L.pts.length - 1])).toBeGreaterThan(1)
      expect(L.pts.every((p) => p.y === -300)).toBe(true)
      /* the length table closes the seam, so `s` can wrap without a special case */
      expect(L.cum.length).toBe(L.pts.length + 1)
      expect(L.len).toBeGreaterThan(L.cum[L.cum.length - 2])
    }
  })

  it('are as long as the world they were drawn in', () => {
    const len = Object.fromEntries(
      WALK_LOOPS.map((s) => [s.n, Math.round(walkLoop(s, flat).len)]),
    )
    expect(len.Valley).toBeCloseTo(48345, -2)
    expect(len.Town).toBeCloseTo(12408, -2)
    expect(len.Festival).toBeCloseTo(4045, -2)
  })

  it('sample finely enough that a walker never cuts a corner', () => {
    /* the polyline is what a walker actually follows, so the chord has to be short against the
       lane it is allowed to wander inside */
    for (const spec of WALK_LOOPS) {
      const L = walkLoop(spec, flat)
      const longest = Math.max(...L.pts.map((p, i) => p.distanceTo(L.pts[(i + 1) % L.pts.length])))
      expect(longest).toBeLessThan(WALK.step * 1.6)
    }
  })
})

describe('how close a walker gets to a camera', () => {
  /* A ROUTE THAT ENDS ON A DESTINATION CAMERA'S NOSE is the fault the closed loops were invented to
     fix, and four of the five framings here are clear of them. DRILLS is not, and it is the
     mockup's own arrangement rather than a porting slip -- see the note in walk.ts. Pinned so that
     an edit to either table has to say what it did to these numbers. */
  const nearest = (key: keyof typeof DESTINATIONS) => {
    const d = DESTINATIONS[key]
    const fx = d.focus[0] - d.eye[0]
    const fz = d.focus[2] - d.eye[2]
    const fl = Math.hypot(fx, fz)
    let best = Infinity
    let ahead = 0
    let off = 0
    for (const spec of WALK_LOOPS) {
      for (const p of walkLoop(spec, flat).pts) {
        const dist = Math.hypot(p.x - d.eye[0], p.z - d.eye[2])
        if (dist >= best) continue
        best = dist
        ahead = ((p.x - d.eye[0]) * fx + (p.z - d.eye[2]) * fz) / fl
        off = Math.sqrt(Math.max(0, dist * dist - ahead * ahead))
      }
    }
    return { best, ahead, off }
  }

  it('keeps STUDY, READING and JLPT entirely behind the camera', () => {
    for (const key of ['STUDY', 'READING', 'JLPT'] as const) {
      expect(nearest(key).ahead).toBeLessThan(0)
    }
  })

  it('puts RECORDS four thousand units out, where a figure is a speck', () => {
    const n = nearest('RECORDS')
    expect(n.ahead).toBeGreaterThan(4000)
  })

  it('crosses the DRILLS approach at 202 units, which is the one that is not clear', () => {
    const n = nearest('DRILLS')
    expect(Math.round(n.best)).toBe(202)
    expect(n.ahead).toBeGreaterThan(0)
    expect(Math.round(n.off)).toBeLessThan(30)
  })
})

describe('what makes one walker not the next', () => {
  it('gives the same figure the same numbers every reload', () => {
    expect(walkRnd(7, 3)).toBe(walkRnd(7, 3))
  })

  it('is a hash rather than a sequence, so neighbours differ unpredictably', () => {
    /* the mockup's first version keyed off `sin(k * 2.399)`, a low-discrepancy sequence -- which
       makes neighbours differ by the SAME amount every time, the opposite of the intent */
    const steps = []
    for (let k = 0; k < 40; k++) steps.push(Math.abs(walkRnd(k + 1, 1) - walkRnd(k, 1)))
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length
    const spread = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length)
    /* a sequence would have near-zero spread in the gap between neighbours */
    expect(spread).toBeGreaterThan(0.15)
  })

  it('stays inside its own lane by construction', () => {
    /* 0.16 of the lane before the spread starts, plus the spread, plus the weave, is exactly 1 --
       so the furthest a walker can be from the centreline is the lane and no tuning of the three
       can put anybody in the ditch */
    expect(0.16 + WALK.spread + WALK.meander).toBeCloseTo(1, 6)
  })
})

describe('the gait', () => {
  it('runs on distance rather than on the clock, so a slow walker takes slow steps', () => {
    /* the stride is a length, not a period: this is the whole of why nobody moon-walks */
    expect(WALK.stride).toBeGreaterThan(1)
    /* two paces of 0.75 m at 37 units to the metre */
    expect(WALK.stride).toBeCloseTo(56, 0)
  })

  it('is scaled to the height the figures actually are', () => {
    /* the mockup's 41 u/s and 44-unit stride come from "a figure is 51.5 units", and nothing in
       this export is 51.5 -- its own crowd filter says 65.5 forty lines further down. Same world,
       same file: its walkers were 27% too slow for the valley they were walking. */
    expect(WALK.speed / 41).toBeCloseTo(65.5 / 51.5, 1)
    expect(WALK.stride / 44).toBeCloseTo(65.5 / 51.5, 1)
  })
})
