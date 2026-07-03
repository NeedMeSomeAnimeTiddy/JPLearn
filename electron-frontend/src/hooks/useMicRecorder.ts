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
  /** Enable silence-based auto-stop after speech is detected. Defaults to true. */
  autoStopOnSilence?: boolean
  /** Silence window (ms) required to auto-stop after speech has started. Defaults to 900. */
  silenceDurationMs?: number
  /** Input level threshold for voice activity in RMS units. Defaults to 0.02. */
  silenceThreshold?: number
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
export function useMicRecorder({
  maxDurationMs = 8000,
  autoStopOnSilence = true,
  silenceDurationMs = 900,
  silenceThreshold = 0.02,
  onComplete,
}: UseMicRecorderOptions): UseMicRecorderResult {
  const [state, setState] = useState<MicRecorderState>('idle')
  const [errorReason, setErrorReason] = useState<MicRecorderErrorReason | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const levelMonitorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const speechDetectedRef = useRef(false)
  const lastSpeechAtRef = useRef(0)
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
    if (levelMonitorTimerRef.current) {
      clearInterval(levelMonitorTimerRef.current)
      levelMonitorTimerRef.current = null
    }
  }, [])

  const releaseAudioGraph = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect()
    } catch {
      // Best effort cleanup.
    }
    sourceNodeRef.current = null
    analyserRef.current = null
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context) {
      void context.close().catch(() => {
        // Best effort cleanup.
      })
    }
    speechDetectedRef.current = false
    lastSpeechAtRef.current = 0
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
      releaseAudioGraph()
      releaseStream()
      setState('processing')
      const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: resolvedMimeType })
      chunksRef.current = []
      onCompleteRef.current({ blob, mimeType: resolvedMimeType })
    }
    recorder.onerror = () => {
      clearTimers()
      releaseAudioGraph()
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

    if (autoStopOnSilence && typeof window !== 'undefined' && typeof AudioContext !== 'undefined') {
      try {
        const context = new AudioContext()
        const sourceNode = context.createMediaStreamSource(stream)
        const analyser = context.createAnalyser()
        analyser.fftSize = 1024
        sourceNode.connect(analyser)

        audioContextRef.current = context
        sourceNodeRef.current = sourceNode
        analyserRef.current = analyser
        speechDetectedRef.current = false
        lastSpeechAtRef.current = Date.now()

        const sampleBuffer = new Uint8Array(analyser.frequencyBinCount)
        levelMonitorTimerRef.current = setInterval(() => {
          const activeRecorder = mediaRecorderRef.current
          if (!activeRecorder || activeRecorder.state !== 'recording') {
            return
          }
          analyser.getByteTimeDomainData(sampleBuffer)
          let sum = 0
          for (let i = 0; i < sampleBuffer.length; i += 1) {
            const normalized = (sampleBuffer[i] - 128) / 128
            sum += normalized * normalized
          }
          const rms = Math.sqrt(sum / sampleBuffer.length)
          const now = Date.now()
          if (rms >= silenceThreshold) {
            speechDetectedRef.current = true
            lastSpeechAtRef.current = now
            return
          }
          if (speechDetectedRef.current && now - lastSpeechAtRef.current >= silenceDurationMs) {
            stop()
          }
        }, 100)
      } catch {
        // Ignore VAD setup failures and rely on max-duration stop.
      }
    }

    autoStopTimerRef.current = setTimeout(() => {
      stop()
    }, maxDurationMs)
  }, [autoStopOnSilence, clearTimers, maxDurationMs, releaseAudioGraph, releaseStream, silenceDurationMs, silenceThreshold, stop])

  const reset = useCallback(() => {
    clearTimers()
    releaseAudioGraph()
    releaseStream()
    mediaRecorderRef.current = null
    chunksRef.current = []
    setState('idle')
    setErrorReason(null)
    setElapsedMs(0)
  }, [clearTimers, releaseAudioGraph, releaseStream])

  useEffect(() => () => {
    clearTimers()
    releaseAudioGraph()
    releaseStream()
  }, [clearTimers, releaseAudioGraph, releaseStream])

  return { state, errorReason, elapsedMs, start, stop, reset }
}
