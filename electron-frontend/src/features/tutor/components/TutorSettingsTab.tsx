import type { TutorSettingsFields } from '../types'
import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, MessageCircle } from 'lucide-react'
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
      <p className="settings-help">Turn Chat with Tutor off to unload the local model runtime. Set toasts to Off to disable popup notifications.</p>
    </>
  )
}
