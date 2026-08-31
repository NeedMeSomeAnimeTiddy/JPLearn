import type { KanjiDetailPayload } from '../../generated/types'

/* The payload types come off the preload surface rather than being re-declared, the same trick
   DictionaryPopup uses -- these shapes are generated from Python dataclasses and hand-copies of
   them go stale silently. */
type SearchDictionaryFn = NonNullable<typeof window.jplearnDesktop.searchDictionary>
type LookupSentenceFn = NonNullable<typeof window.jplearnDesktop.lookupSentence>

export type LookupWordPayload = Awaited<ReturnType<SearchDictionaryFn>>
export type LookupWordItem = LookupWordPayload['results'][number]
export type LookupSentencePayload = Awaited<ReturnType<LookupSentenceFn>>

export type LookupRouteKey = 'kanji' | 'word' | 'phrase' | 'tutor' | 'ocr'

/** `unavailable` is not `empty`: one means the app cannot answer, the other that there is no
 *  answer. Drawing them the same way is how a missing download turns into a wrong fact. */
export type LookupStatus = 'idle' | 'searching' | 'ready' | 'empty' | 'unavailable' | 'error'

export interface LookupRoute {
  key: LookupRouteKey
  en: string
  jp: string
  /** the bridge command behind it, shown in the field so the inference is never a guess */
  command: string
  /** routes that need a running model. This overlay names them and does not walk through them. */
  needsModel?: boolean
}

export interface KanjiAnswer {
  status: LookupStatus
  detail: KanjiDetailPayload | null
  reason: string | null
}

export interface WordAnswer {
  status: LookupStatus
  source: LookupWordPayload['source'] | null
  results: LookupWordItem[]
  reason: string | null
}

export interface PhraseAnswer {
  status: LookupStatus
  sentence: LookupSentencePayload | null
  reason: string | null
}

export interface LookupAnswers {
  kanji: KanjiAnswer
  word: WordAnswer
  phrase: PhraseAnswer
}

export interface LookupController {
  isOpen: boolean
  open: (seed?: string) => void
  close: () => void
  query: string
  setQuery: (value: string) => void
  /** the route whose answer is on screen; inferred from the query, overridable with the arrows */
  activeRoute: LookupRouteKey
  setActiveRoute: (route: LookupRouteKey) => void
  stepRoute: (direction: 1 | -1) => void
  answers: LookupAnswers
  /** true while any route is still being asked */
  busy: boolean
}
