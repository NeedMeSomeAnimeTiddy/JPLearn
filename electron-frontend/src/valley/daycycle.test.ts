import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import {
  DAY_STOPS, FALLBACK_LAT, ZONE_AT, dayPalette, siteFor, solarState,
} from './daycycle'
import { KEY_COLOUR, KEY_INTENSITY, FILL_COLOUR, FILL_INTENSITY, HEMI_INTENSITY } from './lighting'

const LONDON: [number, number] = [51.5, -0.1]
const utc = (iso: string) => new Date(iso)

describe('where the sun is', () => {
  it('puts it up at midday and under at midnight', () => {
    expect(solarState(utc('2026-06-21T12:00:00Z'), ...LONDON).alt).toBeGreaterThan(50)
    expect(solarState(utc('2026-06-21T00:00:00Z'), ...LONDON).alt).toBeLessThan(-10)
  })

  it('knows a winter noon is not a summer noon', () => {
    /* the whole reason the table is indexed by ALTITUDE and not by the hour: 12:00 in London is a
       different light in June and December, and so is 21:00 in London and in Tokyo */
    const june = solarState(utc('2026-06-21T12:00:00Z'), ...LONDON).altMax
    const december = solarState(utc('2026-12-21T12:00:00Z'), ...LONDON).altMax
    expect(june).toBeGreaterThan(55)
    expect(december).toBeLessThan(20)
    expect(june - december).toBeGreaterThan(40)
  })

  it('agrees with the almanac on when the sun sets', () => {
    /* MEASURED AGAINST A KNOWN ANSWER, not against itself: London on midsummer sets at 21:21 BST,
       which is 20:21 UTC. Walk the evening a minute at a time and find the crossing. */
    let crossed: Date | null = null
    for (let m = 0; m < 180; m++) {
      const t = new Date(Date.UTC(2026, 5, 21, 19, m))
      if (solarState(t, ...LONDON).alt < 0) { crossed = t; break }
    }
    expect(crossed).not.toBeNull()
    const minutes = (crossed as Date).getUTCHours() * 60 + (crossed as Date).getUTCMinutes()
    /* 20:21 UTC is 1221; a low-precision solar position is good to about a degree, which near the
       horizon in June at this latitude is a handful of minutes */
    expect(Math.abs(minutes - 1221)).toBeLessThan(12)
  })

  it('gives the poles a day that never ends and a night that never starts', () => {
    /* cos(H0) = -tan(phi)tan(dec) has no solution inside the polar circles, and clamping is the
       right answer rather than a NaN that would propagate into every colour on the screen */
    const midnightSun = solarState(utc('2026-06-21T00:00:00Z'), 78, 15)
    expect(midnightSun.H0).toBeCloseTo(Math.PI, 5)
    expect(midnightSun.alt).toBeGreaterThan(0)

    const polarNight = solarState(utc('2026-12-21T12:00:00Z'), 78, 15)
    expect(polarNight.H0).toBe(0)
    expect(polarNight.alt).toBeLessThan(0)
    expect(Number.isNaN(polarNight.alt)).toBe(false)
  })
})

describe('the palette', () => {
  it('returns the approved shot exactly at the altitude it was authored for', () => {
    /* THE FIFTH STOP IS WHAT THE PORT HAS BEEN SHIPPING, and every constant in `lighting.ts` came
       out of it. If the table and those constants ever disagree, the day cycle would visibly
       change the picture at the one altitude it must not. */
    const m = dayPalette(7.5)
    expect(m.numbers.keyI).toBeCloseTo(KEY_INTENSITY, 6)
    expect(m.numbers.fillI).toBeCloseTo(FILL_INTENSITY, 6)
    expect(m.numbers.hemiI).toBeCloseTo(HEMI_INTENSITY, 6)
    expect(m.colours.keyCol.getHex()).toBe(KEY_COLOUR)
    expect(m.colours.fillCol.getHex()).toBe(FILL_COLOUR)
  })

  it('clamps past both ends of the table rather than extrapolating', () => {
    /* READ IT BEFORE ASKING AGAIN. The first version of this test held both answers and compared
       them, which is exactly what the shared-object contract below forbids -- it read 5.8 for the
       midnight end, because that was the second call's value in the same object. */
    const below = dayPalette(-200).numbers.keyI
    const above = dayPalette(200).numbers.keyI
    expect(below).toBeCloseTo(DAY_STOPS[0].keyI, 6)
    expect(above).toBeCloseTo(DAY_STOPS[DAY_STOPS.length - 1].keyI, 6)
  })

  it('walks monotonically from night to noon', () => {
    /* the key gets brighter and the exposure comes up as the sun rises; a table row entered out of
       order would show as the valley getting darker at dawn */
    const alts = [-90, -30, -4, 0.5, 7.5, 22, 55]
    const keys = alts.map((a) => dayPalette(a).numbers.keyI)
    expect(keys[0]).toBeLessThan(keys[3])
    expect(keys[3]).toBeLessThan(keys[4])
    expect(dayPalette(-90).numbers.stars).toBeGreaterThan(1)
    expect(dayPalette(22).numbers.stars).toBe(0)
  })

  it('mixes colour in linear light, not in bytes', () => {
    /* SET BY HEX DECODES sRGB TO LINEAR, and that is the difference between orange fading to blue
       through grey and through mud. Halfway between two stops the linear mix is measurably darker
       than the byte average, and this asserts the direction. */
    const a = DAY_STOPS[3]
    const b = DAY_STOPS[4]
    const mid = dayPalette((a.alt + b.alt) / 2).colours.keyCol
    const byteAvg = new Color(
      ((((a.keyCol >> 16) & 255) + ((b.keyCol >> 16) & 255)) / 2) / 255,
      ((((a.keyCol >> 8) & 255) + ((b.keyCol >> 8) & 255)) / 2) / 255,
      (((a.keyCol & 255) + (b.keyCol & 255)) / 2) / 255,
    )
    /* `mid` is linear; `byteAvg` was built from sRGB bytes treated as linear, so it reads high */
    expect(mid.g).toBeLessThan(byteAvg.g)
  })

  it('hands back one shared object, which the caller must not keep', () => {
    /* fifteen Colors per frame is fifteen allocations sixty times a second for nothing */
    expect(dayPalette(0)).toBe(dayPalette(30))
  })
})

describe('where the viewer is', () => {
  it('prefers the table to the offset, because a zone is not its middle', () => {
    /* deriving longitude from the UTC offset puts London on summer time at 15 degrees EAST, which
       is Prague -- a real hour, and the difference between going dark before sunset and not */
    expect(siteFor('Europe/London', -60)).toEqual(ZONE_AT['Europe/London'])
    expect(siteFor('Europe/London', -60)[1]).toBeCloseTo(-0.1, 5)
  })

  it('falls back to the middle of the zone only for a name it has never heard of', () => {
    const [lat, lon] = siteFor('Mars/Olympus_Mons', -120)
    expect(lat).toBe(FALLBACK_LAT)
    expect(lon).toBeCloseTo(30, 5)
  })

  it('is wrong everywhere and absurd nowhere', () => {
    /* the fallback latitude has to give a plausible day length rather than a polar one */
    const s = solarState(utc('2026-06-21T12:00:00Z'), FALLBACK_LAT, 0)
    expect(s.alt).toBeGreaterThan(60)
    expect(s.H0).toBeGreaterThan(0)
    expect(s.H0).toBeLessThan(Math.PI)
  })
})
