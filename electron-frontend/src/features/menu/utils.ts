import { MINIGAMES } from '../../constants'
import type { StudyBlockPayload, XPProgressPayload } from '../../generated/types'
import type { ProgressionNodeView } from '../progression'
import type { MenuCrown, MenuHero, MenuRow, MenuSectionKey } from './types'

/* THE HERO IS DERIVED, NEVER AUTHORED. Everything on the card comes from `recommendations` —
   the same `StudyBlockPayload` the old home screen's "Up next" block read — so the menu cannot
   drift from what the app actually thinks you should do. If the app has no opinion yet, the card
   says so rather than inventing a number, which is the same rule as the hatched bars elsewhere:
   an absence is drawn as an absence. */

/* THE REASON IS AN ENUM, AND THE CARD NEEDS A SENTENCE. `domain/recommendation.py` names eight
   reasons and the bridge hands the token straight through — drawing `streak_recovery` on the hero
   would be showing a learner the inside of the machine. These are the same eight, said out loud.
   An unknown token is prettified rather than dropped, so a ninth reason still reads as English. */
const WHY: Record<string, string> = {
  high_error_rate: 'Your accuracy here has been slipping, so this is worth another pass.',
  leeches_detected: 'A few items in here keep going wrong — they are worth isolating.',
  new_content_ready: 'This unlocked and you have not started it yet.',
  overdue_reviews: 'These reviews are past due, and a backlog only gets heavier.',
  streak_recovery: 'You have been away, so this is a gentle way back in.',
  progression_milestone: 'This just opened on the path, and it is ready to begin.',
  weak_retention: 'Content you had learned is starting to fade — a review will hold it.',
  balanced_review: 'Nothing is urgent, so this is the ordinary maintenance sweep.',
}

export function reasonSentence(reason: string | null | undefined): string {
  if (!reason) return 'The app picked this as the most useful thing to do next.'
  const known = WHY[reason]
  if (known) return known
  const pretty = reason.replace(/_/g, ' ')
  return pretty.charAt(0).toUpperCase() + pretty.slice(1) + '.'
}

/** the bridge's `section` strings, mapped onto the five rows this menu draws */
const SECTION_OF: Record<string, MenuSectionKey> = {
  study: 'STUDY',
  reading: 'READING',
  drills: 'DRILLS',
  daily: 'DRILLS',
  jlpt: 'JLPT',
  records: 'RECORDS',
}

export function heroFromStudyBlock(block: StudyBlockPayload | null | undefined): MenuHero {
  const top = block?.recommendations?.[0]

  if (!top) {
    return {
      cap: 'UP NEXT', capJp: '次は',
      fig: '—', figEm: 'nothing due', figLab: 'RIGHT NOW',
      why: block?.session_note
        || 'Nothing is waiting. Starting anything new is the useful move.',
      metaLeft: block?.stage_label || 'READY',
      metaRight: block?.session_minutes ? `${block.session_minutes} MIN` : '',
      act: 'OPEN THE PATH',
      section: 'STUDY',
    }
  }

  const due = top.review_count ?? 0
  /* THE CARD NAMES THE DRILL, because pressing it starts that drill. `display_label` is the
     bridge's sentence about the section -- "Start studying Vocabulary" -- and on its own it left
     the slab promising REVIEW THESE and then launching a mode the card never mentioned. The drill
     is a separate field on the same recommendation, and `MINIGAMES` is where its name lives. */
  const drill = MINIGAMES.find((game) => game.key === top.minigame)?.title
  return {
    cap: 'UP NEXT', capJp: '次は',
    fig: due > 0 ? String(due) : '—',
    figEm: drill && top.section_label ? `${top.section_label} · ${drill}` : top.display_label,
    figLab: due > 0 ? 'CARDS DUE' : 'NEW MATERIAL',
    /* the reason is the bridge's own, in its own words -- the card has to be auditable */
    why: reasonSentence(top.reason),
    metaLeft: (top.section_label || block?.stage_label || '').toUpperCase(),
    metaRight: block?.session_minutes ? `${block.session_minutes} MIN` : '',
    act: due > 0 ? 'REVIEW THESE' : 'START THIS',
    section: SECTION_OF[String(top.section).toLowerCase()] ?? 'STUDY',
  }
}

export function crownFrom(
  streakDays: number | null | undefined,
  xp: XPProgressPayload | null | undefined,
): MenuCrown {
  return {
    streakDays: typeof streakDays === 'number' ? streakDays : null,
    level: xp?.level ?? null,
    /* `xp_for_current_level` is the SIZE of this level and `xp_to_next_level` is what remains of
       it — not two absolute thresholds. Read the other way round the crown showed "0 / 1 XP" on
       an account with 4 days of history. Same formula the titlebar already uses. */
    xpInLevel: xp ? Math.max(0, xp.xp_for_current_level - xp.xp_to_next_level) : null,
    xpForLevel: xp ? xp.xp_for_current_level : null,
  }
}

/* ==================================================================================================
   THE FIVE ROWS' FIGURES, FROM WHAT THE FRONT DOOR ALREADY HOLDS AND NOTHING ELSE.

   THE BRIDGE IS STRICTLY SERIAL AND THIS IS THE FIRST SCREEN. `useWorldData` and `useReadiness`
   exist and would answer two of these five exactly -- and both are deliberately gated on their own
   level-two screens, because one costs 348 KB of passage text and the other recomputes mastery
   across all five JLPT levels' decks. Firing them here would put two of the app's more expensive
   commands on the front door, in a queue where a timeout rejects everything else in flight with it.

   SO A FIGURE THIS SCREEN CANNOT AFFORD IS DRAWN AS AN ABSENCE. That is the same rule the hero
   already follows and the same one the ascent's missing ladder follows: an em dash, never a zero.
   THE WORLD's text count is the one figure here that is genuinely not knowable for free; every
   other row is derived from the progression nodes, the study block or the streak, all of which are
   already in hand when the menu draws.
   ================================================================================================== */

/** `"91/104"` -> 87. Anything else -> null, so the caller can fall back rather than draw a lie. */
function pctOf(label: string | null | undefined): number | null {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec((label ?? '').trim())
  if (!m) return null
  const have = Number(m[1])
  const want = Number(m[2])
  if (!want) return null
  return Math.max(0, Math.min(100, Math.round((have / want) * 100)))
}

export interface MenuRowSources {
  nodes: readonly ProgressionNodeView[]
  block: StudyBlockPayload | null | undefined
  streakDays: number | null | undefined
}

export function rowsFrom({ nodes, block, streakDays }: MenuRowSources): Record<MenuSectionKey, MenuRow> {
  /* THE PATH'S PLACE IS THE FIRST STEP NOT YET MASTERED, which is what "where you are" means on a
     road you walk in order. A finished curriculum has no such node, and then you are at the end. */
  const of = nodes.length
  const at = nodes.findIndex((node) => node.status !== 'mastered')
  const step = at < 0 ? of : at + 1
  const here = at < 0 ? null : nodes[at]
  const no = String(step).padStart(2, '0')
  /* the node's own `progressLabel` where it has one -- how far through THIS step you are, which is
     what the gauge is asking. Falling back to distance along the whole road is a different fact,
     and a coarser one, but it is never a fabricated one. */
  const herePct = pctOf(here?.progressLabel) ?? (of ? Math.round(((step - 1) / of) * 100) : 0)

  /* EVERY RECOMMENDATION, NOT JUST THE TOP ONE. The hero names the first; the row is the section's
     whole obligation, and a learner with four decks due is not one card behind. */
  const due = (block?.recommendations ?? []).reduce((sum, rec) => sum + (rec.review_count ?? 0), 0)

  /* the five JLPT nodes are on the same curriculum the path draws, so how many are finished is a
     free and honest figure where the readiness sweep is neither */
  const exams = nodes.filter((node) => /^jlpt_n[1-5]$/.test(node.node_id))
  const passed = exams.filter((node) => node.status === 'mastered').length

  const streak = typeof streakDays === 'number' ? streakDays : null

  return {
    STUDY: {
      tok: of ? `STEP ${no}/${of}` : 'THE PATH',
      lab: 'WHERE YOU ARE',
      val: here ? `STEP ${no} \u00b7 ${here.name.toUpperCase()}` : 'EVERY STEP DONE',
      kind: 'gauge', pct: herePct, due: 0, fig: '', figLab: '',
      slab: 'CONTINUE THE PATH \u25b8',
    },
    DRILLS: {
      /* three lanes is a fact about the section rather than a measurement: reviews, drills and the
         daily puzzles, which is what `PLAN-navigation.md` folded DAILY into */
      tok: '3 LANES',
      lab: 'WAITING FOR YOU',
      val: due > 0 ? `${due} DUE TODAY` : 'NOTHING DUE',
      kind: 'due', pct: 0, due, fig: '', figLab: 'CARDS DUE TODAY',
      slab: 'PRACTISE \u25b8',
    },
    READING: {
      tok: '2 LANES',
      lab: 'REAL JAPANESE',
      val: 'READ AND TALK',
      /* the one figure on this screen that costs a call to know, so it is drawn as not-counted */
      kind: 'fig', pct: 0, due: 0, fig: '\u2014', figLab: 'TEXTS TO READ',
      slab: 'ENTER THE WORLD \u25b8',
    },
    JLPT: {
      tok: exams.length ? `${exams.length} LEVELS` : 'THE EXAM',
      lab: 'HOW FAR UP',
      val: exams.length ? `${passed} OF ${exams.length} MASTERED` : 'NOT STARTED',
      kind: 'fig', pct: 0, due: 0, fig: String(passed), figLab: 'LEVELS MASTERED',
      slab: 'OPEN THE EXAM \u25b8',
    },
    RECORDS: {
      tok: streak != null ? `${streak} DAYS` : 'YOUR YEAR',
      lab: 'DAY STREAK',
      val: streak != null && streak > 0 ? `${streak} DAYS RUNNING` : 'NOT STARTED YET',
      kind: 'fig', pct: 0, due: 0,
      fig: streak != null ? String(streak) : '\u2014', figLab: 'DAY STREAK, RUNNING',
      slab: 'SEE YOUR RECORD \u25b8',
    },
  }
}
