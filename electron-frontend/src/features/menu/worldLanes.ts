import { SCENARIOS } from '../../lib/scenarios'
import { sortByDifficulty, type Passage } from '../passages'
import type { ScenarioSessionPayload } from '../../generated/types'
import type { Lane, LaneItem } from './lanes'
import type { GateWords } from './unlock'

/* ==================================================================================================
   THE WORLD, LEVEL TWO — two lanes: read, and talk.

   THE SAME CARD AS PRACTICE'S, and deliberately so — see the note in `lanes.ts`. What differs is
   only what fills it, which is why this file is data and no component came with it.

   NOTHING IN HERE IS AN OBLIGATION. Practice's review lane owes you something; THE WORLD is the
   section you visit because you want to. `duty` is never set here, so the whole screen comes out
   in ink and gold, and the only red it is allowed is a lane the curriculum has not opened yet.

   TALK OPENS SIX STEPS BEFORE READ, and that came out the opposite way round from what the
   navigation plan assumed. `domain/feature_catalog.py` gates `conversation_mode` on `grammar_n5`
   (step five of sixteen) and `reading_mode` on `reading` (step eleven), so the section's own gate
   is GRAMMAR — a section opens when its FIRST lane does — and there is a six-step window in which
   THE WORLD is open and half of it is not. That window is where most early accounts will sit, so
   the READ lane draws it rather than pretending the section arrives whole.
   ================================================================================================== */

export interface WorldInputs {
  /** every passage the bridge reports, or null while it has not answered */
  passages: readonly Passage[] | null
  /** completed scenario sessions, or null while the bridge has not answered */
  sessions: readonly ScenarioSessionPayload[] | null
  /** unlocked feature ids, or null while the catalog has not answered — nothing is shut until it does */
  unlocked: ReadonlySet<string> | null
  /** what a feature is waiting for, read off the catalog — `useMenuL1` resolves it */
  gateOf: (featureId: string) => GateWords | null
}

/** the id of the feature each lane waits on, straight from `domain/feature_catalog.py` */
export const READ_FEATURE = 'reading_mode'
export const TALK_FEATURE = 'conversation_mode'
/* THE NODE EACH ONE WAITS ON IS NOT WRITTEN DOWN HERE ANY MORE. It used to be -- `reading` and
   `grammar_n5`, copied out of the same file the feature ids come from -- so that these lanes could
   look their names up. `feature-unlocks` reports the requirement now, and `gateOf` resolves it, so
   a catalog change cannot leave a gate chip crediting the wrong step. */

/** how many rows a lane shows of what is inside it */
export const LANE_ITEMS = 3

/* THE THREE YOU WOULD ACTUALLY PICK ARE THE FIRST THREE THROUGH THE DOOR. `sortByDifficulty` is
   the hub's own comparator, so these are literally the top of the list this card opens onto —
   picking "the easiest three" by any other rule would have made the card and the screen behind
   it disagree about which text is easiest. */
function readItems(passages: readonly Passage[]): LaneItem[] {
  return sortByDifficulty([...passages]).slice(0, LANE_ITEMS).map((passage) => ({
    /* THE TAG IS A LENGTH, NOT A PROGRESS. The mockup tagged these `NEW` and `38%` because its
       library remembered what had been read; `usePassages` keeps its progress map in component
       state and nothing writes it anywhere, so between visits the app knows nothing about what
       you have read. A percentage here would be invented. A word count is in the data. */
    jp: passage.title,
    /* AND THE GLOSS IS THE AUTHOR, for the same kind of reason: the mockup's rows were Japanese
       title over English gloss, and these thirty are Aozora Bunko texts that carry no English at
       all. The author is the useful second line for a story, and it needs the Japanese face. */
    en: passage.author,
    enJp: true,
    tag: `${passage.word_count.toLocaleString()} WORDS`,
  }))
}

function talkItems(): LaneItem[] {
  const scenes: LaneItem[] = SCENARIOS.map((scenario) => ({
    jp: scenario.titleJa,
    en: scenario.title,
    tag: `${scenario.objectives.length} GOALS`,
  }))
  return scenes.concat([{
    /* THE ONE THAT IS NOT A SCENE. Free talk sits in the same list because it is a third thing you
       can enter, and it is hollow because it is not authored content with a start and an end — it
       is not counted in the figure above for exactly that reason. */
    jp: '自由会話', en: 'Free Talk', tag: 'ANY TOPIC', hollow: true,
  }])
}

export function worldLanes({ passages, sessions, unlocked, gateOf }: WorldInputs): Lane[] {
  /* nothing is shut until the catalog answers — the same default L1 draws with */
  const readShut = unlocked ? !unlocked.has(READ_FEATURE) : false
  const talkShut = unlocked ? !unlocked.has(TALK_FEATURE) : false
  const played = sessions?.length ?? null
  const scenes = SCENARIOS.length
  /* WHAT OPENS IT IS THE MILESTONE'S OWN NAME, not a second transcription of it — the sentence is
     built from the same step the gate chip credits, so the two can never say different things. */
  const readStep = gateOf(READ_FEATURE)
  const talkStep = gateOf(TALK_FEATURE)

  return [
    {
      key: 'read',
      en: 'READ', jp: '読解', glyph: '読',
      desc: 'Real stories from Aozora Bunko, graded easiest to hardest',
      fig: passages ? String(passages.length) : '—',
      figLab: passages ? 'TEXTS' : 'NOT COUNTED YET',
      absent: !passages,
      gate: { en: gateLine(readShut, readStep), jp: readStep?.jp ?? '' },
      items: passages ? readItems(passages) : [],
      /* WHAT IS TRUE OF THESE THIRTY, and it is not the mockup's "4 BANDS BY DIFFICULTY": every
         one of them reports `difficulty_label: 'beginner'`, so there is one band and a score
         inside it. The second half is the absence the tags above cannot state on their own. */
      foot: 'EVERY ONE GRADED BEGINNER · WHAT YOU READ IS NOT KEPT BETWEEN VISITS',
      act: 'OPEN THE LIBRARY',
      shut: readShut,
      opens: opensLine(readStep),
    },
    {
      key: 'talk',
      en: 'TALK', jp: '会話', glyph: '会',
      desc: 'Hold a conversation with someone who answers back — speak it or type it',
      /* TWO, NOT TWELVE. `src/lib/scenarios/index.ts` exports exactly two scenarios, and this is
         the number the app can actually run today. */
      fig: String(scenes), figLab: scenes === 1 ? 'SCENE' : 'SCENES',
      gate: { en: gateLine(talkShut, talkStep), jp: talkStep?.jp ?? '' },
      items: talkItems(),
      /* THE SESSIONS ARE REAL, unlike the reading progress above: `scenario_sessions` is a table
         and `listScenarioSessions` reads it, so this lane gets to count where the other cannot. */
      foot: played === null
        ? 'THE TUTOR MARKS YOU AT THE END'
        : played === 0
          ? 'NOTHING PLAYED YET · THE TUTOR MARKS YOU AT THE END'
          : `${played} PLAYED · THE TUTOR MARKS YOU AT THE END`,
      act: 'PICK A SCENE',
      shut: talkShut,
      opens: opensLine(talkStep),
    },
  ]
}

/* ONE CHIP, TWO STATES — INCLUDING ITS WORDS. The mockup kept one string and turned it vermilion,
   which left a lane reading "OPENED BY READING" in red on a door that has never opened. The colour
   is the state and so is the tense. */
/* THE CHIP, AND THE SLAB THAT REPLACES THE INVITATION WHEN THE LANE IS SHUT. Both say the same
   milestone and both now say which trigger it is: `reading_mode` wants `reading` MASTERED, and
   "reach READING on the path" was quietly wrong about that. Nothing is drawn at all until the
   catalog has answered — a chip reading "OPENS AT" with no step is worse than no chip. */
function gateLine(shut: boolean, step: GateWords | null): string {
  if (!step) return ''
  return shut ? `OPENS AT ${step.en}` : `OPENED BY ${step.en}`
}

function opensLine(step: GateWords | null): string {
  return step ? `${step.en} · ${step.word}` : 'not open yet'
}
