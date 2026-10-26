import type { TutorSettingsFields } from '../types'
import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, Drama, Keyboard, MessageCircle, Volume2 } from 'lucide-react'
import { ASSISTANT_TOAST_LIMIT_OPTIONS } from '../constants'

interface TutorSettingsTabProps {
  settings: TutorSettingsFields
  setSettings: Dispatch<SetStateAction<TutorSettingsFields>>
}

export function TutorSettingsTab({ settings, setSettings }: TutorSettingsTabProps) {
  return (
    <>
      <p className="settings-section-label">Tutor Companion</p>
      <div className="settings-animation-grid" role="group" aria-label="Tutor companion controls">
        <button
          type="button"
          className={`settings-icon-entry settings-theme-entry ${settings.assistantChatEnabled ? 'is-active' : ''}`}
          onClick={() => setSettings((prev) => ({ ...prev, assistantChatEnabled: !prev.assistantChatEnabled }))}
          aria-label={settings.assistantChatEnabled ? 'Chat with Tutor enabled. Activate to disable.' : 'Chat with Tutor disabled. Activate to enable.'}
          aria-pressed={settings.assistantChatEnabled}
          title={settings.assistantChatEnabled ? 'Chat with Tutor enabled' : 'Chat with Tutor disabled'}
        >
          <span className={`settings-mode-icon-button ${settings.assistantChatEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
            <MessageCircle size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="settings-icon-entry-label">Chat with Tutor</span>
        </button>

        <button
          type="button"
          className={`settings-icon-entry settings-theme-entry ${settings.scenarioAiEvaluationEnabled ? 'is-active' : ''}`}
          onClick={() => setSettings((prev) => ({ ...prev, scenarioAiEvaluationEnabled: !prev.scenarioAiEvaluationEnabled }))}
          aria-label={settings.scenarioAiEvaluationEnabled
            ? 'Scenario AI evaluation enabled. Activate to disable.'
            : 'Scenario AI evaluation disabled. Activate to enable.'}
          aria-pressed={settings.scenarioAiEvaluationEnabled}
          title={settings.scenarioAiEvaluationEnabled ? 'Scenario AI evaluation enabled' : 'Scenario AI evaluation disabled'}
        >
          <span className={`settings-mode-icon-button ${settings.scenarioAiEvaluationEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
            <Drama size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="settings-icon-entry-label">Scenario AI evaluation</span>
        </button>

        {/* THE TWO SWITCHES THE TUTOR POP-UP'S HEADER CARRIED. They live here now, and stay within
            reach where they are used -- as chips on Look it up's A QUESTION and on the
            conversation screen -- so nobody has to leave a conversation to change them. */}
        <button
          type="button"
          className={`settings-icon-entry settings-theme-entry ${settings.assistantChatAudioEnabled ? 'is-active' : ''}`}
          onClick={() => setSettings((prev) => ({ ...prev, assistantChatAudioEnabled: !prev.assistantChatAudioEnabled }))}
          aria-label={settings.assistantChatAudioEnabled
            ? 'Tutor and character voice on. Activate to turn off.'
            : 'Tutor and character voice off. Activate to turn on.'}
          aria-pressed={settings.assistantChatAudioEnabled}
          title={settings.assistantChatAudioEnabled ? 'Tutor voice on' : 'Tutor voice off'}
        >
          <span className={`settings-mode-icon-button ${settings.assistantChatAudioEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
            <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="settings-icon-entry-label">Tutor voice</span>
        </button>

        <button
          type="button"
          className={`settings-icon-entry settings-theme-entry ${settings.romajiConversionEnabled ? 'is-active' : ''}`}
          onClick={() => setSettings((prev) => ({ ...prev, romajiConversionEnabled: !prev.romajiConversionEnabled }))}
          aria-label={settings.romajiConversionEnabled
            ? 'Romaji-to-kana conversion on. Activate to turn off.'
            : 'Romaji-to-kana conversion off. Activate to turn on.'}
          aria-pressed={settings.romajiConversionEnabled}
          title={settings.romajiConversionEnabled ? 'Romaji to kana on' : 'Romaji to kana off'}
        >
          <span className={`settings-mode-icon-button ${settings.romajiConversionEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
            <Keyboard size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="settings-icon-entry-label">Romaji → kana</span>
        </button>

        {ASSISTANT_TOAST_LIMIT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`settings-icon-entry settings-theme-entry ${settings.assistantToastLimit === option.value ? 'is-active' : ''}`}
            onClick={() => setSettings((prev) => ({ ...prev, assistantToastLimit: option.value }))}
            aria-label={`Set tutor toast amount to ${option.label}`}
            aria-pressed={settings.assistantToastLimit === option.value}
            title={`Toast amount: ${option.label}`}
          >
            <span className={`settings-mode-icon-button ${settings.assistantToastLimit === option.value ? 'is-enabled' : ''}`} aria-hidden="true">
              <AlertTriangle size={18} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span className="settings-icon-entry-label">Toasts {option.label}</span>
          </button>
        ))}
      </div>
      <p className="settings-help">
        Turn Chat with Tutor off to unload the local model runtime. Tutor voice reads the tutor's replies and the
        characters' lines aloud; Romaji → kana turns what you type into kana as you type it, on Look it up's
        A QUESTION and in a conversation. Set toasts to Off to disable popup notifications.
        Scenario AI evaluation only takes effect when a local model is installed — Scenario Practice always works
        without one, using authored deterministic rules and recovery.
      </p>
    </>
  )
}
