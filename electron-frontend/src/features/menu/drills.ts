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

/* ---- the road's geometry ---- */
export const TAB_W = 94
export const TAB_W_SEL = 240
export const TAB_GAP = 18
/** how a tab shrinks with its distance from the selection, floored so the far ends stay readable */
export const tabScale = (d: number) => Math.max(0.78, 1 - Math.min(d, 5) * 0.055)

export interface RailLayout {
  /** true where the chosen deck offers that mode */
  offered: boolean[]
  /** the indices of the offered modes, in order */
  list: number[]
  /** where the selection sits within `list` */
  at: number
  lefts: number[]
  widths: number[]
  centres: number[]
  /** the whole road's width, so it can be centred on the selection */
  span: number
}

export function railLayout(
  modes: readonly DrillMode[], deck: ScriptKey, sel: number,
): RailLayout {
  const offered = modes.map((m) => m.decks.includes(deck))
  const list: number[] = []
  offered.forEach((ok, i) => { if (ok) list.push(i) })
  const at = list.indexOf(sel)

  const lefts: number[] = [], widths: number[] = [], centres: number[] = []
  let x = 0, first = true
  for (let i = 0; i < modes.length; i++) {
    if (!offered[i]) { lefts.push(x); widths.push(0); centres.push(x); continue }
    if (!first) x += TAB_GAP
    first = false
    const d = Math.abs(list.indexOf(i) - at)
    const w = i === sel ? TAB_W_SEL : Math.round(TAB_W * tabScale(d))
    lefts.push(x); widths.push(w); centres.push(x + w / 2)
    x += w
  }
  return { offered, list, at, lefts, widths, centres, span: x }
}

/** walk the OFFERED list, never all seventeen */
export function railStep(layout: RailLayout, sel: number, direction: 1 | -1): number {
  const { list } = layout
  if (!list.length) return sel
  const here = list.indexOf(sel)
  if (here < 0) return list[0]
  return list[Math.max(0, Math.min(list.length - 1, here + direction))]
}
