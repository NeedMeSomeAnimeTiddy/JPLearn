import { SCENARIOS } from '../../lib/scenarios'
import type { ScenarioSessionPayload } from '../../generated/types'

/* ==================================================================================================
   PICKING A SCENE — THE WORLD's level three, through the TALK lane.

   TWO CARDS AND A STRIP, BECAUSE THERE ARE TWO SCENES. `src/lib/scenarios/index.ts` exports exactly
   `CAFE_ORDER_SCENARIO` and `SHINJUKU_DIRECTIONS_SCENARIO`, and a grid built for twelve would have
   drawn ten empty slots or, worse, ten invented ones. When the app grows more scenes this becomes a
   road; until it does, two scenes get to be two cards.

   EVERY WORD ON A CARD IS THE SCENARIO FILE'S OWN. The title, the Japanese title, the description,
   the NPC and every objective with its `required` flag are read off the definition. The mockup
   transcribed them by hand on 2026-08-31 and invented Japanese labels for the two NPCs, because the
   data carries `name` and `role` in English only — here the role is simply printed as what it is.

   AND THE PLAY COUNT IS REAL, which the mockup's could not be. `scenario_sessions` is a table and
   every row carries the `scenario_id` it belongs to, so a card knows whether THIS conversation has
   been had, rather than the screen saying "NOT PLAYED" over all of them for ever.
   ================================================================================================== */

export interface SceneObjective {
  label: string
  required: boolean
}

export interface Scene {
  id: string
  /** the scenario's own two titles */
  jp: string
  en: string
  /** who you are talking to, and what they are */
  who: string
  role: string
  desc: string
  objectives: SceneObjective[]
  /** how many times this exact scenario has been finished */
  played: number
  foot: string
}

export function scenes(sessions: readonly ScenarioSessionPayload[] | null): Scene[] {
  return SCENARIOS.map((s) => {
    /* null is "not asked yet" and is not the same as zero plays, so the foot says so */
    const played = sessions ? sessions.filter((row) => row.scenario_id === s.id).length : -1
    return {
      id: s.id,
      jp: s.titleJa,
      en: s.title,
      who: s.npc.name,
      role: s.npc.role,
      desc: s.description,
      /* THE HOLLOW MARKER ALREADY SAYS OPTIONAL, so the one objective whose own label ends in
         "(optional)" has it trimmed — the data is quoted, not its redundancy. */
      objectives: s.objectives.map((o) => ({
        label: o.label.replace(/\s*\(optional\)$/i, ''),
        required: o.required,
      })),
      played,
      foot: played < 0
        ? 'THE TUTOR MARKS YOU AT THE END'
        : played === 0
          ? 'NOT PLAYED · THE TUTOR MARKS YOU AT THE END'
          : `PLAYED ${played} TIME${played === 1 ? '' : 'S'} · THE TUTOR MARKS YOU AT THE END`,
    }
  })
}

/* THE ONE THAT IS NOT A SCENE. Free talk sits under the two because it is a third thing you can
   enter, and it is not one of them because it is not authored content with a start and an end —
   which is the same reason it is not counted in the lane's figure a level above. */
export const FREE_TALK = {
  jp: '自由会話',
  en: 'FREE TALK',
  glyph: '自',
  desc: 'No script and no objectives — say anything you like, and the tutor answers, '
    + 'corrects you, and turns what you got wrong into cards.',
  act: 'START TALKING',
} as const
