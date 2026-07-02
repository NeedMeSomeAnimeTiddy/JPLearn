import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowLeft, Flame, Focus, Heart, RotateCcw, Search, Settings, Target, Trophy } from 'lucide-react'
import { MetricsChip } from '../MetricsChip'
import { DEFAULT_LIVES, SCRIPT_LABELS } from '../../constants'
import type { ScriptKey } from '../../types'

interface MinigameHudProps {
  activeScript: ScriptKey
  activeSectionName: string | null
  title: string
  sessionRounds: number
  sessionTargetItems: number
  sessionScore: number
  sessionPoints: number
  sessionStreak: number
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
  sessionRounds,
  sessionTargetItems,
  sessionScore,
  sessionPoints,
  sessionStreak,
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
  const [pointsGainPulse, setPointsGainPulse] = useState(false)
  const [pointsGainAmount, setPointsGainAmount] = useState<number | null>(null)
  const previousPointsRef = useRef(sessionPoints)

  useEffect(() => {
    if (sessionPoints <= previousPointsRef.current) {
      previousPointsRef.current = sessionPoints
      return
    }

    const gained = sessionPoints - previousPointsRef.current
    previousPointsRef.current = sessionPoints
    setPointsGainAmount(gained)
    setPointsGainPulse(true)

    const timeoutHandle = window.setTimeout(() => {
      setPointsGainPulse(false)
      setPointsGainAmount(null)
    }, 700)

    return () => window.clearTimeout(timeoutHandle)
  }, [sessionPoints])

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
        <div className="focus-chip minigame-focus-chip minigame-focus-optional">
          <span className={`minigame-points-chip ${pointsGainPulse ? 'is-gaining' : ''}`}>
            <MetricsChip
              icon={Activity}
              label="Points"
              value={sessionPoints}
              accent="streak"
              valueKey={`points-${sessionPoints}`}
            />
            {pointsGainAmount ? <span className="minigame-points-gain">+{pointsGainAmount}</span> : null}
          </span>
          <MetricsChip
            icon={Flame}
            label="Streak"
            value={sessionStreak}
            accent="warning"
            valueKey={`streak-${sessionStreak}`}
          />
          <MetricsChip
            icon={Target}
            label="Correct"
            value={`${sessionScore}/${sessionRounds}`}
            accent="skill"
            valueKey={`correct-${sessionScore}-${sessionRounds}`}
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