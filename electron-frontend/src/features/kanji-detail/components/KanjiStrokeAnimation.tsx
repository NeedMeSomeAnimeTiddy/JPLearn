import HanziWriter from 'hanzi-writer'
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HandwritingCharacterData } from '../../handwriting/types'
import { HandwritingDataError, loadHandwritingCharacterData } from '../../handwriting/utils'
import { SHEET_INK } from '../../round/utils'
import { KANJI_DETAIL_COPY, KANJI_SLATE } from '../constants'
import { isReducedMotionPreferred } from '../utils'

interface KanjiStrokeAnimationProps {
  character: string
  /** bumped by the sheet when ENTER is pressed -- the key replays, the same as the button */
  replaySignal?: number
}

type StrokeStatus = 'loading' | 'ready' | 'unavailable'

function cancelWriterAnimation(writer: HanziWriter): void {
  writer.cancelQuiz()
  writer._renderState?.cancelAll()
}

/* THE STROKES ARE DRAWN ON THE SHEET'S PAPER, so they take the sheet's ink rather than the theme's.
   `--text-main` is near-white on the app's dark panels and a near-white stroke on washi is a stroke
   you cannot see -- the round's handwriting cell measured exactly that, and `SHEET_INK` is its fix. */
export function KanjiStrokeAnimation({ character, replaySignal = 0 }: KanjiStrokeAnimationProps) {
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
          width: KANJI_SLATE,
          height: KANJI_SLATE,
          padding: 8,
          showCharacter: true,
          showOutline: true,
          ...SHEET_INK,
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
        /* a missing chunk and a malformed one land the same way: the sheet says so, the rest of it
           is unaffected */
        if (error instanceof HandwritingDataError || error instanceof Error) setStatus('unavailable')
        else setStatus('unavailable')
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

  const canAnimate = status === 'ready' && (!reducedMotion || motionOptedIn)

  const replay = useCallback(() => {
    const writer = writerRef.current
    if (!writer || !canAnimate) return
    setIsAnimating(true)
    void writer.animateCharacter({
      onComplete: () => setIsAnimating(false),
    })
  }, [canAnimate])

  const replayRef = useRef(replay)
  replayRef.current = replay
  useEffect(() => {
    if (replaySignal > 0) replayRef.current()
  }, [replaySignal])

  return (
    <div className="kx-stroke">
      <div ref={targetRef} className="kx-slate" aria-hidden="true" />
      <div className="kx-side">
        {status === 'loading' ? (
          <p className="kx-small" role="status" aria-live="polite">LOADING THE STROKES…</p>
        ) : null}
        {status === 'unavailable' ? (
          <p className="kx-small" role="status" aria-live="polite">{KANJI_DETAIL_COPY.strokeUnavailable}</p>
        ) : null}
        {status === 'ready' && !canAnimate ? (
          <>
            <p className="kx-small" role="status" aria-live="polite">{KANJI_DETAIL_COPY.reducedMotion}</p>
            <button type="button" className="kx-btn" onClick={() => setMotionOptedIn(true)}>
              Enable stroke-order animation
            </button>
          </>
        ) : null}
        {canAnimate ? (
          <>
            <button
              type="button"
              className="kx-btn ink"
              onClick={replay}
              disabled={isAnimating}
              aria-label="Replay stroke order"
            >
              <RotateCcw size={11} strokeWidth={2.6} aria-hidden="true" /> REPLAY
            </button>
            <p className="kx-small">ENTER REPLAYS<br />THE STROKES</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
