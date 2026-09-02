import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Group, LinearFilter, MathUtils, Mesh,
  MeshBasicMaterial, Object3D, PerspectiveCamera, RGBAFormat, Scene, Sprite, SpriteMaterial,
  Vector3, type Texture,
} from 'three'

/* ==================================================================================================
   THE ORIGAMI CRANE (折鶴), AND THE ONE THING IN THIS SCENE THAT IS NOT IN THE VALLEY.

   Everything else drawn here is 6,000 units away and belongs to a place: the town has its steam, the
   lake its boats, the meadow its walkers. All of it is BACKGROUND, and background can only ever be
   background -- the menu sits in front of a landscape, and a landscape at that distance moves like
   weather rather than like anything alive.

   The crane is the near field. A hundred and fifteen units of folded gold paper about four hundred
   from the eye, which is a third of the frame's width and close enough to cross behind the type --
   so the menu is something you are looking THROUGH rather than something laid on a picture. It is
   the only object in this build that has parallax against the interface.

   FOLDED, NOT MODELLED. Fifteen single triangles, double-sided, in four flat golds and one red for
   the beak. That is the whole mesh, and it is right rather than cheap: an orizuru IS flat planes
   meeting at creases, so faceted unlit triangles catching different values is what the paper
   actually does. Lit, it would go smooth and stop reading as paper.

   AND IT KEEPS ITS OWN COUNSEL. It does not follow the pointer -- it drifts between waypoints it
   picks itself, and it slips ASIDE if the pointer crowds it, which is the whole of its character:
   something living in the frame that is aware of you and not interested in you. When a menu is open
   it keeps to the edges instead of crossing the words.
   ================================================================================================== */

/* the paper, and one red fold for the beak */
const GOLD = 0xcfa45c
const GOLD_HI = 0xe8c47c
const GOLD_LO = 0x8f713a
const BEAK = 0xe34a33

export const CRANE = {
  /** how far in front of the eye it flies, and how far that wanders */
  depth: [410, 600] as const,
  /** the spring that pulls it at its target, and the drag that keeps it from arriving */
  pull: 2.1,
  drag: 2.6,
  /* HOW FAST IT IS ALLOWED TO GO, AND THERE IS ONE FIGURE RATHER THAN THE MOCKUP'S TWO. Its cap is
     `t < wander.dashT ? 1500 : 720`, and `dashT` is initialised to 0 and never written again --
     there is no dash, and there has not been one for as long as the file has existed. Ported as
     what it does rather than as what it says. */
  speed: 720,
  /** how long between waypoints */
  every: [5, 9.5] as const,
  /** how close the pointer has to come, in frame units, before it shies away */
  shy: 0.3,
  /** it leaves paper dust above this speed, and no faster than this often */
  trail: { over: 260, every: 0.09, life: 0.6, rise: 26, size: 10, pool: 24 },
}

/* THE NAME IS LOAD-BEARING: `INK_SKIP` matches it, which is what keeps the outline pass off the
   crane. The mockup gets that for free by drawing it in a scene of its own; here there is one scene,
   so the exemption has to be sayable, and a name is the only channel a mesh has. */
export const CRANE_NAME = 'crane-orizuru'

export interface Crane {
  group: Group
  /* WHAT THE MIRROR MUST NOT SEE. The crane flies four hundred units from the eye and the lake is
     three thousand away: reflected, it is a gold shape the width of the water. The mockup gets this
     for free by drawing it in a scene the reflection pass never renders; here it is a list. */
  hide: readonly Object3D[]
  /** seconds since the last frame, and the running clock; `busy` is "a menu is open" */
  tick: (dt: number, t: number, camera: PerspectiveCamera, busy: boolean) => void
  dispose: () => void
}

function tri(
  mat: MeshBasicMaterial,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): Mesh {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    ax, ay, az, bx, by, bz, cx, cy, cz,
  ]), 3))
  const m = new Mesh(g, mat)
  m.name = CRANE_NAME
  return m
}

/* A SOFT ROUND DOT, ARITHMETIC RATHER THAN A CANVAS.
   The mockup paints a two-stop radial gradient into a 2D context, and a two-stop radial gradient is
   linear in the radius -- so this is the same image with the drawing step taken out. It is not
   tidiness: the port's whole texture practice is `DataTexture` (see the toon ramps), and a canvas
   context under jsdom has no `createRadialGradient` at all, so a canvas here would mean the crane
   could not be built in a test. */
export function softDot(r: number, g: number, b: number, size = 32): Texture {
  const data = new Uint8Array(size * size * 4)
  const mid = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const d = Math.hypot(x - mid, y - mid) / (size / 2)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = Math.round(255 * Math.max(0, 1 - d))
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * Build the crane and hand back its tick.
 *
 * `still` is reduced motion: the bird is parked in the corner of the frame rather than removed, so
 * the near field still has something in it and nothing moves.
 */
export function buildCrane(scene: Scene, still = false): Crane {
  const group = new Group()
  group.name = CRANE_NAME

  const gold = new MeshBasicMaterial({ color: GOLD, side: DoubleSide, fog: false })
  const goldHi = new MeshBasicMaterial({ color: GOLD_HI, side: DoubleSide, fog: false })
  const goldLo = new MeshBasicMaterial({ color: GOLD_LO, side: DoubleSide, fog: false })
  const beak = new MeshBasicMaterial({ color: BEAK, side: DoubleSide, fog: false })
  const mats = [gold, goldHi, goldLo, beak]

  /* body: a faceted diamond along +z, which is forward */
  const body = new Group()
  body.add(tri(gold, 0, 8, 26, -12, 0, 0, 0, -7, 8))
  body.add(tri(goldLo, 0, 8, 26, 12, 0, 0, 0, -7, 8))
  body.add(tri(goldLo, 0, 8, 26, -12, 0, 0, 0, 2, -26))
  body.add(tri(gold, 0, 8, 26, 12, 0, 0, 0, 2, -26))
  group.add(body)

  /* neck and head: a rising forward crease */
  const neck = new Group()
  neck.add(tri(goldHi, 0, 8, 24, -3, 10, 30, 0, 34, 46))
  neck.add(tri(gold, 0, 8, 24, 3, 10, 30, 0, 34, 46))
  neck.add(tri(goldHi, 0, 34, 46, -2, 30, 50, 0, 26, 60))
  neck.add(tri(gold, 0, 34, 46, 2, 30, 50, 0, 26, 60))
  neck.add(tri(beak, 0, 26, 60, 0, 30, 56, 0, 24, 70))
  group.add(neck)

  /* the tail spike */
  group.add(tri(goldLo, 0, 6, -24, -2, 2, -26, 0, 26, -52))
  group.add(tri(gold, 0, 6, -24, 2, 2, -26, 0, 26, -52))

  /* the wings, big folded triangles pivoted at the spine */
  const wingL = new Group()
  const wingR = new Group()
  wingL.add(tri(goldHi, 0, 6, 14, -64, 26, -6, 0, 4, -18))
  wingL.add(tri(gold, 0, 6, 14, -50, 18, -22, 0, 4, -18))
  wingR.add(tri(gold, 0, 6, 14, 64, 26, -6, 0, 4, -18))
  wingR.add(tri(goldLo, 0, 6, 14, 50, 18, -22, 0, 4, -18))
  group.add(wingL, wingR)

  group.scale.setScalar(0.9)
  /* NEVER CULLED, and this is the one place where that is the right answer rather than the lazy
     one: the group's own bounding sphere is computed from a child at the origin, and the crane is a
     hundred units of geometry hanging off a point four hundred from the eye. */
  group.frustumCulled = false
  scene.add(group)

  /* the paper dust, as a recycled pool -- fifteen triangles must not be able to allocate. In a
     group of its own because the sprites hold WORLD positions: parented to the crane they would be
     dragged along behind it instead of being left in the air where they were shed. */
  const dustTex = softDot(232, 196, 124, 32)
  const dustGroup = new Group()
  dustGroup.name = CRANE_NAME + '-dust'
  scene.add(dustGroup)
  const dust: { sprite: Sprite; life: number }[] = []
  for (let i = 0; i < CRANE.trail.pool; i++) {
    const s = new Sprite(new SpriteMaterial({
      map: dustTex, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }))
    s.name = CRANE_NAME
    s.scale.set(CRANE.trail.size, CRANE.trail.size, 1)
    s.visible = false
    s.frustumCulled = false
    dustGroup.add(s)
    dust.push({ sprite: s, life: 0 })
  }
  let dustAt = 0

  const pos = new Vector3()
  const vel = new Vector3()
  const target = new Vector3()
  /* ARRIVES WHERE IT BELONGS RATHER THAN FLYING IN FROM THE ORIGIN, which is a deviation and a
     deliberate one. The mockup seeds the bird at (300, 100, 420) in WORLD space and lets the spring
     carry it to its first waypoint -- and the menu eye stands at (0, 2000, 6000), so that is 5,400
     units at a capped 720 a second: eight seconds of a gold crane streaking across the valley every
     time the app opens. Measured here at four seconds in, it was still 3,193 units from the eye
     instead of 430. Snapping the first frame costs nothing and is invisible. */
  let seeded = false
  let bank = 0
  let heading = 0
  let flap = 0
  let lastTrail = 0

  /* the waypoint it is drifting toward, in frame coordinates */
  const wander = { nx: 0.55, ny: 0.25, depth: 430, next: 6 }
  let mouseNX = 0
  let mouseNY = 0
  const onMove = (e: PointerEvent) => {
    mouseNX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1
    mouseNY = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1)
  }
  window.addEventListener('pointermove', onMove, { passive: true })

  const retarget = (t: number, busy: boolean) => {
    wander.next = t + CRANE.every[0] + Math.random() * (CRANE.every[1] - CRANE.every[0])
    if (busy) {
      /* a menu is open -- keep to the edges rather than flying across the content */
      wander.nx = (Math.random() < 0.5 ? -1 : 1) * (0.62 + Math.random() * 0.28)
      wander.ny = 0.3 + Math.random() * 0.5
    } else {
      wander.nx = -0.8 + Math.random() * 1.65
      wander.ny = -0.35 + Math.random() * 1.05
    }
    wander.depth = CRANE.depth[0] + Math.random() * (CRANE.depth[1] - CRANE.depth[0])
  }

  const _unproj = new Vector3()
  const _look = new Vector3()

  const aimAt = (t: number, camera: PerspectiveCamera, busy: boolean) => {
    if (t > wander.next) retarget(t, busy)
    let nx = wander.nx + Math.sin(t * 0.7) * 0.06
    let ny = wander.ny + Math.sin(t * 1.1) * 0.05 + Math.sin(t * 0.35) * 0.03
    /* shy: it slips aside if the pointer crowds it */
    const dx = nx - mouseNX
    const dy = ny - mouseNY
    const d2 = dx * dx + dy * dy
    if (d2 < CRANE.shy * CRANE.shy) {
      const d = Math.sqrt(d2) || 0.01
      nx += (dx / d) * (CRANE.shy - d)
      ny += (dy / d) * (CRANE.shy - d) * 0.7
    }
    nx = MathUtils.clamp(nx, -0.85, 0.9)
    ny = MathUtils.clamp(ny, -0.6, 0.75)
    _unproj.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize()
    target.copy(camera.position).addScaledVector(_unproj, wander.depth)
  }

  const tick = (dt: number, t: number, camera: PerspectiveCamera, busy: boolean) => {
    if (still) {
      /* parked off to one side of the frame, and it stays there */
      group.position.set(
        camera.position.x + 260, camera.position.y + 60, camera.position.z - 320,
      )
      return
    }
    aimAt(t, camera, busy)
    if (!seeded) { seeded = true; pos.copy(target); vel.set(0, 0, 0) }
    /* a soft spring with drag -- the crane glides, laggy and calm */
    vel.x += (target.x - pos.x) * CRANE.pull * dt
    vel.y += (target.y - pos.y) * CRANE.pull * dt
    vel.z += (target.z - pos.z) * CRANE.pull * dt
    vel.multiplyScalar(Math.max(0, 1 - CRANE.drag * dt))
    const sp = vel.length()
    if (sp > CRANE.speed) vel.multiplyScalar(CRANE.speed / sp)
    pos.addScaledVector(vel, dt)
    group.position.copy(pos)

    /* face the way it is travelling, and bank into the turn */
    if (sp > 12) {
      const now = Math.atan2(vel.x, vel.z)
      let dh = now - heading
      if (dh > Math.PI) dh -= Math.PI * 2
      if (dh < -Math.PI) dh += Math.PI * 2
      bank += (MathUtils.clamp(-dh * 14, -0.55, 0.55) - bank) * 0.1
      heading = now
      _look.copy(pos).addScaledVector(vel, 0.5)
      group.lookAt(_look)
      group.rotateZ(bank)
    }

    /* brisk when pushing, a slow glide when cruising */
    const amp = sp > 320 ? 0.24 : 0.52
    flap += dt * (4.2 + sp * 0.011)
    const w = Math.sin(flap) * amp
    wingL.rotation.z = w
    wingR.rotation.z = -w
    neck.rotation.x = Math.sin(flap * 0.5) * 0.05

    /* gold paper dust when it hurries */
    if (sp > CRANE.trail.over && t - lastTrail > CRANE.trail.every) {
      lastTrail = t
      const slot = dust[dustAt++ % dust.length]
      slot.life = CRANE.trail.life
      slot.sprite.position.copy(pos)
      slot.sprite.visible = true
    }
    for (const d of dust) {
      if (d.life <= 0) continue
      d.life -= dt
      const u = Math.max(0, d.life / CRANE.trail.life)
      ;(d.sprite.material as SpriteMaterial).opacity = 0.7 * u
      d.sprite.position.y -= CRANE.trail.rise * (dt / CRANE.trail.life)
      if (d.life <= 0) d.sprite.visible = false
    }
  }

  return {
    group,
    hide: [group, dustGroup],
    tick,
    dispose: () => {
      window.removeEventListener('pointermove', onMove)
      scene.remove(group)
      scene.remove(dustGroup)
      group.traverse((o) => {
        const m = o as Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      for (const d of dust) (d.sprite.material as SpriteMaterial).dispose()
      dustTex.dispose()
      for (const m of mats) m.dispose()
    },
  }
}
