import { describe, expect, it } from 'vitest'
import { statPanelsFrom } from './statPanels'
import type { MenuCrown } from './types'

const bare: MenuCrown = {
  streakDays: null, level: null, xpInLevel: null, xpForLevel: null,
  streakBest: null, freezes: null, lastStudied: null, totalXp: null, week: null,
}

describe('a chip with nothing behind it', () => {
  it('gets no panel at all rather than a panel full of zeroes', () => {
    /* a zero is a claim. On a fresh account, before `summary` has come back, every one of these
       would read as "you have done nothing" instead of "this has not loaded". */
    expect(statPanelsFrom(bare)).toEqual({})
  })

  it('and the clock never gets one, because this app has no pomodoro', () => {
    /* the mockup fills its clock panel from `PomodoroSettingsFields`; there is no such payload in
       `generated/types.ts` and nothing in the bridge to build one from */
    const full = statPanelsFrom({
      ...bare, streakDays: 4, level: 2, xpInLevel: 100, xpForLevel: 150,
      week: { reviewed: 1, correct: 1, accuracy: 1, activeDays: 1, points: 1 },
    })
    expect(Object.keys(full).sort()).toEqual(['level', 'streak', 'week'])
  })
})

describe('the streak', () => {
  it('opens on the fields summary already carries', () => {
    const p = statPanelsFrom({ ...bare, streakDays: 4, streakBest: 11, freezes: 2 }).streak!
    expect(p.rows.map((r) => r.label)).toEqual(['CURRENT', 'BEST', 'FREEZES'])
    expect(p.rows[0].value).toBe('4 DAYS')
    expect(p.rows[1].value).toBe('11 DAYS')
  })

  it('says DAY once and DAYS after that', () => {
    expect(statPanelsFrom({ ...bare, streakDays: 1 }).streak!.rows[0].value).toBe('1 DAY')
  })

  it('drops the rows whose data has not arrived rather than showing them empty', () => {
    const p = statPanelsFrom({ ...bare, streakDays: 4 }).streak!
    expect(p.rows).toHaveLength(1)
  })

  it('leads on the figure the chip itself shows', () => {
    const p = statPanelsFrom({ ...bare, streakDays: 4, streakBest: 11 }).streak!
    expect(p.rows[0].lead).toBe(true)
    expect(p.rows[1].lead).toBeUndefined()
  })
})

describe('the week', () => {
  it('reads the same seven days the overview does', () => {
    const p = statPanelsFrom({
      ...bare, week: { reviewed: 1240, correct: 992, accuracy: 0.8, activeDays: 5, points: 3400 },
    }).week!
    expect(p.rows.map((r) => r.value)).toEqual(['1,240', '992 · 80%', '5 OF 7', '3,400'])
  })

  it('is drawn even when the week is empty, because a loaded zero IS the answer', () => {
    /* the difference from the streak: `week` present-and-zero means "you did nothing this week",
       which is true and worth saying; `week` null means it has not loaded */
    const p = statPanelsFrom({
      ...bare, week: { reviewed: 0, correct: 0, accuracy: 0, activeDays: 0, points: 0 },
    }).week
    expect(p).toBeDefined()
    expect(p!.rows[0].value).toBe('0')
  })
})

describe('the level', () => {
  it('shows the same track the titlebar draws', () => {
    const p = statPanelsFrom({
      ...bare, level: 2, xpInLevel: 100, xpForLevel: 150, totalXp: 300,
    }).level!
    expect(p.rows.map((r) => `${r.label} ${r.value}`)).toEqual([
      'LEVEL 2', 'THIS LEVEL 100 / 150', 'TO NEXT 50 XP', 'TOTAL XP 300',
    ])
  })

  it('never reports a negative remainder', () => {
    const p = statPanelsFrom({ ...bare, level: 9, xpInLevel: 900, xpForLevel: 150 }).level!
    expect(p.rows[2].value).toBe('0 XP')
  })

  it('needs a band to divide by, not just a level number', () => {
    expect(statPanelsFrom({ ...bare, level: 2 }).level).toBeUndefined()
  })
})
