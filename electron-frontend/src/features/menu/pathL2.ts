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

/* ==================================================================================================
   THE ROAD — the geometry the mockup's course is drawn on, and the reason it is here rather than in
   the component.

   Every slot's width, every tablet's scale, depth and opacity, the rail's translation and the
   marker's position are all functions of DISTANCE FROM THE SELECTION, which changes on every
   keypress. That makes them arithmetic, not markup, and arithmetic that is wrong by a few pixels
   is exactly the kind of thing an eye passes and a test catches.

   THE ROAD COMPRESSES TOWARD EACH HORIZON. A slot shrinks with distance -- `csScale` -- so sixteen
   steps fit a 960-wide strip while the stone you are standing on stays a whole stone. The selected
   slot is a different width again (`WSEL`), because the card rides in it.
   ================================================================================================== */
export const CS = {
  /** where the first slot starts, inside the rail's own coordinate space */
  X0: 320,
  /** an ordinary slot, the selected slot, and the space between two of them */
  W: 94,
  WSEL: 290,
  GAP: 18,
  /** the tablets sit lower than the card; the rule the marker rides is at the card's foot */
  TABY: 44,
  RULE: 373,
  /** the certification seam, and the two END/START posts */
  SEAM_W: 18,
  CAP_W: 26,
} as const

/* THE STRIP IS INSET TO THE STAGE, and the focus is the middle of the STRIP rather than of the
   board. The mockup measured `clientWidth / 2` and carries a note about exactly this: measured
   against the whole frame the selected tablet landed at board 800 instead of 640, and the road sat
   160px right of the screen it is drawn on. The board is a fixed 1280 here, so the same number is
   arithmetic rather than a layout read. */
export const CS_STRIP_INSET = 160
export const CS_FOCUS = (1280 - 2 * CS_STRIP_INSET) / 2

export const csScale = (d: number): number => Math.max(0.78, 1 - Math.min(d, 5) * 0.055)

/* FOUR CHAPTERS, contiguous, in the course's own order. The boundaries are real: the two scripts,
   then words and the patterns that join them, then everything you do WITH the language, then the
   exams -- which are a different kind of thing from a lesson. */
export const CS_CHAPTERS = [
  { jp: '基礎', en: 'FOUNDATIONS', from: 0, to: 2 },
  { jp: '言葉', en: 'WORDS & GRAMMAR', from: 3, to: 5 },
  { jp: '実践', en: 'IN PRACTICE', from: 6, to: 10 },
  { jp: '検定', en: 'CERTIFICATION', from: 11, to: 15 },
] as const
export const CS_CHNUM = ['一', '二', '三', '四'] as const
export const csChapter = (i: number): number =>
  CS_CHAPTERS.findIndex((c) => i >= c.from && i <= c.to)

export const CS_BACK = 'repeating-linear-gradient(135deg, rgba(242,234,216,0.06) 0 7px,'
  + ' rgba(0,0,0,0) 7px 14px), linear-gradient(rgba(17,19,28,0.9), rgba(11,13,20,0.94))'
export const CS_FACE = 'linear-gradient(178deg, #e6ddc4 0%, #cbc1a4 100%)'

/* A TABLET HAS ROOM FOR A TOKEN, NOT A SENTENCE. The gate is authored as plain words ("all 46
   characters", "80% of it") because that is what the card says; ninety-four pixels wants the short
   form of the same fact, so it is DERIVED rather than authored twice and cannot drift. */
export function csToken(meta: string): string {
  const m = String(meta || '').toUpperCase()
  let x = m.match(/(\d+)\s*%/)
  if (x) return `${x[1]}%`
  x = m.match(/(\d+)\s+CHARACTERS/)
  if (x) return `${x[1]} CHARS`
  x = m.match(/(\d+)\s+WORDS/)
  if (x) return `${x[1]} WORDS`
  if (/ONCE/.test(m)) return 'ONCE'
  if (/EVERY SCENE/.test(m)) return 'ALL SCENES'
  const seg = m.split('·').map((t) => t.trim()).filter(Boolean)
  const pick = seg.find((t) => /\d/.test(t)) || seg[seg.length - 1] || m
  return pick.split(' ').slice(0, 3).join(' ')
}

/* the exams carry their level as a figure of its own, so the tablet reads N5 under the number
   rather than squeezing "JLPT N5" into a vertical column */
export interface CsBits { lv: string; en: string; vjp: string; tok: string }
export function csBits(row: PathRow): CsBits {
  const lv = (row.en.match(/^JLPT\s+(N[1-5])$/) || [])[1] || ''
  return { lv, en: lv ? 'JLPT' : row.en, vjp: lv ? '検定' : row.jp, tok: csToken(row.want) }
}

export interface CourseSlots {
  lefts: number[]
  centers: number[]
  /** where the certification post stands, or null when the road has no such boundary */
  seamX: number | null
  /** the far end of the road, where the END post goes */
  end: number
}

/** every slot's place along the rail, given which one is selected */
export function courseSlots(rows: readonly PathRow[], sel: number): CourseSlots {
  const n = rows.length
  /* the seam is DERIVED rather than counted -- the first exam is where certification starts */
  const certAt = rows.findIndex((r) => /^jlpt/.test(r.id))
  const lefts: number[] = []
  const centers: number[] = []
  let seamX: number | null = null
  let x = CS.X0
  for (let i = 0; i < n; i++) {
    if (i) x += CS.GAP
    if (i === certAt && i > 0) { seamX = x; x += CS.SEAM_W + CS.GAP }
    const w = i === sel ? CS.WSEL : Math.round(CS.W * csScale(Math.abs(i - sel)))
    lefts.push(x)
    centers.push(x + w / 2)
    x += w
  }
  return { lefts, centers, seamX, end: x }
}

/** how far along the road the learner actually stands, between this step and the next */
export function courseMark(
  rows: readonly PathRow[], centers: readonly number[],
): { x: number; pct: number } {
  const cur = Math.max(0, rows.findIndex((r) => r.state === 'here'))
  const next = centers[Math.min(cur + 1, rows.length - 1)] ?? centers[cur] ?? 0
  const here = centers[cur] ?? 0
  const pct = Math.max(0, rows[cur]?.pct ?? 0)
  return { x: here + (next - here) * (pct / 100), pct }
}
