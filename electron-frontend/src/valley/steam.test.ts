import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D,
  Scene, Vector3,
} from 'three'
import { COLD_FLOOR, PROP_STEAM_RE, STEAM_U, STEAM_VENTS, buildSteam } from './steam'
import { WIND_DIR } from './atmosphere'
import { PROP_LIFE } from './life'

/** a building: a box between `bot` and `top`, `w` across, centred at x,z */
function building(name: string, x: number, z: number, bot: number, top: number, w = 400,
  matName = 'JP_VertexColor'): Mesh {
  const h = w / 2
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    x - h, bot, z - h, x + h, top, z + h, x - h, top, z + h,
  ]), 3))
  const m = new Mesh(g, new MeshStandardMaterial({ name: matName }))
  m.name = name
  return m
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

/** every puff's vent, out of the translation column of its matrix */
function bases(f: ReturnType<typeof buildSteam>): Vector3[] {
  const out: Vector3[] = []
  const m = new Matrix4()
  if (!f.mesh) return out
  for (let i = 0; i < f.mesh.count; i++) {
    f.mesh.getMatrixAt(i, m)
    out.push(new Vector3(m.elements[12], m.elements[13], m.elements[14]))
  }
  return out
}

describe('where the steam comes from', () => {
  it('takes the baths, the hall, the pool and the two chimneys', () => {
    const hit = (n: string) => STEAM_VENTS.findIndex((v) => v.m.test(n))
    expect(hit('Onsen_Buildings_SotoYu_003')).toBe(0)
    expect(hit('Onsen_Buildings_SotoYuSm_001')).toBe(0)
    expect(hit('Onsen_Buildings_YumomiHall_001')).toBe(1)
    expect(hit('Onsen_Surfaces_OnsenPools_001')).toBe(2)
    expect(hit('Onsen_Buildings_Bathhouse_001')).toBe(3)
    expect(hit('Onsen_Buildings_Shop2_002')).toBe(4)
  })

  it('takes the MODEL names too, which is the only way the chimneys are ever found', () => {
    /* GLTFLoader gives a single-primitive mesh the NODE's name and a multi-primitive one a Group
       whose children carry the glTF MESH name -- and the three buildings with a chimney are exactly
       the three with a second primitive, because their windows are an EMIT_window slot */
    expect(STEAM_VENTS[3].m.test('PROP_bathhouse')).toBe(true)
    expect(STEAM_VENTS[4].m.test('PROP_shop_2')).toBe(true)
    expect(STEAM_VENTS[0].m.test('PROP_soto_yu')).toBe(true)
    /* and the shop next door is a different building */
    expect(STEAM_VENTS[4].m.test('PROP_shop_1')).toBe(false)
  })

  it('does not put a plume out of a window', () => {
    /* the second primitive matches the rule too, and its box is the WINDOWS rather than the
       building, so its ridge is somewhere down the wall */
    const f = buildSteam(new Scene(), world(
      building('PROP_bathhouse', 0, 0, -200, 800),
      building('PROP_bathhouse_1', 0, 0, 100, 300, 200, 'EMIT_window'),
    ))
    expect(f.vents).toBe(1)
  })

  it('is born at the TOP of a bath, not the bottom of its box', () => {
    /* a SotoYu mesh is the whole bath INCLUDING its sunken tub, so `top: 0` puts the steam
       underground and it rises out of the street */
    const f = buildSteam(new Scene(), world(building('Onsen_Buildings_SotoYu_001', 0, 0, -192, 48)))
    for (const b of bases(f)) expect(b.y).toBeCloseTo(48, 3)
  })

  it('spreads the big pool across its own length rather than one plume in the middle', () => {
    /* the pool is 1,200 by 1,640, and one column in the middle of that reads as a bonfire */
    const f = buildSteam(new Scene(), world(
      building('Onsen_Surfaces_OnsenPools_001', 0, 0, -237, -85, 1200)))
    expect(f.vents).toBe(3)
    const xs = [...new Set(bases(f).map((b) => Math.round(b.x / 50)))]
    const zs = [...new Set(bases(f).map((b) => Math.round(b.z / 50)))]
    expect(Math.max(xs.length, zs.length)).toBeGreaterThan(2)
  })

  it('walks an instanced batch, or every outdoor bath in the town loses its steam', () => {
    /* the mockup's steamBuild skips InstancedMesh outright; in THIS export the five outdoor baths
       are five placements of one mesh and `collapseToInstances` duly batches them */
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([
      -100, -192, -100, 100, 48, 100, -100, 48, 100,
    ]), 3))
    const inst = new InstancedMesh(g, new MeshStandardMaterial({ name: 'JP_VertexColor' }), 3)
    inst.name = 'inst:Onsen_Buildings_SotoYu_001'
    inst.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 0))
    inst.setMatrixAt(1, new Matrix4().makeTranslation(2000, 0, 0))
    inst.setMatrixAt(2, new Matrix4().makeTranslation(4000, 0, 0))
    const f = buildSteam(new Scene(), world(inst))
    expect(f.vents).toBe(3)
    expect(f.found['Onsen_Buildings_SotoYu']).toBe(3)
  })
})

describe('the authored columns', () => {
  it('stop being drawn and become the vent list', () => {
    /* two kinds of steam in one town did not agree with each other; the props lose the argument as
       drawings and win it as siting */
    /* placed in its VERTICES rather than by its matrix, which is the case the petals found in this
       same export and the case a matrix-position read gets wrong by putting the vent at the origin */
    const col = building('Onsen_Props_Steam_004', 500, -500, -67, 15, 40)
    const f = buildSteam(new Scene(), world(col))
    expect(col.visible).toBe(false)
    expect(f.fromProps).toBe(1)
    expect(bases(f)[0].x).toBeCloseTo(500, 0)
  })

  it('are no longer a still-things rule, so nothing animates a hidden mesh', () => {
    expect(PROP_LIFE.some((r) => r.m.test('Onsen_Props_Steam_004'))).toBe(false)
    expect(PROP_STEAM_RE.test('Onsen_Props_Steam_004')).toBe(true)
  })
})

describe('what a puff carries', () => {
  it('lives entirely in its own matrix, so nothing is written per frame', () => {
    const f = buildSteam(new Scene(), world(building('Onsen_Buildings_SotoYu_001', 0, 0, -192, 48)))
    const m = new Matrix4()
    f.mesh!.getMatrixAt(0, m)
    /* climb, jitter, rate, width, phase and greyness, in the corners a translation does not use */
    expect(m.elements[0]).toBeGreaterThan(100)
    expect(m.elements[4]).toBeGreaterThan(0.5)
    expect(m.elements[5]).toBeGreaterThan(10)
    const before = f.mesh!.instanceMatrix.version
    f.tick(3)
    expect(f.mesh!.instanceMatrix.version).toBe(before)
  })

  it('spreads the column round its cycle, so it is a column on the first frame', () => {
    const f = buildSteam(new Scene(), world(building('Onsen_Buildings_SotoYu_001', 0, 0, -192, 48)))
    const m = new Matrix4()
    const phases: number[] = []
    for (let i = 0; i < f.mesh!.count; i++) { f.mesh!.getMatrixAt(i, m); phases.push(m.elements[8]) }
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(0.7)
  })

  it('leans the way the weather blows, and only the direction is shared', () => {
    expect(STEAM_U.uWind.value.x).toBeCloseTo(WIND_DIR.x, 6)
    expect(STEAM_U.uWind.value.z).toBeCloseTo(WIND_DIR.y, 6)
    expect(STEAM_U.uWind.value.y).toBe(0)
  })

  it('advances its own clock rather than reading the wall', () => {
    const f = buildSteam(new Scene(), world(building('Onsen_Buildings_SotoYu_001', 0, 0, -192, 48)))
    const t = STEAM_U.uTime.value
    f.tick(2)
    expect(STEAM_U.uTime.value).toBeCloseTo(t + 2, 6)
  })
})

describe('the cold', () => {
  it('thickens after dark and thins at noon without switching off', () => {
    /* steam is water condensing, so you see it when the air is cold -- but a town that stops
       breathing at midday is a light switch rather than weather */
    const f = buildSteam(new Scene(), world(building('Onsen_Buildings_SotoYu_001', 0, 0, -192, 48)))
    f.setCold(1)
    expect(STEAM_U.uCold.value).toBeCloseTo(1, 6)
    f.setCold(0)
    expect(STEAM_U.uCold.value).toBeCloseTo(COLD_FLOOR, 6)
    expect(COLD_FLOOR).toBeGreaterThan(0.2)
  })

  it('leaves the smoke alone, because smoke is not the same substance', () => {
    /* one system with a `grey` channel rather than two: a chimney plume is narrower, climbs twice
       as far, leans further downwind and stays visible all day */
    const bath = STEAM_VENTS[0]
    const chimney = STEAM_VENTS[3]
    expect(chimney.grey).toBe(1)
    expect(bath.grey).toBe(0)
    expect(chimney.h).toBeGreaterThan(bath.h * 2)
    expect(chimney.w).toBeLessThan(bath.w)
  })
})

describe('a world with no onsen in it', () => {
  it('builds nothing rather than an empty mesh', () => {
    const scene = new Scene()
    const f = buildSteam(scene, world(building('Zen_Buildings_Sanmon_001', 0, 0, 0, 400)))
    expect(f.puffs).toBe(0)
    expect(f.mesh).toBeNull()
    expect(scene.children.length).toBe(0)
  })
})
