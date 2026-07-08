import { useEffect, useState, useRef } from 'react'

interface WelcomeStepProps {
  onReveal: () => void
}

export function WelcomeStep({ onReveal }: WelcomeStepProps) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const phaseRef = useRef<'title' | 'subtitle'>('title')
  const onRevealRef = useRef(onReveal)
  onRevealRef.current = onReveal

  // Typewriter: title first, then subtitle, then reveal
  useEffect(() => {
    setTitle('')
    setSubtitle('')
    phaseRef.current = 'title'

    const titleText = 'Welcome to JPLearn'
    const subText = "Let's take two minutes to personalise your learning journey. Every answer is optional — you can always change things later."
    let i = 0
    const timer = setInterval(() => {
      if (phaseRef.current === 'title') {
        if (i <= titleText.length) {
          setTitle(titleText.slice(0, i))
          i++
          if (i > titleText.length) {
            i = 0
            phaseRef.current = 'subtitle'
          }
        }
      } else {
        if (i <= subText.length) {
          setSubtitle(subText.slice(0, i))
          i++
          if (i > subText.length) {
            clearInterval(timer)
            setTimeout(() => onRevealRef.current(), 500)
          }
        }
      }
    }, 50)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="obn-hero">
      <div className="obn-hero-badge">日本語</div>
      <h1 className="obn-hero-title">{title}</h1>
      <p className="obn-hero-subtitle">{subtitle}</p>
    </div>
  )
}
