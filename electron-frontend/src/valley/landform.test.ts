import { describe, expect, it } from 'vitest'
import {
  BufferAttribute, BufferGeometry, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry,
} from 'three'
import { CRAG, FUJI_RE, RANGE_RE, buildLandform, splitTris } from './landform'

/**
 * A ridge the way this export ships one: geometry normalised to about two units, with its real
 * size in the transform.
 */
function ridge(name: string, scale = 9410, segments = 4): Mesh {
  const geo = new PlaneGeometry(2, 2, segments, segments).rotateX(-Math.PI / 2.4)
  const mesh = new Mesh(geo, new MeshStandardMaterial())
  mesh.name = name
  mesh.scale.setScalar(scale)
  mesh.position.set(12000, 0, -20000)
  mesh.updateMatrix()
  mesh.updateMatrixWorld(true)
  return mesh
}

function world(...meshes: Object3D[]): Object3D {
  const root = new Object3D()
  for (const m of meshes) root.add(m)
  root.updateMatrixWorld(true)
  return root
}

const triCount = (m: Mesh) => (m.geometry.index
  ? m.geometry.index.count / 3
  : m.geometry.attributes.position.count / 3)

describe('what counts as skyline', () => {
  it('catches the ranges this world actually names', () => {
    for (const n of ['Landscape_Props_FarRange_001', 'Landscape_Props_Range_009']) {
      expect(RANGE_RE.test(n)).toBe(true)
    }
    expect(FUJI_RE.test('Landscape_Props_Fuji_001')).toBe(true)
  })

  it('does not take a lantern called Orange or a prop called Arrange', () => {
    /* the boundary in the regex is what keeps `range` from matching inside another word */
    for (const n of ['Festival_Props_Orange_003', 'Zen_Props_Arrangement_001']) {
      expect(RANGE_RE.test(n)).toBe(false)
    }
  })

  it('leaves Fuji\'s forest, rocks and outline hulls alone', () => {
    const st = buildLandform(world(
      ridge('Fuji_Forest_Sugi0_112'), ridge('Fuji_Props_Rock1_004'),
      ridge('Landscape_Props_Fuji_001-outline'),
    ))
    expect(st.fuji).toBe(0)
    expect(st.ranges).toBe(0)
  })
})

describe('subdivision', () => {
  it('turns every triangle into four', () => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]), 3))
    const out = splitTris(geo)
    expect(out.attributes.position.count).toBe(12)
  })

  it('carries the vertex colours across, since this world is painted rather than textured', () => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]), 3))
    geo.setAttribute('color', new BufferAttribute(new Float32Array([
      1, 0, 0, 1, 0, 0, 1, 0, 0,
    ]), 3))
    const out = splitTris(geo)
    expect(out.attributes.color.count).toBe(12)
    expect(out.attributes.color.getX(0)).toBeCloseTo(1)
  })
})

describe('cragging', () => {
  it('is sixteen times the triangles, not sixty-four', () => {
    /* two splits, not three: three took the mockup's ranges to 8,192 triangles each for objects
       that occupy a few hundred pixels of skyline */
    expect(CRAG.splits).toBe(2)
    const mesh = ridge('Landscape_Props_FarRange_001')
    const before = triCount(mesh)
    const st = buildLandform(world(mesh))
    expect(st.trisAfter).toBe(before * 16)
    expect(triCount(mesh)).toBe(before * 16)
  })

  it('moves the ridge, and by world units rather than local ones', () => {
    /* THE WHOLE POINT OF DOING THIS IN WORLD SPACE. `amp` is 460 units against a range four to six
       thousand tall; read as local units on normalised geometry it is 460 x 9,410 and the first
       ridge swallows the valley. */
    const mesh = ridge('Landscape_Props_FarRange_001')
    const before = mesh.geometry.attributes.position.array.slice(0, 3) as Float32Array
    buildLandform(world(mesh))
    const after = mesh.geometry.attributes.position
    /* the displacement, back in world units */
    const moved = Math.abs(after.getY(0) - before[1]) * 9410
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThan(CRAG.amp * 4)
  })

  it('leaves the mountain\'s triangles alone and only welds its normals', () => {
    const mesh = ridge('Landscape_Props_Fuji_001')
    const before = triCount(mesh)
    const st = buildLandform(world(mesh))
    expect(st.fuji).toBe(1)
    expect(st.ranges).toBe(0)
    expect(triCount(mesh)).toBe(before)
  })
})

describe('the normals', () => {
  it('come out unit length and pointing somewhere', () => {
    const mesh = ridge('Landscape_Props_Fuji_001')
    buildLandform(world(mesh))
    const n = mesh.geometry.attributes.normal
    for (let i = 0; i < Math.min(n.count, 40); i++) {
      expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 3)
    }
  })

  it('are welded, so a shared corner gets one normal and not two', () => {
    /* the fault is in the export: 26% duplicate vertices carrying distinct normals, which three's
       own `computeVertexNormals` cannot smooth because it accumulates per index */
    const mesh = ridge('Landscape_Props_Fuji_001', 9410, 2)
    buildLandform(world(mesh))
    const pos = mesh.geometry.attributes.position
    const nrm = mesh.geometry.attributes.normal
    const seen = new Map<string, [number, number, number]>()
    let shared = 0
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`
      const had = seen.get(key)
      const now: [number, number, number] = [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]
      if (had) {
        shared++
        for (let c = 0; c < 3; c++) expect(now[c]).toBeCloseTo(had[c], 5)
      } else seen.set(key, now)
    }
    /* and the geometry really does share corners, or the assertion above proved nothing */
    expect(shared).toBeGreaterThan(0)
  })
})

describe('the transform', () => {
  it('gives the geometry back in the mesh\'s own frame', () => {
    /* the work happens in world space and comes home again, so nothing else in the port has to
       know this pass ran -- the node keeps its 9,410 scale and its position */
    const mesh = ridge('Landscape_Props_FarRange_001')
    buildLandform(world(mesh))
    expect(mesh.scale.x).toBeCloseTo(9410)
    mesh.geometry.computeBoundingBox()
    const bb = mesh.geometry.boundingBox!
    /* local extents stay local: single digits, not tens of thousands */
    expect(bb.max.x - bb.min.x).toBeLessThan(10)
  })

  it('reports what it did, because a boot line is how a silent pass gets noticed', () => {
    const st = buildLandform(world(
      ridge('Landscape_Props_FarRange_001'), ridge('Landscape_Props_Range_002'),
      ridge('Landscape_Props_Fuji_001'),
    ))
    expect(st.ranges).toBe(2)
    expect(st.fuji).toBe(1)
    expect(st.welded).toBeGreaterThan(0)
    expect(st.trisAfter).toBe(st.trisBefore * 16)
  })
})

describe('the guards', () => {
  it('skips a mesh whose positions have already been freed', () => {
    const mesh = ridge('Landscape_Props_FarRange_001')
    const empty = new Mesh(new BufferGeometry(), new MeshStandardMaterial())
    empty.name = 'Landscape_Props_Range_007'
    expect(() => buildLandform(world(mesh, empty))).not.toThrow()
  })

  it('does nothing at all when the switch is off', () => {
    const mesh = ridge('Landscape_Props_FarRange_001')
    const before = triCount(mesh)
    CRAG.on = false
    try {
      buildLandform(world(mesh))
      /* still welded -- that is the other half of this pass and it is free */
      expect(triCount(mesh)).toBe(before)
    } finally {
      CRAG.on = true
    }
  })
})

describe('an unquantized world file, should one ever arrive', () => {
  it('still works, because the scale is read rather than assumed', () => {
    /* the mockup's own export: real world-unit geometry, no node scale. Nothing here hard-codes
       9,410 -- it comes out of `matrixWorld` -- so both files land in the same place. */
    const geo = new PlaneGeometry(12289, 5712, 4, 4).rotateX(-Math.PI / 2.4)
    const mesh = new Mesh(geo, new MeshStandardMaterial())
    mesh.name = 'Landscape_Props_FarRange_001'
    mesh.updateMatrixWorld(true)
    const before = triCount(mesh)
    const st = buildLandform(world(mesh))
    expect(st.trisAfter).toBe(before * 16)
    const n = mesh.geometry.attributes.normal
    expect(Math.hypot(n.getX(0), n.getY(0), n.getZ(0))).toBeCloseTo(1, 3)
  })
})

/* keep the import used, and assert the matrix helper this file leans on stays what it is */
describe('assumptions', () => {
  it('reads a uniform scale off the transform the way the shader does', () => {
    const m = new Matrix4().makeScale(9410, 9410, 9410)
    const e = m.elements
    expect(Math.hypot(e[4], e[5], e[6])).toBeCloseTo(9410)
  })
})
