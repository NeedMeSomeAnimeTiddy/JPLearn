import {
  AdditiveBlending, Color, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget,
  WebGLRenderer, type Object3D,
} from 'three'

/* ==================================================================================================
   THE LANTERNS BLEED.

   EMISSIVE IS NOT A LIGHT SOURCE, IT IS A BRIGHT SURFACE. A lantern's paper at emissive 1.35 comes
   out of the tone mapper as a near-white polygon with a hard silhouette, and nothing about that says
   "this is too bright to look at" -- it looks like a bright texture, which is exactly what it is.
   What makes a source read as a source is the bleed AROUND it, and in a renderer that means bloom.

   RESTRICTED TO THE LAMPS, ON PURPOSE. A general bloom needs the finished frame in a render target,
   which is a whole composite pipeline. This needs no such thing: the things that glow are already
   known -- `buildLanterns` has just walked the world and found every one of them -- so they go on a
   layer of their own and a pass that renders only that layer draws precisely the flames.

   AND IT IS OCCLUDED, which is the part a naive version gets wrong. The pass first draws the WHOLE
   scene in black to lay down depth, then the flames on top with an ordinary depth test -- so a
   lantern behind a building does not bloom through it. That black pass is a quarter-resolution
   render with a trivial shader, cheaper than the ink prepass already running at full resolution.
   ================================================================================================== */

/* NOT 1: that is the crowd's, used by the ink prepass to draw the figures a second time with their
   idle displacement. 2 is the sky and the sun disc. Three layers, three jobs, and a collision here
   would put the crowd through the bloom or the flames through the outline pass. */
export const BLOOM_LAYER = 3

export const BLOOM = {
  amt: { value: 1.15 },
  /* the lamp's own colour, warmed. Everything on this layer is a flame, so one tint is right --
     and it is why the MOON is deliberately not bloomed: it would come out amber. */
  col: { value: new Color(0xffc98a) },
}

const rtA = new WebGLRenderTarget(1, 1, { depthBuffer: true })
const rtB = new WebGLRenderTarget(1, 1, { depthBuffer: false })
for (const r of [rtA, rtB]) {
  r.texture.minFilter = LinearFilter
  r.texture.magFilter = LinearFilter
  r.texture.generateMipmaps = false
}

const QUAD_VS = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`

/* ITS OWN BLUR, NOT THE SHAFTS'. `shafts.ts` has an identical separable gaussian and sharing it
   would be tempting -- but its `texel` uniform is set for a HALF-resolution target and this one runs
   at a QUARTER, so whichever pass ran second would blur at the other's scale. The mockup carries a
   note about exactly that trap. Twenty lines is cheaper than the bug. */
const matBlur = new ShaderMaterial({
  uniforms: {
    tSrc: { value: null as unknown },
    dir: { value: new Vector2(1, 0) },
    texel: { value: new Vector2() },
  },
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

const matBlack = new MeshBasicMaterial({ color: 0x000000 })

const matBloom = new ShaderMaterial({
  uniforms: { tSrc: { value: rtB.texture }, amt: BLOOM.amt, col: BLOOM.col },
  vertexShader: QUAD_VS,
  fragmentShader: `
    uniform sampler2D tSrc; uniform vec3 col; uniform float amt; varying vec2 vUv;
    void main() {
      vec3 c = texture2D( tSrc, vUv ).rgb;
      /* the blurred flames are already the right shape; the colour is the lamp's, warmed */
      gl_FragColor = vec4( c * col * amt, 1.0 );
    }`,
  transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending,
})

const quadScene = new Scene()
const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
const quadMesh = new Mesh(new PlaneGeometry(2, 2), matBlur)
quadMesh.frustumCulled = false
quadScene.add(quadMesh)

function blit(renderer: WebGLRenderer, mat: ShaderMaterial, to: WebGLRenderTarget | null): void {
  quadMesh.material = mat
  renderer.setRenderTarget(to)
  renderer.render(quadScene, quadCam)
  renderer.setRenderTarget(null)
}

/** how lit the valley is; 0 by day, when there is nothing to bleed and the pass is skipped whole */
let night = 0
export function setBloomNight(on: number): void { night = on }

/** put the lamps on the bloom layer — the same meshes `buildLanterns` just lit */
export function bloomTrack(lit: readonly Object3D[]): void {
  for (const o of lit) o.layers.enable(BLOOM_LAYER)
}

export function renderBloom(
  renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera,
): void {
  if (night <= 0.01 || BLOOM.amt.value <= 0) return

  const prevAuto = renderer.autoClear
  const prevLayers = camera.layers.mask

  /* THE BACKGROUND COMES OFF FIRST, and forgetting it is a wash over the entire frame. An
     override material replaces what every MESH is drawn with -- it does not touch `scene.background`,
     which three paints into whatever target it is given. So the "black" pass came out filled with
     the fog colour, the blur spread it, and the additive composite laid a uniform veil of it over
     the whole picture. Measured the moment it went in: the per-pixel difference against the mockup
     went from +13.0 to +22.3, brightest in the sky, which is simply where the most background is. */
  const bg = scene.background
  scene.background = null

  /* the whole scene in black, for depth only, so a lantern behind a building cannot bleed
     through it */
  scene.overrideMaterial = matBlack
  renderer.setRenderTarget(rtA)
  renderer.setClearColor(0x000000, 1)
  renderer.clear()
  renderer.render(scene, camera)
  scene.overrideMaterial = null

  /* then the flames, at the depth the black pass just wrote, so LEQUAL lets them through */
  camera.layers.set(BLOOM_LAYER)
  renderer.autoClear = false
  renderer.render(scene, camera)
  renderer.autoClear = prevAuto
  /* SAVED AND RESTORED, NOT `set(0)`. This camera runs two layers of its own -- the world and the
     atmosphere -- and resetting it to zero silently stops the sky being drawn. That cost an hour
     once already; see the note in `ink.ts`. */
  camera.layers.mask = prevLayers
  renderer.setRenderTarget(null)
  scene.background = bg

  matBlur.uniforms.texel.value.set(1 / rtA.width, 1 / rtA.height)
  matBlur.uniforms.tSrc.value = rtA.texture
  matBlur.uniforms.dir.value.set(1, 0)
  blit(renderer, matBlur, rtB)
  matBlur.uniforms.tSrc.value = rtB.texture
  matBlur.uniforms.dir.value.set(0, 1)
  blit(renderer, matBlur, rtA)

  matBloom.uniforms.tSrc.value = rtA.texture
  /* over the finished frame, so it composites onto what has already been drawn */
  renderer.autoClear = false
  blit(renderer, matBloom, null)
  renderer.autoClear = prevAuto
}

/** a quarter of the frame, which is what a bleed can afford and all the shape it needs */
export function sizeBloom(width: number, height: number, dpr: number): void {
  const w = Math.max(1, Math.floor(width * dpr) >> 2)
  const h = Math.max(1, Math.floor(height * dpr) >> 2)
  rtA.setSize(w, h)
  rtB.setSize(w, h)
}

export function disposeBloom(): void {
  rtA.dispose()
  rtB.dispose()
}
