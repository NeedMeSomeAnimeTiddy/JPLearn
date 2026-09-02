import type { FeatureStatusPayload } from '../../generated/types'
import type { GateWords } from './unlock'

export type MenuSectionKey = 'STUDY' | 'DRILLS' | 'READING' | 'JLPT' | 'RECORDS'

export interface MenuGate {
  /* THE ID, AND NOTHING ELSE. What that feature waits for used to be an authored sentence here --
     "reach GRAMMAR on the path" -- which was wrong twice: the path draws GRAMMAR N5, and
     `conversation_mode` wants it mastered rather than merely reached. `feature-unlocks` reports
     the requirement now, so the lock line is read. */
  feature: string
}

export interface MenuSection {
  key: MenuSectionKey
  label: string
  jp: string
  glyph: string
  ord: number
  desc: string
  accent: string
  /** absent means always open */
  gate?: MenuGate
}

/** what the hero card says: the app's opinion of what to do now */
export interface MenuHero {
  /** the caption strip, e.g. UP NEXT */
  cap: string
  capJp: string
  /** the big number and its unit, e.g. 12 / CARDS DUE */
  fig: string
  figEm: string
  figLab: string
  /** the one line that says WHY this and not something else */
  why: string
  metaLeft: string
  metaRight: string
  /** the vermilion slab: the action */
  act: string
  /** which section the card hands off to, if any */
  section: MenuSectionKey | null
}

export interface MenuCrown {
  streakDays: number | null
  level: number | null
  xpInLevel: number | null
  xpForLevel: number | null
  /* AND WHAT IS BEHIND THE CHIPS. Four figures on the bar and nothing underneath them was the
     mockup's own complaint about its first version; these are the fields its panels open onto,
     every one already carried by `summary` or `XPProgressPayload`. See `statPanels.ts`. */
  streakBest: number | null
  freezes: number | null
  lastStudied: string | null
  totalXp: number | null
  week: MenuWeek | null
}

/** the last seven days, as `summary.activity.week` already reports them */
export interface MenuWeek {
  reviewed: number
  correct: number
  /** 0..1 */
  accuracy: number
  activeDays: number
  points: number
}

export interface MenuController {
  /** -1 is the hero; 0..4 index MENU_SECTIONS in `ord` order */
  active: number
  setActive: (index: number) => void
  step: (direction: 1 | -1) => void
  /** feature ids that are unlocked, from `getFeatureState`; null until it has answered */
  unlocked: Set<string> | null
  isLocked: (section: MenuSection) => boolean
  /** what a locked section is waiting for, read off the catalog rather than restated */
  gateOf: (featureId: string) => GateWords | null
  /** features that opened since this surface last announced one; empty is the usual case */
  pendingUnlocks: FeatureStatusPayload[]
  /** stop announcing them, and remember the mark that says so */
  dismissUnlocks: (mark: string) => void
}

/* ==================================================================================================
   WHAT A ROW CARRIES, which is the thing the first port left out.

   The mockup's level-one row is an accordion: 40px shut, and 118/126/122 open depending on which
   kind of figure the section holds. Open, it shows a state line and one of three figures -- a
   twelve-segment gauge, a pulsing due badge, or a plain number -- above a vermilion action slab.
   Shut, it shows a token on the right where the figure would be. The first port drew a uniform
   62px card with a description sentence and none of this, which is most of why it did not look
   like the mockup.
   ================================================================================================== */
export type MenuFigKind = 'gauge' | 'due' | 'fig'

export interface MenuRow {
  /** right of the name on a shut row: `STEP 09/16`, `3 LANES` */
  tok: string
  /** the state line an open row shows: label above, value below */
  lab: string
  val: string
  /** which of the three figures this section's open row draws */
  kind: MenuFigKind
  /** `gauge` only — 0..100, drawn as twelve segments */
  pct: number
  /** `due` only — the badge's number */
  due: number
  /** `fig` only — the number, already a string so an absence can be an em dash */
  fig: string
  figLab: string
  /** the vermilion slab: what pressing the row does */
  slab: string
}
