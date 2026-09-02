import { describe, expect, it } from 'vitest'
import {
  BoxGeometry, BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, Vector3,
} from 'three'
import { SWAY, SWAY_GLSL, SWAY_LAYER, buildSway, swayBake, swayCall, swayPatch, swayTick } from './sway'

/** a plant the way the world hands one over: unit-tall geometry, the size in the transform */
function plant(name: string, scale = 100, mat = new MeshStandardMaterial()): Mesh {
  const m = new Mesh(new BoxGeometry(1, 2, 1), mat)
  m.name = name
  m.scale.setScalar(scale)
  m.updateMatrix()
  m.updateMatrixWorld(true)
  return m
}

function grove(name: string, scales: number[], mat = new MeshStandardMaterial()): InstancedMesh {
  const im = new InstancedMesh(new BoxGeometry(1, 2, 1), mat, scales.length)
  im.name = name
  const m = new Matrix4()
  scales.forEach((s, i) => {
    m.compose(new Vector3(i * 10, 0, 0), new Quaternion(), new Vector3(s, s, s))
    im.setMatrixAt(i, m)
  })
  im.updateMatrixWorld(true)
  return im
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

describe('the bake', () => {
  it('writes how far up its plant each vertex is, and how tall the geometry is', () => {
    const geo = new BoxGeometry(1, 2, 1)
    expect(swayBake(geo)).toBe(true)
    const a = geo.getAttribute('aPlant')
    expect(a.itemSize).toBe(2)
    /* a box spans its full height, so both ends of the range have to be present */
    const ups: number[] = []
    for (let i = 0; i < a.count; i++) ups.push(a.getX(i))
    expect(Math.min(...ups)).toBeCloseTo(0)
    expect(Math.max(...ups)).toBeCloseTo(1)
    expect(a.getY(0)).toBeCloseTo(2)
  })

  it('is asked once per mesh and answered once per model', () => {
    /* one geometry stands hundreds of trees; baking it again per mesh would be hundreds of
       needless walks of the same positions */
    const geo = new BoxGeometry(1, 2, 1)
    expect(swayBake(geo)).toBe(true)
    expect(swayBake(geo)).toBe(false)
  })

  it('zeroes a geometry with no height, which is the off switch', () => {
    /* an `aPlant.y` of 0 fails the shader's height test, so a ground decal named as vegetation is
       simply not swept up -- and it costs a branch rather than a second material */
    /* rotated flat, or a PlaneGeometry is ten units tall in Y and is not the case being tested */
    const flat = new PlaneGeometry(10, 10).rotateX(-Math.PI / 2)
    swayBake(flat)
    const a = flat.getAttribute('aPlant')
    for (let i = 0; i < a.count; i++) expect(a.getY(i)).toBe(0)
  })

  it('does not assume the origin sits at the plant\'s foot', () => {
    /* this export models plants about their middle as often as about their base; dividing a raw
       local y by the height assumes the second and clamps half the vertices to zero */
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0, -50, 0, 0, 0, 0, 0, 50, 0,
    ]), 3))
    swayBake(geo)
    const a = geo.getAttribute('aPlant')
    expect(a.getX(0)).toBeCloseTo(0)
    expect(a.getX(1)).toBeCloseTo(0.5)
    expect(a.getX(2)).toBeCloseTo(1)
  })
})

describe('finding the vegetation', () => {
  it('catches every kind the world actually names', () => {
    const field = buildSway(world(
      plant('Nature_Trees_Willow1_001'),
      plant('inst:Festival_Vegetation_Hinoki1_001'),
      plant('Fuji_Forest_Sugi0_112'),
      plant('Nature_GroundCover_FlwW_004'),
      plant('Zen_Vegetation_Bamboo0_001'),
      plant('Meadow_Susuki_003'),
      plant('Fuji_Forest_Grass2_001'),
    ))
    expect(field.meshes).toHaveLength(7)
  })

  it('leaves the buildings alone', () => {
    const field = buildSway(world(
      plant('PROP_inn_1'), plant('Festival_Structures_Nobori0_001'),
      plant('Onsen_Buildings_SotoYu_001'),
    ))
    expect(field.meshes).toHaveLength(0)
    expect(field.material).toBeNull()
  })

  it('clones the shared material rather than patching it, so the inns do not sway', () => {
    /* every plant in this world draws with `JP_VertexColor` -- and so does every building, every
       boat and every lantern body */
    const shared = new MeshStandardMaterial({ name: 'JP_VertexColor' })
    const inn = plant('PROP_inn_1', 100, shared)
    const tree = plant('Nature_Trees_Willow1_001', 100, shared)
    const field = buildSway(world(inn, tree))
    expect(tree.material).not.toBe(shared)
    expect(tree.material).toBe(field.material)
    expect(inn.material).toBe(shared)
  })

  it('re-breathes the clone, because the flag crosses and the patch does not', () => {
    /* `Material.clone()` copies `userData` but NOT `onBeforeCompile`, so a clone taken after
       `breathe` arrives carrying the `atmos` flag and none of the patch it stands for -- the
       difference between a forest in the valley's air and a forest-shaped hole in it */
    const shared = new MeshStandardMaterial({ name: 'JP_VertexColor' })
    shared.userData.atmos = true
    const tree = plant('Nature_Trees_Willow1_001', 100, shared)
    buildSway(world(tree))
    expect((tree.material as MeshStandardMaterial).onBeforeCompile).toBeTypeOf('function')
  })

  it('counts instances, not meshes', () => {
    const field = buildSway(world(grove('inst:Fuji_Forest_Sugi0_001', [1, 2, 3, 4])))
    expect(field.plants).toBe(4)
    expect(field.meshes).toHaveLength(1)
  })

  it('puts them on their own layer for the outline pass', () => {
    const tree = plant('Nature_Trees_Willow1_001')
    buildSway(world(tree))
    expect(tree.layers.test({ mask: 1 << SWAY_LAYER } as never)).toBe(true)
    /* and still on layer 0, or they vanish from the world itself */
    expect(tree.layers.test({ mask: 1 } as never)).toBe(true)
  })
})

describe('the heights, which are the whole reason this is not a transplant', () => {
  it('reports the WORLD height of a loose plant, not its geometry\'s', () => {
    /* this build's `world.glb` is quantized: every plant's geometry is normalised to about two
       units and its real size lives in the transform. The sacred cedar is 2 x 953.7. */
    const field = buildSway(world(plant('Torii_Vegetation_SacredCedar_001', 953.7)))
    expect(field.heights[1]).toBe(1907)
  })

  it('reads the scale out of the instance matrix as well', () => {
    const field = buildSway(world(grove('inst:Fuji_Forest_Sugi0_001', [3, 500])))
    expect(field.heights).toEqual([6, 1000])
  })

  it('separates a cedar from a blade of grass, which reading the geometry alone cannot', () => {
    /* both geometries are two units tall here. If these two ever come back equal, the bake has
       been "simplified" back to the mockup's form and the wind has gone flat. */
    const field = buildSway(world(grove('inst:Fuji_Forest_Mixed_001', [953.7, 3])))
    expect(field.heights[0]).not.toBe(field.heights[1])
  })
})

describe('the shader', () => {
  it('reconstructs the world height and converts the swing back to local units', () => {
    /* the two halves of the quantization correction. Without the first, `pow( H, 0.55 )` returns
       the same number for every plant in the valley; without the second, `amp` stops meaning
       world units and a big tree thrashes in proportion to its scale. */
    expect(SWAY_GLSL).toContain('float H = aPlant.y * sc')
    expect(SWAY_GLSL).toContain('pow( H, 0.55 ) / sc')
  })

  it('turns the wind into the plant\'s own frame, because the instances are yawed', () => {
    /* measured on this export: a 358-degree spread of yaw. Displacing along `uSwayDir` in local
       space sends every tree a different way and the travelling gust reads as noise. */
    expect(SWAY_GLSL).toContain('vec3 ld = uSwayDir * W')
  })

  it('offers both call sites the same source', () => {
    /* the lit material and the ink prepass read one string; written twice they drift the moment
       either is tuned, and the symptom is an outline sliding out of its tree */
    expect(swayCall('transformed')).toContain('swayPlant( transformed')
    expect(swayCall('lpos')).toContain('swayPlant( lpos')
    /* and both branches, because three of this world's plants are loose meshes */
    expect(swayCall('lpos')).toContain('#ifdef USE_INSTANCING')
    expect(swayCall('lpos')).toContain('#else')
  })
})

describe('the patch', () => {
  it('chains onto whatever is already there rather than replacing it', () => {
    /* by the time this runs `breathe` has put the mist, the cover and the rim on the hook */
    const mat = new MeshStandardMaterial()
    const calls: string[] = []
    mat.onBeforeCompile = () => calls.push('breathe')
    swayPatch(mat)
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' }
    mat.onBeforeCompile(shader as never, null as never)
    expect(calls).toEqual(['breathe'])
    expect(shader.vertexShader).toContain('swayPlant( transformed')
  })

  it('extends the program cache key, or the whole world starts swaying', () => {
    /* three's default key IS `onBeforeCompile.toString()`, so two materials whose hooks read
       alike share one compiled program */
    const mat = new MeshStandardMaterial()
    swayPatch(mat)
    expect(mat.customProgramCacheKey()).toContain('sway')
  })

  it('is idempotent, since the walk reaches one material many times over', () => {
    const mat = new MeshStandardMaterial()
    swayPatch(mat)
    const first = mat.onBeforeCompile
    swayPatch(mat)
    expect(mat.onBeforeCompile).toBe(first)
  })
})

describe('the clock', () => {
  it('is one float for seventeen thousand plants', () => {
    const was = SWAY.t.value
    swayTick(0.5)
    expect(SWAY.t.value).toBeCloseTo(was + 0.5)
  })

  it('shares its wind vector, so the trees and the wisps cannot disagree', () => {
    expect(SWAY.dir.value.length()).toBeCloseTo(1)
  })
})
