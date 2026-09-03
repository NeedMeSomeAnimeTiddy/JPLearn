import { JLPT_LEVEL_ORDER, JLPT_READY_PCT, JLPT_UNLOCK_PCT } from '../../constants'
import type { JlptLevel } from '../../types'

/* ==================================================================================================
   THE ASCENT — THE EXAM'S LEVEL TWO. Five levels as five columns, and the two thresholds that
   govern all of them drawn straight across.

   THE LADDER, NOT A RUNG. Every other section shows the SHAPE at level two and the THING YOU DO at
   level three; the mockup's first ascent tried both at once, with a detail panel taking the right
   third of the stage. That panel is level three (phase 5) and this screen is the ladder alone.

   EVERY FIGURE IS THE BACKEND'S. `jlpt-readiness` reports mastered and total vocabulary and kanji
   per level, the readiness percentage it computed from them, `is_ready`, and all three official
   marks. Nothing here recomputes any of it; the two module constants position lines and are
   documented where they live.

   AND ON A REAL ACCOUNT THE LADDER IS FLAT. Mastery is three correct reviews AND a 21-day interval,
   so nobody's bar leaves the floor inside their first three weeks no matter how much they study.
   The mockup invented a learner partway up N3 and never drew this. It is the state most accounts
   are actually in, so the note under the ladder says what a bar measures — which is the one thing
   that makes a screen of zeroes readable rather than discouraging.
   ================================================================================================== */

/** what the bridge reports for one level */
export interface LevelReadiness {
  level: JlptLevel
  mastered_vocab: number
  total_vocab: number
  mastered_kanji: number
  total_kanji: number
  readiness_pct: number
  is_ready: boolean
  pass_mark: number
  vocab_grammar_section_max: number
  vocab_grammar_pass_mark: number
}

export interface ReadinessPayload {
  recommended_target: JlptLevel
  levels: Record<JlptLevel, LevelReadiness>
}

export type RungState = 'locked' | 'target' | 'ready' | 'open'

export interface Rung {
  level: JlptLevel
  /** "N5" — the label the plinth carries */
  id: string
  pct: number
  state: RungState
  /** mastered and total cards, kanji and vocabulary together */
  done: number
  total: number
  /** the level below, when this one is shut behind it */
  opensAt: { id: string; need: number; at: number } | null
  /** the app's own recommended target wears the wide column */
  isTarget: boolean
  /** the backend's own judgement, which `state` folds under `target` when the two coincide */
  isReady: boolean
  /** the exam's own pass mark, out of 180 */
  passMark: number
  /* ---- geometry, derived rather than tabulated ---- */
  x: number
  w: number
}

/* THE RUN IS FIXED AND THE WIDTHS ARE NOT. Four columns at 118 and one at 150 with 50 between
   comes to 822, so the ladder occupies 270–1092 whichever level is wide. The mockup tabulated the
   five positions, which only held while the wide column stayed at index two; here the target moves,
   so the table is computed and the run's ends stay put. */
export const ASCENT_X0 = 270
export const ASCENT_GAP = 50
export const COL_W = 118
export const COL_W_WIDE = 150

/* THE DRAWING'S OWN BOX, IN BOARD COORDINATES, AND IT IS THE WHOLE STAGE NOW.

   The plinths and the badges are gone — every level's name, count and state ride inside its own
   column — so the ladder is not paying for a band above it and a band below it any more. It takes
   the stage's own top line and stops 20px short of its foot; the rule that used to be repeated in
   four boxes has the band underneath, as `.as-law`.

   EVERY TRACK IS THE SAME HEIGHT because the TRACK is the scale: only the fill varies. Five tracks
   of different heights would be five different scales, which is what the previous cut drew. */
export const ASCENT_TOP = 192
export const ASCENT_H = 364
export const ASCENT_BOT = ASCENT_TOP + ASCENT_H

/** y for a percentage, on the column track */
export function pctY(pct: number): number {
  return ASCENT_BOT - Math.round((ASCENT_H * pct) / 100)
}

export { JLPT_READY_PCT, JLPT_UNLOCK_PCT }

/* A LEVEL IS SHUT UNTIL THE ONE BELOW CLEARS THE GATE, which is the rule `JLPTPrepView` has always
   enforced on its own cards — the ascent draws the same gate as a line rather than five separate
   lock notices, which is the whole reason this design was chosen over five cards. */
export function ascentRungs(readiness: ReadinessPayload | null): Rung[] {
  if (!readiness) return []
  const levels = JLPT_LEVEL_ORDER.map((key) => readiness.levels[key]).filter(Boolean)
  if (levels.length === 0) return []

  const targetIndex = JLPT_LEVEL_ORDER.indexOf(readiness.recommended_target)
  let x = ASCENT_X0

  return levels.map((data, index) => {
    const below = index > 0 ? levels[index - 1] : null
    const locked = below !== null && below.readiness_pct < JLPT_UNLOCK_PCT
    const isTarget = index === targetIndex
    const w = isTarget ? COL_W_WIDE : COL_W
    const rung: Rung = {
      level: data.level,
      id: data.level.toUpperCase(),
      pct: data.readiness_pct,
      /* THE TARGET OUTRANKS READY on the badge, because a learner can only aim at one level and
         the app has exactly one opinion about which. Any other finished level still says so. */
      state: locked ? 'locked' : isTarget ? 'target' : data.is_ready ? 'ready' : 'open',
      done: data.mastered_kanji + data.mastered_vocab,
      total: data.total_kanji + data.total_vocab,
      opensAt: locked && below
        ? { id: below.level.toUpperCase(), need: JLPT_UNLOCK_PCT, at: below.readiness_pct }
        : null,
      isTarget,
      isReady: data.is_ready,
      passMark: data.pass_mark,
      x,
      w,
    }
    x += w + ASCENT_GAP
    return rung
  })
}

/* THE BADGE ABOVE A COLUMN, and it says the app's own word. The mockup's was YOU ARE HERE on the
   level the learner was standing on; the app does not have that idea — it has one
   `recommended_target`, which is the highest level it judges you ready for, and its own dashboard
   calls that "Target". Inventing a second notion of where you are would be a second source of
   truth for the only thing this screen is advising about. */
export function badgeFor(rung: Rung): string | null {
  if (rung.state === 'target') return 'YOUR TARGET'
  if (rung.state === 'ready') return 'READY TO SIT'
  return null
}

/** the plinth's middle line */
export function stateWord(rung: Rung): string {
  if (rung.state === 'locked') return 'LOCKED'
  if (rung.state === 'target') return rung.isReady ? 'TARGET · READY' : 'TARGET'
  if (rung.state === 'ready') return 'READY'
  return 'OPEN'
}
