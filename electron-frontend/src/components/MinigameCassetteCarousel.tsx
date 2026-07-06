import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import type { MinigameKey } from '../types'

// A single cassette in the coverflow carousel. Kept intentionally lean — the
// cassette should read as a physical tape.
export interface CassetteItem {
  key: MinigameKey
  title: string
  description: string
  difficultyLabel: string
  difficultyLevel: 'easy' | 'medium' | 'hard'
  accuracy: number
  bestStreak: number
  locked: boolean
  lockReason: string | null
}

interface MinigameCassetteCarouselProps {
  items: CassetteItem[]
  activeGame: MinigameKey
  onSelectGame: (game: MinigameKey) => void
  onPlayGame: (game: MinigameKey) => void
}

export function MinigameCassetteCarousel({
  items,
  activeGame,
  onSelectGame,
  onPlayGame,
}: MinigameCassetteCarouselProps) {
  const startIndex = Math.max(0, items.findIndex((item) => item.key === activeGame))

  const trackRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const cassetteRefs = useRef<(HTMLElement | null)[]>([])
  const [selectedIndex, setSelectedIndex] = useState(startIndex)

  // Stable refs so callbacks never need to re-bind.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const onSelectRef = useRef(onSelectGame)
  onSelectRef.current = onSelectGame

  // Apply coverflow tween: measure each cassette's pixel offset from the
  // track's visible centre, derive scale / opacity / lift.
  const applyTween = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const trackRect = track.getBoundingClientRect()
    const centre = trackRect.left + trackRect.width / 2
    const half = trackRect.width / 2

    let centerIdx = 0
    let minT = Infinity
    const data: Array<{ t: number; offset: number; scale: number; w: number } | null> =
      slideRefs.current.map((slideEl) => {
        if (!slideEl) return null
        const r = slideEl.getBoundingClientRect()
        const o = (r.left + r.width / 2 - centre) / Math.max(half, 1)
        const t = Math.min(Math.abs(o), 1)
        if (t < minT) { minT = t; centerIdx = slideRefs.current.indexOf(slideEl) }
        return { t, offset: o, scale: 1 - t * 0.3, w: r.width }
      })

    slideRefs.current.forEach((slideEl, i) => {
      const cell = data[i]
      const cassetteEl = cassetteRefs.current[i]
      if (!slideEl || !cell || !cassetteEl) return
      const { t, offset, scale, w } = cell

      let tx = 0
      if (i === centerIdx - 1) {
        tx = -(1 - scale) * w / 2
      } else if (i === centerIdx + 1) {
        tx = (1 - scale) * w / 2
      }

      const opacity = 1 - t * 0.5
      const lift = (1 - t) * 10
      const z = Math.round((1 - t) * 90) + 10
      const origin = offset > 0 ? 'left center' : offset < 0 ? 'right center' : 'center center'

      cassetteEl.style.transformOrigin = origin
      cassetteEl.style.transform = `translate3d(${tx}px, -${lift}px, 0) scale(${scale})`
      cassetteEl.style.opacity = String(opacity)
      cassetteEl.style.zIndex = String(z)
      cassetteEl.style.setProperty('--tween-progress', (1 - t).toFixed(3))
    })
  }, [])

  // Detect which slide is closest to centre once scrolling settles.
  const settleSelection = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const trackRect = track.getBoundingClientRect()
    const centre = trackRect.left + trackRect.width / 2
    let bestIdx = selectedIndex
    let bestDist = Infinity

    slideRefs.current.forEach((slideEl, i) => {
      if (!slideEl) return
      const slideRect = slideEl.getBoundingClientRect()
      const dist = Math.abs(slideRect.left + slideRect.width / 2 - centre)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    })

    if (bestIdx !== selectedIndex) {
      setSelectedIndex(bestIdx)
      const item = itemsRef.current[bestIdx]
      if (item) onSelectRef.current(item.key)
    }
  }, [selectedIndex])

  // Scroll event: tween every frame, debounce settle check.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    let settleTimer: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      applyTween()
      clearTimeout(settleTimer)
      settleTimer = setTimeout(settleSelection, 120)
    }

    track.addEventListener('scroll', handleScroll, { passive: true })
    requestAnimationFrame(applyTween)

    return () => {
      track.removeEventListener('scroll', handleScroll)
      clearTimeout(settleTimer)
    }
  }, [applyTween, settleSelection])

  // Scroll to startIndex on mount / when items change.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const slide = slideRefs.current[startIndex]
    if (slide) {
      const trackRect = track.getBoundingClientRect()
      const slideRect = slide.getBoundingClientRect()
      const offset = slideRect.left - trackRect.left - trackRect.width / 2 + slideRect.width / 2
      track.scrollLeft = track.scrollLeft + offset
      setSelectedIndex(startIndex)
    }
  }, [items, startIndex])

  const scrollBy = useCallback((dir: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    const slide = slideRefs.current[0]
    if (!slide) return
    const slideWidth = slide.getBoundingClientRect().width + 14 // gap
    track.scrollBy({ left: dir * slideWidth, behavior: 'smooth' })
  }, [])

  const scrollPrev = useCallback(() => scrollBy(-1), [scrollBy])
  const scrollNext = useCallback(() => scrollBy(1), [scrollBy])

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current
    const slide = slideRefs.current[index]
    if (!track || !slide) return
    const trackRect = track.getBoundingClientRect()
    const slideRect = slide.getBoundingClientRect()
    const offset = slideRect.left - trackRect.left - trackRect.width / 2 + slideRect.width / 2
    track.scrollBy({ left: offset, behavior: 'smooth' })
  }, [])

  const handleCassetteClick = useCallback((idx: number, item: CassetteItem) => {
    if (item.locked) {
      scrollToIndex(idx)
      return
    }
    if (idx === selectedIndex) {
      onPlayGame(item.key)
      return
    }
    setSelectedIndex(idx)
    onSelectGame(item.key)
    scrollToIndex(idx)
  }, [selectedIndex, onPlayGame, onSelectGame, scrollToIndex])

  const selected = items[selectedIndex]

  // Keyboard: ← → to navigate, Enter/Space to launch focused
  const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrollPrev() }
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollNext() }
    if ((e.key === 'Enter' || e.key === ' ') && selected && !selected.locked) {
      e.preventDefault()
      onPlayGame(selected.key)
    }
  }, [scrollPrev, scrollNext, selected, onPlayGame])

  // Set slide refs
  const setSlideRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    slideRefs.current[index] = el
    if (el) {
      cassetteRefs.current[index] = el.querySelector('.cassette') as HTMLElement
    }
  }, [])

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="cassette-carousel"
      role="group"
      aria-label="Minigame selector"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="cassette-nav cassette-nav-prev"
        onClick={scrollPrev}
        aria-label="Previous minigame"
        tabIndex={-1}
      >
        <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
      </button>

      <div className="cassette-viewport" ref={trackRef}>
        {items.map((item, idx) => {
          const isSelected = idx === selectedIndex
          return (
            <div className="cassette-slide" key={item.key} ref={setSlideRef(idx)}>
              <button
                type="button"
                className={`cassette cassette--${item.difficultyLevel}${isSelected ? ' is-selected' : ''}${item.locked ? ' is-locked' : ''}`}
                aria-label={
                  item.locked
                    ? `${item.title} is locked`
                    : isSelected
                      ? `Launch ${item.title}`
                      : `Focus ${item.title}`
                }
                aria-pressed={isSelected}
                onClick={() => handleCassetteClick(idx, item)}
              >
                <span className="cassette-screw cassette-screw-tl" aria-hidden="true" />
                <span className="cassette-screw cassette-screw-tr" aria-hidden="true" />
                <span className="cassette-screw cassette-screw-bl" aria-hidden="true" />
                <span className="cassette-screw cassette-screw-br" aria-hidden="true" />

                <span className="cassette-label">
                  <span className="cassette-brand">JPLEARN · SIDE A</span>
                  <span className="cassette-title">{item.title}</span>
                  <span className="cassette-lines" aria-hidden="true" />
                </span>

                <span className="cassette-window" aria-hidden="true">
                  <span className="cassette-reel"><span className="cassette-reel-hub" /></span>
                  <span className="cassette-tape" />
                  <span className="cassette-reel"><span className="cassette-reel-hub" /></span>
                </span>

                <span className="cassette-base" aria-hidden="true">
                  <span className="cassette-hole" />
                  <span className="cassette-hole" />
                  <span className="cassette-hole" />
                  <span className="cassette-hole" />
                  <span className="cassette-hole" />
                </span>

                {item.locked ? (
                  <span className="cassette-lock" aria-hidden="true">
                    <Lock size={20} strokeWidth={2} />
                  </span>
                ) : null}
              </button>

              {isSelected ? (
                <span className="cassette-reflect" aria-hidden="true" />
              ) : null}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="cassette-nav cassette-nav-next"
        onClick={scrollNext}
        aria-label="Next minigame"
        tabIndex={-1}
      >
        <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
      </button>

    </div>
  )
}
