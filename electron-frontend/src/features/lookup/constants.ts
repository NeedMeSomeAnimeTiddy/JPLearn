import type { LookupRoute, LookupRouteKey } from './types'

/* FIVE COMMANDS, ONE FIELD. Five doors is four too many for a thing you reach mid-sentence, so
   there is one field and the route is inferred -- and the routes are drawn along the foot so the
   inference is never a guess you have to make.

   THE LAST TWO ANSWER WHEN THEIR MODEL CAN. This used to say they were named and never walked
   through -- "a lookup, not a conversation". Robbie chose option A on the tools card
   (`design-system/components/tools.html`, plates 8a-8c): chat and image translation fold into this
   overlay and the tutor pop-up retires. `assistant-chat` answers while Chat with Tutor is on in
   Settings and a tutor model is installed (the runtime starts it on the first question),
   `assistant-chat-ocr` while image translation is installed; otherwise both stay drawn, dimmed, and
   say what is missing and the one place to fix it -- a door that disappears reads as a feature the
   app lacks. */
export const LOOKUP_ROUTES: readonly LookupRoute[] = [
  { key: 'kanji', en: 'ONE KANJI', jp: '漢字', command: 'kanji-detail' },
  { key: 'word', en: 'A WORD', jp: '辞書', command: 'dictionary-search' },
  { key: 'phrase', en: 'A PHRASE', jp: '例文', command: 'lookup-sentence' },
  { key: 'tutor', en: 'A QUESTION', jp: '質問', command: 'assistant-chat', needsModel: true },
  { key: 'ocr', en: 'A SCREENSHOT', jp: '画像', command: 'assistant-chat-ocr', needsModel: true },
] as const

/** the routes that answer with no model at all, in the order they are asked */
export const ANSWERABLE_ROUTES: readonly LookupRouteKey[] = ['kanji', 'word', 'phrase'] as const

/* A LONG REPLY PAGES, IT DOES NOT SCROLL. The answer area is about 740 wide and five lines of
   13px type tall above the pager, which is roughly this many characters of the tutor's prose.
   shortcut: a character budget, not a measured box -- a reply heavy in wide glyphs can run a line
   long; measure the answer area with a layout pass if that ever shows. */
export const LOOKUP_REPLY_PAGE_CHARS = 460

/** the English under the lines has two or three lines of its own before it pages */
export const LOOKUP_OCR_EN_CHARS = 200

/** OCR lines the answer area holds beside the image; the rest fold to a count */
export const LOOKUP_OCR_LINES = 4

/* WHY A MODEL ROUTE IS DIMMED, AND THE ONE PLACE TO FIX IT. Each state names one fix, at the
   settings location that has it (Settings › Assistant holds Tutor Assistant, Tutor models and Image
   Translation), so the sheet never gives two instructions that disagree. */
const WITHOUT = 'The first three routes answer without it.'
export const LOOKUP_GATE_COPY = {
  chatNoRuntime: { reason: 'Chat with the tutor is not part of this build.', help: WITHOUT },
  chatOff: {
    reason: 'Chat with Tutor is turned off.',
    help: `Turn it on in Settings › Assistant › Tutor Assistant. ${WITHOUT}`,
  },
  chatNoModel: {
    reason: 'No tutor model is installed.',
    help: `Download one in Settings › Assistant › Tutor models. ${WITHOUT}`,
  },
  ocrNoRuntime: { reason: 'Image Translation is not part of this build.', help: WITHOUT },
  ocrNotInstalled: {
    reason: 'Image Translation is not installed.',
    help: `Install it in Settings › Assistant › Image Translation. ${WITHOUT}`,
  },
} as const

export const LOOKUP_COPY = {
  chatNoModelTitle: 'This route needs the tutor model.',
  ocrNoModelTitle: 'This route needs image translation.',
  /* what the gate checks, said as the gate checks it: installed and switched on, not "running" --
     the runtime starts the model on the first question */
  chatDimmed: 'A QUESTION IS DIMMED UNTIL A TUTOR MODEL IS INSTALLED AND CHAT WITH TUTOR IS ON',
  ocrDimmed: 'A SCREENSHOT IS DIMMED UNTIL IMAGE TRANSLATION IS INSTALLED',
  wordPlaceholder: 'a kanji, a word, a phrase',
  chatPlaceholder: 'ask the tutor a question',
  ocrPlaceholder: 'pick an image (Enter), paste one (Ctrl+V) or drop one here',
  notAnImage: 'is not an image. Pick, paste or drop a PNG, JPEG or WEBP.',
  chatEmpty: 'Ask the tutor anything about Japanese or your study. Enter sends it; the model runs on this device.',
  ocrEmpty: 'Pick a file, paste a screenshot, or drop an image here. The Japanese is read off it and translated as a whole.',
} as const

/* Long enough that typing a three-kanji word does not fire three searches, short enough that it
   still feels like the answer was already there. The bridge is serial, so every wasted request
   delays the one that matters. */
export const LOOKUP_DEBOUNCE_MS = 180

/** how many word results the sheet has room for before it starts hiding them */
export const LOOKUP_WORD_LIMIT = 4

export const LOOKUP_HISTORY_KEY = 'jplearn.lookup.history'
export const LOOKUP_HISTORY_LIMIT = 12
