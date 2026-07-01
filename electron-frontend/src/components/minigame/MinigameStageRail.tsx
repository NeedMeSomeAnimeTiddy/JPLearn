interface MinigameStageRailProps {
  currentRound: number
  targetRounds: number
  modeTitle: string
  sessionPoints: number
  livesEnabled: boolean
  livesRemaining: number
}

export function MinigameStageRail({
  currentRound,
  targetRounds,
  modeTitle,
  sessionPoints,
  livesEnabled,
  livesRemaining,
}: MinigameStageRailProps) {
  const progressPercent = targetRounds > 0 ? Math.min(100, Math.round((currentRound / targetRounds) * 100)) : 0

  return (
    <aside className="minigame-stage-rail" aria-label="Challenge progression rail">
      <div className="minigame-stage-rail-card">
        <span className="minigame-stage-rail-label">Current challenge</span>
        <strong className="minigame-stage-rail-value">{currentRound} of {targetRounds}</strong>
        <div className="minigame-stage-rail-progress" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="minigame-stage-rail-card">
        <span className="minigame-stage-rail-label">Mode</span>
        <strong className="minigame-stage-rail-value">{modeTitle}</strong>
        <p className="minigame-stage-rail-copy">Stay on the current prompt until the answer resolves.</p>
      </div>

      <div className="minigame-stage-rail-card">
        <span className="minigame-stage-rail-label">Live status</span>
        <strong className="minigame-stage-rail-value">{sessionPoints} pts</strong>
        <p className="minigame-stage-rail-copy">
          {livesEnabled ? `${livesRemaining} lives remaining.` : 'Lives disabled for this run.'}
        </p>
      </div>
    </aside>
  )
}