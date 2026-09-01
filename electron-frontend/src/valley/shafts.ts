import {
  AdditiveBlending, Color, MeshBasicMaterial, Mesh, NoColorSpace, OrthographicCamera,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget,
  WebGLRenderer, type Object3D,
} from 'three'

/* ==================================================================================================
   THE SUN'S GLOW — SHAFTS, AUREOLE AND BLEED, ALL OF THEM IN SCREEN SPACE.

   AND THAT IS THE WHOLE FIX. For weeks in the mockup the light around the sun was a term inside the
   sun's own quad — `pow(1 - r, 2.4)` measured from the middle of a 26,000-unit plane — and Robbie
   kept reporting it looked "cut off, like clipping geometry". It was, but not by any geometry you
   could see: a falloff that reaches exactly zero at the quad's inscribed circle ENDS on a circle,
   and turning it down, growing the quad and subdividing the dome all move that circle instead of
   removing it. `exp(-kr)` in screen space has no support boundary at all. There is nothing left for
   it to end on.

   THREE PARTS, ONE ADDITIVE OVERLAY:
     - the SHAFTS, a radial march away from the sun through a mask of what is open sky
     - the AUREOLE, wide and warm, carrying almost no light and most of the colour
     - the BLEED, tight and near-white, which is what says "this is too bright to look at"

   IT GOES ON OVER THE FINISHED FRAME, which is the reason the main render still goes straight to
   the canvas. Routing the scene through a render target to composite it would put the whole colour
   path — ACES, sRGB encode — through a round trip for the sake of an overlay that is exact by
   construction as an addition. The mockup deleted a four-pass HDR pipeline for exactly this
   reason: with every amount set to zero its null case did not match, and an additive overlay needs
   no such thing.
   ================================================================================================== */

/* THE ATMOSPHERE IS NOT GEOMETRY, and the mask has to be told so. The shafts march a picture of
   what is OPEN SKY; the dome and the sun disc are meshes like anything else, so left on the
   default layer they would fill the mask solid and there would be no sky anywhere to shaft
   through. They live on their own layer, which the mask pass turns off and the main render leaves
   on. It also takes them out of the shadow map for free — three tests an object's layers against
   the LIGHT's, and the lights are on layer 0. */
export const ATMOS_LAYER = 2

export const GLOW = {
  /* the shafts. 1.9 LOOKS LIKE A LOT WRITTEN DOWN, and it is not: the march averages twenty-eight
     samples of a mask that is mostly zero — a pixel on the ridge line sees open sky in maybe a
     third of them — so what reaches the frame is a small fraction of this. Swept against the
     treeline the sun stands behind: 0.55 is a haze you have to be told about, 2.6 floods the whole
     ridge into one gold wash, and the shafts are separately visible between individual trees from
     about 1.5 up. */
  rayAmt: 1.9,
  rayDensity: 0.88,
  rayDecay: 0.972,
  raySharp: 4.0,
  rayCol: 0xffb066,
  /* the aureole: wide, warm, almost no light in it — all the colour is here */
  haloAmt: 0.11,
  haloSharp: 10.0,
  haloCol: 0xff9040,
  /* and the bleed, which is what says "this is too bright to look at" */
  coreAmt: 0.16,
  coreSharp: 44.0,
  coreCol: 0xfff0dc,
}

const QUAD_VS = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`

const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
const quadScene = new Scene()
const quadMesh = new Mesh(new PlaneGeometry(2, 2), undefined)
quadMesh.frustumCulled = false
quadScene.add(quadMesh)

const target = (): WebGLRenderTarget => {
  const rt = new WebGLRenderTarget(1, 1, { depthBuffer: false })
  /* NO COLOUR CONVERSION ANYWHERE IN HERE. These hold a mask and a marched accumulation, not a
     picture — encoding them to sRGB on the way in and decoding on the way out would bend the
     numbers the march is doing arithmetic on. */
  rt.texture.colorSpace = NoColorSpace
  rt.texture.generateMipmaps = false
  return rt
}

/* the mask carries depth, because it is a real render of the world */
const rtMask = new WebGLRenderTarget(1, 1, { depthBuffer: true })
rtMask.texture.colorSpace = NoColorSpace
rtMask.texture.generateMipmaps = false
const rtRayA = target()
const rtRayB = target()

/* EVERYTHING BLACK ON A WHITE FIELD, at half resolution, which is the whole mask. The mockup got
   this for free out of a full-resolution normals-and-depth prepass it was already running for the
   ink outlines; this port has no outlines, so it renders the cheapest possible thing that answers
   the one question the march asks — is there anything here, or is it sky. */
const matMask = new MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false })

const sunUv = { value: new Vector2(0.5, 0.5) }
const sunVis = { value: 0 }
const aspect = { value: 1 }

const matRayMarch = new ShaderMaterial({
  uniforms: {
    tMask: { value: rtMask.texture }, sunUv, aspect,
    density: { value: GLOW.rayDensity }, decay: { value: GLOW.rayDecay },
    sharp: { value: GLOW.raySharp },
  },
  vertexShader: QUAD_VS,
  fragmentShader: `
    uniform sampler2D tMask; uniform vec2 sunUv;
    uniform float density, decay, sharp, aspect;
    varying vec2 vUv;
    void main() {
      const int STEPS = 28;
      vec2 delta = ( vUv - sunUv ) * ( density / float( STEPS ) );
      vec2 uv = vUv;
      /* JITTERED, or twenty-eight steps band the sky into twenty-eight visible arcs */
      float j = fract( sin( dot( vUv, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      uv -= delta * j;
      float acc = 0.0, illum = 1.0;
      for ( int i = 0; i < STEPS; i++ ) {
        uv -= delta;
        /* white is sky and black is anything at all -- see matMask */
        float open = texture2D( tMask, uv ).r;
        float r = length( ( uv - sunUv ) * vec2( aspect, 1.0 ) );
        acc += open * exp( - r * sharp ) * illum;
        illum *= decay;
      }
      gl_FragColor = vec4( vec3( acc / float( STEPS ) ), 1.0 );
    }`,
})

/* a separable gaussian, nine taps, run once each way. The shafts are marched at half resolution in
   twenty-eight steps and this is what takes the steps back out of them. */
const matBlur = new ShaderMaterial({
  uniforms: { tSrc: { value: null }, dir: { value: new Vector2(1, 0) }, texel: { value: new Vector2() } },
  vertexShader: QUAD_VS,
  fragmentShader: `
    uniform sampler2D tSrc; uniform vec2 dir, texel; varying vec2 vUv;
    void main() {
      float w[5];
      w[0] = 0.2270; w[1] = 0.1946; w[2] = 0.1216; w[3] = 0.0540; w[4] = 0.0162;
      vec3 sum = texture2D( tSrc, vUv ).rgb * w[0];
      for ( int i = 1; i < 5; i++ ) {
        vec2 o = dir * texel * float( i ) * 1.6;
        sum += texture2D( tSrc, vUv + o ).rgb * w[i];
        sum += texture2D( tSrc, vUv - o ).rgb * w[i];
      }
      gl_FragColor = vec4( sum, 1.0 );
    }`,
})

const matGlow = new ShaderMaterial({
  uniforms: {
    tRay: { value: rtRayB.texture }, sunUv, aspect, sunVis,
    rayAmt: { value: GLOW.rayAmt }, rayCol: { value: new Color(GLOW.rayCol) },
    haloAmt: { value: GLOW.haloAmt }, haloSharp: { value: GLOW.haloSharp },
    haloCol: { value: new Color(GLOW.haloCol) },
    coreAmt: { value: GLOW.coreAmt }, coreSharp: { value: GLOW.coreSharp },
    coreCol: { value: new Color(GLOW.coreCol) },
  },
  vertexShader: QUAD_VS,
  fragmentShader: `
    uniform sampler2D tRay; uniform vec2 sunUv;
    uniform vec3 rayCol, haloCol, coreCol;
    uniform float aspect, rayAmt, haloAmt, haloSharp, coreAmt, coreSharp, sunVis;
    varying vec2 vUv;
    void main() {
      float r = length( ( vUv - sunUv ) * vec2( aspect, 1.0 ) );
      /* exponentials, both of them, and that is the point of this file */
      float halo = exp( - r * haloSharp );
      float core = exp( - r * coreSharp );
      vec3 c = rayCol * texture2D( tRay, vUv ).r * rayAmt
             + haloCol * halo * haloAmt
             + coreCol * core * coreAmt;
      gl_FragColor = vec4( c * sunVis, 1.0 );
    }`,
  transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
})

const _sunProj = new Vector3()

/* WHERE THE SUN IS ON SCREEN, which is the one thing every pass here needs and the one thing that
   cannot be a constant. Behind the camera projects to a MIRRORED point in front of it, which would
   strike shafts from a sun that is not there — so that case is zero, and the edges fade rather than
   cut, because turning away from the sun should not be a pop. */
export function updateSunUv(disc: Object3D, camera: PerspectiveCamera): number {
  /* the pose was written this frame and three does not refresh these until it renders, so the
     projection has to be given a current camera or it answers about the previous frame */
  camera.updateMatrixWorld(true)
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  _sunProj.copy(disc.position).project(camera)
  sunUv.value.set(_sunProj.x * 0.5 + 0.5, _sunProj.y * 0.5 + 0.5)
  const behind = _sunProj.z > 1
  const u = sunUv.value
  const edge = Math.max(Math.abs(u.x - 0.5), Math.abs(u.y - 0.5))
  sunVis.value = behind ? 0 : Math.max(0, 1 - Math.max(0, edge - 0.5) / 0.35)
  return sunVis.value
}

function blit(renderer: WebGLRenderer, mat: ShaderMaterial, to: WebGLRenderTarget | null): void {
  quadMesh.material = mat
  renderer.setRenderTarget(to)
  renderer.render(quadScene, quadCam)
  renderer.setRenderTarget(null)
}

const _white = new Color(0xffffff)
const _clear = new Color()

export function sizeShafts(width: number, height: number, dpr: number): void {
  const w = Math.max(1, Math.floor(width * dpr) >> 1)
  const h = Math.max(1, Math.floor(height * dpr) >> 1)
  rtMask.setSize(w, h)
  rtRayA.setSize(w, h)
  rtRayB.setSize(w, h)
  aspect.value = width / Math.max(1, height)
}

export interface ShaftsOptions {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  disc: Object3D
}

/* THE MASK PASS, WHICH MUST HAPPEN BEFORE THE MAIN RENDER AND AFTER NOTHING ELSE.

   It is a whole scene pass, so it is also a place a pending shadow build could land — which is
   precisely the mockup's bug, where the one shadow map in the world was drawn during the lake
   reflection and came out clipped at the waterline. `shadowDirty` is lowered immediately before the
   MAIN render and nowhere else, so there is never a pending build while this runs. */
export function renderSkyMask({ renderer, scene, camera }: ShaftsOptions): void {
  /* AND IT IS SKIPPED ENTIRELY WITH THE SUN OFF SCREEN, which is most of this menu: four of the
     five destinations face away from it, and a mask marched toward a sun nobody can see is a whole
     scene pass drawn for a glow that is multiplied by zero. Measured at 1,280 x 822 with vsync
     off: 2.10 ms a frame with the shafts against 1.06 without, so this is half the cost of the
     valley given back at every destination but one. */
  if (sunVis.value <= 0) return
  const bg = scene.background
  const over = scene.overrideMaterial
  scene.background = null
  scene.overrideMaterial = matMask
  camera.layers.disable(ATMOS_LAYER)
  renderer.getClearColor(_clear)
  const clearAlpha = renderer.getClearAlpha()
  renderer.setClearColor(_white, 1)
  renderer.setRenderTarget(rtMask)
  renderer.clear()
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  renderer.setClearColor(_clear, clearAlpha)
  camera.layers.enable(ATMOS_LAYER)
  scene.overrideMaterial = over
  scene.background = bg
}


/** the march, the two blurs and the additive overlay — after the main render, over the finished frame */
export function renderGlow({ renderer }: ShaftsOptions): void {
  /* `updateSunUv` already ran this frame, before the mask pass -- see the note there */
  if (sunVis.value <= 0) return
  matRayMarch.uniforms.tMask.value = rtMask.texture
  blit(renderer, matRayMarch, rtRayB)
  matBlur.uniforms.texel.value.set(1 / rtRayA.width, 1 / rtRayA.height)
  matBlur.uniforms.tSrc.value = rtRayB.texture
  matBlur.uniforms.dir.value.set(1, 0)
  blit(renderer, matBlur, rtRayA)
  matBlur.uniforms.tSrc.value = rtRayA.texture
  matBlur.uniforms.dir.value.set(0, 1)
  blit(renderer, matBlur, rtRayB)
  matGlow.uniforms.tRay.value = rtRayB.texture

  const prevAuto = renderer.autoClear
  renderer.autoClear = false
  blit(renderer, matGlow, null)
  renderer.autoClear = prevAuto
}

export function disposeShafts(): void {
  rtMask.dispose(); rtRayA.dispose(); rtRayB.dispose()
  matMask.dispose(); matRayMarch.dispose(); matBlur.dispose(); matGlow.dispose()
}
