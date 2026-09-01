/* ================================================================================================
   THE VALLEY -- phase 0 of the port, and the one part of this app that is not React.

   IT IS A MODULE, NOT A COMPONENT, AND THAT IS THE WHOLE POINT. The camera flies between
   sections; a flight is a second and a half of continuous motion that must survive every screen
   change the menu makes. A React component unmounts, and an unmount is a black frame and a lost
   camera -- which is exactly the failure the flight code in the mockup was written to avoid. So
   the canvas is created once, parented under the app, and never torn down. React draws over it
   and will later talk to it by calling functions; it never owns it.

   IT LOADS THE AUTHORED WORLD, STANDS AT Camera_MainMenu, AND FLIES. Entering a section is a move
   to that place's own composed shot; Escape is the same arc read backwards. See `flight.ts` for
   the move itself and `destinations.ts` for the five shots.

   THE LIGHTING IS STILL PHASE 0 AND IT LOOKS IT. One ambient, one directional, a flat dark
   background for sky and a distance fog. The mockup's valley has a sun with a composed position, a
   sky, god rays, a shadow rig and a day cycle, and none of that is here -- so this reads as dusk
   whatever the time. That is the next thing this file owes, and it is a bigger piece than the
   flights were.
   ================================================================================================ */
import {
  ACESFilmicToneMapping, Color, FogExp2, InstancedMesh, Mesh, PCFShadowMap, PerspectiveCamera, Scene,
  SRGBColorSpace, WebGLRenderer, MathUtils,
  type Material, type BufferGeometry, type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Vector3 } from 'three'
import {
  AIM_LEAN_BACK, FUJI_FRAME_U, FUJI_FRAME_V, FUJI_PEAK_HINT, HOME_EYE, HOME_FOV, MAX_STEP_MS,
  aimAt, easeInOutSine, makeFlight, type CamState, type Flight,
} from './flight'
import { DESTINATIONS } from './destinations'
import {
  FOG_COLOUR, FOG_DENSITY, faceSun, gradeSky, installRig, makeSunDisc, placeSun, updateSkyDir,
  type Rig,
} from './lighting'
import { ATMOS_LAYER, disposeShafts, renderGlow, renderSkyMask, sizeShafts, updateSunUv } from './shafts'
import { buildClouds, type CloudField } from './clouds'
import { registerFlights } from './flights'
import type { MenuSectionKey } from '../features/menu'

export type ValleyMarks = {
  fetchMs: number
  parseMs: number
  instanceMs: number
  firstFrameMs: number
  totalMs: number
  meshesBefore: number
  drawablesAfter: number
  triangles: number
  geometries: number
  textures: number
  freedAttributes: number
  freedMB: number
}

type Handle = {
  canvas: HTMLCanvasElement
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  marks: ValleyMarks
  dispose: () => void
}

/* THE LIVE CAMERA STATE, AND THE ONE THING THAT WRITES IT. Every frame reads `cam` and nothing
   else; a flight writes it and so does the initial stand. Keeping the pose as plain numbers rather
   than on the three camera is what lets a flight be sampled without a renderer -- which is how the
   maths in `flight.ts` stays testable. */
const cam: CamState = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 42, roll: 0 }
/* where the menu stands, taken from the authored camera once and never recomputed */
const home: CamState = { ...cam }

/* the flight currently running, so a second request can take the camera off it mid-move rather
   than two moves fighting over the same three numbers */
type Live = {
  flight: Flight
  elapsed: number
  /** the fraction of the move at which the destination's screen is asked for */
  openAt: number
  onOpen: (() => void) | null
  onLand: (() => void) | null
}
let live: Live | null = null
/* which section the camera is standing at, or null for the menu -- the way home retraces the way
   out, so it has to know which arc it came in on */
let flownTo: MenuSectionKey | null = null

/* the rig, and the one point in the world everything in it is aimed at */
let rig: Rig | null = null
let sunDisc: Mesh | null = null
let sunAt: Vector3 | null = null
let clouds: CloudField | null = null
/* NEVER SET `shadowMap.needsUpdate` DIRECTLY. In the mockup that flag was consumed by whichever
   render came next, which was the lake reflection -- a pass that clips at the waterline -- so the
   one shadow build in the world was drawn against a clipped scene, and the valley had no shadows
   in it for weeks. This port has a single render per frame so the trap cannot bite yet; the flag
   is kept anyway, so the day a second pass appears the rule is already here. */
let shadowDirty = false
/* `?rays=off` -- the shafts cost a second scene pass, so they get their own switch the way the
   whole valley does, and the same reason: the only honest way to price a thing is to boot without it */
const shafts = new URLSearchParams(window.location.search).get('rays') !== 'off'
const _eye = new Vector3()

let handle: Handle | null = null

/* INSTANCE WHAT SHARES A SHAPE. The authored world is 21,072 nodes standing on 341 meshes -- the
   crowd, the lamps, the stalls, the trees are the same handful of geometries placed over and over.
   GLTFLoader gives each node its own Mesh, so the scene arrives as ~21,000 draw calls for ~340
   distinct shapes. Grouping on (geometry, material) collapses that to the number of shapes
   actually present. Without it the valley is not slow-but-usable, it is unusable. */
function collapseToInstances(root: Object3D): { before: number; after: number } {
  const groups = new Map<string, Mesh[]>()
  const singles: Mesh[] = []
  let before = 0

  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || (m as unknown as InstancedMesh).isInstancedMesh) return
    before++
    const geo = m.geometry as BufferGeometry
    const mat = m.material as Material
    if (Array.isArray(m.material) || !geo || !mat) {
      singles.push(m)
      return
    }
    const key = geo.uuid + '|' + mat.uuid
    const bucket = groups.get(key)
    if (bucket) bucket.push(m)
    else groups.set(key, [m])
  })

  let after = singles.length
  for (const members of groups.values()) {
    if (members.length < 2) {
      after++
      continue
    }
    const first = members[0]
    const inst = new InstancedMesh(
      first.geometry as BufferGeometry,
      first.material as Material,
      members.length,
    )
    inst.name = 'inst:' + first.name
    /* the instance matrix is the member's WORLD matrix, because the InstancedMesh is parented to
       the root rather than to each member's own branch -- the branch is what we are removing */
    members.forEach((m, i) => {
      inst.setMatrixAt(i, m.matrixWorld)
      m.visible = false
      m.parent?.remove(m)
    })
    inst.instanceMatrix.needsUpdate = true
    inst.frustumCulled = false
    root.add(inst)
    after++
  }
  return { before, after }
}

/* WHO CASTS AND WHO CATCHES, and the one thing that must not do either.

   THE SKY IS NOT A CASTER, and forgetting that is a trap this exact sweep fell into in the mockup:
   the dome is `isMesh` like everything else, so a blanket `castShadow = true` hands it to the one
   shadow build in the world and freezes a dome-shaped shadow over the valley permanently. It is
   skipped by name, and it is the reason this walks the tree rather than being a line inside the
   instancing pass. */
function letLightThrough(root: Object3D): { casters: number } {
  let casters = 0
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    if (/skydome/i.test(o.name)) { m.castShadow = false; m.receiveShadow = false; return }
    m.castShadow = true
    m.receiveShadow = true
    casters++
  })
  return { casters }
}

/* GIVE THE VERTICES BACK ONCE THE GPU HAS THEM. three keeps the CPU-side typed array of every
   attribute alive forever after uploading it, because it has no way of knowing you will not want
   to read or re-upload it. This world is 2.8 million triangles and never changes a vertex, so
   those arrays are a second copy of the whole valley sitting in the renderer process. Nulling the
   array inside `onUpload` is the documented way to drop it: three grabs a local reference before
   invoking the callback, so the upload itself completes.

   THE PRICE IS THAT THE SCENE CANNOT BE REBUILT. If the WebGL context is lost -- a driver reset,
   a GPU hang, waking from sleep -- three re-uploads from arrays that are no longer there and the
   valley comes back empty. That is handled below by rebuilding from the file, which is the only
   honest answer: there is no copy left to recover from.

   It also gives up ray-picking against world geometry, which needs the position array to test
   triangles. The menu is screen-space and picks nothing in the world, so that is not a loss here
   -- but it is the thing to remember if a later phase ever wants to click a building. */
function freeCpuCopiesAfterUpload(root: Object3D): { attributes: number; bytes: number } {
  const seenGeometry = new Set<string>()
  const seenInterleaved = new Set<unknown>()
  /* the callbacks fire during the render that follows, so this is filled in after we return it --
     the caller reads it once a frame has actually been drawn */
  const stats = { attributes: 0, bytes: 0 }

  const release = (holder: { array: ArrayLike<number> | null }) => {
    const arr = holder.array as ArrayBufferView | null
    if (!arr) return
    stats.bytes += arr.byteLength
    stats.attributes++
    /* three reads `array` into a local before calling this, so dropping it here is safe */
    holder.array = null
  }

  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || !m.geometry) return
    const g = m.geometry as BufferGeometry
    if (seenGeometry.has(g.uuid)) return
    seenGeometry.add(g.uuid)

    /* bounds FIRST -- they are computed from the array, and three computes them lazily at cull
       time, which is after the upload that is about to take the array away */
    if (!g.boundingSphere) g.computeBoundingSphere()
    if (!g.boundingBox) g.computeBoundingBox()

    const buffers: { array: ArrayLike<number> | null; onUpload: (cb: () => void) => unknown }[] = []
    for (const attribute of Object.values(g.attributes)) {
      const inter = attribute as unknown as { isInterleavedBufferAttribute?: boolean; data?: unknown }
      if (inter.isInterleavedBufferAttribute && inter.data) {
        /* several attributes share one interleaved buffer; free the buffer once, not per view */
        if (seenInterleaved.has(inter.data)) continue
        seenInterleaved.add(inter.data)
        buffers.push(inter.data as (typeof buffers)[number])
      } else {
        buffers.push(attribute as unknown as (typeof buffers)[number])
      }
    }
    if (g.index) buffers.push(g.index as unknown as (typeof buffers)[number])

    for (const b of buffers) {
      b.onUpload(() => release(b))
    }
  })
  return stats
}

/* THE HIGHEST POINT OF THE MOUNTAIN, found in the model rather than written down, so it survives a
   re-export that moves it. Walked BEFORE the first render, which is the only window there is: the
   upload callbacks null every position array (see `freeCpuCopiesAfterUpload`), so a later pass
   would find nothing to measure. */
function findFujiPeak(root: Object3D): Vector3 | null {
  let peak: Vector3 | null = null
  const v = new Vector3()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !/fuji/i.test(o.name) || /outline/i.test(o.name)) return
    const pos = mesh.geometry?.attributes?.position
    if (!pos) return
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as never, i).applyMatrix4(mesh.matrixWorld)
      if (!peak || v.y > peak.y) peak = v.clone()
    }
  })
  return peak
}

function countTriangles(root: Object3D): number {
  let tris = 0
  root.traverse((o) => {
    const m = o as Mesh & Partial<InstancedMesh>
    if (!m.isMesh || !m.geometry) return
    const g = m.geometry as BufferGeometry
    const per = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3
    tris += per * (m.isInstancedMesh ? (m.count ?? 1) : 1)
  })
  return Math.round(tris)
}

/* stand where Blender's Camera_MainMenu stands; fall back to a sane overlook if it is missing,
   because a port that silently renders from the origin looks like a load failure.

   IT IS NOT WHERE THE MENU STANDS, though, and phase 0 believed it was. This only supplies a
   camera OBJECT -- its near and far planes and a sane starting lens. Every frame's pose is written
   from `cam`, and `cam` starts at the composed home; see the note by HOME_EYE in `flight.ts`. */
function pickCamera(root: Object3D, aspect: number): PerspectiveCamera {
  let found: PerspectiveCamera | null = null
  root.traverse((o) => {
    if (found) return
    const c = o as PerspectiveCamera
    if (c.isPerspectiveCamera && /MainMenu/i.test(o.name)) found = c
  })
  if (found) {
    const cam: PerspectiveCamera = found
    cam.aspect = aspect
    cam.updateProjectionMatrix()
    return cam
  }
  const cam = new PerspectiveCamera(38, aspect, 1, 40000)
  cam.position.set(0, 2000, 6000)
  cam.lookAt(0, 0, 0)
  return cam
}

export async function mountValley(url = './models/world.glb'): Promise<ValleyMarks> {
  if (handle) return handle.marks
  const t0 = performance.now()

  const canvas = document.createElement('canvas')
  canvas.id = 'valley'
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.zIndex = '0'
  canvas.style.display = 'block'
  canvas.style.pointerEvents = 'none'
  document.body.insertBefore(canvas, document.body.firstChild)

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  /* the world does not move, so the map is drawn once -- see `shadowDirty` */
  renderer.shadowMap.autoUpdate = false

  const scene = new Scene()
  scene.background = new Color(FOG_COLOUR)
  /* EXPONENTIAL, NOT A NEAR/FAR RAMP. A linear fog carries two distances that have to be chosen
     against a particular shot, and this camera flies; an exponential has one density and behaves
     the same everywhere. Phase 0's ramp was 6,000 to 26,000 -- tuned for one static shot in a
     valley 26,000 units across -- so the middle of every flight came out black. See FOG_DENSITY
     for how this number was found, which was by minimising rather than by eye. */
  scene.fog = new FogExp2(FOG_COLOUR, FOG_DENSITY)

  const tFetch0 = performance.now()
  const response = await fetch(url)
  const buf = await response.arrayBuffer()
  const fetchMs = performance.now() - tFetch0

  /* NO DECODER, AND THAT IS A CSP DECISION RATHER THAN A SIZE ONE. The world ships quantized
     (KHR_mesh_quantization), which three reads natively. meshopt and Draco are both smaller on
     disk and both are WebAssembly, and this app's Content-Security-Policy is `script-src 'self'`
     -- instantiating a wasm module needs 'wasm-unsafe-eval' added to it. Trading a CSP relaxation
     for 15 MB of install size, in an app that already ships 472 MB, is not a trade worth making.
     Measured: quantized loads within 40 ms of meshopt anyway. */
  const loader = new GLTFLoader()
  const tParse0 = performance.now()
  const gltf = await loader.parseAsync(buf, './models/')
  const parseMs = performance.now() - tParse0

  const root = gltf.scene
  scene.add(root)

  /* THE SUMMIT IS MEASURED HERE AND NOWHERE ELSE, and this is the only window for it. Instancing
     rebuilds the meshes and drops the names that identify Fuji, and the first render's upload
     callbacks null every position array -- so a walk after either finds nothing. It cost a run to
     learn: placed after the render it threw on a null array, `mountValley` rejected, and the menu
     silently fell back to having no valley to fly at all. */
  const fujiPeak = findFujiPeak(root) ?? new Vector3(...FUJI_PEAK_HINT)

  /* THE SKY DOME IS THE AUTHORED ONE, GRADED. `Landscape_Props_SkyDome_001` carries Robbie's own
     painted gradient, and a painted band is the same all the way round the horizon -- a sunset is
     a sky with a DIRECTION in it. So the dome keeps the image and takes a per-fragment grade on
     top; see `gradeSky`. Graded BEFORE instancing, because that is while the dome still has a
     name to find it by. */
  {
    let dome: Mesh | null = null
    root.traverse((o: Object3D) => {
      const mesh = o as Mesh
      if (dome || !mesh.isMesh || !/skydome/i.test(o.name)) return
      dome = mesh
    })
    if (dome) {
      const m = dome as Mesh
      m.castShadow = false
      m.receiveShadow = false
      /* the sky is not geometry as far as the shafts are concerned -- see ATMOS_LAYER */
      m.layers.set(ATMOS_LAYER)
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach(gradeSky)
    } else {
      console.warn('[valley] no SkyDome found in the world; the sky will be flat')
    }
  }

  const tInst0 = performance.now()
  const { before, after } = collapseToInstances(root)
  const instanceMs = performance.now() - tInst0

  letLightThrough(root)

  const camera: PerspectiveCamera = pickCamera(root, window.innerWidth / Math.max(1, window.innerHeight))

  /* COMPOSE THE STANDING POINT; DO NOT LOOK IT UP. See the note by HOME_EYE in `flight.ts` for why
     the authored `Camera_MainMenu` is the wrong answer even though it is the obvious one -- in
     short, every route in `flights.json` was flown from the composed point, so standing anywhere
     else makes the curve solved through each route's middle meaningless. */
  {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight)
    const homeTgt = aimAt(fujiPeak, HOME_EYE, HOME_FOV, aspect, FUJI_FRAME_U, FUJI_FRAME_V)
    Object.assign(home, {
      px: HOME_EYE[0], py: HOME_EYE[1], pz: HOME_EYE[2],
      tx: homeTgt.x, ty: homeTgt.y, tz: homeTgt.z,
      fov: HOME_FOV, roll: 0,
    })
    Object.assign(cam, home)
    camera.position.set(cam.px, cam.py, cam.pz)
    camera.fov = cam.fov
    camera.updateProjectionMatrix()
    camera.lookAt(homeTgt)

    /* THE SUN GOES WHERE THE COMPOSITION PUTS IT -- middle of the frame, 30% down from the top,
       50,000 out so it stands behind Fuji rather than inside it -- and then everything else takes
       its bearing from that one point: the key light, the sky's two scattering lobes, and the disc
       you can actually see. A sun placed by coordinate is a sun nobody composed. */
    sunAt = placeSun(HOME_EYE, homeTgt, HOME_FOV, aspect)
    rig = installRig(scene, sunAt)
    sunDisc = makeSunDisc()
    sunDisc.position.copy(sunAt)
    sunDisc.layers.set(ATMOS_LAYER)
    scene.add(sunDisc)
    /* the main camera sees the world AND the atmosphere; the mask pass turns this one off */
    camera.layers.enable(ATMOS_LAYER)
    /* THE RING IS CENTRED ON THE VALLEY, NOT ON THE CAMERA. Anchoring it to the eye would make it a
       skybox -- clouds that never move relative to you, which is exactly the flat-gradient problem
       one step further out. Centred on the world, a flight across 11,000 units genuinely slides
       them against the mountains, which is the whole reason to make them geometry. */
    clouds = buildClouds(scene, new Vector3(0, 0, 0))
    sizeShafts(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    /* ONE SHADOW BUILD. `autoUpdate` is off below: redrawing 4096 squared of a five-million
       triangle valley every frame is worth double digits of fps, and nothing in the world moves. */
    shadowDirty = true
  }

  /* registered before the first render, because the callbacks fire during the upload that render
     performs; `freed` is empty until then */
  const freed = freeCpuCopiesAfterUpload(root)

  /* AN ATTRIBUTE IS ONLY RELEASED WHEN THREE UPLOADS IT, and three only uploads what it draws --
     so geometry outside the opening shot keeps its array until the camera first reaches it. That
     is the right bargain and it was measured: forcing the whole valley to upload on frame one to
     free those arrays gave back 9.8 MB of renderer memory and cost 25.8 MB of GPU memory, because
     shapes the camera has never seen became resident for nothing. Deferred is strictly better --
     it converges on the same place if you visit everywhere, and stays cheaper if you do not. */
  const tFrame0 = performance.now()
  renderer.render(scene, camera)
  const firstFrameMs = performance.now() - tFrame0

  /* LET GO OF THE LOADER -- A GUARD, NOT A SAVING, and measured as exactly that. GLTFParser keeps
     an `associations` map from every object it built back to the glTF that described it: 22,087
     entries here, pinning all 21,484 meshes the instancing pass just discarded, plus the file's
     whole binary chunk. Today `gltf` is a local that nothing outlives, so clearing it changes
     nothing (706.8 MB against 701.2 MB, inside the noise). It stays because the day something
     does hold onto `gltf` -- for the cameras, for animations -- this is what stops that from
     silently retaining the entire pre-instancing scene. */
  const parser = (gltf as unknown as { parser?: { associations?: Map<unknown, unknown> } }).parser
  parser?.associations?.clear()

  const marks: ValleyMarks = {
    fetchMs: Math.round(fetchMs),
    parseMs: Math.round(parseMs),
    instanceMs: Math.round(instanceMs),
    firstFrameMs: Math.round(firstFrameMs),
    totalMs: Math.round(performance.now() - t0),
    meshesBefore: before,
    drawablesAfter: after,
    triangles: countTriangles(root),
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    freedAttributes: freed.attributes,
    freedMB: +(freed.bytes / 1048576).toFixed(1),
  }

  /* THE CONTEXT CAN BE LOST AND THE VERTICES ARE GONE. Nothing on the CPU can redraw this scene,
     so the only recovery is to load the world again from the file. Rare -- a driver reset or a
     GPU hang -- but silent breakage would be worse than a second of reloading. */
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    console.warn('[valley] WebGL context lost; the world is being loaded again')
    handle?.dispose()
    void mountValley(url).catch((error) => console.warn('[valley] reload failed:', error))
  })

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight)
    camera.updateProjectionMatrix()
    sizeShafts(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
  })


  /* ONE LOOP, ONE CLOCK, AND THE SPIN IS GONE.

     Phase 0 turned the camera 0.02 degrees a frame so that the frame cost it was measuring came
     off a MOVING frame rather than a still one -- a measuring instrument, and it had no business
     surviving the phase. It did, for three more, and what it turned the valley into was a
     photograph revolving behind the menu.

     The step is capped rather than taken raw: a stalled frame that covers eight frames' worth of
     path in one go is indistinguishable from a snap, so a stall costs a little wall-clock instead.
     See MAX_STEP_MS. */
  let raf = 0
  let last = performance.now()
  const _aim = new Vector3()
  const frame = () => {
    raf = requestAnimationFrame(frame)
    const now = performance.now()
    const dt = Math.min(now - last, MAX_STEP_MS)
    last = now

    if (live) {
      live.elapsed += dt / 1000
      const p = Math.min(1, live.elapsed / live.flight.dur)
      live.flight.sample(easeInOutSine(p), cam)
      /* THE DESTINATION ASSEMBLES AS A FRACTION OF THE MOVE, not at a fixed time, so the pacing
         holds whether the flight is 1.6 seconds or 4.6. */
      if (live.onOpen && p >= live.openAt) { const open = live.onOpen; live.onOpen = null; open() }
      if (p >= 1) { const land = live.onLand; live = null; land?.() }
    }

    /* THE SUN AS THE SKY SEES IT is a direction FROM THE EYE, so the scattering lobes stay put
       when the camera flies and swing when it turns. */
    if (sunAt) {
      _eye.set(cam.px, cam.py, cam.pz)
      updateSkyDir(sunAt, _eye)
      if (sunDisc) faceSun(sunDisc, _eye)
    }

    /* the sky drifts on the same capped clock as everything else, so a dropped frame slows the
       weather rather than teleporting it */
    if (clouds) clouds.drift(dt / 1000)

    camera.position.set(cam.px, cam.py, cam.pz)
    if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix() }
    _aim.set(cam.tx, cam.ty, cam.tz)
    camera.lookAt(_aim)
    if (cam.roll) camera.rotateZ(MathUtils.degToRad(cam.roll))
    /* WHERE THE SUN IS ON SCREEN IS ASKED ONCE, HERE, because both the mask pass and the overlay
       need it and the mask pass is skipped outright when the answer is "nowhere". */
    if (sunDisc && shafts) {
      updateSunUv(sunDisc, camera)
      /* THE SKY MASK IS A WHOLE SCENE PASS, so it goes before the shadow flag is raised rather
         than after it -- a pending build would otherwise land in this pass instead of the real
         one, which is exactly how the mockup lost every shadow in the valley. */
      renderSkyMask({ renderer, scene, camera, disc: sunDisc })
    }

    /* and the shadow build goes HERE, in the last gap before the render -- see `shadowDirty` */
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false }
    renderer.render(scene, camera)

    /* the glow goes on OVER the finished frame, so the main render still goes straight to the
       canvas and nothing about the colour path changes */
    if (sunDisc && shafts) renderGlow({ renderer, scene, camera, disc: sunDisc })
  }
  frame()

  handle = {
    canvas,
    renderer,
    scene,
    camera,
    marks,
    dispose: () => {
      cancelAnimationFrame(raf)
      registerFlights(null)
      live = null
      if (rig) { scene.remove(rig.key, rig.key.target, rig.fill, rig.fill.target, rig.hemi); rig = null }
      if (sunDisc) { scene.remove(sunDisc); sunDisc = null }
      sunAt = null
      clouds?.dispose()
      clouds = null
      disposeShafts()
      renderer.dispose()
      canvas.remove()
      handle = null
    },
  }
  /* the menu can fly from here on. Registered AFTER `handle`, because both calls check it. */
  registerFlights({ flyToSection: flyToSectionImpl, flyHome: flyHomeImpl, isFlying: isFlyingImpl })

  ;(window as unknown as { __VALLEY__?: ValleyMarks }).__VALLEY__ = marks
  return marks
}

export function valleyHandle() {
  return handle
}

/* ==================================================================================================
   THE TWO CALLS REACT MAKES. Neither returns anything and both are safe when the valley is off --
   the app must work with `?valley=off`, and a menu whose navigation depended on a canvas being
   there would not.

   THE SCREEN ARRIVES WITH THE CAMERA, NOT BEFORE IT. `onOpen` fires at 82% of the move, so the
   section's board is assembling as the flight settles rather than appearing over a camera still
   crossing the valley. If there is no valley the caller is told immediately, which is exactly what
   the menu did for the three phases before this.
   ================================================================================================== */
const OPEN_AT = 0.82

function flyToSectionImpl(section: MenuSectionKey, onOpen: () => void): void {
  const dest = DESTINATIONS[section]
  if (!handle || !dest) { onOpen(); return }
  const flight = makeFlight({
    startEye: new Vector3(cam.px, cam.py, cam.pz),
    startTgt: new Vector3(cam.tx, cam.ty, cam.tz),
    endEye: new Vector3(dest.eye[0], dest.eye[1], dest.eye[2]),
    endTgt: new Vector3(dest.focus[0], dest.focus[1], dest.focus[2]),
    mid: dest.mid, lean: dest.lean, pace: dest.pace,
    startFov: cam.fov, endFov: dest.fov, startRoll: cam.roll, endRoll: 0,
  })
  flownTo = section
  live = { flight, elapsed: 0, openAt: OPEN_AT, onOpen, onLand: null }
}

/* THE WAY HOME RETRACES THE WAY OUT -- same middle, because a flight that came in through a gate
   would otherwise leave by lifting off through its roof, and the trees the arrival was routed
   around are back in the way. With a single middle there is nothing to reverse: the same arc read
   backwards is the same arc. It leans a great deal less (see AIM_LEAN_BACK) and it unwinds
   whatever roll the arrival had, because the menu is never tilted. */
function flyHomeImpl(): void {
  if (!handle) return
  const dest = flownTo ? DESTINATIONS[flownTo] : null
  flownTo = null
  live = {
    flight: makeFlight({
      startEye: new Vector3(cam.px, cam.py, cam.pz),
      startTgt: new Vector3(cam.tx, cam.ty, cam.tz),
      endEye: new Vector3(home.px, home.py, home.pz),
      endTgt: new Vector3(home.tx, home.ty, home.tz),
      mid: dest?.mid ?? null, lean: AIM_LEAN_BACK, pace: dest?.pace ?? null,
      startFov: cam.fov, endFov: home.fov, startRoll: cam.roll, endRoll: 0,
    }),
    elapsed: 0, openAt: 1, onOpen: null, onLand: null,
  }
}

function isFlyingImpl(): boolean {
  return live !== null
}
