import {
  Color, DoubleSide, FloatType, Mesh, NearestFilter, OrthographicCamera, PerspectiveCamera,
  PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget, WebGLRenderer,
  type InstancedMesh, type Object3D,
} from 'three'
import { IDLE_GLSL } from './crowd'
import { LAKE_U } from './lake'

/* ==================================================================================================
   INK — OUTLINES IN SCREEN SPACE, AND THE REASON THE VALLEY LOOKED LIKE NOTHING.

   THIS WAS NEVER PORTED, and it is most of the mockup's drawing. Rendered side by side at the same
   camera, the same hour and the same `world.glb`, the mockup's festival gate is a lit, outlined,
   cel-shaded picture and this port's was a flat dark silhouette. Not lamps, not textures: the world
   had no LINES in it. `shafts.ts` said so in as many words -- "this port has no outlines" -- and
   `crowd.ts` wrote its idle displacement out twice against the day one arrived.

   WHY SCREEN SPACE AND NOT INVERTED HULLS, which is what the mockup tried first and measured:
     - COST. Twenty thousand instanced trees each carried a duplicate of their own geometry: 2.4M
       of a 5.2M-triangle frame was hull.
     - IT INKS THE WRONG THINGS. A hull inks everywhere a surface turns away from the eye, not just
       the silhouette -- so a terrain mesh got hundreds of internal crest lines, close enough at
       distance to read as a solid fill. That is what made the far mountains black.
     - IT CANNOT INK A FLAT SHEET. On a ground plane or a pond the back faces are coplanar with the
       front ones and the result is a lid over the whole thing.
   A screen-space pass has none of those: one prepass with a trivial shader and one full-screen quad
   regardless of how many objects there are, a line exactly where two SURFACES meet in the image, and
   no geometry laid over anything.

   ONE PREPASS, NOT TWO. View-space normal in RGB and view distance in A, so silhouettes (a jump in
   depth) and creases (a jump in normal) both come out of a single render.

   EVERY NUMBER BELOW IS THE MOCKUP'S, and each one has a measurement behind it that is kept with it
   rather than summarised away -- they are the difference between a drawing and a crust of black
   pixels, and none of them is guessable.
   ================================================================================================== */

/** the layer the crowd is drawn on for its own prepass, so the outlines move with the figures */
export const CROWD_LAYER = 1

export const INK = {
  on: true,
  /** half-width of the sample cross, in pixels, before falloff */
  width: { value: 1.35 },
  /** relative depth jump that counts as a silhouette */
  depthT: { value: 0.018 },
  /* 1 - dot(n, n') that counts as a crease, and 0.22 was below the geometry. 0.22 is a 38-degree
     fold; a conifer here is a cone with eight radial facets, so neighbouring faces differ by 45 --
     1 - cos(45) = 0.293, comfortably over the line -- and the pass dutifully inked EVERY FACET EDGE
     on every tree of that shape. It was not the outline being wrong; it was the crease detector
     doing what it was told on a low-poly shape whose faces are meant to read as one curved surface.
     0.50 is a 60-degree fold: past anything a faceted cone produces, well under a building corner,
     which is 90 degrees and scores 1.0. */
  normalT: { value: 0.50 },
  /* the near/far weight in the shader carries the heaviness now, so this is the base */
  amount: { value: 0.85 },
  colour: { value: new Color(0x121319) },
  texel: { value: new Vector2(1 / 1440, 1 / 810) },
}

/* WHAT DOES NOT GET INKED: the sky, the clouds and the sun. Leaving them out of the prepass is not
   the same as not inking them -- it is BETTER, because everything in front of them then has a depth
   jump to nothing and gets a clean silhouette against the sky, which is the one line in a cel-shaded
   landscape that has to read.
   THE AUTHORED DOME IS `Landscape_Props_SkyDome_001`, which `^sky-` never matched. Harmless for the
   outlines -- a silhouette against a surface 46,000 units away still reads as a depth jump -- but
   fatal for the shafts, which mask on "is there anything in front of the sky here", and a sky that
   IS something is a frame with no sky in it. Matched on the word. */
export const INK_SKIP = /^(sky-|sun-)|sky-?dome/i

const rtND = new WebGLRenderTarget(1, 1, { type: FloatType, depthBuffer: true })
rtND.texture.minFilter = NearestFilter
rtND.texture.magFilter = NearestFilter
rtND.texture.generateMipmaps = false

/** the normal-and-depth buffer, so the shafts can mask on the same render rather than their own */
export const inkTarget = rtND

const QUAD_VS = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`

/* THE PREPASS SHADER IS A FACTORY, and that is the one real cost of screen-space ink. An inverted
   hull was geometry, so it inherited every vertex animation for free -- whatever the shader did to
   the model, the hull did too, because the hull WAS the model. A screen-space outline is drawn from
   a buffer rendered with an OVERRIDE material, and an override material replaces the vertex shader
   the animation lives in. So every displacement has to be repeated here, from the same source: this
   reads `IDLE_GLSL` out of `crowd.ts` rather than restating it, or the two drift the moment either
   is tuned and the symptom is an outline sliding half a body off its figure. */
function prepassVS(idle: boolean): string {
  return `
    ${idle ? IDLE_GLSL : ''}
    varying vec3 vN;
    varying float vD;
    void main() {
      vec3 lpos = position;
      vec3 ln = normal;
      vec4 lp;
      #ifdef USE_INSTANCING
        ${idle ? 'idleFigure( lpos, ln, IDLE_ORIGIN );' : ''}
        lp = instanceMatrix * vec4( lpos, 1.0 );
        ln = normalize( mat3( instanceMatrix ) * ln );
      #else
        lp = vec4( lpos, 1.0 );
      #endif
      vec4 mv = modelViewMatrix * lp;
      vD = - mv.z;
      vN = normalize( normalMatrix * ln );
      gl_Position = projectionMatrix * mv;
    }`
}

const PREPASS_FS = `
  varying vec3 vN;
  varying float vD;
  void main() {
    vec3 n = normalize( vN );
    /* AND THE BACK OF A SHEET FACES YOU. With the pass double-sided the attribute normal on a back
       face points away from the eye, so the buffer would record a surface turned the wrong way --
       harmless for a silhouette, wrong for the crease test, which compares neighbours and would read
       the fold of a banner as a 180-degree jump. gl_FrontFacing is the only thing that knows which
       way round this fragment came in. */
    if ( ! gl_FrontFacing ) n = - n;
    gl_FragColor = vec4( n * 0.5 + 0.5, vD );
  }`

/* WHY THE PREPASS IS DOUBLE-SIDED AND THE LIT PASS IS NOT. An override material carries its own
   `side` for the whole scene -- so a world modelled with backface culling off, which arrives as
   `doubleSided: true` and renders both faces when lit, was rasterised FRONT FACES ONLY into the
   buffer the outlines read. Anywhere you look at the back of an open sheet -- a festival banner, an
   eave soffit, a stall awning -- that sheet simply was not in the buffer, so the depth and normal
   there belonged to whatever was BEHIND it, and the ink drew that thing's outlines across the front
   of the banner. Counted on this world: 454 double-sided meshes, 37 front-sided, 1 back-sided. */
const matPrepass = new ShaderMaterial({
  vertexShader: prepassVS(false),
  fragmentShader: PREPASS_FS,
  side: DoubleSide,
})
const matPrepassIdle = new ShaderMaterial({
  vertexShader: prepassVS(true),
  fragmentShader: PREPASS_FS,
  side: DoubleSide,
})

const matInk = new ShaderMaterial({
  uniforms: {
    tND: { value: rtND.texture },
    texel: INK.texel,
    uWidth: INK.width,
    uDepthT: INK.depthT,
    uNormalT: INK.normalT,
    uAmount: INK.amount,
    uColor: INK.colour,
    /* the same distance fog every surface takes, shared rather than copied */
    fogColor: LAKE_U.fogColor,
    fogDensity: LAKE_U.fogDensity,
  },
  vertexShader: QUAD_VS,
  fragmentShader: `
    uniform sampler2D tND;
    uniform vec2 texel;
    uniform float uWidth, uDepthT, uNormalT, uAmount, fogDensity;
    uniform vec3 uColor, fogColor;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tND, vUv );
      vec3 n0 = c.xyz * 2.0 - 1.0;
      float d0 = c.w;
      /* THE CROSS IS ONE WIDTH, AND THAT IS THE POINT. It used to be scaled by distance on the
         reasoning that a wider sample cross makes the near line thicker rather than merely darker.
         It does not: the cross is the DETECTOR's footprint, so every pixel within two of an edge
         takes some alpha and the result is a gradient two pixels deep on both sides. Measured as
         the difference between the frame with the pass and without it, near strokes averaged 6.34
         pixels across with half of them four or wider -- a smear. Heavier-near is a question of
         WEIGHT, not footprint, so it moved to the alpha below. */
      vec2 o = texel * uWidth;
      float dJump = 0.0, nJump = 0.0, dRef = d0;
      for ( int i = 0; i < 4; i++ ) {
        vec2 off = i == 0 ? vec2( o.x, 0.0 ) : i == 1 ? vec2( - o.x, 0.0 )
                 : i == 2 ? vec2( 0.0, o.y ) : vec2( 0.0, - o.y );
        vec4 s = texture2D( tND, vUv + off );
        dJump = max( dJump, abs( s.w - d0 ) );
        dRef = max( dRef, s.w );
        nJump = max( nJump, 1.0 - dot( normalize( s.xyz * 2.0 - 1.0 ), normalize( n0 ) ) );
      }
      /* RELATIVE TO DEPTH, or every distant object is one solid edge: an absolute jump of 200 units
         is a cliff at 2,000 and nothing at 40,000. */
      float rel = dJump / max( dRef, 1.0 );
      /* AND RELAXED ON GRAZING SURFACES. A ground plane seen almost edge-on changes depth by
         hundreds of units from one pixel to the next while being perfectly flat -- without this the
         whole meadow comes out as solid ink. n0.z is how square-on the surface is. */
      float graze = clamp( abs( normalize( n0 ).z ), 0.06, 1.0 );
      /* THE RAMPS STAY WIDE. Narrowing them (2.6t to 1.7t, 0.30 to 0.14) moved the stroke from 2.97
         pixels to 2.90 on one silhouette and 2.63 to 2.70 on another -- noise -- while the
         foreground's total darkening rose 7%. All cost, no width. The spread was the sample cross;
         this ramp is the only antialiasing the line has. */
      float dEdge = smoothstep( uDepthT / graze, uDepthT * 2.6 / graze, rel );
      float nEdge = smoothstep( uNormalT, uNormalT + 0.30, nJump );
      /* AND A CREASE IS A LIGHTER LINE THAN A SILHOUETTE. In a drawing the outside of a form is the
         heavy stroke and the folds inside it are hairlines; giving both the same weight is most of
         what makes screen-space outlines look mechanical. */
      float e = max( dEdge, nEdge * ( 1.0 - dEdge * 0.5 ) * 0.55 );
      if ( e <= 0.001 ) discard;
      /* THE SAME HAZE EVERY SURFACE TAKES. An unfogged line stays jet black against a mountain that
         has dissolved into the fog and reads as a crack in the image. */
      float far = max( d0, dRef );
      float f = 1.0 - exp( - fogDensity * fogDensity * far * far );
      vec3 col = mix( uColor, fogColor, clamp( f, 0.0, 1.0 ) );
      /* AND IT SHEDS. A forest at fifteen thousand units has more silhouette edges than it has
         pixels, and inking all of them at full strength turns the far treeline into a crawling
         crust. Measured by band, as the difference between the frame with the pass and without:

             shed    far ridge   meadow   near      near/far
             0.30      12.8       35.3     50.3      3.92x
             0.48      15.6       37.1     50.5      3.25x
             0.62      17.9       38.7     50.7      2.83x
             0.78      20.5       40.5     50.9      2.48x

         The lines were never missing -- the pixel count barely moves across that sweep -- they were
         drawn at a quarter strength against a background that had also gone pale, and the eye calls
         that absent. 0.62 buys back 40% of the far line and still sheds a third at the horizon. */
      float shed = mix( 1.0, 0.62, smoothstep( 9000.0, 30000.0, far ) );
      /* AND THE NEAR LINE IS THE CONFIDENT ONE -- what the distance-scaled cross was trying to be.
         Done on the alpha it costs no width, so the line stays one pixel of decision and simply
         presses harder. Sky reads d0 = 0 and takes the full weight, which is right: a silhouette
         against the dawn is the strongest line in the picture. */
      float weight = mix( 1.18, 0.86, smoothstep( 4000.0, 26000.0, d0 ) );
      gl_FragColor = vec4( col, clamp( e * uAmount * shed * weight, 0.0, 1.0 ) );
    }`,
  transparent: true,
  depthTest: false,
  depthWrite: false,
})

/* the full-screen quad the ink is drawn with, private to this pass */
const quadGeo = new PlaneGeometry(2, 2)
const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
const quadScene = new Scene()
const quadMesh = new Mesh(quadGeo, matInk)
quadMesh.frustumCulled = false
quadScene.add(quadMesh)

const hidden: Object3D[] = []
const wasVisible: boolean[] = []
const crowdWas: boolean[] = []

/** put the crowd on its own layer, so its prepass can be a second render of just those meshes */
export function inkTrackCrowd(meshes: readonly InstancedMesh[]): void {
  for (const m of meshes) m.layers.enable(CROWD_LAYER)
}

/* ==================================================================================================
   THE PREPASS, SPLIT OUT FROM THE STROKE. Two passes want this buffer -- the outlines want its
   normals and its depth jumps, the shafts want only "is this pixel sky" -- so it renders whenever
   either is on rather than being a private step inside the ink.

   THE CROWD COMES OUT OF THE OVERRIDE PASS AND GOES BACK IN ITS OWN, which is the whole of "the
   outlines do not move with them". They cannot simply be drawn TWICE: the first pass would already
   have written their static silhouette into the depth buffer, and the second could only add to it,
   leaving every figure with a stationary ghost of itself. So they are hidden for the override pass
   and drawn afterwards, on their own layer, with the same idle displacement their lit material has.
   Nothing is cleared in between, so a figure behind a stall is still occluded by it.
   ================================================================================================== */
export function renderND(
  renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera,
  crowd: readonly InstancedMesh[], idle: boolean,
): void {
  hidden.length = 0
  scene.traverse((o) => {
    const drawable = o as Mesh
    if ((drawable.isMesh || (o as InstancedMesh).isInstancedMesh) && o.visible
      && INK_SKIP.test(o.name)) hidden.push(o)
  })
  wasVisible.length = 0
  hidden.forEach((o, i) => { wasVisible[i] = o.visible; o.visible = false })

  const swaying = idle && crowd.length > 0
  if (swaying) {
    crowdWas.length = 0
    crowd.forEach((o, i) => { crowdWas[i] = o.visible; o.visible = false })
  }

  const prevAlpha = renderer.getClearAlpha()
  scene.overrideMaterial = matPrepass
  renderer.setRenderTarget(rtND)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(scene, camera)

  if (swaying) {
    const prevAuto = renderer.autoClear
    renderer.autoClear = false
    crowd.forEach((o, i) => { o.visible = crowdWas[i] })
    scene.overrideMaterial = matPrepassIdle
    /* THE MASK IS SAVED AND PUT BACK, NOT RESET TO ZERO. `camera.layers.set(0)` does not mean
       "back to normal" -- it means "see layer 0 and nothing else", and this camera is deliberately
       on two: the sky dome and the sun disc live alone on ATMOS_LAYER so the shafts can render the
       world without them. Reset, the camera stopped drawing the sky ENTIRELY from the first inked
       frame onward, and what was left looking like a sky was the fog. It cost an hour, because the
       symptom was "the sky shader's new uniforms do nothing" -- they were doing it to a mesh that
       was no longer being rendered. */
    const prevLayers = camera.layers.mask
    camera.layers.set(CROWD_LAYER)
    renderer.render(scene, camera)
    renderer.autoClear = prevAuto
    camera.layers.mask = prevLayers
  }

  renderer.setRenderTarget(null)
  scene.overrideMaterial = null
  renderer.setClearAlpha(prevAlpha)
  hidden.forEach((o, i) => { o.visible = wasVisible[i] })
}

/* AND autoClear OFF FOR THE OVERLAY. `render()` clears the target it is given unless told not to,
   so blitting the ink quad to the canvas wiped the frame that had just been drawn on it and left a
   line drawing on an empty background. */
export function renderInk(renderer: WebGLRenderer): void {
  if (!INK.on) return
  const prevAuto = renderer.autoClear
  renderer.autoClear = false
  renderer.setRenderTarget(null)
  renderer.render(quadScene, quadCam)
  renderer.autoClear = prevAuto
}

export function sizeInk(width: number, height: number, dpr: number): void {
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  rtND.setSize(w, h)
  INK.texel.value.set(1 / w, 1 / h)
}

export function disposeInk(): void {
  rtND.dispose()
}
