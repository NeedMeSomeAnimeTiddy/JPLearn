import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  CLOUD_COUNT, CLOUD_FAR, CLOUD_NEAR, CLOUD_Y_HIGH, CLOUD_Y_LOW, driftDegrees, hash01,
} from './clouds'
import { DESTINATIONS } from './destinations'
import { HOME_EYE } from './flight'

/** the camera's own far plane, from `pickCamera` — the constraint the ring is sized against */
const CAMERA_FAR = 40000

/** where every cluster is placed, without needing three to build one */
function ringPositions(): Vector3[] {
  const out: Vector3[] = []
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const az = (i / CLOUD_COUNT) * Math.PI * 2 + hash01(i, 91) * 0.3
    const dist = CLOUD_NEAR + hash01(i, 3) * (CLOUD_FAR - CLOUD_NEAR)
    const y = CLOUD_Y_LOW + hash01(i, 17) * (CLOUD_Y_HIGH - CLOUD_Y_LOW)
    out.push(new Vector3(Math.cos(az) * dist, y, Math.sin(az) * dist))
  }
  return out
}

/** every place the camera is ever put: home, and the five destinations */
function everyEye(): Vector3[] {
  const eyes = [new Vector3(HOME_EYE[0], HOME_EYE[1], HOME_EYE[2])]
  for (const spec of Object.values(DESTINATIONS)) {
    eyes.push(new Vector3(spec.eye[0], spec.eye[1], spec.eye[2]))
  }
  return eyes
}

describe('the sky the clouds hang in', () => {
  it('keeps every cloud inside the far plane from every camera in the set', () => {
    /* THIS IS THE CONSTRAINT THAT SIZED THE RING, and the one that breaks silently: add a
       destination further out and the opposite side of the ring crosses `far`, and clouds pop out
       of existence mid-flight rather than erroring. */
    const clouds = ringPositions()
    for (const eye of everyEye()) {
      for (const cloud of clouds) {
        expect(cloud.distanceTo(eye)).toBeLessThan(CAMERA_FAR)
      }
    }
  })

  it('never puts a cloud close enough to fly into', () => {
    /* the other end of the same constraint: at RECORDS the camera stands 11,192 units down −z, so
       a ring drawn at 12,000 would leave one 800 units off the lens -- a white wall, not weather */
    const clouds = ringPositions()
    let nearest = Infinity
    for (const eye of everyEye()) {
      for (const cloud of clouds) nearest = Math.min(nearest, cloud.distanceTo(eye))
    }
    /* a cluster is up to 3,600 across, so this is several cloud-widths of clearance */
    expect(nearest).toBeGreaterThan(6000)
  })

  it('hangs them above the summit rather than around it', () => {
    /* Fuji's peak hint is y 7,220; clouds below it read as mist caught on the mountain, and mist
       is a separate system with its own reason to exist */
    expect(CLOUD_Y_LOW).toBeGreaterThan(4000)
    for (const cloud of ringPositions()) {
      expect(cloud.y).toBeGreaterThanOrEqual(CLOUD_Y_LOW)
      expect(cloud.y).toBeLessThanOrEqual(CLOUD_Y_HIGH)
    }
  })

  it('scatters them round the whole ring rather than bunching', () => {
    /* an even spread is what makes the band read as weather rather than as a row of objects */
    const azimuths = ringPositions().map((p) => Math.atan2(p.z, p.x)).sort((a, b) => a - b)
    const gaps = azimuths.slice(1).map((a, i) => a - azimuths[i])
    /* no quadrant-sized hole: with 34 clouds the mean gap is 10.6 degrees */
    expect(Math.max(...gaps)).toBeLessThan(Math.PI / 4)
  })
})

describe('the drift', () => {
  it('is deterministic, so two runs of the same build are comparable', () => {
    /* a sky that reshuffles itself between launches is a sky nobody composed -- and a screenshot
       stops being evidence of anything */
    expect(hash01(7, 91)).toBe(hash01(7, 91))
    expect(hash01(7, 91)).not.toBe(hash01(7, 3))
    for (let i = 0; i < 200; i++) {
      const h = hash01(i, 41)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })

  it('gives every cluster its own rate, so the ring never moves as one', () => {
    /* drifting in lockstep reads as the CAMERA turning rather than as weather moving */
    const rates = new Set<number>()
    for (let i = 0; i < CLOUD_COUNT; i++) rates.add(0.0009 + hash01(i, 67) * 0.0016)
    expect(rates.size).toBe(CLOUD_COUNT)
  })

  it('moves slowly enough to be weather and fast enough to be moving', () => {
    /* MEASURED AGAINST THE EYE, not chosen: under a degree a minute is not visible as motion, and
       over about ten is a time-lapse. The slowest and fastest both have to sit inside that. */
    const slowest = driftDegrees(0.0009, 60)
    const fastest = driftDegrees(0.0009 + 0.0016, 60)
    expect(slowest).toBeGreaterThan(1)
    expect(fastest).toBeLessThan(10)
  })
})
