import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { StudySummaryPayload } from '../../types'
import type { XPProgressPayload } from '../../generated/types'
import { Ledger } from './components/Ledger'
import {
  LEDGER_DAYS, LEDGER_WEEKS, accColour, buildLedger, ledgerSheet, ledgerYear, yearShape,
} from './ledger'

/* the day the fixtures are counted back from, so a test does not change meaning tomorrow */
const TODAY = new Date(2026, 8, 1)
const back = (n: number) => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

const summary = (streak: Record<string, number> | null) => ({ streak } as unknown as StudySummaryPayload)
const xp = (o: Partial<XPProgressPayload>) => ({
  level: 3, total_xp: 400, xp_to_next_level: 40, xp_for_current_level: 100, ...o,
} as XPProgressPayload)

afterEach(cleanup)

describe('folding a year of days into weeks', () => {
  it('draws fifty-two whole weeks, which is 364 days and not 365', () => {
    const y = ledgerYear([], TODAY)
    expect(y.weeks).toHaveLength(LEDGER_WEEKS)
    expect(y.total).toBe(LEDGER_DAYS)
    expect(LEDGER_DAYS).toBe(364)
  })

  it('puts the week you are standing in last', () => {
    /* the band reads left to right as time, so today belongs at the right-hand end */
    const y = ledgerYear([{ date: back(0), count: 9, accuracy: 90 }], TODAY)
    expect(y.weeks[LEDGER_WEEKS - 1].n).toBe(9)
    expect(y.weeks.slice(0, -1).every((w) => w.n === 0)).toBe(true)
  })

  it('counts only the days the bridge actually returned', () => {
    /* `daily-activity` returns rows for days that HAVE reviews, so every gap has to be filled
       here rather than assumed away */
    const y = ledgerYear([
      { date: back(3), count: 5, accuracy: 80 },
      { date: back(10), count: 7, accuracy: 100 },
    ], TODAY)
    expect(y.active).toBe(2)
    expect(y.reviews).toBe(12)
  })

  it('weights accuracy by reviews rather than averaging the days', () => {
    /* one perfect card on a quiet day must not count as much as forty on a busy one */
    const y = ledgerYear([
      { date: back(1), count: 1, accuracy: 100 },
      { date: back(2), count: 99, accuracy: 50 },
    ], TODAY)
    expect(y.accuracy).toBe(Math.round((100 * 1 + 50 * 99) / 100))
  })

  it('says nothing rather than zero when the year is empty', () => {
    /* 0% accuracy is a result; no reviews is the absence of one */
    expect(ledgerYear([], TODAY).accuracy).toBeNull()
  })

  it('ignores a day the bridge reported with no reviews in it', () => {
    expect(ledgerYear([{ date: back(2), count: 0, accuracy: 0 }], TODAY).active).toBe(0)
  })
})

describe("a bar's colour is its accuracy", () => {
  it('runs up the gold ramp between 70 and 100', () => {
    expect(accColour(70)).toBe('rgb(122, 92, 46)')
    expect(accColour(100)).toBe('rgb(232, 196, 124)')
  })

  it('clamps rather than running off either end', () => {
    expect(accColour(10)).toBe(accColour(70))
    expect(accColour(140)).toBe(accColour(100))
  })
})

describe('what the ledger is made of', () => {
  const year = ledgerYear([{ date: back(1), count: 40, accuracy: 85 }], TODAY)

  it('reads the streak, the best and the freezes from the summary', () => {
    const L = buildLedger(
      summary({ current_days: 4, best_days: 9, freezes_available: 2 }), xp({}), year,
      { earned: 3, total: 25 },
    )
    expect(L.streak).toEqual({ now: 4, best: 9, freezes: 2 })
  })

  it('survives a summary that has not arrived', () => {
    expect(buildLedger(null, null, year, { earned: 0, total: 25 }).streak)
      .toEqual({ now: 0, best: 0, freezes: 0 })
  })

  it('reads XP as a size and a remainder, not two thresholds', () => {
    /* `xp_for_current_level` is the SIZE of the level and `xp_to_next_level` what is left of it;
       reading them as absolute thresholds is what once put "0 / 1 XP" on the crown */
    const L = buildLedger(summary(null), xp({ xp_for_current_level: 900, xp_to_next_level: 260 }), year, { earned: 0, total: 25 })
    expect(L.level).toEqual({ level: 3, xpIn: 640, xpOf: 900 })
  })

  it('draws an unmeasured figure as an absence rather than a zero', () => {
    const L = buildLedger(summary(null), null, ledgerYear([], TODAY), { earned: 0, total: 25 })
    expect(L.rows.map((r) => r.value)).toEqual([null, null])
    expect(L.rows[0].absent).toMatch(/NOTHING REVIEWED/)
  })

  it('does not carry a rank or a study-time figure at all', () => {
    /* neither exists in this app -- there is no grade system anywhere in `domain/`, and
       `session_history` carries no duration. A figure with no source is not drawn. */
    const keys = buildLedger(summary(null), xp({}), year, { earned: 0, total: 25 }).rows.map((r) => r.key)
    expect(keys).not.toContain('rank')
    expect(keys).not.toContain('time')
  })
})

describe('the ledger screen', () => {
  const show = () => render(
    <Ledger
      summary={summary({ current_days: 4, best_days: 9, freezes_available: 2 })}
      xp={xp({})}
      onOpenAchievements={vi.fn()}
      onUp={vi.fn()}
    />,
  )

  it('sets the current run against the ghost of the best', async () => {
    show()
    await waitFor(() => expect(document.querySelector('.lg-now')?.textContent).toBe('4'))
    expect(document.querySelector('.lg-ghost b')?.textContent).toBe('9')
  })

  it('draws one bar per week, all fifty-two', async () => {
    show()
    await waitFor(() => expect(document.querySelectorAll('.lg-bars i')).toHaveLength(LEDGER_WEEKS))
  })

  it('draws an empty week as a floor tick rather than as nothing', async () => {
    /* a week that renders as nothing at all is indistinguishable from the end of the year */
    show()
    await waitFor(() => expect(document.querySelectorAll('.lg-bars i.none').length).toBeGreaterThan(0))
  })

  it('gives one freeze marker per freeze', async () => {
    show()
    await waitFor(() => expect(document.querySelectorAll('.lg-frz s i')).toHaveLength(2))
    expect(screen.getByText(/2 FREEZES LEFT/)).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    show()
    await waitFor(() => expect(document.querySelector('.lg-bars')).toBeTruthy())
    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.mn-open') as Element)
    expect(results.violations).toEqual([])
  })
})

/* ==================================================================================================
   AND WHAT IS BEHIND EACH FIGURE — see `ledgerSheet` for why a records screen full of dead ends is
   the one kind of dashboard this app must not be.
   ================================================================================================== */

const busyYear = ledgerYear([
  { date: back(2), count: 40, accuracy: 90 },
  { date: back(3), count: 10, accuracy: 50 },
  { date: back(40), count: 5, accuracy: 70 },
], TODAY)

const ledgerOf = (year = busyYear) => buildLedger(
  summary({ current_days: 4, best_days: 11, freezes_available: 2 }),
  xp({ level: 2, xp_for_current_level: 150, xp_to_next_level: 50, total_xp: 300 }),
  year,
  { earned: 2, total: 25 },
)

describe('the shape of the year, which every sheet reads', () => {
  it('finds the busiest week, and the best and worst that had anything in them', () => {
    const s = yearShape(busyYear)
    expect(s.busiest).toBe(50)
    /* the two recent days fall in one week: 40 at 90% and 10 at 50% weights to 82% */
    expect(s.best).toBe(82)
    expect(s.worst).toBe(70)
  })

  it('counts the longest run of empty weeks, because the gap is part of the record', () => {
    expect(yearShape(busyYear).gap).toBeGreaterThan(0)
  })

  it('has no best and no worst on a year with nothing in it, rather than zero', () => {
    /* 0% accuracy and "you have not answered anything" are different claims */
    const s = yearShape(ledgerYear([], TODAY))
    expect(s.best).toBeNull()
    expect(s.worst).toBeNull()
    expect(s.gap).toBe(LEDGER_WEEKS)
  })
})

describe('what a figure opens onto', () => {
  it('takes the streak apart into the things the front cannot hold', () => {
    const s = ledgerSheet('streak', ledgerOf())!
    expect(s.en).toBe('STREAK')
    expect(s.lines.map((l) => l.k)).toEqual(
      ['RUNNING NOW', 'YOUR BEST RUN', 'FREEZES LEFT', 'ACTIVE DAYS THIS YEAR'],
    )
    expect(s.lines[0].v).toBe('4 DAYS')
  })

  it('says out loud that the accuracy on the front is a mean', () => {
    /* THE CAVEAT IS THE REASON THE SHEETS EXIST. "74%" on a plate is a number people read as a
       property of themselves; "a mean of 3 days" is the same number and a different claim. */
    const s = ledgerSheet('accuracy', ledgerOf())!
    expect(s.note).toContain('MEAN OF')
    expect(s.acc).toBe(true)
  })

  it('divides the reviews by the days you turned up, not by the year', () => {
    /* dividing by 364 would measure how OFTEN you study rather than how much */
    const s = ledgerSheet('reviews', ledgerOf())!
    const perDay = s.lines.find((l) => l.k === 'A DAY YOU STUDIED')!
    expect(perDay.v).toBe('18 REVIEWS')
  })

  it('draws an absence faint rather than leaving the line out', () => {
    /* a line that vanishes when its answer is nothing makes two accounts' sheets different shapes */
    const empty = buildLedger(summary(null), null, ledgerYear([], TODAY), { earned: 0, total: 25 })
    const s = ledgerSheet('accuracy', empty)!
    expect(s.lines).toHaveLength(4)
    expect(s.lines.every((l) => l.off || l.v !== '—')).toBe(true)
  })

  it('carries the 52 weeks on every sheet whose figure is a mean over them', () => {
    for (const k of ['streak', 'accuracy', 'reviews', 'year'] as const) {
      expect(ledgerSheet(k, ledgerOf())!.strip).toBe(true)
    }
  })

  it('leaves the year off the level sheet, where a distribution would say nothing', () => {
    /* XP is a running total that only goes up */
    expect(ledgerSheet('level', ledgerOf())!.strip).toBe(false)
  })

  it('has no level sheet at all on an account with no XP payload', () => {
    /* a plate that cannot answer stays a plate rather than opening onto four dashes */
    const noXp = buildLedger(summary(null), null, busyYear, { earned: 0, total: 25 })
    expect(ledgerSheet('level', noXp)).toBeNull()
  })
})

describe('the ledger on screen', () => {
  it('opens a sheet when a figure is pressed, and closes it on the scrim', async () => {
    render(<Ledger summary={summary({ current_days: 4, best_days: 11, freezes_available: 2 })}
      xp={xp({})} onOpenAchievements={vi.fn()} onUp={vi.fn()} />)
    await waitFor(() => expect(document.querySelector('.lg-streak')).not.toBeNull())
    expect(document.querySelector('.lg-sheet')).toBeNull()
    fireEvent.click(document.querySelector('.lg-streak') as HTMLElement)
    await waitFor(() => expect(document.querySelector('.lg-sheet')).not.toBeNull())
    expect(document.querySelector('.lg-sheet .lg-cap b')?.textContent).toBe('連続 STREAK')
    fireEvent.click(document.querySelector('.lg-scrim') as HTMLElement)
    await waitFor(() => expect(document.querySelector('.lg-sheet')).toBeNull())
  })

  it('closes on Escape before the level above sees the key', async () => {
    /* opening a figure and pressing Escape must close the figure, not leave the screen */
    const onUp = vi.fn()
    render(<Ledger summary={summary({ current_days: 4, best_days: 11, freezes_available: 2 })}
      xp={xp({})} onOpenAchievements={vi.fn()} onUp={onUp} />)
    await waitFor(() => expect(document.querySelector('.lg-streak')).not.toBeNull())
    fireEvent.click(document.querySelector('.lg-streak') as HTMLElement)
    await waitFor(() => expect(document.querySelector('.lg-sheet')).not.toBeNull())
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('.lg-sheet')).toBeNull())
    expect(onUp).not.toHaveBeenCalled()
  })

  it('makes every figure a real button, so the mouse and the keyboard agree', () => {
    render(<Ledger summary={summary({ current_days: 4, best_days: 11, freezes_available: 2 })}
      xp={xp({})} onOpenAchievements={vi.fn()} onUp={vi.fn()} />)
    for (const q of ['.lg-streak', '.lg-year', '.lg-lv']) {
      expect((document.querySelector(q) as HTMLElement).tagName).toBe('BUTTON')
    }
  })
})
