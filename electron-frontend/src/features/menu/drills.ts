import {
  ALL_SCRIPT_KEYS, MINIGAMES, MINIGAME_SKILL_GROUP, MINIGAME_SKILL_GROUP_META,
  SCRIPT_LABELS, SCRIPT_MINIGAMES,
} from '../../constants'
import type { MinigameSkillGroupKey } from '../../constants'
import type { MinigameKey, ScriptKey } from '../../types'

/* ==================================================================================================
   THE DRILLS — PRACTICE's level three. Seventeen modes on a road, and the deck you run them on.

   TWO AXES, AND THE APP ALREADY HAS BOTH. `MINIGAMES` is the seventeen the picker renders,
   `MINIGAME_SKILL_GROUP` puts each in one of five groups, and `SCRIPT_MINIGAMES` says which of them
   a given deck offers — nothing here is invented, and the deck chips' figures are counted out of
   that last map rather than stated.

   THE ORDER IS THE GROUPS'. `MINIGAMES` is in catalogue order, which interleaves the groups; the
   road reads as five chapters, so the modes are sorted by `MINIGAME_SKILL_GROUP_META[g].order` and
   then by their own position inside the catalogue. That is a derived ordering rather than a second
   list to keep in step.

   AND THE FOLD IS IN THE WIDTHS. A mode the chosen deck does not offer is given width zero and the
   cursor walks the OFFERED list rather than all seventeen, so the road simply closes over it — no
   special case anywhere else in the drawing, and no gap for the selection to land in.
   ================================================================================================== */

export interface DrillMode {
  key: MinigameKey
  title: string
  description: string
  group: MinigameSkillGroupKey
  groupTitle: string
  groupOrder: number
  /** the decks that offer it, which is `SCRIPT_MINIGAMES` read the other way round */
  decks: ScriptKey[]
}

export interface DrillDeck {
  key: ScriptKey
  label: string
  /** how many of the seventeen this deck offers — the figure on its chip */
  offers: number
}

export function drillModes(): DrillMode[] {
  const decksOf = (key: MinigameKey) =>
    ALL_SCRIPT_KEYS.filter((s) => SCRIPT_MINIGAMES[s].includes(key))

  return MINIGAMES
    .map((m, index) => {
      const group = MINIGAME_SKILL_GROUP[m.key]
      const meta = MINIGAME_SKILL_GROUP_META[group]
      return {
        key: m.key,
        title: m.title,
        description: m.description,
        group,
        groupTitle: meta.title,
        groupOrder: meta.order,
        decks: [...decksOf(m.key)],
        index,
      }
    })
    .sort((a, b) => (a.groupOrder - b.groupOrder) || (a.index - b.index))
    .map(({ index: _index, ...mode }) => mode)
}

export function drillDecks(modes: readonly DrillMode[]): DrillDeck[] {
  return ALL_SCRIPT_KEYS.map((key) => ({
    key,
    label: SCRIPT_LABELS[key],
    offers: modes.filter((m) => m.decks.includes(key)).length,
  }))
}

/** the five chapters the road runs through, in their own order and with their own counts */
export interface DrillChapter {
  key: MinigameSkillGroupKey
  title: string
  helper: string
  /** the first and last index of this chapter's run through the ordered modes */
  from: number
  to: number
}

export function drillChapters(modes: readonly DrillMode[]): DrillChapter[] {
  const out: DrillChapter[] = []
  modes.forEach((m, i) => {
    const last = out[out.length - 1]
    if (last && last.key === m.group) { last.to = i; return }
    out.push({
      key: m.group, title: m.groupTitle,
      helper: MINIGAME_SKILL_GROUP_META[m.group].helper, from: i, to: i,
    })
  })
  return out
}

/* SELECTION CAN NEVER REST ON A FOLDED MODE. Changing deck snaps to the nearest one that IS still
   offered, outward from where you were, so the road never focuses a gap. */
export function nearestOffered(modes: readonly DrillMode[], deck: ScriptKey, sel: number): number {
  const has = (i: number) => modes[i]?.decks.includes(deck) ?? false
  if (has(sel)) return sel
  for (let r = 1; r < modes.length; r++) {
    if (sel - r >= 0 && has(sel - r)) return sel - r
    if (sel + r < modes.length && has(sel + r)) return sel + r
  }
  return sel
}

/* ==================================================================================================
   THE OFFERED LIST, AND THE WINDOW ONTO IT.

   THE FOLD IS THE LIST ITSELF NOW, not a set of zero widths. The road drew all seventeen modes and
   collapsed the ones this deck cannot run into their own seam; a list simply does not contain them,
   and the foot band says how many that was — so there is no special case in the drawing and no gap
   for the cursor to land in.

   EIGHT ROWS FIT THE STAGE once each chapter has its own heading, and a deck offers up to twelve —
   so the column shows a run around the cursor and counts the rest, the same window the course's
   ledger and a deck's blocks use.
   ================================================================================================== */
export const MODE_WINDOW = 8

/** the indices, into the ordered modes, that this deck actually offers */
export function offeredList(modes: readonly DrillMode[], deck: ScriptKey): number[] {
  const list: number[] = []
  modes.forEach((mode, index) => { if (mode.decks.includes(deck)) list.push(index) })
  return list
}

export interface ModeWindow {
  /** indices into the ordered modes, in order */
  list: number[]
  behind: number
  ahead: number
  /** where the selection sits within the whole offered list, or -1 when it is not on it */
  at: number
}

export function modeWindow(offered: readonly number[], sel: number): ModeWindow {
  const at = offered.indexOf(sel)
  if (offered.length <= MODE_WINDOW) {
    return { list: [...offered], behind: 0, ahead: 0, at }
  }
  const start = Math.min(Math.max(0, at - 1), offered.length - MODE_WINDOW)
  return {
    list: offered.slice(start, start + MODE_WINDOW),
    behind: start,
    ahead: offered.length - (start + MODE_WINDOW),
    at,
  }
}

/** walk the OFFERED list, never all seventeen */
export function modeStep(offered: readonly number[], sel: number, direction: 1 | -1): number {
  if (!offered.length) return sel
  const here = offered.indexOf(sel)
  if (here < 0) return offered[0]
  return offered[Math.max(0, Math.min(offered.length - 1, here + direction))]
}

/* A NAME IS SET FROM ITS OWN LENGTH, the same rule the deck's block name follows: the Latin italic
   black averages 0.62em per character, and "Conjugation Challenge" cannot take "Listening"'s size. */
export function modeNameSize(name: string): number {
  const n = Math.max(1, name.length)
  return Math.max(24, Math.min(46, Math.floor(440 / (n * 0.62))))
}

/* ==================================================================================================
   THE FIVE GROUPS' JAPANESE, which the app's own metadata does not carry.

   `MINIGAME_SKILL_GROUP_META` has a title, a helper and an order for each group and no Japanese at
   all -- so a chapter heading has nothing to draw from. The mockup authored these for the same five
   keys; this is that copy, keyed by the app's own group id rather than by position, so the day a
   sixth group is added it renders with its English name and no Japanese instead of taking the wrong
   group's.

   Same arrangement as `PATH_COPY` in `pathL2.ts`: the backend owns the list and its order, this
   table supplies only the words the backend has no field for.
   ================================================================================================== */
export interface DrillGroupCopy { jp: string; glyph: string }

const DRILL_GROUP_COPY: Record<string, DrillGroupCopy> = {
  recognition: { jp: '認識', glyph: '認' },
  recall: { jp: '想起', glyph: '想' },
  listening: { jp: '聴解', glyph: '聴' },
  challenge: { jp: '挑戦', glyph: '挑' },
  mixed: { jp: '混合', glyph: '混' },
}

export const groupCopy = (key: string): DrillGroupCopy =>
  DRILL_GROUP_COPY[key] ?? { jp: '', glyph: '' }
