import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export function useOutsideClick<T extends HTMLElement>(callback: () => void): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [callback])

  return ref
}
