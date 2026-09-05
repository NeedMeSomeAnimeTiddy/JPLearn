import { DAILY_GAME_TILES } from '../daily-games'
import type { DailyGameType } from '../daily-games'
import type { DailyGamesStatePayload } from '../../generated/types'

/* ==================================================================================================
   THE DAILY ROAD — PRACTICE's third level three, and a deletion rather than a redesign.

   THE HUB WAS A SCREEN THAT ASKED A QUESTION THE MENU HAD ALREADY ANSWERED. Its whole job was
   picking one of four puzzles, and `design-system/assets/screen-road-daily.png` — designed in
   August, never ported — already does that as a road of four tablets. This is the script hub's
   argument exactly: level three ends the walk, and a picker between the menu and the work is a
   screen with nothing in it. What needed designing was never the hub; it was the four puzzles it
   opens, and those are still drawn in the old language until the sheet reaches them.

   IT IS THE ROAD'S OWN OBJECT AND NOT A NEW ONE. `built.html` says it outright: the road "is the
   right shape at DAILY and the wrong one at DRILLS", which is why DRILLS got its own screen and
   this one wears `.pa-*` unchanged — the same rows, the same hero plate, the same foot strip the
   curriculum walks on.

   THE MODE SWITCH IS GONE AND BOTH MODES ARE NOT. The hub had a Daily/Practice pair of buttons; on
   the road the answer is already on the tablet you are standing on — a puzzle you have not done
   today opens as today's, and one you have opens as practice, which is what the hub's own tile
   quietly did when you pressed a finished game. One fact, one place, no control.
   ================================================================================================== */

/** the name each puzzle wears on its tablet, in its own script, from the design's own drawing */
const JP: Record<DailyGameType, string> = {
  crossword: 'クロスワード',
  word_search: '単語探し',
  match_pairs: '札合わせ',
  /* the one the design did not draw a tablet for -- the other three are read straight off
     `screen-road-daily.png` */
  typing_blitz: '早打ち',
}

/** what the puzzle asks of you, which is the line the hub printed under each tile */
const WANT: Record<DailyGameType, string> = {
  crossword: 'READ THE CLUE, SPELL THE WORD',
  word_search: 'FIND EACH WORD IN THE GRID',
  match_pairs: 'MATCH EACH WORD TO ITS MEANING',
  typing_blitz: 'TYPE EACH WORD BEFORE THE CLOCK',
}

export interface DailyRow {
  type: DailyGameType
  /** "01".."04" */
  no: string
  en: string
  jp: string
  want: string
  /** today's daily attempt is in */
  done: boolean
  /** how much of it you got right today, or null where it has not been played */
  pct: number | null
  /** the one figure about today's attempt, in the words the attempt reports */
  count: string
}

/* WHAT A TABLET CAN HONESTLY SAY ABOUT A PUZZLE YOU HAVE PLAYED. An attempt carries a score, a
   duration and an outcome per word, so the per-cent is counted off the outcomes rather than off the
   score — a score is a game's own currency and four games do not share one. */
function todayFor(data: DailyGamesStatePayload | null, type: DailyGameType) {
  if (!data) return null
  const mine = data.attempts.filter((a) => a.game_type === type && a.pool_day === data.pool.day)
  if (mine.length === 0) return null
  /* the best of today's tries, which is what a road of tablets should show you */
  return mine.reduce((best, a) => (a.score > best.score ? a : best), mine[0])
}

export function dailyRows(data: DailyGamesStatePayload | null): DailyRow[] {
  const done = new Set(data?.progress.completed_daily_game_types ?? [])
  return DAILY_GAME_TILES.map((tile, index) => {
    const type = tile.type as DailyGameType
    const attempt = todayFor(data, type)
    const asked = attempt?.outcomes.length ?? 0
    const right = attempt?.outcomes.filter((o) => o.outcome === 'correct').length ?? 0
    return {
      type,
      no: String(index + 1).padStart(2, '0'),
      en: tile.title.toUpperCase(),
      jp: JP[type],
      want: WANT[type],
      done: done.has(type),
      pct: attempt && asked > 0 ? Math.round((right / asked) * 100) : attempt ? 0 : null,
      count: !attempt ? ''
        : asked > 0 ? `${right} OF ${asked} RIGHT`
          : attempt.duration_seconds != null ? `${Math.round(attempt.duration_seconds)}s`
            : `SCORE ${attempt.score}`,
    }
  })
}

/** what the heading slab says about the whole day, counted rather than stated */
export function dailyNote(rows: readonly DailyRow[], data: DailyGamesStatePayload | null): string {
  const done = rows.filter((row) => row.done).length
  const words = data?.pool.words.length ?? 0
  const streak = data?.streak.current_streak_days ?? 0
  const bits = [`${done} OF ${rows.length} DONE TODAY`]
  if (words) bits.push(`${words} WORDS IN TODAY'S POOL`)
  /* a streak of nought is not a streak, and printing `0 DAY STREAK` is the screen telling you off */
  if (streak > 0) bits.push(`${streak} DAY STREAK`)
  /* THE FREEZES THE BADGE CARRIED. It was two icons and two words on the hub; here it is the tail
     of the line the heading slab already has, and only when you have any -- a freeze count of
     nought is a fact about nothing. */
  const freezes = data?.streak.freezes_available ?? 0
  if (freezes > 0) bits.push(`${freezes} ${freezes === 1 ? 'FREEZE' : 'FREEZES'}`)
  return bits.join(' · ')
}
