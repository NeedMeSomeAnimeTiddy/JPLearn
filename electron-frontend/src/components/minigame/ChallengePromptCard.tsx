import { Volume2 } from 'lucide-react'
import type { RoundState, ScriptKey } from '../../types'

interface ChallengePromptCardProps {
  roundState: RoundState
  activeScript: ScriptKey
  voiceEnabled: boolean
  voiceBusy: boolean
  voiceUnavailable: boolean
  showKeyboardPrompts: boolean
  showRevealText: boolean
  onPlayAudio: (text: string) => void
}

export function ChallengePromptCard({
  roundState,
  activeScript,
  voiceEnabled,
  voiceBusy,
  voiceUnavailable,
  showKeyboardPrompts,
  showRevealText,
  onPlayAudio,
}: ChallengePromptCardProps) {
  const showWordAudioButton =
    roundState.mode !== 'listening_audio_first' && voiceEnabled && Boolean(roundState.audioText)

  return (
    <div className="game-prompt-focus minigame-prompt-card">
      <div className="minigame-prompt-head">
        <p className="game-prompt-label">{roundState.promptLabel}</p>
        {showWordAudioButton ? (
          <button
            type="button"
            className="game-speak-icon-button"
            onClick={() => onPlayAudio(roundState.audioText)}
            disabled={voiceBusy}
            aria-label="Play target words"
            title={voiceUnavailable ? 'Voice playback unavailable' : showKeyboardPrompts ? 'Play target words (P)' : 'Play target words'}
          >
            <Volume2 size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {roundState.mode === 'listening_audio_first' ? (
        <div className="game-listen-prompt">
          <button
            type="button"
            className="game-listen-play-button"
            onClick={() => onPlayAudio(roundState.audioText)}
            disabled={voiceBusy || !voiceEnabled}
            aria-label="Play audio prompt"
            title={voiceUnavailable ? 'Voice playback unavailable' : showKeyboardPrompts ? 'Replay audio (P)' : 'Replay audio'}
          >
            <Volume2 size={28} aria-hidden="true" />
            <span>
              {voiceBusy
                ? 'Loading…'
                : voiceUnavailable
                  ? 'Voice unavailable'
                  : 'Replay audio'}
            </span>
          </button>
          {showRevealText ? (
            <p className="game-prompt-main is-japanese game-listen-reveal">
              {roundState.focusText}
            </p>
          ) : null}
        </div>
      ) : (
        <p className={`game-prompt-main ${roundState.mode !== 'character_match' ? 'is-japanese' : ''}`}>
          {roundState.focusText}
        </p>
      )}
      {roundState.mode !== 'listening_audio_first' && activeScript === 'grammar_patterns' &&
      voiceEnabled && roundState.exampleSentenceAudioText ? (
        <div className="game-speak-controls">
          <button
            type="button"
            className="game-speak-button"
            onClick={() => onPlayAudio(roundState.exampleSentenceAudioText!)}
            disabled={voiceBusy}
            aria-label="Play example sentence"
            title={voiceUnavailable ? 'Voice playback unavailable' : 'Play example sentence'}
          >
            <Volume2 size={16} aria-hidden="true" />
            <span>
              {voiceBusy
                ? 'Loading…'
                : voiceUnavailable
                  ? 'Voice unavailable'
                  : 'Play sentence'}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}