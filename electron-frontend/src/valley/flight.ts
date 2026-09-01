import { MathUtils, QuadraticBezierCurve3, Vector3 } from 'three'

/* ==================================================================================================
   THE FLIGHT — ONE CLOCK, ONE PATH, AND THE AIM COMES OFF THE PATH.

   Ported from the mockup, where it was rewritten rather than tuned because position and
   orientation used to be two animations on two different clocks. Every complaint about that
   camera came out of that one decision: the turn finished at 62% of the timeline, so the camera
   reached its heading while still a third of the way out and the rest was a slide; the aim was
   rebuilt each frame from absolute yaw and pitch, so the camera did not follow its own flight;
   pitch came from asin(dy / r), which goes singular near vertical and snaps.

   WHAT IT DOES. The eye rides a quadratic Bezier stepped by ARC LENGTH, so speed is even whatever
   the leg lengths. The aim is derived FROM that curve: through the middle of the move the camera
   leans toward the curve's own tangent, so it faces where it is going, and at each end that lean
   falls to nothing and it sits exactly on the framing composed there. One eased clock drives eye, aim and lens together, so
   nothing can finish early. No angle is interpolated anywhere, so there is no singularity to snap
   through.

   AND NO GSAP, WHICH THE PORT PLAN HAD DOWN AS NOT OPTIONAL. The claim was that the camera work
   is authored against GSAP's easing and rewriting the tweens would re-author the flights. It is
   not: the mockup's tween runs `ease: 'none'` on a linear 0→1 drive and applies `easeInOutSine`
   by hand inside its own `onUpdate`. GSAP was the clock and nothing else. The one behaviour it
   did contribute is `gsap.ticker.lagSmoothing(34, 16)` — a cap on how much path a stalled frame
   may cover — and that is three lines here (see `MAX_STEP_MS`), so the dependency buys nothing
   the flights actually need.
   ================================================================================================== */

export const easeInOutSine = (x: number): number => -(Math.cos(Math.PI * x) - 1) / 2

/** world units per second at cruise */
export const FLIGHT_SPEED = 3200
export const FLIGHT_MIN = 1.6
export const FLIGHT_MAX = 4.6
/* THE LEAD IS GONE, AND IT WAS A KINK IN EVERY FLIGHT.

   The mockup aimed the lean at a point `FLIGHT_LEAD` (0.10) further along the arc:
   `path.getPointAt(Math.min(1, u + FLIGHT_LEAD))`. That `Math.min` is the bug. For the last tenth
   of every move the lead point is PINNED to the endpoint while the eye keeps closing on it, so the
   direction to it stops behaving the way it did a frame earlier — the tangent's rate of change
   steps at exactly u = 0.90, on every route, out and back.

   Measured on the way home from THE PATH at 60fps: the aim turns 0.26, 0.36, 0.46, 0.63, 0.88,
   1.02 degrees a frame as u climbs to 0.9006 — and then 0.13 on the very next frame at 0.9071. An
   eightfold collapse in the rate of turn, nine tenths of the way through the move. That is not a
   dropped frame and it is not the lean cap; it is the camera stopping turning early, which is the
   exact complaint the flight was rewritten to remove, surviving in the rewrite.

   THE FIX IS TO ASK THE CURVE. `getTangentAt(u)` is the direction of travel by definition,
   continuous end to end, with no constant to pick and nothing to clamp. The lead was only ever a
   finite difference standing in for it. */
/** how far it leans into its direction of travel at mid-flight */
export const AIM_LEAN = 0.75
/* ...but never more than this far off the turn it actually has to make. A fraction of the way to
   the tangent is unbounded in degrees; this is the bound. 15 is enough to read as flown and small
   enough that the swing out and back cannot dominate the move. */
export const LEAN_MAX = MathUtils.degToRad(15)
/* where the cap stops being a straight line and starts easing onto its limit, as a fraction of it.
   Below this the lean is exactly what it always was; above it the knee is rounded so the rate of
   turn never steps. */
export const LEAN_KNEE = 0.65
/* LESS OF IT ON THE WAY HOME. Leaning into the path is what makes an ARRIVAL feel flown. Leaving
   is not the same move: the subject is the menu you are returning to and the path is only egress,
   and the menu stands well above the valley floor, so every return is a climb — leaning into a
   climb points the camera at empty sky for a second and a half. */
export const AIM_LEAN_BACK = 0.12

/* A DROPPED FRAME IS NOT A SNAP, BUT IT IS INDISTINGUISHABLE FROM ONE. Measured on the mockup's
   rebuilt flight: distance moved per millisecond is constant to within 5% on every frame including
   the ones that read as a jerk — those frames took 45-52 ms instead of 6, the renderer stalled, and
   the camera then correctly covered eight frames' worth of path in one step. Capping the step means
   a stall costs a little wall-clock instead of a visible lurch, which for a camera move is the
   right way round. 34 ms is a frame and a half at 45 Hz, which is what GSAP's own threshold was
   set to here. */
export const MAX_STEP_MS = 34

/** the camera state a flight writes into, and the renderer reads */
export interface CamState {
  px: number; py: number; pz: number
  tx: number; ty: number; tz: number
  fov: number
  roll: number
  /** how far the lean actually pulled the shot off the turn, in radians — free here, and the
      number the cap is about */
  lean?: number
}

const _fEye = new Vector3(), _fAim = new Vector3()
const _fTmp = new Vector3()
const _dA = new Vector3(), _dB = new Vector3()
const _dPerp = new Vector3()

/* SLERP THE LOOK DIRECTION, NEVER LERP THE LOOK POINT.
   Moving an aim POINT from A to B in a straight line is the same trap as yaw-and-pitch wearing a
   different hat: when that point sweeps near the eye — which it does whenever a destination sits
   behind where the camera was looking — the direction to it flips almost instantly, and that is
   the snap. Measured on the mockup's old build: median 0.05° of turn per frame with spikes to
   161°. Interpolating the unit direction along its great circle has no such point — the rate is
   constant by construction and there is no pole to cross. `out` must not alias `a`. */
export function slerpDir(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const dot = MathUtils.clamp(a.dot(b), -1, 1)
  if (dot > 0.9995) return out.copy(a).lerp(b, t).normalize()
  if (dot < -0.9995) {
    /* opposed: any perpendicular will do to swing round */
    _dPerp.set(0, 1, 0)
    if (Math.abs(a.y) > 0.9) _dPerp.set(1, 0, 0)
    _dPerp.crossVectors(a, _dPerp).normalize()
    const th = Math.PI * t
    return out.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(_dPerp, Math.sin(th)).normalize()
  }
  const theta = Math.acos(dot) * t
  out.copy(b).addScaledVector(a, -dot).normalize()
  return out.multiplyScalar(Math.sin(theta)).addScaledVector(a, Math.cos(theta)).normalize()
}

export interface FlightSpec {
  startEye: Vector3
  startTgt: Vector3
  endEye: Vector3
  endTgt: Vector3
  /** the point the flight should ACTUALLY fly through at halfway, or null for a straight run */
  mid?: readonly number[] | Vector3 | null
  lean?: number | null
  pace?: number | null
  startFov: number
  endFov: number
  startRoll?: number
  endRoll?: number
}

export interface Flight {
  len: number
  /** seconds */
  dur: number
  /** radians of turn between the two framings */
  turn: number
  /** writes the pose at eased fraction `u` into `o` */
  sample: (u: number, o: CamState) => CamState
}

/* A FLIGHT IS A DESCRIPTION BEFORE IT IS AN ANIMATION — the curve, its length, its duration, and a
   `sample(u)` that writes the exact pose at any point along it. What drives it then does nothing
   but turn a clock into a `u`. */
export function makeFlight(spec: FlightSpec): Flight {
  const { startEye, startTgt, endEye, endTgt } = spec
  const leanAmt = spec.lean == null ? AIM_LEAN : spec.lean

  /* THE PATH IS ONE ARC: START, MIDDLE, END. A quadratic Bezier has no interior knots, so
     curvature varies smoothly end to end and there is nothing to step through — a Catmull-Rom
     through waypoints is only C1 at each knot, and the turn rate steps at every one.

     The price is that a Bezier does not pass through its control point, it is only pulled toward
     it — and these middles were chosen to thread real gaps, so being "pulled toward" a gate is no
     use. `mid` is therefore the point the flight should ACTUALLY FLY THROUGH at halfway, and the
     control point is solved back from it: B(0.5) = (P0 + 2C + P2) / 4, so C = 2·mid − (P0 + P2)/2. */
  /* CLONED, BOTH OF THEM: the degenerate nudge below writes through, and what is handed in is a
     destination's own eye — a failed flight would have permanently moved its own destination. */
  const P0 = startEye.clone(), P2 = endEye.clone()
  let ctrl: Vector3
  if (spec.mid) {
    const m = spec.mid
    const M = m instanceof Vector3 ? m.clone() : new Vector3(m[0], m[1], m[2])
    ctrl = M.multiplyScalar(2).addScaledVector(P0.clone().add(P2), -0.5)
  } else {
    ctrl = P0.clone().add(P2).multiplyScalar(0.5)
  }
  if (P0.distanceTo(P2) < 1) P2.addScalar(1)

  const path = new QuadraticBezierCurve3(P0.clone(), ctrl, P2.clone())
  /* getPointAt walks an arc-length table, and three builds it with 200 divisions — 46 units apart
     on a 9,200-unit path. Where the curve turns hardest one division spans the whole corner and
     the returned point jumps: measured as a single 17° flick with 1.8° on the frames either side.
     Cheap to build once per flight, and the only place it is paid. */
  path.arcLengthDivisions = 1600
  path.updateArcLengths()
  const len = path.getLength()

  /* THE LENS IS PART OF THE JOURNEY: each destination is composed at its own field of view, and it
     rides the same clock as everything else rather than snapping at the stop. So does the tilt. */
  const fov0 = spec.startFov, fov1 = spec.endFov
  const roll0 = spec.startRoll ?? 0, roll1 = spec.endRoll ?? 0

  /* paced off the ACTUAL arc, not the straight line between the ends, with a little extra for a
     wide swing — a big turn is a journey even when the distance is short */
  const dirStart = startTgt.clone().sub(startEye)
  const dirEnd = endTgt.clone().sub(endEye)
  const r0 = dirStart.length() || 1
  const r1 = dirEnd.length() || 1
  dirStart.divideScalar(r0)
  dirEnd.divideScalar(r1)
  let turn = dirStart.angleTo(dirEnd)
  if (!Number.isFinite(turn)) turn = 0

  /* `pace` stretches one destination's flight without touching the others. A ground-level arrival
     reads much faster than an aerial one at the same speed — the near ground streaks past where a
     high shot has nothing close to measure against. FLIGHT_MAX still caps it. */
  const dur = MathUtils.clamp(
    (0.6 + len / FLIGHT_SPEED + turn * 0.18) * (spec.pace || 1),
    FLIGHT_MIN, FLIGHT_MAX,
  )

  function sample(u: number, o: CamState): CamState {
    path.getPointAt(u, _fEye)
    o.px = _fEye.x; o.py = _fEye.y; o.pz = _fEye.z
    o.fov = fov0 + (fov1 - fov0) * u

    /* WHERE IT LOOKS, IN TWO PARTS.
       THE TURN is a single slerp from the departing framing to the arriving one across the WHOLE
       move, so its angular rate is even. Crowded into blend windows at either end it ran at three
       times the rate of any other flight on the one that turns nearly 180°.
       THE LEAN is how far the camera favours its own direction of travel — strongest at mid-flight
       and exactly zero at both ends, so it can never pull the shot off the framing each end was
       composed at. The direction of travel is the curve's tangent; see the note by the constants
       for what asking a point further along the arc for it cost. */
    path.getTangentAt(u, _fTmp)
    if (_fTmp.lengthSq() > 1e-6) _fTmp.normalize()
    else _fTmp.copy(dirEnd)
    slerpDir(dirStart, dirEnd, u, _dA)

    /* THE LEAN KEEPS ITS VERTICAL. Flattening the tangent was tried in the mockup and reverted the
       same evening: it removed the pitch overshoot the numbers objected to and made the flights
       worse to watch. A move that never tips is a move that slides.

       AND THE LEAN IS CAPPED, which is the whole overturn bug. `leanAmt` is a FRACTION of the way
       to the tangent, so how far it actually swings the camera depends on where the tangent
       happens to sit — a property of the map, not of anything anyone chose. Measured frame by
       frame in the mockup: DRILLS needed 58° of turn and did 251; READING needed 27 and did 133.
       Capping the DEVIATION rather than the fraction bounds it by construction.

       THE CAP IS SOFT, because a hard one has two joints and both are mid-flight: at the moment
       `dev * k` reaches the limit the aim stops swinging out and holds, and when it falls back
       under it starts again — two steps in the rate of turn with a flat stretch between them.
       Under 65% of the cap this is arithmetically the old behaviour; past that it eases onto the
       limit without ever reaching it. C1 across the knee, and still bounded. */
    const dev = _dA.angleTo(_fTmp)
    let k = Math.pow(Math.sin(Math.PI * u), 1.4) * leanAmt
    if (dev > 1e-6) {
      const x = (dev * k) / LEAN_MAX
      if (x > LEAN_KNEE) {
        const soft = 1 - (1 - LEAN_KNEE) * Math.exp(-(x - LEAN_KNEE) / (1 - LEAN_KNEE))
        k = (LEAN_MAX * soft) / dev
      }
    }
    slerpDir(_dA, _fTmp, k, _dB)

    /* the aim's DISTANCE is free to lerp — it only sets where the focus sits along the look, and
       the two ends were composed with their own reach */
    const reach = r0 + (r1 - r0) * u
    _fAim.copy(_fEye).addScaledVector(_dB, reach)
    o.tx = _fAim.x; o.ty = _fAim.y; o.tz = _fAim.z
    o.roll = roll0 + (roll1 - roll0) * u
    o.lean = _dA.angleTo(_dB)
    return o
  }

  return { len, dur, turn, sample }
}

/* ==================================================================================================
   WHERE THE MENU STANDS, and it is composed rather than authored.

   THE PORT STOOD IN THE WRONG PLACE FOR FOUR PHASES. Phase 0 looked through world.glb for a camera
   named MainMenu and found one -- `Camera_MainMenu`, at (-500, 460, 1900) -- which seemed like the
   obviously right answer and is not the one the mockup uses. `composeWorldHome` puts the eye at
   (0, 2000, 6000) and SOLVES the aim so Fuji's measured summit lands at frame (0.76, 0.24) at a
   43-degree lens. Those are 4,100 units apart in z and 1,540 in height.

   AND THE ROUTES ARE AUTHORED FROM IT. Every `mid` in `flights.json` was flown and saved from that
   standing point, so from anywhere else the curve solved through it is nonsense: from the authored
   camera, the flight to the pagoda swung 2,400 units BACKWARDS over the menu before turning round,
   and the middle of the move was a black frame with nothing in it but petals. That was diagnosed as
   fog and it was not fog.
   ================================================================================================== */
export const HOME_EYE: readonly [number, number, number] = [0, 2000, 6000]
export const HOME_FOV = 43
/* the summit, as the mockup measured it. Used only when the model cannot be walked for its own. */
export const FUJI_PEAK_HINT: readonly [number, number, number] = [-1342, 7220, -23319]
/** where the summit sits in the frame: right of centre, high */
export const FUJI_FRAME_U = 0.76
export const FUJI_FRAME_V = 0.24

/* SOLVE A LOOK THAT PUTS `target` AT (u, v) IN THE FRAME. Composing by aiming at a thing and then
   nudging is how a framing drifts every time the lens changes; this is the framing stated as what
   it is, and it re-solves itself for any fov or aspect. */
export function aimAt(
  target: Vector3, eye: readonly [number, number, number], fov: number, aspect: number,
  u: number, v: number,
): Vector3 {
  const E = new Vector3(eye[0], eye[1], eye[2])
  const d = target.clone().sub(E).normalize()
  const tanV = Math.tan(MathUtils.degToRad(fov) / 2)
  const yaw = Math.atan((u - 0.5) * 2 * tanV * aspect)
  const pitch = Math.atan((0.5 - v) * 2 * tanV)
  d.applyAxisAngle(new Vector3(0, 1, 0), yaw)
  const right = new Vector3().crossVectors(d, new Vector3(0, 1, 0)).normalize()
  d.applyAxisAngle(right, -pitch)
  return E.add(d.multiplyScalar(12000))
}
