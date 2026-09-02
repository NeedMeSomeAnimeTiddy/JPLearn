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

/* ==================================================================================================
   AND EVERY FIGURE OPENS ONTO WHAT IT IS MADE OF.

   THE LEDGER WAS A WALL OF DEAD ENDS. Six plates, every one of them a number you could read and
   nothing you could do — no press, no cursor, no second level — on the one screen in this menu whose
   entire subject is "what have I actually done". A records screen that answers "62%" and refuses
   "62% of what" is the shape of a dashboard rather than of a record.

   A SHEET, NOT A TOOLTIP, and for the same reason the chips got panels: the answer is four lines and
   a caveat, and a tooltip is one line. Each carries the same three things —

     - THE LINES, which are the figure taken apart. Best and worst week, days counted, longest gap.
     - THE STRIP, which is the same 52 weeks the year plate draws, at a third the height. It is on
       five of the six sheets because almost every figure here is a MEAN over that window, and a mean
       shown without its distribution is the number people misread.
     - THE NOTE, which is the caveat. This is the part the mockup got right and it is the reason the
       sheets exist at all: "the figure on the front is a mean of 41 days, not a single number the app
       keeps". Every one of these numbers has a caveat like that, and the front of the plate has no
       room for any of them.

   AND NOT THE MOCKUP'S SIX. Its STUDY TIME sheet leads on hours and its RANK sheet on a grade; this
   app keeps neither, and a records screen that invents a figure is worse than one that omits it. The
   four it can honestly fill are here, and the rest of the mockup's lines come from the same year
   window this file already builds.
   ================================================================================================== */

export type SheetKey = 'streak' | 'accuracy' | 'reviews' | 'year' | 'level'

export interface SheetLine {
  k: string
  v: string
  /** drawn faint, for a line whose answer is an absence */
  off?: boolean
}

export interface LedgerSheet {
  jp: string
  en: string
  lines: SheetLine[]
  note: string
  /** whether the 52-week strip is drawn under the caption, and coloured by accuracy */
  strip: boolean
  acc: boolean
}

/** the busiest week in the window, the best and worst weeks that had anything in them, and the
    longest run of weeks with nothing at all */
export function yearShape(year: LedgerYear): {
  busiest: number; best: number | null; worst: number | null; gap: number
} {
  let busiest = 0, best: number | null = null, worst: number | null = null
  let gap = 0, run = 0
  for (const w of year.weeks) {
    if (w.n > busiest) busiest = w.n
    if (w.n > 0) {
      if (best === null || w.acc > best) best = w.acc
      if (worst === null || w.acc < worst) worst = w.acc
      run = 0
    } else {
      run++
      if (run > gap) gap = run
    }
  }
  return { busiest, best, worst, gap }
}

const n = (v: number) => v.toLocaleString()

/**
 * What is behind one plate.
 *
 * Returns null for a plate with nothing behind it — the level sheet on an account that has no XP
 * payload — so a plate that cannot answer stays a plate rather than opening onto four dashes.
 */
export function ledgerSheet(key: SheetKey, L: Ledger): LedgerSheet | null {
  const s = yearShape(L.year)
  if (key === 'streak') {
    return {
      jp: '連続', en: 'STREAK', strip: true, acc: false,
      lines: [
        { k: 'RUNNING NOW', v: `${n(L.streak.now)} DAY${L.streak.now === 1 ? '' : 'S'}` },
        { k: 'YOUR BEST RUN', v: `${n(L.streak.best)} DAY${L.streak.best === 1 ? '' : 'S'}` },
        { k: 'FREEZES LEFT', v: n(L.streak.freezes), off: L.streak.freezes === 0 },
        { k: 'ACTIVE DAYS THIS YEAR', v: `${n(L.year.active)} OF ${n(L.year.total)}` },
      ],
      note: 'A DAY COUNTS ONCE YOU HAVE GRADED ANYTHING AT ALL — THE STREAK IS ABOUT TURNING UP. '
        + 'A FREEZE COVERS ONE MISSED DAY.',
    }
  }
  if (key === 'accuracy') {
    return {
      jp: '正答率', en: 'ACCURACY', strip: true, acc: true,
      lines: [
        { k: 'THIS YEAR', v: L.year.accuracy === null ? '—' : `${L.year.accuracy}%`,
          off: L.year.accuracy === null },
        { k: 'BEST WEEK', v: s.best === null ? '—' : `${s.best}%`, off: s.best === null },
        { k: 'WORST WEEK', v: s.worst === null ? '—' : `${s.worst}%`, off: s.worst === null },
        { k: 'DAYS COUNTED', v: n(L.year.active) },
      ],
      note: `THE FIGURE ON THE FRONT IS A MEAN OF ${n(L.year.active)} DAYS, NOT A SINGLE NUMBER `
        + 'THE APP KEEPS. EVERY BAR ABOVE IS ONE WEEK, COLOURED BY ITS OWN ACCURACY.',
    }
  }
  if (key === 'reviews') {
    return {
      jp: '復習', en: 'REVIEWS', strip: true, acc: false,
      lines: [
        { k: 'THIS YEAR', v: n(L.year.reviews) },
        { k: 'ACTIVE DAYS', v: `${n(L.year.active)} OF ${n(L.year.total)}` },
        { k: 'BUSIEST WEEK', v: `${n(s.busiest)} REVIEWS`, off: s.busiest === 0 },
        { k: 'A DAY YOU STUDIED', v: L.year.active
          ? `${n(Math.round(L.year.reviews / L.year.active))} REVIEWS`
          : '—', off: L.year.active === 0 },
      ],
      note: 'THE LAST LINE IS A MEAN OVER THE DAYS YOU TURNED UP, NOT OVER THE YEAR — DIVIDING BY '
        + '364 WOULD MEASURE HOW OFTEN YOU STUDY RATHER THAN HOW MUCH.',
    }
  }
  if (key === 'year') {
    return {
      jp: '一年', en: 'THE YEAR', strip: true, acc: false,
      lines: [
        { k: 'ACTIVE DAYS', v: `${n(L.year.active)} OF ${n(L.year.total)}` },
        { k: 'TOTAL REVIEWS', v: n(L.year.reviews) },
        { k: 'BUSIEST WEEK', v: `${n(s.busiest)} REVIEWS`, off: s.busiest === 0 },
        { k: 'LONGEST GAP', v: `${n(s.gap)} WEEK${s.gap === 1 ? '' : 'S'}`, off: s.gap === 0 },
      ],
      note: 'THE GAP IS PART OF THE RECORD. A YEAR DRAWN WITH THE EMPTY WEEKS LEFT OUT WOULD BE A '
        + 'DIFFERENT YEAR.',
    }
  }
  if (!L.level) return null
  return {
    jp: '等級', en: `LEVEL ${L.level.level}`, strip: false, acc: false,
    lines: [
      { k: 'THIS LEVEL', v: `${n(L.level.xpIn)} / ${n(L.level.xpOf)} XP` },
      { k: `TO LEVEL ${L.level.level + 1}`, v: `${n(Math.max(0, L.level.xpOf - L.level.xpIn))} XP` },
      { k: 'BADGES EARNED', v: `${n(L.badges.earned)} OF ${n(L.badges.total)}`,
        off: L.badges.earned === 0 },
    ],
    /* THE ONE SHEET WITHOUT A YEAR ON IT, and the reason is meaning rather than height: XP is a
       running total that only goes up, so a 52-week distribution of it says nothing a level bar
       does not already say. */
    note: 'XP COMES OFF EVERY GRADED ANSWER. THE STREAK MULTIPLIER IN THE ROUND SCORING IS WHAT '
      + 'MAKES A LONG CORRECT RUN WORTH MORE THAN THE SAME CARDS SPREAD OVER A WEEK.',
  }
}
