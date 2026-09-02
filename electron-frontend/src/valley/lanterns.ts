import { Color, InstancedMesh, Matrix4, Mesh, Object3D, Vector3, type Material } from 'three'

/* ==================================================================================================
   WHAT A LANTERN NEEDS OF A MATERIAL, AND IT IS NOT A CLASS.

   This used to read `!src.isMeshStandardMaterial` and return. That was true of everything GLTFLoader
   hands back, and then `cel.ts` arrived and rebuilt the whole world as `MeshToonMaterial` -- which
   is emphatically not a standard material. Every lantern in the valley was skipped from that moment
   on, silently: the boot line still printed, because it counts what it found, and it found nothing.

   THE SYMPTOM WAS NOT "THE LANTERNS ARE OFF". It was a per-pixel comparison against the mockup
   showing this build BRIGHTER on the valley floor (+9.5) while visibly having far fewer lit points
   in the town -- ambient fill making up for local light that was not there. That is two wrongs
   reading as one milder wrong, which is why it took a measurement rather than a look.

   This is the second time the same mistake has been found in this port (see `nightmap.ts`) and the
   rule it teaches is: ask what a material must HAVE, never what it must BE. */
type Emissive = Material & {
  name: string
  emissive: Color
  emissiveIntensity: number
  clone(): Emissive
}
const isEmissive = (m: unknown): m is Emissive =>
  !!m && typeof m === 'object' && 'emissive' in m && (m as Emissive).emissive instanceof Color

/* ==================================================================================================
   THE LANTERNS — what makes the mockup's night a place and this port's night an empty valley.

   TWO MECHANISMS, AND THE SPLIT IS THE WHOLE DESIGN. A lantern has to LOOK lit and it has to LIGHT
   things, and those are different problems at wildly different prices.

     - LOOKING lit is emissive, and emissive is free: a colour added to a surface. All of them can
       glow at once and the cost is nothing. From the menu's standing point, six thousand units up
       the valley, this is the entire effect — a scatter of warm points in the dark.
     - LIGHTING things is a point light, and three's renderer is forward: every light in the scene
       is looped over for every fragment of every lit material, whether or not it reaches them. The
       mockup keeps a pool of six that follow the camera for the near field.

   THIS PORT DOES THE FIRST AND NOT THE SECOND, deliberately. The menu never gets closer than a
   destination fly-in, and a point light with a 1,400-unit reach is a pool on the ground around one
   lantern — at six thousand units none of them would reach anything anyway. The pool is what to add
   if the camera ever walks the town, and it has to be added as SIX PERMANENT LIGHTS at zero
   intensity rather than lights that appear at dusk: the light count is part of every material's
   program cache key, so adding them at nightfall would recompile the world's shaders in the middle
   of a sunset.

   AND THE PAPER ONES ARE NOT THE STONE ONES. A chochin is a candle behind paper and a toro is a
   candle behind a slab of granite, so what they SHOW differs by more than a factor of two. The
   mockup found the stone ones at 0.18 read as unlit from any distance — "a garden of 250 unlit
   lanterns next to a handful of bright paper ones" — and that is a glow problem rather than a light
   one: what a stone lantern CASTS really is that much dimmer, but the lantern itself still has to
   be visibly on.
   ================================================================================================== */

/** what a lantern is, by name, straight from the mockup */
export const LAMP_RE = /(^|[_\-.])(chochin|gaslamp|lant|lantern|andon|toro|lamp)/i
/** and what is only the thing it stands on */
export const LAMP_NOT = /(pole|post|stand|bracket|base)/i
/** the ones that are a candle behind paper rather than behind stone */
export const LAMP_PAPER = /(chochin|gaslamp|andon|lamp)/i

/* THE ONES THAT DO NOT STAY PUT. A chochin in this world is hung on a boat's deck, and a boat
   sails -- so its flame cannot go into the lamp grid, which is a floor plan baked once at load.
   Left in it, six lanterns light the mooring they were exported at for the rest of the run while
   the boats carrying them cross the lake in the dark. They are collected separately and given
   moving slots instead; see `boatlamp.ts`. */
export const LAMP_MOVING = /Chochin/i

/* AND A MATERIAL CAN SAY SO ITSELF, which is the rule that reaches the windows. Object names
   carry the lamp patterns above, but a building is not called a lantern -- `PROP_inn_1` and
   `PROP_bathhouse` are inns and bathhouses, and what glows on them is a material slot named
   `EMIT_window`. Any material whose NAME begins with EMIT is a lamp, at paper strength, and
   adding one in Blender is the whole of adding a light to this world. Measured here: two of the
   world's fifty-three materials qualify, over fifteen meshes. */
export const LAMP_EMIT_MAT = /^emit/i

/** the flame's own colour, for anything the model did not author an emission for */
export const LAMP_COLOUR = 0xffa94e
export const GAIN_PAPER = 1.35
export const GAIN_STONE = 0.5

/* ==================================================================================================
   AND WHAT A LAMP CASTS IS NOT WHAT IT SHOWS.

   `GAIN_PAPER` and `GAIN_STONE` above are what a lantern SHOWS -- its emissive, the thing that makes
   it read as lit from six thousand units up the valley. These two are what it CASTS into the grid,
   and they are a different ratio for a real reason: 灯籠 is a candle behind a slab of granite and a
   chochin is an open flame in paper.

   THE MOCKUP SWEPT IT IN THE ZEN COURT, where every lamp in the pool is stone, at 0.55 / 0.38 / 0.26
   of a chochin. The first two light the whole garden evenly, which is a garden with the lights on;
   0.26 is the one that gives each lantern its own pool of warm gravel falling off into the dark.
   That is what a stone lantern does, and it is why a court of them was coming out brighter than the
   festival street it was tuned against -- six overlapping pools in a small garden against six strung
   down a long avenue. */
export const CAST_PAPER = 1
export const CAST_STONE = 0.26

/* ==================================================================================================
   ONE LIGHT PER LANTERN, NOT ONE PER ROW OF THEM.

   The festival's chochin arrive as SPANS: a single instance 401 units long carrying a whole strung
   row. Its bounding-box centre gave that row ONE light in the middle with a 300-unit reach, so a row
   of eight lanterns lit the ground under the middle two and nothing else. That is exactly the "some
   lights aren't bright enough" report, and it was never about brightness.

   SINCE EMIT IS AUTHORITATIVE THE GEOMETRY HERE IS THE EMISSIVE PART, so its face centres ARE the
   flames. Clustering them at 130 units gives one spot for a compact lantern -- a gas lamp is 16
   units across, a kasuga 22, so every face falls inside one cluster -- and one spot per lantern along
   a span.

   AND THE MOCKUP'S HEIGHT RULE IS NOT PORTED, BECAUSE IT DOES NOT RUN. Immediately above the same
   block it computes a bounding-box centre and lifts it to 0.86 of the height for a post and 0.55 for
   a hanging lantern, with a long note about `Onsen_Props_GasLamp` glowing out of its own shaft at
   knee height. Then it never reads the variable: `emitSpots` superseded it and the older answer was
   left in place. Porting it would be porting a comment. The flame's own face centres solve the same
   problem better -- they are where the fire is, rather than a guess at where the fire is from the
   shape of the object around it.
   ================================================================================================== */
export const LAMP_CLUSTER = 130

/** a material that has been made into a lantern, and what it needs to be turned up */
export interface LampMat {
  mat: Emissive
  gain: number
  /* WHAT BLENDER AUTHORED, IF ANYTHING. An EMIT material or an Emission value set in the model wins
     over the built-in flame colour — the cycle then only decides how far up it is turned. */
  base: Color | null
}

/* WHERE A FLAME IS AND HOW HARD IT BURNS. A plain Vector3 with the cast strength on it, because the
   lamp grid wants both and a parallel array of gains that could fall out of step with the positions
   is a bug waiting for the first time somebody filters one of them. */
export type LampSpot = Vector3 & { gain: number }

export interface LanternField {
  mats: LampMat[]
  /** how many meshes were caught, for the boot line */
  meshes: number
  /** whether the .blend marked its own flames, which is what made every name rule stand down */
  authored: boolean
  /** how long the flame walk took, since it now reads geometry rather than bounding boxes */
  ms: number
  /* AND WHICH ONES, because the bloom pass draws exactly these and nothing else. Collected on the
     same walk that lights them, so the two can never disagree about what a lamp is -- a second
     traverse with a second copy of the predicate is how they would. */
  lit: Object3D[]
  /* WHERE EVERY FLAME IN THE VALLEY IS, collected on the same pass that finds them. Nothing needed
     this while the lanterns were only ever emissive -- but a firefly is only a firefly in the dark,
     so siting one means asking how far the nearest lit thing is, and this walk is already visiting
     all of them. The mockup keeps the same list for its lamp-cluster grid; here it is the darkness
     test and nothing else. */
  spots: LampSpot[]
  /** and the ones that travel, kept out of it -- see `LAMP_MOVING` */
  moving: Vector3[]
  /** turn the whole valley's lanterns up or down; 0 is out, 1 is full night */
  setOn: (on: number) => void
}

const FLAME = new Color(LAMP_COLOUR)

/**
 * Find every lantern in the world and give it a flame it can turn up.
 *
 * MUST RUN BEFORE THE ATMOSPHERE PATCH. `Material.clone()` copies `userData` but NOT
 * `onBeforeCompile`, so a clone taken after `breathe` would carry the `atmos` flag, take the
 * patch's early return, and silently lose the mist, the cover and the rim — one lantern-shaped
 * hole in the air per material. Cloning first means `breathe` simply walks the clones too.
 */
export function buildLanterns(root: Object3D): LanternField {
  const t0 = performance.now()
  const mats: LampMat[] = []
  /* KEYED ON THE MATERIAL AND ON WHAT IT IS MADE OF. One source material is shared across both
     kinds here, and a paper lantern and a stone one must not end up sharing a clone. */
  const swap = new Map<string, Emissive>()
  const spots: LampSpot[] = []
  const moving: Vector3[] = []
  const lit: Object3D[] = []
  const _m = new Matrix4()
  const _p = new Vector3()
  let meshes = 0

  /* ==================================================================================================
     EMIT WINS OUTRIGHT, AND EVERY NAME RULE ABOVE STANDS DOWN WHEN IT IS PRESENT.

     The name patterns exist to GUESS which objects are lamps in an export that says nothing. Once
     the .blend marks the actual faces, guessing is not a fallback -- it is a second, worse answer
     arriving at the same time. The mockup measured what that costs: its first export with EMIT
     materials collected 686 lamps instead of 362, because every lantern was counted twice, once for
     its glowing fire box and once for the whole stone body whose name matched. And the body then
     took a stone lantern's emissive over its ENTIRE SURFACE, which is the lava look the fire-box
     split was done to avoid.

     THIS PORT HAD THE OR AND NOT THE PRE-SCAN, which is the same bug: 879 flames found here against
     the mockup's 588, and `LAMP_I` was dropped from 1.8 to 0.7 to make the resulting glare match on
     screen. That was a real measurement of an unreal world -- half the extra light was lantern
     bodies, and turning the whole valley down to hide them dimmed the streets that were right.

     So: if the file contains any EMIT material at all, EMIT is the whole definition of a lamp. One
     extra traverse to find out, before any of it can matter.
     ================================================================================================== */
  let authored = false
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || authored) return
    const src = mesh.material as Emissive | Emissive[]
    if (Array.isArray(src) || !src) return
    if (LAMP_EMIT_MAT.test(src.name ?? '')) authored = true
  })

  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    /* `collapseToInstances` renames what it batches to `inst:<first member>`, so the name test has
       to survive that prefix -- which it does, because it is unanchored. */
    const src = mesh.material as Emissive | Emissive[]
    if (Array.isArray(src) || !isEmissive(src)) return
    /* the material's own name wins: an EMIT slot is a light wherever it has been put */
    const emit = LAMP_EMIT_MAT.test(src.name ?? '')
    if (authored && !emit) return
    if (!emit && (!LAMP_RE.test(o.name) || LAMP_NOT.test(o.name))) return

    const paper = emit || LAMP_PAPER.test(o.name)
    const key = src.uuid + (paper ? '|p' : '|s')
    let clone = swap.get(key)
    if (!clone) {
      clone = src.clone()
      const lit0 = clone.emissive
        && (clone.emissive.r + clone.emissive.g + clone.emissive.b) > 0.004
      mats.push({
        mat: clone,
        gain: paper ? GAIN_PAPER : GAIN_STONE,
        base: lit0 ? clone.emissive.clone() : null,
      })
      swap.set(key, clone)
    }
    mesh.material = clone
    meshes++
    lit.push(mesh)

    const gain = paper ? CAST_PAPER : CAST_STONE
    const travels = LAMP_MOVING.test(o.name)
    /* the placement, not the batch -- `collapseToInstances` leaves the group at the identity and
       puts every member's real position in `instanceMatrix` */
    const inst = mesh as unknown as InstancedMesh
    mesh.updateWorldMatrix(true, false)
    const faces = faceCentres(mesh.geometry)

    const place = (world: Matrix4) => {
      if (travels) {
        /* a boat's lantern is one light wherever it hangs: it goes through `uMoveL`, which has eight
           slots for the whole lake, so a strung row would eat them all */
        moving.push(_p.set(0, 0, 0).applyMatrix4(world).clone())
        return
      }
      if (!faces.length) {
        spots.push(Object.assign(_p.set(0, 0, 0).applyMatrix4(world).clone(), { gain }))
        return
      }
      clusterInto(faces, world, spots, gain)
    }

    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, _m)
        _m.premultiply(mesh.matrixWorld)
        place(_m)
      }
    } else place(mesh.matrixWorld)
  })

  const setOn = (on: number) => {
    for (const l of mats) l.mat.emissive.copy(l.base ?? FLAME).multiplyScalar(on * l.gain)
  }
  /* out at build time: the day cycle turns them up, and it runs before the first frame */
  setOn(0)

  return {
    mats, meshes, spots, moving, lit, setOn, authored,
    ms: Math.round(performance.now() - t0),
  }
}

/* ==================================================================================================
   THE FACE CENTRES, CACHED ON THE GEOMETRY, AND THE CLUSTERING DONE IN WORLD SPACE PER INSTANCE.

   The mockup does both in local space and caches the result, which is correct THERE because its
   export is in world units: geometry and world are the same scale, so 130 means 130 either way.

   THIS WORLD IS QUANTIZED. `KHR_mesh_quantization` normalises every primitive's positions to about
   plus or minus one and puts the real size in the node transform -- `Landscape_Props_FarRange_001`
   spans 12,289 units in the mockup's file and 2 units with a scale of 9,410 in ours. A 130-unit
   clustering radius read as local units on that geometry swallows the whole object, so every strung
   row of chochin would collapse back to the single light this exists to stop.

   So the expensive half -- reading the position attribute -- is cached per geometry, and the cheap
   half is done per instance with the world matrix applied. It is the third time this file has had to
   be told the difference (see `landform.ts` and `sway.ts` for the other two).
   ================================================================================================== */
const _fc = new Vector3()

/** every triangle's centre, in the geometry's own space, computed once per geometry */
function faceCentres(geo: Mesh['geometry']): Vector3[] {
  const cached = (geo.userData as { lampFaces?: Vector3[] }).lampFaces
  if (cached) return cached
  const out: Vector3[] = []
  const pos = geo.attributes.position
  const ix = geo.index
  /* an attribute whose array has already been handed back to the GPU -- see
     `freeCpuCopiesAfterUpload`. This walk runs before the first render, so it should not happen; if
     the order ever changes, an empty list falls back to the object's origin rather than throwing. */
  if (pos && pos.array) {
    const n = ix ? ix.count : pos.count
    for (let t = 0; t + 2 < n; t += 3) {
      const a = ix ? ix.getX(t) : t
      const b = ix ? ix.getX(t + 1) : t + 1
      const c = ix ? ix.getX(t + 2) : t + 2
      out.push(new Vector3(
        (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3,
        (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3,
        (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3,
      ))
    }
  }
  ;(geo.userData as { lampFaces?: Vector3[] }).lampFaces = out
  return out
}

/** put one spot per lantern into `out`, clustering this instance's flames at `LAMP_CLUSTER` */
function clusterInto(
  faces: readonly Vector3[], world: Matrix4, out: LampSpot[], gain: number,
): void {
  const min2 = LAMP_CLUSTER * LAMP_CLUSTER
  const first = out.length
  for (const f of faces) {
    _fc.copy(f).applyMatrix4(world)
    let near = false
    for (let k = first; k < out.length; k++) {
      if (out[k].distanceToSquared(_fc) < min2) { near = true; break }
    }
    if (!near) out.push(Object.assign(_fc.clone(), { gain }))
  }
}

/* ==================================================================================================
   AND A FLAME IS NOT A CONSTANT.

   Every lantern here has been a fixed emissive value: 879 flames all at exactly the same brightness,
   all holding it perfectly still. That is what makes a lit window read as a bright texture rather
   than as something burning, and it is the difference the mockup's night has that this one did not.

   TWO SINES AT INCOMMENSURABLE RATES, which is the mockup's own arrangement -- 1 and 2.37, so the
   pair does not repeat inside a minute -- with a PER-LAMP PHASE so no two lanterns share a beat. The
   mockup carries that phase in a data texture because it is driving a grid of real light positions;
   here the lanterns are emissive surfaces on instanced meshes, so the phase comes off a hash of each
   instance's own position and costs nothing. Same shape, same numbers, one fewer texture.

   IN THE SHADER, NOT ON THE MATERIAL, and that is the whole reason this is not four lines of
   JavaScript. There are 879 flames and FOUR materials between them: modulating `mat.emissive` would
   pulse every lantern in the valley in perfect step, which is worse than not flickering at all.

   CHAINED, NOT ASSIGNED -- the same rule the windows follow. By the time this runs, `breathe` has put
   the mist, the cloud cover and the rim light on the material's `onBeforeCompile`; replacing that
   hook would take the valley's air off every lantern in the town. The cache key is extended for the
   same reason: three's default `customProgramCacheKey` is `onBeforeCompile.toString()`, so two
   materials that differ only in a chained patch would otherwise share one compiled program.
   ================================================================================================== */
export const FLICKER = {
  /* `?flicker=off` -- the only honest way to price a thing, and the only way to see what it buys.
     NOT `on`: that is taken by the day gate below, which is a uniform rather than a switch. */
  enabled: new URLSearchParams(window.location.search).get('flicker') !== 'off',
  /** how far a flame strays from its own steady state */
  amt: { value: 0.16 },
  rate: { value: 2.1 },
  /** the clock, and `uFlickerOn` folds the day in so a flame is steady before it is lit */
  t: { value: 0 },
  on: { value: 0 },
}

const FLICKER_U = {
  uFlickAmt: FLICKER.amt,
  uFlickRate: FLICKER.rate,
  uFlickT: FLICKER.t,
  uFlickOn: FLICKER.on,
}

/** advance the flame clock; `on` is the day cycle's `lampOn`, so nothing flickers by daylight */
export function flickerTick(seconds: number, on: number): void {
  if (!FLICKER.enabled) return
  FLICKER.t.value += seconds
  FLICKER.on.value = on
}

export function flameFlicker(mat: Material): Material {
  const flagged = mat as Material & { userData: { flicker?: boolean } }
  if (flagged.userData.flicker) return mat
  flagged.userData.flicker = true

  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey

  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer)
    Object.assign(shader.uniforms, FLICKER_U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uFlickAmt, uFlickRate, uFlickT, uFlickOn;
        varying float vFlick;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          /* THE PHASE IS THE LAMP'S OWN PLACE. Instanced, that is the instance matrix's
             translation; loose, it is the model matrix's -- so a lantern that is one of two hundred
             and a lantern that is a mesh of its own both get a phase nobody else has. */
          #ifdef USE_INSTANCING
            vec3 lampAt = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ],
                                instanceMatrix[ 3 ][ 2 ] );
          #else
            vec3 lampAt = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #endif
          float ph = fract( sin( dot( lampAt.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831;
          float t = uFlickT * uFlickRate;
          float a = uFlickAmt * uFlickOn;
          vFlick = 1.0 + a * ( sin( t + ph ) * 0.6 + sin( t * 2.37 + ph * 3.1 ) * 0.4 );
        }`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n        varying float vFlick;')
      /* after three has assembled the emission, so this scales what the material actually emits
         rather than replacing it */
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n        totalEmissiveRadiance *= vFlick;')
  }
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|flicker'
  mat.needsUpdate = true
  return mat
}
