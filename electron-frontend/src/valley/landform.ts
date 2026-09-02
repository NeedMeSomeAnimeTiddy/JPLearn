import {
  BufferAttribute, BufferGeometry, Matrix3, Matrix4, Vector3,
  type Mesh, type Object3D,
} from 'three'

/* ==================================================================================================
   THE SKYLINE.

   A HUNDRED AND TWENTY TRIANGLES STRETCHED OVER FIFTEEN THOUSAND UNITS IS A SILHOUETTE, and a
   silhouette is all a 4,000-unit mountain twenty-five thousand units away is made of. Measured on
   this export: nineteen ranges of 112 to 144 triangles each, standing 1,858 to 6,548 units tall and
   10,000 to 19,000 wide. There is no shading trick that puts a crag on a ridge that has no vertex
   to put it at, so the fidelity has to go into the geometry: subdivide, then push every vertex along
   its own surface by a ridged noise field.

   AND FUJI IS THE OPPOSITE PROBLEM. It arrives with 9,916 triangles and duplicate vertices carrying
   distinct normals, so its flank reads as facets rather than as a cone. It needs no more geometry --
   it needs its normals welded, which is a different fix for a different fault and the reason these
   two live in one file rather than one function.

   ==================================================================================================
   TWO THINGS HERE ARE NOT THE MOCKUP'S, AND BOTH ARE THE QUANTIZED WORLD FILE AGAIN.

   1. IT ALL HAPPENS IN WORLD SPACE. The mockup's `Landscape_Props_FarRange_001` is 12,289 x 5,712 x
      18,821 units of GEOMETRY with no node scale at all, so `amp = 460` and `freq = 1/1500` and the
      `(y - 200) / 2600` height ramp are simultaneously geometry units and world units there and
      nobody had to choose. Here the same mesh is normalised geometry with 9,410 sitting in its
      transform -- so read as local units those constants are two thousand times too large, and the
      first range would swallow the valley. Everything below works on world positions and converts
      back at the end, which makes every constant the mockup's, unchanged.

   2. THE ARRAYS ARE NOT FLOATS. `KHR_mesh_quantization` stores POSITION and NORMAL as Int16 and
      COLOR_0 as Uint8, all `normalized` -- so the mockup's `pos[ i * 3 ] += ...` would read an
      integer in -32768..32767, add a world-unit displacement to it and write it back, which is not
      wrong by a factor, it is noise. Every read here goes through `getX/getY/getZ`, which decode
      the normalisation, and every write goes to a fresh Float32 attribute.
   ================================================================================================== */

/** the far ridges and the near ones: everything that is skyline rather than ground */
export const RANGE_RE = /(^|[_\-.])(farrange|range|ridge)/i
/** and the mountain, which is none of the forest, rocks or outline hulls that carry its name */
export const FUJI_RE = /fuji/i
const FUJI_SKIP = /forest|props_rock|outline/i

export const CRAG = {
  on: true,
  /* 460 RATHER THAN 210, and the ranges' own size is the argument: they are four to six thousand
     units tall and twelve to nineteen thousand across, so a two-hundred-unit wobble on them is a
     texture rather than a landform. What this buys is SILHOUETTE -- actual crags on the skyline --
     which is the one thing a texture cannot do. */
  amp: 460,
  freq: 1 / 1500,
  /* TWO SPLITS, NOT THREE. Three is 64x, which took the mockup's ranges from 128 triangles each to
     8,192 -- 155,000 across nineteen of them, for objects that occupy a few hundred pixels of
     skyline. Two is 16x and still gives every ridge more crest detail than it can show at this
     distance; the difference in the render is invisible and the difference in the frame is 116,000
     triangles. */
  splits: 2,
}

/* ---- the noise, ported whole: one hash, one value-noise, one ridged sum, one fbm ---- */

function jsHash(x: number, y: number, z: number): number {
  const a = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return a - Math.floor(a)
}

function jsNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y); const iz = Math.floor(z)
  const fx = x - ix; const fy = y - iy; const fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const L = (a: number, b: number, t: number) => a + (b - a) * t
  return L(
    L(L(jsHash(ix, iy, iz), jsHash(ix + 1, iy, iz), sx),
      L(jsHash(ix, iy + 1, iz), jsHash(ix + 1, iy + 1, iz), sx), sy),
    L(L(jsHash(ix, iy, iz + 1), jsHash(ix + 1, iy, iz + 1), sx),
      L(jsHash(ix, iy + 1, iz + 1), jsHash(ix + 1, iy + 1, iz + 1), sx), sy), sz)
}

/** ridged: the absolute value folded and squared, which is what puts creases in rather than blobs */
function jsRidged(x: number, y: number, z: number): number {
  let a = 0.5; let s = 0; let f = 1; let w = 0
  for (let i = 0; i < 5; i++) {
    let n = 1 - Math.abs(jsNoise(x * f, y * f, z * f) * 2 - 1)
    n *= n
    s += a * n; w += a
    f *= 2.11; a *= 0.52
  }
  return s / w
}

function jsFbm(x: number, y: number, z: number): number {
  let a = 0.5; let s = 0; let f = 1
  for (let i = 0; i < 4; i++) { s += a * jsNoise(x * f, y * f, z * f); f *= 2.07; a *= 0.5 }
  return s
}

/* ---- geometry ---- */

const ATTRS = ['position', 'normal', 'color'] as const

/**
 * Decode one geometry into plain Float32 arrays, expanded through its index, in WORLD space.
 *
 * Everything downstream then works in the units every constant in this file is written in, and the
 * quantization stops being anybody's problem after this line.
 */
function toWorldFloat(src: BufferGeometry, world: Matrix4): BufferGeometry {
  const idx = src.index
  const n = idx ? idx.count : src.attributes.position.count
  const out = new BufferGeometry()
  const v = new Vector3()
  /* hoisted: this is walked a hundred thousand times and the matrix does not change */
  const rot = new Matrix3().setFromMatrix4(world)
  for (const key of ATTRS) {
    const a = src.attributes[key]
    if (!a) continue
    const dst = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const j = idx ? idx.getX(i) : i
      v.set(a.getX(j), a.getY(j), a.getZ(j))
      /* positions carry the whole transform; normals only its rotation, and are normalised after,
         so a uniform scale cancels rather than having to be divided out */
      if (key === 'position') v.applyMatrix4(world)
      else if (key === 'normal') v.applyMatrix3(rot).normalize()
      dst[i * 3] = v.x; dst[i * 3 + 1] = v.y; dst[i * 3 + 2] = v.z
    }
    out.setAttribute(key, new BufferAttribute(dst, 3))
  }
  return out
}

/**
 * Midpoint subdivision: each triangle becomes four.
 *
 * Non-indexed only, which is also what gives flat shading for free afterwards — though nothing here
 * keeps it, because `weldNormals` runs last.
 */
export function splitTris(geo: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry()
  for (const key of ATTRS) {
    const a = geo.attributes[key]
    if (!a) continue
    const src = a.array as Float32Array
    const dst = new Float32Array(a.count * 4 * 3)
    let w = 0
    const mid = (i: number, j: number, o: Float32Array) => {
      for (let c = 0; c < 3; c++) o[c] = (src[i * 3 + c] + src[j * 3 + c]) / 2
    }
    const put = (i: number) => { for (let c = 0; c < 3; c++) dst[w++] = src[i * 3 + c] }
    const putV = (v: Float32Array) => { for (let c = 0; c < 3; c++) dst[w++] = v[c] }
    const ab = new Float32Array(3); const bc = new Float32Array(3); const ca = new Float32Array(3)
    for (let t = 0; t < a.count; t += 3) {
      mid(t, t + 1, ab); mid(t + 1, t + 2, bc); mid(t + 2, t, ca)
      put(t); putV(ab); putV(ca)
      putV(ab); put(t + 1); putV(bc)
      putV(ca); putV(bc); put(t + 2)
      putV(ab); putV(bc); putV(ca)
    }
    out.setAttribute(key, new BufferAttribute(dst, 3))
  }
  return out
}

/**
 * Average the face normals meeting at each POSITION rather than at each index.
 *
 * THE FAULT THIS FIXES IS IN THE EXPORT, NOT IN THREE. The .blend carries 26% duplicate vertices,
 * and duplicates that hold distinct normals cannot be smoothed by anything that trusts the index —
 * three's own `computeVertexNormals` accumulates per index, so two vertices at the same point stay
 * two surfaces meeting at an edge. Keying on the rounded world position is what welds them.
 *
 * Positions are already in world units here, so rounding to the nearest unit is the tolerance the
 * mockup uses. In LOCAL units on this build's geometry it would round every vertex of a range to
 * the same key and hand the whole mountain one normal.
 */
function weldNormals(geo: BufferGeometry): void {
  const pos = geo.attributes.position.array as Float32Array
  const n = geo.attributes.position.count
  const key = (i: number) => `${Math.round(pos[i * 3])}|${Math.round(pos[i * 3 + 1])}|${Math.round(pos[i * 3 + 2])}`
  const acc = new Map<string, Vector3>()
  const a = new Vector3(); const b = new Vector3(); const c = new Vector3()
  const ab = new Vector3(); const ac = new Vector3(); const fn = new Vector3()
  for (let t = 0; t < n; t += 3) {
    a.fromArray(pos, t * 3); b.fromArray(pos, (t + 1) * 3); c.fromArray(pos, (t + 2) * 3)
    fn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize()
    for (let k = 0; k < 3; k++) {
      const kk = key(t + k)
      let v = acc.get(kk)
      if (!v) acc.set(kk, v = new Vector3())
      v.add(fn)
    }
  }
  acc.forEach((v) => v.normalize())
  const out = new Float32Array(n * 3)
  const up = new Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    const v = acc.get(key(i)) ?? up
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z
  }
  geo.setAttribute('normal', new BufferAttribute(out, 3))
}

/** push every vertex along its own surface by the ridged field; world units in and out */
function displace(geo: BufferGeometry, amp: number, freq: number): void {
  const pos = geo.attributes.position.array as Float32Array
  const n = geo.attributes.position.count
  /* the outward direction is the welded normal, so a crag pushes out of the mountain rather than
     out of whichever triangle this copy of the vertex happens to belong to */
  weldNormals(geo)
  const nrm = geo.attributes.normal.array as Float32Array
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2]
    /* the ridged field for the shape, plus one fine fbm octave for surface grain */
    const f = (jsRidged(x * freq, y * freq, z * freq) - 0.42) * 2.3
      + (jsFbm(x * freq * 5.3, y * freq * 5.3, z * freq * 5.3) - 0.5) * 0.55
    /* RIDGES GET THE MOST, VALLEY FLOORS THE LEAST. A mountain is rough at the top and buried in
       scree at the bottom, and pushing the base around only makes it float off the ground. */
    const h = Math.min(1, Math.max(0, (y - 200) / 2600))
    const k = amp * f * (0.35 + 0.65 * h)
    pos[i * 3] += nrm[i * 3] * k
    pos[i * 3 + 1] += nrm[i * 3 + 1] * k + f * amp * 0.45 * h
    pos[i * 3 + 2] += nrm[i * 3 + 2] * k
  }
}

/** take a world-space geometry back into the mesh's own frame, so its transform still applies */
function toLocal(geo: BufferGeometry, world: Matrix4): void {
  const inv = new Matrix4().copy(world).invert()
  const rot = new Matrix3().setFromMatrix4(world).transpose()
  const v = new Vector3()
  for (const key of ATTRS) {
    const a = geo.attributes[key]
    if (!a || key === 'color') continue
    const arr = a.array as Float32Array
    for (let i = 0; i < a.count; i++) {
      v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2])
      /* THE NORMAL TAKES THE TRANSPOSE, NOT THE INVERSE. For a rotation with a uniform scale the
         world-to-local normal map is R transpose, and normalising afterwards cancels the scale --
         which is every landform node in this export (measured: all three columns equal). */
      if (key === 'position') v.applyMatrix4(inv)
      else v.applyMatrix3(rot).normalize()
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z
    }
    a.needsUpdate = true
  }
}

export interface LandformStats {
  /** how many ridges were subdivided and pushed about */
  ranges: number
  /** the triangles they arrived with, and what they left as */
  trisBefore: number
  trisAfter: number
  /** how many mountains had their normals welded */
  fuji: number
  /** and how many vertices that welded */
  welded: number
  ms: number
}

/**
 * Give the skyline its crags and the mountain its shading.
 *
 * MUST RUN BEFORE THE FIRST RENDER — `freeCpuCopiesAfterUpload` nulls every position array once the
 * GPU has them, and both halves of this read positions. It was measured doing exactly that: a probe
 * written to run after boot found `position.array` already null on every landform in the world.
 *
 * And before `bakeHeightfield`, which reads these same triangles: crag them afterwards and the
 * ground the walkers stand on is the shape the ranges USED to be.
 */
export function buildLandform(root: Object3D): LandformStats {
  const t0 = performance.now()
  const st: LandformStats = {
    ranges: 0, trisBefore: 0, trisAfter: 0, fuji: 0, welded: 0, ms: 0,
  }
  const targets: { mesh: Mesh; crag: boolean }[] = []
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return
    if ((mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return
    const name = o.name || ''
    if (RANGE_RE.test(name)) targets.push({ mesh, crag: true })
    else if (FUJI_RE.test(name) && !FUJI_SKIP.test(name)) targets.push({ mesh, crag: false })
  })

  for (const { mesh, crag } of targets) {
    mesh.updateWorldMatrix(true, false)
    const src = mesh.geometry
    const before = src.index ? src.index.count / 3 : src.attributes.position.count / 3

    let geo = toWorldFloat(src, mesh.matrixWorld)
    if (crag && CRAG.on) {
      for (let i = 0; i < CRAG.splits; i++) geo = splitTris(geo)
      displace(geo, CRAG.amp, CRAG.freq)
      st.ranges++
      st.trisBefore += before
      st.trisAfter += geo.attributes.position.count / 3
    } else {
      st.fuji++
    }
    /* LAST, AND ON THE DISPLACED SHAPE. `displace` welds once to find which way is out; those
       normals belong to the mountain as it was, so the crags would be lit as though they were not
       there. This is the pass that makes it a landform rather than a rough sphere. */
    weldNormals(geo)
    st.welded += geo.attributes.position.count
    toLocal(geo, mesh.matrixWorld)
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    src.dispose()
    mesh.geometry = geo
  }

  st.ms = Math.round(performance.now() - t0)
  return st
}
