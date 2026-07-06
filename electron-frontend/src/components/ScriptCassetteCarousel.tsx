import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import type { ScriptKey } from '../types'

export interface ScriptCassetteItem {
  key: ScriptKey
  title: string
  description: string
  glyph: string
  difficultyLabel: string
  difficultyLevel: 'easy' | 'medium' | 'hard'
  coveragePct: number
  locked: boolean
  lockReason: string | null
}

interface ScriptCassetteCarouselProps {
  items: ScriptCassetteItem[]
  activeScript: ScriptKey
  onSelectScript: (script: ScriptKey) => void
  onPlayScript: (script: ScriptKey) => void
}

const CLONE_COUNT = 3

export function ScriptCassetteCarousel({
  items,
  activeScript,
  onSelectScript,
  onPlayScript,
}: ScriptCassetteCarouselProps) {
  const N = items.length
  const loopedItems = useMemo(
    () => [...items.slice(-CLONE_COUNT), ...items, ...items.slice(0, CLONE_COUNT)],
    [items],
  )

  const realStartIndex = Math.max(0, items.findIndex((item) => item.key === activeScript))
  const loopedStartIndex = realStartIndex + CLONE_COUNT

  const trackRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const cassetteRefs = useRef<(HTMLElement | null)[]>([])
  const [selectedIndex, setSelectedIndex] = useState(loopedStartIndex)
  const jumpingRef = useRef(false)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const onSelectRef = useRef(onSelectScript)
  onSelectRef.current = onSelectScript

  const toReal = useCallback(
    (i: number) => ((i - CLONE_COUNT) % N + N) % N,
    [N],
  )

  const applyTween = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const trackRect = track.getBoundingClientRect()
    const centre = trackRect.left + trackRect.width / 2
    const half = trackRect.width / 2

    slideRefs.current.forEach((slideEl, i) => {
      const cassetteEl = cassetteRefs.current[i]
      if (!slideEl || !cassetteEl) return
      const slideRect = slideEl.getBoundingClientRect()
      const slideCentre = slideRect.left + slideRect.width / 2
      const offset = (slideCentre - centre) / Math.max(half, 1)
      const t = Math.min(Math.abs(offset), 1)

      const scale = 1 - t * 0.4
      const opacity = 1 - t * 0.75
      const lift = (1 - t) * 10
      const z = Math.round((1 - t) * 90) + 10

      cassetteEl.style.transform = `translate3d(0, -${lift}px, 0) scale(${scale})`
      cassetteEl.style.opacity = String(opacity)
      cassetteEl.style.zIndex = String(z)
      cassetteEl.style.setProperty('--tween-progress', (1 - t).toFixed(3))
    })
  }, [])

  const checkLoopJump = useCallback(() => {
    const track = trackRef.current
    if (!track || jumpingRef.current) return

    if (selectedIndex < CLONE_COUNT) {
      const targetIdx = selectedIndex + N
      const slide = slideRefs.current[targetIdx]
      if (slide && track) {
        jumpingRef.current = true
        track.style.scrollSnapType = 'none'
        const trackRect = track.getBoundingClientRect()
        const slideRect = slide.getBoundingClientRect()
        const offset = slideRect.left - trackRect.left - trackRect.width / 2 + slideRect.width / 2
        track.scrollLeft = track.scrollLeft + offset
        setSelectedIndex(targetIdx)
        requestAnimationFrame(() => {
          track.style.scrollSnapType = ''
          jumpingRef.current = false
        })
      }
    } else if (selectedIndex >= CLONE_COUNT + N) {
      const targetIdx = selectedIndex - N
      const slide = slideRefs.current[targetIdx]
      if (slide && track) {
        jumpingRef.current = true
        track.style.scrollSnapType = 'none'
        const trackRect = track.getBoundingClientRect()
        const slideRect = slide.getBoundingClientRect()
        const offset = slideRect.left - trackRect.left - trackRect.width / 2 + slideRect.width / 2
        track.scrollLeft = track.scrollLeft + offset
        setSelectedIndex(targetIdx)
        requestAnimationFrame(() => {
          track.style.scrollSnapType = ''
          jumpingRef.current = false
        })
      }
    }
  }, [selectedIndex, N])

  const settleSelection = useCallback(() => {
    const track = trackRef.current
    if (!track || jumpingRef.current) return
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
      const realIdx = toReal(bestIdx)
      const item = itemsRef.current[realIdx]
      if (item) onSelectRef.current(item.key)
    }

    setTimeout(() => checkLoopJump(), 50)
  }, [selectedIndex, toReal, checkLoopJump])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    let settleTimer: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      if (jumpingRef.current) return
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

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const slide = slideRefs.current[loopedStartIndex]
    if (slide) {
      const trackRect = track.getBoundingClientRect()
      const slideRect = slide.getBoundingClientRect()
      const offset = slideRect.left - trackRect.left - trackRect.width / 2 + slideRect.width / 2
      track.scrollLeft = track.scrollLeft + offset
      setSelectedIndex(loopedStartIndex)
    }
  }, [items, loopedStartIndex])

  const scrollBy = useCallback((dir: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    const slide = slideRefs.current[0]
    if (!slide) return
    const slideWidth = slide.getBoundingClientRect().width + 14
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

  const handleCassetteClick = useCallback((loopedIdx: number, item: ScriptCassetteItem) => {
    if (item.locked) {
      scrollToIndex(loopedIdx)
      return
    }
    if (loopedIdx === selectedIndex) {
      onPlayScript(item.key)
      return
    }
    setSelectedIndex(loopedIdx)
    onSelectScript(item.key)
    scrollToIndex(loopedIdx)
  }, [selectedIndex, onPlayScript, onSelectScript, scrollToIndex])

  const realSelectedIndex = toReal(selectedIndex)
  const selected = items[realSelectedIndex]

  const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrollPrev() }
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollNext() }
    if ((e.key === 'Enter' || e.key === ' ') && selected && !selected.locked) {
      e.preventDefault()
      onPlayScript(selected.key)
    }
  }, [scrollPrev, scrollNext, selected, onPlayScript])

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
      aria-label="Script deck selector"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="cassette-nav cassette-nav-prev"
        onClick={scrollPrev}
        aria-label="Previous deck"
        tabIndex={-1}
      >
        <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
      </button>

      <div className="cassette-viewport" ref={trackRef}>
        {loopedItems.map((item, loopedIdx) => {
          const isSelected = loopedIdx === selectedIndex
          return (
            <div className="cassette-slide" key={`${item.key}-${loopedIdx}`} ref={setSlideRef(loopedIdx)}>
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
                onClick={() => handleCassetteClick(loopedIdx, item)}
              >
                <span className="cassette-screw cassette-screw-tl" aria-hidden="true" />
                <span className="cassette-screw cassette-screw-tr" aria-hidden="true" />
                <span className="cassette-screw cassette-screw-bl" aria-hidden="true" />
                <span className="cassette-screw cassette-screw-br" aria-hidden="true" />

                <span className="cassette-label">
                  <span className="cassette-brand">JPLEARN · DECK</span>
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
        aria-label="Next deck"
        tabIndex={-1}
      >
        <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {selected ? (
        <div className="cassette-info">
          <span className="cassette-info-meta">{selected.difficultyLabel} · {selected.coveragePct}% coverage</span>
          <span className="cassette-info-text">{selected.description}</span>
        </div>
      ) : null}
    </div>
  )
}
