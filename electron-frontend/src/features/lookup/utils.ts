import { LOOKUP_GATE_COPY, LOOKUP_HISTORY_KEY, LOOKUP_HISTORY_LIMIT } from './constants'
import type { LookupRouteKey } from './types'

/** whether a model route can answer, and when it cannot, why and the one place to fix it */
export interface ModelGate {
  enabled: boolean
  reason: string
  help: string
}

/** the part of the setup report the gates read; null until the app has asked */
export interface GateInstallInfo {
  llamaCppInstalled: boolean
  models: ReadonlyArray<{ installed: boolean }>
  ocrInstalled?: boolean
}

/* A QUESTION ANSWERS WHEN IT CAN ACTUALLY BE ANSWERED: the build has the chat, Chat with Tutor is
   on, and llama.cpp and a tutor model are installed. Until the setup report has come back nothing
   is known to be installed, so the route waits dimmed rather than offering a field that fails. */
export function chatGate(runtime: boolean, settingOn: boolean, install: GateInstallInfo | null): ModelGate {
  if (!runtime) return { enabled: false, ...LOOKUP_GATE_COPY.chatNoRuntime }
  if (!settingOn) return { enabled: false, ...LOOKUP_GATE_COPY.chatOff }
  const installed = Boolean(install?.llamaCppInstalled && install.models.some((model) => model.installed))
  if (!installed) return { enabled: false, ...LOOKUP_GATE_COPY.chatNoModel }
  return { enabled: true, reason: '', help: '' }
}

export function ocrGate(runtime: boolean, install: GateInstallInfo | null): ModelGate {
  if (!runtime) return { enabled: false, ...LOOKUP_GATE_COPY.ocrNoRuntime }
  if (!install?.ocrInstalled) return { enabled: false, ...LOOKUP_GATE_COPY.ocrNotInstalled }
  return { enabled: true, reason: '', help: '' }
}

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
  if (isSingleKanji(query)) return 'kanji'
  /* A QUESTION IS A QUESTION MARK. Option A on the tools card infers A QUESTION from what you type;
     the narrowest reading of that is the one sign a lookup never ends in, so "school" is still a
     word and "why is it は here?" goes to the tutor. Nothing is sent until ENTER. */
  if (/[?？]\s*$/.test(query.trim())) return 'tutor'
  return 'word'
}

/** a reply cut into pages at word (or, in Japanese, character) boundaries near `budget` */
export function pageReply(text: string, budget: number): string[] {
  const clean = text.trim()
  if (!clean) return []
  const pages: string[] = []
  let rest = clean
  while (rest.length > budget) {
    const window = rest.slice(0, budget + 1)
    /* prefer the end of a sentence in the back third of the page, then a space, then a hard cut */
    const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('。'), window.lastIndexOf('! '), window.lastIndexOf('? '))
    const space = window.lastIndexOf(' ')
    let cut = sentence > budget * 0.66 ? sentence + 1 : space > budget * 0.5 ? space : budget
    if (cut <= 0) cut = budget
    pages.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pages.push(rest)
  return pages
}

/** the image in a paste or a drop, if there is one */
export function imageFileFrom(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/')) return file
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
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
