import { BADGE_METADATA } from '../achievements'
import type { BadgeEntry } from '../achievements/types'

/* ==================================================================================================
   THE WALL — YOU's level three. Twenty-five seals, and what each one takes.

   THE DESCRIPTION IS THE REQUIREMENT, which is the whole reason this screen can exist without
   inventing anything. Every string in `BADGE_METADATA` says what earns the badge — "Unlocked
   conversation practice by mastering N5 grammar" — so an unearned seal has something to say
   without a second field being made up for it.

   THE GROUPS ARE THE CATALOG'S OWN `category`, and there are three: `learning_mode`, `mastery` and
   `milestone`. The mockup drew its own grouping over invented badges; these are the twenty-five the
   app actually ships, in the order the app already walks them.

   AND A SEAL WEARS THE BADGE'S OWN ICON. The mockup gave each of its badges a Japanese glyph, which
   was authored for the mockup and exists nowhere in this app — `BADGE_METADATA` carries a lucide
   icon name instead. Inventing twenty-five kanji to keep the menu's all-type vocabulary would be
   inventing exactly the kind of thing this port refuses to invent, so the seal shows the mark the
   badge already has. That map moved out of `AchievementsPanel` so both screens read one copy.
   ================================================================================================== */

export interface Seal {
  descriptor: string
  name: string
  /** the catalog's own sentence, which is what earns it */
  takes: string
  icon: string
  earned: boolean
}

export interface SealGroup {
  key: string
  en: string
  jp: string
  seals: Seal[]
  earned: number
}

/* THE THREE GROUPS, NAMED. `category` is a slug; these are the words for it — and the Japanese is
   the same vocabulary the rest of the menu already uses for those ideas. */
const GROUP_COPY: Record<string, { en: string; jp: string }> = {
  learning_mode: { en: 'WHAT OPENED', jp: '解禁' },
  mastery: { en: 'WHAT YOU MASTERED', jp: '熟達' },
  /* 'WHAT YOU REACHED' AND NOT 'HOW FAR YOU HAVE COME', WHICH IS A MEASUREMENT.
     `.bw-lab` is 186px and holds the Japanese, the English and the count on one baseline. At this
     face the twenty-one characters of the longer phrase need 116px where 'WHAT YOU MASTERED' needs
     101 -- 189 of a 186px slot -- so the label wrapped, the row's label block doubled from 19px to
     38, and the count broke across two lines as '1 /' over '9'. The mockup's own labels here were
     single words for the same reason. */
  milestone: { en: 'WHAT YOU REACHED', jp: '道程' },
}

/** the catalog's own order, which is the order `useAchievements` returns them in */
export function sealGroups(badges: readonly BadgeEntry[]): SealGroup[] {
  const earnedOf = new Map(badges.map((b) => [b.descriptor, b.earned]))
  const groups = new Map<string, Seal[]>()

  /* WALKED FROM THE CATALOG, NOT FROM THE EARNED LIST. A wall shows what there is to earn, so a
     badge the backend has never mentioned still has to have a seal on it. */
  for (const meta of Object.values(BADGE_METADATA)) {
    const seal: Seal = {
      descriptor: meta.descriptor,
      name: meta.name,
      takes: meta.description,
      icon: meta.icon,
      earned: earnedOf.get(meta.descriptor) ?? false,
    }
    const bucket = groups.get(meta.category)
    if (bucket) bucket.push(seal)
    else groups.set(meta.category, [seal])
  }

  return [...groups.entries()].map(([key, seals]) => ({
    key,
    en: GROUP_COPY[key]?.en ?? key.replace(/_/g, ' ').toUpperCase(),
    jp: GROUP_COPY[key]?.jp ?? '',
    seals,
    earned: seals.filter((s) => s.earned).length,
  }))
}

/** the flat walk, so left and right reach every seal by holding one key */
export function flatSeals(groups: readonly SealGroup[]): Seal[] {
  return groups.flatMap((g) => g.seals)
}

/* WALKING A WALL IS TWO AXES. Left and right run the whole set in order, so every seal is
   reachable by holding one key; up and down jump a GROUP, which is what makes the far end of
   eleven milestones two presses away rather than twenty. The column is kept where it can be —
   moving between rows of different lengths has to land somewhere, and the nearest seat in the
   shorter row is the least surprising one. */
export function wallStep(
  groups: readonly SealGroup[], index: number, dx: number, dy: number,
): number {
  const flat = flatSeals(groups)
  if (flat.length === 0) return 0
  if (dx) return Math.max(0, Math.min(flat.length - 1, index + dx))

  /* which group the cursor is in, and how far along that group's row */
  let g = 0, within = index
  for (const group of groups) {
    if (within < group.seals.length) break
    within -= group.seals.length
    g++
  }
  const target = Math.max(0, Math.min(groups.length - 1, g + dy))
  if (target === g) return index
  let start = 0
  for (let i = 0; i < target; i++) start += groups[i].seals.length
  return start + Math.min(within, groups[target].seals.length - 1)
}
