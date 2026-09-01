import {
  Box3, Color, Euler, InstancedMesh, Material, Matrix4, Object3D, PlaneGeometry, Quaternion, Scene,
  ShaderMaterial, Vector3,
} from 'three'
import { ATMOS_U } from './atmosphere'
import { LAKE_U, LAKE_Y, lakeCentre, type Shore } from './lake'
import { walkRnd } from './walk'
import type { CrowdField } from './crowd'

/* ==================================================================================================
   THE LAST OF THE STILL THINGS — six boats moored on a lake that never moved, steam that does not
   rise, koi that do not swim, monkeys sitting in a bath at perfect attention, and banners in dead
   air. Five different wrongs, and it would be five systems if they had anything to disagree about.
   They do not: every one is a small authored prop that should move a little AROUND WHERE ROBBIE PUT
   IT, and every one can say what it needs in a matrix. So it is one table and one tick.

   THE BOATS WERE THE ASK AND THE REST CAME WITH THE MACHINERY. Building `sail` alone means writing
   the item table, the instance/plain-mesh split, the rider weld and the wake anyway; the other four
   rules are eight lines of table between them. And a lake with six boats crossing it and sixty-nine
   motionless ducks on it would be a worse picture than the one that started this.

   NONE OF THEM CAST. The shadow map is built once at load, so a moving caster leaves its shadow
   behind it for the rest of the session — the same rule the walkers follow.

   NO MOVING LIGHT, AND THAT IS THIS PORT BEING SIMPLER RATHER THAN POORER. The mockup needs eight
   per-fragment lights for the boat lanterns because its 517 still lamps are baked into a cluster
   grid a lamp may never move inside. This port's lanterns are emissive only — deliberately, see
   `lanterns.ts` — so a lantern that sails is a material that already glows on a mesh that already
   moves, and there is nothing further to arrange. Each boat's chochin is welded to it as a rider
   and lights up at dusk with every other lantern in the valley.
   ================================================================================================== */

/** how a prop is allowed to move, and how much */
export interface LifeRule {
  m: RegExp
  kind: 'sail' | 'swim' | 'bob' | 'puff' | 'sway'
  /** which local axis is the bow — read off the bounding box, never assumed */
  fwd?: 'x' | 'z'
  r?: readonly [number, number]
  speed?: readonly [number, number]
  period?: readonly [number, number]
  rise?: number
  spin?: number
  y?: number
  yaw?: number
  roll?: number
  swish?: number
  bobY?: number
  rock?: number
  /** how far from its origin a passenger may be and still be aboard */
  deck?: number
  /** whether its circle has to be fitted to the water */
  water?: 'lake'
  /** a wake, as multiples of the hull's own size: [length, width, how far forward the stem is] */
  wake?: readonly [number, number, number]
}

export const PROP_LIFE: readonly LifeRule[] = [
  /* a puff is born at the vent, grows as it lifts, and is gone by the top — scaled to nothing at
     both ends of its cycle so the loop has no seam to see */
  { m: /Onsen_Props_Steam/i, kind: 'puff', rise: 110, period: [4.5, 8.5], spin: 0.6 },
  /* MonkeyBath before Monkey, because the second pattern would swallow the first */
  { m: /Onsen_People_MonkeyBath/i, kind: 'bob', y: 2.4, yaw: 0.09, period: [4, 7] },
  { m: /Onsen_People_Monkey[_\-\d]/i, kind: 'bob', y: 1.1, yaw: 0.30, period: [3, 6] },
  /* koi hold station and then move: a slow circle with the nose on the tangent and a tail swish
     laid over it. The nearest fish is 638 units from the pond's edge, so 120 is nowhere near a
     problem. They are 14 x 5 x 25 — long in Z — so they keep the default bow. */
  { m: /Garden_People_Koi/i, kind: 'swim', r: [45, 120], speed: [11, 24], swish: 0.34 },
  /* WHICH WAY A MODEL FACES IS A MEASUREMENT, NOT A CONVENTION. A duck is 30 x 16 x 14 and a boat
     235 x 154 x 69 — both long in X — so the yaw that is right for a koi sails them broadside. */
  { m: /Nature_Wildlife_Duck/i, kind: 'swim', r: [22, 70], speed: [4, 11], swish: 0.42,
    bobY: 1.1, fwd: 'x', water: 'lake', wake: [3.7, 3.3, 0.5] },
  /* the boats share the lake's own outline at their own distance in from it, so six of them read
     as a loop AROUND the lake rather than six independent circles that happen to be near each
     other. `deck` is what makes a passenger a passenger. */
  { m: /Nature_Wildlife_Boat/i, kind: 'sail', speed: [15, 23], rock: 0.045, bobY: 2.4,
    fwd: 'x', deck: 110, wake: [2.6, 3.3, 0.49] },
  /* the banner's origin is the foot of its pole, so a yaw IS a swing about the pole. The gust
     envelope is what makes it wind rather than a metronome. */
  { m: /Festival_Structures_Nobori/i, kind: 'sway', yaw: 0.15, roll: 0.04, period: [2.4, 4.2] },
]

/* how much of a lap a boat may sail: never grazing the shore, never pinned to the middle. The
   mockup's own bounds, and they hold here for the same reason — the shore this follows is measured
   off a 183-unit heightfield and is not the rendered waterline to the last unit. */
const FRAC_IN = 0.25
const FRAC_OUT = 0.82

/* ---- the wake ---------------------------------------------------------------------------------
   A hull crossing a lake without one is a sticker on a photograph, and once the boats start moving
   it is the loudest thing on the water.

   ONE INSTANCED QUAD LYING FLAT, not a disturbance of the water shader. The lake is a hand-written
   shader with its own reflection and posterised Fresnel; reaching into it to add per-mover ripples
   means feeding it a texture of positions and evaluating all of them per water pixel, for something
   that is only ever a few pale marks. A quad is one draw call for all of them and can be shaped
   exactly.

   THE V IS DRAWN, NOT SIMULATED: two arms opening behind the bow at a fixed angle, a softer churn
   down the middle, and the whole thing fading along its length. */
const WAKE_U = {
  uAmt: { value: 0.6 },
  uCol: { value: new Color(0xdfeaf2) },
  /** how wide the V opens over its length */
  uSpread: { value: 0.62 },
  fogColor: LAKE_U.fogColor,
  fogDensity: LAKE_U.fogDensity,
  uMistColor: ATMOS_U.uMistColor,
}

const WAKE_VERT = `
  varying vec2 vUv;
  varying float vFog;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
    vFog = - mv.z;
    gl_Position = projectionMatrix * mv;
  }`

const WAKE_FRAG = `
  uniform vec3 uCol, fogColor;
  uniform float uAmt, uSpread, fogDensity;
  varying vec2 vUv;
  varying float vFog;
  void main() {
    /* t runs 0 at the bow to 1 at the far end of the wake */
    float t = 1.0 - vUv.y;
    float x = abs( vUv.x - 0.5 ) * 2.0;
    /* the arms open with distance, which is the whole shape of a wake */
    float arm = t * uSpread;
    float a = smoothstep( 0.13, 0.0, abs( x - arm ) );
    /* and the churn straight behind, softer and shorter than the arms */
    a += smoothstep( 0.16, 0.0, x ) * 0.45 * smoothstep( 0.55, 0.0, t );
    /* born at the stern rather than switched on, gone by the end */
    a *= smoothstep( 0.0, 0.07, t ) * smoothstep( 1.0, 0.45, t );
    /* AND IT TAKES THE HAZE. An unfogged mark on water eight thousand units away is a bright
       scratch on a lake that has otherwise dissolved into the evening. */
    float f = 1.0 - exp( - fogDensity * fogDensity * vFog * vFog );
    a *= uAmt * ( 1.0 - clamp( f, 0.0, 1.0 ) );
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( uCol, a );
  }`

/* the parting starts AHEAD of the hull and opens astern, which the mockup got wrong twice in
   different ways and is worth keeping. Rooted at the hull's origin it is correct as physics but
   the V's point sits halfway down the boat, so the water appears to part out of the middle of it;
   thrown forward and aimed ahead it is the shape inside out, a wedge closing on the boat. What a
   bow does is both: the apex is AHEAD, at the stem, and the arms sweep BACK past the hull. */
const WAKE_LIFT = 1.5

interface LifeItem {
  o: Object3D
  /** the instance index within `o`, or −1 for a plain mesh */
  i: number
  rule: LifeRule
  k: number
  p: Vector3
  q: Quaternion
  s: Vector3
  ph: number
  gp: number
  w: number
  /** swim/sail: where round its circle it is */
  a: number
  r: number
  side: number
  cx: number
  cz: number
  /** sail: its share of the shore's radius, and its speed over the ground */
  frac: number
  spd: number
  still: boolean
  /** the heading it is travelling on, for the wake */
  vx: number
  vz: number
  wake: number
  /** sail: what the hull has done to its authored pose, for anyone riding it */
  inv: Matrix4 | null
  delta: Matrix4 | null
  /** the hull's own size, for the wake */
  len: number
  wid: number
}

interface Rider {
  o: Object3D
  i: number
  boat: LifeItem
  authored: Matrix4
}

export interface LifeField {
  /** the meshes the boat passengers were re-seated into, so the wardrobe can dress them too */
  riderMeshes: InstancedMesh[]
  items: number
  boats: number
  riders: number
  wakes: number
  /** how many kept their authored place because no circle would fit them on the water */
  moored: number
  tick: (seconds: number) => void
  dispose: () => void
}

const _m = new Matrix4()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()
const _box = new Box3()

const span = (v: readonly [number, number], f: number): number => v[0] + (v[1] - v[0]) * f

/* THE YAW THAT PUTS A MODEL'S BOW DOWN A HEADING, whichever local axis its bow happens to be. A yaw
   about Y sends +Z to (sin y, cos y) and +X to (cos y, −sin y), so the two are different atan2s and
   not a sign flip — which is the sort of thing that is obvious once a boat has been seen crabbing
   sideways across a lake and not before. */
export function lifeYaw(rule: LifeRule, vx: number, vz: number): number {
  return rule.fwd === 'x' ? Math.atan2(-vz, vx) : Math.atan2(vx, vz)
}

/**
 * Set the props moving.
 *
 * `shore` is what the boats sail; without it (no water, or no heightfield) they stay moored, which
 * is what a boat with nowhere to go should do.
 */
export function buildLife(
  scene: Scene, root: Object3D, crowd: CrowdField | null, shore: Shore | null,
  riderMaterial: Material | null,
): LifeField {
  const items: LifeItem[] = []
  const meshes: InstancedMesh[] = []
  const riders: Rider[] = []
  const centre = lakeCentre()

  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const mesh = o as InstancedMesh
    if (!mesh.isMesh) return
    const rule = PROP_LIFE.find((r) => r.m.test(o.name))
    if (!rule) return
    o.castShadow = false

    const add = (i: number, p: Vector3, q: Quaternion, s: Vector3) => {
      const k = items.length
      const it: LifeItem = {
        o, i, rule, k,
        p: p.clone(), q: q.clone(), s: s.clone(),
        ph: walkRnd(k, 31) * 6.2831,
        gp: walkRnd(k, 32) * 6.2831,
        w: rule.period ? 6.2831 / span(rule.period, walkRnd(k, 33)) : 0,
        a: 0, r: 0, side: 1, cx: 0, cz: 0, frac: 0, spd: 0,
        still: false, vx: 0, vz: 1, wake: -1,
        inv: null, delta: null, len: 0, wid: 0,
      }

      if (rule.wake || rule.kind === 'sail') {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        _box.copy(mesh.geometry.boundingBox!)
        const sx = (_box.max.x - _box.min.x) * s.x
        const sz = (_box.max.z - _box.min.z) * s.z
        it.len = rule.fwd === 'x' ? sx : sz
        it.wid = rule.fwd === 'x' ? sz : sx
      }

      if (rule.kind === 'swim') {
        it.a = walkRnd(k, 37) * 6.2831
        let rr = span(rule.r!, walkRnd(k, 34))
        /* EACH BIRD FITS ITS OWN CIRCLE TO THE WATER. Some are moored close enough to the bank
           that a seventy-unit circle walks them up the beach, and the answer is not to shrink
           every duck to suit the worst-placed one — it is to shrink the ones that need it. */
        if (rule.water === 'lake' && shore) {
          for (let guard = 0; guard < 8; guard++) {
            const cx = it.p.x - Math.cos(it.a) * rr
            const cz = it.p.z - Math.sin(it.a) * rr
            let ok = true
            for (let t = 0; t < 24 && ok; t++) {
              const a2 = (t / 24) * 6.2831
              const qx = cx + Math.cos(a2) * rr - centre.x
              const qz = cz + Math.sin(a2) * rr - centre.z
              ok = Math.hypot(qx, qz) < shore.at(Math.atan2(qz, qx)) * 0.96
            }
            if (ok) break
            rr *= 0.7
          }
        }
        /* AND IF NO CIRCLE FITS, IT DOES NOT SWIM. A two-unit circle at four units a second is a
           duck spinning on the spot; better moored, which is what a duck standing at the edge of
           the water is doing anyway. */
        if (rr < 12) it.still = true
        it.r = rr
        it.side = walkRnd(k, 35) < 0.5 ? -1 : 1
        it.w = (span(rule.speed!, walkRnd(k, 36)) / it.r) * it.side
        /* the circle is centred so it passes through where the bird was put */
        it.cx = it.p.x - Math.cos(it.a) * it.r
        it.cz = it.p.z - Math.sin(it.a) * it.r
      }

      if (rule.kind === 'sail') {
        if (!shore) { it.still = true } else {
          it.cx = centre.x
          it.cz = centre.z
          it.a = Math.atan2(it.p.z - it.cz, it.p.x - it.cx)
          const d = Math.hypot(it.p.x - it.cx, it.p.z - it.cz)
          /* EACH BOAT KEEPS THE FRACTION IT WAS MOORED AT, so it starts exactly where Robbie put
             it and never has to be told which lap it is on. Two of the six are moored further out
             than the narrowest bearing of the shore, which is the whole reason this is a fraction
             of a measured coast rather than a radius. */
          it.frac = Math.max(FRAC_IN, Math.min(FRAC_OUT, d / shore.at(it.a)))
          it.side = walkRnd(k, 38) < 0.5 ? -1 : 1
          /* THE SPEED IS KEPT, NOT THE ANGULAR RATE IT IMPLIES. `w` depends on the lap's radius,
             which changes all the way round a coast, so widening the lap by editing `frac` alone
             would silently slow the boat down. Kept apart, `w` is derived and nothing drifts. */
          it.spd = span(rule.speed!, walkRnd(k, 39))
        }
      }

      items.push(it)
    }

    if (mesh.isInstancedMesh) {
      mesh.frustumCulled = false
      meshes.push(mesh)
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _m)
        _m.decompose(_p, _q, _s)
        add(i, _p, _q, _s)
      }
    } else {
      /* a plain mesh keeps its own matrix, so drive that directly and stop three recomputing it
         from a position this code is not using */
      o.matrixAutoUpdate = false
      add(-1, o.position, o.quaternion, o.scale)
    }
  })

  /* ---- whoever is in the boat goes with the boat ------------------------------------------- */
  const sails = items.filter((it) => it.rule.deck && !it.still)
  if (sails.length) collectRiders(root, crowd, riderMaterial, sails, riders, meshes)

  /* ---- one wake apiece for everything that moves through water and is not moored ------------ */
  const wakers = items.filter((it) => it.rule.wake && !it.still)
  let wakeMesh: InstancedMesh | null = null
  if (wakers.length) {
    const g = new PlaneGeometry(1, 1)
    /* into the horizontal plane, where water is, and rooted at the stem running astern */
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, 0.5)
    wakeMesh = new InstancedMesh(g, new ShaderMaterial({
      uniforms: WAKE_U,
      vertexShader: WAKE_VERT,
      fragmentShader: WAKE_FRAG,
      transparent: true,
      depthWrite: false,
    }), wakers.length)
    wakeMesh.name = 'wake'
    wakeMesh.frustumCulled = false
    wakeMesh.castShadow = false
    wakeMesh.receiveShadow = false
    /* over the water, which is itself drawn over the world */
    wakeMesh.renderOrder = 2
    scene.add(wakeMesh)
    wakers.forEach((it, i) => { it.wake = i })
  }

  let t = 0
  const tick = (dt: number) => {
    t += dt
    for (const it of items) {
      if (it.still) continue
      const r = it.rule
      _p.copy(it.p)
      _q.copy(it.q)
      _s.copy(it.s)

      if (r.kind === 'puff') {
        const u = ((t * it.w) / 6.2831 + it.ph / 6.2831) % 1
        _p.y += u * r.rise!
        /* zero at both ends, so there is no moment where a puff blinks back to the vent */
        _s.multiplyScalar(0.15 + Math.sin(Math.PI * u) * 1.05)
        _e.set(0, t * r.spin! * (it.ph > 3.14 ? 1 : -1), 0, 'YXZ')
        _q.multiply(_q2.setFromEuler(_e))
      } else if (r.kind === 'bob') {
        _p.y += Math.sin(t * it.w + it.ph) * r.y!
        _e.set(0, Math.sin(t * it.w * 0.61 + it.gp) * r.yaw!, 0, 'YXZ')
        _q.multiply(_q2.setFromEuler(_e))
      } else if (r.kind === 'swim') {
        it.a += it.w * dt
        const ca = Math.cos(it.a)
        const sa = Math.sin(it.a)
        _p.set(
          it.cx + ca * it.r,
          it.p.y + (r.bobY ? Math.sin(t * 1.4 + it.ph) * r.bobY : 0),
          it.cz + sa * it.r,
        )
        /* nose on the tangent, plus the swish — a fish that holds a rigid heading round a bend is
           a bath toy */
        it.vx = -sa * it.side
        it.vz = ca * it.side
        _e.set(0, lifeYaw(r, it.vx, it.vz) + Math.sin(t * 3.1 + it.ph) * r.swish!, 0, 'YXZ')
        _q.setFromEuler(_e)
      } else if (r.kind === 'sail') {
        const rr = shore!.at(it.a) * it.frac
        /* radians a second from the speed over the ground and the radius of the lap it is on
           RIGHT HERE, so a boat rounding a narrow bearing does not slow down */
        it.a += (it.spd / Math.max(1, rr)) * it.side * dt
        const ca = Math.cos(it.a)
        const sa = Math.sin(it.a)
        _p.set(it.cx + ca * rr, it.p.y + Math.sin(t * 0.62 + it.ph) * r.bobY!, it.cz + sa * rr)
        /* rocking, on a slower clock than the heading: a hull on open water rolls whether or not
           it is turning */
        it.vx = -sa * it.side
        it.vz = ca * it.side
        _e.set(
          Math.sin(t * 0.51 + it.gp) * r.rock! * 0.6,
          lifeYaw(r, it.vx, it.vz),
          Math.sin(t * 0.73 + it.ph) * r.rock!,
          'YXZ',
        )
        _q.setFromEuler(_e)
      } else {
        const gust = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.23 + it.gp))
        _e.set(
          0,
          Math.sin(t * it.w + it.ph) * r.yaw! * gust,
          Math.sin(t * it.w * 1.7 + it.ph) * r.roll! * gust,
          'YXZ',
        )
        _q.multiply(_q2.setFromEuler(_e))
      }

      _m.compose(_p, _q, _s)
      if (it.i >= 0) (it.o as InstancedMesh).setMatrixAt(it.i, _m)
      else { it.o.matrix.copy(_m); it.o.matrixWorldNeedsUpdate = true }

      /* and anyone aboard rides the same transform. The inverse of the authored pose never changes,
         so it is cached — a matrix inversion per passenger per frame is three hundred a second to
         compute the same six answers. */
      if (r.deck) {
        if (!it.inv) it.inv = new Matrix4().compose(it.p, it.q, it.s).invert()
        it.delta = (it.delta ?? new Matrix4()).multiplyMatrices(_m, it.inv)
      }

      /* THE WAKE SITS ON THE WATER, NOT ON THE HULL. A boat rides twelve units low and a duck
         three, and following either would put the mark under the surface or floating over it. */
      if (it.wake >= 0 && wakeMesh) {
        const bow = it.len * it.rule.wake![2]
        _q2.setFromEuler(_e.set(0, Math.atan2(-it.vx, -it.vz), 0, 'YXZ'))
        wakeMesh.setMatrixAt(it.wake, _m.compose(
          _p.set(_p.x + it.vx * bow, LAKE_Y + WAKE_LIFT, _p.z + it.vz * bow),
          _q2,
          _s.set(it.wid * it.rule.wake![1], 1, it.len * it.rule.wake![0]),
        ))
      }
    }

    for (const f of riders) {
      if (!f.boat.delta) continue
      _m.multiplyMatrices(f.boat.delta, f.authored)
      if (f.i >= 0) (f.o as InstancedMesh).setMatrixAt(f.i, _m)
      else { f.o.matrix.copy(_m); f.o.matrixWorldNeedsUpdate = true }
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true
    if (wakeMesh) wakeMesh.instanceMatrix.needsUpdate = true
  }

  /* placed before the first frame, or the wakes arrive at the origin */
  tick(0)

  return {
    riderMeshes: meshes.filter((m) => /^boat-riders-/.test(m.name)),
    items: items.length,
    boats: sails.length,
    riders: riders.length,
    wakes: wakers.length,
    moored: items.filter((it) => it.still).length,
    tick,
    dispose: () => {
      if (wakeMesh) {
        scene.remove(wakeMesh)
        wakeMesh.geometry.dispose()
        ;(wakeMesh.material as ShaderMaterial).dispose()
      }
    },
  }
}

/* ==================================================================================================
   WHOEVER IS IN THE BOAT GOES WITH THE BOAT.

   A rider is anything whose origin sits inside the hull's footprint, and it is welded by the one
   transform that cannot get the pose wrong:

       rider_now = boat_now * boat_authored⁻¹ * rider_authored

   Nothing is measured or re-derived: whatever Robbie set, in position, heading and scale, survives
   exactly, and it would survive a boat that pitched as well as rolled.

   MEASURED IN THIS EXPORT: six boats, each with one passenger and one chochin. The lanterns were
   put there by `models/dress_world.py` and re-exported, so they arrive as real objects on the deck
   and need nothing built for them — which is the whole of what this port's boat lantern is.

   A PASSENGER LIFTED OUT OF THE CROWD LOSES THE IDLE, which is the part that is not obvious. Those
   figures are instances of the crowd's own meshes, so they carry its material — and the idle hashes
   its phase from `instanceMatrix[3]`, the instance's own POSITION. That is exactly right for a
   thousand people who never move and exactly wrong for one who does: every frame the boat carries
   them further, the hash re-rolls, and the figure shivers. So a rider is lifted out of the crowd
   mesh — its instance there scaled to nothing — and re-seated in a mesh of its own wearing an
   un-idled material.
   ================================================================================================== */
const RIDER_SKIP = /Boat|Duck|Heron|Water|Surfaces|Terrain/i

function collectRiders(
  root: Object3D, crowd: CrowdField | null, riderMaterial: Material | null,
  sails: LifeItem[], out: Rider[], meshes: InstancedMesh[],
): void {
  const found: Rider[] = []
  const m = new Matrix4()
  /* WITHOUT THIS, A NON-INSTANCED RIDER IS TESTED AT THE ORIGIN. three composes `matrix` from a
     node's position/quaternion/scale during render, so before the first frame it is still the
     identity — and this runs at load. */
  root.updateMatrixWorld(true)

  const test = (o: Object3D, mat: Matrix4, i: number) => {
    for (const it of sails) {
      const e = mat.elements
      const dy = e[13] - it.p.y
      if (dy < -60 || dy > 260) continue
      if (Math.hypot(e[12] - it.p.x, e[14] - it.p.z) > it.rule.deck!) continue
      found.push({ o, i, boat: it, authored: mat.clone() })
      return
    }
  }
  const look = (o: Object3D) => {
    const mesh = o as InstancedMesh
    if (!mesh.isMesh) return
    if (RIDER_SKIP.test(o.name)) return
    if (mesh.isInstancedMesh) {
      for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); test(o, m, i) }
    } else {
      /* `matrix`, not `matrixWorld` — the tick writes back into `o.matrix`, so the pose has to be
         captured in the same space it will later be replaced in */
      test(o, o.matrix, -1)
    }
  }
  root.traverse(look)

  /* re-seat the ones riding on a crowd mesh */
  const crowdMeshes = crowd?.meshes ?? []
  const seats = new Map<string, { geo: InstancedMesh['geometry']; n: number }>()
  for (const f of found) {
    if (f.i < 0 || !crowdMeshes.includes(f.o as InstancedMesh)) continue
    const geo = (f.o as InstancedMesh).geometry
    const s = seats.get(geo.uuid)
    if (s) s.n++
    else seats.set(geo.uuid, { geo, n: 1 })
  }
  const built = new Map<string, InstancedMesh>()
  /* THE UN-IDLED MATERIAL IS THE WALKERS' OWN, and it has to be: it is a clone of the crowd's source
     that has been through `breathe` and has no idle chained onto it. Falling back to the raw source
     would give a passenger no mist, no cover and no rim -- a person-shaped hole in the air, sailing. */
  const seatMat = riderMaterial ?? crowd?.source ?? null
  if (seats.size && seatMat) {
    for (const [uuid, s] of seats) {
      const im = new InstancedMesh(s.geo, seatMat, s.n)
      im.name = `boat-riders-${built.size}`
      im.frustumCulled = false
      im.castShadow = false
      im.receiveShadow = true
      im.count = 0
      root.add(im)
      meshes.push(im)
      built.set(uuid, im)
    }
  }

  const gone = new Matrix4().makeScale(0, 0, 0)
  for (const f of found) {
    const seat = f.i >= 0 && crowdMeshes.includes(f.o as InstancedMesh)
      ? built.get((f.o as InstancedMesh).geometry.uuid)
      : undefined
    if (seat) {
      const from = f.o as InstancedMesh
      /* out of the crowd, where the idle would shiver it */
      from.setMatrixAt(f.i, gone)
      from.instanceMatrix.needsUpdate = true
      f.o = seat
      f.i = seat.count++
    }
    /* AND THE MESH IT RIDES IN HAS TO BE TOLD, WHICH IS WHY THE MOCKUP'S LANTERNS STAYED AT THE
       MOORING. `setMatrixAt` writes a CPU array and nothing else; the upload happens only where
       `instanceMatrix.needsUpdate` is set, and the sweep that sets it runs over the list below. A
       re-seated passenger is in that list because its mesh was built ten lines up; a rider that
       arrived from the world ALREADY instanced never was, so its matrices were rewritten sixty
       times a second and uploaded none of them.
       The bounding sphere goes with it: an InstancedMesh culls against the sphere three computed
       from the matrices it had AT LOAD, and a set that now sails a lap of the lake would blink out
       the moment its moored footprint left the frustum. */
    const mesh = f.o as InstancedMesh
    if (mesh.isInstancedMesh && !meshes.includes(mesh)) {
      mesh.frustumCulled = false
      meshes.push(mesh)
    } else if (!mesh.isInstancedMesh) {
      /* a plain-mesh rider has to stop recomputing its own matrix, or the weld is written and then
         discarded before it can reach the renderer */
      f.o.matrixAutoUpdate = false
    }
    f.o.castShadow = false
    out.push(f)
  }
}
