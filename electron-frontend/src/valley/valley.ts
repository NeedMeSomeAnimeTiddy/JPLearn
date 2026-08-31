/* ================================================================================================
   THE VALLEY -- phase 0 of the port, and the one part of this app that is not React.

   IT IS A MODULE, NOT A COMPONENT, AND THAT IS THE WHOLE POINT. The camera flies between
   sections; a flight is a second and a half of continuous motion that must survive every screen
   change the menu makes. A React component unmounts, and an unmount is a black frame and a lost
   camera -- which is exactly the failure the flight code in the mockup was written to avoid. So
   the canvas is created once, parented under the app, and never torn down. React draws over it
   and will later talk to it by calling functions; it never owns it.

   PHASE 0 DOES NOT DRAW THE MENU. No HUD, no navigation, no flights. It loads the authored world,
   stands at the camera Blender calls Camera_MainMenu, and renders. The deliverable is a number:
   what the valley costs a cold boot of the packaged app.
   ================================================================================================ */
import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, Fog, InstancedMesh, Mesh,
  PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer, MathUtils,
  type Camera, type Material, type BufferGeometry, type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

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
  camera: Camera
  marks: ValleyMarks
  dispose: () => void
}

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
   because a port that silently renders from the origin looks like a load failure */
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

  const scene = new Scene()
  scene.background = new Color(0x1a1712)
  scene.fog = new Fog(0x1a1712, 6000, 26000)

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

  const tInst0 = performance.now()
  const { before, after } = collapseToInstances(root)
  const instanceMs = performance.now() - tInst0

  scene.add(new AmbientLight(0xffd9a1, 0.9))
  const sun = new DirectionalLight(0xffc98a, 1.6)
  sun.position.set(-6000, 5000, 3000)
  scene.add(sun)

  const camera = pickCamera(root, window.innerWidth / Math.max(1, window.innerHeight))

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
  })

  /* a slow turn, so a frame cost measured later is a MOVING frame rather than a still one */
  let raf = 0
  const spin = () => {
    raf = requestAnimationFrame(spin)
    camera.rotation.y += MathUtils.degToRad(0.02)
    renderer.render(scene, camera)
  }
  spin()

  handle = {
    canvas,
    renderer,
    scene,
    camera,
    marks,
    dispose: () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      canvas.remove()
      handle = null
    },
  }
  ;(window as unknown as { __VALLEY__?: ValleyMarks }).__VALLEY__ = marks
  return marks
}

export function valleyHandle() {
  return handle
}
