import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ANSWERABLE_ROUTES, LOOKUP_DEBOUNCE_MS } from './constants'
import type {
  KanjiAnswer, LookupAnswers, LookupController, LookupRouteKey, PhraseAnswer, WordAnswer,
} from './types'
import { inferRoute, isSingleKanji, loadLookupHistory, rememberLookup } from './utils'

const IDLE: LookupAnswers = {
  kanji: { status: 'idle', detail: null, reason: null },
  word: { status: 'idle', source: null, results: [], reason: null },
  phrase: { status: 'idle', sentence: null, reason: null },
}

/* Electron wraps anything the main process throws as
   `Error invoking remote method 'study:search-dictionary': Error: <the real one>`, which is a
   sentence about IPC rather than about Japanese. The wrapper is peeled off before anyone sees it. */
const reason = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error)
  const unwrapped = raw.replace(/^Error invoking remote method '[^']*':\s*/i, '')
  return unwrapped.replace(/^(Error|Exception):\s*/i, '').trim() || raw
}

/* The offline dictionary is an optional download, and the bridge says so by raising rather than
   by returning nothing. That distinction is the whole point of the `unavailable` status, so it is
   recognised here rather than flattened into a generic failure. */
const isMissingDictionary = (message: string): boolean =>
  /not installed|not available|no dictionary|index is missing/i.test(message)

/* and when it IS the missing download, the overlay says the useful thing rather than the raised
   thing -- this is the fact that connects the two doors: `,` is where you fix it */
const MISSING_DICTIONARY = 'The offline dictionary is not installed — add it from Settings (,)'

export function useLookup(): LookupController {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [answers, setAnswers] = useState<LookupAnswers>(IDLE)
  const [busy, setBusy] = useState(false)
  const [routeOverride, setRouteOverride] = useState<LookupRouteKey | null>(null)
  const historyRef = useRef<string[]>([])
  /* every in-flight batch carries the id it was started with; a stale batch drops its results
     rather than overwriting the answers to a newer query */
  const requestIdRef = useRef(0)

  useEffect(() => {
    historyRef.current = loadLookupHistory()
  }, [])

  const activeRoute: LookupRouteKey = routeOverride ?? inferRoute(query)

  const open = useCallback((seed = '') => {
    setIsOpen(true)
    setRouteOverride(null)
    setQuery(seed.trim())
    if (!seed.trim()) setAnswers(IDLE)
  }, [])

  const close = useCallback(() => {
    requestIdRef.current += 1
    setIsOpen(false)
    setBusy(false)
    setRouteOverride(null)
  }, [])

  const stepRoute = useCallback((direction: 1 | -1) => {
    setRouteOverride((current) => {
      const from = current ?? inferRoute(query)
      const at = ANSWERABLE_ROUTES.indexOf(from)
      const next = (at + direction + ANSWERABLE_ROUTES.length) % ANSWERABLE_ROUTES.length
      return ANSWERABLE_ROUTES[next]
    })
  }, [query])

  useEffect(() => {
    if (!isOpen) return
    const trimmed = query.trim()
    if (!trimmed) {
      setAnswers(IDLE)
      setBusy(false)
      return
    }

    const id = ++requestIdRef.current
    const live = () => requestIdRef.current === id
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true)
        setAnswers({
          kanji: { status: isSingleKanji(trimmed) ? 'searching' : 'idle', detail: null, reason: null },
          word: { status: 'searching', source: null, results: [], reason: null },
          phrase: { status: 'searching', sentence: null, reason: null },
        })

        const api = window.jplearnDesktop

        /* SEQUENTIALLY, AND THAT IS NOT AN OVERSIGHT. The Python bridge handles one request at a
           time and a request that times out tears down and rejects every other one in flight, so
           firing three at once would make a slow dictionary look like three broken routes. The
           route the query actually asked for goes first, so the answer that matters arrives
           first. */
        const order: LookupRouteKey[] = isSingleKanji(trimmed)
          ? ['kanji', 'word', 'phrase']
          : ['word', 'phrase']

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
            let next: WordAnswer
            if (!api?.searchDictionary) {
              next = { status: 'unavailable', source: null, results: [], reason: 'The desktop bridge is not available.' }
            } else {
              try {
                const payload = await api.searchDictionary(trimmed)
                const results = payload?.results ?? []
                next = results.length
                  ? { status: 'ready', source: payload.source, results, reason: null }
                  : { status: 'empty', source: payload?.source ?? null, results: [], reason: 'Nothing matched.' }
              } catch (error) {
                const message = reason(error)
                const missing = isMissingDictionary(message)
                next = {
                  status: missing ? 'unavailable' : 'error',
                  source: null,
                  results: [],
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
  }, [isOpen, query])

  return useMemo<LookupController>(() => ({
    isOpen, open, close, query, setQuery, activeRoute, setActiveRoute: setRouteOverride,
    stepRoute, answers, busy,
  }), [isOpen, open, close, query, activeRoute, stepRoute, answers, busy])
}
