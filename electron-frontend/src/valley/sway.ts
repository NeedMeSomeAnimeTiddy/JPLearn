import {
  BufferAttribute, Vector3,
  type BufferGeometry, type InstancedMesh, type Material, type Mesh, type Object3D,
} from 'three'
import { breathe } from './atmosphere'

/* ==================================================================================================
   THE TREES MOVE.

   17,291 PLANTS, 10,039 OF THEM IN THE MENU FRAME, AND EVERY ONE OF THEM WAS FROZEN. Measured at
   the menu's own eye against this build: the nearest cedar is 1,246 units tall at 1,865 out, which
   is 697 pixels of screen height standing perfectly still while the crowd shifts its weight, the
   banners sway, the boats sail and the smoke climbs. It was the largest dead area of the picture by
   a wide margin.

   IT IS ALL IN THE VERTEX SHADER, and it has to be: seventeen thousand instance matrices rewritten
   every frame is a megabyte of upload a frame to make trees wobble. Every plant gets its own phase
   and its own clock out of its own position, so there is no per-instance attribute to author, store
   or export -- the same bargain the crowd's idle strikes.

   ONE MATERIAL, CLONED. Every plant in this world draws with `JP_VertexColor` -- and so does every
   building, every boat and every lantern body (measured: one material across all 71 vegetation
   meshes, and it is shared with non-vegetation). Patching it in place would set the inns swaying.
   So it is cloned and re-breathed, exactly as `buildCrowd` does and for exactly the same reason:
   `Material.clone()` copies `userData` but NOT `onBeforeCompile`, so the clone arrives carrying the
   `atmos` flag and none of the patch it stands for.

   AND SOME OF THE ARITHMETIC IS NOT THE MOCKUP'S, BECAUSE THIS BUILD'S WORLD FILE IS NOT ITS WORLD
   FILE. See `SWAY_GLSL` below. The short version: the port's `world.glb` was run through
   glTF-Transform with KHR_mesh_quantization and the mockup's was not, so every plant's geometry
   measures about two units tall here and its real size lives in the transform. Transplanting the
   mockup's arithmetic unchanged would hand a cedar and a blade of grass the same height.
   ================================================================================================== */

/* NOT 1, 2 OR 3: those are the crowd's prepass, the atmosphere's sky-and-sun, and the bloom. Four
   layers, four jobs, and a collision here would put the trees through the lantern bleed. */
export const SWAY_LAYER = 4

/* WHAT THE MOCKUP IS ACTUALLY RUNNING, which is not what its source says. `SWAY` is declared there
   with amp 0.35 / rate 0.75 / gust 0.55, and then `sway.json` -- written by Robbie out of the
   in-page editor -- is fetched at boot and laid over the defaults with these. The file is three
   lines and it is the live setting; reading the constants alone would have ported a wind nobody has
   looked at since it was tuned. */
export const SWAY = {
  on: true,
  /** how far a plant leans, in WORLD units, as `amp * height^0.55` */
  amp: { value: 1.2 },
  rate: { value: 0.5 },
  /** how much of the motion is the travelling gust rather than the plant's own breathing */
  gust: { value: 0.65 },
  t: { value: 0 },
  /* THE WIND'S DIRECTION, SHARED WITH THE WISPS. One Vector3 behind two uniforms, so tuning the
     weather turns the trees and the air together rather than leaving them disagreeing. */
  dir: { value: new Vector3(-0.937, 0, 0.350).normalize() },
}

export const SWAY_U = {
  uSwayT: SWAY.t,
  uSwayAmp: SWAY.amp,
  uSwayGust: SWAY.gust,
  uSwayRate: SWAY.rate,
  uSwayDir: SWAY.dir,
}

/* ==================================================================================================
   EXPORTED, BECAUSE THE OUTLINE PASS HAS TO REPEAT IT -- the same arrangement `IDLE_GLSL` is under.
   `ink.ts` renders the world with an OVERRIDE material, which replaces the vertex shader this
   displacement lives in, so the prepass reads this string rather than restating it. Written twice
   they drift the moment either is tuned, and the symptom is an outline sliding out of its tree.

   THREE THINGS HERE ARE NOT IN THE MOCKUP, and each one is forced by the quantized world file:

   1. THE HEIGHT IS MULTIPLIED BACK UP. `aPlant.y` is the geometry's own height, and this world's
      geometry is normalised -- so it is about 2 for every plant in the valley, a 1,907-unit sacred
      cedar and a 6-unit blade of grass alike. `pow( h, 0.55 )` exists precisely to tell those two
      apart (a straight proportion leaves the grass dead; no proportion at all makes the cedar
      thrash), and fed 2.0 twice it returns the same number twice. So the world height is
      reconstructed here out of the transform's own scale.

   2. AND THE DISPLACEMENT IS DIVIDED BACK DOWN. `transformed` is in the geometry's local space and
      the instance matrix has not been applied yet, so one local unit becomes `sc` world units at
      `<project_vertex>`. Dividing by `sc` is what makes `amp` mean world units, which is what every
      number in it was tuned as.

   3. THE WIND IS ROTATED INTO THE PLANT'S OWN FRAME. Measured on this export: the vegetation
      instances are yawed across a 358-degree spread -- they are randomly turned, as scattered trees
      are. Displacing along `uSwayDir.xz` in LOCAL space therefore sends every tree a different way
      in the world, and the travelling gust below -- whose entire purpose is that the wave arrives at
      the near shore after the far one -- reads as noise instead of weather. `uSwayDir * W` is
      `transpose( W ) * uSwayDir`, which for a scaled rotation is the wind in the plant's own frame.
   ================================================================================================== */
export const SWAY_GLSL = `
  uniform float uSwayT, uSwayAmp, uSwayGust, uSwayRate;
  uniform vec3 uSwayDir;
  /* .x is HOW FAR UP ITS OWN PLANT this vertex is, 0 at the foot and 1 at the tip; .y is how tall
     the plant's geometry is. Baked per vertex against the geometry's own bounding box, so where the
     origin sits stops being a question anyone has to answer -- this export models plants about
     their middle as often as about their base, and dividing a raw local y by the height assumes the
     second. */
  attribute vec2 aPlant;
  void swayPlant( inout vec3 p, vec3 ip, mat3 W ) {
    /* the transform's own scale, and the height it implies out in the world */
    float sc = length( W[ 1 ] );
    float H = aPlant.y * sc;
    if ( H < 0.5 || sc < 1e-4 ) return;
    float ph = fract( sin( dot( ip.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    /* a tree bends: the trunk holds and the crown carries it */
    float bend = pow( clamp( aPlant.x, 0.0, 1.0 ), 2.2 );
    float t = uSwayT * uSwayRate * ( 0.72 + ph * 0.56 ) + ph * 6.2831;
    /* A GUST CROSSES THE VALLEY rather than every plant breathing together: the phase runs along
       the wind, so the wave arrives at the near shore after the far one. */
    float g = 0.5 + 0.5 * sin( uSwayT * 0.19 - dot( ip.xz, uSwayDir.xz ) * 0.00055 );
    /* to the power 0.55, so a 1,900-unit sugi leans about seventy units and a six-unit blade of
       grass still moves a fifth of its own height -- then back into local units, since that is the
       space "transformed" is in */
    float amp = uSwayAmp * pow( H, 0.55 ) / sc;
    float a = ( sin( t ) * 0.72 + sin( t * 1.73 + ph ) * 0.28 ) * amp * bend
            * ( 1.0 - uSwayGust + uSwayGust * g * 2.0 );
    vec3 ld = uSwayDir * W;
    float ll = length( ld.xz );
    if ( ll < 1e-5 ) return;
    p.xz += ( ld.xz / ll ) * a;
    /* and the tip dips as it goes over, so the crown swings rather than slides sideways */
    p.y -= abs( a ) * 0.14 * bend;
  }`

/* THE CALL, AS ONE STRING, so the lit material and the outline prepass cannot disagree about which
   frame a plant is standing in. `W` is the plant's full linear transform -- the mesh's and the
   instance's together -- and `ip` is its origin out in the world. */
const SWAY_CALL = `
  #ifdef USE_INSTANCING
    swayPlant( SWAY_P, ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz,
               mat3( modelMatrix ) * mat3( instanceMatrix ) );
  #else
    swayPlant( SWAY_P, ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz, mat3( modelMatrix ) );
  #endif`

/** the call above, aimed at one variable */
export function swayCall(target: string): string {
  return SWAY_CALL.replace(/SWAY_P/g, target)
}

/**
 * Per vertex: how far up its own plant it is, and how tall that plant's geometry is.
 *
 * Returns false when the geometry already carries it — one geometry stands hundreds of trees, so
 * this is asked once per mesh and answered once per model.
 */
export function swayBake(geo: BufferGeometry): boolean {
  if (geo.getAttribute('aPlant')) return false
  const pos = geo.getAttribute('position')
  if (!pos) return false
  if (!geo.boundingBox) geo.computeBoundingBox()
  const y0 = geo.boundingBox!.min.y
  const h = geo.boundingBox!.max.y - y0
  const a = new Float32Array(pos.count * 2)
  /* A ZEROED ATTRIBUTE IS THE OFF SWITCH: an `aPlant.y` of 0 fails the height test in the shader,
     so a geometry with no vertical extent -- a ground decal named as vegetation -- is simply not
     swept up, and it costs a branch rather than a second material. */
  if (h > 1e-6) {
    for (let i = 0; i < pos.count; i++) {
      a[i * 2] = (pos.getY(i) - y0) / h
      a[i * 2 + 1] = h
    }
  }
  geo.setAttribute('aPlant', new BufferAttribute(a, 2))
  return true
}

/**
 * Chain the sway onto a material.
 *
 * CHAINED, NOT ASSIGNED — the same rule the crowd and the windows follow. By the time this runs
 * `breathe` has put the mist, the cover and the rim on `onBeforeCompile`, and replacing that hook
 * would take the valley's air off every tree in it. Same for the program cache key: three's default
 * IS `onBeforeCompile.toString()`, so two materials whose hooks read alike share one compiled
 * program — which is how the vegetation's sway would end up displacing the entire world.
 */
export function swayPatch(mat: Material): Material {
  const flagged = mat as Material & { userData: { sway?: boolean } }
  if (flagged.userData.sway) return mat
  flagged.userData.sway = true

  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey

  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer)
    Object.assign(shader.uniforms, SWAY_U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWAY_GLSL}`)
      /* AFTER begin_vertex writes `transformed` and BEFORE project_vertex reads it, which is where
         `breathe` builds the world position every lit fragment is shaded from — so the displacement
         is what the projection, the shadow, the fog and the lamp light all actually see. */
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${swayCall('transformed')}`)

    if (!shader.vertexShader.includes('swayPlant( transformed')) {
      console.error(`[valley] the sway did not take on ${mat.name}`)
    }
  }
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|sway`
  mat.needsUpdate = true
  return mat
}

/* WHAT COUNTS AS A PLANT. The mockup's own list, and it is a NAME test rather than a material one
   because the material is shared with half the valley. */
const SWAY_RE = /_Vegetation_|_Forest_|Nature_Trees_|GroundCover|Grass|Bamboo|Susuki/i

export interface SwayField {
  /** how many plants, counting instances */
  plants: number
  /** the meshes they arrived on */
  meshes: Object3D[]
  /** and how many distinct geometries had to be baked */
  geos: number
  /** the shortest and tallest plant found, in world units, for the boot line */
  heights: [number, number]
  material: Material | null
}

/**
 * Find the vegetation and set it moving.
 *
 * MUST RUN AFTER `breathe` and BEFORE the first render — after, because it chains onto that hook;
 * before, because `freeCpuCopiesAfterUpload` nulls every position array once the GPU has them and
 * the bake reads them.
 */
export function buildSway(root: Object3D): SwayField {
  const meshes: Object3D[] = []
  let material: Material | null = null
  let plants = 0
  let geos = 0
  let lo = Infinity
  let hi = 0

  root.traverse((o) => {
    const mesh = o as Mesh & InstancedMesh
    if (!mesh.isMesh && !mesh.isInstancedMesh) return
    if (!SWAY_RE.test(o.name || '')) return
    const src = mesh.material as Material | Material[]
    /* a plant split across two materials would need two clones, and there are none in this world */
    if (Array.isArray(src)) return
    if (!mesh.geometry?.getAttribute?.('position')) return

    if (!material) {
      material = src.clone()
      material.name = `${src.name || 'plant'}-sway`
      /* the flag came across in `userData`; the patch it stands for did not */
      delete (material as Material & { userData: { atmos?: boolean } }).userData.atmos
      breathe(material)
      swayPatch(material)
    }
    mesh.material = material
    if (swayBake(mesh.geometry)) geos++
    /* on its own layer as well as layer 0, so `renderND` can draw the vegetation a second time with
       the swaying prepass without drawing anything else — the crowd's arrangement exactly */
    o.layers.enable(SWAY_LAYER)
    meshes.push(o)
    plants += mesh.isInstancedMesh ? mesh.count : 1

    /* THE WORLD HEIGHTS, FOR THE BOOT LINE, and they earn their keep: this is the number the shader
       reconstructs, so if the world file ever stops being quantized the line says so out loud
       instead of the wind quietly going flat. */
    mesh.updateWorldMatrix(true, false)
    const bb = mesh.geometry.boundingBox
    const gh = bb ? bb.max.y - bb.min.y : 0
    const e = mesh.matrixWorld.elements
    const meshScale = Math.hypot(e[4], e[5], e[6])
    if (mesh.isInstancedMesh) {
      const a = mesh.instanceMatrix.array
      for (let i = 0; i < mesh.count; i++) {
        const h = gh * meshScale * Math.hypot(a[i * 16 + 4], a[i * 16 + 5], a[i * 16 + 6])
        if (h < lo) lo = h
        if (h > hi) hi = h
      }
    } else {
      const h = gh * meshScale
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
  })

  return {
    plants, meshes, geos, material,
    heights: [Math.round(lo === Infinity ? 0 : lo), Math.round(hi)],
  }
}

/** advance the wind's clock; `dt` in seconds */
export function swayTick(dt: number): void {
  SWAY.t.value += dt
}
