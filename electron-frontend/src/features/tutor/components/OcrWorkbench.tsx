import type { UseTutorReturn } from '../useTutor'
import type { TutorSettingsFields } from '../types'
import type { Dispatch, SetStateAction } from 'react'
import { ImagePlus, Trash2, X, ArrowRight, RefreshCw } from 'lucide-react'
import { ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB } from '../constants'
import { clampAssistantChatOcrMinConfidence } from '../utils'

interface OcrWorkbenchProps {
  tutor: UseTutorReturn
  settings: TutorSettingsFields
  setSettings: Dispatch<SetStateAction<TutorSettingsFields>>
}

export function OcrWorkbench({ tutor, settings, setSettings }: OcrWorkbenchProps) {
  const {
    ocrWorkbenchBusy,
    ocrWorkbenchError,
    ocrWorkbenchResult,
    closeOcrWorkbench,
    handleOcrWorkbenchImageSelected,
    ocrWorkbenchImageInputRef,
  } = tutor

  return (
    <div
      className="modal-backdrop assistant-backdrop ocr-workbench-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeOcrWorkbench()
        }
      }}
    >
      <section
        id="ocr-workbench-panel"
        className="assistant-chat-panel assistant-chat-window crt-scanlines"
        role="dialog"
        aria-modal="true"
        aria-label="OCR translator panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="crt-vhs-line" />
        <header className="assistant-chat-header">
          <div />
          <div className="cassette-panel-header-center">
            <span className="cassette-panel-header-catalog">IMAGE TRANSLATOR</span>
            <h2 className="cassette-panel-header-title">OCR</h2>
          </div>
          <div className="assistant-chat-header-actions">
            <button
              type="button"
              className="panel-action-button is-danger"
              onClick={() => {
                tutor.clearOcrWorkbenchResult()
              }}
              disabled={ocrWorkbenchBusy || (!ocrWorkbenchResult && !ocrWorkbenchError)}
              aria-label="Clear OCR result"
              title="Clear"
            >
              <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="panel-close-button"
              onClick={closeOcrWorkbench}
              aria-label="Close OCR translator"
            >
              <X size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </header>

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
      </section>
    </div>
  )
}
