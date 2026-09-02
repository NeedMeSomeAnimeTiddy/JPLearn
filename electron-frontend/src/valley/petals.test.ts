import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D,
  Scene, Vector3,
} from 'three'
import { PETAL, PETAL_KINDS, buildPetals } from './petals'
import { WIND_DIR } from './atmosphere'
import { HOME_EYE } from './flight'

/** a canopy: a box `w` across sitting between `bot` and `top` */
function tree(name: string, x: number, z: number, bot = 0, top = 400, w = 300): Mesh {
  const h = w / 2
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    x - h, bot, z - h, x + h, top, z + h, x - h, top, z + h,
  ]), 3))
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

/** every petal's world position, out of the instance matrices */
function positions(f: ReturnType<typeof buildPetals>): Vector3[] {
  const out: Vector3[] = []
  const m = new Matrix4()
  for (const mesh of f.meshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      out.push(new Vector3().setFromMatrixPosition(m))
    }
  }
  return out
}

const nearHome = (dx = 0): [number, number] => [HOME_EYE[0] + dx, HOME_EYE[2] - 800]

describe('what sheds', () => {
  it('takes the blossom, the red maples and the ginkgo', () => {
    const kind = (n: string) => PETAL_KINDS.findIndex((k) => k.m.test(n))
    expect(kind('Pagoda_Vegetation_Sakura1_003')).toBe(0)
    expect(kind('Nature_Trees_MomijiR1_012')).toBe(1)
    expect(kind('Nature_Trees_Ginkgo0_001')).toBe(2)
  })

  it('leaves a maple that is still in green leaf alone', () => {
    /* 110 of the 144 maples in this world are `MomijiG`, and the mockup drops orange leaves off
       every one of them. A maple in green leaf does not shed. */
    for (const n of ['Nature_Trees_MomijiG1_045', 'Festival_Vegetation_MomijiG1_002',
      'Zen_Garden_GreenTree_001']) {
      expect(PETAL_KINDS.some((k) => k.m.test(n))).toBe(false)
    }
  })

  it('leaves the pines and the groundcover alone', () => {
    for (const n of ['Fuji_Forest_Sugi0_112', 'Nature_GroundCover_FlwW_004',
      'Fuji_Forest_Azalea1_009']) {
      expect(PETAL_KINDS.some((k) => k.m.test(n))).toBe(false)
    }
  })
})

describe('how many, and off which trees', () => {
  it('gives every tree some, so none stands bare forever', () => {
    /* `reach` is a weight rather than a gate: the mockup's first version rejected any tree beyond
       3,400 of a camera stop, which left two fifths of them shedding and the rest bare */
    const near = tree('Pagoda_Vegetation_Sakura1_001', ...nearHome())
    const far = tree('Pagoda_Vegetation_Sakura1_002', 30000, 30000)
    const f = buildPetals(new Scene(), world(near, far))
    expect(f.sources).toBe(2)
    expect(f.nearSources).toBe(1)
    expect(f.petals).toBe(PETAL.near + PETAL.far)
  })

  it('counts per tree rather than dividing a total, so the last one is not left out', () => {
    /* the mockup's `src[i % src.length]` silently gave the last few trees nothing whenever the
       count was not a multiple */
    const trees = Array.from({ length: 7 }, (_, i) =>
      tree(`Pagoda_Vegetation_Sakura1_00${i}`, 30000 + i * 900, 30000))
    const f = buildPetals(new Scene(), world(...trees))
    expect(f.petals).toBe(7 * PETAL.far)
  })

  it('walks the members of an instanced set rather than piling them at the batch', () => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([
      -150, 0, -150, 150, 400, 150, -150, 400, 150,
    ]), 3))
    const inst = new InstancedMesh(g, new MeshBasicMaterial(), 2)
    inst.name = 'inst:Pagoda_Vegetation_Sakura1_001'
    inst.setMatrixAt(0, new Matrix4().makeTranslation(30000, 0, 30000))
    inst.setMatrixAt(1, new Matrix4().makeTranslation(34000, 0, 30000))
    const f = buildPetals(new Scene(), world(inst))
    expect(f.sources).toBe(2)
    const xs = positions(f).map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3000)
  })
})

describe('where a petal starts and where it goes', () => {
  it('lets go at the drip line, not inside the foliage', () => {
    /* the inner half of a canopy disc is opaque leaves, and a petal there is not falling visibly,
       it is occluded */
    const t = tree('Pagoda_Vegetation_Sakura1_001', ...nearHome())
    const f = buildPetals(new Scene(), world(t))
    /* the source radius is 0.42 of the smaller footprint, and the ring is 0.74 to 1.16 of that */
    const r = 300 * 0.42
    for (const p of positions(f)) {
      const d = Math.hypot(p.x - nearHome()[0], p.z - nearHome()[1])
      expect(d).toBeGreaterThan(r * PETAL.ring[0] * 0.9)
      expect(d).toBeLessThan(r * PETAL.ring[1] * 1.1)
    }
  })

  it('scatters down the whole fall on the first frame, not all at the top', () => {
    const t = tree('Pagoda_Vegetation_Sakura1_001', ...nearHome(), 0, 400)
    const f = buildPetals(new Scene(), world(t))
    const ys = positions(f).map((p) => p.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100)
  })

  it('falls, and blows the way the weather blows', () => {
    /* a valley where the blossom goes one way and the cloud shadow crosses it the other is a
       valley with two weathers in it */
    const t = tree('Pagoda_Vegetation_Sakura1_001', ...nearHome(), -4000, 4000, 300)
    const f = buildPetals(new Scene(), world(t))
    const before = positions(f)
    f.tick(4)
    const after = positions(f)
    let downwind = 0
    for (let i = 0; i < before.length; i++) {
      expect(after[i].y).toBeLessThan(before[i].y)
      const dx = after[i].x - before[i].x
      const dz = after[i].z - before[i].z
      if (dx * WIND_DIR.x + dz * WIND_DIR.y > 0) downwind++
    }
    expect(downwind).toBe(before.length)
  })

  it('glides at about forty-five degrees, so it clears its own canopy', () => {
    /* the mockup began at a 73-degree glide and measured 248 of 540 petals recycling inside a
       second and a half, every one living and dying in the top of the foliage */
    expect(PETAL.drift * 300 / PETAL.fall).toBeCloseTo(1, 1)
  })

  it('starts again at the top rather than streaming across the valley', () => {
    /* thirty seconds of wind at a third of its speed is nearly three thousand units, and petals
       in a ribbon across the valley are weather, not blossom */
    const t = tree('Pagoda_Vegetation_Sakura1_001', ...nearHome(), -4000, 4000, 300)
    const f = buildPetals(new Scene(), world(t))
    for (let k = 0; k < 400; k++) f.tick(0.25)
    for (const p of positions(f)) {
      expect(Math.hypot(p.x - nearHome()[0], p.z - nearHome()[1]))
        .toBeLessThanOrEqual(PETAL.wander + 1)
      expect(p.y).toBeGreaterThanOrEqual(-4000)
    }
  })

  it('is repeatable, so a shot can be taken twice', () => {
    /* the mockup reaches for Math.random here and nowhere else, which makes the one system in the
       world whose first frame cannot be photographed twice */
    const a = positions(buildPetals(new Scene(), world(tree('Pagoda_Vegetation_Sakura1_001', ...nearHome()))))
    const b = positions(buildPetals(new Scene(), world(tree('Pagoda_Vegetation_Sakura1_001', ...nearHome()))))
    expect(a.map((p) => p.toArray())).toEqual(b.map((p) => p.toArray()))
  })

  it('does not put a petal back where it just came from', () => {
    const t = tree('Pagoda_Vegetation_Sakura1_001', ...nearHome(), 0, 400)
    const f = buildPetals(new Scene(), world(t))
    const seen = new Set<string>()
    for (let k = 0; k < 60; k++) {
      f.tick(2)
      for (const p of positions(f)) seen.add(`${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    }
    /* every re-seed draws its own numbers rather than replaying the first life's */
    expect(seen.size).toBeGreaterThan(f.petals * 20)
  })
})

describe('the night', () => {
  it('goes dark rather than glowing at midnight', () => {
    /* unlit keeps a tumbling quad a petal instead of a silhouette, but unlit also means it does
       not know the sun has set */
    const f = buildPetals(new Scene(), world(tree('Pagoda_Vegetation_Sakura1_001', ...nearHome())))
    const mat = f.meshes[0].material as MeshBasicMaterial
    const day = mat.color.clone()
    const lit = day.r + day.g + day.b
    f.setNight(1)
    /* down to what it was, less `PETAL.night` of it -- a ratio rather than a level, because the
       three petal colours start at different brightnesses */
    expect((mat.color.r + mat.color.g + mat.color.b) / lit).toBeCloseTo(1 - PETAL.night, 3)
    f.setNight(0.5)
    expect((mat.color.r + mat.color.g + mat.color.b) / lit).toBeCloseTo(1 - PETAL.night / 2, 3)
    f.setNight(0)
    expect(mat.color.getHex()).toBe(day.getHex())
  })

  it('does not cast, because the shadow map is built once', () => {
    const f = buildPetals(new Scene(), world(tree('Pagoda_Vegetation_Sakura1_001', ...nearHome())))
    expect(f.meshes[0].castShadow).toBe(false)
    expect(f.meshes[0].frustumCulled).toBe(false)
  })

  it('takes itself out of the scene when disposed', () => {
    const scene = new Scene()
    const f = buildPetals(scene, world(tree('Pagoda_Vegetation_Sakura1_001', ...nearHome())))
    expect(scene.children).toContain(f.meshes[0])
    f.dispose()
    expect(scene.children).not.toContain(f.meshes[0])
  })
})
