import {
  Color, DoubleSide, ShaderMaterial,
  type Mesh, type Object3D,
} from 'three'
import { ATMOS_U } from './atmosphere'
import { LAKE_U } from './lake'
import { SKY_U } from './lighting'

/* ==================================================================================================
   THE POND AND THE BATHS, as opposed to the lake.

   THE WORLD FILE CARRIES TWO PIECES OF WATER AND THIS PORT DREW BOTH OF THEM AS PAINTED CARDBOARD.
   `Garden_Surfaces_GardenWater_001` and `Onsen_Surfaces_OnsenPools_001` arrive as ordinary meshes,
   `celWorld` turned them into ordinary toon materials, and that is what has been on screen: a flat
   matte sheet where the garden's pond should be. Measured in the menu frame at the home eye, the
   pond alone is 670 x 244 pixels at 4,329 units -- one of the largest single surfaces in the shot,
   and the only still, dead one in a valley where the lake ripples and the steam climbs.

   TWO PIECES OF WATER, TWO DIFFERENT ANSWERS, and the difference is scale rather than taste:

   THE GARDEN POND TAKES THE LAKE'S OWN MATERIAL. I argued this could not be done, on the grounds
   that a planar reflection belongs to one plane. True, and irrelevant: the reflection is applied by
   PROJECTIVE texturing from the mirrored camera, so it is correct for any point ON that plane and
   degrades with height above it -- and the pond's surface sits about a hundred units above the
   lake's, which at this viewing distance is nothing. Sharing the material outright means it cannot
   drift from the lake's look, which is the actual thing being asked for.

   THE BATHS GET THEIR OWN SHADER, because they are twenty metres across. The lake's wavelength is
   measured in thousands of units; laid over a bath it is a single flat sheet with one highlight on
   it. This is the same water at garden scale, with the sky done analytically rather than sampled --
   what a small pool actually shows is nearly all sky, and this sky is a vertical gradient, so the
   reflected ray's elevation is enough to look it up for the cost of a mix.
   ================================================================================================== */

/** the garden's pond, which is the big one in the frame */
const GARDEN_RE = /GardenWater/i
/** and the onsen's baths, which are the small ones */
const POOL_RE = /OnsenPools/i

export const POND_U = {
  uTime: { value: 0 },
  uDeep: { value: new Color(0x4d6f70) },
  uShallow: { value: new Color(0x9fc3bd) },
  /* the sky as two stops of a vertical gradient, warm at the horizon and cool overhead */
  uSkyLo: { value: new Color(0xffe0c0) },
  uSkyHi: { value: new Color(0xa7b0c4) },
  uGlint: { value: 0.5 },
  uChop: { value: 0.45 },
  /* THE SUN AS THE SKY SEES IT, SHARED RATHER THAN COPIED -- the same Vector3 `updateSkyDir` writes
     every frame, so the glint on the bath and the burn in the sky can never point different ways. */
  uSun: SKY_U.uSunDir,
  fogColor: LAKE_U.fogColor,
  fogDensity: LAKE_U.fogDensity,
  uMistColor: ATMOS_U.uMistColor,
  uMistY: ATMOS_U.uMistY,
  uMistH: ATMOS_U.uMistH,
  uMistAmt: ATMOS_U.uMistAmt,
}

const VERT = `
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`

const FRAG = `
  uniform float uTime, uGlint, uChop, fogDensity, uMistY, uMistH, uMistAmt;
  uniform vec3 uDeep, uShallow, uSkyLo, uSkyHi, uSun, fogColor, uMistColor;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    /* A POND IS SMALL, SO THE RIPPLE HAS TO BE SMALL TOO. Three crossed waves at garden scale and
       no noise: still water in a designed garden is deliberate, not choppy. */
    float w = sin( vWorld.x * 0.026 + uTime * 1.10 ) * cos( vWorld.z * 0.021 - uTime * 0.83 )
            + sin( ( vWorld.x + vWorld.z ) * 0.041 - uTime * 1.5 ) * 0.5;
    w *= uChop;
    /* the surface normal the ripple implies, by differencing the same wave field.
       ENOUGH TILT TO BREAK THE HIGHLIGHT, NOT ENOUGH TO CHOP THE POND UP: at 0.26 the Fresnel
       swung the full width of its range every half wavelength and the water came out as a blue and
       white checkerboard. A garden pond is still water. */
    vec3 n = normalize( vec3( w * 0.085, 1.0, w * 0.07 ) );
    vec3 v = normalize( cameraPosition - vWorld );
    float f = pow( 1.0 - clamp( dot( v, n ), 0.0, 1.0 ), 2.0 );

    /* THE SKY, ANALYTICALLY. There is one planar-reflection pass in this build and the lake owns
       it -- see the note at the top of this file for why the pond may borrow the result and the
       baths may not. */
    vec3 r = reflect( -v, n );
    vec3 sky = mix( uSkyLo, uSkyHi, clamp( r.y * 1.6, 0.0, 1.0 ) );

    vec3 body = mix( uDeep, uShallow, clamp( w * 0.30 + 0.5, 0.0, 1.0 ) );
    /* FLOORED, AND ALSO CAPPED. A bath is looked down into from a few metres, where real Fresnel
       returns a few percent and the water reads as a hole cut in the decking -- so there is a
       floor. The ceiling is the other half: without it the ripple crests go to pure sky and the
       surface turns to tinfoil. */
    vec3 col = mix( body, sky, clamp( f * 1.2, 0.30, 0.64 ) );

    /* the sun on the water, which says "this is wet" more than any of the rest of it */
    float spec = pow( max( dot( r, normalize( uSun ) ), 0.0 ), 150.0 );
    col += vec3( 1.0, 0.92, 0.78 ) * spec * uGlint * 1.1;

    /* the same air as everything else */
    vec3 mv = vWorld - cameraPosition;
    float mk = 1.0 / uMistH;
    float mbase = uMistAmt * exp( - max( cameraPosition.y - uMistY, 0.0 ) * mk );
    float mdy = mv.y * mk;
    float mint = abs( mdy ) < 1e-4 ? length( mv ) : length( mv ) * ( 1.0 - exp( - mdy ) ) / mdy;
    col = mix( col, uMistColor, clamp( 1.0 - exp( - max( mbase * mint, 0.0 ) ), 0.0, 1.0 ) );
    float fg = 1.0 - exp( - fogDensity * fogDensity * vDepth * vDepth );
    gl_FragColor = vec4( mix( col, fogColor, clamp( fg, 0.0, 1.0 ) ), 1.0 );
    /* THE TWO CHUNKS A HAND-WRITTEN SHADER HAS TO ASK FOR. THREE.Color converts a hex literal from
       sRGB to LINEAR the moment it is assigned, and three only appends tone mapping and the sRGB
       encode where the shader source includes these -- a built-in material has them, a
       ShaderMaterial has whatever you typed. Without them the pond writes linear values straight
       into an sRGB framebuffer, and no amount of picking lighter colours fixes it because the error
       is a curve and not an offset. */
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

export interface Ponds {
  /** the garden pond, sharing the lake's material and therefore its mirror */
  garden: Object3D[]
  /** the baths, on their own garden-scale shader */
  pools: Object3D[]
  /* WHAT THE MIRROR MUST NOT SEE. Anything wearing the lake's material samples `tReflect`, so
     drawing it INTO `tReflect` is a feedback loop -- three warns and the frame comes back with the
     pond full of last frame's pond. The reflection pass already hides the lake for this reason;
     these go on the same list. */
  hideFromMirror: Object3D[]
  material: ShaderMaterial | null
  tick: (seconds: number) => void
}

/**
 * Give the world's two pieces of standing water a surface.
 *
 * Runs after `celWorld` — it replaces what that put on them — and after `buildLake`, whose material
 * the garden pond borrows. Nothing here is instanced or animated on the CPU: one uniform moves.
 */
export function buildPonds(root: Object3D, lakeMaterial: ShaderMaterial | null): Ponds {
  const garden: Object3D[] = []
  const pools: Object3D[] = []
  let material: ShaderMaterial | null = null

  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const isGarden = GARDEN_RE.test(o.name)
    const isPool = POOL_RE.test(o.name)
    if (!isGarden && !isPool) return

    if (isGarden && lakeMaterial) {
      const m = lakeMaterial.clone()
      /* SHARED, NOT COPIED: `Material.clone()` runs `cloneUniforms`, which would hand this a dead
         copy of `texMatrix` that never updates again -- so the pond would carry the reflection as
         it stood on the frame this ran and never move. */
      m.uniforms = lakeMaterial.uniforms
      m.side = DoubleSide
      m.name = 'garden-water'
      mesh.material = m
      garden.push(o)
    } else {
      if (!material) {
        material = new ShaderMaterial({
          uniforms: POND_U,
          vertexShader: VERT,
          fragmentShader: FRAG,
          /* DOUBLE-SIDED, AND THAT IS THE ACTUAL BUG IN THE FIRST VERSION OF THIS. These meshes are
             wound with their normals pointing DOWN, so a FrontSide material is back-face culled
             from above and the water simply is not drawn: what you are then looking at is the pond
             BED, seen through where the surface should be. No shader fixes that. */
          side: DoubleSide,
        })
      }
      mesh.material = material
      pools.push(o)
    }
    /* not a caster, and not a receiver either -- a bath with the bathhouse's shadow map painted on
       it is a bath with a hole in it */
    mesh.castShadow = false
    mesh.receiveShadow = false
  })

  return {
    garden,
    pools,
    hideFromMirror: garden,
    material,
    tick: (seconds: number) => { POND_U.uTime.value += seconds },
  }
}
