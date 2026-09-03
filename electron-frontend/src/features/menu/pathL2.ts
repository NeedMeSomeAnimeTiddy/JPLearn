import type { ProgressionNodeView } from '../progression'
import type { ChainView } from './chain'

/* ==================================================================================================
   THE PATH, LEVEL TWO — the journey, sixteen milestones.

   THE LIST IS NOT DECLARED HERE. `domain/progression_curriculum.py` already owns those sixteen
   nodes, in that order, and the bridge reports each one's real status; declaring a second copy is
   how two lists start disagreeing. So the rows are built from `progression.nodes` and this table
   supplies only what the backend does not carry: the Japanese name, and the one line saying what
   the step actually asks of you.

   A NODE WITH NO ENTRY STILL DRAWS. If the curriculum grows a seventeenth node it renders with
   its backend name and no Japanese, rather than vanishing — a missing label is a small wrong
   thing, and a silently dropped milestone is a large one.
   ================================================================================================== */
interface PathCopy { jp: string; want: string }

const PATH_COPY: Record<string, PathCopy> = {
  tutorial: { jp: '入門', want: 'finish it once' },
  hiragana: { jp: 'ひらがな', want: 'all 46 characters' },
  katakana: { jp: 'カタカナ', want: 'all 46 characters' },
  vocabulary_n5: { jp: '語彙', want: '40 words' },
  grammar_n5: { jp: '文法', want: '80% of it' },
  sentence_examples: { jp: '例文', want: '80% of it' },
  scripted_conv: { jp: '会話練習', want: 'every scene' },
  listening: { jp: '聴解', want: '80% of it' },
  kanji_n5: { jp: '漢字', want: '80 characters' },
  free_conv: { jp: '自由会話', want: '80% of it' },
  reading: { jp: '読解', want: '80% of it' },
  jlpt_n5: { jp: 'N5 検定', want: '90% of it' },
  jlpt_n4: { jp: 'N4 検定', want: '90% of it' },
  jlpt_n3: { jp: 'N3 検定', want: '90% of it' },
  jlpt_n2: { jp: 'N2 検定', want: '90% of it' },
  jlpt_n1: { jp: 'N1 検定', want: '90% of it' },
}

/* THE MILESTONE, IN THE PATH'S OWN WORDS. THE WORLD's two lanes each name the step that opened
   them, and a second screen naming the same milestone is a second place for it to drift — the
   L1 row already says "reach GRAMMAR on the path" where the path itself draws GRAMMAR N5. So the
   name comes from the curriculum's own node and the Japanese from the table above, and every
   screen that names a step gets it from here. */
export function milestone(
  nodes: readonly ProgressionNodeView[], nodeId: string,
): { en: string; jp: string } {
  const node = nodes.find((candidate) => candidate.node_id === nodeId)
  return {
    en: (node?.name ?? nodeId.replace(/_/g, ' ')).toUpperCase(),
    jp: PATH_COPY[nodeId]?.jp ?? '',
  }
}

/** where a milestone hands off to, in the menu's own words */
const GOES_TO: Record<string, string> = {
  jlpt: 'THE EXAM',
  passages: 'THE WORLD',
  scenarios: 'THE WORLD',
  tutor: 'THE WORLD',
}

export type PathRowState = 'done' | 'here' | 'ahead'

export interface PathRow {
  id: string
  /** "01".."16" */
  no: string
  en: string
  jp: string
  /** what the step asks of you */
  want: string
  state: PathRowState
  /** 0..100, from the node's own mastered ratio */
  pct: number
  /** "91/104", or empty where the node reports nothing measurable */
  count: string
  /** where Enter would take you, named */
  goesTo: string
  /** false while the curriculum still gates it */
  isOpen: boolean
  isOverridden: boolean
}

export function pathRows(nodes: readonly ProgressionNodeView[]): PathRow[] {
  return nodes.map((node, index) => {
    const copy = PATH_COPY[node.node_id]
    const state: PathRowState =
      node.status === 'mastered' ? 'done'
        : node.status === 'locked' ? 'ahead'
          : 'here'
    return {
      id: node.node_id,
      no: String(index + 1).padStart(2, '0'),
      en: node.name.toUpperCase(),
      jp: copy?.jp ?? '',
      want: copy?.want ?? '',
      state,
      /* the ratio is the backend's, not a count this screen re-derives */
      pct: Math.round((node.mastered_ratio ?? 0) * 100),
      count: node.progressLabel ?? '',
      goesTo: node.destination.kind === 'script'
        ? 'A DECK'
        : GOES_TO[node.destination.kind] ?? '',
      isOpen: node.isOpen,
      isOverridden: node.isOverridden,
    }
  })
}

/** the step the learner is actually on — the first that is not finished */
export function hereIndex(rows: readonly PathRow[]): number {
  const at = rows.findIndex((row) => row.state === 'here')
  if (at >= 0) return at
  const firstAhead = rows.findIndex((row) => row.state === 'ahead')
  /* everything done: stand on the last one rather than falling off the end */
  return firstAhead >= 0 ? firstAhead : Math.max(0, rows.length - 1)
}


/* ==================================================================================================
   THE COURSE, AS A CHAIN — the words this screen puts in the shared shapes. See `chain.ts`.

   A CURRICULUM IS A CHAIN BY CONSTRUCTION, the same way a deck's blocks are: `progression_curriculum`
   opens each node when the one before it is mastered, so `done` is a prefix, there is exactly one
   frontier, and everything after it is shut. That is the whole reason this drawing fits — it is not
   a list rendered three ways, it is three genuinely different populations.
   ================================================================================================== */

/** does this string carry kana or kanji, and so want the Japanese face and a wider advance */
const isCjk = (text: string): boolean => /[\u3040-\u30ff\u3400-\u9fff]/.test(text)

/* THE FURTHEST STEP THAT IS ACTUALLY CHOOSABLE, WHICH IS NOT ALWAYS THE ONE YOU ARE ON. The course
   is a line with one fork in it: `grammar_n5` names two children, so mastering it opens Sentence
   Examples AND Scripted Conversation at once. `hereIndex` picks the first of those -- correctly,
   because it is where the walk continues -- and the rail then has to let you reach the other, or
   the screen would draw a step as NOT YET CHOOSABLE while it is sitting there choosable. */
export function reachIndex(rows: readonly PathRow[]): number {
  let reach = -1
  rows.forEach((row, index) => { if (row.state !== 'ahead') reach = index })
  return reach
}

export function pathChain(
  rows: readonly PathRow[], here: number, shown: number,
): ChainView {
  const n = rows.length
  const cleared = rows.filter((row) => row.state === 'done').length
  const reach = Math.max(here, reachIndex(rows))
  const sel = rows[shown]
  /* the AHEAD card names the first step that is genuinely shut, not merely the next in the list */
  const next = rows[reach + 1]
  /* REVISITING IS A FACT ABOUT THE STEP, NOT ABOUT THE CURSOR. Off the frontier the card can be
     showing either a step you finished or -- at the fork -- the other one that is open, and those
     are different sentences: one is already done, the other is a second way on. */
  const revisiting = sel?.state === 'done'
  const alsoOpen = !!sel && shown !== here && sel.state === 'here'
  const ways = rows.filter((row) => row.state === 'here').length
  const name = sel ? (sel.jp || sel.en) : ''
  /* `goesTo` is the destination in the menu's own words: 'A DECK' for a script node, a section name
     for a hand-off, and empty for a milestone the app cannot open yet. */
  const dest = sel?.goesTo ?? ''
  const deck = dest === 'A DECK'
  const want = sel?.want ? sel.want.toUpperCase() : ''

  return {
    items: rows.map((row) => ({
      key: row.id, no: row.no, name: row.en, note: row.count, state: row.state,
    })),
    here,
    reach,
    cleared,
    /* the tail AFTER the one the AHEAD card names, which is what "LOCKED BEHIND IT" counts —
       counted rather than subtracted, so the fork cannot make it one too many */
    beyond: rows.slice(reach + 2).filter((row) => row.state === 'ahead').length,
    behindLabel: cleared === 1 ? 'STEP DONE' : 'STEPS DONE',
    hero: {
      cap: sel
        ? `${revisiting ? 'REVISITING' : alsoOpen ? 'ALSO OPEN' : 'YOU ARE HERE'}`
          + ` · STEP ${sel.no} OF ${n}`
        : 'THE COURSE',
      /* WHERE A STEP LIVES BELONGS IN THE CAP. The mockup learned this the hard way: at the right
         of the gate row it is drawn underneath the action slab and never once seen. */
      capRight: deck ? 'STUDIED HERE' : dest ? `LIVES IN ${dest}` : 'NOT BUILT YET',
      name,
      nameWide: isCjk(name),
      under: null,
      subLeft: sel?.en ?? '',
      subRight: revisiting ? 'DONE' : 'IN PROGRESS',
      pct: revisiting ? 100 : Math.max(0, sel?.pct ?? 0),
      /* THE GATE IS THE CURRICULUM'S OWN WORDS -- `MasteryRequirement` said plainly, which is the
         course's equivalent of a block's 70%. The figure carries the vermilion because it is the
         one thing on the card that is a target rather than a state. */
      gate: revisiting ? 'ALREADY DONE · NOTHING AHEAD MOVES' : want ? 'WANTS ' : 'NOTHING TO CLEAR',
      gateEm: revisiting || !want ? null : want,
      /* AND THE SLAB'S SMALL LINE CANNOT CLAIM TO BE THE ONLY WAY ON WHILE TWO ARE OPEN, which is
         exactly what the fork makes true for four steps of the sixteen. */
      slabEm: revisiting ? `STEP ${sel?.no ?? ''}`.trim()
        : ways > 1 ? `ONE OF ${ways} WAYS ON` : 'THE ONLY WAY ON',
      slabB: revisiting ? 'STUDY IT AGAIN'
        : deck ? 'OPEN ITS BLOCKS'
          : dest ? `GO TO ${dest}` : 'NOT BUILT YET',
      live: !!dest,
    },
    ahead: {
      kicker: ways > 1 ? 'NEXT, WHEN BOTH ARE DONE' : 'NEXT, WHEN THIS ONE IS DONE',
      name: next ? (next.jp || next.en) : 'THE COURSE IS DONE',
      meta: next ? next.en : 'NOTHING LOCKED',
      tailLabel: 'LOCKED BEHIND IT',
    },
    rail: {
      left: 'STEP 01',
      mid: `${n} STEPS · ${cleared} DONE · ${n ? Math.round((cleared / n) * 100) : 0}% OF THE COURSE`,
      right: `STEP ${String(n).padStart(2, '0')}`,
    },
    pile: { cap: 'STEPS DONE', act: 'OPEN THEM', empty: 'NOTHING BEHIND YOU YET' },
  }
}
