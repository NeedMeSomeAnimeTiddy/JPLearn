import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D,
} from 'three'
import { WINDOW_FLOOR, WINDOW_MAT, WINDOW_SPOT, buildWindows, windowBake, windowLife } from './windows'

/** a strip of `n` quads, `gap` apart along x, each `w` wide — a wall of window bays */
function bays(n: number, gap: number, w: number): BufferGeometry {
  const verts: number[] = []
  for (let i = 0; i < n; i++) {
    const x = i * gap
    verts.push(x, 0, 0, x + w, 0, 0, x, w, 0, x + w, 0, 0, x + w, w, 0, x, w, 0)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3))
  return g
}

describe('finding one spot per window', () => {
  it('gathers the slats of a bay and stops short of the next', () => {
    /* a lattice window is a dozen separate slat faces and they have to agree about which window
       they are; the threshold sits between the panel width and the bay pitch */
    const g = bays(5, 143, 40)
    expect(windowBake(g, 1)).toBe(5)
  })

  it('gives every vertex its own window centre, not the mesh centre', () => {
    const g = bays(4, 143, 40)
    windowBake(g, 1)
    const a = g.getAttribute('aWinC')
    expect(a.count).toBe(g.getAttribute('position').count)
    const xs = new Set<number>()
    for (let i = 0; i < a.count; i++) xs.add(Math.round(a.getX(i)))
    /* four distinct centres, one per bay -- one shared centre is the whole-town-on-one-clock bug */
    expect(xs.size).toBe(4)
  })

  it('is cached, because two inns share one geometry', () => {
    const g = bays(3, 143, 40)
    expect(windowBake(g, 1)).toBe(3)
    /* a second call with a different scale must NOT re-bake and change the answer underneath the
       first building */
    expect(windowBake(g, 1000)).toBe(3)
  })

  it('reads the threshold in the units the geometry is actually stored in', () => {
    /* THE BUG THIS EXISTS FOR. The world ships quantized, so a whole inn arrives about 1.5 units
       across with its real size in the transform. At a world scale of 1,000 the same wall has to
       find the same windows it finds at scale 1 with a thousand times the spacing. */
    const small = bays(5, 0.143, 0.04)
    expect(windowBake(small, 1000)).toBe(5)
    /* and read at the wrong scale it collapses to one, which is exactly what was measured */
    const alsoSmall = bays(5, 0.143, 0.04)
    expect(windowBake(alsoSmall, 1)).toBe(1)
  })

  it('leaves a geometry with no positions alone rather than throwing', () => {
    expect(windowBake(new BufferGeometry(), 1)).toBe(0)
  })
})

describe('which materials are windows', () => {
  it('takes the slot Blender marks and not every EMIT', () => {
    /* `EMIT_lantern` is a lantern and glows all night; only `EMIT_window` keeps hours */
    expect(WINDOW_MAT.test('EMIT_window')).toBe(true)
    expect(WINDOW_MAT.test('emit_window.001')).toBe(true)
    expect(WINDOW_MAT.test('EMIT_lantern')).toBe(false)
    expect(WINDOW_MAT.test('Wood')).toBe(false)
  })
})

describe('chaining onto what is already there', () => {
  it('calls the previous hook rather than replacing it', () => {
    /* by the time this runs, `breathe` has put the mist, the cover and the rim on this material;
       replacing that hook would take the valley's air off every window in the town */
    const mat = new MeshStandardMaterial()
    let previousRan = false
    mat.onBeforeCompile = () => { previousRan = true }
    windowLife(mat)
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(previousRan).toBe(true)
    expect(shader.vertexShader).toContain('vWinLit = lit')
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= vWinLit')
    expect(shader.uniforms.uWinHour).toBeDefined()
  })

  it('extends the program cache key instead of dropping it', () => {
    const mat = new MeshStandardMaterial()
    mat.customProgramCacheKey = () => 'atmos'
    windowLife(mat)
    expect(mat.customProgramCacheKey()).toBe('atmos|winlife')
  })

  it('is idempotent, because the walk reaches a shared material more than once', () => {
    const mat = new MeshStandardMaterial()
    windowLife(mat)
    const first = mat.onBeforeCompile
    windowLife(mat)
    expect(mat.onBeforeCompile).toBe(first)
  })

  it('carries the instance matrix, which the mockup did not have to', () => {
    /* `collapseToInstances` batches the two inns and the four shops, so the per-building transform
       is in `instanceMatrix` and NOT in `modelMatrix` -- hashing the model matrix alone would put
       every building in a batch back on one clock */
    const mat = new MeshStandardMaterial()
    windowLife(mat)
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(shader.vertexShader).toContain('#ifdef USE_INSTANCING')
    expect(shader.vertexShader).toContain('instanceMatrix * wc4')
  })

  it('never lets a window go fully out', () => {
    /* a black rectangle in a lit wall reads as a hole rather than as a window with nobody behind it */
    expect(WINDOW_FLOOR).toBeGreaterThan(0)
    expect(WINDOW_FLOOR).toBeLessThan(0.15)
  })
})

describe('walking the world', () => {
  it('takes the scale from the instance matrix when the mesh is a batch', () => {
    /* five of this world's six window meshes are batches, and every one of them reports a world
       scale of exactly 1.0 while sitting in a local space 1.5 units across */
    const g = bays(5, 0.143, 0.04)
    const inst = new InstancedMesh(g, new MeshStandardMaterial({ name: 'EMIT_window' }), 1)
    inst.setMatrixAt(0, new Matrix4().makeScale(1000, 1000, 1000))
    inst.instanceMatrix.needsUpdate = true
    const root = new Object3D()
    root.add(inst)
    expect(buildWindows(root).spots).toBe(5)
  })

  it('ignores a mesh whose material is not the window slot', () => {
    const root = new Object3D()
    root.add(new Mesh(bays(5, 143, 40), new MeshStandardMaterial({ name: 'Wood' })))
    const field = buildWindows(root)
    expect(field.meshes).toBe(0)
    expect(field.spots).toBe(0)
  })

  it('moves the hour and the flicker without touching the geometry', () => {
    const root = new Object3D()
    root.add(new Mesh(bays(2, 143, 40), new MeshStandardMaterial({ name: 'EMIT_window' })))
    const field = buildWindows(root)
    field.setHour(23.5)
    field.tick(2)
    expect(WINDOW_SPOT).toBe(100)
    expect(field.meshes).toBe(1)
  })
})
