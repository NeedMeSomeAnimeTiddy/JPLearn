import { useCallback, useRef } from 'react'
import type { RefObject } from 'react'

/* Tells the main process once that the window is ready, then calls `onSent`, whatever it answered.
   The tutor's warmup waits on that (audit 11, F3): the main process no longer warms the tutor at
   launch, and the window asks for it only once it is up and only while the chat is switched on.
   No state: nothing on screen changes when the message goes. */
export function useStartupReady(
  bootMarkRef: RefObject<number>,
  onSent: () => void,
): (deferredLoadsQueuedAtMs?: number) => void {
  const sentRef = useRef(false)

  return useCallback((deferredLoadsQueuedAtMs?: number) => {
    if (sentRef.current) return
    sentRef.current = true

    const startupReadyMs = Math.round(performance.now() - bootMarkRef.current)
    const sent = window.jplearnDesktop?.notifyStartupReady({
      startupReadyMs,
      deferredLoadsQueuedAtMs,
    })
    void Promise.resolve(sent)
      .catch(() => undefined)
      .finally(onSent)
  }, [bootMarkRef, onSent])
}
