export { LookupOverlay } from './components/LookupOverlay'
export { useLookup } from './useLookup'
export { LOOKUP_ROUTES, ANSWERABLE_ROUTES } from './constants'
export { inferRoute, isKanji, isSingleKanji, isTypingTarget, kanjiIn } from './utils'
export type {
  KanjiAnswer, LookupAnswers, LookupController, LookupRoute, LookupRouteKey, LookupStatus,
  PhraseAnswer, WordAnswer,
} from './types'
