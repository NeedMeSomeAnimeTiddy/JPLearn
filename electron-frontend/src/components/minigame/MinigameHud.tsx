import { Activity, ArrowLeft, Heart, RotateCcw, Search, Settings, Target, Trophy } from 'lucide-react'
import { MetricsChip } from '../MetricsChip'
import { DEFAULT_LIVES, SCRIPT_LABELS } from '../../constants'
import type { ScriptKey } from '../../types'

interface MinigameHudProps {
  activeScript: ScriptKey
  activeSectionName: string | null
  title: string
  sessionRounds: number
  sessionTargetItems: number
  sessionStatusCopy: string
  sessionScore: number
  sessionPoints: number
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
}

export function MinigameHud({
  activeScript,
  activeSectionName,
  title,
  sessionRounds,
  sessionTargetItems,
  sessionStatusCopy,
  sessionScore,
  sessionPoints,
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
}: MinigameHudProps) {
  const progressValue = sessionTargetItems > 0 ? Math.min(sessionRounds / sessionTargetItems, 1) : 0

  return (
    <header className="topbar panel-glass minigame-hud">
      <button
        type="button"
        className="back-button back-button-icon-only"
        onClick={onBack}
        aria-label="Back to map"
        title="Back to map"
      >
        <ArrowLeft aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
      </button>
      <div className="brand-block minigame-brand-block">
        <span className="brand-kicker">
          {SCRIPT_LABELS[activeScript]}
          {activeSectionName ? ` · ${activeSectionName}` : ' Run'}
        </span>
        <h1>{title}</h1>
      </div>
      <div className="minigame-progress-cluster" aria-label="Session progress overview">
        <div
          className="minigame-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={sessionTargetItems}
          aria-valuenow={Math.min(sessionRounds, sessionTargetItems)}
          aria-valuetext={`${sessionRounds} of ${sessionTargetItems} challenges, ${sessionStatusCopy}`}
          title={`${sessionRounds}/${sessionTargetItems} · ${sessionStatusCopy}`}
        >
          <div className="minigame-progress-track-fill" style={{ width: `${progressValue * 100}%` }} />
        </div>
      </div>
      <div className="topbar-end">
        {sessionActive ? (
          <div className="minigame-hud-live" aria-label="Live run controls">
            <button
              type="button"
              className="minigame-hud-restart"
              onClick={onRestart}
              disabled={gameLoading || activeRunCardsLength === 0 || sessionSummaryLoading || sessionStartPending}
              aria-label="Restart challenge"
              title="Restart Challenge"
            >
              <RotateCcw aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
            </button>
            {livesEnabled ? (
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
          </div>
        ) : null}
        <div className="focus-chip minigame-focus-chip">
          <MetricsChip
            icon={Target}
            label="Correct"
            value={`${sessionScore}/${sessionRounds}`}
            accent="skill"
            valueKey={`correct-${sessionScore}-${sessionRounds}`}
          />
          <MetricsChip
            icon={Activity}
            label="Points"
            value={sessionPoints}
            accent="streak"
            valueKey={`points-${sessionPoints}`}
          />
          <MetricsChip
            icon={Trophy}
            label="Goal"
            value={`${sessionRounds}/${sessionTargetItems}`}
            accent="insight"
            valueKey={`goal-${sessionRounds}-${sessionTargetItems}`}
          />
        </div>
        <button
          type="button"
          className="topbar-settings-button"
          onClick={() => onOpenDictionary(dictionarySeed)}
          aria-label="Open dictionary"
          title="Dictionary"
        >
          <Search aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="topbar-settings-button"
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