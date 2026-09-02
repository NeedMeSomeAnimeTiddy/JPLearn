import { describe, expect, it } from 'vitest'
import { Matrix4, Scene, Vector3 } from 'three'
import { FLY, FLY_U, buildFireflies, flySites, flySpots } from './fireflies'
import { DESTINATIONS } from './destinations'
import { HOME_EYE } from './flight'

const flat = () => -300
const noLamps: Vector3[] = []

/** every firefly's place, out of the translation column of its matrix */
function positions(f: ReturnType<typeof buildFireflies>): Vector3[] {
  const out: Vector3[] = []
  const m = new Matrix4()
  if (!f.mesh) return out
  for (let i = 0; i < f.mesh.count; i++) {
    f.mesh.getMatrixAt(i, m)
    out.push(new Vector3(m.elements[12], m.elements[13], m.elements[14]))
  }
  return out
}

describe('where the camera stops', () => {
  it('is one spot per destination, and not the menu ridge', () => {
    /* the ridge stands 2,300 above the floor, so nothing in the band is near it and the knots it
       picks land 83 degrees below a view axis whose half-frame is 21.5 */
    const spots = flySpots()
    expect(spots.length).toBe(Object.keys(DESTINATIONS).length)
    expect(spots.some((s) => s[0] === HOME_EYE[0] && s[1] === HOME_EYE[2])).toBe(false)
  })

  it('carries the bearing each eye looks along, not just where it stands', () => {
    /* scattering knots at a random azimuth around a camera puts most of them behind it -- the
       mockup's first attempt put ZERO fireflies in the STUDY shot */
    const spots = flySpots()
    const study = spots[0]
    const d = DESTINATIONS.STUDY
    expect(study[2]).toBeCloseTo(Math.atan2(d.focus[0] - d.eye[0], d.focus[2] - d.eye[2]), 6)
    expect(study[3]).toBe(d.eye[1])
  })
})

describe('siting a knot', () => {
  const eye = [0, 0, 0, -240] as const

  it('puts them in front of the eye, within about fifty degrees of the axis', () => {
    const knots = flySites([eye], flat, () => 9999)
    expect(knots.length).toBe(FLY.knots)
    for (const k of knots) {
      /* the axis is +z here (atan2(0,1) = 0), so a knot in front has positive z */
      const off = Math.abs(Math.atan2(k.x, k.z))
      expect(off).toBeLessThan(0.9)
    }
  })

  it('prefers near AND dark rather than letting either veto', () => {
    /* the mockup's darkness test was a veto, and at a destination the near ground is exactly where
       the lanterns are -- so the only spots that passed were far away, every time */
    const lampAtHand = flySites([eye], flat, (x, z) => Math.hypot(x, z) * 0.4)
    const anywhereDark = flySites([eye], flat, () => 9999)
    const near = (ks: typeof lampAtHand) =>
      Math.min(...ks.map((k) => Math.hypot(k.x, k.z)))
    /* even with every close spot lit, a knot still lands inside the band rather than at the far
       end of the valley */
    expect(near(lampAtHand)).toBeLessThan(FLY.band[1])
    expect(near(anywhereDark)).toBeLessThan(FLY.want * 2)
  })

  it('keeps two knots from becoming one', () => {
    const knots = flySites([eye], flat, () => 9999)
    expect(Math.hypot(knots[0].x - knots[1].x, knots[0].z - knots[1].z))
      .toBeGreaterThanOrEqual(300)
  })

  it('makes a near swarm tight and a far one broad, so both read as a swarm', () => {
    const knots = flySites([eye, [0, 0, 0, -3000] as const], flat, () => 9999)
    const nearR = Math.max(knots[0].r, knots[1].r)
    const farR = Math.max(knots[2].r, knots[3].r)
    expect(farR).toBeGreaterThan(nearR)
    expect(farR).toBeLessThanOrEqual(FLY.knotR)
  })

  it('is repeatable, so a shot can be taken twice', () => {
    expect(flySites([eye], flat, () => 9999)).toEqual(flySites([eye], flat, () => 9999))
  })
})

describe('how high a firefly flies', () => {
  it('clears the highest ground it can drift over, not the ground it was born on', () => {
    /* a fly's height is fixed at build and it then drifts; a sample at its birthplace is the wrong
       ground for most of its life, and on a bank it ends the flight buried */
    const step = (x: number) => (x > 0 ? 400 : 0)
    const f = buildFireflies(new Scene(), (x) => step(x), () => 1e6, noLamps)
    for (const p of positions(f)) {
      /* every fly within reach of the step is above the top of it */
      if (Math.abs(p.x) < FLY.reachXZ) expect(p.y).toBeGreaterThanOrEqual(400 + FLY.lift[0] - 1)
    }
  })

  it('will not be sited in the treetops', () => {
    /* the footing answers "the highest surface here" and a canopy is a surface; the heightfield
       underneath never has foliage in it, so it is the honest ceiling */
    const f = buildFireflies(new Scene(), () => 1900, () => -300, noLamps)
    for (const p of positions(f)) {
      /* the ceiling plus the highest lift, plus the twelve units the blink rides up and down on --
         the matrix carries the bob, not the sited height */
      expect(p.y).toBeLessThanOrEqual(-300 + FLY.ceiling + FLY.lift[1] + 12)
    }
  })
})

describe('the blink', () => {
  it('is mostly dark and briefly bright, on each fly own clock', () => {
    const f = buildFireflies(new Scene(), flat, flat, noLamps)
    f.setOn(1)
    const m = new Matrix4()
    let lit = 0
    let n = 0
    for (let k = 0; k < 300; k++) {
      f.tick(0.05)
      for (let i = 0; i < f.mesh!.count; i++) {
        f.mesh!.getMatrixAt(i, m)
        n++
        if (m.elements[0] > 0.5) lit++
      }
    }
    /* cubed, so the bright part is a flash rather than a slow pulse */
    expect(lit / n).toBeLessThan(0.3)
    expect(lit).toBeGreaterThan(0)
  })

  it('wanders rather than tracing a loop', () => {
    const f = buildFireflies(new Scene(), flat, flat, noLamps)
    f.setOn(1)
    const seen = new Set<string>()
    for (let k = 0; k < 200; k++) {
      f.tick(0.5)
      const p = positions(f)[0]
      seen.add(`${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    }
    expect(seen.size).toBeGreaterThan(150)
  })

  it('never leaves its own knot', () => {
    const f = buildFireflies(new Scene(), flat, flat, noLamps)
    f.setOn(1)
    const home = positions(f)
    for (let k = 0; k < 200; k++) f.tick(0.5)
    const now = positions(f)
    for (let i = 0; i < home.length; i++) {
      /* bounded by its own sines: 4.2 times the speed on each axis, and the start is already
         somewhere inside that box, so the furthest it can get from where it began is the
         diagonal of twice it */
      expect(Math.hypot(now[i].x - home[i].x, now[i].z - home[i].z))
        .toBeLessThanOrEqual(FLY.speed * 4.2 * 2 * Math.SQRT2)
    }
  })
})

describe('the day', () => {
  it('does not fly by daylight, and does not spend a frame pretending to', () => {
    const f = buildFireflies(new Scene(), flat, flat, noLamps)
    f.setOn(0)
    expect(f.mesh!.visible).toBe(false)
    const before = f.mesh!.instanceMatrix.version
    f.tick(5)
    expect(f.mesh!.instanceMatrix.version).toBe(before)
    f.setOn(1)
    expect(f.mesh!.visible).toBe(true)
    expect(FLY_U.uOn.value).toBe(1)
  })

  it('reports how far each knot ended up from its own eye', () => {
    /* the one number that would have caught all four of the mockup's failed sitings */
    const f = buildFireflies(new Scene(), flat, flat, noLamps)
    expect(f.distances.length).toBe(f.knots.length)
    for (const d of f.distances) expect(d).toBeLessThanOrEqual(FLY.band[1])
  })

  it('takes itself out of the scene when disposed', () => {
    const scene = new Scene()
    const f = buildFireflies(scene, flat, flat, noLamps)
    expect(scene.children).toContain(f.mesh)
    f.dispose()
    expect(scene.children).not.toContain(f.mesh)
  })
})
