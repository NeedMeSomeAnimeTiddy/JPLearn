import { useCallback, useState } from 'react'

export function useLocalStorage<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValueState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  })

  const setValue = useCallback(
    (newValue: T) => {
      setValueState(newValue)
      try {
        window.localStorage.setItem(key, JSON.stringify(newValue))
      } catch {
        // Non-fatal: write failures do not break UI state.
      }
    },
    [key],
  )

  return [value, setValue]
}
