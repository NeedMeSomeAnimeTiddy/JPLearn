import { toHiragana } from 'wanakana'

/* THE DICTIONARY PANEL'S OWN SEARCH, shared. The panel and Look It Up both answer "a word" from the
   offline dictionary and from the learner's cards; they read the same query the same way, so a
   romaji word or a card that one finds, the other finds too. */

/** the part of a card the search reads */
export interface SearchableCard {
  character: string
  romaji: string
  meaning: string
  tags?: string[]
  example_sentence?: string | null
}

export interface CardMatch {
  /** lower is better: 0 is an exact character match */
  score: number
  matchReason: string
}

export function normalizeQuery(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function compactQuery(value: string): string {
  return normalizeQuery(value).replace(/[\s\-_.!?/\\'",:;()[\]{}]+/g, '')
}

export function hasJapaneseText(value: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿]/.test(value)
}

export function scoreCard<T extends SearchableCard>(card: T, query: string): (T & CardMatch) | null {
  const normalized = normalizeQuery(query)
  if (!normalized) return null
  const compact = compactQuery(query)
  const character = normalizeQuery(card.character)
  const romaji = normalizeQuery(card.romaji)
  const meaning = normalizeQuery(card.meaning)
  const tagText = normalizeQuery((card.tags ?? []).join(' '))
  const exampleText = normalizeQuery(card.example_sentence ?? '')
  const searchable = `${character} ${romaji} ${meaning} ${tagText} ${exampleText}`.trim()

  if (!searchable) return null

  const exactCharacter = hasJapaneseText(query) && character === compact
  const exactRomaji = romaji === normalized
  const exactMeaning = meaning === normalized

  if (exactCharacter) {
    return { ...card, score: 0, matchReason: 'exact character' }
  }
  if (exactRomaji) {
    return { ...card, score: 1, matchReason: 'exact reading' }
  }
  if (exactMeaning) {
    return { ...card, score: 2, matchReason: 'exact meaning' }
  }

  if (hasJapaneseText(query)) {
    if (character.startsWith(compact)) return { ...card, score: 3, matchReason: 'character prefix' }
    if (character.includes(compact)) return { ...card, score: 4, matchReason: 'character match' }
    if (romaji.includes(normalized)) return { ...card, score: 5, matchReason: 'reading match' }
    if (meaning.includes(normalized)) return { ...card, score: 6, matchReason: 'meaning match' }
  } else {
    if (meaning.startsWith(normalized)) return { ...card, score: 3, matchReason: 'meaning prefix' }
    if (romaji.startsWith(normalized)) return { ...card, score: 4, matchReason: 'reading prefix' }
    if (meaning.includes(normalized)) return { ...card, score: 5, matchReason: 'meaning match' }
    if (romaji.includes(normalized)) return { ...card, score: 6, matchReason: 'reading match' }
    if (character.includes(compact)) return { ...card, score: 7, matchReason: 'character match' }
  }

  if (searchable.includes(normalized) || searchable.includes(compact)) {
    return { ...card, score: 8, matchReason: 'text match' }
  }

  return null
}

/** every card the query matches, best match first */
export function searchCards<T extends SearchableCard>(cards: readonly T[], query: string): Array<T & CardMatch> {
  if (!query.trim()) return []
  return cards
    .map((card) => scoreCard(card, query))
    .filter((item): item is T & CardMatch => item !== null)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score
      if (left.character !== right.character) return left.character.localeCompare(right.character)
      return left.romaji.localeCompare(right.romaji)
    })
}

// If the query looks like romaji (plain latin letters, no kana/kanji already),
// try converting it to hiragana so it can also be matched against the offline
// dictionary's kana readings - JMdict readings are stored in kana, not romaji.
export function guessKanaFromRomaji(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed || hasJapaneseText(trimmed)) return null
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) return null
  const converted = toHiragana(trimmed, { passRomaji: false })
  if (!converted || !hasJapaneseText(converted)) return null
  if (converted.toLowerCase() === trimmed.toLowerCase()) return null
  // Reject partial/garbled conversions (e.g. "hello" -> "へlぉ") - only trust
  // conversions where every romaji character mapped cleanly to kana.
  if (/[a-zA-Z]/.test(converted)) return null
  return converted
}
