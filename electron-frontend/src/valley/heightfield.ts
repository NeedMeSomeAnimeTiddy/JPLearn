import { Box3, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from 'three'

/* ==================================================================================================
   HOW HIGH IS THE GROUND HERE — the one question everything that sits on the land has to ask.

   The water needs it (depth is the surface minus the bed, and depth is what colours a lake and puts
   foam at its edge), the crowd needs it, the boats need it. Nothing in this port has been able to
   ask it, which is why the valley has a garden pond and no lake: the lake is not in `world.glb` at
   all — it is a plane built at run time and shaped by the ground under it.

   BUILT FROM VERTICES, NOT FROM RAYCASTS, and the arithmetic is why. A 384-square grid is 147,000
   downward rays against a quarter of a million triangles, and three has no BVH — that is minutes,
   at boot, on the main thread. Splatting the terrain's own vertices into cells is ONE pass over the
   geometry, and since the mesh carries roughly one vertex per cell at this resolution it lands
   nearly exact.

   HIGHEST WINS. A terrain mesh has undersides, cliff backfaces and anything tucked below it; taking
   the last vertex written would sample whichever happened to come last in the buffer, which is a
   coin toss per cell and reads as noise in the ground.

   AND IT HAS TO RUN BEFORE THE FIRST RENDER. `freeCpuCopiesAfterUpload` nulls every position array
   once the GPU has them, so this shares its one window with `findFujiPeak` — a later pass finds
   nothing to measure and fails silently, which is exactly how that walk broke once already.
   ================================================================================================== */

/* reused rather than allocated per instance; declared here because `bakeHeightfield` reads it
   and a `const` read from inside its own temporal dead zone throws rather than reading
   undefined -- the same trap `OUTLINE_SCALE` documents in the mockup. */
const _mat = new Matrix4()

/** what counts as ground, by name. The same landform test the atmosphere's opt-out uses. */
export const TERRAIN = /landscape_terrain|_surfaces_|fuji|range/i

/** the resolution of the grid; 384 is the mockup's, and the mesh has about one vertex per cell */
export const FIELD_N = 384

/** where the world's floor sits when nothing else can answer */
export const GROUND_Y = -300

export interface Heightfield {
  /** row-major, `n` by `n` */
  data: Float32Array
  n: number
  x0: number
  z0: number
  dx: number
  dz: number
  /** ground height at a world point, bilinear, clamped at the edges */
  at: (x: number, z: number) => number
  /** for the boot line */
  stats: { cells: number; holes: number; min: number; max: number }
}

/** a flat field, for a world that answered with nothing */
export function flatField(y = GROUND_Y): Heightfield {
  return {
    data: new Float32Array(1).fill(y),
    n: 1,
    x0: 0,
    z0: 0,
    dx: 1,
    dz: 1,
    at: () => y,
    stats: { cells: 0, holes: 0, min: y, max: y },
  }
}

export function bakeHeightfield(root: Object3D, n = FIELD_N): Heightfield {
  const meshes: Mesh[] = []
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !TERRAIN.test(o.name)) return
    if (!mesh.geometry?.getAttribute?.('position')) return
    meshes.push(mesh)
  })
  if (!meshes.length) return flatField()

  const box = new Box3()
  for (const m of meshes) box.expandByObject(m)
  if (!Number.isFinite(box.min.x) || box.min.x === box.max.x) return flatField()

  const pad = 1e-3
  const x0 = box.min.x - pad
  const z0 = box.min.z - pad
  const dx = (box.max.x - box.min.x + 2 * pad) / (n - 1)
  const dz = (box.max.z - box.min.z + 2 * pad) / (n - 1)

  const f = new Float32Array(n * n).fill(NaN)
  const v = new Vector3()
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position')
    m.updateWorldMatrix(true, false)
    /* AN INSTANCED BATCH IS MANY PLACEMENTS OF ONE GEOMETRY, and the terrain is not batched -- but
       a range might be, and splatting its local vertices through the batch's identity matrix would
       pile every copy on the same spot. Walk the instances when there are any. */
    const inst = m as InstancedMesh
    const batched = inst.isInstancedMesh === true
    const count = batched ? inst.count : 1
    for (let c = 0; c < count; c++) {
      if (batched) inst.getMatrixAt(c, _mat)
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos as never, k)
        if (batched) v.applyMatrix4(_mat)
        v.applyMatrix4(m.matrixWorld)
        const i = Math.round((v.x - x0) / dx)
        const j = Math.round((v.z - z0) / dz)
        if (i < 0 || j < 0 || i >= n || j >= n) continue
        const q = j * n + i
        /* `!(a >= b)` rather than `a < b`, so a NaN cell is always written */
        if (!(f[q] >= v.y)) f[q] = v.y
      }
    }
  }

  /* FILL THE CELLS NO VERTEX LANDED IN, by spreading from the ones that did. A hole is a place the
     mesh is simply coarser than the grid, and leaving it NaN would poison everything downstream
     silently rather than loudly. */
  let holes = 0
  for (let k = 0; k < f.length; k++) if (Number.isNaN(f[k])) holes++
  const before = holes
  for (let pass = 0; pass < 64 && holes > 0; pass++) {
    const g = f.slice()
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const q = j * n + i
        if (!Number.isNaN(f[q])) continue
        let sum = 0
        let count = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di
            const jj = j + dj
            if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue
            const w = f[jj * n + ii]
            if (!Number.isNaN(w)) { sum += w; count++ }
          }
        }
        if (count) { g[q] = sum / count; holes-- }
      }
    }
    f.set(g)
  }
  /* anything still empty had no neighbours at all; flat ground beats a NaN */
  for (let k = 0; k < f.length; k++) if (Number.isNaN(f[k])) f[k] = GROUND_Y

  /* A LOOP, NOT `Math.min(...f)`. Spreading a 147,000-element array is 147,000 arguments and blows
     the call stack outright. */
  let lo = Infinity
  let hi = -Infinity
  for (let k = 0; k < f.length; k++) { if (f[k] < lo) lo = f[k]; if (f[k] > hi) hi = f[k] }

  const at = (x: number, z: number): number => {
    const fx = Math.min(n - 1, Math.max(0, (x - x0) / dx))
    const fz = Math.min(n - 1, Math.max(0, (z - z0) / dz))
    const i = Math.min(n - 2, Math.floor(fx))
    const j = Math.min(n - 2, Math.floor(fz))
    const tx = fx - i
    const tz = fz - j
    const a = f[j * n + i]
    const b = f[j * n + i + 1]
    const c = f[(j + 1) * n + i]
    const d = f[(j + 1) * n + i + 1]
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz
  }

  return {
    data: f,
    n,
    x0,
    z0,
    dx,
    dz,
    at,
    stats: { cells: n * n, holes: before, min: lo, max: hi },
  }
}
