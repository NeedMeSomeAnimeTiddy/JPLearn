import { describe, expect, it } from 'vitest'
import { FAST_MS, FLOOR_HZ, SETTLE, WINDOW, makePacer, maxDivisor } from './pacing'

/** run `frames` vsyncs at `vsync` ms, charging `cost` ms to every frame the pacer says is due */
function drive(pacer: ReturnType<typeof makePacer>, frames: number, vsync: number, cost: number) {
  let rendered = 0
  for (let i = 0; i < frames; i++) {
    if (!pacer.due(vsync)) continue
    rendered += 1
    pacer.spent(cost)
  }
  return rendered
}

describe('maxDivisor', () => {
  it('never divides a 60 Hz display, whatever the frame costs', () => {
    expect(maxDivisor(1000 / 60)).toBe(1)
    expect(maxDivisor(1000 / 55)).toBe(1)
  })

  it('halves a 164 Hz display and no further — 55 fps is the floor', () => {
    expect(maxDivisor(1000 / 164)).toBe(2)
    expect(1000 / (maxDivisor(1000 / 164) * (1000 / 164))).toBeGreaterThan(FLOOR_HZ)
  })

  it('quarters a 240 Hz display, which lands on 60', () => {
    expect(maxDivisor(1000 / 240)).toBe(4)
  })

  it('treats a stall as no reading at all', () => {
    expect(maxDivisor(0)).toBe(1)
    expect(maxDivisor(500)).toBe(1)
  })
})

describe('makePacer', () => {
  const V164 = 1000 / 164

  it('leaves a frame that fits alone', () => {
    const p = makePacer()
    const rendered = drive(p, 400, V164, 3)
    expect(p.divisor()).toBe(1)
    expect(rendered).toBe(400)
  })

  /* THE CASE THIS FILE EXISTS FOR: 6.8 ms of work against a 6.1 ms budget. */
  it('halves the rate when the work does not fit, and then holds still', () => {
    const p = makePacer()
    drive(p, SETTLE * 3, V164, 6.8)
    expect(p.divisor()).toBe(2)

    /* and it stays there — the cost has not changed, so nothing should move again */
    const before = p.divisor()
    drive(p, 600, V164, 6.8)
    expect(p.divisor()).toBe(before)
  })

  it('renders every other vsync once halved', () => {
    const p = makePacer()
    drive(p, SETTLE * 3, V164, 6.8)
    const rendered = drive(p, 200, V164, 6.8)
    expect(rendered).toBe(100)
  })

  it('will not divide a 60 Hz display however slow the frame is', () => {
    const p = makePacer()
    drive(p, 600, 1000 / 60, 15.9)
    expect(p.divisor()).toBe(1)
  })

  it('goes back to every frame when the work gets cheap again', () => {
    const p = makePacer()
    drive(p, SETTLE * 3, V164, 6.8)
    expect(p.divisor()).toBe(2)
    drive(p, SETTLE * 3, V164, 2.5)
    expect(p.divisor()).toBe(1)
  })

  it('does not change cadence on a single slow frame', () => {
    const p = makePacer()
    drive(p, 200, V164, 3)
    p.due(V164); p.spent(30)
    expect(p.divisor()).toBe(1)
  })

  /* a dropped frame reads as two intervals; the panel is still the panel */
  it('reads the display rate off the middle of the window, not the average', () => {
    const p = makePacer()
    for (let i = 0; i < WINDOW; i++) { p.due(i % 3 === 0 ? V164 * 2 : V164); p.spent(3) }
    expect(p.vsync()).toBeCloseTo(V164, 1)
  })

  /* THE TWO ESTIMATORS THIS ONE REPLACED, both of which were measured wrong on the running build.
     `valley.ts` starts its loop by calling `frame()` synchronously so the first interval is a
     fraction of a millisecond, and rAF here delivers the odd 2 ms callback besides. A running
     minimum believed those: it read the panel at 0.16 ms, then at exactly the 2 ms floor, and
     paced the world down to a seventh of the display -- twelve frames a second. */
  it('is not moved by a scatter of impossibly short callbacks', () => {
    const p = makePacer()
    p.due(0.16)
    for (let i = 0; i < WINDOW * 2; i++) {
      if (!p.due(i % 17 === 0 ? 2.1 : V164)) continue
      p.spent(6.8)
    }
    expect(p.vsync()).toBeCloseTo(V164, 1)
    expect(p.divisor()).toBe(2)
  })

  it('rejects anything faster than a real panel', () => {
    expect(maxDivisor(FAST_MS / 2)).toBe(1)
  })

  it('follows the window onto a slower monitor', () => {
    const p = makePacer()
    drive(p, WINDOW, V164, 3)
    expect(p.vsync()).toBeCloseTo(V164, 1)
    drive(p, WINDOW * 2, 1000 / 60, 3)
    expect(p.vsync()).toBeCloseTo(1000 / 60, 1)
  })

  it('ignores a stall entirely', () => {
    const p = makePacer()
    drive(p, WINDOW, V164, 3)
    for (let i = 0; i < 20; i++) p.due(900)
    expect(p.vsync()).toBeCloseTo(V164, 1)
  })

  it('renders every frame when it is switched off', () => {
    const p = makePacer(false)
    expect(drive(p, 300, V164, 20)).toBe(300)
    expect(p.divisor()).toBe(1)
  })
})
