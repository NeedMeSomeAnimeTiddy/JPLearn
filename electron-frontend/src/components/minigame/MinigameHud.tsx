import { ArrowLeft, Focus, Heart, ListOrdered, RotateCcw, Search, Settings } from 'lucide-react'
import type { RefObject } from 'react'
import { DEFAULT_LIVES, SCRIPT_LABELS } from '../../constants'
import type { ScriptKey } from '../../types'

const SCRIPT_CODE: Record<ScriptKey, string> = {
  hiragana: 'HNG',
  katakana: 'KTA',
  kanji_n5: 'KNJ',
  vocab_n5: 'VCB',
  grammar_patterns: 'GRM',
  sentence_examples: 'SNT',
}

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
  onToggleQueue: () => void
  queueOpen: boolean
  queueButtonRef: RefObject<HTMLButtonElement | null>
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
  onToggleQueue,
  queueOpen,
  queueButtonRef,
}: MinigameHudProps) {
  const catalogCode = `JPL-${SCRIPT_CODE[activeScript]}-G`
  const subCatalog = `${SCRIPT_LABELS[activeScript]}${activeSectionName ? ` · ${activeSectionName}` : ' Run'}`

  return (
    <header className="hub-topbar">
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

      <span className="hub-nameplate">
        <span className="hub-nameplate-mark" aria-hidden="true">{catalogCode}</span>
        <strong className="hub-topbar-title"><span className="hub-glitch-text">{title}</span></strong>
      </span>

      <span className="hub-topbar-sub">{subCatalog}</span>

      <div className="hub-topbar-end">
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
        {sessionActive ? (
          <button
            ref={queueButtonRef}
            type="button"
            className={`topbar-settings-button minigame-focus-optional ${queueOpen ? 'is-active' : ''}`}
            onClick={onToggleQueue}
            aria-label={queueOpen ? 'Hide upcoming cards' : 'Show upcoming cards'}
            title={queueOpen ? 'Hide queue (Q)' : 'Queue preview (Q)'}
          >
            <ListOrdered aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
          </button>
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