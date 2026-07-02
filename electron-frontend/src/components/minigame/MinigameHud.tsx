import { ArrowLeft, Focus, Heart, RotateCcw, Search, Settings } from 'lucide-react'
import { DEFAULT_LIVES, SCRIPT_LABELS } from '../../constants'
import type { ScriptKey } from '../../types'

interface MinigameHudProps {
  activeScript: ScriptKey
  activeSectionName: string | null
  title: string
  focusModeEnabled: boolean
  dictionarySeed: string
  sessionActive: boolean
  activeRunCardsLength: number
  gameLoading: boolean
  sessionSummaryLoading: boolean
  sessionStartPending: boolean
  livesEnabled: boolean
  livesRemaining: number
  onRestart: () => void
  onBack: () => void
  onOpenDictionary: (seedQuery?: string) => void
  onOpenSettings: () => void
  onToggleFocusMode: () => void
}

export function MinigameHud({
  activeScript,
  activeSectionName,
  title,
  focusModeEnabled,
  dictionarySeed,
  sessionActive,
  activeRunCardsLength,
  gameLoading,
  sessionSummaryLoading,
  sessionStartPending,
  livesEnabled,
  livesRemaining,
  onRestart,
  onBack,
  onOpenDictionary,
  onOpenSettings,
  onToggleFocusMode,
}: MinigameHudProps) {
  return (
    <header className="topbar panel-glass minigame-hud">
      <div className="minigame-hud-start">
        <button
          type="button"
          className="back-button back-button-icon-only"
          onClick={onBack}
          aria-label="Back to map"
          title="Back to map"
        >
          <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
        {sessionActive ? (
          <button
            type="button"
            className="topbar-settings-button minigame-focus-optional"
            onClick={onRestart}
            disabled={gameLoading || activeRunCardsLength === 0 || sessionSummaryLoading || sessionStartPending}
            aria-label="Restart challenge"
            title="Restart Challenge"
          >
            <RotateCcw aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
      <div className="brand-block minigame-brand-block">
        <span className="brand-kicker">
          {SCRIPT_LABELS[activeScript]}
          {activeSectionName ? ` · ${activeSectionName}` : ' Run'}
        </span>
        <h1>{title}</h1>
      </div>
      <div className="topbar-end">
        {sessionActive && livesEnabled ? (
          <div className="lives-inline minigame-lives-inline" aria-live="polite">
            {[...Array(DEFAULT_LIVES).keys()].map((life) => (
              <span
                key={`life-${life}`}
                className={`life-heart ${life < livesRemaining ? 'is-active' : 'is-lost'}`}
                aria-hidden="true"
              >
                <Heart className="inline-button-icon" strokeWidth={2.2} fill="currentColor" />
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={`topbar-settings-button minigame-focus-toggle ${focusModeEnabled ? 'is-active' : ''}`}
          onClick={onToggleFocusMode}
          aria-label={focusModeEnabled ? 'Disable focus mode' : 'Enable focus mode'}
          title={focusModeEnabled ? 'Disable focus mode (F)' : 'Enable focus mode (F)'}
        >
          <Focus aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          <span className="minigame-focus-toggle-label">Focus</span>
        </button>
        <button
          type="button"
          className="topbar-settings-button minigame-focus-optional"
          onClick={() => onOpenDictionary(dictionarySeed)}
          aria-label="Open dictionary"
          title="Dictionary"
        >
          <Search aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="topbar-settings-button minigame-focus-optional"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings (Ctrl+,)"
        >
          <Settings aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
      </div>
    </header>
  )
}