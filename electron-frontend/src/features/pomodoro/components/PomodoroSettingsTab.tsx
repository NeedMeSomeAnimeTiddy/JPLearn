import { Clock } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { SettingsCollapsibleSection } from '../../../components/SettingsCollapsibleSection'
import { POMODORO_PRESETS } from '../constants'
import type { PomodoroSettingsFields } from '../types'

interface PomodoroSettingsTabProps {
  settings: PomodoroSettingsFields
  setSettings: Dispatch<SetStateAction<PomodoroSettingsFields>>
  collapsed: boolean
  onToggle: () => void
}

const DURATION_INPUTS = [
  { key: 'pomodoroWorkMinutes' as const, label: 'Work', min: 1, max: 120 },
  { key: 'pomodoroBreakMinutes' as const, label: 'Break', min: 1, max: 30 },
  { key: 'pomodoroLongBreakMinutes' as const, label: 'Long break', min: 1, max: 60 },
] as const

export function PomodoroSettingsTab({
  settings,
  setSettings,
  collapsed,
  onToggle,
}: PomodoroSettingsTabProps) {
  const activePreset = POMODORO_PRESETS.find(
    (p) =>
      p.work === settings.pomodoroWorkMinutes &&
      p.break === settings.pomodoroBreakMinutes &&
      p.longBreak === settings.pomodoroLongBreakMinutes,
  )

  function applyPreset(key: (typeof POMODORO_PRESETS)[number]['key']) {
    const preset = POMODORO_PRESETS.find((p) => p.key === key)
    if (!preset) return
    setSettings((prev) => ({
      ...prev,
      pomodoroWorkMinutes: preset.work,
      pomodoroBreakMinutes: preset.break,
      pomodoroLongBreakMinutes: preset.longBreak,
    }))
  }

  function handleDurationChange(key: string, raw: string, min: number, max: number) {
    const value = Math.max(min, Math.min(max, parseInt(raw, 10) || min))
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <SettingsCollapsibleSection
      id="pomodoro"
      title="Study Timer"
      description="Pomodoro-style focus timer with work intervals and break reminders."
      collapsed={collapsed}
      onToggle={onToggle}
      className="settings-theme-card"
      hideChevron
    >
      <div className="settings-control-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="settings-animation-grid" role="group" aria-label="Pomodoro timer controls">
          <button
            type="button"
            className={`settings-icon-entry settings-theme-entry ${settings.pomodoroEnabled ? 'is-active' : ''}`}
            onClick={() => setSettings((prev) => ({ ...prev, pomodoroEnabled: !prev.pomodoroEnabled }))}
            aria-label={settings.pomodoroEnabled ? 'Timer enabled. Click to disable.' : 'Timer disabled. Click to enable.'}
            aria-pressed={settings.pomodoroEnabled}
            title={settings.pomodoroEnabled ? 'Timer enabled' : 'Timer disabled'}
          >
            <span className={`settings-mode-icon-button ${settings.pomodoroEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
              <Clock size={18} strokeWidth={2.25} />
            </span>
            <span className="settings-icon-entry-label">Enable study timer</span>
          </button>
        </div>

        {settings.pomodoroEnabled ? (
          <>
            <div className="settings-section">
              <p className="settings-section-label">Preset</p>
              <div className="settings-animation-grid" role="group" aria-label="Timer presets">
                {POMODORO_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={`settings-icon-entry settings-theme-entry ${
                      activePreset?.key === preset.key ? 'is-active' : ''
                    }`}
                    onClick={() => applyPreset(preset.key)}
                    aria-label={`${preset.label}: ${preset.work}m work, ${preset.break}m break`}
                    aria-pressed={activePreset?.key === preset.key}
                  >
                    <span className="settings-icon-entry-label">{preset.label}</span>
                    <span className="settings-help" style={{ fontSize: '0.68rem', margin: 0 }}>
                      {preset.work}m / {preset.break}m
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <p className="settings-section-label">Duration</p>
              <div className="pomodoro-duration-grid">
                {DURATION_INPUTS.map(({ key, label, min, max }) => (
                  <label key={key} className="pomodoro-duration-field">
                    <span className="pomodoro-duration-label">{label}</span>
                    <div className="pomodoro-duration-input-wrap">
                      <input
                        type="number"
                        className="pomodoro-duration-input"
                        min={min}
                        max={max}
                        value={settings[key]}
                        onChange={(e) => handleDurationChange(key, e.target.value, min, max)}
                      />
                      <span className="pomodoro-duration-suffix">min</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <label className="pomodoro-duration-field" style={{ maxWidth: 200 }}>
                <span className="pomodoro-duration-label">Sessions before long break</span>
                <div className="pomodoro-duration-input-wrap">
                  <input
                    type="number"
                    className="pomodoro-duration-input"
                    min={1}
                    max={10}
                    value={settings.pomodoroSessionsBeforeLongBreak}
                    onChange={(e) => {
                      const value = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 4))
                      setSettings((prev) => ({ ...prev, pomodoroSessionsBeforeLongBreak: value }))
                    }}
                  />
                </div>
              </label>
            </div>
          </>
        ) : null}
      </div>
    </SettingsCollapsibleSection>
  )
}
