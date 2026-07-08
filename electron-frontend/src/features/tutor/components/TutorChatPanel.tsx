import type { UseTutorReturn } from '../useTutor'
import type { TutorSettingsFields } from '../types'
import type { Dispatch, SetStateAction } from 'react'
import { Volume2, VolumeX, Trash2, X, SendHorizontal, MessageCircle } from 'lucide-react'
import { ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT } from '../constants'

interface TutorChatPanelProps {
  tutor: UseTutorReturn
  settings: TutorSettingsFields
  setSettings: Dispatch<SetStateAction<TutorSettingsFields>>
  cancelAssistantSpeech: () => void
}

export function TutorChatPanel({ tutor, settings, setSettings, cancelAssistantSpeech }: TutorChatPanelProps) {
  const {
    assistantChatLoading,
    assistantChatError,
    assistantChatMessages,
    assistantChatInput,
    setAssistantChatInput,
    assistantSpeakingTurnKey,
    closeAssistantChat,
    clearAssistantChat,
    sendAssistantChat,
    replayAssistantTurn,
    assistantChatLogRef,
  } = tutor

  return (
    <div
      className="modal-backdrop assistant-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeAssistantChat()
      }}
    >
      <section
        id="assistant-chat-panel"
        className="assistant-chat-panel assistant-chat-window"
        role="dialog"
        aria-modal="true"
        aria-label="Tutor chat panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="assistant-chat-header">
          <div className="assistant-chat-identity">
            <span className="assistant-chat-avatar" aria-hidden="true">
              <MessageCircle size={18} strokeWidth={2.2} />
              <span className="assistant-chat-presence" />
            </span>
            <span className="assistant-chat-identity-text">
              <span className="assistant-chat-title">Study Coach</span>
              <span className="assistant-chat-subtitle">
                {assistantChatLoading ? 'Typing\u2026' : 'Online \u00b7 here to help'}
              </span>
            </span>
          </div>
          <div className="assistant-chat-header-actions">
            <button
              type="button"
              className={`assistant-chat-audio-toggle ${settings.assistantChatAudioEnabled ? 'is-on' : 'is-off'}`}
              onClick={() => {
                if (settings.assistantChatAudioEnabled) {
                  cancelAssistantSpeech()
                }
                setSettings((previous) => ({
                  ...previous,
                  assistantChatAudioEnabled: !previous.assistantChatAudioEnabled,
                }))
              }}
              aria-label={settings.assistantChatAudioEnabled ? 'Turn coach audio off' : 'Turn coach audio on'}
              aria-pressed={settings.assistantChatAudioEnabled}
              title={settings.assistantChatAudioEnabled ? 'Coach audio on' : 'Coach audio off'}
            >
              {settings.assistantChatAudioEnabled ? (
                <Volume2 size={14} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <VolumeX size={14} strokeWidth={2.2} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="assistant-chat-clear"
              onClick={() => void clearAssistantChat()}
              disabled={assistantChatMessages.length <= 0 || assistantChatLoading}
              aria-label="Clear chat history"
              title="Clear chat"
            >
              <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="assistant-chat-close"
              onClick={closeAssistantChat}
              aria-label="Close tutor chat"
            >
              <X size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="assistant-chat-log" role="log" aria-live="polite" ref={assistantChatLogRef}>
          {assistantChatMessages.length <= 0 && !assistantChatLoading ? (
            <p className="assistant-chat-empty">Start a chat when you want strategy help or encouragement.</p>
          ) : (
            <>
              {assistantChatMessages.map((turn, index) => {
                const turnKey = `${turn.created_at_utc}-${index}`
                const isReplaySpeaking = assistantSpeakingTurnKey === turnKey
                return (
                  <article key={turnKey} className={`assistant-chat-turn assistant-chat-turn-${turn.role}`}>
                    <div className="assistant-chat-turn-meta">
                      <span className="assistant-chat-turn-role">{turn.role === 'assistant' ? 'Coach' : 'You'}</span>
                      {turn.role === 'assistant' ? (
                        <button
                          type="button"
                          className={`assistant-chat-turn-replay ${isReplaySpeaking ? 'is-speaking' : ''}`}
                          onClick={() => {
                            if (isReplaySpeaking) {
                              cancelAssistantSpeech()
                              return
                            }
                            replayAssistantTurn(turn.content, turnKey)
                          }}
                          disabled={!settings.assistantChatAudioEnabled}
                          aria-label={settings.assistantChatAudioEnabled
                            ? (isReplaySpeaking ? 'Stop coach message audio' : 'Replay coach message audio')
                            : 'Enable chat audio to replay this message'}
                          title={settings.assistantChatAudioEnabled
                            ? (isReplaySpeaking ? 'Stop audio' : 'Replay audio')
                            : 'Enable chat audio to replay'}
                        >
                          <Volume2 size={12} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <p>{turn.content}</p>
                  </article>
                )
              })}
              {assistantChatLoading ? (
                <article className="assistant-chat-turn assistant-chat-turn-assistant assistant-chat-turn-typing" aria-label="Coach is typing">
                  <div className="assistant-chat-turn-meta">
                    <span className="assistant-chat-turn-role">Coach</span>
                  </div>
                  <p className="assistant-chat-typing" aria-hidden="true">
                    <span className="assistant-chat-typing-dot" />
                    <span className="assistant-chat-typing-dot" />
                    <span className="assistant-chat-typing-dot" />
                  </p>
                </article>
              ) : null}
            </>
          )}
        </div>

        {assistantChatError ? (
          <p className="assistant-chat-error">{assistantChatError}</p>
        ) : null}

        <footer className="assistant-chat-composer">
          <div className="assistant-chat-input-wrap">
            <textarea
              value={assistantChatInput}
              onChange={(event) => {
                setAssistantChatInput(event.currentTarget.value)
                if (assistantChatError?.startsWith('User chat is limited to')) {
                  tutor.sendAssistantChat() // Resets the error via the send path
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) {
                  return
                }
                event.preventDefault()
                if (assistantChatLoading || assistantChatInput.trim().length === 0) {
                  return
                }
                void sendAssistantChat()
              }}
              placeholder="Ask your coach for help with your current weak area..."
              rows={2}
              maxLength={ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT}
              disabled={assistantChatLoading}
            />
            <span className="assistant-chat-limit" aria-hidden="true">
              {assistantChatInput.length}/{ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT}
            </span>
            <button
              type="button"
              className="assistant-chat-send"
              onClick={() => void sendAssistantChat()}
              disabled={assistantChatLoading || assistantChatInput.trim().length === 0}
              aria-label="Send tutor chat message"
              title="Send"
            >
              <SendHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
