import type { VocabFeed, VocabFeedWord } from '../vocab-feed'

/* ==================================================================================================
   THE FEED SCREEN — vocabulary's level three, where the deck screen would be if the deck had blocks.

   IT IS A DIFFERENT QUESTION, WHICH IS WHY IT IS A DIFFERENT SCREEN. The vocabulary levels stopped
   being cut into blocks, so there is no chunk to choose: the deck asks "which of these may I open",
   the feed asks "what am I being given today". `build_vocab_feed` refuses a deck with blocks and
   `build_block_progress` answers an empty list for one without, so the split is the backend's own
   and this menu only has to read which side of it a milestone falls on.

   THE QUEUE DOES NOT EMPTY — IT SHORTENS, and that is the one thing the mockup drew that has no
   source here. It had a "3 DONE · 7 TO GO" counter and a rail with ticks on it. `next_words` returns
   the words the learner has NOT STARTED, so studying one removes it from the list rather than
   crossing it off: the feed is recomputed, never consumed. A "done today" figure would be a count
   nothing keeps. So the rail marks POSITION and not progress, and the line under it says which.

   WHAT IS REAL ARE THE DENOMINATORS. "Here are ten words" is a card trick without one, and three
   are counted by the bridge: how much of the level the learner's kanji already unlock, how many
   characters that is — the number the whole ordering turns on — and how much of the level has been
   begun at all. Clearing a kanji block visibly moves the first two.
   ================================================================================================== */

/** the CJK ideograph range, the same one `domain/vocab_order.kanji_in` gates on */
const KANJI = /[一-鿿]/

/** the distinct kanji in a word, in the order they are written */
export function kanjiOf(word: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ch of word) {
    if (!KANJI.test(ch) || seen.has(ch)) continue
    seen.add(ch)
    out.push(ch)
  }
  return out
}

export interface FeedHead {
  /** how much of the level the learner can already read, 0..100 */
  readablePct: number
  /** how much of it has been begun at all, 0..100 */
  startedPct: number
  /** how many words are queued today */
  queued: number
}

export function feedHead(feed: VocabFeed): FeedHead {
  const pct = (part: number) => (feed.total ? Math.round((part / feed.total) * 100) : 0)
  return {
    readablePct: pct(feed.readable),
    startedPct: pct(feed.started),
    queued: feed.words.length,
  }
}

/* WHY THE QUEUE IS THE LENGTH IT IS, said in one line — and there are four different reasons for a
   short one. A budget of ten that yields three words is not the same event as a budget of none, and
   neither is the same as a level with nothing left in it. An empty feed with no explanation reads
   as a broken screen. */
export function feedNote(feed: VocabFeed): string {
  if (feed.budget === 0) return 'THE BUDGET IS SET TO NONE · REVIEWS ONLY'
  if (feed.words.length === 0) {
    return feed.started >= feed.total && feed.total > 0
      ? 'EVERY WORD IN THIS LEVEL HAS BEEN BEGUN'
      : 'NOTHING NEW TO ADD RIGHT NOW'
  }
  if (feed.words.length < feed.budget) {
    return `ONLY ${feed.words.length} LEFT UNSTARTED · THE BUDGET IS ${feed.budget}`
  }
  return `${feed.budget} A DAY · REVIEWS ARE NOT CAPPED`
}

/** the word the queue is standing on, or nothing when it is empty */
export function feedAt(feed: VocabFeed, at: number): VocabFeedWord | null {
  if (!feed.words.length) return null
  return feed.words[Math.max(0, Math.min(at, feed.words.length - 1))] ?? null
}

/* THE WORD IS SET FROM ITS OWN LENGTH. お父さん is four characters and 上 is one, and one font size
   for both either wastes the card or runs off it. The divisor is the card's own text width. */
export const FEED_WORD_BOX = 360
export const FEED_WORD_MIN = 34
export const FEED_WORD_MAX = 72

export function wordSize(word: string): number {
  const length = Math.max(1, Array.from(word).length)
  return Math.max(FEED_WORD_MIN, Math.min(FEED_WORD_MAX, Math.floor(FEED_WORD_BOX / length)))
}

/* THE KANJI IN A WORD, AND HOW MANY OF THEM ARE NEW — WHICH IS NOT THE SAME AS WHICH.

   `unknown_kanji` is a COUNT. The set it was computed against lives in `_known_kanji()` on the
   backend and is not reported, so the renderer cannot say that THIS character is the new one. The
   mockup coloured each chip individually, which it could do because it authored its own `known`
   list; doing it here by marking the first n would be drawing a specific claim out of a figure that
   does not carry it — a nicer picture and a false one.

   So the characters are drawn plainly and the count is said out loud. It is also the more useful
   half: "one of these two is new" is what tells a learner why this word is where it is in the
   order, and that is the whole basis of the feed. */
export interface WordKanji {
  chars: string[]
  /** how many of them the learner has not met, straight from the payload */
  unknown: number
  /** the line under the chips, which says what the count means rather than restating it */
  note: string
}

export function wordKanji(word: VocabFeedWord): WordKanji {
  const chars = kanjiOf(word.word)
  const unknown = Math.min(word.unknown_kanji, chars.length)
  const note = chars.length === 0
    ? 'NO KANJI IN IT — READABLE ON DAY ONE'
    : unknown === 0
      ? `${chars.length === 1 ? 'ITS KANJI IS' : `ALL ${chars.length} KANJI ARE`} ONES YOU HAVE MET`
      : `${unknown} OF ${chars.length} ${unknown === 1 ? 'IS' : 'ARE'} NEW TO YOU`
  return { chars, unknown, note }
}
