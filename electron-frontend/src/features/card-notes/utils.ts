export interface DictionaryIdentityItem {
  note_key?: string | null
  character: string
  romaji?: string | null
  meaning?: string | null
}

const BUILTIN_NOTE_KEY_PATTERN = /^note:v1:builtin:[0-9a-f]{64}$/
const OFFLINE_SOURCE_NOTE_KEY_PATTERN =
  /^note:v1:offline_dictionary:jmdict:([a-z0-9]+(?:-[a-z0-9]+)*)$/
const OFFLINE_FALLBACK_NOTE_KEY_PATTERN =
  /^note:v1:offline_dictionary:fallback:[0-9a-f]{64}$/
const MAX_NOTE_KEY_LENGTH = 192
const MAX_SOURCE_ID_LENGTH = 128

export function countNoteCharacters(value: string): number {
  return Array.from(value).length
}

export function isValidCardNoteKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_NOTE_KEY_LENGTH) {
    return false
  }

  if (
    BUILTIN_NOTE_KEY_PATTERN.test(value) ||
    OFFLINE_FALLBACK_NOTE_KEY_PATTERN.test(value)
  ) {
    return true
  }

  const sourceMatch = OFFLINE_SOURCE_NOTE_KEY_PATTERN.exec(value)
  return sourceMatch !== null && sourceMatch[1].length <= MAX_SOURCE_ID_LENGTH
}

function normalizeDisplayIdentity(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim()
}

export function dictionaryItemRenderKey(item: DictionaryIdentityItem): string {
  if (isValidCardNoteKey(item.note_key)) {
    return item.note_key
  }

  return `display:${JSON.stringify([
    normalizeDisplayIdentity(item.character),
    normalizeDisplayIdentity(item.romaji),
    normalizeDisplayIdentity(item.meaning),
  ])}`
}

export function dedupeDictionaryCards<T extends DictionaryIdentityItem>(
  cards: readonly T[],
): T[] {
  const seen = new Set<string>()

  return cards.filter((card) => {
    const key = dictionaryItemRenderKey(card)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
