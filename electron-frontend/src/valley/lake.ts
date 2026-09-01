import {
  Color, FogExp2, Matrix4, Mesh, PlaneGeometry, Scene, ShaderMaterial, Texture, Vector2,
} from 'three'
import { ATMOS_U } from './atmosphere'

/* ==================================================================================================
   THE LAKE — which is not in `world.glb` and never was.

   The world file carries a garden pond and the onsen baths and nothing else that is water. The lake
   is a plane built here, placed in the menu's own sight-line frame, and everything that makes it
   read as water is in one shader.

   AND IT IS A FLAT SQUARE, WITH NO SHORE MASK, which surprised me and is the mockup's own finding
   rather than a corner cut. The obvious build is depth-driven colour and foam where the water meets
   land — every stylised-water reference reaches for exactly that, and this port even has the
   heightfield to afford it without a second depth pass. The mockup built it and then took it out:
   the imported terrain HAS NO BASIN cut under the lake, so the bed varies 74 units end to end
   across a 7,020-unit span. A 256-texel map of an almost-flat field is mostly quantisation, which
   is where its hexagonal patterning came from, and the one genuinely deep patch took no foam and no
   tint at all. The input cannot support the effect, and no tuning of the thresholds does more than
   move the artefacts around. It comes back for free if a basin is ever modelled.

   POSTERISED, BECAUSE EVERYTHING ELSE IN THIS WORLD IS. The mix between the water's own colour and
   the reflection was a smooth gradient across the whole lake — the one continuously shaded surface
   in a cel-shaded scene, which is why it never sat with the rest of the picture no matter how the
   ripple was tuned. Four flat steps put it on the same footing as the toon ramp.

   AND ONE SLOW WAVE, NOT A SIMULATION. What the mockup had first was three wave fields and two
   scrolls of a normal map all offsetting the reflection lookup per pixel, and each was defensible
   alone. Together they were wrong twice: a dawn lake in this scene is GLASS, and a surface that
   busy cannot be still — and technically, jittering the lookup of a 468-pixel image of a forest by
   a different amount at every pixel is a recipe for salt-and-pepper. The speckle across the lake
   was not ripple detail, it was the far treeline being point-sampled at random offsets.
   ================================================================================================== */

/* THE MENU'S OWN SIGHT-LINE FRAME, which is what the lake is placed in rather than world axes. The
   valley was laid out along this bearing and every distance in it is "so far out, so far to the
   side" — so the lake sits 3,000 out and 400 to the side of the eye the composition was built for,
   not at a world coordinate somebody read off a viewport. */
export const AXIS = new Vector2(-0.3827, -0.9239)
export const SIDE = new Vector2(0.9239, -0.3827)
export const EYE_XZ = new Vector2(170, 830)
export const GROUND_Y = -300

/* SIZED SO BOTH SHORES ARE IN THE PICTURE. At radius 4,000 centred 3,600 out, the near edge sat
   behind the camera and the far edge 7,600 ahead — the frame was nothing but water and the coast
   planting was too deep in the mist to read as trees.

   THOSE ARE THE MOCKUP'S DISTANCES AND THEY ARE NOT THIS CAMERA'S. Its note says "300 units of bank
   in front of the eye and a far shore at 5,700", measured from the retired analytic eye at
   (170, 830) — the pose its CSS planes were composed against. This port stands at (0, 2000, 6000),
   so the same lake sits 8,118 away with its near shore at 5,418 and its far one at 10,818. The
   RADII are what was tuned and they carry over; the distances quoted alongside them do not, and a
   test that copied them out failed for exactly that reason. */
export const LAKE = { d: 3000, s: 400, r: 2700, level: -70 }
/** the water surface, in world space */
export const LAKE_Y = GROUND_Y + LAKE.level

/** where the lake's centre lands in world XZ */
export function lakeCentre(): { x: number; z: number } {
  return {
    x: EYE_XZ.x + AXIS.x * LAKE.d + SIDE.x * LAKE.s,
    z: EYE_XZ.y + AXIS.y * LAKE.d + SIDE.y * LAKE.s,
  }
}

export const LAKE_U = {
  tReflect: { value: null as Texture | null },
  texMatrix: { value: new Matrix4() },
  uTime: { value: 0 },
  uDeep: { value: new Color(0x2c3b4e) },
  uShallow: { value: new Color(0x5c7385) },
  /* HOW MUCH OF THE MOUNTAIN THE WATER IS ALLOWED TO KEEP. Real water at this depression angle
     reflects a few percent, and the honest Fresnel curve delivers Fuji as a grey smudge on navy.
     This is a picture of a lake, not a lake: the exponent is flattened so the falloff still runs
     the right way with angle, and the floor is lifted so the water never stops being a mirror. */
  uReflPow: { value: 1.6 },
  uReflMin: { value: 0.3 },
  uReflGain: { value: 1.15 },
  fogColor: { value: new Color(0xdfa273) },
  fogDensity: { value: 0.000011 },
  uMistColor: ATMOS_U.uMistColor,
  uMistY: ATMOS_U.uMistY,
  uMistH: ATMOS_U.uMistH,
  uMistAmt: ATMOS_U.uMistAmt,
}

const VERT = `
  uniform mat4 texMatrix;
  varying vec4 vProj;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    vWorld = wp.xyz;
    vProj = texMatrix * wp;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`

const FRAG = `
  uniform sampler2D tReflect;
  uniform float uTime;
  uniform vec3 uDeep, uShallow, fogColor, uMistColor;
  uniform float fogDensity, uMistY, uMistH, uMistAmt;
  uniform float uReflPow, uReflMin, uReflGain;
  varying vec4 vProj;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    /* one slow, long wave, offsetting the lookup by a quarter of what a wave field would */
    float w = sin( vWorld.x * 0.0016 + uTime * 0.22 ) * cos( vWorld.z * 0.0013 - uTime * 0.17 );
    vec2 uv = vProj.xy / vProj.w + vec2( w * 0.0006, w * 0.00022 );
    vec3 refl = texture2D( tReflect, uv ).rgb;
    /* grazing angles reflect almost everything, steep ones show the water's own colour -- and the
       camera IS at a grazing angle here, which is why the reflection carries */
    vec3 v = normalize( cameraPosition - vWorld );
    float f = pow( 1.0 - clamp( v.y, 0.0, 1.0 ), uReflPow );
    vec3 body = mix( uDeep, uShallow, clamp( w * 0.12 + 0.5, 0.0, 1.0 ) );
    float k = clamp( f * uReflGain, uReflMin, 0.95 );
    /* four flat steps, so the lake reads as regions of colour the way a painted one does */
    k = floor( k * 4.0 + 0.5 ) / 4.0;
    vec3 col = mix( body, refl, k );
    /* AND A FEW DRAWN HIGHLIGHTS. Two long slow crests picked out as flat pale streaks -- the
       cartoon shorthand for a calm surface. Thresholded, not faded, so they are shapes. */
    float g1 = sin( vWorld.z * 0.0021 - uTime * 0.16 ) * cos( vWorld.x * 0.0009 + uTime * 0.11 );
    float g2 = sin( ( vWorld.x * 0.6 + vWorld.z ) * 0.0037 + uTime * 0.23 );
    float glint = smoothstep( 0.86, 0.93, g1 ) * 0.7 + smoothstep( 0.90, 0.97, g2 ) * 0.45;
    col = mix( col, uShallow * 1.45 + vec3( 0.06 ), clamp( glint, 0.0, 1.0 ) * 0.5 );
    /* the same valley mist every other surface takes, so the far shore sits in it too instead of
       staying sharp while the land around it softens */
    vec3 mv2 = vWorld - cameraPosition;
    float mk = 1.0 / uMistH;
    float mbase = uMistAmt * exp( - max( cameraPosition.y - uMistY, 0.0 ) * mk );
    float mdy = mv2.y * mk;
    float mint = abs( mdy ) < 1e-4 ? length( mv2 ) : length( mv2 ) * ( 1.0 - exp( - mdy ) ) / mdy;
    col = mix( col, uMistColor, clamp( 1.0 - exp( - max( mbase * mint, 0.0 ) ), 0.0, 1.0 ) );
    float fg = 1.0 - exp( - fogDensity * fogDensity * vDepth * vDepth );
    gl_FragColor = vec4( mix( col, fogColor, clamp( fg, 0.0, 1.0 ) ), 1.0 );
  }`

export interface Lake {
  mesh: Mesh
  material: ShaderMaterial
  /** advance the wave and the glints */
  tick: (seconds: number) => void
  dispose: () => void
}

export function buildLake(scene: Scene): Lake {
  const geo = new PlaneGeometry(LAKE.r * 2.6, LAKE.r * 2.6, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const material = new ShaderMaterial({
    uniforms: LAKE_U,
    vertexShader: VERT,
    fragmentShader: FRAG,
  })
  const mesh = new Mesh(geo, material)
  const c = lakeCentre()
  mesh.position.set(c.x, LAKE_Y, c.z)
  /* AFTER THE WORLD, so the water is composited over ground it might be co-planar with rather than
     fighting it for the depth buffer at the shoreline. */
  mesh.renderOrder = 1
  mesh.name = 'lake'
  /* it is not a caster and it must not receive the world's one shadow build either -- a lake with
     a mountain's shadow map painted on it is a lake with a hole in it */
  mesh.castShadow = false
  mesh.receiveShadow = false
  scene.add(mesh)

  /* the fog it fades into is the scene's own, read once rather than mirrored by hand */
  const fog = scene.fog as FogExp2 | null
  if (fog) { LAKE_U.fogColor.value = fog.color; LAKE_U.fogDensity.value = fog.density }

  return {
    mesh,
    material,
    tick: (seconds: number) => { LAKE_U.uTime.value += seconds },
    dispose: () => {
      scene.remove(mesh)
      geo.dispose()
      material.dispose()
    },
  }
}
