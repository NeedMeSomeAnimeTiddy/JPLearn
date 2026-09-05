import { useEffect, useRef, useState } from 'react'

/* ==================================================================================================
   WHAT THE WORD UNDER THE CURSOR MEANS.

   THE READING IS FREE AND THE MEANING IS NOT. `text_jp` annotates its own words — 高く（たかく） —
   so the cell always has a word and a reading with no round trip at all, and a lookup only ever
   adds the English. That split is what lets the prompt cell keep the design's promise of never
   being empty: a dictionary that is missing, slow or silent costs the meaning and nothing else.

   `unavailable` IS NOT `empty`, which is `lookup.css`'s own law and the reason this hook has five
   states rather than three: one says the app cannot answer and the other that there is no answer,
   and drawing them the same way turns a missing download into a wrong fact about a word. The
   offline index is a setup-time download; until it is there every word answers `unavailable`.

   THE BRIDGE IS STRICTLY SERIAL AND SHARED, so this is careful about how often it speaks: a delay
   before asking so that arrowing through a page asks about the word you stopped on rather than
   every word you passed, one request in flight at a time, and a cache so a word already asked
   about is answered without asking again.
   ================================================================================================== */

export type GlossStatus = 'idle' | 'looking' | 'ready' | 'empty' | 'unavailable' | 'error'

export interface Gloss {
  status: GlossStatus
  /** the English, when there is any */
  meaning: string | null
  /** the dictionary's own reading, which is not always the one the text printed */
  romaji: string | null
  /** why there is no meaning, in words that can go on the sheet */
  reason: string | null
}

const IDLE: Gloss = { status: 'idle', meaning: null, romaji: null, reason: null }

/** long enough that walking a page does not ask about every word on the way past */
export const GLOSS_DELAY_MS = 260

const cache = new Map<string, Gloss>()

/** exported for the tests, which must not inherit a word another test looked up */
export function clearGlossCache(): void {
  cache.clear()
}

export function useWordGloss(word: string | null): Gloss {
  const [gloss, setGloss] = useState<Gloss>(IDLE)
  /* every ask carries the number it was started with, so a slow answer to the word you have
     already walked past cannot overwrite the one you are standing on */
  const askRef = useRef(0)

  useEffect(() => {
    if (!word) { setGloss(IDLE); return }
    const cached = cache.get(word)
    if (cached) { setGloss(cached); return }

    const ask = ++askRef.current
    setGloss({ status: 'looking', meaning: null, romaji: null, reason: null })

    const timer = setTimeout(() => {
      const search = window.jplearnDesktop?.searchDictionary
      if (!search) {
        const answer: Gloss = {
          status: 'unavailable', meaning: null, romaji: null,
          reason: 'NO DICTIONARY ON THIS MACHINE',
        }
        cache.set(word, answer)
        if (askRef.current === ask) setGloss(answer)
        return
      }
      void search(word)
        .then((payload) => {
          const hit = payload?.results?.[0] ?? null
          const answer: Gloss = hit
            ? { status: 'ready', meaning: hit.meaning, romaji: hit.romaji, reason: null }
            : { status: 'empty', meaning: null, romaji: null, reason: 'NOT IN THE DICTIONARY' }
          cache.set(word, answer)
          if (askRef.current === ask) setGloss(answer)
        })
        .catch((error: unknown) => {
          /* THE MISSING DOWNLOAD IS THE COMMON CASE, not a fault: the offline index ships as a
             setup step and the bridge says so in the error it raises. It is worth telling apart
             from a dictionary that is there and broken, because only one of them is fixable by the
             person reading. */
          const detail = error instanceof Error ? error.message : String(error)
          const missing = /not installed|outdated/i.test(detail)
          const answer: Gloss = {
            status: missing ? 'unavailable' : 'error',
            meaning: null, romaji: null,
            reason: missing ? 'THE DICTIONARY IS NOT INSTALLED' : 'THE DICTIONARY DID NOT ANSWER',
          }
          /* a machine without the index will answer this way for every word, so it is worth
             remembering; a one-off failure is not */
          if (missing) cache.set(word, answer)
          if (askRef.current === ask) setGloss(answer)
        })
    }, GLOSS_DELAY_MS)

    return () => clearTimeout(timer)
  }, [word])

  return gloss
}
