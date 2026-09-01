import { useEffect, useRef, useState } from 'react'
import type { BlockInfo, DeckSlugInput } from '../../types'
import { DEFAULT_GATE } from './deck'

/* ==================================================================================================
   ONE COMMAND, AND DELIBERATELY NOT `loadScriptCards`.

   App already fetches `block-progress` for the deck a session is standing on — but it does it inside
   `loadScriptCards`, which also pulls `deck-cards` and resets the session. Drawing six block names
   for kanji N1 would mean loading two thousand cards with their distractor rankings and throwing
   away whatever the learner had open. The menu is a reader; it asks the one command it needs.

   THE ANSWER THAT LANDS LATE MUST NOT PAINT. Walking two milestones quickly puts two requests in
   flight against a strictly serial bridge, and the second screen would take the first answer.
   `wantedRef` is the same guard `useVocabFeed` uses, for the same reason.
   ================================================================================================== */

export interface DeckBlocks {
  blocks: BlockInfo[]
  /** the gate the backend applied, 0..1 */
  gate: number
  loading: boolean
  /** set when the bridge refused; the screen says so rather than drawing an empty deck */
  error: string | null
}

const EMPTY: DeckBlocks = { blocks: [], gate: DEFAULT_GATE, loading: false, error: null }

export function useDeckBlocks(slug: DeckSlugInput | null): DeckBlocks {
  const [state, setState] = useState<DeckBlocks>(EMPTY)
  const wantedRef = useRef<string | null>(slug)

  useEffect(() => {
    wantedRef.current = slug
    if (!slug) { setState(EMPTY); return }

    const api = window.jplearnDesktop?.getBlockProgress
    if (!api) { setState({ ...EMPTY, error: 'This build cannot read block progress.' }); return }

    setState((previous) => ({ ...previous, loading: true, error: null }))
    api(slug)
      .then((payload) => {
        if (wantedRef.current !== slug) return
        setState({
          blocks: payload.blocks ?? [],
          /* an older build answers without the field; `??` rather than `||` so a real 0 survives */
          gate: payload.unlock_threshold ?? DEFAULT_GATE,
          loading: false,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (wantedRef.current !== slug) return
        setState({
          ...EMPTY,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }, [slug])

  return state
}
