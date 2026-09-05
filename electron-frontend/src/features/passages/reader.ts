import { READING_PACE } from './constants'

/* ==================================================================================================
   WHAT A TEXT LOOKS LIKE ONCE IT HAS TO STAND ON A SHEET.

   THE READER USED TO SCROLL, AND NOTHING IN THIS INTERFACE SCROLLS. The frame contract's rule is
   that a set which does not fit FOLDS, and what leaves becomes a count on the edge it left over —
   so a text is dealt a page at a time and the foot band carries the pages the way the round's foot
   band carries its questions. That also gives the screen the one fact a scrollbar only implies:
   how much is left.

   THE UNIT IS THE SENTENCE, and it is the only one these thirty texts agree on. `raw_text` keeps
   the author's line breaks and `text_jp` — the copy with the furigana in it — has already replaced
   them with spaces, so lines cannot be recovered from the string the reader draws. Spaces are no
   help either: they separate words in some of these texts (297 of them in one) and lines in others
   (eight in another). `。` is in all thirty, between four and a hundred and forty times.
   ================================================================================================== */

/** a run of the text: plain, or a word the text itself annotated with a reading */
export type Piece =
  | { kind: 'plain'; text: string }
  | { kind: 'word'; text: string; reading: string; at: number }

/* THE FURIGANA IS THE CURSOR'S OWN INDEX, which is the part of this that is luck rather than
   design. `text_jp` writes an annotated word as 高く（たかく）, and what the author chose to
   annotate is exactly what a learner would stop on: 澄, 星, 高く, 遠く, 下り, 水 in one text, and
   never the particles between them. So the reader needs no tokeniser to know where the words are —
   splitting Japanese into words in the renderer is a thing this app cannot do and does not have to.

   The one text with no furigana at all (`aozora_046940`, which is set in katakana) therefore has no
   stops, and the cell says so rather than pretending to a cursor with nowhere to stand. */
const RUBY = /([^\s（）]+)（([^）]*)）/g

/* WHERE THE ANNOTATED WORD ACTUALLY STARTS, which the brackets do not say. `あのお星（ほし）` is
   four characters of kana and then the one the reading belongs to; `高く（たかく）` is a kanji and
   the okurigana that finishes it. Both are one unbroken run before the bracket, so the run alone
   cannot tell them apart -- but the READING can: it is a reading of the kanji, so the word begins
   at the first kanji in the run and whatever kana came before it is ordinary text.

   Taking the whole run instead puts `あのお星` in the prompt cell and asks the dictionary about it,
   which is a word that does not exist. A run with no kanji at all is left whole rather than
   dropped, so nothing can go missing between the pieces. */
const KANJI = /[々一-鿿]/

export function pieces(text: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  let at = 0
  for (const m of text.matchAll(RUBY)) {
    const run = m[1]
    const from = run.search(KANJI)
    const lead = from > 0 ? run.slice(0, from) : ''
    const base = from > 0 ? run.slice(from) : run
    const before = text.slice(last, m.index) + lead
    if (before) out.push({ kind: 'plain', text: before })
    out.push({ kind: 'word', text: base, reading: m[2], at: at++ })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'plain', text: text.slice(last) })
  return out
}

/** the text with its readings taken back out — what the voice is given, and what a reader sees
 *  with furigana off */
export function bareText(text: string): string {
  return text.replace(RUBY, '$1')
}

/** how long the text reads, which is not how long it is — the readings are furniture, not letters */
export function bareLength(text: string): number {
  return bareText(text).length
}

/* SENTENCES KEEP THEIR OWN PUNCTUATION and the closing bracket after it: 「…ください。」 is one
   sentence and not a sentence followed by an orphaned quote mark. */
const SENTENCE = /[^。！？]*[。！？]+[」』）】]*\s*/g

export function sentences(text: string): string[] {
  const out: string[] = text.match(SENTENCE) ?? []
  const used = out.join('').length
  const tail = text.slice(used).trim()
  if (tail) out.push(tail)
  return out.map((s) => s.trim()).filter(Boolean)
}

/* ==================================================================================================
   HOW MUCH GOES ON ONE PAGE, AND HOW BIG IT IS SET — both solved from the cell rather than chosen.

   The work cell is 590 wide inside 22px of padding either side and about 236 tall once its kicker
   and the slab bled to the floor have taken theirs, so a page has 546 x 236 of paper. Ruby needs a
   two-line leading above the text it sits over, which is where the 2.0 comes from and why this is a
   different arithmetic from a paragraph of Latin.

   THE BUDGET IS A CEILING, NOT A TARGET. Pages are packed with whole sentences and a sentence is
   never cut, so the only page that can exceed it is one holding a single sentence longer than the
   whole budget — which these texts do contain. That is what the size is solved for: the same lesson
   as the round's own prompt (`promptSize`), one screen along. A long page is set smaller rather than
   pushed off the sheet.
   ================================================================================================== */
export const PROSE_W = 546
export const PROSE_H = 236
const PROSE_LINE = 2.0
/** mincho's advance is about the size itself, plus the 0.04em the sheet tracks it at */
const PROSE_ADVANCE = 1.04

export const PAGE_CHARS = 120

/** the size a page of this many characters is set at, in board pixels */
export function proseSize(chars: number): number {
  const area = PROSE_W * PROSE_H
  const per = PROSE_ADVANCE * PROSE_LINE * Math.max(1, chars)
  return Math.max(15, Math.min(25, Math.floor(Math.sqrt(area / per))))
}

export function paginate(text: string): string[] {
  const out: string[] = []
  let page = ''
  for (const s of sentences(text)) {
    /* a sentence longer than the whole budget still gets a page — dropping it is not an option and
       neither is cutting a sentence in half */
    if (page && bareLength(page) + bareLength(s) > PAGE_CHARS) {
      out.push(page)
      page = ''
    }
    page = page ? `${page}${s}` : s
  }
  if (page) out.push(page)
  return out.length ? out : ['']
}

/* ==================================================================================================
   WHAT THE CROWN SAYS ABOUT WHAT IS LEFT.

   FORTY WORDS A MINUTE IS THE LIBRARY'S OWN ASSUMPTION and it is named in `constants.ts` rather
   than here, because the shelf and the reader disagreeing about how long a text takes would be two
   answers to the same question. The words are apportioned across the pages by how many characters
   each holds, which is honest to a page and rough to a sentence — the count the data gives is for
   the whole text and there is no per-page one to have.
   ================================================================================================== */
export function minutesLeft(wordCount: number, pages: readonly string[], at: number): number {
  const all = pages.reduce((sum, p) => sum + bareLength(p), 0)
  if (all === 0) return 1
  const left = pages.slice(at).reduce((sum, p) => sum + bareLength(p), 0)
  return Math.max(1, Math.round((wordCount * (left / all)) / READING_PACE))
}

/* THE WORD IN THE PROMPT CELL IS A GLOSS, NOT A SPECIMEN — which is the one thing the first cut of
   this screen got wrong. `promptSize` sets a lone character at 132px because on a drill that
   character IS the question; here it is the thing you glanced down at, with its reading and its
   meaning under it, and at specimen size it pushed both to the floor of the cell. Forty-six is the
   design card's own size for it, and the divisor only matters for a compound long enough to need it. */
export function termSize(text: string): number {
  return Math.min(46, Math.floor(272 / Math.max(1, [...text].length)))
}

/** every stop on a page, in the order the cursor walks them */
export function stops(page: string): Extract<Piece, { kind: 'word' }>[] {
  return pieces(page).filter((p): p is Extract<Piece, { kind: 'word' }> => p.kind === 'word')
}
