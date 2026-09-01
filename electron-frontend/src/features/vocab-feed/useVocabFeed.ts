import { useCallback, useEffect, useRef, useState } from 'react'

import type { VocabFeed, VocabFeedWord } from './types'

/** The five levels that are fed rather than unlocked, mirroring `_VOCAB_LEVEL_SLUGS`. */
const FED_SLUGS = new Set(['vocab_n5', 'vocab_n4', 'vocab_n3', 'vocab_n2', 'vocab_n1'])

export function isFedDeck(slug: string): boolean {
  return FED_SLUGS.has(slug)
}

const EMPTY: Omit<VocabFeed, 'setBudget'> = {
  words: [], budget: 0, total: 0, readable: 0, knownKanji: 0, started: 0,
  loading: false, error: null,
}

/**
 * Today's words for a vocabulary level.
 *
 * The vocabulary levels stopped being cut into blocks, so they have no chunk to choose —
 * they have a running order and a daily budget. This is the hook that asks for it.
 *
 * IT ANSWERS NOTHING FOR A DECK THAT STILL HAS BLOCKS, deliberately: kanji, kana, grammar
 * and sentences are unlocked one block at a time and `useBlockSelection` already owns
 * them. Asking the bridge for a feed on one of those is an error there, and a hook that
 * fired it anyway would turn a correct refusal into a console full of them.
 */
export function useVocabFeed(deckSlug: string): VocabFeed {
  const [state, setState] = useState<Omit<VocabFeed, 'setBudget'>>(EMPTY)
  /* The slug this request was for. A fetch that lands after the learner has moved to
     another deck must not paint — the same reason `blockProgressInFlightRef` exists. */
  const wantedRef = useRef(deckSlug)

  const load = useCallback((slug: string, count?: number) => {
    wantedRef.current = slug
    if (!isFedDeck(slug)) { setState(EMPTY); return }
    const api = window.jplearnDesktop?.getVocabFeed
    if (!api) { setState({ ...EMPTY, error: 'This build has no vocabulary feed.' }); return }

    setState((prev) => ({ ...prev, loading: true, error: null }))
    api(slug as never, count)
      .then((payload) => {
        if (wantedRef.current !== slug) return
        setState({
          words: payload.words as VocabFeedWord[],
          budget: payload.budget,
          total: payload.total,
          readable: payload.readable,
          knownKanji: payload.known_kanji,
          started: payload.started,
          loading: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (wantedRef.current !== slug) return
        setState({ ...EMPTY, error: err instanceof Error ? err.message : String(err) })
      })
  }, [])

  useEffect(() => { load(deckSlug) }, [deckSlug, load])

  const setBudget = useCallback((count: number) => {
    const slug = deckSlug
    const api = window.jplearnDesktop?.setVocabFeedBudget
    if (!isFedDeck(slug) || !api) return
    setState((prev) => ({ ...prev, loading: true }))
    api(count, slug as never)
      .then((payload) => {
        if (wantedRef.current !== slug) return
        /* The setter answers with the feed itself, so this does not have to refetch --
           and must not, or a second round trip can race the first and repaint the old
           budget over the new one. */
        setState({
          words: payload.words as VocabFeedWord[],
          budget: payload.budget,
          total: payload.total,
          readable: payload.readable,
          knownKanji: payload.known_kanji,
          started: payload.started,
          loading: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (wantedRef.current !== slug) return
        setState((prev) => ({
          ...prev, loading: false,
          error: err instanceof Error ? err.message : String(err),
        }))
      })
  }, [deckSlug])

  return { ...state, setBudget }
}
