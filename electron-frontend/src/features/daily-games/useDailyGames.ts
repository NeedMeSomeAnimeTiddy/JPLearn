import { useCallback, useEffect, useState } from 'react'
import type { DailyGamesDependencies, DailyGamesSessionDependencies, DailyGamesState } from './types'
import { DAILY_GAMES_COPY } from './constants'
import { toLocalDay } from './utils'

const defaultDependencies: DailyGamesDependencies = {
  getState: async (day) => {
    const getDailyGamesState = window.jplearnDesktop?.getDailyGamesState
    if (!getDailyGamesState) throw new Error(DAILY_GAMES_COPY.unavailable)
    return getDailyGamesState(day)
  },
  createPracticeSeed: async (payload) => {
    const createDailyGamesPracticeSeed = window.jplearnDesktop?.createDailyGamesPracticeSeed
    if (!createDailyGamesPracticeSeed) throw new Error(DAILY_GAMES_COPY.gameUnavailable)
    return createDailyGamesPracticeSeed(payload)
  },
  recordAttempt: async (payload) => {
    const recordDailyGamesAttempt = window.jplearnDesktop?.recordDailyGamesAttempt
    if (!recordDailyGamesAttempt) throw new Error(DAILY_GAMES_COPY.gameUnavailable)
    return recordDailyGamesAttempt(payload)
  },
  now: () => new Date(),
}

const defaultCrosswordClueDependencies = {
  getCachedClues: async (day: string): Promise<unknown> => window.jplearnDesktop?.getDailyGamesCrosswordClues?.(day),
  saveCachedClues: async (day: string, clues: Array<{ poolPosition: number; clue: string }>): Promise<unknown> => window.jplearnDesktop?.saveDailyGamesCrosswordClues?.(day, clues),
  generateClues: async (entries: Array<{ poolPosition: number; answer: string; fallbackClue: string }>): Promise<unknown> => {
    const response = await window.jplearnDesktop?.generateDailyGamesCrosswordClues?.(entries)
    return response?.text ?? null
  },
}

export function getDefaultDailyGamesDependencies(): DailyGamesDependencies {
  return defaultDependencies
}

export function getDefaultDailyGamesSessionDependencies(): DailyGamesSessionDependencies {
  return {
    ...defaultDependencies,
    clipboard: {
      writeText: async (value) => {
        if (!navigator.clipboard) throw new Error(DAILY_GAMES_COPY.shareFailure)
        await navigator.clipboard.writeText(value)
      },
    },
    crosswordClues: defaultCrosswordClueDependencies,
  }
}

export function useDailyGames(dependencies: DailyGamesDependencies = defaultDependencies): DailyGamesState {
  const [data, setData] = useState<DailyGamesState['data']>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState<DailyGamesState['mode']>('daily')
  const [request, setRequest] = useState(0)
  const [day, setDay] = useState(() => toLocalDay(dependencies.now()))

  const retry = useCallback(() => setRequest((current) => current + 1), [])
  const replaceData = useCallback((next: NonNullable<DailyGamesState['data']>) => {
    if (next.pool.day === toLocalDay(dependencies.now())) setData(next)
  }, [dependencies])

  useEffect(() => {
    let timeout: number | undefined
    const scheduleRefresh = (): void => {
      const now = dependencies.now()
      const nextMidnight = new Date(now)
      nextMidnight.setHours(24, 0, 0, 0)
      timeout = window.setTimeout(() => {
        setDay(toLocalDay(dependencies.now()))
        scheduleRefresh()
      }, nextMidnight.getTime() - now.getTime())
    }
    scheduleRefresh()
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [dependencies])

  useEffect(() => {
    let active = true
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const next = await dependencies.getState(day)
        if (active) setData(next)
      } catch (caught) {
        if (active) {
          setData(null)
          setError(caught instanceof Error && caught.message ? caught.message : DAILY_GAMES_COPY.unavailable)
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [day, dependencies, request])

  return { data, error, isLoading, mode, retry, setMode, replaceData }
}
