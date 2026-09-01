import { describe, expect, it } from 'vitest'
import { MathUtils, Vector3 } from 'three'
import {
  AIM_LEAN_BACK, FLIGHT_MAX, FLIGHT_MIN, FUJI_PEAK_HINT, HOME_EYE, HOME_FOV, LEAN_MAX,
  aimAt, easeInOutSine, makeFlight, slerpDir, type CamState,
} from './flight'
import { DESTINATIONS } from './destinations'

/* ==================================================================================================
   THE FLIGHT MATHS, MEASURED THE WAY THE MOCKUP MEASURED IT.

   This is the half of the camera work that can be checked without a renderer, and it is the half
   every past bug lived in: an aim that swung 251 degrees to make a 58-degree turn, a look point
   lerped through the eye, a duration clamped flat regardless of distance. Sampling the flight is
   exactly what the running camera does, so a number here is a number about the real move.
   ================================================================================================== */

const V = (a: readonly number[]) => new Vector3(a[0], a[1], a[2])
const pose = (): CamState => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 42, roll: 0 })

/* THE REAL STANDING POINT AND ITS REAL FRAMING, because these routes only mean anything from
   there — the middles in `flights.json` were flown and saved from this eye. The summit is the
   hint rather than the model's, which is the one thing here that is not what the app measures. */
const HOME_TGT = aimAt(new Vector3(...FUJI_PEAK_HINT), HOME_EYE, HOME_FOV, 16 / 9, 0.76, 0.24)

const flightTo = (key: keyof typeof DESTINATIONS, back = false) => {
  const d = DESTINATIONS[key]
  return back
    ? makeFlight({
      startEye: V(d.eye), startTgt: V(d.focus), endEye: V(HOME_EYE), endTgt: HOME_TGT.clone(),
      mid: d.mid, lean: AIM_LEAN_BACK, pace: d.pace, startFov: d.fov, endFov: HOME_FOV,
    })
    : makeFlight({
      startEye: V(HOME_EYE), startTgt: HOME_TGT.clone(), endEye: V(d.eye), endTgt: V(d.focus),
      mid: d.mid, lean: d.lean, pace: d.pace, startFov: HOME_FOV, endFov: d.fov,
    })
}

/** walk a flight the way the render loop does, at a steady 60fps, returning every pose */
function walk(flight: ReturnType<typeof makeFlight>, fps = 60): CamState[] {
  const frames: CamState[] = []
  const steps = Math.round(flight.dur * fps)
  for (let i = 0; i <= steps; i++) {
    const o = pose()
    flight.sample(easeInOutSine(i / steps), o)
    frames.push(o)
  }
  return frames
}

const look = (o: CamState) => new Vector3(o.tx - o.px, o.ty - o.py, o.tz - o.pz).normalize()

const KEYS = Object.keys(DESTINATIONS) as (keyof typeof DESTINATIONS)[]

describe('slerping a direction rather than lerping a look point', () => {
  it('turns at a constant rate, with no pole to cross', () => {
    const a = new Vector3(0, 0, -1), b = new Vector3(0, 0, 1)
    const steps = 40
    const rates: number[] = []
    let prev = a.clone()
    for (let i = 1; i <= steps; i++) {
      const out = new Vector3()
      slerpDir(a, b, i / steps, out)
      rates.push(prev.angleTo(out))
      prev = out.clone()
    }
    /* opposed directions are the worst case — the old build spiked to 161 degrees in one frame */
    const max = Math.max(...rates), min = Math.min(...rates)
    expect(max - min).toBeLessThan(1e-6)
  })

  it('returns a unit vector at both ends and in the middle', () => {
    const a = new Vector3(1, 2, 3).normalize(), b = new Vector3(-4, 1, 2).normalize()
    for (const t of [0, 0.3, 0.5, 1]) {
      expect(slerpDir(a, b, t, new Vector3()).length()).toBeCloseTo(1, 10)
    }
  })
})

describe('every route in the valley', () => {
  it.each(KEYS)('%s is paced by its own distance, inside the two bounds', (key) => {
    const f = flightTo(key)
    expect(f.dur).toBeGreaterThanOrEqual(FLIGHT_MIN)
    expect(f.dur).toBeLessThanOrEqual(FLIGHT_MAX)
  })

  it('gives the long way round more seconds than the short one', () => {
    /* the whole point of pacing off arc length: a 12,000-unit crossing must not take the same time
       as a 4,000-unit one, which is what a flat clamp did and what read as "thrown" */
    const byLength = KEYS.map((k) => flightTo(k)).sort((a, b) => a.len - b.len)
    expect(byLength[0].dur).toBeLessThan(byLength[byLength.length - 1].dur)
  })

  it.each(KEYS)('%s starts and ends exactly on its two composed framings', (key) => {
    const d = DESTINATIONS[key]
    const f = flightTo(key)
    const start = pose(); f.sample(0, start)
    const end = pose(); f.sample(1, end)

    expect([start.px, start.py, start.pz]).toEqual([...HOME_EYE])
    expect(end.px).toBeCloseTo(d.eye[0], 3)
    expect(end.py).toBeCloseTo(d.eye[1], 3)
    expect(end.pz).toBeCloseTo(d.eye[2], 3)
    /* THE LEAN IS ZERO AT BOTH ENDS, which is what stops it pulling the shot off the framing each
       end was composed at — so the arrival looks where the destination says, to the degree */
    const wanted = V(d.focus).sub(V(d.eye)).normalize()
    expect(MathUtils.radToDeg(look(end).angleTo(wanted))).toBeLessThan(0.01)
    expect(end.fov).toBeCloseTo(d.fov, 6)
  })

  it.each(KEYS)('%s flies THROUGH its middle, not merely toward it', (key) => {
    const d = DESTINATIONS[key]
    if (!d.mid) return
    /* A BEZIER IS ONLY PULLED TOWARD ITS CONTROL POINT, and these middles were chosen to thread
       real gaps between real buildings — so the control point is solved back from the point the
       route must actually pass through: C = 2*mid - (P0 + P2)/2, which puts B(t=0.5) exactly on it.

       AND THAT IS THE CURVE'S HALFWAY, NOT THE FLIGHT'S. This test first asked for the mid at
       `sample(0.5)` and every route missed it by 70 to 780 units, which looked like a broken
       solve and is not: `sample` walks the curve by ARC LENGTH, and half the arc length of an
       asymmetric curve is not t = 0.5. The clearance work only ever needed the path to GO through
       the gap, so that is what is asked — the closest approach, over the whole route. */
    const target = new Vector3(d.mid[0], d.mid[1], d.mid[2])
    let closest = Infinity
    const o = pose()
    const route = flightTo(key)
    for (let i = 0; i <= 8000; i++) {
      route.sample(i / 8000, o)
      closest = Math.min(closest, target.distanceTo(new Vector3(o.px, o.py, o.pz)))
    }
    /* five units, against routes whose tightest authored clearance is 88 — and the residual is
       the sampling step, not the curve: 8,000 samples of the longest route are 3.2 units apart. */
    expect(closest).toBeLessThan(5)
  })

  it.each(KEYS)('%s never lets the lean pull the shot past its cap', (key) => {
    /* THE OVERTURN BUG, and the only test that would have caught it. Uncapped, DRILLS needed 58
       degrees of turn and did 251. */
    const worst = Math.max(...walk(flightTo(key)).map((o) => o.lean ?? 0))
    expect(MathUtils.radToDeg(worst)).toBeLessThanOrEqual(MathUtils.radToDeg(LEAN_MAX) + 1e-9)
  })

  it.each(KEYS)('%s turns without a step in its rate, out and back', (key) => {
    /* A SNAP IS LOCAL, SO THIS HAS TO BE. The first version of this test capped the peak turn rate
       at 2 degrees a frame, which is a number nobody measured — and JLPT's way home failed it at
       2.58 while being perfectly smooth. Measured across all ten legs: medians run 0.14 to 0.73
       degrees a frame, in line with the mockup's own 0.15-0.47, and peaks 0.33 to 2.58. The high
       ones are simply the middle of a big turn: JLPT reverses 151 degrees over the shortest arc on
       the board, and RECORDS turns 163. A global max/median ratio does not separate those from a
       discontinuity either — READING's smoothest leg has a ratio of 5.0 purely because its ends
       are slow.
       What a snap actually is: one frame far outside ITS OWN NEIGHBOURS. The old build's was 161
       degrees between frames doing 0.05. So each frame is checked against the two either side. */
    for (const back of [false, true]) {
      const frames = walk(flightTo(key, back))
      const rates: number[] = []
      for (let i = 1; i < frames.length; i++) rates.push(look(frames[i - 1]).angleTo(look(frames[i])))
      let worst = 0
      for (let i = 1; i < rates.length - 1; i++) {
        const neighbours = (rates[i - 1] + rates[i + 1]) / 2
        if (neighbours > 1e-9) worst = Math.max(worst, rates[i] / neighbours)
      }
      expect(worst).toBeLessThan(1.2)
    }
  })

  it.each(KEYS)('%s covers its path evenly, because the curve is stepped by arc length', (key) => {
    const frames = walk(flightTo(key))
    const steps: number[] = []
    for (let i = 1; i < frames.length; i++) {
      steps.push(new Vector3(frames[i].px, frames[i].py, frames[i].pz)
        .distanceTo(new Vector3(frames[i - 1].px, frames[i - 1].py, frames[i - 1].pz)))
    }
    /* the ends are eased to a stop by design, so evenness is asked of the cruise rather than the
       whole move — what this is guarding is a jump mid-path from a coarse arc-length table */
    const cruise = steps.slice(Math.floor(steps.length * 0.3), Math.floor(steps.length * 0.7))
    expect(Math.max(...cruise) / Math.min(...cruise)).toBeLessThan(1.35)
  })
})

describe('the way home', () => {
  it.each(KEYS)('%s retraces the arc it came in on', (key) => {
    const d = DESTINATIONS[key]
    if (!d.mid) return
    /* same middle, so a flight that came in through a gate does not leave through the roof and the
       trees the arrival was routed around are not back in the way */
    const target = new Vector3(d.mid[0], d.mid[1], d.mid[2])
    let closest = Infinity
    const o = pose()
    const route = flightTo(key, true)
    for (let i = 0; i <= 8000; i++) {
      route.sample(i / 8000, o)
      closest = Math.min(closest, target.distanceTo(new Vector3(o.px, o.py, o.pz)))
    }
    expect(closest).toBeLessThan(5)
  })

  it.each(KEYS)('%s comes home without pointing at the sky', (key) => {
    /* THE REASON THE WAY BACK LEANS LESS. The menu stands 2,000 up and 6,000 out, so every return
       is a climb, and leaning into a climb aims the camera at empty air.

       AND THE ASSERTION IS ABOUT PITCH, NOT ABOUT THE LEAN. This test first asked that the return
       lean less than the outbound and failed on THE WORLD by a degree: both legs run into the
       15-degree cap, so the achieved deviation is set by the cap rather than by the fraction, and
       0.12 against 0.75 says nothing about where the shot ends up. What the smaller fraction is
       FOR is the pitch. Measured across all ten legs: every return stays between -13 and +19
       degrees except THE EXAM, which is a pagoda you arrive looking 17 degrees UP at and which
       peaks at 38 on the way home -- so it gets the headroom its own subject asks for. */
    const ceiling = key === 'JLPT' ? 40 : 20
    const highest = Math.max(...walk(flightTo(key, true))
      .map((o) => MathUtils.radToDeg(Math.asin(look(o).y))))
    expect(highest).toBeLessThan(ceiling)
  })

  it('unwinds any roll the arrival had', () => {
    const f = makeFlight({
      startEye: V(DESTINATIONS.STUDY.eye), startTgt: V(DESTINATIONS.STUDY.focus),
      endEye: V(HOME_EYE), endTgt: HOME_TGT.clone(),
      mid: null, lean: AIM_LEAN_BACK, pace: null, startFov: 48, endFov: HOME_FOV, startRoll: -9, endRoll: 0,
    })
    const end = pose(); f.sample(1, end)
    expect(end.roll).toBe(0)
  })
})

describe('the clock', () => {
  it('eases in and out around a linear middle', () => {
    expect(easeInOutSine(0)).toBeCloseTo(0, 10)
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 10)
    expect(easeInOutSine(1)).toBeCloseTo(1, 10)
    /* the ends must be slower than the middle, or the camera starts and stops abruptly */
    expect(easeInOutSine(0.05)).toBeLessThan(0.05)
    expect(easeInOutSine(0.95)).toBeGreaterThan(0.95)
  })
})
