import { useState, useEffect, useRef } from 'react'

export function useTypewriter(text: string, onComplete: () => void) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    setDisplayed('')
    indexRef.current = 0
    const timer = setInterval(() => {
      indexRef.current += 1
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(timer)
        setTimeout(() => onCompleteRef.current(), 500)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [text])

  return displayed
}
