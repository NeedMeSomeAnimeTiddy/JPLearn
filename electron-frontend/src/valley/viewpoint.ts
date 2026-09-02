import { MathUtils, Vector3 } from 'three'

/* ==================================================================================================
   THE LENS THE PAGE ACTUALLY RENDERS AT, AND WHY IT IS NOT THE AUTHORED ONE.

   `PerspectiveCamera.fov` is the VERTICAL field. Hold it constant and the horizontal field is a
   function of the window's shape -- so it shrinks the moment the window is narrower than the shape
   everything was composed against, and this menu is composed against 16:9. Every plate, every rail
   and every column of type is placed as a fraction of the frame's width; below the reference aspect
   the sides simply fall out of shot, and a composition is cropped rather than letterboxed.

   So below 16:9 the HORIZONTAL field is what is held and the vertical opens up instead: more sky and
   more ground, which costs nothing, and nothing composed against the left or right edge can leave
   the frame. Wider than 16:9 needs no correction -- the extra is already sky and ground.

   AND ANYTHING THAT SOLVES A SCREEN POSITION HAS TO AGREE WITH IT. That is why this is exported
   rather than buried in the frame loop: `aimAt` composes the standing shot by solving where Fuji
   lands in the frame, and a solve made through the authored lens on a window narrower than 16:9 is
   solving against a different frame than the one being drawn. The mockup measured the gap at
   694x887 -- a real vertical field of 91 degrees against an authored 48, so every composed plane was
   being placed against roughly half the frame it appeared in.
   ================================================================================================== */
export const REF_ASPECT = 16 / 9

/** the vertical field to render at, given the authored one and the window's shape */
export function fittedFov(fovY: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= REF_ASPECT) return fovY
  const halfV = Math.tan(MathUtils.degToRad(fovY) * 0.5)
  return MathUtils.radToDeg(Math.atan((halfV * REF_ASPECT) / aspect) * 2)
}

/* ==================================================================================================
   AND THE MENU IS NOT A PHOTOGRAPH.

   The camera stands still at the menu, and standing still is exactly what a rendered scene must not
   do: a valley that holds every pixel between frames reads as a screenshot with an interface over
   it, however much is moving inside it. Two things move the eye, and neither is animation in the
   world:

     - THE BREATH is the camera being HELD rather than mounted. Nine units of rise on one clock and
       six of drift on another, at 4.2 and 6.4 seconds so the pair does not repeat inside a minute --
       against a valley 26,000 units across it is far too small to read as motion and exactly big
       enough that the frame is never twice the same.
     - THE PARALLAX is the viewer's own hand. The eye leans up to 26 units with the pointer and the
       aim swings 10 the other way, which is the near ground sliding against the far ranges. It
       eases at 0.05 a frame rather than tracking, so a flicked mouse is a lean rather than a jolt.

   NEITHER SURVIVES REDUCED MOTION, and that is not a formality here: a breathing camera moves every
   pixel in the frame, which makes it the largest vestibular offender in this build.

   THE SHAKE IS THE THIRD WRITER OF THE SAME OFFSET, and it belongs here with them rather than in the
   interface, because there is one camera and three things asking to move it. It is the refusal --
   see `refuse` in the menu -- and it is deliberately violent and deliberately short: 230 ms in four
   beats, decaying, which reads as the frame being knocked rather than as anything animating.
   ================================================================================================== */
export const VIEW = {
  /** how far the held camera rises and drifts, and how long each takes to travel once */
  breath: { x: 6, y: 9, secX: 6.4, secY: 4.2 },
  /** how far the pointer leans the eye and swings the aim, and how fast that is chased */
  par: { eyeX: 26, eyeY: 18, aimX: 10, aimY: 7, ease: 0.05 },
}

/* THE SHAKE, AS FOUR BEATS RATHER THAN A DECAYING SINE. A damped sine is the wrong shape: it starts
   at zero, so the first thing the frame does after a refused press is sit still. These are the
   mockup's own keys -- the hardest kick is the FIRST one, 40 ms in -- and each is the offset to
   arrive at and how long to take getting there. */
const SHAKE_KEYS: readonly [number, number, number][] = [
  [5, -4, 0.04],
  [-4, 3, 0.05],
  [2, -2, 0.05],
  [0, 0, 0.09],
]
export const SHAKE_SECONDS = SHAKE_KEYS.reduce((a, k) => a + k[2], 0)

export interface Viewpoint {
  /** what to add to the authored eye this frame */
  readonly eye: Vector3
  /** and to the authored aim */
  readonly aim: Vector3
  /** advance the breath clock and ease the lean; seconds */
  tick: (dt: number) => void
  /** knock the frame -- `s` scales the whole figure, 1 being the mockup's own */
  punch: (s?: number) => void
  /** the pointer, in the -1..1 the parallax is written in */
  point: (nx: number, ny: number) => void
  dispose: () => void
}

/**
 * The eye's own small movements: breath, lean and knock, summed into one offset a frame.
 *
 * `still` is reduced motion, and it stops the breath and the lean but NOT the shake -- a refusal is
 * feedback rather than decoration, and together with the flash it is the only thing that says a
 * press was heard and declined. It lasts 230 ms and it ends where it started.
 */
export function createViewpoint(still = false): Viewpoint {
  const eye = new Vector3()
  const aim = new Vector3()
  let t = 0
  /* eased toward the pointer, and the target it is easing toward */
  let parX = 0, parY = 0, parTX = 0, parTY = 0
  /* seconds into the knock, or -1 for a frame that is not being knocked */
  let shakeT = -1
  let shakeS = 1

  const onMove = (e: PointerEvent) => {
    parTX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2
    parTY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2
  }
  if (!still) window.addEventListener('pointermove', onMove, { passive: true })

  const _shake = { x: 0, y: 0 }
  /* where the four beats have the frame at `u` seconds into the knock */
  const shakeAt = (u: number) => {
    let fromX = 0, fromY = 0, at = 0
    for (const [kx, ky, dur] of SHAKE_KEYS) {
      if (u < at + dur) {
        /* smoothstep rather than linear: a linear ramp between keys has a corner at every key, and
           four corners in 230 ms is a rattle rather than a knock */
        const p = MathUtils.smoothstep(u - at, 0, dur)
        _shake.x = (fromX + (kx - fromX) * p) * shakeS
        _shake.y = (fromY + (ky - fromY) * p) * shakeS
        return
      }
      at += dur
      fromX = kx
      fromY = ky
    }
    _shake.x = 0
    _shake.y = 0
  }

  return {
    eye,
    aim,
    tick: (dt: number) => {
      if (still) {
        eye.set(0, 0, 0)
        aim.set(0, 0, 0)
      } else {
        t += dt
        /* A RAISED COSINE, which is what a yoyoing sine ease traces: it rests at each end of its
           travel rather than crossing zero at speed, so the camera settles at the top of a breath
           the way a held one does. The mockup's tween durations are HALF-periods. */
        eye.x = VIEW.breath.x * (0.5 - 0.5 * Math.cos((Math.PI * t) / VIEW.breath.secX))
        eye.y = VIEW.breath.y * (0.5 - 0.5 * Math.cos((Math.PI * t) / VIEW.breath.secY))
        parX += (parTX - parX) * VIEW.par.ease
        parY += (parTY - parY) * VIEW.par.ease
        eye.x += parX * VIEW.par.eyeX
        eye.y -= parY * VIEW.par.eyeY
        aim.set(parX * VIEW.par.aimX, -parY * VIEW.par.aimY, 0)
      }
      if (shakeT >= 0) {
        shakeT += dt
        if (shakeT >= SHAKE_SECONDS) shakeT = -1
        else {
          shakeAt(shakeT)
          eye.x += _shake.x
          eye.y += _shake.y
        }
      }
    },
    /* RESTARTED RATHER THAN QUEUED: two refusals in quick succession are one frustrated person, not
       two knocks to play in order. */
    punch: (s = 1) => { shakeT = 0; shakeS = s },
    point: (nx: number, ny: number) => { parTX = nx; parTY = ny },
    dispose: () => { window.removeEventListener('pointermove', onMove) },
  }
}
