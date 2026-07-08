import { Volume2, VolumeX } from 'lucide-react'
import type { VoiceOption } from '../types'

interface FeaturesStepProps {
  showChatbotSection: boolean
  assistantChatEnabled: boolean
  onAssistantChatToggle: () => void
  showVoiceSection: boolean
  voiceOptions: VoiceOption[]
  voiceEnabled: boolean
  voiceSpeaker: string
  voiceBusy: boolean
  onVoiceToggle: () => void
  onVoiceSelect: (id: string) => void
  showFontSection: boolean
  appFont: string
  fontOptions: Array<{ key: string; label: string }>
  onAppFontSelect: (key: string) => void
  fontSize: 'small' | 'medium' | 'large'
  fontSizeOptions: Array<{ key: 'small' | 'medium' | 'large'; label: string }>
  onFontSizeSelect: (key: 'small' | 'medium' | 'large') => void
  disabled: boolean
}

export function FeaturesStep({
  showChatbotSection,
  assistantChatEnabled,
  onAssistantChatToggle,
  showVoiceSection,
  voiceOptions,
  voiceEnabled,
  voiceSpeaker,
  voiceBusy,
  onVoiceToggle,
  onVoiceSelect,
  showFontSection,
  appFont,
  fontOptions,
  onAppFontSelect,
  fontSize,
  fontSizeOptions,
  onFontSizeSelect,
  disabled,
}: FeaturesStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {showChatbotSection && (
        <div className="obn-section" role="group" aria-label="Chatbot assistant">
          <h2 className="obn-section-title">
            Would you like the study coach chat?
          </h2>
          <p className="obn-section-hint">
            Enable an in-app coach that can answer study questions and suggest next steps.
          </p>
          <button
            type="button"
            className={`obn-voice-toggle${assistantChatEnabled ? ' is-on' : ''}`}
            aria-pressed={assistantChatEnabled}
            onClick={onAssistantChatToggle}
            disabled={disabled}
          >
            {assistantChatEnabled ? 'Coach chat on' : 'Coach chat off'}
          </button>
        </div>
      )}

      {showVoiceSection && (
        <div className="obn-section" role="group" aria-label="Voice options">
          <h2 className="obn-section-title">
            Would you like prompts read aloud?
          </h2>
          <p className="obn-section-hint">
            A Japanese voice will read study prompts during games. Tap a voice to hear a sample.
          </p>
          <button
            type="button"
            className={`obn-voice-toggle${voiceEnabled ? ' is-on' : ''}`}
            aria-pressed={voiceEnabled}
            onClick={onVoiceToggle}
            disabled={disabled}
          >
            {voiceEnabled
              ? <><Volume2 size={15} strokeWidth={2.2} aria-hidden="true" /> Voice on</>
              : <><VolumeX size={15} strokeWidth={2.2} aria-hidden="true" /> Voice off</>
            }
          </button>
          {voiceEnabled && (
            <div className="obn-voice-grid" role="radiogroup" aria-label="Choose a reading voice">
              {voiceOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`obn-voice-card${voiceSpeaker === opt.id ? ' is-active' : ''}`}
                  aria-pressed={voiceSpeaker === opt.id}
                  onClick={() => onVoiceSelect(opt.id)}
                  disabled={disabled || voiceBusy}
                >
                  <span className="obn-voice-name">{opt.name}</span>
                  <span className="obn-voice-jp">{opt.jp}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showFontSection && (
        <div className="obn-section" role="group" aria-label="Font options">
          <h2 className="obn-section-title">
            Pick a study font
          </h2>
          <p className="obn-section-hint">
            Choose the reading style that feels best now. You can change this later in settings.
          </p>
          <div className="obn-level-grid" role="radiogroup" aria-label="App font">
            {fontOptions.map((font) => (
              <button
                key={font.key}
                type="button"
                className={`obn-level-chip${appFont === font.key ? ' is-selected' : ''}`}
                aria-pressed={appFont === font.key}
                onClick={() => onAppFontSelect(font.key)}
                disabled={disabled}
              >
                {font.label}
              </button>
            ))}
          </div>
          <p className="obn-section-hint" style={{ marginTop: '0.9rem' }}>
            Choose a comfortable font size for menus and study screens.
          </p>
          <div className="obn-level-grid" role="radiogroup" aria-label="App font size">
            {fontSizeOptions.map((size) => (
              <button
                key={size.key}
                type="button"
                className={`obn-level-chip${fontSize === size.key ? ' is-selected' : ''}`}
                aria-pressed={fontSize === size.key}
                onClick={() => onFontSizeSelect(size.key)}
                disabled={disabled}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
