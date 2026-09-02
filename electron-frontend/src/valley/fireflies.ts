import {
  AdditiveBlending, Color, InstancedMesh, Matrix4, PlaneGeometry, Scene, ShaderMaterial, Vector3,
} from 'three'
import { DESTINATIONS } from './destinations'
import { walkRnd } from './walk'

/* ==================================================================================================
   AND THE DARK HAS THINGS IN IT.

   FIREFLIES ARE THE ONE THING HERE THAT MAY NOT BE EVERYWHERE. Sited on the same principle as the
   petals — at the places the camera stops — but tighter still: a firefly is four units across and
   reads at fifty metres, not at five hundred, so a field of them spread over the valley is a field
   of them nobody ever sees. They cluster low over ground near an eye, drift, and blink on their own
   clocks.

   Additive and unfogged, because a firefly IS light rather than a lit thing — the same argument the
   sun's halo and the lantern glow are drawn on.

   EACH PLACE IS AN EYE AND THE WAY IT LOOKS, not just an eye. Scattering knots at a random azimuth
   around a camera puts most of them behind it: the mockup's first attempt landed 420 fireflies in
   seven tidy swarms and put ZERO of them in the STUDY shot. "Where the camera stops" means where it
   is POINTING, so knots go within about fifty degrees of the view axis.

   AND HOW FAR FROM THE EYE, WHICH IS THE NUMBER THE MOCKUP'S FIRST THREE SITINGS ALL MISSED. Every
   one was checked by counting how many fireflies were inside the frustum, and every one passed —
   136 in the menu shot, 67 of them alight. They were 0.8 PIXELS EACH and the nearest was eleven
   thousand units away. The cause was the darkness test used as a VETO: a spot was rejected outright
   until it was clear of every flame in the valley, and at a destination the near ground is exactly
   where the lanterns are, so the only places that passed were far away every time — and a
   count-in-frustum test can never see that. It is a PREFERENCE here, scored against wanting to be
   close, and the best few candidates win rather than the first that clears a bar.

   THE EYE'S HEIGHT IS IN THE DISTANCE TOO, because how near a knot is has to be measured in three
   dimensions: from the menu ridge the ground is two thousand units below the lens, so a knot five
   hundred units downrange is not near at all. That is exactly right — fireflies read at the
   destinations, where the camera stands on the ground with them.

   THEY COME IN KNOTS, NOT AS A SCATTER, and that is the difference between an effect and a rumour
   of one. Spread three dozen fireflies evenly through a two-mile bowl and a shot holds seven, of
   which one is alight. Fireflies swarm: a couple of knots per place, a dozen or so in each, and a
   knot that is in frame is a constellation you cannot miss while the rest of the valley stays
   properly empty.
   ================================================================================================== */

export const FLY = {
  /** swarms per place, and how many in one */
  knots: 2,
  each: 14,
  /** how tight a swarm is, at the far end of the near band */
  knotR: 190,
  /** how far from the nearest flame a firefly WANTS to be */
  dark: 620,
  /** the distance from the eye a knot is happiest at */
  want: 700,
  /** and the range it may be found in at all */
  band: [260, 2600] as const,
  /* HOW FAR OFF THE GROUND, AND MEASURED OVER THE WHOLE WANDER, NOT AT ONE POINT. A fly's height is
     fixed at build and it then drifts up to forty units in each direction, so a ground sample taken
     at its birthplace is the wrong ground for most of its life — on a bank or a step it ends the
     flight buried. The height comes from the HIGHEST ground under the whole disc it can reach. */
  lift: [55, 210] as const,
  reachXZ: 44,
  /* AND THEN A CEILING, because the footing answers "the highest surface here" and a tree canopy is
     a surface. Under a maple it returns the top of the maple, so a firefly meant to be in the grass
     is sited in the treetops and reads as a lamp hanging in the sky. The heightfield underneath
     never has foliage in it, so it is the honest ceiling: authored ground sits 4 to 38 units above
     it, and 150 leaves room for a raised road or a bank without letting a canopy through. */
  ceiling: 150,
  size: 10,
  amt: 1.6,
  colour: 0xcfff8a,
  /** a knot drifts within itself; it does not commute */
  speed: 9,
}

export const FLY_U = {
  uCol: { value: new Color(FLY.colour) },
  uAmt: { value: FLY.amt },
  uSize: { value: FLY.size },
  /** the same signal the lanterns come up on — fireflies do not fly by day */
  uOn: { value: 0 },
}

const VERT = `
  uniform float uSize;
  varying vec2 vP;
  varying float vA;
  void main() {
    vP = position.xy * 2.0;
    vec3 c = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
    vA = instanceMatrix[ 0 ][ 0 ];
    vec4 mv = modelViewMatrix * vec4( c, 1.0 );
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }`

const FRAG = `
  uniform vec3 uCol;
  uniform float uAmt, uOn;
  varying vec2 vP;
  varying float vA;
  void main() {
    float r = length( vP );
    /* ROUND FIRST, AND THE QUAD'S CORNERS NEVER GET A CHANCE TO SHOW. Trusting a bare exp to fade
       out inside the quad works for the sun's halo, which is drawn at a hundred pixels; a firefly
       is twenty-five, and at that size exp( -3.4 ) is still 0.03 when it runs out of geometry --
       a hard step from 0.03 to nothing along a straight line, which is a visible square. */
    if ( r > 1.0 ) discard;
    /* AN ORB: a small bright body with an edge, and a glow around it that reaches EXACTLY zero at
       the rim. exp( -3.2 ) subtracted and the rest renormalised, so there is no value left to step
       off at r = 1 no matter how bright uAmt is turned up. */
    float core = smoothstep( 0.36, 0.13, r );
    float halo = max( 0.0, exp( - r * 3.2 ) - 0.0408 ) * 1.0425;
    float a = ( core + halo * 0.62 ) * vA * uAmt * uOn;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( uCol * a, 1.0 );
  }`

export interface Knot {
  x: number
  z: number
  r: number
  n: number
  /** which eye it belongs to */
  place: number
}

interface Fly {
  i: number
  x0: number
  z0: number
  y: number
  x: number
  z: number
  ph: number
  bw: number
  wx: number
  wz: number
  ws: number
}

export interface FireflyField {
  flies: number
  knots: Knot[]
  /** how far each knot ended up from the eye it belongs to — the one number that would have caught
      all four of the mockup's failed sitings */
  distances: number[]
  mesh: InstancedMesh | null
  tick: (seconds: number) => void
  /** 0 is broad day, 1 is full night */
  setOn: (lampOn: number) => void
  dispose: () => void
}

/** an eye, the bearing it looks along, and how high it stands */
type Spot = readonly [number, number, number, number]

export function flySpots(): Spot[] {
  /* THE DESTINATIONS ONLY, AND THE MENU'S OWN RIDGE IS LEFT OUT ON A MEASUREMENT. The mockup sites
     knots at HOME as well, and here that is provably wasted: the ridge stands 2,300 units above the
     valley floor, so the `near` term scores zero for every candidate in the band — nothing within
     2,600 units downrange can be near an eye that high — and the two knots it picks are chosen on
     darkness alone. They landed 277 and 415 units downrange, which is 83 DEGREES BELOW THE VIEW
     AXIS on a lens whose half-frame is 21.5. Not merely small: outside the picture by sixty
     degrees, and no placement anywhere in the band gets inside it (the far end, 2,600 out, is still
     41 degrees down). Twenty-eight fireflies spent on something that cannot be seen.
     Which is the same failure the mockup describes and fixes elsewhere — its siting kept passing a
     count-in-frustum test while every firefly was 0.8 pixels — arriving from the other direction:
     these are not in the frustum at all. A firefly reads at fifty metres and the menu never gets
     that close to the ground. */
  return Object.values(DESTINATIONS).map((d) =>
    [d.eye[0], d.eye[2], Math.atan2(d.focus[0] - d.eye[0], d.focus[2] - d.eye[2]), d.eye[1]] as Spot)
}

/**
 * The automatic siting: knots scored against darkness and nearness, best few per place.
 *
 * SCORED, NOT SIEVED. Ninety candidates within about fifty degrees of each view axis, each asked two
 * questions — how far is the nearest flame, and how far is this from the eye — and the best few win.
 * Neither question is allowed to veto: a knot that has to sit a hundred units from a lantern to be
 * six metres from the camera is worth far more than a perfectly dark one at the other end of the
 * valley, and a veto chooses the latter every single time.
 */
export function flySites(
  spots: readonly Spot[],
  groundAt: (x: number, z: number) => number,
  clearOf: (x: number, z: number) => number,
): Knot[] {
  const out: Knot[] = []
  spots.forEach((s, si) => {
    const cand: { x: number; z: number; d3: number; score: number }[] = []
    for (let t = 0; t < 90; t++) {
      const a = s[2] + (walkRnd(si * 977 + t, 79) - 0.5) * 1.7
      const r = FLY.band[0] + walkRnd(si * 977 + t, 80) * (FLY.band[1] - FLY.band[0])
      const x = s[0] + Math.sin(a) * r
      const z = s[1] + Math.cos(a) * r
      const gy = groundAt(x, z) + 70
      const d3 = Math.hypot(x - s[0], gy - s[3], z - s[1])
      /* inside the lens */
      if (d3 < 160) continue
      const dark = Math.min(1, clearOf(x, z) / FLY.dark)
      const near = Math.max(0, 1 - Math.abs(d3 - FLY.want) / (FLY.want * 2))
      cand.push({ x, z, d3, score: dark + near * 1.6 })
    }
    cand.sort((a, c) => c.score - a.score)
    /* and spread out, or two knots become one */
    const taken: typeof cand = []
    for (const c of cand) {
      if (taken.length >= FLY.knots) break
      if (taken.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 300)) continue
      taken.push(c)
      /* a near swarm is tight and a far one is broad, so both read as a swarm */
      out.push({
        x: Math.round(c.x),
        z: Math.round(c.z),
        place: si,
        n: FLY.each,
        r: Math.round(Math.max(60, Math.min(FLY.knotR, c.d3 * 0.24))),
      })
    }
  })
  return out
}

const _m = new Matrix4()

export function buildFireflies(
  scene: Scene,
  groundAt: (x: number, z: number) => number,
  fieldAt: (x: number, z: number) => number,
  lamps: readonly Vector3[],
): FireflyField {
  const spots = flySpots()

  /* AWAY FROM THE LANTERNS, WHICH IS THE WHOLE OF WHETHER THIS WORKS. The mockup's first siting put
     them within 1,800 units of an eye and no further thought: at the onsen that is a street with
     forty gas lamps on it, and a six-pixel firefly beside a lit lantern is nothing at all —
     measured there, 36 in the shot and 11 alight, not one of them findable. */
  const clearOf = (x: number, z: number): number => {
    let best = Infinity
    for (const v of lamps) {
      const d = Math.hypot(x - v.x, z - v.z)
      if (d < best) best = d
    }
    return best
  }

  /** the highest ground anywhere a fly can drift to — five samples, once, at build */
  const nearGround = (x: number, z: number): number => {
    const R = FLY.reachXZ
    let y = groundAt(x, z)
    for (let k = 0; k < 4; k++) {
      const a = k * 1.5708
      y = Math.max(y, groundAt(x + Math.cos(a) * R, z + Math.sin(a) * R))
    }
    return Math.min(y, fieldAt(x, z) + FLY.ceiling)
  }

  const knots = flySites(spots, groundAt, clearOf)
  const flies: Fly[] = []
  let i = 0
  for (const k of knots) {
    for (let j = 0; j < k.n; j++, i++) {
      const a = walkRnd(i, 71) * 6.2831
      const r = Math.sqrt(walkRnd(i, 72)) * k.r
      const x = k.x + Math.cos(a) * r
      const z = k.z + Math.sin(a) * r
      flies.push({
        i,
        x0: x,
        z0: z,
        x,
        z,
        y: nearGround(x, z) + FLY.lift[0] + walkRnd(i, 73) * (FLY.lift[1] - FLY.lift[0]),
        ph: walkRnd(i, 74) * 6.2831,
        bw: 0.7 + walkRnd(i, 75) * 1.5,
        wx: walkRnd(i, 76) * 6.2831,
        wz: walkRnd(i, 77) * 6.2831,
        ws: 0.25 + walkRnd(i, 78) * 0.5,
      })
    }
  }
  const distances = knots.map((k) =>
    Math.round(Math.hypot(k.x - spots[k.place][0], k.z - spots[k.place][1])))

  if (!flies.length) {
    return {
      flies: 0, knots, distances, mesh: null,
      tick: () => {}, setOn: () => {}, dispose: () => {},
    }
  }

  const material = new ShaderMaterial({
    uniforms: FLY_U,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: AdditiveBlending,
  })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, flies.length)
  mesh.name = 'fireflies'
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  /* over the water and the wakes, which are the other two things drawn out of order */
  mesh.renderOrder = 3
  scene.add(mesh)

  /* HIDDEN UNTIL THE DAY CYCLE SAYS OTHERWISE, and that has to be set here rather than left to the
     first `setOn`. `tick` does no work by daylight, which is right -- but it meant the instance
     matrices were never written at all before the first night, so every firefly sat at the world
     ORIGIN with the identity matrix's 1 in the slot the blink rides in: a hundred and forty of them
     stacked at full brightness on the valley floor, waiting to be seen for one frame if anything
     ever drew them. Placing them at build and starting invisible costs nothing and cannot. */
  mesh.visible = false

  let t = 0
  const tick = (dt: number, force = false) => {
    if (!force && FLY_U.uOn.value < 0.01) return
    t += dt
    const v = FLY.speed
    for (const f of flies) {
      /* a wander, not a path: two slow sines on each axis so it never traces the same loop */
      f.x = f.x0 + Math.sin(t * f.ws + f.wx) * v * 3.2 + Math.sin(t * f.ws * 2.3 + f.wz) * v
      f.z = f.z0 + Math.cos(t * f.ws * 0.83 + f.wz) * v * 3.2 + Math.cos(t * f.ws * 1.9 + f.wx) * v
      /* THE BLINK: mostly dark, briefly bright, on its own clock. Cubed, so the bright part is a
         flash rather than a slow pulse -- which is what a firefly does and what a lamp does not.
         Written straight into the matrix: the alpha rides in the corner the scale would use, and
         nothing else about a firefly needs a rotation. */
      const b = Math.max(0, Math.sin(t * f.bw + f.ph))
      _m.set(
        b * b * b, 0, 0, f.x,
        0, 1, 0, f.y + Math.sin(t * f.bw * 0.6 + f.ph) * 12,
        0, 0, 1, f.z,
        0, 0, 0, 1,
      )
      mesh.setMatrixAt(f.i, _m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  tick(0, true)

  return {
    flies: flies.length,
    knots,
    distances,
    mesh,
    tick,
    setOn: (lampOn: number) => {
      FLY_U.uOn.value = lampOn
      mesh.visible = lampOn > 0.01
    },
    dispose: () => {
      scene.remove(mesh)
      mesh.geometry.dispose()
      material.dispose()
    },
  }
}
