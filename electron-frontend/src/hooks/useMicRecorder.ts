import { useCallback, useEffect, useRef, useState } from 'react'

export type MicRecorderState = 'idle' | 'requesting-permission' | 'recording' | 'processing' | 'error'
export type MicRecorderErrorReason = 'permission' | 'no-device' | 'unsupported' | 'unknown'

interface MicRecorderResult {
  blob: Blob
  mimeType: string
}

interface UseMicRecorderOptions {
  /** Auto-stop recording after this many milliseconds. Defaults to 8000. */
  maxDurationMs?: number
  onComplete: (result: MicRecorderResult) => void
}

interface UseMicRecorderResult {
  state: MicRecorderState
  errorReason: MicRecorderErrorReason | null
  elapsedMs: number
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

const PREFERRED_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/wav']

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return PREFERRED_MIME_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
}

function classifyMicError(error: unknown): MicRecorderErrorReason {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-device'
  return 'unknown'
}

/** Records a short microphone clip for the speech-answer minigame mode. */
export function useMicRecorder({ maxDurationMs = 8000, onComplete }: UseMicRecorderOptions): UseMicRecorderResult {
  const [state, setState] = useState<MicRecorderState>('idle')
  const [errorReason, setErrorReason] = useState<MicRecorderErrorReason | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const clearTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current)
      elapsedTimerRef.current = null
    }
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    clearTimers()
  }, [clearTimers])

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorReason('unsupported')
      setState('error')
      return
    }

    setState('requesting-permission')
    setErrorReason(null)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      setErrorReason(classifyMicError(error))
      setState('error')
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    const mimeType = pickSupportedMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      clearTimers()
      releaseStream()
      setState('processing')
      const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: resolvedMimeType })
      chunksRef.current = []
      onCompleteRef.current({ blob, mimeType: resolvedMimeType })
    }
    recorder.onerror = () => {
      clearTimers()
      releaseStream()
      setErrorReason('unknown')
      setState('error')
    }

    recorder.start()
    startedAtRef.current = Date.now()
    setState('recording')
    setElapsedMs(0)

    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 200)
    autoStopTimerRef.current = setTimeout(() => {
      stop()
    }, maxDurationMs)
  }, [clearTimers, maxDurationMs, releaseStream, stop])

  const reset = useCallback(() => {
    clearTimers()
    releaseStream()
    mediaRecorderRef.current = null
    chunksRef.current = []
    setState('idle')
    setErrorReason(null)
    setElapsedMs(0)
  }, [clearTimers, releaseStream])

  useEffect(() => () => {
    clearTimers()
    releaseStream()
  }, [clearTimers, releaseStream])

  return { state, errorReason, elapsedMs, start, stop, reset }
}
