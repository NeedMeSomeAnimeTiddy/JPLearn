import { useCallback, useEffect, useRef, useState } from 'react'
import type { WordOfDayPayload } from '../electron'

export function WordOfDayWidget() {
  const [word, setWord] = useState<WordOfDayPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetchWord = useCallback(async () => {
    if (!window.jplearnDesktop?.getWordOfDay) return
    setLoading(true)
    try {
      const data = await window.jplearnDesktop.getWordOfDay()
      if (mountedRef.current) setWord(data)
    } catch {
      if (mountedRef.current) setWord(null)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetchWord()
    return () => { mountedRef.current = false }
  }, [fetchWord])

  const reasonMap: Record<string, string> = {
    due_for_review: 'due',
    new_item: 'new',
    discovery: 'review',
  }

  if (loading) return <span className="home-bar home-bar--loading" role="status" aria-label="Loading" />
  if (!word || !word.character) return null

  return (
    <div className={`home-bar home-bar--${word.reason}`} aria-label={`Word of the Day: ${word.character} — ${word.meaning}`}>
      <span className="home-bar-label">WOTD</span>
      <span className="home-bar-char">{word.character}</span>
      <span className="home-bar-sub">({word.romaji})</span>
      <span className="home-bar-sub">{word.meaning}</span>
      <span className="home-bar-chip">{reasonMap[word.reason] || word.reason}</span>
    </div>
  )
}
