import {
  BufferAttribute, BufferGeometry, Material, Matrix4, Mesh, Object3D, Quaternion, Vector3,
} from 'three'

/* ==================================================================================================
   AND THE WINDOWS GO OUT ONE AT A TIME.

   Every window in the onsen is marked with a material called `EMIT_window` — four floors of three
   inns, the shops and the bathhouse — and `LAMP_EMIT_MAT` already turns anything starting EMIT into
   a lamp, so the moment that lands they glow at full paper strength. What that alone does NOT give
   is life: ONE cloned material serves all of those meshes, so every window in the valley lights and
   dims together on one clock. A town whose four hundred windows go out simultaneously at dusk is a
   light switch, not a town.

   SO EACH WINDOW GETS ITS OWN BEDTIME, AND ITS IDENTITY IS ITS PLACE IN THE WORLD. The obvious
   channel — an index baked per window — cannot work: `PROP_inn_1` is ONE geometry drawn by two
   objects and `PROP_shop_1` by four, so an index would put both inns and all four shops on exactly
   the same pattern of lit and dark. What distinguishes them is the transform. So the attribute is
   the window's own centre in LOCAL space, the vertex shader pushes it out to world space, and the
   hash is taken of the result: same geometry, different building, different night.

   AND IN THIS PORT THAT MEANS THE INSTANCE MATRIX TOO, which is the one real difference from the
   mockup. `collapseToInstances` batches meshes that share a geometry and a material — which is
   exactly the two inns and the four shops — so the per-building transform lives in `instanceMatrix`
   and NOT in `modelMatrix`. Hashing `modelMatrix * aWinC` alone would put every building in a batch
   back on one clock, which is the precise failure this system exists to avoid, and it would look
   like the feature simply not working.

   NOTHING IS WRITTEN PER FRAME. Two uniforms — the hour and a clock — and every window works out its
   own state from a hash. The dusk ramp is deliberately not in here: the lantern sweep is already
   scaling this material's emissive by `lampOn`, and multiplying by it again would square it.
   ================================================================================================== */

/** the material slot the windows are marked with */
export const WINDOW_MAT = /^emit_window/i

/* ONE SPOT PER WINDOW, then every vertex carries its own window's centre. A lattice window is a
   dozen separate slat faces and they have to agree about which window they are. 100 WORLD units: a
   panel is about 120 across and the bays are 143 apart, so this gathers the slats of one and stops
   short of the next.

   AND IT IS CONVERTED TO THE GEOMETRY'S OWN UNITS BEFORE USE, which the mockup did not have to do
   and this port does. The world ships quantized, so `GLTFLoader` hands back geometry in a small
   local space with the real size folded into the node's transform: measured here, a whole inn is
   about a hundredth of the extent the mockup's loader gives. Used raw, 100 gathered every window in
   a building into ONE spot — six spots across six buildings, the whole town back on one clock, and
   it looked exactly like the feature not being wired up rather than like a threshold in the wrong
   units. */
export const WINDOW_SPOT = 100
/* NEVER FULLY OUT. A corridor light — a black rectangle in a lit wall reads as a hole rather than
   as a window with nobody behind it. */
export const WINDOW_FLOOR = 0.05

export const WINDOW_U = {
  /** the hour of the day, 0..24, written by the day cycle */
  uWinHour: { value: 12 },
  /** a free-running clock for the flicker */
  uWinTime: { value: 0 },
}

/**
 * Give a geometry an `aWinC` attribute: for each vertex, the centre of the window it belongs to.
 *
 * Greedy clustering on triangle centroids — the same shape the mockup uses for lantern spots, and
 * for the same reason. Cached on the geometry, because two inns share one.
 */
export function windowBake(geo: BufferGeometry, worldScale = 1): number {
  if (geo.getAttribute('aWinC')) return (geo.userData.winSpots as number) ?? 0
  const pos = geo.getAttribute('position')
  const ix = geo.index
  if (!pos) return 0

  const n = ix ? ix.count : pos.count
  const spots: Vector3[] = []
  const c = new Vector3()
  /* the threshold in the units this geometry is actually stored in */
  const local = WINDOW_SPOT / Math.max(1e-6, worldScale)
  const MIN = local * local

  for (let t = 0; t + 2 < n; t += 3) {
    const a = ix ? ix.getX(t) : t
    const b = ix ? ix.getX(t + 1) : t + 1
    const d = ix ? ix.getX(t + 2) : t + 2
    c.set(
      (pos.getX(a) + pos.getX(b) + pos.getX(d)) / 3,
      (pos.getY(a) + pos.getY(b) + pos.getY(d)) / 3,
      (pos.getZ(a) + pos.getZ(b) + pos.getZ(d)) / 3,
    )
    let near = false
    for (const s of spots) { if (s.distanceToSquared(c) < MIN) { near = true; break } }
    if (!near) spots.push(c.clone())
  }

  const out = new Float32Array(pos.count * 3)
  const v = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos as never, i)
    let best = 0
    let bd = Infinity
    for (let k = 0; k < spots.length; k++) {
      const d = spots[k].distanceToSquared(v)
      if (d < bd) { bd = d; best = k }
    }
    out[i * 3] = spots[best].x
    out[i * 3 + 1] = spots[best].y
    out[i * 3 + 2] = spots[best].z
  }
  geo.setAttribute('aWinC', new BufferAttribute(out, 3))
  geo.userData.winSpots = spots.length
  return spots.length
}

/**
 * Chain the bedtime shader onto a material.
 *
 * CHAINED, NOT ASSIGNED. By the time this runs the lantern sweep has cloned the material and
 * `breathe` has put the mist, the cover and the rim on its `onBeforeCompile`; replacing that hook
 * would take the valley's air off every window in the town. Same for the program cache key.
 */
export function windowLife(mat: Material): Material {
  const flagged = mat as Material & { userData: { winlife?: boolean } }
  if (flagged.userData.winlife) return mat
  flagged.userData.winlife = true

  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey

  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer)
    Object.assign(shader.uniforms, WINDOW_U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aWinC;
        uniform float uWinHour, uWinTime;
        varying float vWinLit;
        float winHash( vec3 p ) {
          return fract( sin( dot( p, vec3( 12.9898, 78.233, 45.164 ) ) ) * 43758.5453 );
        }`)
      /* after project_vertex, so both matrices are certainly in hand */
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 wc4 = vec4( aWinC, 1.0 );
          #ifdef USE_INSTANCING
            wc4 = instanceMatrix * wc4;
          #endif
          vec3 wc = ( modelMatrix * wc4 ).xyz;
          /* QUANTISED BEFORE HASHING: two vertices of one window must land on the same number, and
             floating point across a 57,000-unit world will not do that on its own. */
          vec3 key = floor( wc * 0.05 );
          float h = winHash( key );
          /* HOURS SINCE SIX IN THE EVENING, so a bedtime that crosses midnight is a straight
             comparison instead of a wrap. Most of the town is dark between nine and half two; one
             window in eight belongs to somebody who does not sleep. */
          float t = mod( uWinHour - 18.0 + 24.0, 24.0 );
          float bed = 3.0 + h * 5.5;
          if ( winHash( key + 7.31 ) > 0.875 ) bed = 13.0;
          float lit = 1.0 - smoothstep( bed - 0.18, bed + 0.18, t );
          lit = max( lit, ${WINDOW_FLOOR} );
          vWinLit = lit * ( 1.0 + 0.05 * sin( uWinTime * 0.7 + h * 37.0 ) );
        }`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWinLit;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vWinLit;')

    /* THE PATCH IS A STRING REPLACE AND STRING REPLACES FAIL SILENTLY. Both halves are checked,
       because a window system that quietly did nothing is exactly what this looks like when three
       renames a chunk. */
    if (!shader.fragmentShader.includes('totalEmissiveRadiance *= vWinLit')
      || !shader.vertexShader.includes('vWinLit = lit')) {
      console.error('[valley] the window patch did not take on', mat.name)
    }
  }
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|winlife'
  mat.needsUpdate = true
  return mat
}

export interface WindowField {
  /** how many distinct windows the bake found */
  spots: number
  /** how many meshes carry them */
  meshes: number
  /** the hour of the day, 0..24 */
  setHour: (hour: number) => void
  /** the flicker's clock, in seconds */
  tick: (seconds: number) => void
}

/**
 * Find the windows, bake their centres, and give them their own hours.
 *
 * MUST RUN AFTER `breathe`, because it chains onto whatever hook is already there.
 */
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _m = new Matrix4()

/* HOW BIG THIS GEOMETRY ACTUALLY IS IN THE WORLD, and for an instanced mesh that is NOT
   `matrixWorld`. `collapseToInstances` parents its batches to the root with an identity transform
   and puts every member's real placement in `instanceMatrix` -- so five of the six window meshes
   here report a world scale of exactly 1.0 while sitting in a local space an inn's worth of window
   is 1.5 units across. Measured: a threshold read off `matrixWorld` alone found 37 windows in a
   town of roughly 250, because only the one un-batched building (the bathhouse, scale 665) got a
   sensible number and the rest collapsed to one spot each. */
function worldScaleOf(mesh: Mesh): number {
  mesh.updateWorldMatrix(true, false)
  const inst = mesh as unknown as { isInstancedMesh?: boolean; getMatrixAt?: (i: number, m: Matrix4) => void }
  if (inst.isInstancedMesh && inst.getMatrixAt) {
    inst.getMatrixAt(0, _m)
    _m.premultiply(mesh.matrixWorld)
  } else {
    _m.copy(mesh.matrixWorld)
  }
  _m.decompose(_p, _q, _s)
  return Math.max(_s.x, _s.y, _s.z)
}

export function buildWindows(root: Object3D): WindowField {
  let spots = 0
  let meshes = 0
  const done = new Set<string>()

  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material as Material | Material[]
    if (Array.isArray(mat) || !WINDOW_MAT.test(mat?.name ?? '')) return
    if (mesh.geometry) {
      mesh.updateWorldMatrix(true, false)
      spots += windowBake(mesh.geometry, worldScaleOf(mesh))
    }
    meshes++
    if (!done.has(mat.uuid)) { done.add(mat.uuid); windowLife(mat) }
  })

  return {
    spots,
    meshes,
    setHour: (hour: number) => { WINDOW_U.uWinHour.value = hour },
    tick: (seconds: number) => { WINDOW_U.uWinTime.value += seconds },
  }
}
