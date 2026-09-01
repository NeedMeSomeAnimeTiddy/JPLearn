import { describe, expect, it } from 'vitest'
import { Color, FogExp2, PerspectiveCamera, Scene, Vector3 } from 'three'
import {
  AXIS, EYE_XZ, GROUND_Y, LAKE, LAKE_HALF, LAKE_U, LAKE_Y, SIDE, buildLake, lakeCentre, lakeShore,
} from './lake'
import { REFLECT_CLIP_LIFT, REFLECT_H, REFLECT_W } from './reflection'
import { DESTINATIONS } from './destinations'
import { HOME_EYE } from './flight'

describe('where the lake is', () => {
  it('is placed in the menu sight line, not at a world coordinate somebody read off a viewport', () => {
    /* the valley was laid out along one bearing and every distance in it is "so far out, so far to
       the side"; the axes are unit vectors and the placement follows from them */
    expect(AXIS.length()).toBeCloseTo(1, 4)
    expect(SIDE.length()).toBeCloseTo(1, 4)
    expect(AXIS.dot(SIDE)).toBeCloseTo(0, 4)

    const c = lakeCentre()
    expect(c.x).toBeCloseTo(EYE_XZ.x + AXIS.x * LAKE.d + SIDE.x * LAKE.s, 3)
    expect(c.z).toBeCloseTo(EYE_XZ.y + AXIS.y * LAKE.d + SIDE.y * LAKE.s, 3)
  })

  it('sits below the valley floor rather than on it', () => {
    /* a surface at ground level z-fights the bank all the way round the shore */
    expect(LAKE_Y).toBe(GROUND_Y + LAKE.level)
    expect(LAKE_Y).toBeLessThan(GROUND_Y)
  })

  it('keeps both shores in the picture from the home eye', () => {
    /* MEASURED FROM THIS CAMERA, not from the mockup's. Its own note gives a near shore at 300 and
       a far one at 5,700, and those are distances from the retired analytic eye at (170, 830) --
       the first version of this test copied them out and failed at 10,818. What carries over is
       the radius; what does not is anything quoted in distance from an eye that moved. */
    const eye = new Vector3(HOME_EYE[0], HOME_EYE[1], HOME_EYE[2])
    const c = lakeCentre()
    const along = Math.hypot(c.x - eye.x, c.z - eye.z)
    expect(along).toBeCloseTo(8118, -2)
    /* entirely in front of the eye, and entirely inside the far plane */
    expect(along - LAKE.r).toBeGreaterThan(1000)
    expect(along + LAKE.r).toBeLessThan(40000)
  })

  it('is in frame from the home eye, which is the whole reason it exists', () => {
    const cam = new PerspectiveCamera(43, 16 / 9, 1, 40000)
    cam.position.set(HOME_EYE[0], HOME_EYE[1], HOME_EYE[2])
    const c = lakeCentre()
    cam.lookAt(new Vector3(c.x, LAKE_Y, c.z))
    cam.updateMatrixWorld()
    const p = new Vector3(c.x, LAKE_Y, c.z).project(cam)
    expect(Math.abs(p.x)).toBeLessThan(1)
    expect(Math.abs(p.y)).toBeLessThan(1)
  })

  it('is nowhere near any destination the camera stands at', () => {
    /* a flight that ends inside the lake plane would put the camera under the water */
    const c = lakeCentre()
    for (const d of Object.values(DESTINATIONS)) {
      const dy = d.eye[1] - LAKE_Y
      const flat = Math.hypot(d.eye[0] - c.x, d.eye[2] - c.z)
      /* either well above the surface, or outside the plane's footprint */
      expect(dy > 100 || flat > LAKE.r * 1.3).toBe(true)
    }
  })
})

describe('the water material', () => {
  it('takes the scene fog rather than keeping its own copy of it', () => {
    /* the lake fades into the same haze the land does, or its far shore stays sharp while
       everything around it softens */
    const scene = new Scene()
    scene.fog = new FogExp2(0x123456, 0.00002)
    buildLake(scene)
    expect((LAKE_U.fogColor.value as Color).getHex()).toBe(0x123456)
    expect(LAKE_U.fogDensity.value).toBeCloseTo(0.00002, 8)
  })

  it('never stops being a mirror, because this is a picture of a lake', () => {
    /* the honest Fresnel curve delivers Fuji as a grey smudge on navy at this depression angle */
    expect(LAKE_U.uReflMin.value).toBeGreaterThan(0.2)
    expect(LAKE_U.uReflPow.value).toBeLessThan(3)
  })

  it('is not a caster and not a receiver', () => {
    /* a lake with the mountain's shadow map painted on it is a lake with a hole in it */
    const scene = new Scene()
    const lake = buildLake(scene)
    expect(lake.mesh.castShadow).toBe(false)
    expect(lake.mesh.receiveShadow).toBe(false)
    expect(lake.mesh.renderOrder).toBe(1)
  })

  it('advances its own clock rather than reading the wall', () => {
    const scene = new Scene()
    const lake = buildLake(scene)
    const t0 = LAKE_U.uTime.value
    lake.tick(2)
    expect(LAKE_U.uTime.value).toBeCloseTo(t0 + 2, 6)
  })

  it('takes itself out of the scene when disposed', () => {
    const scene = new Scene()
    const lake = buildLake(scene)
    expect(scene.children).toContain(lake.mesh)
    lake.dispose()
    expect(scene.children).not.toContain(lake.mesh)
  })
})

describe('where the water ends', () => {
  it('is measured off the landscape, because nothing here draws a shoreline', () => {
    /* the mockup has a `lakeRadiusAt` -- three sines, the same curve that generates its shore mesh.
       This port's water is one flat square and its visible edge is wherever the terrain rises
       through it, so the shore is a fact about the ground and the heightfield already knows it. */
    const shore = lakeShore((x, z) => {
      const c = lakeCentre()
      /* a bowl 2,000 units across, sitting in ground well above the water */
      return Math.hypot(x - c.x, z - c.z) < 2000 ? LAKE_Y - 300 : LAKE_Y + 300
    })
    expect(shore.min).toBeGreaterThan(1900)
    expect(shore.max).toBeLessThan(2120)
    expect(shore.at(0)).toBeCloseTo(shore.at(Math.PI), -1)
  })

  it('never reaches past the plane that is drawn', () => {
    /* on about two fifths of this lake's bearings the terrain does not rise before the water simply
       stops, and a boat beyond the plane is a boat on grass with a reflection under it */
    const shore = lakeShore(() => LAKE_Y - 1000)
    expect(shore.max).toBeLessThanOrEqual(LAKE_HALF)
    expect(shore.min).toBeCloseTo(LAKE_HALF, 0)
  })

  it('wraps, so a boat crossing the seam does not jump', () => {
    let n = 0
    const shore = lakeShore(() => (n++ % 7 === 0 ? LAKE_Y + 1 : LAKE_Y - 1))
    const a = shore.at(-1e-4)
    const b = shore.at(Math.PI * 2 - 1e-4)
    expect(a).toBeCloseTo(b, 6)
  })
})

describe('the mirror', () => {
  it('renders at the view own shape rather than a square', () => {
    /* 768 square renders a 16:9 view into a 1:1 target and spends a third of its texels on
       nothing; matching the aspect is 34% fewer at the same effective resolution */
    expect(REFLECT_W / REFLECT_H).toBeCloseTo(16 / 9, 2)
  })

  it('clips above the water, not at it', () => {
    /* at exactly the surface the bank co-planar with it flickers in and out of the mirror */
    expect(REFLECT_CLIP_LIFT).toBeGreaterThan(0)
    expect(REFLECT_CLIP_LIFT).toBeLessThan(20)
  })
})
