import { LOOKUP_HISTORY_KEY, LOOKUP_HISTORY_LIMIT } from './constants'
import type { LookupRouteKey } from './types'

/* CJK Unified Ideographs, plus Extension A. Deliberately not the full ideographic range: the
   point is to recognise a character someone would call a kanji, not to be exhaustive about
   Unicode. */
const KANJI_PATTERN = /[㐀-䶿一-鿿]/u

export function isKanji(character: string): boolean {
  return KANJI_PATTERN.test(character)
}

/** counted in code points, because `'語'.length` is not what it looks like for every character */
export function isSingleKanji(query: string): boolean {
  const trimmed = query.trim()
  const characters = Array.from(trimmed)
  return characters.length === 1 && isKanji(characters[0])
}

/* WHAT YOU TYPED PICKS THE ANSWER. One kanji is a request about that character; anything longer
   is a request about a word. The phrase route is not inferred because it is not a shape of input
   -- `lookup-sentence` finds a sentence containing whatever you typed, so it complements every
   query rather than competing with one. */
export function inferRoute(query: string): LookupRouteKey {
  return isSingleKanji(query) ? 'kanji' : 'word'
}

/** every kanji in the query, de-duplicated, in the order they appear */
export function kanjiIn(query: string): string[] {
  const seen = new Set<string>()
  for (const character of Array.from(query)) {
    if (isKanji(character)) seen.add(character)
  }
  return [...seen]
}

export function loadLookupHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(LOOKUP_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    /* a private window, cleared site data, or a browser that throws on access */
    return []
  }
}

export function rememberLookup(query: string, history: string[]): string[] {
  const trimmed = query.trim()
  if (!trimmed) return history
  const next = [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, LOOKUP_HISTORY_LIMIT)
  try {
    window.localStorage.setItem(LOOKUP_HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* remembering is a convenience; failing to remember is not an error worth surfacing */
  }
  return next
}

/* A keystroke belongs to whatever the user is typing into, always. `/` and `,` are only shortcuts
   when nothing is listening for them as text -- otherwise the lookup would open every time
   somebody typed a comma into an answer field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}
