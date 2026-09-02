/* ==================================================================================================
   THE VALLEY DOES NOT RACE THE DISPLAY IT CANNOT BEAT.

   MEASURED, ON THE SHIPPED BUILD, ON AN RTX 4070 SUPER AT 1600x1028. The panel is 164 Hz, so a
   frame has 6.1 ms. The valley takes about 6.8. That half-millisecond is the whole of this file:
   77% of frames landed on one vsync, 21% on two and 1% on three, which averages a very respectable
   131 fps and looks like judder, because what the eye reads is not the average — it is the CADENCE.
   A world sampled at 6, 6, 12, 6, 12, 6, 6, 18 ms moves in a series of small lurches whatever the
   mean says. A second run of the same build settled at a flat 12.2 ms throughout and looked FINE.
   The difference between the smooth run and the rough one was not speed. It was evenness.

   SO WHEN A FRAME WILL NOT FIT, TAKE TWO. `requestAnimationFrame` keeps firing at the display's own
   rate whatever we do with it, which is what makes this cheap: the raw interval between callbacks is
   still a clean read of the refresh rate even while we are skipping half of them, so the pacer never
   has to guess what it is pacing against and cannot latch itself on.

   IT IS OFF WHEREVER THERE IS ROOM, and that is not a special case, it is the arithmetic. `FLOOR_HZ`
   says the world may never be paced below 55 fps, so at 60 Hz the largest divisor is 1 and this
   file does nothing at all. It only has anything to say on a panel fast enough that half of it is
   still smooth: 164 Hz halves to 82, 240 Hz can quarter to 60.

   THE HYSTERESIS IS THE OTHER HALF OF THE JOB. Dividing on one slow frame and undividing on one fast
   one is a slower, uglier version of the problem it was written to fix — the cadence would then
   change every few frames instead of every frame. `SETTLE` frames have to agree before anything
   moves, and the two thresholds are deliberately far apart so the band a frame cost has to cross to
   change the answer is wide.
   ================================================================================================== */

/** the world is never paced below this, so a 60 Hz display is never touched */
export const FLOOR_HZ = 55
/** cost above this fraction of the current budget means the budget is too small */
export const RAISE_AT = 0.92
/** and below this fraction of the NEXT budget down means there is room to go back */
export const LOWER_AT = 0.72
/** how many frames in a row have to agree before the cadence changes */
export const SETTLE = 24
/** anything longer than this is a stall, a tab wake or a breakpoint — not a display interval */
export const SANE_MS = 40
/* ...AND ANYTHING SHORTER THAN THIS IS NOT ONE EITHER. 500 Hz is past any panel shipping. */
export const FAST_MS = 2
/** how many intervals the display estimate is taken over; it is re-taken every this many frames */
export const WINDOW = 120

/**
 * The largest divisor allowed at this refresh rate, from `FLOOR_HZ`.
 *
 * `1` means "render every frame", which is the only answer at 60 Hz and below.
 */
export function maxDivisor(vsyncMs: number): number {
  if (!(vsyncMs >= FAST_MS) || vsyncMs > SANE_MS) return 1
  return Math.max(1, Math.floor(1000 / (FLOOR_HZ * vsyncMs)))
}

export interface Pacer {
  /**
   * Call at the top of every `requestAnimationFrame`, with the raw interval since the last one.
   *
   * Returns false when this vsync should be skipped entirely — no tick, no render, nothing.
   */
  due: (rawMs: number) => boolean
  /** call once the frame's work is done, with how long it took */
  spent: (ms: number) => void
  /** how many display frames each rendered one is currently worth; 1 is every frame */
  divisor: () => number
  /** the display interval as currently measured, for diagnostics */
  vsync: () => number
}

/**
 * A frame pacer for one render loop.
 *
 * Deliberately not a hook and not stateful React: the loop it belongs to is a closure in
 * `valley.ts` that runs sixty to two hundred times a second and must not touch a store.
 */
export function makePacer(enabled = true): Pacer {
  /* THE MEDIAN INTERVAL, and both of the estimators tried before it were measurably wrong.
     A MEAN is an average of 6.1 and 12.2 and describes no display in existence. A MINIMUM is
     exactly as good as the worst sample it ever sees, and rAF on this build delivers occasional
     2 ms callbacks -- so the minimum pinned itself to the floor, decided the panel ran at 500 Hz
     and paced the world down to a seventh of it. A median over a rolling window is immune to
     both: `requestAnimationFrame` keeps firing at the display's rate whether or not we work the
     frame, so most of the window IS the display interval whatever the divisor is doing, and a
     handful of short or long outliers cannot move the middle of it.

     ITS ONE FAILURE MODE IS THE SAFE ONE. If more than half the callbacks really are arriving at
     twice the panel period, the median reads the doubled figure, `maxDivisor` of that is 1, and
     the pacer does nothing at all. */
  const ring = new Float64Array(WINDOW)
  const sorter = new Float64Array(WINDOW)
  let seen = 0
  let filled = 0
  let vsyncMs = 0
  let costMs = 0
  let divisor = 1
  let phase = 0
  let agree = 0
  let want = 1

  const due = (rawMs: number): boolean => {
    if (rawMs >= FAST_MS && rawMs <= SANE_MS) {
      ring[seen % WINDOW] = rawMs
      seen += 1
      filled = Math.min(WINDOW, filled + 1)
      /* re-taken a few times a second rather than every frame: sorting 120 doubles is nothing, and
         doing it 164 times a second for a number that moves once a minute would be silly */
      if (seen % 20 === 0 && filled >= 20) {
        sorter.set(ring.subarray(0, filled))
        const view = sorter.subarray(0, filled)
        view.sort()
        vsyncMs = view[filled >> 1]
      }
    }
    if (!enabled) return true
    if (phase > 0) { phase -= 1; return false }
    phase = divisor - 1
    return true
  }

  const spent = (ms: number): void => {
    if (!enabled || vsyncMs === 0) return
    /* the cost of one rendered frame, smoothed. A quarter-weight EMA settles inside `SETTLE`
       frames, which is what makes the counter below a decision rather than a coin toss. */
    costMs = costMs === 0 ? ms : costMs * 0.75 + ms * 0.25
    const ceiling = maxDivisor(vsyncMs)
    const budget = divisor * vsyncMs

    let target = divisor
    if (divisor < ceiling && costMs > budget * RAISE_AT) target = divisor + 1
    else if (divisor > 1 && costMs < (divisor - 1) * vsyncMs * LOWER_AT) target = divisor - 1

    if (target === divisor) { agree = 0; want = divisor; return }
    if (target !== want) { want = target; agree = 0 }
    if (++agree < SETTLE) return
    divisor = target
    agree = 0
    phase = Math.min(phase, divisor - 1)
  }

  return { due, spent, divisor: () => divisor, vsync: () => vsyncMs }
}
