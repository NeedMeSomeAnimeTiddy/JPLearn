import { useCallback, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useMicRecorder } from '../../hooks/useMicRecorder'
import { assessTypedAnswer } from '../../lib/answerAssessment'
import type { TypedAnswerState } from '../../lib/answerAssessment'

interface SpeechAnswerResult {
  transcript: string
  confidence: number
  assessment: TypedAnswerState
}

interface SpeechAnswerPanelProps {
  expectedAnswer: string
  disabled?: boolean
  language?: 'ja'
  maxDurationMs?: number
  onResult: (result: SpeechAnswerResult) => void
  onFallbackToTyped?: () => void
}

const MIME_TO_ALLOWED = new Set(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/wave', 'audio/x-wav'])

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/**
 * Speech-answer input for the minigame: tap to record, auto-stop after
 * `maxDurationMs`, transcribe offline via the local speech runtime, then
 * grade the transcript with the same near-miss logic as typed answers.
 * Not yet wired into a minigame round — see SessionContext for the typed
 * answer flow this is designed to sit alongside.
 */
export function SpeechAnswerPanel({
  expectedAnswer,
  disabled = false,
  language = 'ja',
  maxDurationMs = 8000,
  onResult,
  onFallbackToTyped,
}: SpeechAnswerPanelProps) {
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [lastTranscript, setLastTranscript] = useState<string | null>(null)

  const handleRecordingComplete = useCallback(async ({ blob, mimeType }: { blob: Blob; mimeType: string }) => {
    setProcessingError(null)
    const transcribeSpeech = window.jplearnDesktop?.transcribeSpeech
    if (!transcribeSpeech) {
      setProcessingError('Speech recognition is unavailable in this build.')
      return
    }
    const safeMimeType = MIME_TO_ALLOWED.has(mimeType) ? mimeType : 'audio/webm'
    try {
      const audioBase64 = await blobToBase64(blob)
      const result = await transcribeSpeech({
        audioBase64,
        mimeType: safeMimeType as 'audio/webm' | 'audio/ogg' | 'audio/wav',
        language,
      })
      setLastTranscript(result.text)
      const assessment = assessTypedAnswer(expectedAnswer, result.text)
      onResult({ transcript: result.text, confidence: result.confidence, assessment })
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : String(error))
    }
  }, [expectedAnswer, language, onResult])

  const { state, errorReason, elapsedMs, start, stop } = useMicRecorder({
    maxDurationMs,
    onComplete: (result) => { void handleRecordingComplete(result) },
  })

  const isRecording = state === 'recording'
  const isBusy = state === 'requesting-permission' || state === 'processing'
  const remainingSec = Math.max(0, Math.ceil((maxDurationMs - elapsedMs) / 1000))

  return (
    <div className="speech-answer-panel">
      <button
        type="button"
        className={`speech-answer-mic-button${isRecording ? ' is-recording' : ''}`}
        onClick={() => { if (isRecording) { stop() } else { void start() } }}
        disabled={disabled || isBusy}
        aria-pressed={isRecording}
        aria-label={isRecording ? 'Stop recording' : 'Start recording your spoken answer'}
        title={isRecording ? 'Stop recording' : 'Tap to speak your answer'}
      >
        {isRecording ? <Square size={20} strokeWidth={2.25} aria-hidden="true" /> : <Mic size={20} strokeWidth={2.25} aria-hidden="true" />}
      </button>

      <div className="speech-answer-status" aria-live="polite">
        {state === 'idle' && !processingError ? <span>Tap the mic and say the answer aloud.</span> : null}
        {state === 'requesting-permission' ? <span>Requesting microphone access…</span> : null}
        {isRecording ? <span>Listening… auto-stop in {remainingSec}s</span> : null}
        {state === 'processing' ? <span>Transcribing…</span> : null}
        {state === 'error' && errorReason === 'permission' ? (
          <span>
            Microphone permission was denied. Enable it in your system settings, or{' '}
            <button type="button" className="speech-answer-fallback-link" onClick={onFallbackToTyped}>
              type your answer instead
            </button>.
          </span>
        ) : null}
        {state === 'error' && errorReason === 'no-device' ? <span>No microphone was found on this device.</span> : null}
        {state === 'error' && errorReason === 'unsupported' ? <span>Speech recording isn't supported in this build.</span> : null}
        {state === 'error' && errorReason === 'unknown' ? <span>Recording failed. Please try again.</span> : null}
        {processingError ? (
          <span>
            {processingError}{' '}
            <button type="button" className="speech-answer-fallback-link" onClick={onFallbackToTyped}>
              Type your answer instead
            </button>.
          </span>
        ) : null}
        {lastTranscript && !processingError ? <span className="speech-answer-transcript">Heard: “{lastTranscript}”</span> : null}
      </div>
    </div>
  )
}
