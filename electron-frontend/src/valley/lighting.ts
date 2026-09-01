import {
  AdditiveBlending, Color, DirectionalLight, HemisphereLight, Mesh, PerspectiveCamera,
  PlaneGeometry, ShaderMaterial, Vector3, type Material, type Object3D, type Scene,
} from 'three'

/* ==================================================================================================
   THE SUNSET, IN FOUR LAYERS.

   Ported from the mockup's 2026-08-10 lighting overhaul. Three of its four layers are here — the
   rig, the graded sky and the sun disc — plus the screen-space halo the fourth is built around.
   What each one is and why it is that way is Robbie's work; the notes below are his reasoning kept
   with the numbers so neither can be changed without the other.

   THE RULE THE WHOLE THING TURNS ON: `pow(1-r, p)` ON A QUAD HAS A BOUNDARY, `exp(-kr)` DOES NOT.
   A soft glow drawn on a mesh ends where the mesh ends, and that edge reads as clipping geometry —
   which is what a "cut off" sun looked like for weeks in the mockup. Turning it down, growing the
   quad and subdividing the dome all move that circle instead of removing it. Anything wide and
   soft belongs in screen space, or in an angle to the sun, and never inside a quad.
   ================================================================================================== */

/* ---- 1. THE RIG ---- */

/* THE KEY IS THE SUN'S COLOUR, NOT A WARM WHITE. A warm white is a lamp with a gel on it. A sun
   this low has been through enough air that its light really is (1.00, 0.44, 0.19) — the blue end
   is most of what got scattered out on the way, which is also where the sky's colour went. A warm
   key against a cold fill is the whole of a sunset, but the gap has to be BIG or it reads as
   afternoon. The intensity rises with it, because a light that has lost two thirds of its blue has
   lost a quarter of its luminance. */
export const KEY_COLOUR = 0xffc189
export const KEY_INTENSITY = 6.4
/* THE COLD SIDE, AND AT SUNSET IT IS THE ONLY OTHER LIGHT IN THE SKY. Everything the key does not
   reach is lit by the dome above it, which at this hour is deep blue behind you and violet
   overhead. Casts nothing. */
export const FILL_COLOUR = 0x6f8bd6
export const FILL_INTENSITY = 1.35
/* AND THE AMBIENT DECIDES WHETHER A SHADOW READS AT ALL. A shadow is not darkness, it is the
   absence of the key, so its depth is set by how much light arrives from everywhere else. At 0.75
   every shadow in the valley filled to within a third of its lit neighbour and no amount of
   strengthening the key would separate them.

   0.44 IS A COMPROMISE MEASURED AT BOTH ENDS OF THE WORLD. The menu looks INTO the sun, so almost
   everything in that frame is lit and the ambient only sets how deep the shadows go — lower is
   better there, and 0.36 was best. Four of the five destinations face AWAY from it, and at a
   destination the whole shot is shadow side: the Zen court at 0.36 came out as figures you could
   not read standing on stone you could not see. Swept at 0.36 / 0.44 / 0.52 against the menu and
   the court together: 0.52 flattens the meadow, 0.36 loses the court, 0.44 holds both. */
export const HEMI_SKY = 0xb3b2e0
export const HEMI_GROUND = 0x54463a
export const HEMI_INTENSITY = 0.44

export const FOG_COLOUR = 0xdfa273
/* FOG WAS TUNED FOR A CAMERA 800 UNITS FROM ITS SUBJECT and this one stands 6,000 out looking
   24,000 at a mountain. Found by minimising rather than by eye: sweeping the density and measuring
   every landform group per pixel, the SPREAD between Fuji, the ranges and the terrain's low, mid
   and high ground has a minimum here. Below it the spread widens again, because the range meshes
   fall away faster than the terrain does. */
export const FOG_DENSITY = 0.000011

/* THE LIGHT STANDS 14,000 FROM ITS TARGET, WHEREVER THE SUN IS. A directional light has no
   position, only a direction — but its SHADOW camera very much has one, and it is tuned here with
   near 500 / far 26,000. Following the sun out to 44,000 would put the whole scene behind the
   shadow camera's far plane and silently delete every shadow in the world. So the disc says where
   the sun looks like it is and this says where the rig stands; only the direction is shared. */
const KEY_STANDOFF = 14000

/* SIZE THE BOX, THEN COUNT ITS TEXELS. There is no point covering a 70,000-unit valley: at 4096
   that is a 17-unit texel and nothing reads. This covers the near and middle ground the camera
   actually stands in, which is a 4.4-unit texel, and the far ranges go unshadowed — where nobody
   looks for contact anyway. The lookout at RECORDS is outside it, and that is the deal. */
const SHADOW_HALF = 9000
/** the point the shadow box is centred on, out along the valley from the standing point */
export const SHADOW_TARGET: readonly [number, number, number] = [-978, -300, -1942]

export interface Rig {
  key: DirectionalLight
  fill: DirectionalLight
  hemi: HemisphereLight
}

export function installRig(scene: Scene, sunAt: Vector3): Rig {
  const key = new DirectionalLight(KEY_COLOUR, KEY_INTENSITY)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  key.target.position.set(...SHADOW_TARGET)
  const sc = key.shadow.camera
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF
  sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF
  sc.near = 500; sc.far = 26000
  /* the blur must be smaller than what it shadows: at a 4.4-unit texel, radius 2 is about 9 units */
  key.shadow.radius = 2
  key.shadow.bias = -0.0005
  /* 4, DOWN FROM 12, AND IT IS WHY THE VALLEY HAD NO SHADOWS IN IT. normalBias walks the shadow
     lookup along the surface normal before sampling, so a surface does not shadow itself — and
     everything smaller than that walk loses its contact. Twelve units is most of a fence post and a
     good fraction of a tree trunk, so the small stuff cast nothing and the meadow read as evenly
     lit ground under a low sun, which is the one thing it cannot be. 4 is under a texel of the
     4.4-unit map and still clear of the acne it exists to prevent. */
  key.shadow.normalBias = 4
  scene.add(key, key.target)

  const fill = new DirectionalLight(FILL_COLOUR, FILL_INTENSITY)
  fill.position.set(-4225, 3400, 5898)
  scene.add(fill, fill.target)

  const hemi = new HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY)
  scene.add(hemi)

  aimKey(key, sunAt)
  return { key, fill, hemi }
}

/** point the key down the sun's own bearing, keeping its stand-off so the shadow camera stays valid */
export function aimKey(key: DirectionalLight, sunAt: Vector3): void {
  const t = key.target.position
  key.position.copy(t).addScaledVector(sunAt.clone().sub(t).normalize(), KEY_STANDOFF)
  key.updateMatrixWorld(true)
}

/* ---- 2. WHERE THE SUN GOES, WHICH IS A COMPOSITION AND NOT A COORDINATE ---- */

/* PUT THE SUN AT A CHOSEN PLACE IN THE FRAME rather than at a chosen place in the world, which is
   how anyone actually thinks about a sunset. Unprojects (u, v) through the standing camera and
   walks out `dist` — far enough to be behind Fuji rather than in it. */
export function placeSun(
  eye: readonly [number, number, number], target: Vector3, fov: number, aspect: number,
  u = 0.5, v = 0.3, dist = 50000,
): Vector3 {
  const c = new PerspectiveCamera(fov, aspect, 1, 200000)
  c.position.set(eye[0], eye[1], eye[2])
  c.lookAt(target)
  c.updateProjectionMatrix()
  c.updateMatrixWorld(true)
  const E = c.position.clone()
  const ray = new Vector3(u * 2 - 1, 1 - v * 2, 0.5).unproject(c).sub(E).normalize()
  return E.addScaledVector(ray, dist)
}

/* ---- 3. THE SKY, GRADED ---- */

/* THE SUNSET IS NOT PAINTED INTO THE TEXTURE AND IT CANNOT BE. The dome carries an authored image —
   a horizontal gradient with a warm band in it — and a horizontal band is the same all the way
   round the horizon. A sunset is not: it is a sky with a DIRECTION in it, warm and bright where the
   sun is and cold behind you, and no amount of repainting a band produces that, because the band
   does not know where the sun has been put.

   So the dome keeps the authored image as its base and takes a grade on top, per fragment, off the
   angle between the view ray and the sun:
     - the low sky turns toward orange and the high sky toward indigo, AT CONSTANT LUMINANCE, so
       the painting's own light and dark stay where the author put them and only the hue moves.
       Multiplying by orange instead takes the blue channel to nothing and gives brown.
     - two scattering lobes centred on the sun, a wide one carrying the colour and a tight one
       carrying the blaze, and an azimuthal burn along the horizon on the sun's side.
   Every one is a smooth function of DIRECTION over the whole sphere: `pow(max(cos,0),p)` decays,
   it never terminates. That is exactly what a glow bounded by a quad cannot do.

   THE SKY IS TONE MAPPED, DELIBERATELY. The blaze near the sun goes well past 1.0 on purpose; ACES
   rolls it off to white over about a stop, which is the soft shoulder a bright sky has and exactly
   what clipping does not give you. Clipped, it would end on a contour — the same failure again. */
export const SKY_U = {
  /* from the eye to the sun, refreshed every frame */
  uSunDir: { value: new Vector3(0, 0.2, -1) },
  uGrade: { value: 1.0 },
  uHorizon: { value: new Color(0xff6a1e) },
  uZenith: { value: new Color(0x4a3f86) },
  uHorizAmt: { value: 0.68 },
  uZenAmt: { value: 0.5 },
  /* the burn along the ridgeline, on the sun's side of the compass only */
  uBurn: { value: new Color(0xff7a30) },
  uBurnG: { value: 0.34 },
  /* 3.2: at 2.2 the burn reached most of the way round the compass and the sky BEHIND the camera
     was as warm as the sky the sun is in, which is a sunrise on every horizon at once */
  uBurnP: { value: 3.2 },
  /* the aureole, and the blaze */
  uWide: { value: new Color(0xff8a3c) },
  uWideP: { value: 4.5 },
  uWideG: { value: 0.32 },
  uTight: { value: new Color(0xffd7a4) },
  uTightP: { value: 110.0 },
  uTightG: { value: 0.4 },
}

/* the materials the grade was installed on, so their `version` can be bumped when a uniform that
   three does not know about has to reach the GPU */
const SKY_MATS: Material[] = []

export function gradeSky(mat: Material): Material {
  const tagged = mat as Material & { userData: { sky?: boolean } }
  if (tagged.userData.sky) return mat
  tagged.userData.sky = true
  SKY_MATS.push(mat)
  /* the blaze has to have somewhere to roll off to */
  mat.toneMapped = true
  /* AND THE DOME IS NOT FOGGED. The fog colour IS the sky's colour by design, so fogging the dome
     mixes the sky toward itself — which does nothing but flatten the grade that was just applied
     over the top of it. */
  ;(mat as Material & { fog?: boolean }).fog = false

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SKY_U)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkyDir;')
      /* after project_vertex so `transformed` is final. `cameraPosition` is declared for every
         vertex shader three builds, so the ray can be formed here rather than in the fragment. */
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSkyDir = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz - cameraPosition;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSkyDir;
        uniform vec3 uSunDir, uHorizon, uZenith, uBurn, uWide, uTight;
        uniform float uGrade, uHorizAmt, uZenAmt, uBurnG, uBurnP, uWideP, uWideG, uTightP, uTightG;
        /* the tint, carried to a given luminance -- a hue rotation rather than a multiply */
        vec3 skyTint( vec3 t, float l ) {
          return t * ( l / max( dot( t, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ) );
        }`)
      /* BEFORE the tone mapping and after the colour is assembled: opaque_fragment is where
         MeshBasicMaterial writes gl_FragColor, and tonemapping_fragment is the next chunk. */
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        {
          vec3 sdir = normalize( vSkyDir );
          float h_ = sdir.y;
          float cosT = dot( sdir, uSunDir );
          float horiz = 1.0 - smoothstep( -0.03, 0.40, h_ );
          float zen = smoothstep( 0.06, 0.62, h_ );
          vec3 c = gl_FragColor.rgb;
          float lum = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
          c = mix( c, skyTint( uHorizon, lum ), horiz * uGrade * uHorizAmt );
          c = mix( c, skyTint( uZenith, lum ), zen * uGrade * uZenAmt );
          /* nothing is added below the horizon: the dome runs all the way under the world and a
             glow down there is a lit floor seen through the terrain's own gaps */
          float above = smoothstep( -0.14, 0.05, h_ );
          vec2 fa = normalize( vec2( sdir.x, sdir.z ) + 1e-6 );
          vec2 fs = normalize( vec2( uSunDir.x, uSunDir.z ) + 1e-6 );
          float az = pow( max( dot( fa, fs ), 0.0 ), uBurnP );
          c += uBurn * az * horiz * uBurnG * uGrade;
          c += ( uWide * pow( max( cosT, 0.0 ), uWideP ) * uWideG
               + uTight * pow( max( cosT, 0.0 ), uTightP ) * uTightG ) * above * uGrade;
          gl_FragColor.rgb = c;
        }`)

    /* A String.replace on a chunk name that has moved is a silent no-op that looks exactly like a
       feature tuned to zero, so the patch says so rather than shipping an ungraded sky. */
    if (!shader.vertexShader.includes('vSkyDir = (')
      || !shader.fragmentShader.includes('skyTint( uHorizon')) {
      console.warn('[valley] the sky grade did not attach — a shader chunk name has moved')
    }
  }
  mat.needsUpdate = true
  return mat
}

/** the sun direction the grade reads is FROM THE EYE, so the lobes hold still while the camera flies */
export function updateSkyDir(sunAt: Vector3, eye: Vector3): void {
  SKY_U.uSunDir.value.copy(sunAt).sub(eye).normalize()
}

/* ---- 4. THE SUN ITSELF, DRAWN RATHER THAN PHOTOGRAPHED ---- */

export const SUN_SIZE = 12000

/* WHAT THE REFERENCES AGREE ON, for a low sun seen through a lot of air:
     - There is a DISC, with an edge. The single thing that says "sun" rather than "glow" is that
       the core TERMINATES; brightness alone never reads as a star.
     - The edge is soft by about one percent of the radius, not ten. That is refraction in the
       atmosphere, not blur in a lens.
     - Immediately outside it, a corona falling off very steeply — a few radii, no more.
     - Then a broad, faint aureole out to ten or twenty radii carrying most of the colour. THAT
       PART IS NOT HERE, and the reason is the rule at the top of this file: an aureole drawn on a
       quad ends where the quad ends. It lives in the sky's own scattering lobes and in the
       screen-space halo instead, both of which are unbounded.
     - Colour runs outward white to gold to orange, because the longer the path through air the
       more of the blue end has been scattered out of it.

   EVERY VALUE BELOW IS A FIGHT WITH ADDITIVE BLENDING. The disc is drawn on top of a sky that near
   the sun is already at three quarters of white, and adding to that saturates — so the edge of the
   disc can only be seen if the sum just OUTSIDE it stays below saturation. At a corona reach of 5
   it ran out to ten degrees and everything within it clipped to white together; at 2 it hugs the
   disc and the limb survives. */
export function makeSunDisc(): Mesh {
  const mat = new ShaderMaterial({
    uniforms: {
      uCore: { value: new Color(0xfff4e2) },
      uMid: { value: new Color(0xffb066) },
      uCoreR: { value: 0.155 },
      uLimb: { value: 0.0119 },
      uCoreG: { value: 3.6 },
      uCoronaG: { value: 0.42 },
      uCoronaR: { value: 2.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform vec3 uCore, uMid;
      uniform float uCoreR, uLimb, uCoreG, uCoronaG, uCoronaR;
      varying vec2 vUv;
      void main() {
        float r = length( vUv - 0.5 ) * 2.0;
        float disc = 1.0 - smoothstep( uCoreR - uLimb, uCoreR + uLimb, r );
        /* steep, a few radii, dead long before the quad's edge: at uCoronaR = 2 it is down to
           10^-3 by r = 0.35 against an edge at 1.0, so nothing here can end ON the quad */
        float corona = pow( max( 0.0, 1.0 - r / ( uCoreR * uCoronaR ) ), 2.6 );
        gl_FragColor = vec4( uCore * disc * uCoreG + uMid * corona * uCoronaG, 1.0 );
      }`,
    transparent: true, depthWrite: false, fog: false, blending: AdditiveBlending,
  })
  /* additive, unfogged, DEPTH-TESTED — so the mountain in front of it still occludes it */
  const m = new Mesh(new PlaneGeometry(1, 1), mat)
  m.scale.set(SUN_SIZE, SUN_SIZE, 1)
  m.frustumCulled = false
  m.name = 'sun-disc'
  return m
}

/** the disc always faces the camera, which for a body at 50,000 units is a rotation nobody sees */
/* AND THE DISC IS RE-STRUCK EVERY TIME THE SUN MOVES. A white noon disc hanging in a violet
   twilight is the giveaway that the sky is a painting and the sun is a decal on it. */
export function gradeDisc(
  disc: Object3D, core: Color, mid: Color, coreG: number, coronaG: number,
): void {
  const mat = (disc as Mesh).material as ShaderMaterial | undefined
  if (!mat?.uniforms) return
  ;(mat.uniforms.uCore.value as Color).copy(core)
  ;(mat.uniforms.uMid.value as Color).copy(mid)
  mat.uniforms.uCoreG.value = coreG
  mat.uniforms.uCoronaG.value = coronaG
}

export function faceSun(disc: Object3D, eye: Vector3): void {
  disc.lookAt(eye)
}
