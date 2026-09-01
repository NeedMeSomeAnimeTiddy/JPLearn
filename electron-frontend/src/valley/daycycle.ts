import { Color, MathUtils } from 'three'

/* ==================================================================================================
   THE DAY, WHICH IS THE DIFFERENCE BETWEEN A POSTCARD AND A PLACE.

   Everything this port has drawn so far is ONE ROW of the table below — `alt: 7.5`, which the mockup
   labels "the approved shot". Every constant in `lighting.ts` and `shafts.ts` was lifted from it: the
   key at 0xffc189 and 6.4, the fill at 0x6f8bd6, the hemisphere, the two scattering lobes, the ray
   amount at 1.9. Faithful, and frozen. Asked for a screenshot at nine in the evening the mockup comes
   back with a moon, stars and a valley full of lit windows; this port comes back with the same sunset
   it would show at four in the morning.

   THE SUN'S HEIGHT IS THE ONLY INPUT. Not the hour — a summer evening at 21:00 is not a winter one,
   and neither is 21:00 in Tokyo and in Oslo. Solar altitude collapses date, latitude and clock into
   the one number the light actually depends on, so the table is indexed by degrees above the horizon
   and everything else is arithmetic.

   AND THE POSITION IS A GUESS THAT SAYS SO. The browser gives up a time-zone name without asking
   permission and never a position; the difference between 35N and 55N in August is two hours of
   evening, which is the difference between the app going dark while it is still bright outside and
   it not. A zone name is the best free evidence there is. Longitude is in the table too, because
   deriving it from the UTC offset assumes you stand at the middle of your zone — for London on
   summer time that is fifteen degrees EAST, which is Prague, and a real hour of error.
   ================================================================================================== */

export interface DayStop {
  /** degrees of sun above the horizon this row is authored for */
  alt: number
  keyCol: number; keyI: number
  fillCol: number; fillI: number
  hemiSky: number; hemiGnd: number; hemiI: number
  fogCol: number; fogK: number
  /** tone-mapping exposure; night is pulled down rather than lit up */
  expo: number
  skyHorizon: number; skyZenith: number; skyHorizAmt: number; skyZenAmt: number
  skyBurnCol: number; skyBurnG: number
  skyWideCol: number; skyWideG: number
  skyTightCol: number; skyTightG: number
  rayAmt: number; haloAmt: number; coreAmt: number; rayCol: number; haloCol: number
  discCore: number; discMid: number; discCoreG: number; discCoronaG: number
  skyGain: number
  /** 0..1.3 — carried from the mockup's table; there is no star field in this port yet */
  stars: number
  /** the flat fill under a cloud's underside, which is why a midnight cloud is not pink */
  cloudEmis: number
  /** how much sky the chrome may hold itself up with, handed to CSS as `--sky` */
  uiSky: number
  /** 0..1 — carried; there are no lanterns in this port yet */
  lampOn: number
}

/* SEVEN STOPS, VERBATIM FROM THE MOCKUP. Reformatted and not retuned: every one of these numbers was
   arrived at against the same world this port renders, from the same camera, and the fifth of them
   is what is already shipping. Re-deriving them by eye would be redoing a week of somebody else's
   tuning, badly. */
export const DAY_STOPS: readonly DayStop[] = [
  { alt: -90,
    keyCol: 0xb9c9ff, keyI: 0.50, fillCol: 0x303c68, fillI: 0.55, hemiSky: 0x2b3458,
    hemiGnd: 0x17171f, hemiI: 0.34, fogCol: 0x1e2742, fogK: 1.0, expo: 0.92,
    skyHorizon: 0x2e3a66, skyZenith: 0x0e1128, skyHorizAmt: 0.90, skyZenAmt: 0.85,
    skyBurnCol: 0x243056, skyBurnG: 0.06, skyWideCol: 0x2a3a68, skyWideG: 0.06,
    skyTightCol: 0x8fa8e0, skyTightG: 0.10,
    rayAmt: 0.35, haloAmt: 0.20,
    coreAmt: 0.42, rayCol: 0xc8d8ff, haloCol: 0x9ab0e8, discCore: 0xdfe8ff, discMid: 0xa8b8dc,
    discCoreG: 1.4, discCoronaG: 0.20, skyGain: 0.085, stars: 1.30, cloudEmis: 0x232840,
    uiSky: 0.00, lampOn: 1.00 },
  { alt: -10,
    keyCol: 0x8c9ad8, keyI: 0.60, fillCol: 0x44529a, fillI: 1.20, hemiSky: 0x424c86,
    hemiGnd: 0x272428, hemiI: 0.42, fogCol: 0x3e3f62, fogK: 1.0, expo: 0.95,
    skyHorizon: 0x6a4a70, skyZenith: 0x1c2048, skyHorizAmt: 0.85, skyZenAmt: 0.75,
    skyBurnCol: 0x6a3a58, skyBurnG: 0.20, skyWideCol: 0x4a3a68, skyWideG: 0.12,
    skyTightCol: 0x8a6a8a, skyTightG: 0.10, rayAmt: 0.30, haloAmt: 0.15, coreAmt: 0.30,
    rayCol: 0xa8a0d0, haloCol: 0x8a7aa8, discCore: 0xe8d8d0, discMid: 0xc08a80, discCoreG: 1.6,
    discCoronaG: 0.24, skyGain: 0.22, stars: 0.95, cloudEmis: 0x3f3b56, uiSky: 0.04,
    lampOn: 1.00 },
  { alt: -4,
    keyCol: 0xa08cc0, keyI: 0.90, fillCol: 0x5568b0, fillI: 1.50, hemiSky: 0x6a72b8,
    hemiGnd: 0x36302e, hemiI: 0.50, fogCol: 0x8a6d86, fogK: 1.0, expo: 1.0,
    skyHorizon: 0xd8562e, skyZenith: 0x2a2a68, skyHorizAmt: 0.80, skyZenAmt: 0.70,
    skyBurnCol: 0xc04a2a, skyBurnG: 0.34, skyWideCol: 0x9a4a48, skyWideG: 0.22,
    skyTightCol: 0xd8886a, skyTightG: 0.20, rayAmt: 0.55, haloAmt: 0.09, coreAmt: 0.10,
    rayCol: 0xc07a58, haloCol: 0xa85a44, discCore: 0xffd0a8, discMid: 0xe07a48, discCoreG: 2.0,
    discCoronaG: 0.40, skyGain: 0.50, stars: 0.35, cloudEmis: 0x6d6480, uiSky: 0.16,
    lampOn: 0.85 },
  { alt: 0.5,
    keyCol: 0xff8a4a, keyI: 3.20, fillCol: 0x6a7fc8, fillI: 1.50, hemiSky: 0xa89ad0,
    hemiGnd: 0x4a3c30, hemiI: 0.48, fogCol: 0xd88a58, fogK: 1.0, expo: 1.0,
    skyHorizon: 0xff4a10, skyZenith: 0x3a3078, skyHorizAmt: 0.85, skyZenAmt: 0.58,
    skyBurnCol: 0xff5a20, skyBurnG: 0.50, skyWideCol: 0xff6a28, skyWideG: 0.42,
    skyTightCol: 0xffc07a, skyTightG: 0.55, rayAmt: 2.20, haloAmt: 0.16, coreAmt: 0.20,
    rayCol: 0xff9450, haloCol: 0xff6a28, discCore: 0xffd9a8, discMid: 0xff7a38, discCoreG: 2.6,
    discCoronaG: 0.55, skyGain: 0.85, stars: 0.00, cloudEmis: 0x8f7f8a, uiSky: 0.36,
    lampOn: 0.45 },
  { alt: 7.5,
    keyCol: 0xffc189, keyI: 6.40, fillCol: 0x6f8bd6, fillI: 1.35, hemiSky: 0xb3b2e0,
    hemiGnd: 0x54463a, hemiI: 0.44, fogCol: 0xdca782, fogK: 1.0, expo: 1.0,
    skyHorizon: 0xff6a1e, skyZenith: 0x4a3f86, skyHorizAmt: 0.68, skyZenAmt: 0.50,
    skyBurnCol: 0xff7a30, skyBurnG: 0.34, skyWideCol: 0xff8a3c, skyWideG: 0.32,
    skyTightCol: 0xffd7a4, skyTightG: 0.40, rayAmt: 1.90, haloAmt: 0.11, coreAmt: 0.16,
    rayCol: 0xffb066, haloCol: 0xff9040, discCore: 0xfff4e2, discMid: 0xffb066, discCoreG: 3.6,
    discCoronaG: 0.42, skyGain: 1.00, stars: 0.00, cloudEmis: 0x9d97b2, uiSky: 0.50,
    lampOn: 0.12 },
  { alt: 22,
    keyCol: 0xffe2bc, keyI: 6.20, fillCol: 0x7d95d8, fillI: 1.05, hemiSky: 0xc0c8ee,
    hemiGnd: 0x60543f, hemiI: 0.55, fogCol: 0xd6bda4, fogK: 1.0, expo: 1.0,
    skyHorizon: 0xff9c58, skyZenith: 0x5566b0, skyHorizAmt: 0.45, skyZenAmt: 0.55,
    skyBurnCol: 0xffa060, skyBurnG: 0.16, skyWideCol: 0xffb07a, skyWideG: 0.18,
    skyTightCol: 0xffe6c8, skyTightG: 0.30, rayAmt: 0.90, haloAmt: 0.07, coreAmt: 0.12,
    rayCol: 0xffd0a0, haloCol: 0xffb98a, discCore: 0xfffaf0, discMid: 0xffd8a8, discCoreG: 4.2,
    discCoronaG: 0.30, skyGain: 1.05, stars: 0.00, cloudEmis: 0xa7a6c4, uiSky: 0.80,
    lampOn: 0.00 },
  { alt: 55,
    keyCol: 0xfff8ee, keyI: 5.80, fillCol: 0x93b0dc, fillI: 0.85, hemiSky: 0xd2dcf6,
    hemiGnd: 0x6c6450, hemiI: 0.62, fogCol: 0xc9d2e0, fogK: 1.0, expo: 1.0,
    skyHorizon: 0xbfd0e8, skyZenith: 0x3f6ec8, skyHorizAmt: 0.55, skyZenAmt: 0.80,
    skyBurnCol: 0xa8c0e0, skyBurnG: 0.10, skyWideCol: 0xc8dcf0, skyWideG: 0.12,
    skyTightCol: 0xffffff, skyTightG: 0.35, rayAmt: 0.50, haloAmt: 0.05, coreAmt: 0.10,
    rayCol: 0xffffff, haloCol: 0xdce8ff, discCore: 0xffffff, discMid: 0xfff0d8, discCoreG: 5.0,
    discCoronaG: 0.22, skyGain: 1.10, stars: 0.00, cloudEmis: 0xb0b4d0, uiSky: 1.00,
    lampOn: 0.00 },]

/** every field that is a colour, and must therefore be mixed in linear light rather than in bytes */
export const DAY_COLOURS: ReadonlySet<string> = new Set([
  'keyCol', 'fillCol', 'hemiSky', 'hemiGnd', 'fogCol', 'skyHorizon', 'skyZenith',
  'skyBurnCol', 'skyWideCol', 'skyTightCol', 'rayCol', 'haloCol', 'discCore', 'discMid',
  'cloudEmis',
])

export interface DayMix {
  alt: number
  numbers: Record<string, number>
  colours: Record<string, Color>
}

/* ONE SET OF COLORS, REUSED. This runs every frame, and a fresh Color per field per frame is fifteen
   allocations sixty times a second for nothing. */
const _a = new Color()
const _b = new Color()
const _mix: DayMix = { alt: 0, numbers: {}, colours: {} }
for (const key of DAY_COLOURS) _mix.colours[key] = new Color()

/**
 * The palette at a given solar altitude.
 *
 * Returns a SHARED object: read it and write it out, never keep it.
 */
export function dayPalette(alt: number): DayMix {
  let i = 0
  while (i < DAY_STOPS.length - 2 && alt > DAY_STOPS[i + 1].alt) i++
  const a = DAY_STOPS[i] as unknown as Record<string, number>
  const b = DAY_STOPS[i + 1] as unknown as Record<string, number>
  const k = MathUtils.clamp((alt - a.alt) / (b.alt - a.alt), 0, 1)
  for (const key of Object.keys(a)) {
    if (key === 'alt') continue
    if (DAY_COLOURS.has(key)) {
      /* SET BY HEX, WHICH DECODES sRGB TO LINEAR, so the mix happens in light rather than in bytes
         — the difference between orange fading to blue through grey and through mud. */
      _a.setHex(a[key])
      _b.setHex(b[key])
      _mix.colours[key].lerpColors(_a, _b, k)
    } else {
      _mix.numbers[key] = a[key] + (b[key] - a[key]) * k
    }
  }
  _mix.alt = alt
  return _mix
}

/* ==================================================================================================
   WHERE THE SUN IS, FOR REAL. Low-precision solar position: mean anomaly, equation of centre,
   ecliptic longitude, then declination and hour angle. Better than a degree, which is far better
   than a painted sky can show.  https://en.wikipedia.org/wiki/Position_of_the_Sun
   ================================================================================================== */

const RAD = Math.PI / 180

export interface SolarState {
  /** degrees above the horizon; negative at night */
  alt: number
  /** the highest the sun gets here today — a winter noon is not a summer noon */
  altMax: number
  /** 0 at sunrise, 1 at sunset, outside that at night */
  p: number
  /** the half-day in hour-angle radians; 0 in a polar night, PI in a polar day */
  H0: number
}

export function solarState(date: Date, lat: number, lon: number): SolarState {
  const d = date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545
  const M = RAD * (357.5291 + 0.98560028 * d)
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const L = M + C + RAD * 102.9372 + Math.PI
  const e = RAD * 23.4397
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L))
  const theta = RAD * (280.16 + 360.9856235 * d) - RAD * -lon
  /* the hour angle, wrapped to (-pi, pi]: 0 at solar noon, negative in the morning */
  let H = theta - ra
  H = Math.atan2(Math.sin(H), Math.cos(H))
  const phi = RAD * lat
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const altMax = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec))
  /* the hour angle at sunrise, from cos(H0) = -tan(phi)tan(dec). Beyond the polar circles this has
     no solution — the day never ends or never starts — and clamping gives exactly that. */
  const c0 = -Math.tan(phi) * Math.tan(dec)
  const H0 = c0 >= 1 ? 0 : c0 <= -1 ? Math.PI : Math.acos(c0)
  return { alt: alt / RAD, altMax: altMax / RAD, p: H0 > 1e-6 ? (H + H0) / (2 * H0) : 0.5, H0 }
}

/* ==================================================================================================
   AND WHERE THE VIEWER IS, WHICH IS A GUESS AND IS LABELLED ONE.
   ================================================================================================== */

/** the places a time-zone name is worth resolving to, latitude first */
export const ZONE_AT: Readonly<Record<string, readonly [number, number]>> = {
  'Europe/London': [51.5, -0.1], 'Europe/Dublin': [53.3, -6.3], 'Europe/Lisbon': [38.7, -9.1],
  'Europe/Madrid': [40.4, -3.7], 'Europe/Paris': [48.9, 2.4], 'Europe/Brussels': [50.8, 4.4],
  'Europe/Amsterdam': [52.4, 4.9], 'Europe/Berlin': [52.5, 13.4], 'Europe/Zurich': [47.4, 8.5],
  'Europe/Vienna': [48.2, 16.4], 'Europe/Prague': [50.1, 14.4], 'Europe/Rome': [41.9, 12.5],
  'Europe/Athens': [38.0, 23.7], 'Europe/Warsaw': [52.2, 21.0], 'Europe/Stockholm': [59.3, 18.1],
  'Europe/Oslo': [59.9, 10.7], 'Europe/Copenhagen': [55.7, 12.6], 'Europe/Helsinki': [60.2, 24.9],
  'Europe/Moscow': [55.8, 37.6],
  'America/New_York': [40.7, -74.0], 'America/Toronto': [43.7, -79.4],
  'America/Chicago': [41.9, -87.6], 'America/Denver': [39.7, -105.0],
  'America/Phoenix': [33.4, -112.1], 'America/Los_Angeles': [34.1, -118.2],
  'America/Vancouver': [49.3, -123.1], 'America/Mexico_City': [19.4, -99.1],
  'America/Bogota': [4.7, -74.1], 'America/Sao_Paulo': [-23.6, -46.6],
  'America/Argentina/Buenos_Aires': [-34.6, -58.4],
  'Asia/Tokyo': [35.7, 139.7], 'Asia/Seoul': [37.6, 127.0], 'Asia/Shanghai': [31.2, 121.5],
  'Asia/Hong_Kong': [22.3, 114.2], 'Asia/Taipei': [25.0, 121.6], 'Asia/Singapore': [1.4, 103.8],
  'Asia/Bangkok': [13.8, 100.5], 'Asia/Kolkata': [28.6, 77.2], 'Asia/Dubai': [25.2, 55.3],
  'Asia/Jerusalem': [31.8, 35.2], 'Asia/Manila': [14.6, 121.0], 'Asia/Jakarta': [-6.2, 106.8],
  'Australia/Perth': [-31.9, 115.9], 'Australia/Brisbane': [-27.5, 153.0],
  'Australia/Sydney': [-33.9, 151.2], 'Australia/Melbourne': [-37.8, 145.0],
  'Pacific/Auckland': [-36.9, 174.8],
  'Africa/Cairo': [30.0, 31.2], 'Africa/Lagos': [6.5, 3.4], 'Africa/Nairobi': [-1.3, 36.8],
  'Africa/Johannesburg': [-26.2, 28.0],
}

/** 40N is a mid-northern default: wrong everywhere, absurd nowhere */
export const FALLBACK_LAT = 40

/**
 * Latitude and longitude for a time-zone name.
 *
 * The UTC offset is the fallback ONLY, for a zone this table has never heard of, and it is a poor
 * one — it assumes you stand at the middle of your zone.
 */
export function siteFor(zone: string, offsetMinutes: number): readonly [number, number] {
  const known = ZONE_AT[zone]
  if (known) return known
  return [FALLBACK_LAT, (-offsetMinutes / 60) * 15]
}

/** where this machine thinks it is, with the browser's own answers */
export function siteHere(): readonly [number, number] {
  let zone = ''
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { zone = '' }
  return siteFor(zone, new Date().getTimezoneOffset())
}
