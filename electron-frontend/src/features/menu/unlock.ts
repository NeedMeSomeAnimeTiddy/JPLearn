import type { FeatureStatusPayload } from '../../generated/types'
import type { ProgressionNodeView } from '../progression'
import { milestone } from './pathL2'

/* ==================================================================================================
   THE UNLOCK MOMENT — the only screen in this menu that is an EVENT rather than a place.

   `domain/feature_catalog.py` has gated nine capabilities behind curriculum milestones since long
   before this menu existed, and no React file has ever drawn the transition. The app was built to
   grow and arrives fully grown. This is what growing is supposed to look like.

   IT READS `unlocked_at`, NOT `just_unlocked`, AND THE BRIDGE SAYS WHY. `just_unlocked` is true for
   the one call that CAUSED the transition — and two surfaces call `getFeatureState` on mount, this
   menu and `useAchievements`, so whichever asks first consumes it and the other sees false. The
   payload's own docstring names the fix: a surface that wants to show an unlock exactly once
   remembers the last timestamp it displayed and compares. That mark is per-surface, which is
   correct — the achievements wall showing a badge is not this menu having announced it.

   AN ABSENT MARK ANNOUNCES NOTHING. On a fresh install `themes` and `achievements` unlock
   immediately, and an existing learner's account is already full of them; a missing mark read as
   "the beginning of time" would open the app on a moment congratulating you for things you did not
   just do. A surface that has never looked has witnessed no transitions, so the first read sets the
   mark and shows nothing. The next real unlock is later than it and fires normally.
   ================================================================================================== */

/** where the mark lives. Per-surface by design: this is what THIS menu has announced. */
export const UNLOCK_SEEN_KEY = 'jplearn.menu.unlockSeen'

export interface UnlockCard {
  featureId: string
  name: string
  category: string
  /** the badge the catalog awards for it, if any — two of the nine award none */
  badge: string | null
}

export interface UnlockMoment {
  /** the milestone that fired it, in the curriculum's own words */
  stamp: { jp: string; en: string; word: string } | null
  cards: UnlockCard[]
  /** the mark to store once this has been shown */
  mark: string
}

/** the highest `unlocked_at` in the payload, which is what a first read stores */
export function highWater(features: readonly FeatureStatusPayload[]): string {
  let best = ''
  for (const feature of features) {
    if (feature.is_unlocked && feature.unlocked_at && feature.unlocked_at > best) {
      best = feature.unlocked_at
    }
  }
  return best
}

/* THESE TIMESTAMPS COMPARE AS STRINGS, and it is worth saying why rather than hoping. `_NOW_UTC` is
   `datetime.now(timezone.utc).isoformat()`: always UTC, so the offset is always the same `+00:00`,
   and the only shape that varies is the microseconds, which Python omits entirely on an exact
   second. That makes `...:11+00:00` shorter than `...:11.578106+00:00` — and lexically smaller too,
   because '+' sorts below '.', which is the right order for 11.000000 against 11.578106. So no date
   parsing sits between the bridge and the comparison, and nothing depends on the local clock. */
export function newlyUnlocked(
  features: readonly FeatureStatusPayload[], seen: string | null,
): FeatureStatusPayload[] {
  if (!seen) return []
  return features.filter((feature) => (
    feature.is_unlocked && !!feature.unlocked_at && feature.unlocked_at > seen
  ))
}

/* WHAT THE STAMP NAMES IS THE MILESTONE, NOT WHAT IT OPENED. Several features can open at once and
   they do not all share a requirement list — clearing GRAMMAR N5 opens Conversation Mode
   (grammar_n5), Tutor Chat (grammar_n5, through the chain) and, if vocabulary was already done,
   Kanji Mode (vocabulary_n5 AND grammar_n5). What every one of them waited on is the INTERSECTION,
   and here that is grammar_n5: the step the learner actually just finished.

   WHERE THE INTERSECTION IS NOT EXACTLY ONE NODE THERE IS NO STAMP. Two unrelated unlocks landing
   in the same read is a real possibility, and naming one of their milestones would be picking a
   winner; naming both would be two stamps, which is a shape this moment does not have. The cards
   still say what opened, which is the half that matters. An absence is drawn as an absence. */
export function stampNode(features: readonly FeatureStatusPayload[]): { node: string; status: string } | null {
  const lists = features.map((feature) => feature.requires).filter((list) => list.length > 0)
  if (!lists.length) return null
  const shared = lists.reduce<{ node_id: string; status: string }[]>(
    (kept, list) => kept.filter((entry) => list.some(
      (candidate) => candidate.node_id === entry.node_id && candidate.status === entry.status,
    )),
    [...lists[0]],
  )
  return shared.length === 1 ? { node: shared[0].node_id, status: shared[0].status } : null
}

/* MASTERED AND REACHED ARE NOT THE SAME TRIGGER. Eight features want a node mastered and
   `jlpt_dashboard` wants `vocabulary_n5` merely unlocked, so the word is read off the requirement
   rather than assumed. Saying MASTERED on that one would be a lie about when it fired. */
export function statusWord(status: string): string {
  return status === 'mastered' ? 'MASTERED' : 'REACHED'
}

export function unlockMoment(
  features: readonly FeatureStatusPayload[],
  nodes: readonly ProgressionNodeView[],
): UnlockMoment | null {
  if (!features.length) return null
  const shared = stampNode(features)
  const named = shared ? milestone(nodes, shared.node) : null
  return {
    stamp: shared && named ? { ...named, word: statusWord(shared.status) } : null,
    cards: features.map((feature) => ({
      featureId: feature.feature_id,
      name: feature.name,
      category: feature.category,
      /* the catalog gives at most one badge per feature and two of the nine give none */
      badge: feature.badges[0] ?? null,
    })),
    mark: highWater(features),
  }
}

/* WHERE EACH ONE LIVES, so the moment can say what to do with it rather than only that it happened.
   The four that open a menu section name it; the rest name the surface they appear on, which is
   still an answer to "and now what". A feature with no entry says nothing rather than guessing. */
export const UNLOCK_LEADS_TO: Record<string, string> = {
  conversation_mode: 'THE WORLD · TALK',
  tutor_chat: 'THE WORLD · TALK',
  reading_mode: 'THE WORLD · READ',
  jlpt_dashboard: 'THE EXAM',
  listening_mode: 'PRACTICE · DRILLS',
  kanji_mode: 'THE PATH · KANJI',
  achievements: 'YOU · THE WALL',
  advanced_analytics: 'YOU',
  themes: 'SETTINGS',
}
