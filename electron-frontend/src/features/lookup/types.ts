import type { KanjiDetailPayload } from '../../generated/types'
import type { AssistantChatTurn, OcrWorkbenchResult } from '../tutor/types'

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
  /** opens on `seed`; `route` pins the route rather than letting the query pick it */
  open: (seed?: string, route?: LookupRouteKey) => void
  close: () => void
  query: string
  setQuery: (value: string) => void
  /** the route whose answer is on screen; inferred from the query, overridable with the arrows */
  activeRoute: LookupRouteKey
  /** true when the route was chosen rather than inferred */
  routePinned: boolean
  setActiveRoute: (route: LookupRouteKey) => void
  /** steps through `routes`, which are the ones that can answer right now */
  stepRoute: (direction: 1 | -1, routes?: readonly LookupRouteKey[]) => void
  answers: LookupAnswers
  /** true while any route is still being asked */
  busy: boolean
}

/* ==================================================================================================
   THE TWO ROUTES THAT NEED A MODEL, as the overlay sees them. The state and the calls stay in
   `features/tutor` (`useTutor`), which is what talks to `assistant-chat` and `assistant-chat-ocr`;
   App hands the overlay these two slices, so the lookup draws them without owning a second copy.
   ================================================================================================== */
export interface LookupChat {
  /** gated on Chat with Tutor in Settings › Assistant */
  enabled: boolean
  /** the app's own sentence for why it is not, shown in the no-model state */
  disabledReason: string
  turns: AssistantChatTurn[]
  loading: boolean
  error: string | null
  send: (message: string) => void
  clear: () => void
  speakingKey: string | null
  replay: (content: string, key: string) => void
  stopSpeaking: () => void
  audioEnabled: boolean
  toggleAudio: () => void
  romajiEnabled: boolean
  toggleRomaji: () => void
  /** the longest message the tutor takes */
  charLimit: number
}

export interface LookupOcr {
  /** gated on the image-translation package being installed */
  enabled: boolean
  disabledReason: string
  busy: boolean
  error: string | null
  result: OcrWorkbenchResult | null
  submit: (file: File) => void
  clear: () => void
  maxMb: number
}

export interface LookupAssistant {
  chat: LookupChat
  ocr: LookupOcr
}
