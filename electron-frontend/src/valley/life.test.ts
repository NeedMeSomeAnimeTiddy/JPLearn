import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D,
  Scene, Vector3,
} from 'three'
import { PROP_LIFE, buildLife, lifeYaw } from './life'
import { LAKE_Y, lakeCentre, type Shore } from './lake'

/** a box mesh of a given size, so the wake can be derived from it */
function prop(name: string, at: Vector3, sx = 200, sy = 100, sz = 60): Mesh {
  const v = [
    -sx / 2, -sy / 2, -sz / 2, sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2,
  ]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  const m = new Mesh(g, new MeshStandardMaterial())
  m.name = name
  m.position.copy(at)
  m.updateMatrix()
  return m
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

/** a perfectly round lake, so a test can reason about where a boat is */
const round = (r: number): Shore => ({ at: () => r, min: r, max: r })

const C = lakeCentre()
/** a point at radius r and bearing a from the lake's centre */
const onLake = (r: number, a: number) =>
  new Vector3(C.x + Math.cos(a) * r, LAKE_Y + 12, C.z + Math.sin(a) * r)

describe('what moves and how', () => {
  it('matches the props this world actually carries', () => {
    const hit = (n: string) => PROP_LIFE.find((r) => r.m.test(n))?.kind
    expect(hit('Nature_Wildlife_Boat0_001')).toBe('sail')
    expect(hit('Nature_Wildlife_Duck1_022')).toBe('swim')
    expect(hit('Garden_People_Koi2_003')).toBe('swim')
    expect(hit('Festival_Structures_Nobori0_001')).toBe('sway')
  })

  it('puts MonkeyBath before Monkey, or the second rule swallows the first', () => {
    const bath = PROP_LIFE.findIndex((r) => r.m.test('Onsen_People_MonkeyBath_001'))
    const monkey = PROP_LIFE.findIndex((r) => r.m.test('Onsen_People_Monkey_001'))
    expect(bath).toBeLessThan(monkey)
    /* and they are different rules -- a monkey in a bath bobs more than one sitting beside it */
    expect(PROP_LIFE[bath].y).not.toBe(PROP_LIFE[monkey].y)
  })

  it('leaves the people, the herons and the lanterns alone', () => {
    /* the herons stand in the shallows on one leg; a heron on a circle is a heron on a carousel */
    for (const n of ['Festival_People_Person0_001', 'Nature_Wildlife_Heron0_004',
      'Nature_Wildlife_Chochin_001', 'Torii_People_FoxKey_001']) {
      expect(PROP_LIFE.some((r) => r.m.test(n))).toBe(false)
    }
  })
})

describe('which way a model faces', () => {
  it('is a different atan2 per bow axis, not a sign flip', () => {
    /* a yaw about Y sends +Z to (sin, cos) and +X to (cos, -sin) -- obvious once a boat has been
       seen crabbing sideways across a lake and not before */
    const zBow = PROP_LIFE.find((r) => r.m.test('Garden_People_Koi0_001'))!
    const xBow = PROP_LIFE.find((r) => r.m.test('Nature_Wildlife_Boat0_001'))!
    expect(lifeYaw(zBow, 0, 1)).toBeCloseTo(0, 6)
    expect(lifeYaw(xBow, 1, 0)).toBeCloseTo(0, 6)
    /* travelling due +X, a Z-bowed model has to turn a quarter and an X-bowed one does not */
    expect(lifeYaw(zBow, 1, 0)).toBeCloseTo(Math.PI / 2, 6)
    expect(lifeYaw(xBow, 0, 1)).toBeCloseTo(-Math.PI / 2, 6)
  })
})

describe('the boats', () => {
  it('sail, and keep the distance in from the shore they were moored at', () => {
    const scene = new Scene()
    const boat = prop('Nature_Wildlife_Boat0_001', onLake(1500, 0))
    const f = buildLife(scene, world(boat), null, round(3000), null)
    expect(f.boats).toBe(1)
    /* a whole lap, in steps -- it never leaves the water and never reaches the middle */
    for (let k = 0; k < 200; k++) {
      f.tick(1)
      const r = Math.hypot(boat.matrix.elements[12] - C.x, boat.matrix.elements[14] - C.z)
      expect(r).toBeGreaterThan(3000 * 0.2)
      expect(r).toBeLessThan(3000 * 0.83)
    }
  })

  it('clamps a boat moored past the narrow shore back inside it', () => {
    /* two of the six really are moored further out than the lake's narrowest bearing, which is why
       a plain concentric circle beaches them within a quarter of a lap */
    const scene = new Scene()
    const boat = prop('Nature_Wildlife_Boat0_002', onLake(2900, 1))
    buildLife(scene, world(boat), null, round(3000), null)
    for (let k = 0; k < 50; k++) {
      const r = Math.hypot(boat.matrix.elements[12] - C.x, boat.matrix.elements[14] - C.z)
      expect(r).toBeLessThanOrEqual(3000 * 0.82 + 1)
    }
  })

  it('stays moored when there is no water to sail', () => {
    /* `?water=off` is a supported boot, and a boat with nowhere to go should do what a moored boat
       does rather than sail across a field */
    const scene = new Scene()
    const boat = prop('Nature_Wildlife_Boat0_003', onLake(1500, 2))
    const before = boat.position.clone()
    const f = buildLife(scene, world(boat), null, null, null)
    f.tick(10)
    expect(boat.position.distanceTo(before)).toBe(0)
    expect(f.wakes).toBe(0)
  })

  it('drives a plain mesh through its matrix, and stops three overwriting it', () => {
    /* the tick welds by writing `o.matrix`, and three rebuilds that from position/quaternion/scale
       every frame unless told not to -- so the write happens and nothing arrives */
    const scene = new Scene()
    const boat = prop('Nature_Wildlife_Boat0_004', onLake(1500, 3))
    buildLife(scene, world(boat), null, round(3000), null)
    expect(boat.matrixAutoUpdate).toBe(false)
  })

  it('never casts, because the shadow map is built once', () => {
    const scene = new Scene()
    const boat = prop('Nature_Wildlife_Boat0_005', onLake(1500, 4))
    boat.castShadow = true
    buildLife(scene, world(boat), null, round(3000), null)
    expect(boat.castShadow).toBe(false)
  })
})

describe('whoever is in the boat', () => {
  it('goes with the boat, keeping the pose it was authored in', () => {
    const scene = new Scene()
    const at = onLake(1500, 0)
    const boat = prop('Nature_Wildlife_Boat0_001', at)
    const rider = prop('Nature_Wildlife_Person0_001', at.clone().add(new Vector3(30, 20, 0)), 20, 60, 20)
    const f = buildLife(scene, world(boat, rider), null, round(3000), null)
    expect(f.riders).toBe(1)
    const gap = () => Math.hypot(
      rider.matrix.elements[12] - boat.matrix.elements[12],
      rider.matrix.elements[13] - boat.matrix.elements[13],
      rider.matrix.elements[14] - boat.matrix.elements[14],
    )
    const start = gap()
    for (let k = 0; k < 40; k++) f.tick(1)
    /* the weld is boat_now * boat_authored-inverse * rider_authored, so nothing is re-derived and
       the passenger cannot drift off the stern */
    expect(gap()).toBeCloseTo(start, 3)
  })

  it('does not take the water, the hull or a duck aboard', () => {
    const scene = new Scene()
    const at = onLake(1500, 0)
    const f = buildLife(scene, world(
      prop('Nature_Wildlife_Boat0_001', at),
      prop('Nature_Wildlife_Duck0_009', at.clone().add(new Vector3(20, 0, 0)), 30, 16, 14),
      prop('Garden_Surfaces_GardenWater_001', at.clone(), 400, 1, 400),
    ), null, round(3000), null)
    expect(f.riders).toBe(0)
  })

  it('lifts a passenger out of the crowd, where the idle would shiver it', () => {
    /* the idle hashes its phase off the instance's own POSITION -- right for a thousand people who
       never move, wrong for one the boat carries a little further every frame */
    const scene = new Scene()
    const at = onLake(1500, 0)
    const boat = prop('Nature_Wildlife_Boat0_001', at)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 60, 0, 0, 60, 1]), 3))
    const crowdMesh = new InstancedMesh(g, new MeshStandardMaterial(), 2)
    crowdMesh.name = 'inst:Festival_People_Person0_001'
    crowdMesh.setMatrixAt(0, new Matrix4().makeTranslation(at.x + 20, at.y, at.z))
    crowdMesh.setMatrixAt(1, new Matrix4().makeTranslation(90000, 0, 90000))
    const crowd = {
      figures: 2, lifted: 0, meshes: [crowdMesh], models: [], source: new MeshStandardMaterial(),
      material: null, tick: () => {},
    }
    const f = buildLife(scene, world(boat, crowdMesh), crowd, round(3000), null)
    expect(f.riders).toBe(1)
    /* its place in the crowd is scaled to nothing rather than left standing on the water */
    const m = new Matrix4()
    crowdMesh.getMatrixAt(0, m)
    expect(m.elements[0]).toBe(0)
    /* and the one who was nowhere near a boat is untouched */
    crowdMesh.getMatrixAt(1, m)
    expect(m.elements[12]).toBe(90000)
  })
})

describe('the wake', () => {
  it('goes to everything that moves through water and nothing that does not', () => {
    const scene = new Scene()
    const at = onLake(1500, 0)
    const f = buildLife(scene, world(
      prop('Nature_Wildlife_Boat0_001', at),
      prop('Nature_Wildlife_Duck0_001', onLake(1400, 0.2), 30, 16, 14),
      prop('Festival_Structures_Nobori0_001', new Vector3(100, 0, 100), 20, 120, 20),
      /* and the steam columns are `steam.ts`'s vent list now, so they are not items at all */
      prop('Onsen_Props_Steam_001', new Vector3(0, 0, 0), 20, 82, 20),
    ), null, round(3000), null)
    expect(f.items).toBe(3)
    expect(f.wakes).toBe(2)
  })

  it('is sized off the hull rather than off a number somebody typed', () => {
    /* the mockup gives absolute units for a 214-unit boat and a 30-unit duck; multiples of the
       hull survive a re-export that resizes either */
    const boat = PROP_LIFE.find((r) => r.m.test('Nature_Wildlife_Boat0_001'))!
    const duck = PROP_LIFE.find((r) => r.m.test('Nature_Wildlife_Duck0_001'))!
    expect(boat.wake![0] * 214).toBeCloseTo(560, -2)
    expect(duck.wake![0] * 30).toBeCloseTo(110, -1)
    /* and the stem is about half the hull, which is what puts the V's point at the bow rather than
       halfway down the boat */
    expect(boat.wake![2]).toBeCloseTo(0.5, 1)
  })
})

describe('the still things', () => {
  it('has handed the twelve steam columns over to the plumes', () => {
    /* two kinds of steam in one town did not agree: solid modelled columns beside soft sprite
       plumes. The props are `steam.ts`'s vent list now -- the siting is still Robbie's and there
       is one kind of steam in the valley. */
    expect(PROP_LIFE.some((r) => r.m.test('Onsen_Props_Steam_007'))).toBe(false)
  })

  it('advances its own clock rather than reading the wall', () => {
    const scene = new Scene()
    const b = prop('Festival_Structures_Nobori0_001', new Vector3(0, 0, 0), 20, 120, 20)
    const f = buildLife(scene, world(b), null, null, null)
    const before = b.matrix.elements[0]
    f.tick(1.7)
    expect(b.matrix.elements[0]).not.toBe(before)
  })
})
