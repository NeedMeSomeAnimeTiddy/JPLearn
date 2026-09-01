import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { GROUND_Y, TERRAIN, bakeHeightfield, flatField } from './heightfield'

/** a grid of points at a given height, named so the bake will take it */
function slab(name: string, y: number, span = 100, step = 10): Mesh {
  const v: number[] = []
  for (let x = 0; x <= span; x += step) for (let z = 0; z <= span; z += step) v.push(x, y, z)
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

describe('what counts as ground', () => {
  it('takes the terrain, the ranges and the mountain, under their real names', () => {
    for (const n of ['Landscape_Terrain_Terrain_001', 'Onsen_Surfaces_TownGround_001',
      'Landscape_Props_Fuji_001', 'inst:Landscape_Props_Range_004',
      'Landscape_Props_FarRange_007']) {
      expect(TERRAIN.test(n)).toBe(true)
    }
  })

  it('leaves the things standing on it alone', () => {
    for (const n of ['PROP_inn_1', 'Nature_Wildlife_Chochin_001', 'SkyDome']) {
      expect(TERRAIN.test(n)).toBe(false)
    }
  })

  it('is not the forest, which is the bug this test did not catch the first time', () => {
    /* the first version of this regexp was the atmosphere's landform test, and `fuji` unanchored
       and case-insensitive matches every tree on the mountain. 9,049 nodes, mostly cedar, so the
       "ground" it baked was the canopy -- and nothing consumed the field, so it shipped. */
    for (const n of ['Fuji_Forest_Sugi0_004', 'Fuji_Forest_Grass1_112', 'Fuji_Props_Rock3_009',
      'inst:Fuji_Forest_Hinoki0_001']) {
      expect(TERRAIN.test(n)).toBe(false)
    }
  })
})

describe('baking the field', () => {
  it('reads back the height it was given', () => {
    const f = bakeHeightfield(world(slab('Landscape_Terrain_A', 42)), 16)
    expect(f.at(50, 50)).toBeCloseTo(42, 3)
  })

  it('takes the highest vertex in a cell, not the last one written', () => {
    /* a terrain mesh has undersides, cliff backfaces and anything tucked below it; the last
       vertex written is a coin toss per cell and reads as noise in the ground */
    const low = slab('Landscape_Terrain_Under', -500)
    const high = slab('Landscape_Terrain_Top', 120)
    expect(bakeHeightfield(world(low, high), 16).at(50, 50)).toBeCloseTo(120, 3)
    /* and the other order gives the same answer, which is the whole point */
    expect(bakeHeightfield(world(high, low), 16).at(50, 50)).toBeCloseTo(120, 3)
  })

  it('interpolates between cells rather than stepping', () => {
    const ramp = new BufferGeometry()
    const v: number[] = []
    for (let x = 0; x <= 100; x += 10) for (let z = 0; z <= 100; z += 10) v.push(x, x, z)
    ramp.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
    const m = new Mesh(ramp, new MeshBasicMaterial())
    m.name = 'Landscape_Terrain_Ramp'
    const f = bakeHeightfield(world(m), 32)
    /* halfway up a ramp from 0 to 100 is about 50, and a nearest-cell read would be a staircase */
    expect(f.at(50, 50)).toBeGreaterThan(40)
    expect(f.at(50, 50)).toBeLessThan(60)
    expect(f.at(25, 50)).toBeLessThan(f.at(75, 50))
  })

  it('fills the cells no vertex landed in rather than leaving them NaN', () => {
    /* a hole is a place the mesh is coarser than the grid; NaN would poison every placement
       downstream silently instead of loudly */
    const f = bakeHeightfield(world(slab('Landscape_Terrain_Coarse', 7, 100, 50)), 64)
    expect(f.stats.holes).toBeGreaterThan(0)
    for (let k = 0; k < f.data.length; k++) expect(Number.isNaN(f.data[k])).toBe(false)
    expect(f.at(50, 50)).toBeCloseTo(7, 1)
  })

  it('walks an instanced batch rather than piling every copy on one spot', () => {
    /* the terrain is not batched, but a range might be -- and splatting local vertices through
       the batch's identity matrix would put all of them at the origin */
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 5, 0, 1, 5, 0, 0, 5, 1]), 3))
    const inst = new InstancedMesh(g, new MeshBasicMaterial(), 2)
    inst.name = 'inst:Landscape_Props_Range_001'
    inst.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 0))
    inst.setMatrixAt(1, new Matrix4().makeTranslation(200, 60, 200))
    inst.instanceMatrix.needsUpdate = true
    const f = bakeHeightfield(world(inst), 32)
    expect(f.stats.max).toBeCloseTo(65, 0)
  })

  it('clamps outside its own bounds instead of reading off the end', () => {
    const f = bakeHeightfield(world(slab('Landscape_Terrain_A', 9)), 16)
    expect(f.at(-99999, -99999)).toBeCloseTo(9, 1)
    expect(f.at(99999, 99999)).toBeCloseTo(9, 1)
  })

  it('answers flat ground for a world with no terrain in it', () => {
    /* `?valley=off` is a supported boot and a failed load is a supported outcome; everything
       downstream asks this the same way either way */
    const f = bakeHeightfield(world(slab('PROP_inn_1', 500)), 16)
    expect(f.at(0, 0)).toBe(GROUND_Y)
    expect(f.stats.cells).toBe(0)
  })

  it('has a flat field that answers like a real one', () => {
    const f = flatField(-12)
    expect(f.at(1e6, -1e6)).toBe(-12)
    expect(f.n).toBe(1)
  })
})
