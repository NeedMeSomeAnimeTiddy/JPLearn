import type { UseTutorReturn } from '../useTutor'
import type { TutorSettingsFields } from '../types'
import { TypeAnimation } from 'react-type-animation'
import { SendHorizontal, Volume2 } from 'lucide-react'
import { ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT } from '../constants'
import { useWanakanaTextarea } from '../../../hooks/useWanakanaTextarea'

interface TutorChatPanelProps {
  tutor: UseTutorReturn
  settings: TutorSettingsFields
  cancelAssistantSpeech: () => void
}

/**
 * Chat with Tutor body — the conversation log, error banner, and composer.
 * Shell chrome (backdrop, dialog, header, Close) lives in TutorPanelShell;
 * the audio-toggle/clear header actions are rendered by TutorPanel. This
 * component owns only the chat activity's own content.
 */
export function TutorChatPanel({ tutor, settings, cancelAssistantSpeech }: TutorChatPanelProps) {
  const {
    assistantChatLoading,
    assistantChatError,
    assistantChatMessages,
    assistantChatInput,
    setAssistantChatInput,
    assistantSpeakingTurnKey,
    sendAssistantChat,
    replayAssistantTurn,
    assistantChatLogRef,
  } = tutor

  // Clearing a "message too long" rate-limit error is a side effect of any
  // edit, however the edit was produced (plain typing or romaji→kana), so it
  // lives here rather than duplicated per input path.
  const handleInputChange = (value: string) => {
    setAssistantChatInput(value)
    if (assistantChatError?.startsWith('User chat is limited to')) {
      tutor.sendAssistantChat() // Resets the error via the send path
    }
  }

  // Same inline romaji→kana IME as Scenario Practice, toggled from the
  // shared header button — off leaves this an ordinary controlled textarea.
  const { ref: inputRef, isComposingRef, handlers: wanakanaHandlers } = useWanakanaTextarea(
    settings.romajiConversionEnabled,
    'toHiragana',
    handleInputChange,
  )

  return (
    <>
      <div className="assistant-chat-log" role="log" aria-live="polite" ref={assistantChatLogRef}>
        {assistantChatMessages.length <= 0 && !assistantChatLoading ? (
          <p className="assistant-chat-empty">Start a chat when you want strategy help or encouragement.</p>
        ) : (
          <>
            {assistantChatMessages.map((turn, index) => {
              const turnKey = `${turn.created_at_utc}-${index}`
              const isReplaySpeaking = assistantSpeakingTurnKey === turnKey
              return (
                <div key={turnKey} className={`assistant-chat-turn assistant-chat-turn-${turn.role}`}>
                  <div className="assistant-chat-message-card">
                    <div className="assistant-chat-card-header">
                      <span className="assistant-chat-role-label">
                        {turn.role === 'assistant' ? 'SENSEI' : 'YOU'}
                      </span>
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
                    <p className="assistant-chat-message-text">
                      {turn.role === 'assistant' ? (
                        <TypeAnimation key={turnKey} sequence={[turn.content]} speed={12} cursor={false} style={{ display: 'inline' }} />
                      ) : (
                        turn.content
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
            {assistantChatLoading ? (
              <div className="assistant-chat-turn assistant-chat-turn-assistant" aria-label="Coach is typing">
                <div className="assistant-chat-message-card">
                  <span className="assistant-chat-role-label">SENSEI</span>
                  <p className="assistant-chat-message-text">
                    <span className="assistant-chat-typing">Thinking</span>
                  </p>
                </div>
              </div>
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
            ref={inputRef}
            value={assistantChatInput}
            {...wanakanaHandlers}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || isComposingRef.current) {
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
    </>
  )
}
