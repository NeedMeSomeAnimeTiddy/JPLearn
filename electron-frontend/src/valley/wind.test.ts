import { describe, expect, it } from 'vitest'
import { Matrix4, Scene } from 'three'
import { WIND, buildWind } from './wind'
import { SWAY } from './sway'
import { LAKE_U } from './lake'

function field() {
  const scene = new Scene()
  const w = buildWind(scene)!
  return { scene, w }
}

/** what one wisp's instance matrix is carrying, by the packing the vertex shader reads back */
function wisp(mesh: { instanceMatrix: { array: ArrayLike<number> } }, i: number) {
  const a = mesh.instanceMatrix.array
  const m = new Matrix4().fromArray(Array.from(a).slice(i * 16, i * 16 + 16))
  const e = m.elements
  return {
    /* three stores column-major: element [c * 4 + r] */
    heading: [e[0], e[1], e[2]] as const,
    len: Math.hypot(e[0], e[1], e[2]),
    c1: e[4], wide: e[5], c2: e[6],
    phase: e[8], alpha: e[10],
    pos: [e[12], e[13], e[14]] as const,
  }
}

describe('the field', () => {
  it('allocates the pool and draws only part of it', () => {
    /* `n` is what is allocated and `shown` is what is drawn, so density is a dial rather than a
       reload -- the instances past `mesh.count` are simply not issued */
    const { w } = field()
    expect(w.pool).toBe(WIND.n)
    expect(w.shown).toBe(WIND.shown)
    expect(w.shown).toBeLessThan(w.pool)
    expect(w.mesh.count).toBe(WIND.shown)
    expect(w.mesh.instanceMatrix.count).toBe(WIND.n)
  })

  it('is named out of the ink pass', () => {
    /* a stroke of moving air with a line drawn round it is a piece of ribbon */
    const { w } = field()
    expect(w.mesh.name).toMatch(/^sun-/)
  })

  it('is not frustum culled, because its geometry is a unit plane at the origin', () => {
    const { w } = field()
    expect(w.mesh.frustumCulled).toBe(false)
  })

  it('has somewhere in the middle to be curved at', () => {
    /* a PlaneGeometry(1, 1) has ONE segment -- four vertices, all at u = 0 or u = 1, which is
       exactly where every term of the bow evaluates to zero. The mockup's whole field was dead
       straight for weeks because of this. */
    const { w } = field()
    const uv = w.mesh.geometry.getAttribute('uv')
    const us = new Set<number>()
    for (let i = 0; i < uv.count; i++) us.add(Math.round(uv.getX(i) * 1000) / 1000)
    expect(us.size).toBeGreaterThan(4)
  })

  it('draws over the world without writing depth', () => {
    const { w } = field()
    const mat = w.mesh.material as { transparent: boolean; depthWrite: boolean }
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
  })
})

describe('what a wisp carries', () => {
  it('packs four numbers into the unused columns of its own matrix', () => {
    /* no instanced attributes to allocate, upload or keep in step -- and the matrix was going to
       be uploaded every frame regardless, because these things move */
    const { w } = field()
    const s = wisp(w.mesh, 0)
    expect(s.len).toBeGreaterThanOrEqual(WIND.len[0] * 0.99)
    expect(s.len).toBeLessThanOrEqual(WIND.len[1] * 1.01)
    expect(s.wide).toBeGreaterThanOrEqual(WIND.wide[0])
    expect(s.wide).toBeLessThanOrEqual(WIND.wide[1])
    expect(s.alpha).toBeGreaterThan(0)
    expect(s.alpha).toBeLessThanOrEqual(1)
  })

  it('gives every stroke its own heading, or the field is a rack of parallel scratches', () => {
    const { w } = field()
    const dirs = Array.from({ length: 12 }, (_, i) => wisp(w.mesh, i).heading)
    const unit = dirs.map(([x, y, z]) => {
      const l = Math.hypot(x, y, z)
      return [x / l, y / l, z / l] as const
    })
    const same = unit.filter((d) => Math.abs(d[0] - unit[0][0]) < 1e-6).length
    expect(same).toBeLessThan(unit.length)
  })

  it('flies low, because a pale stroke needs something darker behind it', () => {
    /* the first field ran to 2,800 units and half of it sat against a sunset sky brighter than
       the strokes are: 74 in frame, up to 1,141 pixels long, not one of them readable */
    const { w } = field()
    for (let i = 0; i < WIND.n; i++) {
      const y = wisp(w.mesh, i).pos[1]
      expect(y).toBeGreaterThanOrEqual(WIND.box.y0 - 1)
      expect(y).toBeLessThanOrEqual(WIND.box.y1 + 1)
    }
  })

  it('staggers their ages, so they are not all born and do not all die together', () => {
    const { w } = field()
    const alphas = new Set(Array.from({ length: 20 }, (_, i) => wisp(w.mesh, i).alpha))
    expect(alphas.size).toBeGreaterThan(5)
  })
})

describe('the drift', () => {
  it('carries them down the wind', () => {
    /* ACROSS THE WHOLE FIELD, NOT ONE WISP. Their ages are staggered, so any single wisp may be
       the one that reaches the end of its life during this tick and is respawned somewhere else
       in the box entirely -- which is correct behaviour and would fail a one-wisp assertion
       about one frame in ten. */
    const { w } = field()
    const before = Array.from({ length: WIND.n }, (_, i) => wisp(w.mesh, i).pos)
    w.tick(1)
    const after = Array.from({ length: WIND.n }, (_, i) => wisp(w.mesh, i).pos)
    const d = SWAY.dir.value
    const downwind = before.filter((b, i) => Math.sign(after[i][0] - b[0]) === Math.sign(d.x))
    expect(downwind.length).toBeGreaterThan(WIND.n * 0.8)
  })

  it('advances the crawl, so a stroke reshapes itself rather than sliding as a rigid decal', () => {
    const { w } = field()
    const was = WIND.time.value
    w.tick(0.5)
    expect(WIND.time.value).toBeCloseTo(was + 0.5)
  })

  it('respawns a wisp that outlives its life instead of letting it fly forever', () => {
    /* at 300 units a second a wisp left alone for three minutes is fifty thousand units downwind
       -- three times outside the box it was born in, and long gone from any frame.

       THE BOUND IS THE BOX PLUS ONE FULL LIFETIME OF DRIFT, and it has to be: a wisp born at the
       downwind edge of the box travels for its whole life before anything resets it, so the
       honest ceiling is where the longest-lived, fastest wisp gets to from there. A tighter bound
       fails perhaps one run in three, which is exactly what it did. */
    const { w } = field()
    const reach = WIND.speed.value * 1.4 * WIND.life[1]
    for (let i = 0; i < 1800; i++) w.tick(0.1)
    const d = SWAY.dir.value
    for (let i = 0; i < WIND.n; i++) {
      const [x, , z] = wisp(w.mesh, i).pos
      expect(Math.abs(x)).toBeLessThanOrEqual(WIND.box.x + reach * Math.abs(d.x))
      expect(Math.abs(z)).toBeLessThanOrEqual(WIND.box.z + reach * Math.abs(d.z))
    }
  })

  it('fades a newborn in rather than popping it into the air', () => {
    const { w } = field()
    /* one wisp, walked just past its own life: the alpha has to collapse to the floor */
    let seen = false
    for (let i = 0; i < 400 && !seen; i++) {
      w.tick(0.05)
      if (wisp(w.mesh, 0).alpha <= 0.01) seen = true
    }
    expect(seen).toBe(true)
  })
})

describe('what it shares', () => {
  it('blows the wind the trees are bending in', () => {
    /* one Vector3 behind both, so turning the weather turns them together rather than leaving
       them disagreeing */
    expect(WIND.dir).toBe(SWAY.dir)
  })

  it('takes the same distance fog every other surface does', () => {
    const { w } = field()
    const u = (w.mesh.material as unknown as { uniforms: Record<string, unknown> }).uniforms
    expect(u.fogColor).toBe(LAKE_U.fogColor)
    expect(u.fogDensity).toBe(LAKE_U.fogDensity)
  })
})

describe('teardown', () => {
  it('takes itself out of the scene', () => {
    const { scene, w } = field()
    expect(scene.children).toContain(w.mesh)
    w.dispose()
    expect(scene.children).not.toContain(w.mesh)
  })
})
