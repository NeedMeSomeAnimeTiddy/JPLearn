import {
  CatmullRomCurve3, Euler, InstancedMesh, Material, Matrix4, Object3D, Quaternion, Scene, Vector3,
} from 'three'
import { breathe } from './atmosphere'
import { corridorCells, buildFooting, type Footing } from './walkground'
import type { Heightfield } from './heightfield'
import type { CrowdField } from './crowd'

/* ==================================================================================================
   AND SOME OF THEM ARE GOING SOMEWHERE.

   A thousand people shifting their weight is a crowd that is alive; nobody in it is going anywhere,
   and at any distance where the shifting is too small to see, that is still a diorama. Movement
   ACROSS the frame is what reads as a place rather than a model of one.

   THE MOTION IS ALL IN THE INSTANCE MATRIX, AND THAT IS A DELIBERATE CHOICE AGAINST THE IDLE. The
   idle went into the vertex shader because a thousand matrices a frame is 66 KB of upload for
   motion nobody can point at. Seventy walkers is 4.5 KB, and buying the whole gait on the CPU buys
   two things a shader cannot: a curve they can be steered along, and a heading that follows it.

   THEY DO NOT CAST. The shadow map is built once, at load, because rebuilding it every frame for a
   world this size is not affordable. A walker that cast into it would leave a shadow standing on
   the road for the rest of the session while its owner walked off. No shadow is a small, quiet
   wrong; seventy abandoned shadows is a loud one.

   CLOSED CURVES ROUND THE VALLEY, NOT ROUTES ALONG THE ROADS — and the mockup tried the other thing
   first, so the reasons are worth keeping. It marched a centreline out of every path ribbon in the
   world and walked people up and down them. Two faults, both structural rather than tuning: a route
   with two ends needs people to TURN ROUND at them, and a route that follows a road faithfully has
   to end where the road ends, which in this world is on a destination camera's nose. A closed curve
   has neither problem — nobody arrives anywhere, so nobody has to stop, and the curve can be drawn
   to give the cameras a wide berth.

   AND THEY GIVE FOUR OF THIS PORT'S FIVE CAMERAS A BERTH. NOT THE FIFTH — measured, and left as it
   was found rather than quietly redesigned. Against `DESTINATIONS`:

       STUDY     Valley centreline 402   behind the camera
       READING   Town    centreline 167  behind the camera
       JLPT      Valley  centreline 240  behind the camera
       RECORDS   Valley  centreline 4519 in shot, and a figure there is 14 px tall
       DRILLS    Valley  centreline 202  IN SHOT, 18 units off the view axis

   The last one is the mockup's own arrangement, not a porting slip: the DRILLS eye stands on the
   festival approach and the Valley loop crosses the approach, so at 202 units a 65-unit figure is
   48% of the frame's height at fov 37.3, and a walker on the near side of the lane can be 52 units
   away. Forty walkers on a 48,000-unit loop means one is within 150 units of that spot about a
   quarter of the time. Every alternative tried made something else worse and all of them were
   measured: pinning the curve down between (160, 4360) and (1600, 5300) only moved 48% to 33%;
   moving the control point south to (1600, 4700) bought 673 units of clearance and walked the loop
   through the stalls — a yatai at 67 units, a nobori at 61, a takahari at 89 — which is precisely
   what the Festival loop's own note says not to do; moving it north put the curve THROUGH the eye.
   The circuit has to cross the approach somewhere and the camera stands on the approach. Changing
   which road the valley's people walk is a decision about Robbie's world rather than about this
   port, so the numbers are here and the loops are as he has seen them. `walk.test.ts` pins all five
   so an edit to either table cannot move them without saying so.

   THE AUTHORED CROWD IS UNTOUCHED by all of this and stays where Robbie put it, breathing.
   ================================================================================================== */

export interface LoopSpec {
  n: string
  /** how many walk it */
  w: number
  /** how far to either side of the centreline they may be */
  lane: number
  /** control points, x,z pairs — y is never here, every sample is dropped onto the ground */
  p: readonly number[]
}

/* CONTROL POINTS, AND FEW OF THEM ON PURPOSE. Each loop is a CLOSED Catmull-Rom through the x,z
   pairs; y is not here because every sample is dropped onto whatever ground is under it at build
   time, so moving a point sideways is safe and the curve follows the hills by itself. */
/* ==================================================================================================
   THESE ARE `loops.json`, NOT THE MOCKUP'S SOURCE CONSTANTS, AND THE DIFFERENCE WAS 560 PEOPLE.

   The mockup declares a WALK_LOOPS table in the file and then FETCHES `loops.json` over the top of
   it at boot: the file is the authored default and the JSON is what Robbie has since drawn in the
   loop editor. This port read the table. The table says the valley is walked by 40 people; the
   overlay says 600 — and with Town and Festival that is 630 walking the mockup's world against 70
   walking this one. Nine times the population is not a settings difference, it is a different place:
   an empty road with a few figures on it against a valley with people all over it.

   AND THE ROAD ITSELF MOVED. The overlay's valley circuit is 24 control points and 52,240 units
   around, against the 20 and 48,353 here, and it comes back across the southeast on a completely
   different line. What stood here was a hand-tuned variant of the SOURCE path, re-solved in this
   port to clear the DRILLS camera — which was solving the right problem against the wrong road.

   WHAT THAT COSTS, MEASURED, so it is a decision rather than a surprise: the overlay's circuit
   passes 101 units from the DRILLS eye where the re-tuned one passed 201, and 606 from the READ eye
   where the re-tuned one passed 240. So DRILLS gets worse and READ gets better, and at 101 units a
   65.5-unit figure is most of that frame's height. The mockup has exactly this and always has --
   `walkTick` runs unconditionally there, on this path, with 600 people on it.

   IT IS STILL THE RIGHT ANSWER. Which road the valley's people walk is a decision about Robbie's
   world, made in Robbie's editor, and a port that quietly substitutes its own is a port that has
   stopped being one. If the DRILLS approach wants clearing, the place to clear it is the editor, and
   the number to beat is 101.
   ================================================================================================== */
export const WALK_LOOPS: readonly LoopSpec[] = [
  /* the valley circuit, laid roughly along the road the world already makes — Torii, Zen, the
     onsen, the garden, the pagoda, the festival — closing across the open southeast, where there is
     no road but there is nothing in the way either */
  { n: 'Valley', w: 600, lane: 100, p: [
    13120, -1268, 11500, -3200, 8700, -4011, 3400, -5830, 84, -6345, -3695, -6577,
    -5450, -5700, -5580, -3872, -5531, -1288, -4321, -618, -3344, 33, -2216, 727,
    -567, 3461, 778, 5283, 2166, 3548, 2817, 2463, 3728, 2333, 3859, 1725,
    3381, 944, 2534, 554, 5180, 250, 6872, -10, 11341, -618] },
  /* the onsen's two streets, which are already a circuit: up one spine and down the other. The
     south join passes NORTH of the bathhouse, whose footprint runs z −6100 to −6300 right across
     the obvious line. */
  { n: 'Town', w: 14, lane: 60, p: [
    -5531, -1288, -5545, -3500, -5589, -5794, -5950, -6010, -6600, -5990, -7069, -5860,
    -7069, -3700, -7043, -1496, -6400, -1360] },
  /* the festival, and it is a thin loop down the stall street and back up the other side of it
     rather than a ring round the plaza: the plaza's middle is the yagura and the koshikake, and a
     ring wide enough to miss both is a ring walking through the stalls */
  { n: 'Festival', w: 16, lane: 30, p: [
    1294, 4743, 1709, 4303, 2150, 3615, 2485, 3110, 2094, 3573, 1653, 4261] },
]

/* A FIGURE IS 65.5 UNITS AND A PERSON IS 1.75 m, SO THE WORLD IS 37 UNITS TO THE METRE — which is
   the only reason any of these can be argued about rather than dialled. 1.4 m/s is 52 units/s. A
   pace is 0.75 m, so the two-pace gait cycle a bob belongs to is 56 units.

   THE MOCKUP SAYS 41 u/s AND A 44-UNIT STRIDE, and those follow from "a figure is 51.5 units and a
   person is 1.75 m, so the world is 29 units to the metre" — which is the mockup contradicting
   itself rather than describing a different world. It is the same `world.glb`, and forty lines
   further down its own crowd filter says "a figure is 65.5 units, the tallest of the strays is a
   26-unit monkey" and picks 40 to separate them. Measured here, every adult model is 65.5 and the
   children are 43.1; nothing in this export is 51.5. So its walkers were 27% too slow for the
   valley they were walking, and the numbers here are what its own arithmetic gives with the height
   it measured rather than the one it wrote down. */
export const WALK = {
  /** units a second */
  speed: 52,
  /** ± on that, per walker, so a road is not a parade */
  vary: 0.28,
  /** how much of their own side of the lane they spread across */
  spread: 0.66,
  /** and how far they weave within it, as a fraction of the lane */
  meander: 0.18,
  /* THE GAIT, ON A FIGURE WITH NO LEGS. These people are a robe, a head and a sash; there is
     nothing to take a step with, so a walker moved along a line slides — which is what the mockup's
     author called moonwalking. It cannot be fixed by facing: the model is very nearly symmetric
     front to back, so a walker turned round is the same picture. What does read as walking is the
     body doing what a body does BETWEEN steps — rise and fall on each pace, and roll onto the foot
     that is carrying you. Both run on distance travelled rather than on the clock, so a slow walker
     takes slow steps. */
  bob: 2.4,
  /** radians of lean onto the loaded foot, one per pace */
  roll: 0.055,
  stride: 56,
  /** radians of yaw wander, over a whole gait cycle */
  sway: 0.05,
  /** how finely a curve is sampled, in units */
  step: 70,
  /* THE LANE, PLUS ENOUGH FOR THE CURVE TO BULGE PAST ITS CONTROL POLYGON. The corridor is cut from
     the polygon rather than from the curve, because the curve cannot be built until the ground is
     known and the ground cannot be cut until the corridor is. 400 is measured slack: the widest
     bulge on the Valley loop's long southern run is under 250. */
  corridor: 400,
}

/* EVERYTHING THAT MAKES ONE WALKER NOT THE NEXT, OFF ONE HASH. The mockup's first version keyed the
   variation off the walker's index through `sin(k * 2.399)`, which is a low-discrepancy sequence and
   therefore the opposite of what was wanted: the whole point is that neighbours differ, and a
   sequence that spreads evenly makes neighbours differ by the SAME amount every time. A hash gives
   each figure its own numbers with no pattern between them, and the same ones every reload, so a
   shot is repeatable. */
export function walkRnd(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export interface Loop {
  spec: LoopSpec
  pts: Vector3[]
  /** cumulative distance along `pts`, closing the seam */
  cum: number[]
  len: number
}

/** one loop: control points to a closed curve to an evenly-spaced polyline with a length table */
export function walkLoop(spec: LoopSpec, groundAt: (x: number, z: number) => number): Loop {
  const cps: Vector3[] = []
  for (let i = 0; i < spec.p.length; i += 2) cps.push(new Vector3(spec.p[i], 0, spec.p[i + 1]))
  const curve = new CatmullRomCurve3(cps, true, 'catmullrom', 0.5)
  const n = Math.max(24, Math.round(curve.getLength() / WALK.step))
  const pts = curve.getSpacedPoints(n)
  /* getSpacedPoints repeats the seam on a closed curve */
  pts.pop()
  for (const p of pts) p.y = groundAt(p.x, p.z)
  const cum = [0]
  for (let i = 1; i <= pts.length; i++) {
    cum.push(cum[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]))
  }
  return { spec, pts, cum, len: cum[cum.length - 1] }
}

interface Walker {
  l: number
  i: number
  k: number
  mesh: InstancedMesh
  /* THE MODEL'S OWN SCALE AND WHERE ITS FEET ARE, carried per walker because the ten models differ.
     Neither is optional: the world ships quantized, so a person's geometry is about two units tall
     with its size in the placement matrix, and the origin is at the navel rather than the sole.
     A walker composed at scale 1 with its origin on the road is a two-unit figure buried to the
     waist, which is exactly what the first build drew and what took a screenshot to find. */
  scale: number
  lift: number
  dir: number
  /** distance along the loop */
  s: number
  sp: number
  off: number
  mea: number
  mel: number
  ph: number
  seg: number
  y: number | null
  gy: number | null
  gx: number
  gz: number
}

function personalise(w: Walker, loop: Loop): void {
  w.sp = WALK.speed * (1 + (walkRnd(w.k, 1) * 2 - 1) * WALK.vary)
  /* WHERE IN THEIR HALF OF THE ROAD THEY WALK. The mockup's first pass used 0.62 to 1.0 of the
     lane, which put everyone going the same way inside a band 38% of a lane wide — 57 units on the
     valley loop, and 57 units at a thousand is a queue. */
  w.off = w.dir * loop.spec.lane * (0.16 + walkRnd(w.k, 2) * WALK.spread)
  /* and they do not hold that line: a slow weave, on DISTANCE like the gait, so it is a walk rather
     than a wobble. Kept inside the lane by construction — 0.16 + spread + meander = 1. */
  w.mea = loop.spec.lane * WALK.meander * (0.35 + walkRnd(w.k, 3) * 0.65)
  /* units per weave, so nobody shares a rhythm */
  w.mel = 420 + walkRnd(w.k, 4) * 560
}

/** where a loop is, and which way it points, at distance s along it — s wraps, always */
function loopAt(loop: Loop, s: number, w: Walker, out: Vector3): { dx: number; dz: number } {
  const n = loop.pts.length
  let i = w.seg
  while (i > 0 && loop.cum[i] > s) i--
  while (i < n - 1 && loop.cum[i + 1] < s) i++
  w.seg = i
  const a = loop.pts[i]
  const b = loop.pts[(i + 1) % n]
  const span = loop.cum[i + 1] - loop.cum[i] || 1
  const f = Math.min(1, Math.max(0, (s - loop.cum[i]) / span))
  out.copy(a).lerp(b, f)
  return { dx: (b.x - a.x) / span, dz: (b.z - a.z) / span }
}

export interface WalkField {
  loops: Loop[]
  people: number
  meshes: InstancedMesh[]
  /** the un-idled material -- the boats' passengers need one for exactly the same reason */
  material: Material
  footing: Footing
  tick: (seconds: number) => void
  dispose: () => void
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()

/**
 * Put people on the roads.
 *
 * MUST RUN BEFORE THE FIRST RENDER — the footing grid reads position arrays that
 * `freeCpuCopiesAfterUpload` nulls the moment the GPU has them.
 */
export function buildWalkers(
  scene: Scene, root: Object3D, crowd: CrowdField, field: Heightfield,
): WalkField | null {
  if (!crowd.models.length || !crowd.source) return null

  /* the corridor first, off the control polygons, then the ground inside it, then the curves */
  const want = new Set<number>()
  for (const spec of WALK_LOOPS) corridorCells(spec.p, spec.lane + WALK.corridor, want)
  const footing = buildFooting(root, field, want)
  const loops = WALK_LOOPS.map((spec) => walkLoop(spec, footing.at))

  /* THE FIGURES ARE THE CROWD'S OWN — same geometries, so a walker is one of the same people as
     everyone else — with a material that has NO IDLE IN IT. A walker hashes nothing, but the idle
     does, off `instanceMatrix[3]`; a walker's instance matrix changes every frame, so the idle
     would re-roll its phase sixty times a second and read as a shiver. */
  const mat = (crowd.source as Material).clone()
  mat.name = `${crowd.source.name || 'crowd'}-walk`
  delete (mat as Material & { userData: { atmos?: boolean } }).userData.atmos
  breathe(mat)

  const models = crowd.models.slice(0, 16)
  const total = WALK_LOOPS.reduce((a, L) => a + L.w, 0)
  const per = models.map(() => 0)
  for (let i = 0; i < total; i++) per[i % models.length]++

  const meshes = models.map(({ geo }, i) => {
    const m = new InstancedMesh(geo, mat, Math.max(1, per[i]))
    m.name = `walkers-${i}`
    /* an instance that walks a twenty-thousand-unit loop has left any bounding sphere computed from
       where it started, and a culled walker is one who vanishes halfway down the road */
    m.frustumCulled = false
    m.castShadow = false
    m.receiveShadow = true
    m.count = 0
    scene.add(m)
    return m
  })

  const people: Walker[] = []
  let gi = 0
  let kk = 0
  for (let li = 0; li < loops.length; li++) {
    const loop = loops[li]
    for (let k = 0; k < loop.spec.w; k++) {
      const mi = gi % meshes.length
      const mesh = meshes[mi]
      gi++
      const w: Walker = {
        l: li,
        i: mesh.count++,
        k: kk++,
        mesh,
        scale: models[mi].scale,
        lift: -models[mi].foot,
        /* both ways round, which is what a road looks like */
        dir: k % 2 ? -1 : 1,
        /* strung out round the loop and NOT AT EVEN SPACING. Even spacing plus a narrow speed
           spread is a procession that stays one: it takes minutes for the fastest to gain a place
           on the slowest, and until then it is a dotted line. */
        s: loop.len * ((k + 0.5 + (walkRnd(kk, 5) - 0.5) * 0.85) / loop.spec.w),
        sp: 1, off: 0, mea: 0, mel: 600,
        ph: walkRnd(kk, 6) * 6.2831,
        seg: 0, y: null, gy: null, gx: 0, gz: 0,
      }
      personalise(w, loop)
      people.push(w)
    }
  }

  const tick = (dt: number) => {
    for (const w of people) {
      const loop = loops[w.l]
      w.s += w.sp * w.dir * dt
      if (w.s >= loop.len) w.s -= loop.len
      else if (w.s < 0) w.s += loop.len
      const t = loopAt(loop, w.s, w, _p)
      /* the gait runs on distance travelled rather than on the clock, so a slow walker takes slow
         steps and nobody moon-walks */
      const gait = (w.s / WALK.stride) * 6.2831 + w.ph
      /* YXZ, so the roll is applied in the figure's OWN frame before it is turned to face down the
         road — a lean in world space would tip everyone the same way whatever direction they were
         walking, which is a gust of wind, not a gait */
      _e.set(
        0,
        Math.atan2(t.dx * w.dir, t.dz * w.dir) + Math.sin(gait * 0.5) * WALK.sway,
        Math.sin(gait) * WALK.roll,
        'YXZ',
      )
      _q.setFromEuler(_e)
      /* THE GROUND UNDER THE WALKER, NOT UNDER THE CURVE. The loop carries a height at each of its
         own samples, on its own centreline — and a walker stands up to `lane` units to one side of
         that, which on the valley loop is 150. Across a slope that is tens of units of error; the
         mockup measured it at 89 units low over 230 walkers, which is a 65-unit figure with the top
         of its head showing. Asking the ground directly is one cell lookup and a handful of
         barycentric tests, and it fixes the chord sag between samples at the same time. */
      const off = w.off + Math.sin(w.s / w.mel * 6.2831 + w.ph) * w.mea
      const px = _p.x - t.dz * off
      const pz = _p.z + t.dx * off
      /* AND NOT EVERY FRAME. Measured by the mockup at 0.51 ms for 230 of these — about ten fps of
         a 130 fps frame, for a question whose answer moves by less than a unit between frames.
         Resampled every six units of TRAVEL instead, which at walking pace is one frame in nine and
         at any speed is proportional. The ease below bridges the gap, so nothing steps. */
      if (w.gy === null || Math.abs(px - w.gx) + Math.abs(pz - w.gz) > 6) {
        w.gy = footing.at(px, pz)
        w.gx = px
        w.gz = pz
      }
      /* THE EASE IS GENTLE FOR SMALL CORRECTIONS AND QUICK FOR REAL ONES, which a fixed rate cannot
         be. At a flat 14/s the settling time is the same whether the ground moved by one unit or by
         thirty, so crossing a surface boundary shows a figure ankle-deep for a fifth of a second.
         Rate rising with the error keeps the small stuff smooth and puts a 30-unit step back inside
         three frames. */
      if (w.y === null) w.y = w.gy
      else w.y += (w.gy - w.y) * Math.min(1, dt * (14 + Math.abs(w.gy - w.y) * 0.9))
      _m.compose(
        _p.set(px, w.y + w.lift + Math.abs(Math.sin(gait)) * WALK.bob, pz),
        _q, _s.setScalar(w.scale),
      )
      w.mesh.setMatrixAt(w.i, _m)
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true
  }

  /* placed before the first frame, or seventy people arrive at the origin */
  tick(0)

  return {
    loops,
    people: people.length,
    meshes,
    material: mat,
    footing,
    tick,
    dispose: () => {
      for (const m of meshes) { scene.remove(m); m.dispose() }
      mat.dispose()
    },
  }
}
