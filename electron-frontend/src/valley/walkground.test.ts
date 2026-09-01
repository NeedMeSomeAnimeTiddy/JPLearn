import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D,
} from 'three'
import {
  DECK_RISE, FLOOR_REACH, WALK_GROUND, WALK_NEVER, buildFooting, corridorCells, flatten, gridY,
} from './walkground'
import { flatField } from './heightfield'

/** two triangles making a square slab at height y, spanning x0..x1 by z0..z1 */
function slab(name: string, y: number, x0 = 0, x1 = 200, z0 = 0, z1 = 200): Mesh {
  const v = [
    x0, y, z0, x1, y, z0, x1, y, z1,
    x0, y, z0, x1, y, z1, x0, y, z1,
  ]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  const m = new Mesh(g, new MeshBasicMaterial())
  m.name = name
  return m
}

/** a vertical face, which is what a slab's skirt is */
function wall(name: string, x = 0, yLo = -500, yHi = 0): Mesh {
  const v = [x, yLo, 0, x, yHi, 0, x, yHi, 200, x, yLo, 0, x, yHi, 200, x, yLo, 200]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  const m = new Mesh(g, new MeshBasicMaterial())
  m.name = name
  return m
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

/** the whole of a small test world */
const EVERYWHERE = corridorCells([0, 0, 200, 0, 200, 200, 0, 200], 600)

describe('what is ground and what is never', () => {
  it('takes the terrain, the authored surfaces, the mountain and the ranges', () => {
    for (const n of ['Landscape_Terrain_Terrain_001', 'Onsen_Surfaces_TownGround_001',
      'Paths_Surfaces_OnsenSpine0_001', 'Landscape_Props_Fuji_001']) {
      expect(WALK_GROUND.test(n)).toBe(true)
    }
  })

  it('never stands anybody on the water or the sky', () => {
    for (const n of ['Garden_Surfaces_GardenWater_001', 'Onsen_Surfaces_OnsenPools_001',
      'Landscape_Props_SkyDome_001']) {
      expect(WALK_NEVER.test(n)).toBe(true)
    }
  })
})

describe('the corridor', () => {
  it('covers the polyline it is cut from, and closes it', () => {
    const cells = corridorCells([0, 0, 3000, 0], 0)
    /* the leg out and the leg back are the same cells, and a closed polygon returns to the start */
    expect(cells.size).toBeGreaterThan(9)
    expect(cells.size).toBeLessThan(14)
  })

  it('widens with the pad', () => {
    const thin = corridorCells([0, 0, 3000, 0], 0).size
    const fat = corridorCells([0, 0, 3000, 0], 600).size
    expect(fat).toBeGreaterThan(thin * 3)
  })
})

describe('flattening', () => {
  it('keeps what is in the corridor and throws away what is not', () => {
    const near = flatten([slab('Landscape_Terrain_A', 0)], EVERYWHERE)
    expect(near.tris).toBe(2)
    const far = flatten([slab('Landscape_Terrain_B', 0, 90000, 90200, 90000, 90200)], EVERYWHERE)
    expect(far.tris).toBe(0)
  })

  it('throws walls away rather than carrying a flag for them', () => {
    /* every authored ground slab in this world has a skirt, and a near-vertical triangle has a
       sliver of a footprint in XZ that a point can still land inside */
    const g = flatten([wall('Landscape_Terrain_Skirt')], EVERYWHERE)
    expect(g.walls).toBe(2)
    expect(g.tris).toBe(0)
  })

  it('skips instanced sets, whose matrixWorld is the batch and not the member', () => {
    /* flattening one through the group's identity would pile every copy at the origin */
    const s = slab('Landscape_Terrain_C', 0)
    const inst = new InstancedMesh(s.geometry, new MeshBasicMaterial(), 2)
    inst.name = 'inst:Landscape_Terrain_C'
    inst.setMatrixAt(0, new Matrix4())
    inst.setMatrixAt(1, new Matrix4().makeTranslation(400, 0, 400))
    expect(flatten([inst as unknown as Mesh], EVERYWHERE).tris).toBe(0)
  })

  it('reads a mesh through its own world matrix', () => {
    const s = slab('Landscape_Terrain_D', 0)
    s.position.set(0, 77, 0)
    const root = world(s)
    root.updateMatrixWorld(true)
    const g = flatten([s], EVERYWHERE)
    expect(gridY(g, 100, 100, -1000, 1000)).toBeCloseTo(77, 3)
  })
})

describe('the query', () => {
  it('takes the highest floor, not the last one written', () => {
    const g = flatten([
      slab('Landscape_Terrain_Low', -50),
      slab('Landscape_Terrain_High', 120),
    ], EVERYWHERE)
    expect(gridY(g, 100, 100, -1000, 1000)).toBeCloseTo(120, 3)
  })

  it('answers null where nothing is', () => {
    const g = flatten([slab('Landscape_Terrain_A', 0)], EVERYWHERE)
    expect(gridY(g, 100000, 100000, -1e9, 1e9)).toBeNull()
  })

  it('respects the window it is given', () => {
    const g = flatten([slab('Landscape_Terrain_A', 500)], EVERYWHERE)
    expect(gridY(g, 100, 100, -100, 100)).toBeNull()
  })
})

describe('standing on it', () => {
  it('will not stand a walker on the underside of a slab', () => {
    /* `Onsen_Surfaces_TownGround` is a slab whose bottom flange reaches further out than its top,
       so just past the edge of the street the only triangle over a point is the one facing DOWN
       380 units below it -- flat, so the wall test lets it through, and "highest wins" cannot help
       when it is the only candidate */
    const under = slab('Onsen_Surfaces_TownGround_Under', -380)
    const f = buildFooting(world(under), flatField(0), EVERYWHERE)
    expect(f.at(100, 100)).toBe(0)
    expect(f.at(100, 100)).toBeGreaterThan(-FLOOR_REACH)
  })

  it('does stand one on ground the field slightly disagrees with', () => {
    /* the field is the floor of the SEARCH, not the answer: the road really is above the terrain */
    const road = slab('Paths_Surfaces_OnsenSpine0', 38)
    const f = buildFooting(world(road), flatField(0), EVERYWHERE)
    expect(f.at(100, 100)).toBeCloseTo(38, 3)
  })

  it('steps up onto a floor laid over the ground', () => {
    /* the Valley loop crosses a decked floor 31 to 100 units up in the shrine approach, and the
       mockup's walkers went straight through it because it is a Prop and nothing had looked at one */
    const ground = slab('Landscape_Terrain_A', 0)
    const deck = slab('Legacy_Props_Mesh42_001', 60)
    const f = buildFooting(world(ground, deck), flatField(0), EVERYWHERE)
    expect(f.at(100, 100)).toBeCloseTo(60, 3)
  })

  it('does not step up onto a roof', () => {
    /* a floor is a flat surface you could step onto and a roof is not, and the difference is
       measurable without knowing what either is called: floors came in under a hundred units in
       the mockup's census, the next thing up was a prop at 170, everything above that was a roof */
    const ground = slab('Landscape_Terrain_A', 0)
    const roof = slab('Festival_Buildings_Yagura_Roof', DECK_RISE + 200)
    const f = buildFooting(world(ground, roof), flatField(0), EVERYWHERE)
    expect(f.at(100, 100)).toBeCloseTo(0, 3)
  })

  it('falls back to the field where the corridor holds nothing', () => {
    const f = buildFooting(world(slab('Landscape_Terrain_A', 0)), flatField(-123), EVERYWHERE)
    expect(f.at(80000, 80000)).toBe(-123)
  })
})
