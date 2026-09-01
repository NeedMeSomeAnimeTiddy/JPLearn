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
