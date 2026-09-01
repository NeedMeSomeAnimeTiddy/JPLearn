import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D,
} from 'three'
import { CROWD_U, PERSON_MIN_H, PERSON_RE, buildCrowd, crowdBake, crowdIdle } from './crowd'

/** a figure of a given height whose origin sits wherever `originAt` says, 0 = feet, 0.5 = middle */
function figure(height: number, originAt = 0.5): BufferGeometry {
  const y0 = -height * originAt
  const v = [0, y0, 0, 1, y0 + height / 2, 0, 0, y0 + height, 1]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  return g
}

function placed(name: string, geo: BufferGeometry, scale = 1, mat = new MeshStandardMaterial()): InstancedMesh {
  const m = new InstancedMesh(geo, mat, 2)
  m.name = name
  m.setMatrixAt(0, new Matrix4().makeScale(scale, scale, scale))
  m.setMatrixAt(1, new Matrix4().makeScale(scale, scale, scale))
  return m
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

describe('who is a person', () => {
  it('takes every human node in the export', () => {
    for (const n of ['Festival_People_Person0_007', 'Nature_Wildlife_Person7_001.003',
      'Onsen_People_Person0_012']) {
      expect(PERSON_RE.test(n)).toBe(true)
    }
  })

  it('leaves the animals living in the same namespace alone', () => {
    /* `_People_` is a folder, not a species -- and the fox is the one the mockup's height test
       would have missed: 51.5 units, well over the 40 that separates a person from a monkey */
    for (const n of ['Garden_People_Koi0_001', 'Onsen_People_Monkey_001',
      'Onsen_People_MonkeyBath_001', 'Torii_People_FoxKey_001', 'Torii_People_FoxSmRice_001']) {
      expect(PERSON_RE.test(n)).toBe(false)
    }
  })

  it('survives the batching rename', () => {
    /* `collapseToInstances` renames what it groups to `inst:<first member>`, so the test has to be
       unanchored -- which it is */
    expect(PERSON_RE.test('inst:Festival_People_Person0_001')).toBe(true)
  })
})

describe('how far up its own figure a vertex is', () => {
  it('reads 0 at the feet and 1 at the crown WHEREVER the origin sits', () => {
    /* the trap this whole attribute exists for: these figures are modelled about their middle, so
       dividing the raw local y by the height clamps the entire lower body to zero */
    const g = figure(69, 0.5)
    crowdBake(g)
    const a = g.getAttribute('aUp')
    expect(a.getX(0)).toBeCloseTo(0, 5)
    expect(a.getX(1)).toBeCloseTo(0.5, 5)
    expect(a.getX(2)).toBeCloseTo(1, 5)
  })

  it('gives the same answer for a figure modelled about its feet', () => {
    const g = figure(69, 0)
    crowdBake(g)
    const a = g.getAttribute('aUp')
    expect(a.getX(0)).toBeCloseTo(0, 5)
    expect(a.getX(2)).toBeCloseTo(1, 5)
  })

  it('is baked once per model, not once per mesh', () => {
    const g = figure(69)
    expect(crowdBake(g)).toBe(true)
    expect(crowdBake(g)).toBe(false)
  })

  it('answers zero rather than NaN for a geometry with no height', () => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 4, 0, 1, 4, 0]), 3))
    crowdBake(g)
    const a = g.getAttribute('aUp')
    expect(Number.isNaN(a.getX(0))).toBe(false)
    expect(a.getX(0)).toBe(0)
  })
})

describe('the idle patch', () => {
  it('chains onto whatever hook is already there rather than replacing it', () => {
    /* by the time this runs `breathe` owns that hook; assigning over it takes the valley's air off
       a thousand people */
    const mat = new MeshStandardMaterial()
    let air = 0
    mat.onBeforeCompile = () => { air++ }
    crowdIdle(mat)
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>', fragmentShader: '' }
    mat.onBeforeCompile(shader as never, null as never)
    expect(air).toBe(1)
    expect(shader.vertexShader).toContain('idleFigure( idleP')
    expect(shader.vertexShader).toContain('idleFigure( transformed')
    expect(Object.keys(shader.uniforms)).toContain('uIdleT')
  })

  it('extends the program cache key instead of overwriting it', () => {
    /* three's default key IS `onBeforeCompile.toString()`, so a material whose hook reads like
       another's shares its compiled program -- which is how a crowd's idle reaches the inns */
    const mat = new MeshStandardMaterial()
    mat.customProgramCacheKey = () => 'air'
    crowdIdle(mat)
    expect(mat.customProgramCacheKey()).toBe('air|crowd')
  })

  it('patches a material once however many meshes ask', () => {
    const mat = new MeshStandardMaterial()
    crowdIdle(mat)
    const first = mat.onBeforeCompile
    crowdIdle(mat)
    expect(mat.onBeforeCompile).toBe(first)
  })
})

describe('building the crowd', () => {
  it('finds the people and counts the figures, not the meshes', () => {
    const c = buildCrowd(world(
      placed('Festival_People_Person0_001', figure(69)),
      placed('Festival_People_Person0_002', figure(43)),
    ))
    expect(c.meshes.length).toBe(2)
    expect(c.figures).toBe(4)
    expect(c.geometries.length).toBe(2)
  })

  it('leaves the animals standing still', () => {
    const c = buildCrowd(world(
      placed('Torii_People_FoxKey_001', figure(51.5)),
      placed('Garden_People_Koi0_001', figure(4.9)),
    ))
    expect(c.figures).toBe(0)
    expect(c.material).toBeNull()
  })

  it('keeps the height guard, and measures it off the placement rather than the batch', () => {
    /* `collapseToInstances` leaves the batch at the identity and puts the real size in
       `instanceMatrix` -- reading `matrixWorld` reports 1.0 and every figure fails the test */
    const small = placed('Nature_Wildlife_Person0_001', figure(1), 0.5)
    expect(buildCrowd(world(small)).figures).toBe(0)
    const real = placed('Nature_Wildlife_Person0_002', figure(1), PERSON_MIN_H + 10)
    expect(buildCrowd(world(real)).figures).toBe(2)
  })

  it('clones the shared material rather than patching it, so the inns do not sway', () => {
    /* every person in this export draws with `JP_VertexColor`, and so does every building */
    const shared = new MeshStandardMaterial({ name: 'JP_VertexColor' })
    const mesh = placed('Festival_People_Person0_001', figure(69), 1, shared)
    const c = buildCrowd(world(mesh))
    expect(c.material).not.toBe(shared)
    expect(mesh.material).toBe(c.material)
    expect(shared.userData.crowd).toBeUndefined()
  })

  it('clears the atmosphere flag the clone inherited, so the air is re-applied', () => {
    /* `Material.clone()` copies `userData` but NOT `onBeforeCompile`: the flag arrives and the
       patch it stands for does not, and `breathe` then takes its early return */
    const shared = new MeshStandardMaterial({ name: 'JP_VertexColor' })
    shared.userData.atmos = true
    const c = buildCrowd(world(placed('Festival_People_Person0_001', figure(69), 1, shared)))
    expect(c.material?.userData.atmos).toBe(true)
    /* re-applied, which is only observable as the hook actually being there */
    expect(c.material?.onBeforeCompile).toBeTypeOf('function')
  })

  it('shares one material across every model', () => {
    const c = buildCrowd(world(
      placed('Festival_People_Person0_001', figure(69)),
      placed('Festival_People_Person0_002', figure(43)),
    ))
    expect(c.meshes[0].material).toBe(c.meshes[1].material)
  })

  it('advances its own clock rather than reading the wall', () => {
    const c = buildCrowd(world(placed('Festival_People_Person0_001', figure(69))))
    const t = CROWD_U.uIdleT.value
    c.tick(2)
    expect(CROWD_U.uIdleT.value).toBeCloseTo(t + 2, 6)
  })
})
