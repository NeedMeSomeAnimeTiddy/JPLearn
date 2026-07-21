import type { UseTutorReturn } from '../useTutor'
import type { TutorSettingsFields } from '../types'
import type { Dispatch, SetStateAction } from 'react'
import { ImagePlus, ArrowRight, RefreshCw } from 'lucide-react'
import { ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB } from '../constants'
import { clampAssistantChatOcrMinConfidence } from '../utils'

interface OcrWorkbenchProps {
  tutor: UseTutorReturn
  settings: TutorSettingsFields
  setSettings: Dispatch<SetStateAction<TutorSettingsFields>>
}

/**
 * Image Translation body — upload control, confidence slider, and the
 * Japanese/English result. Shell chrome (backdrop, dialog, header, Close)
 * lives in TutorPanelShell; the Clear header action is rendered by
 * TutorPanel. This component's behaviour is unchanged from before relocation.
 */
export function OcrWorkbench({ tutor, settings, setSettings }: OcrWorkbenchProps) {
  const {
    ocrWorkbenchBusy,
    ocrWorkbenchError,
    ocrWorkbenchResult,
    handleOcrWorkbenchImageSelected,
    ocrWorkbenchImageInputRef,
  } = tutor

  return (
    <>
      <div className="assistant-chat-log" role="log" aria-live="polite">
        {!ocrWorkbenchResult ? (
          <p className="assistant-chat-empty">Select an image to extract Japanese text and get an English translation in one response.</p>
        ) : (
          <article className="assistant-chat-turn assistant-chat-turn-assistant ocr-workbench-result-card" style={{ maxWidth: '100%' }}>
            <div className="assistant-chat-turn-meta">
              <span className="assistant-chat-turn-role">OCR + Tutor</span>
            </div>
            <div className="ocr-workbench-source-meta">
              <span className="ocr-workbench-source-label">Source image</span>
              <span className="ocr-workbench-source-value">{ocrWorkbenchResult.fileName}</span>
              <span className="ocr-workbench-source-lines">{`${ocrWorkbenchResult.lineCount} line${ocrWorkbenchResult.lineCount === 1 ? '' : 's'}`}</span>
            </div>
            <div className="ocr-workbench-flow" role="group" aria-label="Japanese to English translation flow">
              <section className="ocr-workbench-box ocr-workbench-box-japanese" aria-label="Japanese text">
                <h3>Japanese</h3>
                <p>{ocrWorkbenchResult.japaneseText}</p>
              </section>
              <span className="ocr-workbench-flow-arrow" aria-hidden="true">
                <ArrowRight size={22} strokeWidth={2.4} />
              </span>
              <section className="ocr-workbench-box ocr-workbench-box-english" aria-label="English text">
                <h3>English</h3>
                <p>{ocrWorkbenchResult.englishText}</p>
              </section>
            </div>
          </article>
        )}
      </div>

      {ocrWorkbenchError ? (
        <p className="assistant-chat-error">{ocrWorkbenchError}</p>
      ) : null}

      <footer className="assistant-chat-composer">
        <div className="assistant-chat-input-wrap ocr-workbench-controls">
          <button
            type="button"
            className="assistant-chat-upload ocr-workbench-upload"
            onClick={() => ocrWorkbenchImageInputRef.current?.click()}
            disabled={ocrWorkbenchBusy}
            aria-label="Upload image for OCR"
            title={`Upload image (max ${ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB} MB)`}
          >
            {ocrWorkbenchBusy
              ? <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" className="spin-icon" />
              : <ImagePlus size={16} strokeWidth={2.2} aria-hidden="true" />}
            <span>Upload image</span>
          </button>
          <label className="ocr-workbench-confidence" htmlFor="ocr-workbench-confidence-slider">
            <span className="ocr-workbench-confidence-label">Confidence</span>
            <div className="ocr-workbench-confidence-row">
              <input
                id="ocr-workbench-confidence-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.assistantChatOcrMinConfidence}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  setSettings((prev) => ({
                    ...prev,
                    assistantChatOcrMinConfidence: clampAssistantChatOcrMinConfidence(value),
                  }))
                }}
                aria-label="OCR confidence filter"
              />
              <span className="ocr-workbench-confidence-value">{Math.round(settings.assistantChatOcrMinConfidence * 100)}%</span>
            </div>
          </label>
          <input
            ref={ocrWorkbenchImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (!file) {
                return
              }
              void handleOcrWorkbenchImageSelected(file)
            }}
          />
        </div>
      </footer>
    </>
  )
}
