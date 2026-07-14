import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Passage, ReaderSettings, PassageProgressEntry } from './types'
import { DEFAULT_READER_SETTINGS } from './constants'
import { sortByDifficulty } from './utils'

export interface UsePassagesReturn {
  passages: Passage[]
  loading: boolean
  error: string | null
  selectedPassage: Passage | null
  readerSettings: ReaderSettings
  progress: Map<string, PassageProgressEntry>
  selectPassage: (passage: Passage) => void
  clearSelection: () => void
  setFuriganaVisible: (visible: boolean) => void
  setFontSize: (size: ReaderSettings['fontSize']) => void
  markProgress: (passageId: string, status: PassageProgressEntry['status']) => void
  retry: () => void
}

export function usePassages(): UsePassagesReturn {
  const [passages, setPassages] = useState<Passage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPassage, setSelectedPassage] = useState<Passage | null>(null)
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS)
  const [progress, setProgress] = useState<Map<string, PassageProgressEntry>>(new Map())
  const [fetchKey, setFetchKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fn = window.jplearnDesktop?.getPassages
      if (!fn) {
        setError('Passages API not available (not running in Electron)')
        setLoading(false)
        return
      }
      const result = await fn()
      setPassages(result.passages as Passage[])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to load passages: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, fetchKey])

  const retry = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  const sortedPassages = useMemo(() => sortByDifficulty(passages), [passages])

  const selectPassage = useCallback((passage: Passage) => {
    setSelectedPassage(passage)
    setProgress((prev) => {
      const next = new Map(prev)
      const existing = next.get(passage.id)
      if (!existing || existing.status === 'not-started') {
        next.set(passage.id, { passageId: passage.id, status: 'in-progress', lastPosition: 0, completedAt: null })
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedPassage(null)
  }, [])

  const setFuriganaVisible = useCallback((visible: boolean) => {
    setReaderSettings((prev) => ({ ...prev, furiganaVisible: visible }))
  }, [])

  const setFontSize = useCallback((size: ReaderSettings['fontSize']) => {
    setReaderSettings((prev) => ({ ...prev, fontSize: size }))
  }, [])

  const markProgress = useCallback((passageId: string, status: PassageProgressEntry['status']) => {
    setProgress((prev) => {
      const next = new Map(prev)
      const existing = next.get(passageId)
      next.set(passageId, {
        ...existing,
        passageId,
        status,
        completedAt: status === 'completed' ? new Date().toISOString() : existing?.completedAt ?? null,
        lastPosition: existing?.lastPosition ?? 0,
      })
      return next
    })
  }, [])

  return {
    passages: sortedPassages,
    loading,
    error,
    selectedPassage,
    readerSettings,
    progress,
    selectPassage,
    clearSelection,
    setFuriganaVisible,
    setFontSize,
    markProgress,
    retry,
  }
}
