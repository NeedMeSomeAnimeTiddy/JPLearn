import {
  Color, DoubleSide, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial, Vector3,
  type Scene,
} from 'three'
import { hash01 } from './clouds'
import { LAKE_U } from './lake'
import { SWAY } from './sway'

/* ==================================================================================================
   THE AIR ITSELF, AS BRUSH-STROKES.

   THE LAST THING IN THE VALLEY THAT MOVES AND HAD NOT BEEN PORTED. Everything else here is a thing
   in the world -- a person, a boat, a flame, a tree. This is the space between them: long, pale,
   curved strokes drifting on the wind, the way a sumi painter draws moving air. It is the one
   effect in this file that is a drawing convention rather than a simulation of anything.

   FORTY-FOUR OF THEM, OUT OF A POOL OF 160. `n` is what is allocated and `shown` is what is drawn,
   so density is a dial rather than a reload -- the instances past `mesh.count` are simply not
   issued. The mockup's note on why 44 and not 160 is worth keeping: every count it had was tuned
   while the strokes were invisible (a PlaneGeometry(1,1) has one segment, so every term of the bow
   evaluated at u = 0 or u = 1, which is exactly where all of them are zero -- the curve had never
   displaced a vertex). Fixing the curve did not add wisps, it revealed the ones already flying, and
   58 strokes in one frame with five of them over 240 pixels is not weather, it is hatching.

   LONG AND BARELY THERE, which is what shortening them was reaching for and missing. A short stroke
   at half opacity is still a MARK: you read its ends, and ends are what made the first field look
   like scratches on the lens. A long one at a tenth is a draught -- nowhere on it is solid enough
   to catch the eye, and the length is what makes it read as moving rather than sitting.

   AND THEY FLY LOW, which is why they are visible at all. A pale stroke needs something darker
   behind it, and in this picture that is the valley -- the trees, the water and the far ridges. The
   first field ran to 2,800 units up and half of it sat against a sunset sky brighter than the
   strokes are: 74 in frame, up to 1,141 pixels long, and not one of them readable.

   FOUR NUMBERS A WISP, ALL OF THEM IN THE MATRIX. Column 0 is the stroke's own heading times its
   length, column 1 keeps two bow coefficients either side of its width, column 2 a phase beside its
   alpha. No instanced attributes to allocate, upload or keep in step -- and the matrix was going to
   be uploaded every frame regardless, because these things move.
   ================================================================================================== */

export const WIND = {
  on: true,
  /** the pool */
  n: 160,
  /** and how many of it are drawn */
  shown: 44,
  speed: { value: 300 },
  /* THE PEAK ALPHA, LITERALLY: it multiplies straight into the fragment's alpha, and the taper and
     the life-fade only ever take it down -- so 0.15 is a stroke that is fifteen percent opaque at
     its strongest point and less everywhere else. 0.10 was a shade under the floor: they were
     there and you had to be looking for them. */
  amt: { value: 0.15 },
  col: { value: new Color(0xeef4f8) },
  /* ONE Vector3, TWO SYSTEMS. The trees bend down the same wind these blow on -- see `sway.ts` --
     so turning the weather turns both rather than leaving them disagreeing. */
  dir: SWAY.dir,
  bend: { value: 1.0 },
  time: { value: 0 },
  /** the box they are born in: wide, and deliberately low */
  box: { x: 16000, z: 14000, y0: 90, y1: 1500 },
  len: [700, 2400] as const,
  wide: [9, 26] as const,
  life: [5.5, 13] as const,
}

interface Wisp {
  p: Vector3
  dir: Vector3
  len: number
  wide: number
  life: number
  age: number
  rise: number
  sp: number
  yaw: number
  tilt: number
  /** the two bow coefficients that turn an arc into a hook or an S, and the crawl's phase */
  c1: number
  c2: number
  cph: number
  i: number
}

const VERT = `
  uniform vec3 uWind;
  uniform float uBend, uTime;
  varying vec2 vUv;
  varying float vA, vFog;
  void main() {
    vUv = uv;
    /* the instance matrix carries the wisp: where it is, and in the rest of its columns how long,
       how thick, how bent and how far through its life it is */
    vec3 c = vec3( instanceMatrix[ 3 ][ 0 ], instanceMatrix[ 3 ][ 1 ], instanceMatrix[ 3 ][ 2 ] );
    /* COLUMN 0 IS THE WISP'S OWN HEADING, length and all. Packing it there instead of a single
       length against a shared uWind is what stops the field reading as a rack of parallel
       scratches: every stroke is a few degrees off the wind and off the horizontal. */
    vec3 axis = vec3( instanceMatrix[ 0 ][ 0 ], instanceMatrix[ 0 ][ 1 ], instanceMatrix[ 0 ][ 2 ] );
    float len = length( axis );
    axis = len > 0.001 ? axis / len : uWind;
    float wide = instanceMatrix[ 1 ][ 1 ];
    float c1 = instanceMatrix[ 1 ][ 0 ];
    float c2 = instanceMatrix[ 1 ][ 2 ];
    float ph = instanceMatrix[ 2 ][ 0 ];
    vA = instanceMatrix[ 2 ][ 2 ];
    vec3 toEye = normalize( cameraPosition - c );
    /* roll about the wisp's own axis to face the eye: the stroke stays a stroke from anywhere */
    vec3 side = cross( axis, toEye );
    float sl = length( side );
    side = sl > 0.001 ? side / sl : vec3( 0.0, 1.0, 0.0 );
    /* THE BOW SCALES WITH LENGTH, NOT WITH WIDTH. Bowing a 1,400-unit stroke by one width is a
       straight line with a rumour of a curve in it; by a twentieth of its length it is an arc,
       which is what air does and what a brush does.
       AND ONE ARC IS STILL A LINE THAT HAPPENS TO BEND. Three harmonics with per-wisp coefficients
       give every stroke a different shape, and the third one CRAWLS -- so the curve is not merely
       curved but alive: a wisp reshapes itself over its life instead of sliding across the valley
       as a rigid decal. */
    float t = uv.x * 3.14159;
    float bow = ( sin( t ) * c1
                + sin( t * 2.0 + ph ) * c2
                + sin( t * 3.0 + uTime * 0.9 + ph * 1.7 ) * c2 * 0.45 ) * uBend * len;
    vec3 p = c + axis * ( position.x * len ) + side * ( position.y * wide + bow );
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    vFog = - mv.z;
    gl_Position = projectionMatrix * mv;
  }`

const FRAG = `
  uniform vec3 uCol, fogColor;
  uniform float uAmt, fogDensity;
  varying vec2 vUv;
  varying float vA, vFog;
  void main() {
    float u = vUv.x;
    float v = abs( vUv.y - 0.5 ) * 2.0;
    /* A SPINDLE, NOT A DASH. The first version tapered over the last third at each end and read as
       a drawn line with tidy ends -- the giveaway that made the whole field look like scratches on
       the lens. Tapering over nearly the whole length leaves no straight section at all, so there
       is no edge anywhere for the eye to catch on. */
    float taper = smoothstep( 0.0, 0.42, u ) * smoothstep( 1.0, 0.58, u );
    /* and the stroke is THINNER where it is fainter, which is what a brush does as it lifts */
    float a = taper * pow( 1.0 - v, 1.0 + ( 1.0 - taper ) * 3.0 ) * vA * uAmt;
    float f = 1.0 - exp( - fogDensity * fogDensity * vFog * vFog );
    a *= 1.0 - clamp( f, 0.0, 1.0 );
    if ( a < 0.003 ) discard;
    gl_FragColor = vec4( uCol, a );
  }`

export interface WindField {
  /** how many are in the pool */
  pool: number
  /** and how many are drawn */
  shown: number
  mesh: InstancedMesh
  tick: (seconds: number) => void
  dispose: () => void
}

const _m = new Matrix4()

/* RESPAWN IS THE ONE PLACE HERE THAT WANTS REAL RANDOMNESS. Everything else about a wisp comes off
   the hash, so a reload gives the same air twice and a screenshot is repeatable -- but a wisp that
   respawned in the same place every lap would beat like a metronome, and there is nothing to
   reproduce about where the next one happens to form. */
function respawn(w: Wisp, first: boolean): void {
  const B = WIND.box
  w.p.set(
    (Math.random() - 0.5) * 2 * B.x,
    B.y0 + Math.random() * (B.y1 - B.y0),
    (Math.random() - 0.5) * 2 * B.z,
  )
  if (!first) w.age = 0
}

export function buildWind(scene: Scene): WindField | null {
  if (!WIND.on) return null

  /* TWENTY-FOUR SEGMENTS, AND THE WHOLE CURVE DEPENDS ON THEM. A PlaneGeometry(1, 1) has ONE
     segment -- four vertices, all of them at u = 0 or u = 1, which is exactly where every term of
     the bow evaluates to zero. A curve needs somewhere in the middle to be curved AT. */
  const geo = new PlaneGeometry(1, 1, 24, 1)
  const material = new ShaderMaterial({
    uniforms: {
      uCol: WIND.col, uAmt: WIND.amt, uWind: WIND.dir, uBend: WIND.bend, uTime: WIND.time,
      /* the same distance fog every surface takes, shared rather than copied */
      fogColor: LAKE_U.fogColor, fogDensity: LAKE_U.fogDensity,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })

  const mesh = new InstancedMesh(geo, material, WIND.n)
  /* `sun-`, so the ink pass leaves it alone: a stroke of moving air with a line drawn round it is
     a piece of ribbon */
  mesh.name = 'sun-wind'
  /* the bounding sphere three would compute is around a unit plane at the origin, and these fly
     sixteen thousand units out */
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  mesh.count = Math.min(WIND.n, WIND.shown)
  scene.add(mesh)

  const span = (v: readonly [number, number], f: number) => v[0] + (v[1] - v[0]) * f
  const wisps: Wisp[] = []
  for (let i = 0; i < WIND.n; i++) {
    const life = span(WIND.life, hash01(i, 43))
    const w: Wisp = {
      p: new Vector3(),
      dir: new Vector3(),
      len: span(WIND.len, hash01(i, 41)),
      wide: span(WIND.wide, hash01(i, 42)),
      life,
      /* staggered, so they are not all born together and do not all die together */
      age: hash01(i, 44) * life,
      rise: (hash01(i, 45) - 0.5) * 26,
      sp: 0.7 + hash01(i, 46) * 0.7,
      /* its own heading, a few degrees off the wind and off level */
      yaw: (hash01(i, 49) - 0.5) * 0.62,
      tilt: (hash01(i, 50) - 0.5) * 0.38,
      /* and its own shape: c1 is the main bend, c2 the kink that turns an arc into a hook or an S.
         Both signed, so they curl either way. */
      c1: (hash01(i, 51) - 0.5) * 0.14,
      c2: (hash01(i, 52) - 0.5) * 0.085,
      cph: hash01(i, 53) * 6.2831,
      i,
    }
    respawn(w, true)
    wisps.push(w)
  }

  const tick = (seconds: number) => {
    WIND.time.value += seconds
    const d = WIND.dir.value
    const v = WIND.speed.value
    for (const w of wisps) {
      w.age += seconds
      if (w.age > w.life) respawn(w, false)
      w.p.x += d.x * v * w.sp * seconds
      w.p.z += d.z * v * w.sp * seconds
      w.p.y += w.rise * seconds
      /* in and out over its life, so nothing ever pops into or out of the air */
      const u = w.age / w.life
      const a = Math.min(1, u / 0.22) * Math.min(1, (1 - u) / 0.3)
      const cy = Math.cos(w.yaw)
      const sy = Math.sin(w.yaw)
      w.dir.set(d.x * cy - d.z * sy, w.tilt, d.x * sy + d.z * cy).normalize()
      /* HAND-BUILT, NOT COMPOSED. `compose` takes a quaternion and a scale, and what this needs is
         three basis vectors that are not orthogonal in the usual sense: column 0 carries the
         wisp's heading times its length, column 1 its width and its bow, column 2 its brightness. */
      _m.set(
        w.dir.x * w.len, w.c1, w.cph, w.p.x,
        w.dir.y * w.len, w.wide, 0, w.p.y,
        w.dir.z * w.len, w.c2, Math.max(0.001, a), w.p.z,
        0, 0, 0, 1,
      )
      mesh.setMatrixAt(w.i, _m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  /* placed before the first frame, or the whole field arrives at the origin */
  tick(0)

  return {
    pool: WIND.n,
    shown: mesh.count,
    mesh,
    tick,
    dispose: () => {
      scene.remove(mesh)
      geo.dispose()
      material.dispose()
    },
  }
}
