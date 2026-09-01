import {
  Color, DataTexture, LinearFilter, Material, RGBAFormat, RepeatWrapping, Vector2, Vector3,
} from 'three'
import { hash01 } from './clouds'

/* ==================================================================================================
   ATMOSPHERE — three things that happen in the air rather than on a surface, sharing one patch.

   The valley has had exponential distance fog since phase 0, and distance fog is a flat statement:
   everything 20,000 units away is equally hazy whether it is a summit in clear air or a footpath on
   the valley floor. What it cannot do is the three things that make air read as air.

   1. MIST POOLS. Real haze is an exponential height field — thick along the floor, thin as you look
      up out of it — so looking the length of the valley is milky and looking at the peak is not.
      This is the analytic integral of that field along the view ray: no geometry, so there is no
      lid to see the underside of, and it costs a handful of instructions on shading that is already
      happening. The mockup tried flattened ellipsoids (a visible lid) and then 260 alpha-blended
      sprites (four times the cost of the rest of the frame) before arriving here.

   2. THE COVER DRIFTS. One directional light on smooth landform gives the same plain diagonal
      terminator forever, because there is only one occluder. Cloud cover is the second and the
      cheapest large-scale variation there is: one texture lookup, projected along the light onto
      y = 0 so the shadow stays put on a hillside instead of sliding up the slope as the ground
      rises. It multiplies DIRECT light only, so shaded ground falls to the cold fill rather than
      merely going grey.

   3. AND A LIT FORM HAS AN EDGE. Every cel-shaded reference has a thin band of light where a
      surface turns away from the eye, and this scene had none. Masked to the side the sun already
      reaches — an unmasked rim outlines the shadow side too and reads as fog.

   WHY ONE PATCH AND NOT THREE. `onBeforeCompile` is one hook per material, and the three all need
   the same world-space position varying that three does not otherwise provide. The mockup learned
   the other half of this the hard way: two `.replace` calls competing for the same chunk token is a
   coin toss you lose silently, and the symptom is a feature that looks switched off.
   ================================================================================================== */

/* THE COVER IS ~1,700 UNITS OF CLOUD. The tile holds about three blobs, so this scale sets the
   size of one. The mockup started at 1/5000 and got a single blob thousands of units across: what
   landed on the meadow was one enormous soft oval reading as a stain rather than as weather. */
export const CLOUD_SHADOW_SCALE = 1 / 3400
/* A THIRD OF THE FIRST ATTEMPT. At 0.72 a blob removed nearly three quarters of the direct light
   under it and pulled that patch of meadow down by 6 luminance across the whole field. Several
   drifting suggestions, not one stain. */
export const CLOUD_SHADOW_AMOUNT = 0.3
/** radians a second the cover creeps, matched to the sky's own clusters so the two agree */
export const CLOUD_SHADOW_DRIFT = 0.0016

/* MIST IS WATER IN THE AIR AND IT IS THE COLOUR OF WHAT LIGHTS IT, which at this hour is the same
   warm the fog and the key already carry. A neutral grey mist under a sunset reads as a rendering
   default. */
export const MIST_COLOUR = 0xf0d3bd
/* SCALE HEIGHT, AND IT IS NOT THE MOCKUP'S 380 -- THE TWO WORLDS ARE NOT THE SAME SIZE.
   The mockup stands its home camera at y = 60 and tuned this against a lens 426 units above the
   water. This port's home eye is at y = 2,000 and Fuji's summit measures 7,220, so the same picture
   is laid out roughly seven times larger in units. Carried over unchanged, 380 units of scale
   height put the camera six scale-heights up and the integral along a downward ray came out
   seventy times the path length: measured, it took the lake from a mean of (39,36,37) to
   (91,71,61) -- the water dissolved into cream and the shot lost its subject. Scaled with the
   world it behaves as intended. */
export const MIST_HEIGHT = 2600
/* AND THE AMOUNT WITH IT. With the eye 2,300 above the floor the base density is amt·exp(−0.885) =
   0.41·amt, and a look down the valley to the lake runs about 12,000 units at 1.6x the path length,
   which lands near 13% -- haze you can see through, which is what haze is. */
export const MIST_AMOUNT = 0.000018
/** the valley floor, which is what the field is measured from */
export const MIST_Y = -300

/* WHERE THE RIM TURNS ON AND HOW HARD, and these are the mockup's own numbers rather than mine.
   The first pass here guessed 0.35 and washed the whole far meadow warm -- ground seen from above
   at a distance is almost edge-on everywhere, so an over-strong rim fires across all of it and
   reads as haze rather than as an edge. */
export const RIM_THRESHOLD = 0.58
export const RIM_AMOUNT = 0.2
export const RIM_COLOUR = 0xffb87e

/* ==================================================================================================
   AND THE LANDFORM OPTS OUT OF BOTH, which is a fact about big smooth surfaces and not a taste.

   THE COVER CANNOT WORK ON A MOUNTAIN. The projection offsets a world position along the light and
   reads the noise, which assumes the shadow lands near y = 0; on a cone rising seven thousand units
   the blob smears up the flank as a stain belonging to no cloud in the sky.

   AND THE RIM DRAWS A SEAM. The ground runs almost edge-on along the whole junction where it rises
   to meet Fuji's flank, so the rim fires along that line and paints a lit band at one elevation --
   read from the front as the ground changing colour just as it reaches the mountain. The mockup
   measured it across that junction with the albedo held flat: +25.2 luminance above its
   surroundings with the rim on, +12.8 with it off. Half of it was the rim; the other half is the
   slope genuinely turning toward a low sun, which is not a defect.

   Landforms are large and read by their silhouette against the sky, so they lose nothing. */
export const LANDFORM = /fuji|landscape_terrain|_surfaces_|range/i
export const LANDFORM_COVER = 0.06

/* ==================================================================================================
   THE COVER TEXTURE. Value noise, tiled, one channel — the shader only reads `.r`. Built here
   rather than shipped because it is 128 squared of arithmetic and an asset is a thing that can go
   missing; `hash01` is the same deterministic hash the clouds are placed with, so the cover and the
   sky come out of one source of randomness.
   ================================================================================================== */
export const COVER_SIZE = 128

/** smooth value noise in [0,1] at (x, y), tiling over `COVER_SIZE` */
export function coverAt(x: number, y: number): number {
  let total = 0
  let amp = 1
  let freq = 1
  let norm = 0
  /* THREE OCTAVES, WHICH IS WHAT MAKES IT WEATHER RATHER THAN A CHECKERBOARD. One octave is a
     lattice you can see the grid of; three gives big blobs with ragged edges. */
  for (let o = 0; o < 3; o++) {
    const s = COVER_SIZE / (16 / freq)
    const gx = (x / COVER_SIZE) * s
    const gy = (y / COVER_SIZE) * s
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    /* smoothstep on the cell fraction; a linear blend leaves visible diamonds at the lattice */
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const wrap = (v: number) => ((v % s) + s) % s
    const c = (ix: number, iy: number) => hash01(wrap(ix) + wrap(iy) * s, o * 17 + 3)
    const a = c(x0, y0)
    const b = c(x0 + 1, y0)
    const d = c(x0, y0 + 1)
    const e = c(x0 + 1, y0 + 1)
    total += amp * ((a + (b - a) * ux) + ((d + (e - d) * ux) - (a + (b - a) * ux)) * uy)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return total / norm
}

export function makeCoverTexture(): DataTexture {
  const data = new Uint8Array(COVER_SIZE * COVER_SIZE * 4)
  for (let y = 0; y < COVER_SIZE; y++) {
    for (let x = 0; x < COVER_SIZE; x++) {
      /* CONTRAST, THEN A FLOOR. Raw value noise sits in a narrow band around 0.5 and reads as a
         uniform dimmer; stretched, most of the sky is open and a few blobs are genuinely dark. */
      const n = Math.min(1, Math.max(0, (coverAt(x, y) - 0.42) * 2.6 + 0.55))
      const v = Math.round(n * 255)
      const i = (y * COVER_SIZE + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, COVER_SIZE, COVER_SIZE, RGBAFormat)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

/* ==================================================================================================
   THE SHARED UNIFORMS. One object, handed to every patched material, so a single write moves the
   cover or the mist everywhere at once rather than walking the scene.
   ================================================================================================== */
export const ATMOS_U = {
  uCoverMap: { value: null as DataTexture | null },
  uCoverOff: { value: new Vector2() },
  /* HOW THE COVER IS PROJECTED. The lookup is taken at (xz − y·proj), which walks the sample point
     down the light direction onto y = 0 — so a hillside and the flat ground beside it read the same
     blob, instead of the shadow sliding up the slope as the ground rises. */
  uCoverProj: { value: new Vector2() },
  uCoverScale: { value: CLOUD_SHADOW_SCALE },
  uCoverAmt: { value: CLOUD_SHADOW_AMOUNT },
  uMistColor: { value: new Color(MIST_COLOUR) },
  uMistY: { value: MIST_Y },
  uMistH: { value: MIST_HEIGHT },
  uMistAmt: { value: MIST_AMOUNT },
  uRimColor: { value: new Color(RIM_COLOUR) },
  uRimT: { value: RIM_THRESHOLD },
  uRimAmt: { value: RIM_AMOUNT },
}

/** point the cover's projection down the sun, so its shadows fall where the light says they should */
export function aimCover(sunAt: Vector3): void {
  const d = sunAt.clone().normalize()
  /* the sun is above the horizon, so `y` is positive and this is the walk from a point at height y
     back to where the same ray meets the ground */
  const k = d.y > 0.05 ? 1 / d.y : 20
  ATMOS_U.uCoverProj.value.set(d.x * k, d.z * k)
}

/** creep the cover; called on the frame loop's own capped clock */
export function driftCover(dt: number): void {
  ATMOS_U.uCoverOff.value.x += CLOUD_SHADOW_DRIFT * dt
  ATMOS_U.uCoverOff.value.y += CLOUD_SHADOW_DRIFT * 0.4 * dt
}

const VERT_HEAD = `#include <common>
varying vec3 vAtmosPos;`

/* AFTER `project_vertex` SO `transformed` IS FINAL, and the instancing branch matters because the
   whole world is an InstancedMesh after `collapseToInstances` — without it every tree in a batch
   would sample the cover at the batch's origin. */
const VERT_BODY = `#include <project_vertex>
vec4 atmosWp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  atmosWp = instanceMatrix * atmosWp;
#endif
vAtmosPos = ( modelMatrix * atmosWp ).xyz;`

const FRAG_HEAD = `#include <common>
varying vec3 vAtmosPos;
uniform sampler2D uCoverMap;
uniform vec2 uCoverOff;
uniform vec2 uCoverProj;
uniform float uCoverScale;
uniform float uCoverAmt;
uniform vec3 uMistColor, uRimColor;
uniform float uMistY, uMistH, uMistAmt, uRimT, uRimAmt;`

const FRAG_LIGHTS = `#include <lights_fragment_end>
{
  vec2 cuv = ( vAtmosPos.xz - vAtmosPos.y * uCoverProj ) * uCoverScale + uCoverOff;
  float cs = texture2D( uCoverMap, cuv ).r;
  reflectedLight.directDiffuse *= mix( 1.0, cs, uCoverAmt );
}
if ( uRimAmt > 0.0 ) {
  float rim = 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
  rim = smoothstep( uRimT, uRimT + 0.18, rim );
  /* MASKED TO THE LIT SIDE. Rim added everywhere is a halo; rim added only where the sun already
     reaches is the edge of a lit form. The mask is the direct diffuse just accumulated, which costs
     nothing and needs no second light loop. */
  float lit = clamp( dot( reflectedLight.directDiffuse, vec3( 0.35, 0.5, 0.15 ) ) * 2.4, 0.0, 1.0 );
  reflectedLight.directDiffuse += rim * lit * uRimAmt * uRimColor;
}`

const FRAG_FOG = `#include <fog_fragment>
#ifdef USE_FOG
{
  vec3 mv = vAtmosPos - cameraPosition;
  float md = length( mv );
  float mk = 1.0 / uMistH;
  /* CLAMPED AT THE MIST PLANE so a camera below the reference cannot multiply the base density up
     and dissolve the world -- which is what happened to the mockup's water reflections. */
  float mbase = uMistAmt * exp( - max( cameraPosition.y - uMistY, 0.0 ) * mk );
  float mdy = mv.y * mk;
  /* the analytic integral of exp(-y/H) along the ray; the guard is the mdy -> 0 limit, where the
     ray is horizontal and the integral is just the distance */
  float mint = abs( mdy ) < 1e-4 ? md : md * ( 1.0 - exp( - mdy ) ) / mdy;
  float mf = 1.0 - exp( - max( mbase * mint, 0.0 ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uMistColor, clamp( mf, 0.0, 1.0 ) );
}
#endif`

/**
 * Give one material the air.
 *
 * Idempotent: a material reached twice keeps the first patch. `collapseToInstances` shares one
 * material across many meshes, so this is walked over the scene and lands on the same object
 * repeatedly by construction.
 */
export function breathe(mat: Material, landform = false): Material {
  const flagged = mat as Material & { userData: { atmos?: boolean } }
  if (flagged.userData.atmos) return mat
  flagged.userData.atmos = true

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMOS_U)
    /* PER-MATERIAL, AFTER THE SHARED BLOCK, so anything named here wins for this material alone --
       which is all the landform needs, and it needs it as its own uniform rather than a branch
       because the shared ones move every frame. */
    if (landform) {
      shader.uniforms.uCoverAmt = { value: LANDFORM_COVER }
      shader.uniforms.uRimAmt = { value: 0 }
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERT_HEAD)
      .replace('#include <project_vertex>', VERT_BODY)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_HEAD)
      .replace('#include <lights_fragment_end>', FRAG_LIGHTS)
      .replace('#include <fog_fragment>', FRAG_FOG)
  }
  /* a material that has already been compiled once needs telling, and the world's have been */
  mat.needsUpdate = true
  return mat
}
