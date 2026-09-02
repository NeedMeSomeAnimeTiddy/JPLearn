import { MENU_SECTIONS } from './constants'
import type { MenuSectionKey } from './types'

/* ==================================================================================================
   WHAT EVERY SCREEN PAST THE FRONT DOOR SAYS ABOUT ITSELF.

   THE PROBLEM WAS NOT THAT THE SCREENS HAD NO TITLES. Five of the thirteen had one and eight did
   not, and none of the five said which SECTION it belonged to -- so TALK announced itself as TALK
   and left you to remember that you had come in through PRACTICE. A tree with no breadcrumb reads as
   a set of unrelated screens the moment there is more than one way in, and there are three ways into
   a deck.

   SO THE HEADING TAKES THE MENU ROW'S OWN ANATOMY, which is the mockup's argument and it is a good
   one: you pressed a slab with 練 on a red block and PRACTICE beside it, and the screen it opens says
   the same thing in the same shape, one size down and in the corner. Nothing new is invented and the
   two levels stop looking like two projects.

     - THE MARK is the section's kanji on the section's own accent, on the leading edge. It is the
       one element carried unchanged from the row, and it is what makes the tie readable at a glance
       rather than by reading.
     - THE KICKER is where you came from, and it only appears at level three. At level two the
       heading IS the section, so a kicker repeating it would be the same word twice.
     - THE TITLE is English-led with the Japanese beside it. Robbie does not read Japanese, so the
       word you navigate by has to be the one you can read at a glance -- see the note on this in
       `menu.css`. Level one's rows were already this way round; these were the only things inverted.
   ================================================================================================== */

export interface ScreenHead {
  /** the section's kanji, on its own accent block */
  mark: string
  accent: string
  /** where you came from, or null at level two where the heading is the section itself */
  kick: string | null
  en: string
  jp: string
}

/** what each level-three screen is called, in the order they are reached */
export const SCREEN_NAMES: Record<string, { en: string; jp: string }> = {
  /* under THE PATH */
  deck: { en: 'BLOCKS', jp: '区切' },
  feed: { en: 'TODAY', jp: '今日' },
  /* under PRACTICE */
  drills: { en: 'DRILLS', jp: '演習' },
  /* under THE WORLD */
  library: { en: 'READING', jp: '読解' },
  scenes: { en: 'TALK', jp: '会話' },
  /* under THE EXAM */
  level: { en: 'LEVEL', jp: '級' },
  /* under YOU */
  wall: { en: 'ACHIEVEMENTS', jp: '章' },
}

const byKey = new Map(MENU_SECTIONS.map((s) => [s.key, s]))

/**
 * The heading for wherever the menu currently stands.
 *
 * `screen` null is level two, where the section is the heading. A screen the table does not know is
 * given the section's own name rather than nothing at all -- a heading that says the wrong thing is
 * worse than none, but a heading that says the less specific true thing is better than none.
 */
export function screenHead(
  section: MenuSectionKey | null, screen: string | null, override?: { en?: string; jp?: string },
): ScreenHead | null {
  if (!section) return null
  const s = byKey.get(section)
  if (!s) return null
  const named = screen ? SCREEN_NAMES[screen] : null
  return {
    mark: s.glyph,
    accent: s.accent,
    /* the trail, and only when there is somewhere to have come from */
    kick: named ? s.label : null,
    en: override?.en ?? named?.en ?? s.label,
    jp: override?.jp ?? named?.jp ?? s.jp,
  }
}
