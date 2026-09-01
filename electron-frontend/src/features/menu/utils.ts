import type { StudyBlockPayload, XPProgressPayload } from '../../generated/types'
import type { MenuCrown, MenuHero, MenuSectionKey } from './types'

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
  return {
    cap: 'UP NEXT', capJp: '次は',
    fig: due > 0 ? String(due) : '—',
    figEm: top.display_label,
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
