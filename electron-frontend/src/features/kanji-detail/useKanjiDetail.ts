import { useCallback, useEffect, useState } from 'react'
import { KANJI_DETAIL_COPY } from './constants'
import type { KanjiDetailRequestState } from './types'

function isOfflineDataUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /offline dictionary|not installed|outdated|re-download/i.test(message)
}

export function useKanjiDetail(character: string) {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState<KanjiDetailRequestState>({
    status: 'loading',
    message: KANJI_DETAIL_COPY.loading,
  })

  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    let active = true
    setState({ status: 'loading', message: KANJI_DETAIL_COPY.loading })

    const getKanjiDetail = window.jplearnDesktop?.getKanjiDetail
    if (!getKanjiDetail) {
      setState({ status: 'unavailable', message: KANJI_DETAIL_COPY.unavailable })
      return () => {
        active = false
      }
    }

    void getKanjiDetail(character)
      .then((detail) => {
        if (active) setState({ status: 'ready', detail })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: isOfflineDataUnavailable(error) ? 'unavailable' : 'error',
          message: isOfflineDataUnavailable(error)
            ? KANJI_DETAIL_COPY.unavailable
            : KANJI_DETAIL_COPY.error,
        })
      })

    return () => {
      active = false
    }
  }, [character, requestVersion])

  return { ...state, retry }
}
