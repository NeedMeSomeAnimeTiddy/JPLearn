import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D,
  Quaternion, Vector3,
} from 'three'
import { BIRD, BIRD_RE, buildBirds } from './birds'

function flock(name: string, poses: { at: Vector3; yaw: number }[]): InstancedMesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, -12, 0, 0, 12, 7, 0, 0]), 3))
  const m = new InstancedMesh(g, new MeshBasicMaterial(), poses.length)
  m.name = name
  poses.forEach((p, i) => {
    m.setMatrixAt(i, new Matrix4().compose(
      p.at,
      new Quaternion().setFromEuler(new Euler(0, p.yaw, 0, 'YXZ')),
      new Vector3(1, 1, 1),
    ))
  })
  return m
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

const posOf = (m: InstancedMesh, i: number): Vector3 => {
  const x = new Matrix4()
  m.getMatrixAt(i, x)
  return new Vector3().setFromMatrixPosition(x)
}

describe('who is a bird', () => {
  it('takes the birds and survives the batching rename', () => {
    expect(BIRD_RE.test('inst:Nature_Wildlife_Bird0_001')).toBe(true)
    expect(BIRD_RE.test('Nature_Wildlife_Bird1_014')).toBe(true)
  })

  it('leaves the herons standing in the shallows', () => {
    /* they are not airborne and they are not on a circuit; the still-things table has them */
    expect(BIRD_RE.test('Nature_Wildlife_Heron0_004')).toBe(false)
    expect(BIRD_RE.test('Nature_Wildlife_Duck0_009')).toBe(false)
  })

  it('takes only instanced sets, whose matrices are the members own', () => {
    const plain = new Object3D()
    plain.name = 'Nature_Wildlife_Bird0_001'
    expect(buildBirds(world(plain)).birds).toBe(0)
  })
})

describe('the circuit is derived from the placement', () => {
  it('starts exactly where the bird was put', () => {
    /* all 107 were aimed by hand and the instruction those placements carry is that they are
       starting points, not fixed positions -- so nothing is authored twice, and the first frame is
       still Robbie's. Solving the centre against the t = 0 breathe and wander is what buys this:
       without it the mockup's arithmetic puts a bird up to 840 units from its own placement before
       anything has moved. */
    for (const yaw of [0.7, -2.1, 0]) {
      const at = new Vector3(1200, 900, -400)
      const m = flock(`Nature_Wildlife_Bird0_00${Math.round(yaw * 10 + 30)}`, [{ at, yaw }])
      buildBirds(world(m))
      expect(posOf(m, 0).distanceTo(at)).toBeLessThan(1)
    }
  })

  it('runs tangent to the way it was pointed', () => {
    /* the centre sits one radius off to the side it turns towards, which is what makes the circle
       do both at once */
    const at = new Vector3(0, 900, 0)
    for (const yaw of [0, 0.9, 2.4, -1.7]) {
      const m = flock(`Nature_Wildlife_Bird0_00${Math.round(yaw * 10 + 20)}`, [{ at, yaw }])
      const f = buildBirds(world(m))
      const before = posOf(m, 0)
      f.tick(0.35)
      const step = posOf(m, 0).sub(before).setY(0).normalize()
      const heading = new Vector3(0, 0, 1)
        .applyQuaternion(new Quaternion().setFromEuler(new Euler(0, yaw, 0, 'YXZ')))
        .setY(0).normalize()
      /* travelling the way it was aimed, forwards or backwards round its own circle */
      expect(Math.abs(step.dot(heading))).toBeGreaterThan(0.99)
    }
  })

  it('rides a thermal that its placement is a point ON, not the middle of', () => {
    /* the placed height is where the bird IS on the first frame; the ride is around it, which is
       why the thermal's centre is up to `bob` off the placement rather than on it */
    const at = new Vector3(0, 900, 0)
    const m = flock('Nature_Wildlife_Bird0_001', [{ at, yaw: 0 }])
    const f = buildBirds(world(m))
    expect(posOf(m, 0).y).toBeCloseTo(900, 3)
    let lo = Infinity
    let hi = -Infinity
    for (let k = 0; k < 400; k++) { f.tick(0.25); const y = posOf(m, 0).y; lo = Math.min(lo, y); hi = Math.max(hi, y) }
    expect(hi - lo).toBeCloseTo(2 * BIRD.bob, -1)
    expect(Math.abs((hi + lo) / 2 - 900)).toBeLessThanOrEqual(BIRD.bob)
  })

  it('gives each bird its own circuit rather than a shared one', () => {
    const m = flock('Nature_Wildlife_Bird0_001', [
      { at: new Vector3(0, 900, 0), yaw: 0 },
      { at: new Vector3(80, 900, 0), yaw: 0 },
    ])
    const f = buildBirds(world(m))
    f.tick(4)
    /* two birds placed eighty units apart on the same heading do not fly in formation */
    expect(Math.abs(posOf(m, 0).distanceTo(posOf(m, 1)) - 80)).toBeGreaterThan(5)
  })
})

describe('what stops a circle looking like a circle', () => {
  it('beats the silhouette, narrowing the span and deepening the profile', () => {
    /* a wing folds up, and at a dozen pixels the shape is all there is to see. Doing it in the
       matrix rather than in a vertex shader keeps it out of any future outline pass. */
    /* A FLOCK AND A LONG RUN, because neither is optional to measure this. The beat is the wing
       clock times this bird's own `flap` (0.35 to 1.0 -- some are crows and some are kites) times a
       gust envelope whose period is twelve to thirty seconds. One bird over four seconds can be a
       quiet kite in a lull, which is exactly what the first version of this test caught: 0.854. */
    const m = flock('Nature_Wildlife_Bird0_001', Array.from({ length: 12 }, (_, i) => ({
      at: new Vector3(i * 300, 900, 0), yaw: i * 0.4,
    })))
    const f = buildBirds(world(m))
    const x = new Matrix4()
    const s = new Vector3()
    let minSpan = Infinity
    let maxSpan = -Infinity
    let minRise = Infinity
    let maxRise = -Infinity
    for (let k = 0; k < 1600; k++) {
      f.tick(0.02)
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, x)
        x.decompose(new Vector3(), new Quaternion(), s)
        minSpan = Math.min(minSpan, s.x)
        maxSpan = Math.max(maxSpan, s.x)
        minRise = Math.min(minRise, s.y)
        maxRise = Math.max(maxRise, s.y)
      }
    }
    /* the span folds to well under half and opens back to full */
    expect(minSpan).toBeLessThan(0.6)
    expect(maxSpan).toBeCloseTo(1, 2)
    /* and the profile deepens as the span narrows, which is what a folding wing does */
    expect(minRise).toBeCloseTo(1, 2)
    expect(maxRise).toBeGreaterThan(1.4)
  })

  it('never repeats a lap exactly', () => {
    const m = flock('Nature_Wildlife_Bird0_001', [{ at: new Vector3(0, 900, 0), yaw: 0 }])
    const f = buildBirds(world(m))
    const seen: Vector3[] = []
    for (let k = 0; k < 3; k++) {
      /* a whole lap at this radius, roughly */
      f.tick(20)
      seen.push(posOf(m, 0))
    }
    expect(seen[0].distanceTo(seen[1])).toBeGreaterThan(1)
    expect(seen[1].distanceTo(seen[2])).toBeGreaterThan(1)
  })
})

describe('what a bird must not do', () => {
  it('does not cast, because the shadow map is built once', () => {
    const m = flock('Nature_Wildlife_Bird0_001', [{ at: new Vector3(0, 900, 0), yaw: 0 }])
    m.castShadow = true
    buildBirds(world(m))
    expect(m.castShadow).toBe(false)
  })

  it('is not culled against a sphere it has long since left', () => {
    const m = flock('Nature_Wildlife_Bird0_001', [{ at: new Vector3(0, 900, 0), yaw: 0 }])
    buildBirds(world(m))
    expect(m.frustumCulled).toBe(false)
  })

  it('is paced to the height the people in this world actually are', () => {
    /* 7 m/s at 37 units to the metre. The mockup's 205 comes from its stale "29 units to the
       metre", the same figure that had its walkers 27% too slow. */
    expect(BIRD.speed / 205).toBeCloseTo(65.5 / 51.5, 1)
  })
})
