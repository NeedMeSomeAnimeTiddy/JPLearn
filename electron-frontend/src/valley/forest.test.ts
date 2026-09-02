import { describe, expect, it } from 'vitest'
import {
  BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, SphereGeometry,
} from 'three'
import { REFLECT_FAR_MEAN, REFLECT_MIN_R, TREELINE, TREES_RE, buildForest } from './forest'

const WATER = { x: 0, z: 3000 }

/** an instanced set the way `collapseToInstances` leaves one: world matrices in the instance list */
function set(name: string, at: [number, number, number][], size = 100): InstancedMesh {
  const im = new InstancedMesh(
    new BoxGeometry(size, size, size), new MeshStandardMaterial(), at.length,
  )
  im.name = name
  const m = new Matrix4()
  at.forEach((p, i) => { im.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])) })
  im.instanceMatrix.needsUpdate = true
  im.frustumCulled = false
  return im
}

function world(...objects: Object3D[]): Object3D {
  const root = new Object3D()
  for (const o of objects) root.add(o)
  root.updateMatrixWorld(true)
  return root
}

describe('what counts as forest', () => {
  it('catches the three ways this world names trees, through the instancing prefix', () => {
    for (const n of [
      'inst:Festival_Vegetation_Sugi1_004', 'inst:Fuji_Forest_Fir0_112',
      'inst:Meadow_Nature_Trees_Keyaki_009',
    ]) expect(TREES_RE.test(n)).toBe(true)
  })

  it('leaves the buildings, the ground and the people out of it', () => {
    for (const n of ['inst:Onsen_Buildings_Bathhouse', 'Landscape_Props_Fuji_001',
      'inst:Festival_People_Person0_010']) expect(TREES_RE.test(n)).toBe(false)
  })
})

describe('the treeline', () => {
  it('leaves the valley floor exactly as it was authored', () => {
    /* the tint is a MULTIPLIER on the vertex colours, so 1 at the bottom of the band means the
       forest Robbie painted is the forest that is drawn */
    const trees = set('inst:Fuji_Forest_Sugi0', [[0, 0, 0], [10, TREELINE.from - 1, 0]])
    buildForest(world(trees), WATER)
    expect(trees.instanceColor).toBeTruthy()
    for (let i = 0; i < 2; i++) {
      expect(trees.instanceColor!.getX(i)).toBeCloseTo(1, 5)
      expect(trees.instanceColor!.getZ(i)).toBeCloseTo(1, 5)
    }
  })

  it('lightens and cools a tree as it climbs, and lifts blue hardest', () => {
    /* real alpine forest is thinner, paler and has more sky through it. Blue leads so the high
       wood separates from the warm valley green in front of it rather than just going grey. */
    const trees = set('inst:Fuji_Forest_Sugi0', [[0, TREELINE.to + 500, 0]])
    buildForest(world(trees), WATER)
    const c = trees.instanceColor!
    expect(c.getX(0)).toBeCloseTo(1 + TREELINE.lift[0], 5)
    expect(c.getZ(0)).toBeCloseTo(1 + TREELINE.lift[2], 5)
    expect(c.getZ(0)).toBeGreaterThan(c.getY(0))
    expect(c.getY(0)).toBeGreaterThan(c.getX(0))
  })

  it('is keyed on height and not on distance, because distance-keyed anything is fog', () => {
    /* a tree high on a ridge is painted paler whether you are standing under it or looking at it
       from across the valley -- this world is cel-shaded and has no business inventing haze */
    const near = set('inst:Fuji_Forest_Sugi0', [[0, 3000, 0]])
    const far = set('inst:Fuji_Forest_Sugi0', [[40000, 3000, 40000]])
    buildForest(world(near, far), WATER)
    expect(near.instanceColor!.getX(0)).toBeCloseTo(far.instanceColor!.getX(0), 5)
  })

  it('reports what it painted, because a silent pass is a pass nobody notices dying', () => {
    const st = buildForest(world(
      set('inst:Fuji_Forest_Sugi0', [[0, 0, 0]]),
      set('inst:Onsen_Buildings_Shop', [[0, 0, 0]]),
    ), WATER)
    expect(st.tinted).toBe(1)
  })
})

describe('letting the frustum do its job', () => {
  it('turns culling back on for every instanced set', () => {
    /* `collapseToInstances` disables it on all 143 of them, so the whole 70,000-unit map is drawn
       every frame while the menu looks at a slice of it */
    const trees = set('inst:Fuji_Forest_Sugi0', [[0, 0, 0]])
    const shop = set('inst:Onsen_Buildings_Shop', [[0, 0, 0]])
    buildForest(world(trees, shop), WATER)
    expect(trees.frustumCulled).toBe(true)
    expect(shop.frustumCulled).toBe(true)
  })

  it('computes the sphere across the instances, not from one of them', () => {
    /* THE REASON CULLING IS NORMALLY DISABLED ON AN InstancedMesh: three's default sphere comes
       off the GEOMETRY, which is one member's, so a set spread over ten thousand units vanishes
       the moment its origin leaves the frustum. */
    const spread = set('inst:Fuji_Forest_Sugi0', [[-5000, 0, 0], [5000, 0, 0]], 100)
    buildForest(world(spread), WATER)
    expect(spread.boundingSphere!.radius).toBeGreaterThan(5000)
  })

  it('leaves room for the vertex shaders that move things after the sphere is computed', () => {
    /* the sway and the crowd's idle both displace vertices, and a bounding sphere knows nothing
       about either -- a plant would pop out of the world a frame before it left the screen */
    const one = set('inst:Fuji_Forest_Sugi0', [[0, 0, 0]], 100)
    const bare = new InstancedMesh(new BoxGeometry(100, 100, 100), new MeshStandardMaterial(), 1)
    bare.setMatrixAt(0, new Matrix4())
    bare.computeBoundingSphere()
    buildForest(world(one), WATER)
    expect(one.boundingSphere!.radius).toBeGreaterThan(bare.boundingSphere!.radius)
  })
})

describe('what the mirror is not asked to draw', () => {
  it('drops a stand of trees that averages twenty thousand units from the water', () => {
    const far = set('inst:Fuji_Forest_Sugi0', [
      [0, 0, WATER.z + 20000], [0, 0, WATER.z + 24000],
    ], 400)
    const st = buildForest(world(far), WATER)
    expect(st.noReflect).toContain(far)
    expect(st.farCut).toBe(1)
  })

  it('keeps the near shore, which is the mistake that emptied the lake once', () => {
    /* THE MEASURE IS PER INSTANCE AND THAT IS THE WHOLE DIFFERENCE. Culling by a set's own
       bounding RADIUS took nine hundred near-shore trees out in one decision, because a set's
       radius is one MEMBER'S and says nothing about where the set stands. */
    const near = set('inst:Fuji_Forest_Sugi0', [
      [0, 0, WATER.z + 500], [0, 0, WATER.z - 500],
    ], 400)
    const st = buildForest(world(near), WATER)
    expect(st.noReflect).not.toContain(near)
  })

  it('has nothing sitting between the two, which is why one threshold works', () => {
    expect(REFLECT_FAR_MEAN).toBeGreaterThan(5000)
    expect(REFLECT_FAR_MEAN).toBeLessThan(20000)
  })

  it('drops ground clutter by its own radius, because a tuft is not a mass', () => {
    const tuft = new Mesh(new SphereGeometry(REFLECT_MIN_R * 0.5), new MeshStandardMaterial())
    tuft.name = 'Meadow_Ground_Grass'
    const st = buildForest(world(tuft), WATER)
    expect(st.noReflect).toContain(tuft)
    expect(st.smallCut).toBe(1)
  })

  it('puts an instanced set\'s own scale back before measuring it', () => {
    /* the geometry radius is one instance's at unit scale; the instances carry the size, so a
       small shape scaled up is not small */
    const big = new InstancedMesh(
      new SphereGeometry(REFLECT_MIN_R * 0.5), new MeshStandardMaterial(), 1,
    )
    big.name = 'Festival_Props_Stall'
    big.setMatrixAt(0, new Matrix4().makeScale(20, 20, 20))
    big.instanceMatrix.needsUpdate = true
    const st = buildForest(world(big), WATER)
    expect(st.noReflect).not.toContain(big)
  })

  it('keeps anything tree-sized, since in a reflection the forest IS the image', () => {
    const tree = new Mesh(new SphereGeometry(REFLECT_MIN_R * 2), new MeshStandardMaterial())
    tree.name = 'Meadow_Vegetation_Keyaki'
    const st = buildForest(world(tree), WATER)
    expect(st.noReflect).not.toContain(tree)
  })
})
