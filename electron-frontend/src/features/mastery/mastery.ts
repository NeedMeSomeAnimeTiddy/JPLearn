import { CARD_MASTERY_MAX } from '../../constants'
import { jlptTagFromCard } from '../../utils'
import type { CardScores, JlptLevel } from '../../types'

/* ==================================================================================================
   EVERY CHARACTER, AND HOW WELL YOU KNOW IT.

   THE ONE THING THE MENU HAS NO SCREEN FOR. THE PATH shows the blocks ahead of you, RECORDS shows
   the year behind you and the dictionary answers about a character you name — none of them answers
   "how am I doing on all of them". That is what this is, and it is why it survives the rebuild while
   the JLPT dashboard and the passage shelf did not: it is not a second drawing of a menu screen.

   THREE LEVELS, BECAUSE THE DATA HAS THREE. A group is a script or a level; a block is the named set
   the deck screen already teaches in (`Vowels`, `K-row`, `Numbers & Time`); a character is a card
   with a score out of four. The old panel drew all three at once as a wall of expanding tiles with
   an inline chip strip that pushed everything below it down the page.

   KANJI ARE GROUPED BY LEVEL AND THEN BY THE BLOCK THEY ARE TAUGHT IN, which is the same name the
   deck screen uses — the bridge reads it off the block rather than a theme table for exactly that
   reason. Five levels rather than one group of two thousand: N1 alone is 1,192 cards.
   ================================================================================================== */

export interface MasteryChar {
  id: number
  char: string
  reading: string
  meaning: string
  /** nought to `CARD_MASTERY_MAX` */
  score: number
}

export interface MasteryBlock {
  key: string
  name: string
  chars: MasteryChar[]
  /** how many of its characters are at full score */
  known: number
  pct: number
}

export interface MasteryGroup {
  key: string
  en: string
  jp: string
  blocks: MasteryBlock[]
  cards: number
  pct: number
}

/** the shape the bridge's `overview-character-mastery` blocks arrive in */
export interface RawBlock {
  index: number
  name: string
  card_ids: number[]
  characters?: string[]
  meanings?: string[]
  romajis?: string[]
}

export interface RawKanji {
  id: number
  character: string
  romaji: string
  meaning: string
  tags: string[]
  /** the block this card is taught in, as the deck screen names it */
  theme: string
}

type Scores = Record<number, number>

function pctOf(chars: readonly MasteryChar[]): number {
  if (chars.length === 0) return 0
  const got = chars.reduce((sum, c) => sum + c.score, 0)
  return Math.round((got / (CARD_MASTERY_MAX * chars.length)) * 100)
}

function block(key: string, name: string, chars: MasteryChar[]): MasteryBlock {
  return {
    key,
    name,
    chars,
    known: chars.filter((c) => c.score >= CARD_MASTERY_MAX).length,
    pct: pctOf(chars),
  }
}

function fromRaw(prefix: string, raw: readonly RawBlock[], scores: Scores): MasteryBlock[] {
  return raw.map((b) => block(
    `${prefix}-${b.index}`,
    b.name,
    b.card_ids.map((id, i) => ({
      id,
      char: b.characters?.[i] ?? '',
      reading: b.romajis?.[i] ?? '',
      meaning: b.meanings?.[i] ?? '',
      score: Math.min(scores[id] ?? 0, CARD_MASTERY_MAX),
    })),
  ))
}

const LEVELS: JlptLevel[] = ['n5', 'n4', 'n3', 'n2', 'n1']

export interface MasteryInput {
  blocks: Partial<Record<'hiragana' | 'katakana', RawBlock[]>>
  categoryBlocks: Partial<Record<'vocab_n5' | 'grammar_patterns', RawBlock[]>>
  kanji: readonly RawKanji[]
  scores: CardScores
}

export function masteryGroups(input: MasteryInput): MasteryGroup[] {
  const out: MasteryGroup[] = []

  const push = (key: string, en: string, jp: string, blocks: MasteryBlock[]) => {
    const chars = blocks.flatMap((b) => b.chars)
    if (chars.length === 0) return
    out.push({ key, en, jp, blocks, cards: chars.length, pct: pctOf(chars) })
  }

  push('hiragana', 'HIRAGANA', '平仮名',
    fromRaw('hiragana', input.blocks.hiragana ?? [], input.scores.hiragana ?? {}))
  push('katakana', 'KATAKANA', '片仮名',
    fromRaw('katakana', input.blocks.katakana ?? [], input.scores.katakana ?? {}))

  /* EVERY KANJI DECK'S SCORES LIVE UNDER ONE KEY. `cardScores` is keyed by script and `kanji_n5` is
     the script — the levels are decks under it, and card ids are unique across the five. Reading a
     per-level key would find nothing and draw two thousand characters as untouched. */
  const kanjiScores = input.scores.kanji_n5 ?? {}
  for (const level of LEVELS) {
    const cards = input.kanji.filter((c) => jlptTagFromCard(c) === level)
    if (cards.length === 0) continue
    const byTheme = new Map<string, MasteryChar[]>()
    for (const card of cards) {
      const name = card.theme || 'UNGROUPED'
      const chars = byTheme.get(name) ?? []
      chars.push({
        id: card.id,
        char: card.character,
        reading: card.romaji,
        meaning: card.meaning,
        score: Math.min(kanjiScores[card.id] ?? 0, CARD_MASTERY_MAX),
      })
      byTheme.set(name, chars)
    }
    push(`kanji-${level}`, `KANJI ${level.toUpperCase()}`, '漢字',
      [...byTheme].map(([name, chars], i) => block(`kanji-${level}-${i}`, name, chars)))
  }

  push('vocab', 'VOCABULARY', '語彙',
    fromRaw('vocab', input.categoryBlocks.vocab_n5 ?? [], input.scores.vocab_n5 ?? {}))
  push('grammar', 'GRAMMAR', '文法',
    fromRaw('grammar', input.categoryBlocks.grammar_patterns ?? [], input.scores.grammar_patterns ?? {}))

  return out
}

/* ==================================================================================================
   NOTHING SCROLLS HERE EITHER, and a kanji level is up to seventy-odd blocks — so the list moves a
   window over them and says how many are folded away at each end. Lifted in shape from the library
   shelf, which solved the same problem for thirty texts.
   ================================================================================================== */
export const LIST_ROWS = 8
const LEAD = 3

export interface Windowed<T> {
  rows: T[]
  above: number
  below: number
  cursorInWindow: number
}

export function listWindow<T>(rows: readonly T[], cursor: number, size = LIST_ROWS): Windowed<T> {
  if (rows.length <= size) {
    return { rows: [...rows], above: 0, below: 0, cursorInWindow: cursor }
  }
  const lo = Math.max(0, Math.min(cursor - LEAD, rows.length - size))
  const hi = Math.min(rows.length, lo + size)
  return { rows: rows.slice(lo, hi), above: lo, below: rows.length - hi, cursorInWindow: cursor - lo }
}

/** what the cap says about the whole set, counted rather than stated */
export function masteryNote(groups: readonly MasteryGroup[]): string {
  const cards = groups.reduce((sum, g) => sum + g.cards, 0)
  if (cards === 0) return 'NOTHING COUNTED YET'
  const known = groups.reduce(
    (sum, g) => sum + g.blocks.reduce((n, b) => n + b.known, 0), 0,
  )
  return `${cards.toLocaleString()} CARDS · ${known.toLocaleString()} AT FULL SCORE`
}
