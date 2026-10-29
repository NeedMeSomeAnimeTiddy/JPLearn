import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ANSWERABLE_ROUTES, LOOKUP_DEBOUNCE_MS, MISSING_DICTIONARY } from './constants'
import type {
  KanjiAnswer, LookupAnswers, LookupController, LookupRouteKey, LookupWordItem, PhraseAnswer, WordAnswer,
} from './types'
import { inferRoute, isMissingDictionary, isSingleKanji, loadLookupHistory, rememberLookup } from './utils'
import { ipcErrorReason } from '../../lib/ipcErrorReason'
import { guessKanaFromRomaji, searchCards } from '../../lib/dictionarySearch'
import type { SearchableCard } from '../../lib/dictionarySearch'
import { dedupeDictionaryCards } from '../card-notes/utils'
import type { PitchAccent } from '../../generated/types'

const IDLE: LookupAnswers = {
  kanji: { status: 'idle', detail: null, reason: null },
  word: { status: 'idle', source: null, results: [], reason: null },
  phrase: { status: 'idle', sentence: null, reason: null },
}

/* the IPC wrapper is a sentence about Electron rather than about Japanese, so it is peeled off */
const reason = ipcErrorReason

/** a card from the learner's decks, as the panel is handed them */
export interface LookupCard extends SearchableCard {
  id: number
  note_key?: string
  source_id?: string | null
  pitch_accents?: PitchAccent[]
  dictionary_summary?: { pitch_accents: PitchAccent[] } | null
}

function cardAsWordItem(card: LookupCard): LookupWordItem {
  return {
    id: card.id,
    source_id: card.source_id ?? null,
    note_key: card.note_key ?? '',
    character: card.character,
    romaji: card.romaji,
    meaning: card.meaning,
    tags: card.tags ?? [],
    example_sentence: card.example_sentence ?? null,
    pitch_accents: card.pitch_accents ?? card.dictionary_summary?.pitch_accents ?? [],
  }
}

/** `cards` is the collection the Dictionary panel searches, so A WORD finds what the panel finds */
export function useLookup(cards: readonly LookupCard[] = []): LookupController {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [answers, setAnswers] = useState<LookupAnswers>(IDLE)
  const [busy, setBusy] = useState(false)
  const [routeOverride, setRouteOverride] = useState<LookupRouteKey | null>(null)
  const historyRef = useRef<string[]>([])
  /* every in-flight batch carries the id it was started with; a stale batch drops its results
     rather than overwriting the answers to a newer query */
  const requestIdRef = useRef(0)
  /* read when a batch runs, not a reason to run one: a deck loading in the background does not
     re-ask the bridge about what is already on screen */
  const cardsRef = useRef(cards)
  useEffect(() => { cardsRef.current = cards }, [cards])

  useEffect(() => {
    historyRef.current = loadLookupHistory()
  }, [])

  const activeRoute: LookupRouteKey = routeOverride ?? inferRoute(query)
  /* THE DICTIONARY IS ASKED ONLY WHERE ITS ANSWER IS DRAWN. A question for the tutor or a screenshot
     would otherwise put a dictionary search and a sentence search in the serial bridge ahead of
     the next thing that matters. One kanji is still asked about on any route. */
  const dictionaryRoute = activeRoute === 'word' || activeRoute === 'phrase'

  const open = useCallback((seed = '', route?: LookupRouteKey) => {
    setIsOpen(true)
    setRouteOverride(route ?? null)
    setQuery(seed.trim())
    if (!seed.trim()) setAnswers(IDLE)
  }, [])

  const close = useCallback(() => {
    requestIdRef.current += 1
    setIsOpen(false)
    setBusy(false)
    setRouteOverride(null)
  }, [])

  const stepRoute = useCallback((direction: 1 | -1, routes: readonly LookupRouteKey[] = ANSWERABLE_ROUTES) => {
    setRouteOverride((current) => {
      const from = current ?? inferRoute(query)
      const at = routes.indexOf(from)
      /* standing on a route that cannot answer (a question with no model), the arrows still leave it */
      if (at < 0) return routes[direction === 1 ? 0 : routes.length - 1]
      const next = (at + direction + routes.length) % routes.length
      return routes[next]
    })
  }, [query])

  useEffect(() => {
    if (!isOpen) return
    const trimmed = query.trim()
    /* any change drops the batch in flight, clearing the field included -- a dropped batch neither
       draws its answers nor goes into the history */
    const id = ++requestIdRef.current
    const live = () => requestIdRef.current === id

    /* SEQUENTIALLY, AND THAT IS NOT AN OVERSIGHT. The Python bridge handles one request at a time,
       so firing three at once only queues them behind each other and makes the first answer wait
       for all three. The route the query actually asked for goes first, so the answer that matters
       arrives first. */
    const order: LookupRouteKey[] = [
      ...(isSingleKanji(trimmed) ? ['kanji' as const] : []),
      ...(dictionaryRoute ? ['word' as const, 'phrase' as const] : []),
    ]
    if (!trimmed || order.length === 0) {
      setAnswers(IDLE)
      setBusy(false)
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true)
        setAnswers({
          kanji: { status: order.includes('kanji') ? 'searching' : 'idle', detail: null, reason: null },
          word: { status: order.includes('word') ? 'searching' : 'idle', source: null, results: [], reason: null },
          phrase: { status: order.includes('phrase') ? 'searching' : 'idle', sentence: null, reason: null },
        })

        const api = window.jplearnDesktop

        for (const route of order) {
          if (!live()) return

          if (route === 'kanji') {
            let next: KanjiAnswer
            if (!api?.getKanjiDetail) {
              next = { status: 'unavailable', detail: null, reason: 'The desktop bridge is not available.' }
            } else {
              try {
                const detail = await api.getKanjiDetail(trimmed)
                next = detail
                  ? { status: 'ready', detail, reason: null }
                  : { status: 'empty', detail: null, reason: 'No entry for this character.' }
              } catch (error) {
                const message = reason(error)
                const missing = isMissingDictionary(message)
                next = {
                  status: missing ? 'unavailable' : 'error',
                  detail: null,
                  reason: missing ? MISSING_DICTIONARY : message,
                }
              }
            }
            if (!live()) return
            setAnswers((previous) => ({ ...previous, kanji: next }))
            continue
          }

          if (route === 'word') {
            /* THE DICTIONARY AND YOUR DECKS, as the empty state promises. The cards come first: a
               word you are learning is the answer you meant. They are told apart by the panel's
               identity, never by id alone -- two decks can number different cards the same. */
            const cardResults = dedupeDictionaryCards(searchCards(cardsRef.current, trimmed).map(cardAsWordItem))
            let next: WordAnswer
            if (!api?.searchDictionary) {
              next = {
                status: 'unavailable', source: cardResults.length ? 'loaded_cards' : null, results: cardResults,
                reason: 'The desktop bridge is not available.',
              }
            } else {
              try {
                let payload = await api.searchDictionary(trimmed)
                let found = payload?.results ?? []
                /* romaji reads as kana the second time, the way the panel reads it */
                const kana = found.length ? null : guessKanaFromRomaji(trimmed)
                if (kana) {
                  if (!live()) return
                  payload = await api.searchDictionary(kana)
                  found = payload?.results ?? []
                }
                const results = dedupeDictionaryCards([...cardResults, ...found])
                next = found.length
                  ? { status: 'ready', source: payload.source, results, reason: null }
                  : cardResults.length
                    ? { status: 'ready', source: 'loaded_cards', results, reason: null }
                    : { status: 'empty', source: payload?.source ?? null, results: [], reason: 'Nothing matched.' }
              } catch (error) {
                const message = reason(error)
                const missing = isMissingDictionary(message)
                next = {
                  status: missing ? 'unavailable' : 'error',
                  source: cardResults.length ? 'loaded_cards' : null,
                  results: cardResults,
                  reason: missing ? MISSING_DICTIONARY : message,
                }
              }
            }
            if (!live()) return
            setAnswers((previous) => ({ ...previous, word: next }))
            continue
          }

          let next: PhraseAnswer
          if (!api?.lookupSentence) {
            next = { status: 'unavailable', sentence: null, reason: 'The desktop bridge is not available.' }
          } else {
            try {
              const sentence = await api.lookupSentence({ query: trimmed })
              next = sentence?.jp
                ? { status: 'ready', sentence, reason: null }
                : { status: 'empty', sentence: null, reason: 'No sentence in the decks contains this.' }
            } catch (error) {
              next = { status: 'error', sentence: null, reason: reason(error) }
            }
          }
          if (!live()) return
          setAnswers((previous) => ({ ...previous, phrase: next }))
        }

        if (!live()) return
        setBusy(false)
        historyRef.current = rememberLookup(trimmed, historyRef.current)
      })()
    }, LOOKUP_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [isOpen, query, dictionaryRoute])

  return useMemo<LookupController>(() => ({
    isOpen, open, close, query, setQuery, activeRoute, routePinned: routeOverride !== null,
    setActiveRoute: setRouteOverride, stepRoute, answers, busy,
  }), [isOpen, open, close, query, activeRoute, routeOverride, stepRoute, answers, busy])
}
