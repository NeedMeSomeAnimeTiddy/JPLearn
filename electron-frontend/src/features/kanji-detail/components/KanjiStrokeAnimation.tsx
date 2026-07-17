import HanziWriter from 'hanzi-writer'
import { useEffect, useRef, useState } from 'react'
import type { HandwritingCharacterData } from '../../handwriting/types'
import {
  HandwritingDataError,
  loadHandwritingCharacterData,
  resolveHandwritingColors,
} from '../../handwriting/utils'
import { KANJI_DETAIL_COPY } from '../constants'
import { isReducedMotionPreferred } from '../utils'

interface KanjiStrokeAnimationProps {
  character: string
  strokeCount: number | null
}

type StrokeStatus = 'loading' | 'ready' | 'unavailable'

const STROKE_WRITER_SIZE = 176

function resolveWriterColors() {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  return resolveHandwritingColors(
    root.dataset.themeMode === 'light' ? 'light' : 'dark',
    {
      textMain: styles.getPropertyValue('--text-main').trim(),
      toneTeal: styles.getPropertyValue('--tone-teal').trim(),
      toneAmber: styles.getPropertyValue('--tone-amber').trim(),
    },
  )
}

function cancelWriterAnimation(writer: HanziWriter): void {
  writer.cancelQuiz()
  writer._renderState?.cancelAll()
}

export function KanjiStrokeAnimation({ character, strokeCount }: KanjiStrokeAnimationProps) {
  const targetRef = useRef<HTMLDivElement | null>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const [status, setStatus] = useState<StrokeStatus>('loading')
  const [reducedMotion, setReducedMotion] = useState(isReducedMotionPreferred)
  const [motionOptedIn, setMotionOptedIn] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(isReducedMotionPreferred())
    updatePreference()
    mediaQuery?.addEventListener('change', updatePreference)
    const observer = new MutationObserver(updatePreference)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduced-motion'],
    })
    return () => {
      mediaQuery?.removeEventListener('change', updatePreference)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    let disposed = false
    target.replaceChildren()
    writerRef.current = null
    setStatus('loading')
    setIsAnimating(false)
    setMotionOptedIn(false)

    void loadHandwritingCharacterData(character)
      .then((data: HandwritingCharacterData) => {
        if (disposed || !targetRef.current) return
        const writer = HanziWriter.create(targetRef.current, character, {
          width: STROKE_WRITER_SIZE,
          height: STROKE_WRITER_SIZE,
          padding: 8,
          showCharacter: true,
          showOutline: true,
          ...resolveWriterColors(),
          charDataLoader: () => data,
        })
        if (disposed) {
          cancelWriterAnimation(writer)
          return
        }
        writerRef.current = writer
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (disposed) return
        if (error instanceof HandwritingDataError || error instanceof Error) {
          setStatus('unavailable')
          return
        }
        setStatus('unavailable')
      })

    return () => {
      disposed = true
      if (writerRef.current) cancelWriterAnimation(writerRef.current)
      writerRef.current = null
      target.replaceChildren()
    }
  }, [character])

  useEffect(() => {
    if (reducedMotion && !motionOptedIn && writerRef.current) {
      cancelWriterAnimation(writerRef.current)
      setIsAnimating(false)
    }
  }, [motionOptedIn, reducedMotion])

  const replay = () => {
    const writer = writerRef.current
    if (!writer || status !== 'ready' || (reducedMotion && !motionOptedIn)) return
    setIsAnimating(true)
    void writer.animateCharacter({
      onComplete: () => setIsAnimating(false),
    })
  }

  return (
    <div className="kanji-detail-stroke">
      <div
        ref={targetRef}
        className="kanji-detail-stroke-canvas"
        aria-hidden="true"
      />
      <div className="kanji-detail-stroke-controls">
        {strokeCount !== null && (
          <p className="kanji-detail-meta">{strokeCount} strokes</p>
        )}
        {status === 'loading' && (
          <p role="status" aria-live="polite">Loading stroke-order data…</p>
        )}
        {status === 'unavailable' && (
          <p role="status" aria-live="polite">{KANJI_DETAIL_COPY.strokeUnavailable}</p>
        )}
        {status === 'ready' && reducedMotion && !motionOptedIn && (
          <>
            <p role="status" aria-live="polite">{KANJI_DETAIL_COPY.reducedMotion}</p>
            <button type="button" className="kanji-detail-secondary-action" onClick={() => setMotionOptedIn(true)}>
              Enable stroke-order animation
            </button>
          </>
        )}
        {status === 'ready' && (!reducedMotion || motionOptedIn) && (
          <button
            type="button"
            className="kanji-detail-secondary-action"
            onClick={replay}
            disabled={isAnimating}
          >
            Replay stroke order
          </button>
        )}
      </div>
    </div>
  )
}
