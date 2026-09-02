import {
  Box3, Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, PlaneGeometry,
  Quaternion, Scene, Vector3,
} from 'three'
import { WIND_DIR, WIND_SPEED } from './atmosphere'
import { HOME_EYE } from './flight'
import { DESTINATIONS } from './destinations'
import { walkRnd } from './walk'

/* ==================================================================================================
   WHAT THE TREES LET GO OF.

   Measured in this export: 24 sakura, 34 red momiji, 4 ginkgo — and 110 GREEN momiji, which are not
   in this list. A maple in green leaf does not shed, and `PROP_momiji_g0/g1` is what Robbie called
   the ones that are still green; the mockup matches `/Momiji/i` whole and drops orange leaves off
   all of them. Splitting on the model's own name is one character of regexp and it is the
   difference between autumn happening where it is autumn and autumn happening everywhere.

   SITED WHERE THE CAMERA STOPS, which is a change of policy from everything else here. The birds,
   the walkers and the boats spread evenly over the whole valley because they are read at distance
   and a bare quarter of the map would show. A petal is ten units across — a third of a metre at this
   world's scale — and from the menu ridge that is a fraction of a pixel. It only exists at a
   destination, so the count is weighted toward one.

   AND `reach` IS A WEIGHT RATHER THAN A GATE, which is the mockup's own correction to itself: it
   used to reject any tree further than 3,400 from a camera stop, which left two fifths of them
   shedding and the rest standing bare forever. The original reasoning still holds — a ten-unit petal
   is sub-pixel from the ridge, so spending the whole budget on the far half spends it on nothing —
   but the answer is not to leave trees out, it is to give the near ones more. `near` and `far` are
   petals PER TREE, so the count follows from the world instead of being a total divided up, which is
   the only way to promise that no tree gets zero.

   THE CANOPY COMES FROM THE BOUNDING BOX, NOT THE INSTANCE POSITION. Some of these are placed by
   their matrix and some have the position baked into their vertices, so asking the matrix where a
   tree is gets the right answer for one kind and the world origin for the other. The box is right
   for both.
   ================================================================================================== */

export interface PetalKind {
  m: RegExp
  size: number
  col: number
}

export const PETAL_KINDS: readonly PetalKind[] = [
  { m: /Sakura|Ume/i, size: 11, col: 0xf7cadb },
  /* the RED maples only -- `MomijiG` is a maple still in green leaf */
  { m: /MomijiR/i, size: 13, col: 0xe0812f },
  { m: /Ginkgo|Icho/i, size: 12, col: 0xe8c34a },
]

export const PETAL = {
  /** how close to a camera stop a tree has to be to count as near */
  reach: 3400,
  /** petals per tree, near a stop and far from one */
  near: 9,
  far: 3,
  /** units a second, which at 37 to the metre is a drifting fall */
  fall: 27,
  /** how far it wanders side to side on the way down */
  sway: 30,
  /** tumble, radians a second */
  spin: 1.6,
  /* THE GLIDE ANGLE, AND IT IS THE WHOLE OF WHETHER A PETAL EVER LEAVES ITS TREE. The mockup began
     at 0.30 of a 300-unit wind: 90 units a second sideways against 27 down is a 73-degree glide, so
     a petal crossed its leash in 2.7 seconds having fallen seventy-three units, which on these
     canopies is still inside the leaves — and then started again at the top. Measured there: 248 of
     540 recycled inside a second and a half, every one living and dying in the top of the foliage,
     which is exactly what "stuck floating inside the tree" looks like.
     0.09 puts the carry at 27 a second against 27 down — a 45-degree glide, which is what a petal
     does, and 420 units of fall before the leash matters at all. */
  drift: 0.09,
  /** and how far it may get from its own tree before starting again */
  wander: 420,
  /* SHED FROM THE RIM, NOT FROM THE MIDDLE. The first seeding put petals anywhere in the canopy
     disc, which for the inner half is inside opaque foliage — a petal there is not falling visibly,
     it is occluded. Real blossom lets go at the drip line, and a petal that starts at the outside
     edge is in clear air from its first frame. */
  ring: [0.74, 1.16] as const,
  /** and how far down from the top of the tree it lets go, as a fraction of the tree */
  crown: 0.22,
  /** how far the colour is taken down at full night */
  night: 0.72,
}

interface Source {
  x: number
  z: number
  top: number
  bot: number
  r: number
  near: boolean
}

interface Petal {
  /** start again at the top of its own tree, on its next life's numbers */
  reseed?: () => void
  s: Source
  size: number
  mesh: InstancedMesh
  i: number
  ph: number
  sw: number
  sp: number
  ax: Vector3
  a: number
  x: number
  y: number
  z: number
}

export interface PetalField {
  petals: number
  /** how many trees shed, and how many of those are near a camera stop */
  sources: number
  nearSources: number
  meshes: InstancedMesh[]
  tick: (seconds: number) => void
  /** 0 is broad day, 1 is full night */
  setNight: (on: number) => void
  dispose: () => void
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _box = new Box3()
const _im = new Matrix4()

/** where a petal lets go: on the drip line, near the top, at a random bearing */
function seed(p: Petal, first: boolean, rnd: (salt: number) => number): void {
  const a = rnd(81) * 6.2831
  const r = p.s.r * (PETAL.ring[0] + rnd(82) * (PETAL.ring[1] - PETAL.ring[0]))
  p.x = p.s.x + Math.cos(a) * r
  p.z = p.s.z + Math.sin(a) * r
  const h = p.s.top - p.s.bot
  /* FIRST TIME OUT THEY ARE SCATTERED DOWN THE WHOLE FALL, so the trees are not all in bloom at
     once on the first frame and then never again */
  p.y = first ? p.s.bot + rnd(83) * h : p.s.top - rnd(83) * h * PETAL.crown
}

export function buildPetals(scene: Scene, root: Object3D): PetalField {
  const eyes = [HOME_EYE, ...Object.values(DESTINATIONS).map((d) => d.eye)]
  const isNear = (x: number, z: number): boolean =>
    eyes.some((e) => Math.hypot(x - e[0], z - e[2]) < PETAL.reach)

  const meshes: InstancedMesh[] = []
  const items: Petal[] = []
  const mats: MeshBasicMaterial[] = []
  let sources = 0
  let nearSources = 0

  PETAL_KINDS.forEach((kind, ki) => {
    const src: Source[] = []
    root.traverse((o) => {
      const mesh = o as InstancedMesh
      if (!mesh.isMesh || !kind.m.test(o.name)) return
      const geo = mesh.geometry
      if (!geo) return
      if (!geo.boundingBox) geo.computeBoundingBox()
      mesh.updateWorldMatrix(true, false)
      const take = (mm: Matrix4) => {
        _box.copy(geo.boundingBox!).applyMatrix4(mm)
        const cx = (_box.min.x + _box.max.x) / 2
        const cz = (_box.min.z + _box.max.z) / 2
        src.push({
          x: cx,
          z: cz,
          /* the shedding volume is the top of the canopy, and the fall ends at the trunk's own
             foot rather than at a ground lookup -- a petal that drifts thirty units sideways has
             not moved onto different ground */
          top: _box.max.y,
          bot: _box.min.y,
          r: Math.max(40, Math.min(_box.max.x - _box.min.x, _box.max.z - _box.min.z) * 0.42),
          near: isNear(cx, cz),
        })
      }
      if (mesh.isInstancedMesh) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, _im)
          _im.premultiply(mesh.matrixWorld)
          take(_im)
        }
      } else take(mesh.matrixWorld)
    })
    if (!src.length) return
    sources += src.length
    nearSources += src.filter((s) => s.near).length

    const share = src.map((s) => (s.near ? PETAL.near : PETAL.far))
    const total = share.reduce((a, v) => a + v, 0)
    /* BASIC, NOT LIT, AND THEN DIMMED BY HAND. A petal is a flat double-sided quad tumbling in the
       air: give it a lit material and it goes black every time its back is to the sun, which is
       half of every rotation. Unlit keeps it a petal — but unlit also means it does not know the
       sun has set, and a valley of pale flecks glowing at midnight is worse than no petals. */
    const mat = new MeshBasicMaterial({
      color: kind.col, side: DoubleSide, transparent: true, opacity: 0.95, fog: true,
    })
    mat.userData.day = new Color(kind.col)
    mats.push(mat)
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, total)
    mesh.name = `petals-${ki}`
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    scene.add(mesh)
    meshes.push(mesh)

    /* WALKED PER SOURCE, NOT PER PETAL, so "every tree sheds" is guaranteed by the shape of the
       loop rather than by a modulo happening to come out even. The mockup's `src[i % src.length]`
       silently gave the last few trees nothing whenever the count was not a multiple. */
    let i = 0
    src.forEach((s, si) => {
      for (let n = 0; n < share[si]; n++) {
        const h = i + ki * 977
        const p: Petal = {
          s,
          size: kind.size * (0.7 + walkRnd(h, 61) * 0.6),
          mesh,
          i,
          ph: walkRnd(h, 62) * 6.2831,
          sw: 0.5 + walkRnd(h, 63) * 1.1,
          sp: 0.65 + walkRnd(h, 64) * 0.8,
          ax: new Vector3(walkRnd(h, 65) - 0.5, walkRnd(h, 66) - 0.5, walkRnd(h, 67) - 0.5)
            .normalize(),
          a: walkRnd(h, 68) * 6.2831,
          x: 0, y: 0, z: 0,
        }
        /* SEEDED OFF THE SAME HASH THE REST OF THE VALLEY USES, not `Math.random`. The mockup reaches
           for Math.random here and nowhere else, which makes the one system in the world whose first
           frame cannot be photographed twice — and every measurement taken in this port has needed
           two shots of the same pose. `life` is bumped per re-seed so a petal that starts again does
           not land in the same place. */
        let life = 0
        seed(p, true, (salt) => walkRnd(h + life * 7919, salt))
        p.reseed = () => { life++; seed(p, false, (salt) => walkRnd(h + life * 7919, salt)) }
        items.push(p)
        i++
      }
    })
  })

  let t = 0
  const tick = (dt: number) => {
    if (!items.length) return
    t += dt
    const carry = WIND_SPEED * PETAL.drift
    for (const p of items) {
      p.y -= PETAL.fall * p.sp * dt
      /* the sway is a lateral wander ACROSS the fall, not a wobble on the spot */
      const s = Math.sin(t * p.sw + p.ph) * PETAL.sway * dt
      p.x += WIND_DIR.x * carry * dt - WIND_DIR.y * s
      p.z += WIND_DIR.y * carry * dt + WIND_DIR.x * s
      /* BACK TO THE TREE WHEN IT HAS WANDERED FAR ENOUGH, and this is not optional. A petal takes
         thirty seconds to fall the height of a canopy at 27 units a second, and thirty seconds of
         wind at even a third of its speed is nearly three thousand units — the mockup measured 799
         before this cap and still climbing. Petals then stream across the valley in a ribbon, which
         is weather, not blossom. */
      if (p.y < p.s.bot || Math.hypot(p.x - p.s.x, p.z - p.s.z) > PETAL.wander) p.reseed?.()
      p.a += PETAL.spin * p.sp * dt
      _q.setFromAxisAngle(p.ax, p.a)
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.size))
      p.mesh.setMatrixAt(p.i, _m)
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true
  }

  const setNight = (on: number) => {
    for (const m of mats) {
      m.color.copy(m.userData.day as Color).multiplyScalar(1 - PETAL.night * on)
    }
  }

  tick(0)

  return {
    petals: items.length,
    sources,
    nearSources,
    meshes,
    tick,
    setNight,
    dispose: () => {
      for (const m of meshes) { scene.remove(m); m.geometry.dispose() }
      for (const m of mats) m.dispose()
    },
  }
}
