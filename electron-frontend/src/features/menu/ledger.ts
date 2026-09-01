import type { StudySummaryPayload } from '../../types'
import type { XPProgressPayload } from '../../generated/types'

/* ==================================================================================================
   THE LEDGER — YOU'S LEVEL TWO.

   RECORDS IS A LEDGER, NOT A ROAD. Its figures are things you READ, not places you go — there is
   nothing inside a streak to open — so it is the one section that does not get the road. The
   current run is set large with your best standing behind it in the same type at fifteen percent,
   so the two are read against each other without a second scale, a second axis or a word of
   explanation.

   THE YEAR IS REAL, AND THE MOCKUP'S WAS NOT. Its note says so outright: the lifetime count and the
   year's SHAPE were read from the database, and the individual days were synthesised from those
   parameters because a year of real dates is 365 lines of data to carry a drawing that only needs
   the distribution. `daily-activity` returns exactly that year — `{date, count, accuracy}` per day —
   so here the bars are the days themselves.

   AND TWO OF THE MOCKUP'S SIX FIGURES ARE NOT DRAWN, because this app does not have them.
   `RANK` (段級, "7TH GRADE") is not a thing JPLearn tracks — there is no grade system anywhere in
   `domain/`, and level is the app's own idea of the same shape. `STUDY TIME` in hours has no source
   either: `session_history` carries `started_at_utc`, `target_items`, `reviewed`, `correct` and
   `accuracy`, and no duration at all. A figure with no source is not drawn — it is not an absence
   of DATA, which this menu draws as an em dash, but an absence of the FEATURE, and printing
   "STUDY TIME —" would promise a thing the app has never measured.
   ================================================================================================== */

/** one day, as `daily-activity` reports it — only days with reviews come back */
export interface ActivityDay {
  date: string
  count: number
  accuracy: number
}

export interface LedgerWeek {
  /** reviews across the week */
  n: number
  /** how many of its seven days had any */
  days: number
  /** mean accuracy over the active days, weighted by reviews */
  acc: number
}

export interface LedgerYear {
  weeks: LedgerWeek[]
  /** active days, and the window they are counted over */
  active: number
  total: number
  reviews: number
  /** reviews-weighted accuracy across the whole year, or null when there is nothing to average */
  accuracy: number | null
}

export const LEDGER_WEEKS = 52

/* 52 WHOLE WEEKS IS 364 DAYS, not 365, and the caption says 364 for that reason rather than
   rounding a year. The window ends today and runs backwards, so the last bar is the week you are
   standing in and it is allowed to be short. */
export const LEDGER_DAYS = LEDGER_WEEKS * 7

/* AN EMPTY WEEK IS STILL DRAWN, as a floor tick. A week that renders as nothing at all is
   indistinguishable from the end of the year, which is exactly the reading a records screen must
   not give — and on a real account most weeks are empty, so this is the common case rather than
   the edge one. */
export function ledgerYear(days: readonly ActivityDay[], today: Date): LedgerYear {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const weeks: LedgerWeek[] = []
  let active = 0, reviews = 0, weighted = 0

  /* walk forward from the oldest day so the newest week is last, which is the way the band reads */
  const start = new Date(today)
  start.setDate(start.getDate() - (LEDGER_DAYS - 1))
  for (let w = 0; w < LEDGER_WEEKS; w++) {
    let n = 0, hit = 0, acc = 0
    for (let d = 0; d < 7; d++) {
      const day = new Date(start)
      day.setDate(day.getDate() + w * 7 + d)
      const found = byDate.get(iso(day))
      if (!found || found.count <= 0) continue
      n += found.count
      acc += found.accuracy * found.count
      hit++
    }
    active += hit
    reviews += n
    weighted += acc
    weeks.push({ n, days: hit, acc: n ? Math.round(acc / n) : 0 })
  }

  return {
    weeks, active, total: LEDGER_DAYS, reviews,
    accuracy: reviews ? Math.round(weighted / reviews) : null,
  }
}

/** the local calendar date, which is what `reviewed_on` is — never `toISOString`, which is UTC */
function iso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/* A BAR'S COLOUR IS ITS ACCURACY — a blend up the gold ramp over 70..100, so height and colour
   carry volume and quality at once. A contribution grid, having one square per day, can only carry
   one of the two. */
export function accColour(acc: number): string {
  const t = Math.max(0, Math.min(1, (acc - 70) / 30))
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${mix(122, 232)}, ${mix(92, 196)}, ${mix(46, 124)})`
}

export interface LedgerRow {
  key: string
  en: string
  jp: string
  /** the figure, or null when there is nothing to show yet */
  value: string | null
  unit: string
  /** what it says instead, when there is no figure */
  absent: string
}

export interface Ledger {
  streak: { now: number; best: number; freezes: number }
  year: LedgerYear
  rows: LedgerRow[]
  level: { level: number; xpIn: number; xpOf: number } | null
  badges: { earned: number; total: number }
}

export function buildLedger(
  summary: StudySummaryPayload | null | undefined,
  xp: XPProgressPayload | null | undefined,
  year: LedgerYear,
  badges: { earned: number; total: number },
): Ledger {
  const streak = summary?.streak
  return {
    streak: {
      now: streak?.current_days ?? 0,
      best: streak?.best_days ?? 0,
      freezes: streak?.freezes_available ?? 0,
    },
    year,
    rows: [
      {
        key: 'accuracy', en: 'ACCURACY', jp: '正答率',
        value: year.accuracy === null ? null : String(year.accuracy), unit: '%',
        absent: 'NOTHING REVIEWED THIS YEAR',
      },
      {
        key: 'reviews', en: 'REVIEWS', jp: '復習',
        value: year.reviews ? year.reviews.toLocaleString() : null, unit: '',
        absent: 'NONE YET',
      },
    ],
    /* THE XP FIGURE, AND THE ONE ARITHMETIC TRAP IN IT. `xp_for_current_level` is the SIZE of this
       level and `xp_to_next_level` is what is left of it, so what you have done inside it is the
       difference -- reading the two as absolute thresholds is what once put "0 / 1 XP" on the
       crown. */
    level: xp
      ? {
        level: xp.level,
        xpIn: Math.max(0, xp.xp_for_current_level - xp.xp_to_next_level),
        xpOf: xp.xp_for_current_level,
      }
      : null,
    badges,
  }
}
