import type { MenuCrown } from './types'

/* ==================================================================================================
   WHAT IS BEHIND EACH CHIP, AND WHY IT IS A PANEL RATHER THAN A TOOLTIP.

   These are the only claims the menu makes about you, and until now none of them could be checked:
   a streak with no way to see the best one, a level with no way to see how far into it you are. A
   tooltip is one line and cannot hold four; a panel is the chip continuing downward.

   AND EVERY FIGURE IS A REAL FIELD OF THIS APP. The mockup's panels are shaped like the app's data
   and filled with invented numbers, which is the right call in a mockup and the wrong one here --
   this is the app, and a menu that states a fabricated best streak is worse than one that states
   nothing. So each row below names where it comes from, and anything the app does not have is not
   drawn:

     - THE STREAK reads `summary.streak`, which already carries current, best and freezes.
     - THE WEEK reads `summary.activity.week`, whose fields are exactly the ones the mockup's
       `ActivityWindow` names: reviewed, correct, accuracy, active_days, points_earned.
     - THE LEVEL reads `XPProgressPayload`, the same one `XPBar` draws in the titlebar -- so the
       chip's track and the titlebar's are the same number rather than two guesses at it.
     - THE CLOCK HAS NO PANEL. The mockup's is a pomodoro readout off `PomodoroSettingsFields`, and
       this app has no pomodoro: there is no such payload in `generated/types.ts` and nothing in the
       bridge to build one from. An empty panel would be worse than none, and an invented one worse
       than that, so the time chip stays a chip.
   ================================================================================================== */

export type StatKey = 'streak' | 'week' | 'level'

export interface StatRow {
  label: string
  value: string
  /** the one row that is the chip's own headline, drawn heavier */
  lead?: boolean
}

export interface StatPanel {
  jp: string
  en: string
  rows: StatRow[]
  note: string
}

const nf = (n: number): string => n.toLocaleString()

/**
 * Build the panels from what the app actually knows.
 *
 * Returns only the ones it can fill: a chip whose data has not loaded yet has no panel rather than
 * a panel full of zeroes, which would read as a claim.
 */
export function statPanelsFrom(crown: MenuCrown): Partial<Record<StatKey, StatPanel>> {
  const out: Partial<Record<StatKey, StatPanel>> = {}

  if (crown.streakDays !== null) {
    const rows: StatRow[] = [
      { label: 'CURRENT', value: `${crown.streakDays} ${crown.streakDays === 1 ? 'DAY' : 'DAYS'}`, lead: true },
    ]
    if (crown.streakBest !== null) rows.push({ label: 'BEST', value: `${crown.streakBest} DAYS` })
    if (crown.freezes !== null) rows.push({ label: 'FREEZES', value: nf(crown.freezes) })
    if (crown.lastStudied) rows.push({ label: 'LAST STUDIED', value: crown.lastStudied })
    out.streak = {
      jp: '連続', en: 'STREAK', rows,
      note: '連続 · A day counts once you have graded anything at all — the streak is about turning up, not about how long you stayed.',
    }
  }

  if (crown.week) {
    const w = crown.week
    out.week = {
      jp: '今週', en: 'THIS WEEK',
      rows: [
        { label: 'REVIEWED', value: nf(w.reviewed), lead: true },
        { label: 'CORRECT', value: `${nf(w.correct)} · ${Math.round(w.accuracy * 100)}%` },
        { label: 'ACTIVE DAYS', value: `${w.activeDays} OF 7` },
        { label: 'POINTS', value: nf(w.points) },
      ],
      note: '今週 · The last seven days, counted off the same review log the deck figures come from.',
    }
  }

  if (crown.level !== null && crown.xpForLevel) {
    const rows: StatRow[] = [
      { label: 'LEVEL', value: String(crown.level), lead: true },
      { label: 'THIS LEVEL', value: `${nf(crown.xpInLevel ?? 0)} / ${nf(crown.xpForLevel)}` },
      { label: 'TO NEXT', value: `${nf(Math.max(0, crown.xpForLevel - (crown.xpInLevel ?? 0)))} XP` },
    ]
    if (crown.totalXp !== null) rows.push({ label: 'TOTAL XP', value: nf(crown.totalXp) })
    out.level = {
      jp: '階級', en: 'LEVEL', rows,
      note: '階級 · XP comes off every graded answer — the streak multiplier in the round scoring is what makes a long correct run worth more than the same cards spread over a week.',
    }
  }

  return out
}
