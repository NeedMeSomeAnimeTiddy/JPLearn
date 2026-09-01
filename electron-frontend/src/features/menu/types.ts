export type MenuSectionKey = 'STUDY' | 'DRILLS' | 'READING' | 'JLPT' | 'RECORDS'

export interface MenuGate {
  /** the id in `domain/feature_catalog.py` that opens this section */
  feature: string
  /** the curriculum milestone, in the words a learner would use */
  opens: string
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
}
