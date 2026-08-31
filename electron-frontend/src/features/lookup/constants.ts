import type { LookupRoute, LookupRouteKey } from './types'

/* FIVE COMMANDS, ONE FIELD. Five doors is four too many for a thing you reach mid-sentence, so
   there is one field and the route is inferred -- and the routes are drawn along the foot so the
   inference is never a guess you have to make.

   THE LAST TWO ARE NAMED AND NOT WALKED THROUGH. `assistant-chat` and `assistant-chat-ocr` need a
   model running; this overlay is a lookup, not a conversation, and pretending otherwise would be
   drawing a machine that may not be plugged in. They are listed because leaving them out would
   imply the app cannot do them. */
export const LOOKUP_ROUTES: readonly LookupRoute[] = [
  { key: 'kanji', en: 'ONE KANJI', jp: '漢字', command: 'kanji-detail' },
  { key: 'word', en: 'A WORD', jp: '辞書', command: 'dictionary-search' },
  { key: 'phrase', en: 'A PHRASE', jp: '例文', command: 'lookup-sentence' },
  { key: 'tutor', en: 'A QUESTION', jp: '質問', command: 'assistant-chat', needsModel: true },
  { key: 'ocr', en: 'A SCREENSHOT', jp: '画像', command: 'assistant-chat-ocr', needsModel: true },
] as const

/** the routes this overlay actually asks, in the order it asks them */
export const ANSWERABLE_ROUTES: readonly LookupRouteKey[] = ['kanji', 'word', 'phrase'] as const

/* Long enough that typing a three-kanji word does not fire three searches, short enough that it
   still feels like the answer was already there. The bridge is serial, so every wasted request
   delays the one that matters. */
export const LOOKUP_DEBOUNCE_MS = 180

/** how many word results the sheet has room for before it starts hiding them */
export const LOOKUP_WORD_LIMIT = 4

export const LOOKUP_HISTORY_KEY = 'jplearn.lookup.history'
export const LOOKUP_HISTORY_LIMIT = 12
