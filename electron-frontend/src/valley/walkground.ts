import { InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from 'three'
import { GROUND_Y, type Heightfield } from './heightfield'

/* ==================================================================================================
   WHAT A WALKER IS STANDING ON — and it is not the heightfield.

   `bakeHeightfield` answers "how high is the ground here" over the whole valley on a 384-square
   grid, and this world is 70,000 units across, so a cell is 183 units. That is fine for the job it
   was built for and it cannot place a person. MEASURED, against a triangle-exact answer over the
   981 samples of the three loops below:

       Festival   min −3    p10 −0    median 0    p90 +3    max +4
       Valley     min −30   p10 −1    median +6   p90 +14   max +44
       Town       min −167  p10 −136  median 0    p90 +1    max +24

   The Town figures are the whole story. The onsen's street is a raised slab about 170 units above
   the terrain beside it, and a bilinear read across a 183-unit cell smooths that step over the
   width of one cell — so an eighth of the town's samples put a 65-unit figure more than two body
   heights UNDER the road. No amount of tuning fixes a resolution problem; it needs the triangles.

   A GRID, NOT A RAYCASTER, and that is the mockup's measurement rather than a preference. It asked
   THREE.Raycaster for 926 downward rays and the page took twenty seconds to load — 4.1 s without
   the walkers, 24.0 s with. One mesh explains it: `Landscape_Terrain_Terrain_001` is 286,032 of the
   world's triangles and its bounding box is the whole valley, so it can never be culled and every
   ray tests all of it. Flat arrays and an XZ grid instead: one pass to build, a handful of
   barycentric tests to query.

   AND ONLY UNDER THE ROADS. This is where the port departs from the mockup, which flattens every
   ground triangle in the world because its loop editor can drag a curve anywhere. There is no loop
   editor here, nothing else asks this question, and the whole valley is 391,000 ground triangles —
   14 MB of retained Float32Array to answer for lanes that cover a fraction of it. The corridor is
   derived from the curves the walkers actually walk, which is the same rule the rest of this port
   follows: derive it, do not author it.

   IT MUST RUN BEFORE THE FIRST RENDER. `freeCpuCopiesAfterUpload` nulls every position array once
   the GPU has them, so this shares its one window with `findFujiPeak` and `bakeHeightfield`.
   ================================================================================================== */

/** the XZ cell the grid buckets triangles into */
export const GROUND_CELL = 300

/* HOW FAR ABOVE THE GROUND A THING CAN BE AND STILL BE A FLOOR YOU STEP ONTO. Not a guess: it is
   the gap in the mockup's own measurement of what sits over its loops. Floors and plinths came in
   under a hundred units — the shrine approach's decking at 14 to 100, the yagura's deck at 19 —
   the next thing up was a prop at 170, and everything above that was a roof. 140 is the middle of
   that gap, and it makes the rule general instead of a list of mesh names: a floor is a flat
   surface you could step onto and a roof is not, and the difference is measurable without knowing
   what either is called. */
export const DECK_RISE = 140

/* AND NOT THE UNDERSIDE OF A SLAB. `Onsen_Surfaces_TownGround` is a slab whose bottom flange reaches
   further out than its top, so just past the edge of the street the only triangle over a point is
   the one facing DOWN 380 units below it — flat, so the wall test lets it through, and "highest
   wins" cannot help when it is the only candidate. The heightfield is the terrain and authored
   ground sits on the terrain, so anything more than this far below it is not the ground. */
export const FLOOR_REACH = 90

/* NOBODY STANDS ON A WALL. A slope past 52 degrees is one, and every authored ground slab in this
   world has a skirt — `Onsen_Surfaces_TownGround` reads −157 across the town and drops to −510 at
   its edge. A near-vertical triangle has a sliver of a footprint in XZ that a point can still land
   inside, and it cost the mockup one Town sample 380 units below the street.
   THROWN AWAY AT BUILD RATHER THAN FLAGGED. The mockup keeps them and tests a `steep` bit per
   candidate, which it has to: its grid is the whole world and its loop editor can drag a curve into
   any of it. Nothing here can, and a triangle that can never be an answer costs 36 bytes and a
   branch for nothing. Measured over this corridor, 31% of it was walls. */
const STEEP = 0.62

/** what counts as ground: the terrain, the authored surfaces, the mountain and the ranges */
export const WALK_GROUND = /Landscape_Terrain|_Surfaces_|Landscape_Props_(Fuji|Range|FarRange)/
/** and what is never any of it, whatever it is called */
export const WALK_NEVER = /Water|Pool|SkyDome/i

export interface TriGrid {
  /** nine floats a triangle, world space */
  tri: Float32Array
  grid: Map<number, number[]>
  tris: number
  cells: number
  walls: number
}

const key = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768)

/** the highest triangle over (x, z) inside a height window, or null */
export function gridY(g: TriGrid, x: number, z: number, lo: number, hi: number): number | null {
  const cell = g.grid.get(key(Math.floor(x / GROUND_CELL), Math.floor(z / GROUND_CELL)))
  if (!cell) return null
  const t = g.tri
  let best: number | null = null
  for (let i = 0; i < cell.length; i++) {
    const o = cell[i] * 9
    const ax = t[o], ay = t[o + 1], az = t[o + 2]
    const bx = t[o + 3], by = t[o + 4], bz = t[o + 5]
    const cx = t[o + 6], cy = t[o + 7], cz = t[o + 8]
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (d > -1e-9 && d < 1e-9) continue
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
    if (u < -1e-6) continue
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
    if (v < -1e-6 || u + v > 1 + 1e-6) continue
    const y = ay * u + by * v + cy * (1 - u - v)
    if (y < lo || y > hi) continue
    if (best === null || y > best) best = y
  }
  return best
}

/** which cells the corridor covers: everything within `pad` of a polyline */
export function corridorCells(path: readonly number[], pad: number, into = new Set<number>()): Set<number> {
  for (let i = 0; i < path.length; i += 2) {
    const j = (i + 2) % path.length
    const steps = Math.max(1, Math.ceil(Math.hypot(path[j] - path[i], path[j + 1] - path[i + 1]) / 100))
    for (let s = 0; s <= steps; s++) {
      const x = path[i] + (path[j] - path[i]) * s / steps
      const z = path[i + 1] + (path[j + 1] - path[i + 1]) * s / steps
      const c0 = Math.floor((x - pad) / GROUND_CELL), c1 = Math.floor((x + pad) / GROUND_CELL)
      const d0 = Math.floor((z - pad) / GROUND_CELL), d1 = Math.floor((z + pad) / GROUND_CELL)
      for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) into.add(key(cx, cz))
    }
  }
  return into
}

const _v = new Vector3()
const _m = new Matrix4()

/** flatten a list of meshes into a grid, keeping only what lands in `want` */
export function flatten(meshes: readonly Mesh[], want: Set<number>): TriGrid {
  const tri: number[] = []
  const grid = new Map<number, number[]>()
  let walls = 0

  for (const mesh of meshes) {
    const pos = mesh.geometry?.getAttribute('position')
    if (!pos) continue
    mesh.updateWorldMatrix(true, false)
    const idx = mesh.geometry.index
    const faces = ((idx ? idx.count : pos.count) / 3) | 0
    /* AN INSTANCED SET IS OUT OF BOTH LISTS AND THIS IS WHY IT MATTERS HERE. After
       `collapseToInstances` a batch's `matrixWorld` is the group's identity and every member's real
       placement is in `instanceMatrix` — flattening its triangles through the group matrix would
       pile every copy at the origin. Nothing anyone walks on in this export is batched (the batches
       are trees, lanterns, clutter and people), so they are simply skipped rather than walked. */
    const inst = mesh as InstancedMesh
    if (inst.isInstancedMesh) continue
    _m.copy(mesh.matrixWorld)

    for (let f = 0; f < faces; f++) {
      const base = tri.length
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (let k = 0; k < 3; k++) {
        _v.fromBufferAttribute(pos as never, idx ? idx.getX(f * 3 + k) : f * 3 + k).applyMatrix4(_m)
        tri.push(_v.x, _v.y, _v.z)
        if (_v.x < x0) x0 = _v.x
        if (_v.x > x1) x1 = _v.x
        if (_v.z < z0) z0 = _v.z
        if (_v.z > z1) z1 = _v.z
      }
      const gx0 = Math.floor(x0 / GROUND_CELL), gx1 = Math.floor(x1 / GROUND_CELL)
      const gz0 = Math.floor(z0 / GROUND_CELL), gz1 = Math.floor(z1 / GROUND_CELL)
      /* a triangle spanning more than a dozen cells is a far-mountain face nobody walks on, and
         inserting it into two hundred cells costs more than it can ever answer */
      const spread = (gx1 - gx0 + 1) * (gz1 - gz0 + 1)
      let wanted = false
      if (spread <= 12) {
        for (let cx = gx0; cx <= gx1 && !wanted; cx++) {
          for (let cz = gz0; cz <= gz1; cz++) if (want.has(key(cx, cz))) { wanted = true; break }
        }
      }
      if (!wanted) { tri.length = base; continue }

      const ex1 = tri[base + 3] - tri[base], ey1 = tri[base + 4] - tri[base + 1]
      const ez1 = tri[base + 5] - tri[base + 2]
      const ex2 = tri[base + 6] - tri[base], ey2 = tri[base + 7] - tri[base + 1]
      const ez2 = tri[base + 8] - tri[base + 2]
      const nx = ey1 * ez2 - ez1 * ey2, ny = ez1 * ex2 - ex1 * ez2, nz = ex1 * ey2 - ey1 * ex2
      const nl = Math.hypot(nx, ny, nz) || 1
      if (Math.abs(ny) / nl < STEEP) { walls++; tri.length = base; continue }

      const t = base / 9
      for (let cx = gx0; cx <= gx1; cx++) {
        for (let cz = gz0; cz <= gz1; cz++) {
          const k = key(cx, cz)
          const a = grid.get(k)
          if (a) a.push(t); else grid.set(k, [t])
        }
      }
    }
  }

  return {
    tri: Float32Array.from(tri),
    grid,
    tris: tri.length / 9,
    cells: grid.size,
    walls,
  }
}

export interface Footing {
  ground: TriGrid
  deck: TriGrid
  /** the ground under a point: the highest floor, never a wall, never a slab's underside */
  at: (x: number, z: number) => number
}

/**
 * Build the two grids and the query over them.
 *
 * TWO LISTS, ONE PASS, TWO GRIDS. The ground is `_Surfaces_` and the terrain, never the water. The
 * deck is everything else authored and plain — floors, plinths, bridge decks, verandas — and it may
 * only ever RAISE the answer, by no more than a step, so a roof in it is inert rather than
 * dangerous. Without it the Valley loop walks straight through the shrine approach's decking,
 * which is 31 to 100 units up and is a Prop rather than a Surface.
 */
export function buildFooting(root: Object3D, field: Heightfield, want: Set<number>): Footing {
  const groundList: Mesh[] = []
  const deckList: Mesh[] = []
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const n = o.name
    if (WALK_NEVER.test(n)) return
    if (WALK_GROUND.test(n)) { groundList.push(mesh); return }
    const g = mesh.geometry
    if (!g) return
    /* a mesh this size is the terrain or a mountain, and neither is a floor */
    const count = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)
    if (count / 3 > 40000) return
    deckList.push(mesh)
  })

  const ground = flatten(groundList, want)
  const deck = flatten(deckList, want)

  const at = (x: number, z: number): number => {
    /* THE HEIGHTFIELD IS THE FLOOR OF THE SEARCH, NOT THE ANSWER. It is what keeps a slab's
       downward-facing underside from winning when it is the only candidate over a point. */
    const base = field ? field.at(x, z) : GROUND_Y
    let best = gridY(ground, x, z, base - FLOOR_REACH, Infinity)
    if (best === null) best = base
    const up = gridY(deck, x, z, best + 1, best + DECK_RISE)
    return up ?? best
  }

  return { ground, deck, at }
}
