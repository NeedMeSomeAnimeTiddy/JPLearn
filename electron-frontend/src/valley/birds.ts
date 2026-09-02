import { Euler, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { walkRnd } from './walk'

/* ==================================================================================================
   AND THE BIRDS ARE NOT HANGING THERE EITHER.

   107 of them — measured: 78 `PROP_bird_0` and 29 `PROP_bird_1` — and every one is AIRBORNE, 395 to
   2,187 units up with a median of about 1,150 and nothing under any of them. That is the last thing
   in this valley that is unmistakably wrong rather than merely still: a person standing motionless
   is something people do, and a bird hovering is not.

   THE ROUTE IS DERIVED FROM THE PLACEMENT, WHICH IS THE WHOLE TRICK. All 107 were aimed by hand and
   all 107 have distinct headings, and the instruction those placements carry is that they are
   STARTING POINTS rather than fixed positions. So nothing here is authored twice: each bird's
   circuit is the circle that passes through where it was put, tangent to the way it was pointed.
   Move a bird in Blender and its whole flight moves with it, and there is no table to keep in step.

   NO WING FLAP IN THE GEOMETRY, AND THAT IS A MEASUREMENT NOT AN OMISSION — but there IS one in the
   matrix, which is the part worth reading twice. A wing folds up: seen from anywhere but dead
   astern that narrows the span and deepens the profile. So the beat squeezes the bird's own local X
   — its 15-unit wingspan — and stretches its local Y, on a clock of its own. At the dozen pixels a
   bird is from the menu ridge the SHAPE is all there is to see, and a shape that changes is a bird
   where a shape that does not is a speck of dirt on the screen. `compose` scales in local axes
   before it rotates, so this is the bird's own span and not the world's x.

   AND EVERYTHING ELSE THAT STOPS A CIRCLE LOOKING LIKE A CIRCLE. A dark dash on a perfect circle at
   a constant speed is a fly — which is what the mockup's author was told it looked like. Four
   things fix it and none needs a shader: the silhouette beats, the radius breathes, the centre
   drifts, and the speed answers to the climb.

   THEY DO NOT CAST, for the same reason the walkers do not: the shadow map is built once.
   ================================================================================================== */

/** what a bird is called, after `collapseToInstances` has renamed the batch */
export const BIRD_RE = /Bird/i

export const BIRD = {
  /* 7 m/s at 37 units to the metre — a soaring bird, not a swift. The mockup says 205 from "29
     units to the metre", which is the same stale figure its walkers were paced by; this world's
     people are 65.5 units, so the metre is 37 units and 7 m/s is 259. */
  speed: 259,
  vary: 0.3,
  /** how far they rise and fall on the thermals */
  bob: 105,
  /** radians of roll in the tightest turn */
  bank: 0.5,
  /** the smallest and largest circuit, so the sky has tight circlers and wide soarers */
  radius: [700, 4000] as const,
}

interface Bird {
  mesh: InstancedMesh
  i: number
  side: number
  r: number
  cx: number
  cz: number
  y0: number
  sc: number
  a: number
  w: number
  /** its own place in the rise and fall, and its own period */
  bp: number
  bw: number
  /** the wing clock, ~1.6 to 3.4 beats a second */
  fw: number
  fp: number
  flap: number
  /** the envelope that makes them glide between */
  gw: number
  gp: number
  /** the circuit breathes in and out */
  rw: number
  rp: number
  /** and wanders, so no lap repeats the last one */
  dw: number
  dp: number
}

export interface BirdField {
  birds: number
  meshes: InstancedMesh[]
  tick: (seconds: number) => void
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()
const _f = new Vector3()

export function buildBirds(root: Object3D): BirdField {
  const birds: Bird[] = []
  const meshes: InstancedMesh[] = []

  root.traverse((o) => {
    const mesh = o as InstancedMesh
    if (!mesh.isInstancedMesh || !BIRD_RE.test(o.name)) return
    o.castShadow = false
    /* a circuit leaves the bounding sphere it was built from */
    mesh.frustumCulled = false
    meshes.push(mesh)
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m)
      _m.decompose(_p, _q, _s)
      const k = birds.length
      /* the way it was pointed, flattened: a circuit is a plan-view circle */
      _f.set(0, 0, 1).applyQuaternion(_q).setY(0)
      if (_f.lengthSq() < 1e-6) _f.set(1, 0, 0)
      _f.normalize()
      const side = walkRnd(k, 11) < 0.5 ? -1 : 1
      const r = BIRD.radius[0] + walkRnd(k, 12) * (BIRD.radius[1] - BIRD.radius[0])
      const rp = walkRnd(k, 22) * 6.2831
      const dp = walkRnd(k, 24) * 6.2831
      /* THE CENTRE SITS ONE RADIUS OFF TO THE SIDE IT TURNS TOWARDS, which is what makes the circle
         pass through the placement AND run tangent to the heading there.

         AND IT IS SOLVED AGAINST THE WOBBLES AT t = 0, WHICH THE MOCKUP DOES NOT DO. The circuit
         breathes by ±17% and its centre wanders by up to 160, both on phases of the bird's own — so
         placing the centre one plain radius away puts the bird up to 840 units from where it was
         put on the very first frame. Measured on one: 119. Everything else here treats the authored
         placement as the truth the flight is derived FROM, and a bird that starts somewhere else is
         the same kind of wrong as a crowd six units underground. Taking the t = 0 values of both
         wobbles out of the centre costs two lines and makes the first frame exactly Robbie's. */
      const bp = walkRnd(k, 13) * 6.2831
      const r0 = r * (1 + 0.17 * Math.sin(rp))
      const dx0 = Math.sin(dp) * 160
      const dz0 = Math.cos(dp) * 160
      const cx = _p.x - dx0 - _f.z * side * r0
      const cz = _p.z - dz0 + _f.x * side * r0
      birds.push({
        mesh, i, side, r, cx, cz,
        /* the placement is where the bird IS, not the middle of the thermal it rides -- so the
           rise and fall is taken off it too. Missing this left one bird 22.7 units out where the
           other two wobbles had left it 119. */
        y0: _p.y - Math.sin(bp) * BIRD.bob,
        sc: _s.x,
        /* where on that circle it starts */
        a: Math.atan2(_p.z - dz0 - cz, _p.x - dx0 - cx),
        w: (BIRD.speed * (1 + (walkRnd(k, 15) * 2 - 1) * BIRD.vary) / r) * side,
        bp,
        bw: 0.14 + walkRnd(k, 14) * 0.2,
        fw: 10 + walkRnd(k, 16) * 11,
        fp: walkRnd(k, 17) * 6.2831,
        /* some are crows and some are kites */
        flap: 0.35 + walkRnd(k, 18) * 0.65,
        gw: 0.2 + walkRnd(k, 19) * 0.3,
        gp: walkRnd(k, 20) * 6.2831,
        rw: 0.05 + walkRnd(k, 21) * 0.09,
        rp,
        dw: 0.02 + walkRnd(k, 23) * 0.03,
        dp,
      })
    }
  })

  let t = 0
  const tick = (dt: number) => {
    if (!birds.length) return
    t += dt
    for (const b of birds) {
      const th = b.bp + t * b.bw
      const climb = Math.cos(th)
      /* SPEED ANSWERS TO THE CLIMB, which is the cheapest lifelike thing here and the most
         physical: a bird trades height for speed. Slower up, quicker down, and the lap stops
         being a metronome. */
      b.a += b.w * dt * (1 - 0.34 * climb)
      const r = b.r * (1 + 0.17 * Math.sin(t * b.rw + b.rp))
      const dx = Math.sin(t * b.dw + b.dp) * 160
      const dz = Math.cos(t * b.dw * 0.83 + b.dp) * 160
      const ca = Math.cos(b.a)
      const sa = Math.sin(b.a)
      /* THE HEADING IS THE TANGENT, differentiated from the circle rather than remembered:
         d/da (cos a, sin a) is (−sin a, cos a), and the sign of `a` running forwards is `side`.
         Model forward is +Z, and a yaw about Y sends +Z to (sin yaw, cos yaw), so yaw is the atan2
         of the velocity's x over its z — in that order, which is the half of this that is easy to
         write backwards. */
      const yaw = Math.atan2(-sa * b.side, ca * b.side)
      /* pitch is the DERIVATIVE of the height, not the height: nose up while climbing, down while
         sinking, level at the top and bottom of the thermal */
      _e.set(climb * 0.12, yaw, -b.side * BIRD.bank * Math.min(1.4, 1500 / r), 'YXZ')
      _q.setFromEuler(_e)
      const gust = 0.35 + 0.65 * Math.max(0, Math.sin(t * b.gw + b.gp))
      const beat = Math.abs(Math.sin(t * b.fw + b.fp)) ** 0.7 * b.flap * gust
      _m.compose(
        _p.set(b.cx + dx + ca * r, b.y0 + Math.sin(th) * BIRD.bob, b.cz + dz + sa * r),
        _q,
        _s.set(b.sc * (1 - 0.46 * beat), b.sc * (1 + 0.6 * beat), b.sc),
      )
      b.mesh.setMatrixAt(b.i, _m)
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true
  }

  /* placed before the first frame, or 107 birds arrive at the origin */
  tick(0)

  return { birds: birds.length, meshes, tick }
}
