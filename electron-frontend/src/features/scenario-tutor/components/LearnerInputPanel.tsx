import type { ReactNode } from 'react'
import { DoorOpen, Mic, RotateCcw, SendHorizontal, Square } from 'lucide-react'
import { SCENARIO_COPY } from '../constants'
import { useWanakanaTextarea } from '../../../hooks/useWanakanaTextarea'
import type { MicRecorderErrorReason, MicRecorderState } from '../../../hooks/useMicRecorder'

interface LearnerInputPanelProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
  /** Voice input is offered only when the local speech runtime is available.
   * Every prop below is optional and the typed field above never depends on
   * any of them — typing always works, whatever the microphone is doing. */
  speechInputAvailable?: boolean
  micState?: MicRecorderState
  micErrorReason?: MicRecorderErrorReason | null
  micElapsedMs?: number
  micMaxDurationMs?: number
  sttError?: string | null
  heardTranscript?: string | null
  onStartRecording?: () => void
  onStopRecording?: () => void
  /** The hint trigger button (a self-contained popover) rendered inline with
   * the rest of the toolbar, next to the input rather than above it. */
  hintSlot?: ReactNode
  onRequestRestart?: () => void
  onRequestAbandon?: () => void
  romajiConversionEnabled: boolean
}

function micStatusText(
  state: MicRecorderState,
  errorReason: MicRecorderErrorReason | null,
  remainingSec: number,
): string | null {
  if (state === 'requesting-permission') return SCENARIO_COPY.micRequesting
  if (state === 'recording') return `Listening… (max ${remainingSec}s)`
  if (state === 'processing') return SCENARIO_COPY.micTranscribing
  if (state !== 'error') return null
  if (errorReason === 'permission') return SCENARIO_COPY.micPermissionDenied
  if (errorReason === 'no-device') return SCENARIO_COPY.micNoDevice
  if (errorReason === 'unsupported') return SCENARIO_COPY.micUnsupported
  return SCENARIO_COPY.micFailed
}

export function LearnerInputPanel({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Type your response in Japanese...',
  speechInputAvailable = false,
  micState = 'idle',
  micErrorReason = null,
  micElapsedMs = 0,
  micMaxDurationMs = 8000,
  sttError = null,
  heardTranscript = null,
  onStartRecording,
  onStopRecording,
  hintSlot,
  onRequestRestart,
  onRequestAbandon,
  romajiConversionEnabled,
}: LearnerInputPanelProps) {
  // Same inline romaji→kana IME the typed minigames use: "koohii o kudasai"
  // becomes こーひーをください as you type, inside the field itself — while
  // the toggle is on. Composition-safe either way, so a real OS Japanese IME
  // can still take over for kanji conversion — see useWanakanaTextarea.
  const { ref: inputRef, isComposingRef, handlers: wanakanaHandlers } = useWanakanaTextarea(
    romajiConversionEnabled,
    'toHiragana',
    onChange,
  )

  const canRecord = speechInputAvailable && !!onStartRecording && !!onStopRecording
  const isRecording = micState === 'recording'
  const micBusy = micState === 'requesting-permission' || micState === 'processing'
  const remainingSec = Math.max(0, Math.ceil((micMaxDurationMs - micElapsedMs) / 1000))
  const statusText = canRecord ? micStatusText(micState, micErrorReason, remainingSec) : null

  return (
    <footer className="assistant-chat-composer scenario-input-panel">
      {statusText || heardTranscript ? (
        <div className="scenario-voice-status" aria-live="polite">
          {statusText ? <span>{statusText}</span> : null}
          {heardTranscript ? (
            <span className="scenario-heard-transcript">
              {SCENARIO_COPY.heardPrefix}: &ldquo;{heardTranscript}&rdquo; {SCENARIO_COPY.heardHint}
            </span>
          ) : null}
        </div>
      ) : null}
      {sttError ? <p className="scenario-voice-error" role="alert">{sttError}</p> : null}

      <div className="assistant-chat-input-wrap scenario-input-toolbar">
        {hintSlot}
        {canRecord ? (
          <button
            type="button"
            className={`scenario-mic-button${isRecording ? ' is-recording' : ''}`}
            onClick={() => { if (isRecording) { onStopRecording?.() } else { onStartRecording?.() } }}
            disabled={disabled || micBusy}
            aria-pressed={isRecording}
            aria-label={isRecording ? SCENARIO_COPY.micStop : SCENARIO_COPY.micStart}
            title={isRecording ? SCENARIO_COPY.micStop : SCENARIO_COPY.micStart}
          >
            {isRecording
              ? <Square size={16} strokeWidth={2.2} aria-hidden="true" />
              : <Mic size={16} strokeWidth={2.2} aria-hidden="true" />}
          </button>
        ) : null}
        <textarea
          ref={inputRef}
          value={value}
          {...wanakanaHandlers}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || isComposingRef.current) return
            event.preventDefault()
            if (disabled || value.trim().length === 0) return
            onSubmit()
          }}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          aria-label="Your response"
        />
        <button
          type="button"
          className="assistant-chat-send"
          onClick={onSubmit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Submit response"
          title="Submit"
        >
          <SendHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {onRequestRestart ? (
          <button
            type="button"
            className="scenario-toolbar-button"
            onClick={onRequestRestart}
            disabled={disabled}
            aria-label="Restart scenario"
            title="Restart"
          >
            <RotateCcw size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
        {onRequestAbandon ? (
          <button
            type="button"
            className="scenario-toolbar-button is-danger"
            onClick={onRequestAbandon}
            disabled={disabled}
            aria-label="Leave scenario"
            title="Leave"
          >
            <DoorOpen size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </footer>
  )
}
