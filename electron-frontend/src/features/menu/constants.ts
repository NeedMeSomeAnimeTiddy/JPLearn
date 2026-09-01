import type { MenuSection } from './types'

/* ---- THE FIVE SECTIONS ---------------------------------------------------------------------
   `key` never changes: it is what the mockup's `SECTION_ACCENT`, `SUBTILES` and `L2_PLANES` are
   keyed by, and keeping it means the L2 work in phase 4 lands on the same names. `label` is what
   is drawn. Separating the two is what makes a rename a small change rather than a file-wide one.

   SIX BECAME FIVE. `DAILY` is not a row here — it is a lane inside PRACTICE, which is what
   PLAN-navigation.md decided: its four puzzles are practice, and its daily goal belongs on the
   hero. The order is the mockup's `ord`, not its array order.

   THE GATES ARE REAL AND DERIVED, not authored. Each names the feature in
   `domain/feature_catalog.py` that opens it, and the menu reads `getFeatureState` rather than
   deciding for itself. Where the mockup showed an authored lock so its finished screens stayed
   reachable, this reads the account.

   THE WORLD'S GATE IS CONVERSATION, NOT READING, and the catalog is what says so: it opens
   `conversation_mode` at `grammar_n5` — step five — where `reading_mode` waits for `reading` at
   step eleven. A section opens when its FIRST lane does, so the gate is the earlier of the two,
   and the section is genuinely half-open for six steps. */
export const MENU_SECTIONS: readonly MenuSection[] = [
  {
    key: 'STUDY', label: 'THE PATH', jp: '道', glyph: '道', ord: 1,
    desc: 'The one route from zero — everything new starts here',
    accent: '#cfa45c',
  },
  {
    key: 'DRILLS', label: 'PRACTICE', jp: '練習', glyph: '練', ord: 2,
    desc: 'Reviews, drills and the daily puzzles',
    accent: '#c2344a',
  },
  {
    key: 'READING', label: 'THE WORLD', jp: '実践', glyph: '実', ord: 3,
    desc: 'Real Japanese — texts to read, and conversations to hold',
    accent: '#4f9d6b',
    gate: { feature: 'conversation_mode', opens: 'reach GRAMMAR on the path' },
  },
  {
    key: 'JLPT', label: 'THE EXAM', jp: '検定', glyph: '検', ord: 4,
    desc: 'How ready you are, and four ways to find out',
    accent: '#5b86c4',
    gate: { feature: 'jlpt_dashboard', opens: 'reach JLPT N5 on the path' },
  },
  {
    key: 'RECORDS', label: 'YOU', jp: '記録', glyph: '記', ord: 5,
    desc: 'Your streak, your year, your level',
    accent: '#e0913a',
  },
] as const

/** the hero sits above the rows and is selected as index -1 */
export const HERO_INDEX = -1
