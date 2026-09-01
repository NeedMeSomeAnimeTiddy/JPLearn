import type { ProgressionNodeView } from '../progression'

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

/* NOTHING SCROLLS; OVERFLOW FOLDS. Sixteen rows do not fit the stage, and the frame contract
   forbids a scrollbar — so a window of rows moves around the cursor and the two ends say how many
   are folded away behind them. A count is a fact; a cut-off row is an accident. */
export const PATH_WINDOW = 6

export interface PathWindow {
  rows: PathRow[]
  /** how many are folded above and below, for the two band labels */
  behind: number
  ahead: number
  /** index within `rows` of the cursor */
  cursorInWindow: number
}

export function pathWindow(rows: readonly PathRow[], cursor: number): PathWindow {
  if (rows.length <= PATH_WINDOW) {
    return { rows: [...rows], behind: 0, ahead: 0, cursorInWindow: cursor }
  }
  const half = Math.floor(PATH_WINDOW / 2)
  const start = Math.min(Math.max(0, cursor - half), rows.length - PATH_WINDOW)
  return {
    rows: rows.slice(start, start + PATH_WINDOW),
    behind: start,
    ahead: rows.length - (start + PATH_WINDOW),
    cursorInWindow: cursor - start,
  }
}
