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
  ACESFilmicToneMapping, BackSide, Color, FogExp2, InstancedMesh, Mesh, PCFShadowMap,
  PerspectiveCamera, Scene,
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
import { makePacer } from './pacing'
import {
  FOG_COLOUR, FOG_DENSITY, SKY_U, aimKey, faceSun, gradeDisc, gradeSky, installRig,
  gradeMoon, makeMoonDisc, makeSunDisc, placeSun, updateSkyDir, type Rig,
} from './lighting'
import {
  ATMOS_LAYER, disposeShafts, renderGlow, renderSkyMask, setGlow, sizeShafts, updateSunUv,
  glowNow,
} from './shafts'
import { buildClouds, type CloudField } from './clouds'
import { FLICKER, buildLanterns, flameFlicker, flickerTick, type LanternField } from './lanterns'
import { buildNightMap, type NightMap } from './nightmap'
import { buildWindows, type WindowField } from './windows'
import { bakeHeightfield, type Heightfield } from './heightfield'
import { bloomTrack, disposeBloom, renderBloom, setBloomNight, sizeBloom } from './bloom'
import { LAMP_U, MOVE_LAMPS, buildLampGrid, type LampGrid } from './lampgrid'
import { celWorld } from './cel'
import { disposeInk, inkTrackCrowd, renderInk, renderND, sizeInk } from './ink'
import { type BoatLamps, buildBoatLamps } from './boatlamp'
import { type LandformStats, buildLandform } from './landform'
import { type Ponds, buildPonds } from './pond'
import { SWAY_LAYER, type SwayField, buildSway, swayTick } from './sway'
import { type WindField, buildWind } from './wind'
import { buildCrowd, type CrowdField } from './crowd'
import { buildWalkers, type WalkField } from './walk'
import { buildLake, lakeCentre, lakeShore, type Lake } from './lake'
import { buildForest, type ForestStats } from './forest'
import { buildCrane, type Crane } from './crane'
import { createViewpoint, fittedFov, type Viewpoint } from './viewpoint'
import { buildLife, type LifeField } from './life'
import { buildOutfits } from './outfit'
import { buildBirds, type BirdField } from './birds'
import { buildPetals, type PetalField } from './petals'
import { buildSteam, type SteamField } from './steam'
import { buildFireflies, type FireflyField } from './fireflies'
import { createReflection, type Reflection } from './reflection'
import { ATMOS_U, LANDFORM, aimCover, breathe, driftCover, makeCoverTexture } from './atmosphere'
import { arcPlace, dayPalette, siteHere, solarState, type SolarState } from './daycycle'
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
let moonDisc: Mesh | null = null
/* WHICHEVER BODY IS ACTUALLY UP gets the shafts and the halo. The sky's own scattering always
   follows the SUN, even well below the horizon, because that is what twilight IS -- but a shaft is
   light coming past something, and at three in the morning the thing it comes past is the moon. */
let glowBody: Mesh | null = null
/** how lit the valley is, held between day beats so the flames can flicker every frame */
let lampNow = 0
/* scratch, module-level, because the day beat runs every couple of seconds and neither of these
   should be an allocation */
const _moonAt = new Vector3()
const _keyAt = new Vector3()
let sunAt: Vector3 | null = null
let clouds: CloudField | null = null
let lanterns: LanternField | null = null
let lampGrid: LampGrid | null = null
let nightMap: NightMap | null = null
let windows: WindowField | null = null
let crowd: CrowdField | null = null
let walkers: WalkField | null = null
let life: LifeField | null = null
let birds: BirdField | null = null
let petals: PetalField | null = null
let steam: SteamField | null = null
let fireflies: FireflyField | null = null
let sway: SwayField | null = null
let ponds: Ponds | null = null
let landformStats: LandformStats | null = null
let boatLamps: BoatLamps | null = null
let wind: WindField | null = null
let ground: Heightfield | null = null
let lake: Lake | null = null
let mirror: Reflection | null = null
let forest: ForestStats | null = null
let crane: Crane | null = null
let viewpoint: Viewpoint | null = null
/* THE WINDOW'S SHAPE, HELD RATHER THAN ASKED FOR. `innerWidth` forces a layout flush, and the frame
   loop needs the aspect on every tick to fit the lens -- see `fittedFov`. It changes on resize and
   nowhere else, so that is where it is written. */
let aspect = 16 / 9
let coverTex: ReturnType<typeof makeCoverTexture> | null = null
/* WHERE THE VIEWER IS, ASKED ONCE. `Intl` is cheap but not free and the answer cannot change
   inside a session; the sun's altitude is what moves. */
let site: readonly [number, number] | null = null
/* THE HOUR OVERRIDE, so a screenshot of dusk does not have to be taken at dusk. `?hour=21.5`
   or `?hour=21:30`, matching the mockup's own `?time=`. */
const hourOverride = (() => {
  const raw = new URLSearchParams(window.location.search).get('hour')
  if (!raw) return null
  const hm = /^(\d{1,2})[:.](\d{2})$/.exec(raw)
  if (hm) return +hm[1] + +hm[2] / 60
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
})()
/* the day is re-evaluated on a slow beat rather than per frame: the sun moves a quarter of a
   degree a minute, and every write below costs a uniform upload or a light rebuild */
let lastDayAt = -1e9
let fogBase = 0
let homeAim: Vector3 | null = null
let homeAspect = 16 / 9
/* the FITTED home lens, captured with the aspect it was fitted at -- see the note where it is set */
let homeFovFit = HOME_FOV
/** how often the sun is asked where it is */
const DAY_BEAT_MS = 2000
/* NEVER SET `shadowMap.needsUpdate` DIRECTLY. In the mockup that flag was consumed by whichever
   render came next, which was the lake reflection -- a pass that clips at the waterline -- so the
   one shadow build in the world was drawn against a clipped scene, and the valley had no shadows
   in it for weeks. This port has a single render per frame so the trap cannot bite yet; the flag
   is kept anyway, so the day a second pass appears the rule is already here. */
let shadowDirty = false
/* `?rays=off` -- the shafts cost a second scene pass, so they get their own switch the way the
   whole valley does, and the same reason: the only honest way to price a thing is to boot without it */
/* EVEN FRAMES BEAT FAST ONES -- see `pacing.ts` for the measurement this is the answer to.
   `?pace=off` renders every vsync the display offers, which is what this build did before. */
const paced = new URLSearchParams(window.location.search).get('pace') !== 'off'
const shafts = new URLSearchParams(window.location.search).get('rays') !== 'off'
const water = new URLSearchParams(window.location.search).get('water') !== 'off'
/* `?ink=off` -- the outlines cost a whole extra scene pass into a float target, and they are the
   single biggest thing separating this from the mockup, so they get the switch every other pass has
   for the same reason: the only honest way to price a pass is to boot the same build without it. */
const ink = new URLSearchParams(window.location.search).get('ink') !== 'off'
/* `?bloom=off` -- a quarter-res scene pass plus two blurs, and the only thing that makes a lantern
   read as a source rather than as a bright polygon. Its own switch for the same reason as the rest. */
const bloom = new URLSearchParams(window.location.search).get('bloom') !== 'off'
/* `?lamplight=off` -- two texture reads on every lit fragment in the valley, and the difference
   between a lantern that glows and one that lights the street it stands in. */
const lampLight = new URLSearchParams(window.location.search).get('lamplight') !== 'off'
/* `?cel=off` -- the same switch for the other half of the drawing, so the two can be priced and
   judged apart. Off, the world renders as the PBR materials GLTFLoader handed over. */
const cel = new URLSearchParams(window.location.search).get('cel') !== 'off'
/* AND THE OUTLINES STAND STILL WHEN THE FIGURES DO. The crowd's second prepass exists only to make
   its outlines follow the idle sway; with motion reduced there is no sway to follow, so the pass is
   simply not run. */
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
/* `?crowd=off` -- a thousand figures on a patched material, and the only honest way to price the
   patch is to boot the same build without it */
const people = new URLSearchParams(window.location.search).get('crowd') !== 'off'
/* `?walk=off` -- the footing grid is the one structure in this valley that is built out of raw
   triangles, so what it costs at boot has to be priceable without it */
const walking = new URLSearchParams(window.location.search).get('walk') !== 'off'
/* `?life=off` -- the boats, the ducks, the koi, the steam and the banners are one table and one
   tick, so they get one switch */
const alive = new URLSearchParams(window.location.search).get('life') !== 'off'
/* `?outfits=off` -- 0 puts every authored robe back, which is the A/B this exists for */
const dressed = new URLSearchParams(window.location.search).get('outfits') !== 'off'
/* `?birds=off` -- 107 instance matrices a frame, which is the whole of what they cost */
const flying = new URLSearchParams(window.location.search).get('birds') !== 'off'
/* `?petals=off` -- a few hundred transparent quads, which is the one thing here that touches the
   blend pipeline */
const shedding = new URLSearchParams(window.location.search).get('petals') !== 'off'
/* `?steam=off` -- and with it off the twelve authored columns are drawn again, which is what the
   town looked like before any of this */
const steaming = new URLSearchParams(window.location.search).get('steam') !== 'off'
/* `?flies=off` -- they only exist after dark, so this is the one switch whose without-arm is free
   for twelve hours of the day anyway */
const glowing = new URLSearchParams(window.location.search).get('flies') !== 'off'
/* `?sway=off` -- one patched material and a second outline pass over 17,291 plants, which is both
   the largest thing in the frame and the largest bill in it. Its own switch for the usual reason. */
const swaying = new URLSearchParams(window.location.search).get('sway') !== 'off'
/* `?wind=off` -- 44 transparent strokes and 160 matrices a frame, and the only thing in the valley
   that is the air rather than a thing in it */
const blowing = new URLSearchParams(window.location.search).get('wind') !== 'off'
/* `?landform=off` -- the crags and the welded mountain, which are geometry rather than a pass, so
   this is the one switch here whose cost is paid at boot and never again */
const landform = new URLSearchParams(window.location.search).get('landform') !== 'off'
/* `?crane=off` -- fourteen triangles and a pool of sprites, which is nothing, and the only thing in
   the frame that is not six thousand units away. Its own switch because it is the one object here
   that can be judged entirely on whether you want it. */
const craneOn = new URLSearchParams(window.location.search).get('crane') !== 'off'
/* `?breath=off` -- the held camera and the pointer lean. Off, this is the photograph it used to be,
   which is the comparison the effect exists to lose. */
const breathing = new URLSearchParams(window.location.search).get('breath') !== 'off'
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

/* ==================================================================================================
   THE AUTHORING AIDS, AND THIS IS THE ONE EXCEPTION TO "THE AUTHORED WORLD IS INVIOLABLE".

   Seven nodes — `Marker_Drills` through `Marker_Study` — share one 174-vertex mesh called
   `PROP_cam_block`, parked where the seven authored cameras were originally set from. They are a
   modelling aid: something to see and select in Blender, where otherwise there is only a camera
   gizmo. In this port they were seven blocks floating in the valley, and several of them land inside
   the menu's own frame — measured live, `inst:Marker_Drills` is an instanced set of seven, visible,
   toon-shaded, with members projecting at 11.3, 14.8, 6.4 and 4.8 pixels across.

   `ZEN_L3` / `ZEN_L4` join them: 30-unit cubes marking where the level-three and level-four cameras
   stand, whose local +X is the aim. They have polygons, so the exporter has no reason to skip them,
   and they arrive as two boxes sitting in the Zen court at head height.

   `Zen_Curve` joins them for a different reason: it is a Bezier the stepping-stone path was laid
   along. A curve with no bevel exports as a node that draws nothing — until somebody gives it a
   bevel to see it in Blender, at which point a black ribbon appears through the Zen court and nobody
   remembers why. Dropped by name now rather than discovered later.

   ANCHORED, DELIBERATELY, against the house style everywhere else in this file. The Meadow is a
   memorial row and this world can perfectly well come to hold a `Meadow_Props_Marker_001` that is a
   real stone; an unanchored match on "marker" would take it away and the loss would look like a
   modelling mistake rather than a rule. Only a top-level `Marker_` is the aid.

   AND REMOVED RATHER THAN HIDDEN, because `visible` is a frame property: hidden, they would still be
   seven obstacles in every bounding box, every heightfield sample and every reflection cull.

   BEFORE INSTANCING, which is the only window: `collapseToInstances` renames what it batches to
   `inst:<first member>`, so `^Marker_` stops matching the moment it has run. */
export const AUTHORING_AID = /^(Marker_|ZEN_L\d|Zen_Curve(\.|$))/

function dropAuthoringAids(root: Object3D): number {
  const bin: Object3D[] = []
  root.traverse((o) => { if (AUTHORING_AID.test(o.name)) bin.push(o) })
  for (const o of bin) {
    const mesh = o as Mesh
    if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose()
    o.parent?.remove(o)
  }
  return bin.length
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
/* ==================================================================================================
   THE NEAR PLANE IS THE DEPTH BUFFER'S PRECISION KNOB, AND THE AUTHORED ONE WAS THROWING IT AWAY.

   `Camera_MainMenu` comes out of Blender with near 5 and far 140,000, and this port used them as
   found. A 24-bit depth buffer resolves about z^2 / (near * 2^24) at distance z, so near 5 leaves
   1.19 units of slop at 10,000 out -- and the mockup, at near 20, leaves 0.30. Four times the slop,
   in a world whose roofs sit a few units off their ridges and whose snow caps sit on the cone under
   them: everything nearly-coplanar fights, and because the menu camera breathes a few units at rest
   the fight is resolved differently every frame. THAT IS THE FLICKER.

   20 is 0.8 m of clip distance at this world's 25 units to the metre -- closer than the camera ever
   comes to a surface -- and 60,000 still clears the sky dome, which is 46,000 out from an eye that
   never leaves 11,500 of the origin. The mockup measured the win: the share of pixels that flip
   under a 0.4-unit camera nudge falls from 0.20% to 0.08%, and 0.08% is what a purely antialiased
   silhouette gives, i.e. the fighting is gone rather than reduced.

   NOT `logarithmicDepthBuffer`: it needs every material to include three's logdepth chunks, and the
   ink, water and sky shaders here are hand-written and would silently stop agreeing with everything
   else about where they are.
   ================================================================================================== */
export const CAM_NEAR = 20
export const CAM_FAR = 60000

function clip(cam: PerspectiveCamera): void {
  cam.near = CAM_NEAR
  cam.far = CAM_FAR
}

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
    clip(cam)
    cam.updateProjectionMatrix()
    return cam
  }
  const cam = new PerspectiveCamera(38, aspect, CAM_NEAR, CAM_FAR)
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
  /* ==================================================================================================
     THE GRADE, AND IT IS A CSS FILTER ON THE CANVAS.

     The world renders through toon ramps and a hemisphere fill that both pull colour toward grey,
     and there is no post chain here to grade it in -- so the mockup puts it on the canvas element,
     where it costs nothing and applies to the reflection and the sky as well. Contrast comes up
     slightly with the saturation, because saturating alone flattens.

     THIS IS THE LAST PIECE OF "IT DOESN'T LOOK LIKE THE MOCKUP", and it hid for a long time behind
     a measuring mistake of mine. Reading the canvas back with `drawImage` samples the RAW framebuffer
     and a CSS filter is applied by the COMPOSITOR afterwards, so the two disagree: measured over the
     top of the frame, the mockup's live canvas came back at 72.1 against this build's 74.7 -- near
     enough identical -- while the same two frames as SCREENSHOTS were 56.6 and 82.2. Everything I
     chased before this (the day cycle, the dome's sidedness, the sky gain, the stars, the clouds,
     the lanterns) was real and needed fixing, but none of it was the 25 levels I was chasing: that
     was one line of CSS the port never had. */
  canvas.style.filter = 'saturate(1.34) contrast(1.05)'
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

  /* filled once every system is built -- see the note where it is assembled */
  const noReflect: Object3D[] = []

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
      /* ==================================================================================================
         AND THE DOME IS DRAWN FROM THE INSIDE, which it was not. Measured live: `side` came back 0 --
         FrontSide -- on a sphere 92,000 units across with the camera standing in the middle of it, so
         every one of its faces was culled and the dome contributed NOTHING to the frame. What looked
         like a sky was `scene.background`, painted flat with the fog colour, which is why it was one
         even purple with no horizon in it and why the grade, the gain and the stars all appeared to
         do nothing at all: they were being computed for a mesh that never reached a pixel.

         The other three come with it, and each has a job:
           `fog: false`      -- the sky is what the fog fades INTO. Fogging it fogs the fog.
           `depthWrite: false` and `renderOrder: -1` -- it is a backdrop, so it is drawn first and
                                writes no depth, and everything else is simply drawn over it.
         ================================================================================================== */
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      m.renderOrder = -1
      mats.forEach((mat) => {
        const sky = mat as Material & {
          side: number; fog: boolean; depthWrite: boolean; needsUpdate: boolean
        }
        sky.side = BackSide
        sky.fog = false
        sky.depthWrite = false
        sky.needsUpdate = true
        gradeSky(mat)
      })
    } else {
      console.warn('[valley] no SkyDome found in the world; the sky will be flat')
    }
  }

  /* BEFORE INSTANCING, because instancing renames what it batches — see `dropAuthoringAids` */
  const aids = dropAuthoringAids(root)
  if (aids) console.info(`[valley] dropped ${aids} authoring aids (camera blocks, level markers)`)

  const tInst0 = performance.now()
  const { before, after } = collapseToInstances(root)
  const instanceMs = performance.now() - tInst0

  /* ==================================================================================================
     THE WORLD BECOMES A DRAWING, AND IT HAPPENS HERE, BEFORE ANYTHING HOLDS A MATERIAL.

     `celWorld` REPLACES every material on every mesh. Five systems in this file capture material
     references and then write to them for the rest of the run -- the lanterns scale their emission
     by `lampOn`, the windows keep their own bedtimes, the night bake sets `lightMapIntensity`, the
     crowd patches an idle displacement in, the wardrobe recolours per instance. Every one of those
     collected BEFORE this ran would be holding a material that is no longer on any mesh: the writes
     land, nothing errors, and the lanterns simply never light. Measured exactly that way once --
     the festival went dark between the frame before this call and the frame after it.

     So it goes immediately after instancing, which is the last thing that touches the graph, and
     before `letLightThrough` and every build below.
     ================================================================================================== */
  if (cel) {
    const st = celWorld(root)
    console.info(
      `[valley] cel: ${st.materials} materials over ${st.meshes} meshes `
      + `(${st.landform} on the smooth landform ramp, ${st.emissive} carrying an emission)`,
    )
  }

  /* THE SKYLINE, BEFORE ANYTHING READS THE GROUND OR THE MOUNTAIN. `bakeHeightfield` walks these
     same triangles and `findFujiPeak` walks Fuji's, so cragging afterwards would leave the walkers
     standing on the shape the ranges used to be. And `freeCpuCopiesAfterUpload` nulls every
     position array once the GPU has them, which is the window this whole block lives in. */
  if (landform) {
    const st = buildLandform(root)
    landformStats = st
    console.info(
      `[valley] landform: ${st.ranges} ranges ${st.trisBefore} -> ${st.trisAfter} triangles, `
      + `${st.fuji} mountain welded, ${st.welded} vertices, ${st.ms} ms`,
    )
  }

  letLightThrough(root)

  const camera: PerspectiveCamera = pickCamera(root, window.innerWidth / Math.max(1, window.innerHeight))

  /* COMPOSE THE STANDING POINT; DO NOT LOOK IT UP. See the note by HOME_EYE in `flight.ts` for why
     the authored `Camera_MainMenu` is the wrong answer even though it is the obvious one -- in
     short, every route in `flights.json` was flown from the composed point, so standing anywhere
     else makes the curve solved through each route's middle meaningless. */
  {
    aspect = window.innerWidth / Math.max(1, window.innerHeight)
    /* ==================================================================================================
       SOLVED THROUGH THE LENS THAT WILL BE DRAWN, NOT THE ONE THAT WAS AUTHORED.

       `aimAt` composes the standing shot by working out where the camera has to look for Fuji to land
       at a stated place in the frame, and below 16:9 the frame it lands in is not the frame the
       authored fov describes — see `fittedFov`. At 16:9 these are the same number, which is why this
       has never shown up on a maximised window and would have shown up on every other one.

       THE SUN GOES THROUGH THE SAME NUMBER, for the same reason and one more: it is placed by frame
       composition too, and a sun composed through a different lens than the mountain is a sun that
       drifts off the peak the moment the window is not 16:9. `homeFov` is captured once here and used
       for every re-placement on the day beat, so the two can never come apart.
       ================================================================================================== */
    const homeFov = fittedFov(HOME_FOV, aspect)
    const homeTgt = aimAt(fujiPeak, HOME_EYE, homeFov, aspect, FUJI_FRAME_U, FUJI_FRAME_V)
    Object.assign(home, {
      px: HOME_EYE[0], py: HOME_EYE[1], pz: HOME_EYE[2],
      tx: homeTgt.x, ty: homeTgt.y, tz: homeTgt.z,
      fov: HOME_FOV, roll: 0,
    })
    Object.assign(cam, home)
    camera.position.set(cam.px, cam.py, cam.pz)
    camera.aspect = aspect
    camera.fov = homeFov
    camera.updateProjectionMatrix()
    camera.lookAt(homeTgt)

    /* THE SUN GOES WHERE THE COMPOSITION PUTS IT -- middle of the frame, 30% down from the top,
       50,000 out so it stands behind Fuji rather than inside it -- and then everything else takes
       its bearing from that one point: the key light, the sky's two scattering lobes, and the disc
       you can actually see. A sun placed by coordinate is a sun nobody composed. */
    /* the home framing is KEPT, because the sun is composed against it rather than against
       wherever the camera has flown to -- see SUN_ARC */
    homeAim = homeTgt.clone()
    homeAspect = aspect
    homeFovFit = homeFov
    sunAt = placeSun(HOME_EYE, homeTgt, homeFovFit, aspect)
    rig = installRig(scene, sunAt)
    sunDisc = makeSunDisc()
    sunDisc.position.copy(sunAt)
    sunDisc.layers.set(ATMOS_LAYER)
    scene.add(sunDisc)
    moonDisc = makeMoonDisc()
    moonDisc.layers.set(ATMOS_LAYER)
    moonDisc.visible = false
    scene.add(moonDisc)
    glowBody = sunDisc
    /* the main camera sees the world AND the atmosphere; the mask pass turns this one off */
    camera.layers.enable(ATMOS_LAYER)
    /* THE RING IS CENTRED ON THE VALLEY, NOT ON THE CAMERA. Anchoring it to the eye would make it a
       skybox -- clouds that never move relative to you, which is exactly the flat-gradient problem
       one step further out. Centred on the world, a flight across 11,000 units genuinely slides
       them against the mountains, which is the whole reason to make them geometry. */
    clouds = buildClouds(scene, new Vector3(0, 0, 0))
    /* the water and its mirror. `?water=off` because a second full scene render is the one
       thing in this valley that can be measured out of a slow machine's budget. */
    if (water) { lake = buildLake(scene); mirror = createReflection() }

    /* THE AIR GOES ON AFTER THE SUN IS PLACED, because the cover's projection is the sun's own
       direction -- patch first and the shadows fall from wherever the uniform happened to start.
       The sky dome is skipped for the same reason it is skipped by the shafts: it is not a surface
       in the valley, it is the backdrop, and misting it would fog the fog. */
    /* BEFORE THE AIR, and the ordering is not a preference -- see `buildLanterns`. Cloning a
       material after `breathe` has patched it copies the flag and not the patch, which would give
       every lantern a hole in the mist around it. */
    /* THE GROUND, IN THE ONE WINDOW THERE IS FOR IT. `freeCpuCopiesAfterUpload` nulls every
       position array after the first render, so this shares its slot with `findFujiPeak` -- and
       the walk that comes later finds nothing and fails silently, which is exactly how that one
       broke once already. */
    const tGround = performance.now()
    ground = bakeHeightfield(root)
    console.info(
      `[valley] ground: ${ground.stats.cells} cells, ${ground.stats.holes} filled, `
      + `y ${Math.round(ground.stats.min)}..${Math.round(ground.stats.max)}, `
      + `${Math.round(performance.now() - tGround)} ms`,
    )

    /* THE TREELINE, THE FRUSTUM AND THE MIRROR'S CULL, in one walk over every instance matrix in
       the world -- see `forest.ts`. AFTER `buildLandform`, which rebuilds the ranges' geometry, so
       the bounding spheres it computes are of the shape that will actually be drawn; and inside the
       same window as everything else here, because it reads positions. */
    forest = buildForest(root, lakeCentre())
    console.info(
      `[valley] forest: ${forest.tinted} sets given a treeline, ${forest.culled} sets now `
      + `frustum-culled; the mirror skips ${forest.farCut} far stands and ${forest.smallCut} `
      + `small things (${(forest.savedTris / 1000).toFixed(0)}k triangles a pass), ${forest.ms} ms`,
    )

    lanterns = buildLanterns(root)
    /* A BOOT LINE, BECAUSE ITS ABSENCE IS WHAT HID A DEAD SYSTEM. Every other build here reports
       what it found and this one never did -- so when `cel.ts` changed the material class out from
       under its `isMeshStandardMaterial` guard, every lantern in the valley stopped being found and
       nothing said so. The town went dark and the only trace was a per-pixel comparison showing
       this build BRIGHTER than the mockup while visibly having fewer lights in it. */
    console.info(
      `[valley] lanterns: ${lanterns.mats.length} materials over ${lanterns.meshes} meshes, `
      + `${lanterns.spots.length} flames`
      + (lanterns.moving.length ? ` and ${lanterns.moving.length} that travel` : '')
      + (lanterns.authored
        ? ', all of them from EMIT materials — the .blend is authoritative'
        : ' — no EMIT materials in this file, so the name rules are doing the guessing')
      + `, ${lanterns.ms} ms`,
    )
    /* and the same meshes are what bleeds -- see `bloom.ts` */
    if (bloom) bloomTrack(lanterns.lit)
    /* AND THE SAME FLAMES ARE WHAT LIGHTS THE TOWN. Built from the positions the lantern walk has
       already collected, before `breathe` goes round -- the block it adds reads these two textures,
       and a material compiled before they exist samples nothing. */
    if (lampLight) {
      lampGrid = buildLampGrid(lanterns.spots)
      if (lampGrid) {
        console.info(
          `[valley] lamp light: ${lampGrid.lamps} lamps in a ${lampGrid.data[0]}x${lampGrid.data[1]}`
          + ` table, ${lampGrid.grid}x${lampGrid.grid} grid over ${lampGrid.span[0]}x${lampGrid.span[1]}`
          + ` units, ${lampGrid.ms} ms`,
        )
      }
    }
    /* the bake is a NIGHT layer and comes up exactly as the lanterns do */
    nightMap = buildNightMap(root)

    ATMOS_U.uCoverMap.value = coverTex = makeCoverTexture()
    aimCover(sunAt)
    root.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh || /skydome/i.test(o.name)) return
      const land = LANDFORM.test(o.name)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => breathe(m, land))
    })

    /* AND THE FLAMES BREATHE, for the same reason and in the same place as the windows: `breathe`
       has just been round every material, so a patch that CHAINS has to come after it. */
    if (lanterns) for (const l of lanterns.mats) flameFlicker(l.mat)

    /* AFTER THE AIR, and that ordering is the opposite of the lanterns' for the opposite reason:
       `windowLife` CHAINS onto whatever `onBeforeCompile` is already there, so it has to find
       `breathe`'s. Run first, it would be overwritten and the town would keep one bedtime. */
    windows = buildWindows(root)
    console.info(`[valley] windows: ${windows.spots} on ${windows.meshes} meshes`)

    /* AND THE PEOPLE, on the same side of `breathe` and for the same reason: the idle chains onto
       that hook rather than replacing it. */
    if (people) {
      crowd = buildCrowd(root)
      /* the figures go on their own layer so the prepass can render just them, with the same idle
         displacement their lit material has -- see the note in `ink.ts` */
      if (ink) inkTrackCrowd(crowd.meshes)
      console.info(
        `[valley] crowd: ${crowd.figures} figures on ${crowd.meshes.length} meshes, `
        + `${crowd.models.length} models, ${crowd.lifted} lifted out of the ground`,
      )
      /* AND SOME OF THEM WALK. They borrow the crowd's geometries, so this has to come after it --
         and it is still inside the one window before the first render, because the footing grid it
         builds reads the same position arrays the bake does. */
      if (walking) {
        const tWalk = performance.now()
        walkers = buildWalkers(scene, root, crowd, ground)
        if (walkers) {
          console.info(
            `[valley] walkers: ${walkers.people} on ${walkers.loops.length} loops `
            + `(${walkers.loops.map((L) => `${L.spec.n} ${Math.round(L.len)}u`).join(', ')}); `
            + `footing ${walkers.footing.ground.tris} ground + ${walkers.footing.deck.tris} deck `
            + `triangles in ${walkers.footing.ground.cells} cells `
            + `(${walkers.footing.ground.walls + walkers.footing.deck.walls} walls dropped, `
            + `${(((walkers.footing.ground.tris + walkers.footing.deck.tris) * 36) / 1048576).toFixed(1)} MB), `
            + `${Math.round(performance.now() - tWalk)} ms`,
          )
        }
      }
    }

    /* AND THE TREES, on the same side of `breathe` as the crowd and for the same reason: the sway
       chains onto that hook rather than replacing it, and its bake reads the position arrays that
       the first render is about to free. The heights in the line are WORLD units reconstructed from
       each plant's transform -- see `sway.ts` for why they cannot simply be read off the geometry
       in this build. */
    if (swaying) {
      sway = buildSway(root)
      /* the plants go on their own layer so the prepass can render just them, with the same
         displacement their lit material has -- the crowd's arrangement exactly */
      if (ink) for (const m of sway.meshes) m.layers.enable(SWAY_LAYER)
      console.info(
        `[valley] sway: ${sway.plants} plants on ${sway.meshes.length} meshes, `
        + `${sway.geos} geometries baked, ${sway.heights[0]}..${sway.heights[1]} units tall`,
      )
    }

    /* AND THE AIR THEY ARE BENDING IN. After the sway, because it borrows the same wind vector --
       one Vector3 behind both, so the trees and the strokes can never disagree about the weather. */
    if (blowing) {
      wind = buildWind(scene)
      if (wind) {
        console.info(`[valley] wind: ${wind.shown} wisps drawn out of a pool of ${wind.pool}`)
      }
    }

    /* AND THE STANDING WATER. After `celWorld`, which is what put a matte toon material on it, and
       after the lake, whose material and mirror the garden pond borrows. */
    if (water) {
      ponds = buildPonds(root, lake?.material ?? null)
      console.info(
        `[valley] ponds: ${ponds.garden.length} on the lake's own material, `
        + `${ponds.pools.length} bath ${ponds.pools.length === 1 ? 'surface' : 'surfaces'} `
        + `on the garden-scale shader`,
      )
    }

    /* AND EVERYTHING ELSE THAT WAS STILL: the boats, the ducks, the koi, the monkeys, the steam and
       the banners. LAST, because the boats sail a coast measured off the heightfield and their
       passengers wear the walkers' un-idled material -- both of which have to exist first. */
    if (alive) {
      const shore = ground && lake ? lakeShore(ground.at) : null
      life = buildLife(scene, root, crowd, shore, walkers?.material ?? null)
      console.info(
        `[valley] life: ${life.items} props moving, ${life.boats} boats with ${life.riders} `
        + `aboard, ${life.wakes} wakes, ${life.moored} moored`
        + (shore ? `; shore ${Math.round(shore.min)}..${Math.round(shore.max)} units out` : ''),
      )
      /* AND THE LANTERNS THEY CARRY GET A LIGHT. After the boats, because it reads the weld they
         set up; and it is the reason `lanterns.moving` exists -- see `boatlamp.ts`. */
      boatLamps = buildBoatLamps(life)
      if (boatLamps) {
        console.info(
          `[valley] boat lamps: ${boatLamps.lamps} of ${MOVE_LAMPS} moving slots`
          + (boatLamps.merged ? `, ${boatLamps.merged} second primitives dropped` : ''),
        )
      }
    }

    if (flying) {
      birds = buildBirds(root)
      console.info(`[valley] birds: ${birds.birds} on ${birds.meshes.length} meshes`)
    }

    /* AFTER THE WALKERS, because the knots stand on the footing grid they build, and after the
       lanterns, because a firefly is only a firefly away from a flame. */
    if (glowing && ground) {
      fireflies = buildFireflies(
        scene, walkers?.footing.at ?? ground.at, ground.at, lanterns?.spots ?? [],
      )
      console.info(
        `[valley] fireflies: ${fireflies.flies} in ${fireflies.knots.length} knots, `
        + `${fireflies.distances.join('/')} units from their own eye`,
      )
    }

    if (steaming) {
      steam = buildSteam(scene, root)
      console.info(
        `[valley] steam: ${steam.puffs} puffs over ${steam.vents} vents `
        + `(${steam.fromProps} of them the authored columns, now hidden); `
        + Object.entries(steam.found).map(([k, v]) => `${k} x${v}`).join(', '),
      )
    }

    if (shedding) {
      petals = buildPetals(scene, root)
      console.info(
        `[valley] petals: ${petals.petals} off ${petals.sources} trees `
        + `(${petals.nearSources} of them near a camera stop)`,
      )
    }

    /* AND THEY ARE NOT ALL WEARING THE SAME THING. Last of everything, because it dresses the
       walkers and the boats' passengers as well as the standing crowd -- those are crowd geometries
       on meshes of their own, and a passenger in the authored slate next to a walker in twenty-two
       colours is worse than either alone. */
    if (crowd && dressed) {
      const wardrobe = buildOutfits([
        ...crowd.meshes, ...(walkers?.meshes ?? []), ...(life?.riderMeshes ?? []),
      ])
      console.info(
        `[valley] wardrobe: ${wardrobe.figures} dressed across ${wardrobe.models} models `
        + `(skin and hair off ${wardrobe.from}; matched in ${wardrobe.found.skin} and `
        + `${wardrobe.found.hair})`,
      )
    }
    /* THE NEAR FIELD, AND IT IS THE ONLY THING HERE THAT IS NOT IN THE VALLEY -- see `crane.ts`.
       Added to the one scene rather than to a second one: the port has a single render per frame,
       and at four hundred units from an eye whose near plane is twenty, the depth buffer sorts it
       correctly against a world that starts thousands of units further out. */
    if (craneOn) crane = buildCrane(scene, reduced)

    /* AND THE EYE ITSELF MOVES. Built last because it owns a pointer listener and nothing before
       this point could have used it. */
    viewpoint = createViewpoint(reduced || !breathing)

    /* ==================================================================================================
       EVERYTHING THE MIRROR IS NOT ASKED TO DRAW, GATHERED IN ONE PLACE.

       Three unrelated reasons end up in the same list, which is why it is assembled here rather than
       owned by any of them:
         - the far forest and the ground clutter, because they cannot read at 832 by 468 (`forest.ts`)
         - anything wearing the lake's own material, because a surface that samples `tReflect` drawn
           INTO `tReflect` is a feedback loop (`pond.ts`)
         - the crane, because it is four hundred units from the eye (`crane.ts`)

       AND THE PASS PUTS BACK WHAT WAS THERE RATHER THAN `true`, which is `reflection.ts`'s own
       hardest-won line: a per-frame writer of a shared flag has to be a stack, or the loader's
       "hide what this replaces" lasts exactly one frame.
       ================================================================================================== */
    noReflect.push(
      ...(forest?.noReflect ?? []),
      ...(ponds?.hideFromMirror ?? []),
      ...(crane?.hide ?? []),
    )

    sizeShafts(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    sizeInk(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    sizeBloom(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    /* the first write, before the first frame, so nothing is ever seen at the wrong hour */
    fogBase = FOG_DENSITY
    if (rig) applyDay(scene, renderer, rig, sunNow(), fogBase)
    lastDayAt = performance.now()
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
    /* THE ONE PLACE THE WINDOW'S SHAPE IS READ. The frame loop needs it every tick to fit the lens
       and `innerWidth` forces a layout flush, so it is held rather than asked for -- see `aspect`. */
    aspect = window.innerWidth / Math.max(1, window.innerHeight)
    camera.aspect = aspect
    camera.fov = fittedFov(cam.fov, aspect)
    camera.updateProjectionMatrix()
    sizeShafts(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    sizeInk(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    sizeBloom(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2))
    /* the first write, before the first frame, so nothing is ever seen at the wrong hour */
    fogBase = FOG_DENSITY
    if (rig) applyDay(scene, renderer, rig, sunNow(), fogBase)
    lastDayAt = performance.now()
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
  /* kept apart from `last`: `last` is the clock the world moves on and only advances on a frame
     that is worked, while this one ticks on every vsync so the pacer can measure the display */
  let lastRaf = last
  /* the loop's own clock in seconds, capped the same way every step is, so a stall slows the world
     rather than teleporting it. Kept apart from `performance.now()` for exactly that reason. */
  let clock = 0
  /* the mirror runs on every other frame -- see the note where it is rendered */
  let mirrorTick = 0
  const _aim = new Vector3()
  /* WHEN A FRAME WILL NOT FIT IN A VSYNC, TAKE TWO OF THEM. The cadence is what reads as smooth,
     not the rate -- see `pacing.ts`. This does nothing at 60 Hz. */
  const pacer = makePacer(paced)
  const frame = () => {
    raf = requestAnimationFrame(frame)
    const now = performance.now()
    /* the raw interval goes to the pacer whether or not this frame is worked, because rAF keeps
       firing at the display's rate and that is the only clean read of what the display's rate IS */
    if (!pacer.due(now - lastRaf)) { lastRaf = now; return }
    lastRaf = now
    const dt = Math.min(now - last, MAX_STEP_MS)
    last = now
    /* the twinkle's own clock. Seconds, and it simply accumulates -- a star's phase is its cell's
       hash, so nothing here has to survive a reload. */
    clock += dt / 1000
    SKY_U.uTime.value += dt / 1000
    /* the flames' own clock. `lampOn` is written on the day beat; this is what makes them move
       between beats. Stopped under reduced motion with the rest of the moving things -- see the
       note further down this loop. */
    if (!reduced) flickerTick(dt / 1000, lampNow)
    /* the same clock and the same two sines, written into the lamps' own strengths -- see
       `lampgrid.ts`. One source, so the flame and the pool it casts can never disagree. */
    lampGrid?.flicker(FLICKER.t.value * FLICKER.rate.value, FLICKER.amt.value, lampNow)
    /* AFTER `life.tick` HAS MOVED THE HULLS, which is further down this same loop -- so a boat lamp
       is one frame behind its boat. At 16 ms and the speed a boat sails that is under a unit, and
       the alternative is splitting the life tick in two to put the weld before the light. */
    if (!reduced) boatLamps?.tick(FLICKER.t.value * FLICKER.rate.value, FLICKER.amt.value, lampNow)

    if (live) {
      live.elapsed += dt / 1000
      const p = Math.min(1, live.elapsed / live.flight.dur)
      live.flight.sample(easeInOutSine(p), cam)
      /* THE DESTINATION ASSEMBLES AS A FRACTION OF THE MOVE, not at a fixed time, so the pacing
         holds whether the flight is 1.6 seconds or 4.6. */
      if (live.onOpen && p >= live.openAt) { const open = live.onOpen; live.onOpen = null; open() }
      /* AND IT COMES BACK ON ARRIVAL, not when the screen opens. `onOpen` fires at 82% -- the board
         is assembling while the eye is still moving -- so clearing the class there would bring the
         chrome back into a frame that is still travelling. */
      if (p >= 1) { const land = live.onLand; live = null; inFlight(false); land?.() }
    }

    /* THE SUN AS THE SKY SEES IT is a direction FROM THE EYE, so the scattering lobes stay put
       when the camera flies and swing when it turns. */
    if (sunAt) {
      _eye.set(cam.px, cam.py, cam.pz)
      updateSkyDir(sunAt, _eye)
      if (sunDisc) faceSun(sunDisc, _eye)
      if (moonDisc?.visible) faceSun(moonDisc, _eye)
    }

    /* ==================================================================================================
       WHAT STOPS FOR `prefers-reduced-motion`, AND WHAT DOES NOT.

       This was two lines — the sway and the wind — while the crowd, the walkers, the boats, the
       birds, the petals, the fireflies, the flames and the boat lanterns all went on moving. That is
       not a partial implementation of the setting, it is the setting not being implemented: someone
       who asks for reduced motion and gets a valley full of walking people has been told no.

       The list is the mockup's own, and the split in it is worth stating because it is not "turn
       everything off". What stops is anything that TRAVELS — a figure crossing the frame, a boat, a
       bird, a falling petal, a drifting cloud. What continues is anything that is a SURFACE changing
       in place: the water's ripple, the town's steam, a window's bedtime, and the day itself. Those
       carry no motion vector across the frame and stopping them would make the valley a photograph
       for no benefit to anybody.

       THE FLAMES STOP TOO, which is the least obvious member of the list and is the mockup's call:
       879 flickering points is a lot of small motion, and a lantern that is simply lit reads as lit.
       ================================================================================================== */
    const still = reduced
    /* the sky drifts on the same capped clock as everything else, so a dropped frame slows the
       weather rather than teleporting it */
    if (clouds && !still) clouds.drift(dt / 1000)
    /* and the cover creeps with them, on the same clock */
    driftCover(dt / 1000)
    windows?.tick(dt / 1000)
    lake?.tick(dt / 1000)
    if (!still) crowd?.tick(dt / 1000)
    if (!still) walkers?.tick(dt / 1000)
    if (!still) life?.tick(dt / 1000)
    if (!still) birds?.tick(dt / 1000)
    if (!still) petals?.tick(dt / 1000)
    steam?.tick(dt / 1000)
    if (!still) fireflies?.tick(dt / 1000)
    /* THE WIND'S OWN CLOCK, and one line rather than a walk: every plant's phase comes off its
       own position in the shader, so seventeen thousand of them move on a single float. */
    if (!still) swayTick(dt / 1000)
    ponds?.tick(dt / 1000)
    if (!still) wind?.tick(dt / 1000)

    /* THE DAY IS RE-EVALUATED EVERY FEW SECONDS, NOT EVERY FRAME. The sun moves a quarter of a
       degree a minute; at that rate a two-second beat is thirty times finer than anything the
       eye can catch, and each pass writes twenty uniforms and dirties the shadow map. */
    if (rig && now - lastDayAt > DAY_BEAT_MS) {
      lastDayAt = now
      applyDay(scene, renderer, rig, sunNow(), fogBase)
    }

    /* ==================================================================================================
       THE CAMERA IS COMPOSED FROM THREE THINGS, NOT ONE.

       `cam` is the authored pose — where the menu stands, or where a flight has got to. On top of it
       go the eye's own small movements: the held breath, the pointer lean, and the knock a refused
       press gives the frame. All three are one offset, written by `viewpoint.ts`, so nothing here has
       to know which of them is currently non-zero.

       AND THE LENS IS FITTED RATHER THAN AUTHORED — see `fittedFov`. Below 16:9 the authored vertical
       field crops the sides of a composition that was made against 16:9; the fitted one opens the
       vertical instead and holds every edge the interface is placed against.
       ================================================================================================== */
    viewpoint?.tick(dt / 1000)
    const vpe = viewpoint?.eye
    const vpa = viewpoint?.aim
    camera.position.set(cam.px + (vpe?.x ?? 0), cam.py + (vpe?.y ?? 0), cam.pz)
    const fov = fittedFov(cam.fov, aspect)
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
    _aim.set(cam.tx + (vpa?.x ?? 0), cam.ty + (vpa?.y ?? 0), cam.tz)
    camera.lookAt(_aim)
    if (cam.roll) camera.rotateZ(MathUtils.degToRad(cam.roll))

    /* AFTER the camera is where it is going to be, because the crane's whole placement is solved by
       unprojecting a point in the frame — a tick before this composes it against last frame's eye,
       which at rest is a few units out and mid-flight is hundreds. */
    crane?.tick(dt / 1000, clock, camera, flownTo !== null)
    /* WHERE THE SUN IS ON SCREEN IS ASKED ONCE, HERE, because both the mask pass and the overlay
       need it and the mask pass is skipped outright when the answer is "nowhere". */
    if (glowBody && shafts) {
      updateSunUv(glowBody, camera)
      /* THE SKY MASK IS A WHOLE SCENE PASS, so it goes before the shadow flag is raised rather
         than after it -- a pending build would otherwise land in this pass instead of the real
         one, which is exactly how the mockup lost every shadow in the valley. */
      renderSkyMask({ renderer, scene, camera, disc: glowBody })
    }

    /* THE OUTLINES' PREPASS IS A WHOLE SCENE PASS TOO, and it goes in the same place and for the
       same reason as the two below it: before the shadow flag is raised, so a pending shadow build
       cannot land in this render instead of the real one. */
    if (ink) {
      renderND(renderer, scene, camera, crowd?.meshes ?? [], !reduced,
        sway?.meshes ?? [], !reduced)
    }

    /* ==================================================================================================
       THE MIRROR IS A WHOLE SCENE PASS, so it goes before the shadow flag is raised rather than after
       it -- a pending build would otherwise land in the reflection instead of the real one, which is
       exactly how the mockup lost every shadow in the valley. Same reason as the sky mask above, and
       the two now sit together.

       AND IT HAS TWO GATES THIS PORT LOST, both of which are the mockup's:

         - EVERY OTHER FRAME. A reflection is read through two scrolling normal maps at 832 by 468; a
           frame of latency in it is not observable, and the pass is about a third of the frame's cost.
           It is the single cheapest thing in this file that nobody can see.
         - AT THE MENU OR MID-FLIGHT, AND NOT WHILE STANDING AT A DESTINATION. Every arrival in this
           valley composes a shot of a place, and the lake is in none of them at a size where a
           reflection reads -- but it is in FRAME, so the pass's own early-out (is there water on
           screen) fired exactly zero times in 1,620 measured frames and never will. The question the
           early-out asks is the wrong one; this is the right one.
       ================================================================================================== */
    const mirrorWanted = flownTo === null || live !== null
    if (lake && mirror && mirrorWanted && (mirrorTick++ & 1) === 0) {
      mirror.render(renderer, scene, camera, lake.mesh, noReflect)
    }

    /* and the shadow build goes HERE, in the last gap before the render -- see `shadowDirty` */
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false }
    renderer.render(scene, camera)

    /* THE INK GOES ON OVER THE FINISHED FRAME, and before the glow: the outlines belong to the
       world's surfaces, the glow belongs to the air in front of them, so a shaft crossing a roofline
       should wash over the line rather than under it. */
    if (ink) renderInk(renderer)

    /* THE BLEED GOES ON AFTER THE OUTLINES AND BEFORE THE GLOW. A lantern's outline is part of the
       lantern, so the bleed washes over it the way it washes over the paper; the sun's halo is the
       air in front of everything and goes last. */
    if (bloom) renderBloom(renderer, scene, camera)

    /* the glow goes on OVER the finished frame, so the main render still goes straight to the
       canvas and nothing about the colour path changes */
    if (glowBody && shafts) renderGlow({ renderer, scene, camera, disc: glowBody })

    /* AND WHAT THAT COST, which is the only input the pacer has. Wall clock rather than a GPU timer
       query on purpose: `renderer.render` returning late because the driver is holding it is
       exactly the condition being paced for, and a timer query would not see it. */
    pacer.spent(performance.now() - now)
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
      /* a torn-down valley must not leave the interface hidden -- see `inFlight` */
      inFlight(false)
      if (rig) { scene.remove(rig.key, rig.key.target, rig.fill, rig.fill.target, rig.hemi); rig = null }
      if (sunDisc) { scene.remove(sunDisc); sunDisc = null }
      if (moonDisc) { scene.remove(moonDisc); moonDisc = null }
      glowBody = null
      sunAt = null
      disposeInk()
      disposeBloom()
      clouds?.dispose()
      clouds = null
      lanterns = null
      lampGrid = null
      nightMap?.dispose()
      nightMap = null
      windows = null
      crowd = null
      walkers?.dispose()
      walkers = null
      life?.dispose()
      life = null
      birds = null
      petals?.dispose()
      petals = null
      steam?.dispose()
      steam = null
      fireflies?.dispose()
      fireflies = null
      ground = null
      lake?.dispose()
      lake = null
      mirror?.dispose()
      mirror = null
      wind?.dispose()
      wind = null
      crane?.dispose()
      crane = null
      viewpoint?.dispose()
      viewpoint = null
      forest = null
      /* the world's own meshes go with `root`; these are the three that hold state OUTSIDE it --
         a material of their own, or a list of the world's meshes that must not outlive it */
      ponds?.material?.dispose()
      ponds = null
      sway = null
      boatLamps = null
      coverTex?.dispose()
      coverTex = null
      disposeShafts()
      renderer.dispose()
      canvas.remove()
      handle = null
    },
  }
  /* the menu can fly from here on. Registered AFTER `handle`, because both calls check it. */
  registerFlights({ flyToSection: flyToSectionImpl, flyHome: flyHomeImpl, isFlying: isFlyingImpl })

  ;(window as unknown as { __VALLEY__?: ValleyMarks }).__VALLEY__ = marks
  /* ==================================================================================================
     A HANDLE ON THE LIVE SCENE, AND IT EARNED ITS PLACE.

     The sky was drawn FrontSide on a sphere the camera stands inside, so the dome contributed nothing
     to any frame and what looked like a sky was `scene.background` painted flat with the fog colour.
     That survived the whole port. It survived because nothing about the running world could be
     ASKED anything: every diagnosis had to be made by reading source and guessing, and the guesses
     were wrong three times running -- the day palette, then the sky shader, then the camera's layer
     mask -- while the actual answer was one boolean that a single query would have printed.

     So the renderer, the scene and the camera are reachable. `__VALLEY__` has always carried the
     load marks; this carries the thing they are marks ABOUT. It costs three references. */
  ;(window as unknown as { __VALLEY_SCENE__?: unknown }).__VALLEY_SCENE__ = {
    scene, camera, renderer,
    /* WHAT THE LOOP IS DOING WITH THE DISPLAY -- `divisor()` is 1 when every vsync is rendered and
       2 when every other one is, and `vsync()` is the interval it measured. Reachable for the same
       reason as everything else here: a cadence that has to be inferred from frame times is a
       cadence that gets argued about instead of read. */
    pacer,
    /* THE POSE THE CAMERA IS DRIVEN FROM, writable. The frame loop composes the camera out of this
       every tick, so setting `camera.position` does nothing and setting this does -- which is what a
       harness needs to put this build and the mockup at the SAME standing point before comparing
       what they draw. They do not share one by default: the mockup's menu is an authored eye and
       this composes its own so Fuji lands at a stated place in the frame, and until both were read
       out loud nobody had noticed they were different shots of the same valley. */
    pose: cam,
    /* the sky's own uniforms, so any one of them can be turned over on the running build and the
       answer read off the frame rather than argued from the source */
    sky: SKY_U,
    /* AND THE LAMPS', FOR THE SAME REASON AND A SHARPER ONE. Every system here has an `?x=off`
       switch, but a switch costs a RELOAD -- and a reload puts the boats, the walkers and the
       crowd somewhere else, so the two frames being compared differ by everything that moved
       while the world was loading as well as by the thing under test. Measuring the six boat
       lanterns that way put their contribution at 95 pixels with an unknown error bar around it.
       Reachable uniforms mean the A and the B are the same frame of the same run. */
    lamps: LAMP_U,
    glow: glowNow,
    /* and the four systems that came last, each of which has something worth asking */
    live: () => ({
      sway: sway && { plants: sway.plants, meshes: sway.meshes.length, heights: sway.heights },
      wind: wind && { pool: wind.pool, shown: wind.shown, visible: wind.mesh.visible },
      ponds: ponds && { garden: ponds.garden.length, pools: ponds.pools.length },
      boatLamps: boatLamps && { lamps: boatLamps.lamps, live: LAMP_U.uMoveN.value },
      landform: landformStats,
      forest: forest && {
        tinted: forest.tinted, culled: forest.culled,
        noReflect: noReflect.length, savedTris: forest.savedTris,
      },
      lanterns: lanterns && {
        flames: lanterns.spots.length, meshes: lanterns.meshes, authored: lanterns.authored,
      },
      crane: crane ? { at: crane.group.position.toArray().map(Math.round) } : null,
      view: viewpoint && { eye: viewpoint.eye.toArray(), fov: fittedFov(cam.fov, aspect) },
    }),
    /* AND THE DAY, which is what everything else is a function of. The sky's brightness, the
       lanterns, the stars, the fog and the moon are all keyed on one number -- the sun's altitude
       -- and until this was reachable the only way to ask what it was was to infer it backwards
       from a pixel. */
    /* THE REFUSAL, REACHABLE. The menu calls this when it declines a press -- see `refuse` there --
       and it is on the debug handle for the same reason everything else here is: it can be fired at
       a running build and watched, rather than argued about from the source. */
    punch: (s = 1) => viewpoint?.punch(s),
    day: () => {
      const sun = sunNow()
      return {
        site, alt: +sun.alt.toFixed(2), altMax: +sun.altMax.toFixed(2),
        p: +sun.p.toFixed(3), H0: +sun.H0.toFixed(4),
        clock: +(new Date().getHours() + new Date().getMinutes() / 60).toFixed(2),
        skyGain: SKY_U.uGain.value, stars: SKY_U.uStars.value, expo: renderer.toneMappingExposure,
      }
    },
  }
  return marks
}

/* ==================================================================================================
   ONE PALETTE, WRITTEN OUT EVERYWHERE. Everything the sun touches reads from a single interpolated
   row: the three lights, the fog and its colour, the exposure, the sky's horizon/zenith and its two
   scattering lobes, the shafts' three amounts, the sun disc, the clouds' underside, and the one
   number the chrome uses to decide how much sky it can hold itself up with.

   THE MIST IS NOT A COLUMN IN THE TABLE, deliberately. Mist is water in the air lit by whatever is
   lighting the air, so it is the haze colour with some of the saturation taken out of it — one
   fewer thing to keep in step, and it can never disagree with the fog it is standing in.
   ================================================================================================== */
const _mistWhite = new Color(0xffffff)
let uiSkyLast = -1

function applyDay(
  scene: Scene, renderer: WebGLRenderer, rig: Rig, sun: SolarState, fogBase: number,
): void {
  const alt = sun.alt
  const m = dayPalette(alt)
  const n = m.numbers
  const c = m.colours

  rig.key.color.copy(c.keyCol); rig.key.intensity = n.keyI
  rig.fill.color.copy(c.fillCol); rig.fill.intensity = n.fillI
  rig.hemi.color.copy(c.hemiSky)
  rig.hemi.groundColor.copy(c.hemiGnd)
  rig.hemi.intensity = n.hemiI

  const fog = scene.fog as FogExp2 | null
  if (fog) { fog.color.copy(c.fogCol); fog.density = fogBase * n.fogK }
  scene.background = (scene.background as Color | null)?.copy(c.fogCol) ?? new Color(c.fogCol)
  renderer.toneMappingExposure = n.expo

  ATMOS_U.uMistColor.value.copy(c.fogCol).lerp(_mistWhite, 0.35)

  /* THE TWO COLUMNS THE PALETTE HAS COMPUTED SINCE PHASE 3 AND NOTHING EVER READ. `skyGain` is the
     plain multiplier that makes a midnight sky dark rather than merely blue -- measured against the
     mockup at the same hour, the port's sky sat at luminance 67 where the mockup's was 46 -- and
     `stars` is how much of the procedural star field shows through it, 1.30 at midnight and 0 by
     mid-morning. Both were in the table, interpolated every beat, and thrown away. */
  SKY_U.uGain.value = n.skyGain
  SKY_U.uStars.value = n.stars
  SKY_U.uHorizon.value.copy(c.skyHorizon)
  SKY_U.uZenith.value.copy(c.skyZenith)
  SKY_U.uHorizAmt.value = n.skyHorizAmt
  SKY_U.uZenAmt.value = n.skyZenAmt
  SKY_U.uBurn.value.copy(c.skyBurnCol); SKY_U.uBurnG.value = n.skyBurnG
  SKY_U.uWide.value.copy(c.skyWideCol); SKY_U.uWideG.value = n.skyWideG
  SKY_U.uTight.value.copy(c.skyTightCol); SKY_U.uTightG.value = n.skyTightG

  setGlow({ rayAmt: n.rayAmt, haloAmt: n.haloAmt, coreAmt: n.coreAmt }, c.rayCol, c.haloCol)
  if (sunDisc) gradeDisc(sunDisc, c.discCore, c.discMid, n.discCoreG, n.discCoronaG)

  /* AND THE SUN ITSELF MOVES, which is the half the palette cannot do. Left where the boot
     composed it, the disc hangs at dusk all night and every shadow in the valley points where it
     pointed at 7.5 degrees -- a night lit from the west by a sun that set hours ago. */
  if (homeAim && sunAt) {
    const { u, v } = arcPlace(alt, sun.p)
    sunAt.copy(placeSun(HOME_EYE, homeAim, homeFovFit, homeAspect, u, v))
    sunDisc?.position.copy(sunAt)
    aimKey(rig.key, sunAt)
    /* the cover's blobs fall along the light, so they swing with it */
    aimCover(sunAt)
  }
  /* ==================================================================================================
     THE MOON IS THE SUN'S OPPOSITE, WHICH IS A FULL MOON EVERY NIGHT AND IS A CHOICE.

     Real lunar position is a much longer computation for a body whose whole job here is to be
     something in the sky at three in the morning and to give the valley an edge to be lit from. A
     moon that is always full and always opposite the sun is up all night, every night, which is
     exactly the property this needs.

     AND IT WRAPS IN ITS OWN FRAME, which is the whole of the arithmetic below. `p` is the sun's
     hour angle rescaled, so it WRAPS -- and a moon written as `p + 0.5` inherits the wrap at the
     sun's antimeridian instead of its own. Measured in the mockup across one night it went 1.312 at
     01:00 to -0.291 at 01:30, a step of 1.603, and the moon jumped 17,343 units while sitting 23
     degrees up in plain view. So: half a turn away in hour angle, then folded back into exactly the
     window `p` occupies, which puts the wrap at the moon's OWN antimeridian -- the moment it is
     furthest below the horizon and nobody can see it happen. One turn is pi/H0 in p units, because
     `p` rescales an angle of 2*H0 to 1.
     ================================================================================================== */
  if (moonDisc && homeAim && sunAt) {
    const per = sun.H0 > 1e-6 ? Math.PI / sun.H0 : 2
    const pLo = 0.5 - per / 2
    const mp = pLo + ((((sun.p + per * 0.5 - pLo) % per) + per) % per)
    const moonAlt = -alt
    const place = arcPlace(moonAlt, mp)
    moonDisc.visible = moonAlt > -1.5
    if (moonDisc.visible) {
      _moonAt.copy(placeSun(HOME_EYE, homeAim, homeFovFit, homeAspect, place.u, place.v))
      moonDisc.position.copy(_moonAt)
      gradeMoon(moonDisc, moonAlt)
    }
    /* whichever is up gets the shafts and the halo */
    glowBody = alt > -2 ? sunDisc : moonDisc

    /* THE KEY SWINGS FROM ONE TO THE OTHER RATHER THAN SWITCHING, and it does it across the band
       where it is too dim to watch it happen: full sun above -3 degrees, full moon below -8, a
       smooth blend between. A directional light that flipped direction at exactly the horizon would
       swing every shadow in the valley through ninety degrees in one frame. */
    const toMoon = MathUtils.smoothstep(-alt, 3, 8)
    if (toMoon > 0.001 && moonDisc.visible) {
      aimKey(rig.key, _keyAt.copy(sunAt).lerp(_moonAt, toMoon))
      aimCover(_keyAt)
    }
  }

  if (clouds) clouds.material.emissive.copy(c.cloudEmis)
  /* THE VALLEY LIGHTS ITSELF AS THE SUN GOES. `lampOn` is 1 below the horizon, 0.85
     through civil twilight, 0.45 at sunrise and out by mid-morning -- lanterns are lit
     before it is properly dark and left on a while after, which is what a town does. */
  lanterns?.setOn(n.lampOn)
  lampNow = n.lampOn
  /* the bleed is the lamps', so it comes up and goes out with them */
  setBloomNight(n.lampOn)
  petals?.setNight(n.lampOn)
  steam?.setCold(n.lampOn)
  fireflies?.setOn(n.lampOn)
  nightMap?.setOn(n.lampOn)
  /* the windows keep their own hours off the CLOCK rather than off the sun: a bedtime is
     a decision about the time, not about how high the sun is. */
  windows?.setHour(hourNow())

  /* GUARDED ON A REAL CHANGE. Writing a custom property on :root invalidates style for the whole
     document, and doing that sixty times a second to move a number by 0.0004 is a recalculation of
     every rule in the stylesheet for nothing. */
  if (Math.abs(n.uiSky - uiSkyLast) > 0.004) {
    uiSkyLast = n.uiSky
    document.documentElement.style.setProperty('--sky', n.uiSky.toFixed(3))
  }
  /* the shadow map is drawn once and only redrawn when something moves it -- and the sun moving
     is exactly that */
  shadowDirty = true
}

/** the hour of the day this valley is standing in, 0..24 */
function hourNow(): number {
  if (hourOverride !== null) return hourOverride
  const t = new Date()
  return t.getHours() + t.getMinutes() / 60
}

/** where the sun is right now, or at the hour the query string asked for */
function sunNow(): SolarState {
  if (!site) site = siteHere()
  const when = new Date()
  if (hourOverride !== null) {
    when.setHours(Math.floor(hourOverride), Math.round((hourOverride % 1) * 60), 0, 0)
  }
  return solarState(when, site[0], site[1])
}

export function valleyHandle() {
  return handle
}

/**
 * Knock the frame, because a press was heard and declined.
 *
 * The interface's half of a refusal is a flash; this is the other half, and it lives here because
 * there is one camera and three things asking to move it -- see `viewpoint.ts`. Safe when the valley
 * is off, which it must be: the app has to work with `?valley=off` and a menu whose feedback
 * depended on a canvas being there would not.
 */
export function punchCamera(s = 1): void {
  viewpoint?.punch(s)
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

/* ==================================================================================================
   THE CHROME LEAVES WITH THE CAMERA, AND THIS IS THE ONE LINE THAT TELLS IT TO.

   Four fixed corners held at full opacity while the world tears past behind them is the arrangement
   that makes a 3D background read as wallpaper: the flight becomes something happening in a window
   rather than something happening to you. The mockup takes all of it off as the camera goes -- see
   `body.in-flight` in `menu.css` -- so the whole composition leaves together.

   A CLASS RATHER THAN REACT STATE, deliberately, and it is the same argument as `--sky`: a flight is
   the valley's own state, it lasts a second and a half, and routing it through a store so that a
   component could re-render twice would be a worse version of a class name. The valley already
   writes one custom property on the document for the same reason. */
const inFlight = (on: boolean): void => {
  document.body.classList.toggle('in-flight', on)
}

function flyToSectionImpl(section: MenuSectionKey, onOpen: () => void): void {
  const dest = DESTINATIONS[section]
  if (!handle || !dest) { onOpen(); return }
  inFlight(true)
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
  inFlight(true)
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
