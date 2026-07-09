import type { SetupMode } from '../types'

interface SetupModePageProps {
  mode: SetupMode
  onChange: (mode: SetupMode) => void
}

export function SetupModePage({ mode, onChange }: SetupModePageProps) {
  return (
    <div className="setup-mode-grid">
      <button
        type="button"
        onClick={() => onChange('simple')}
        className={`setup-mode-card${mode === 'simple' ? ' is-selected' : ''}`}
      >
        <div className="setup-mode-card-title">Simple setup</div>
        <div className="setup-mode-card-desc">
          Downloads only offline dictionary + fastest speech recognition model.
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange('advanced')}
        className={`setup-mode-card${mode === 'advanced' ? ' is-selected' : ''}`}
      >
        <div className="setup-mode-card-title">Advanced setup</div>
        <div className="setup-mode-card-desc">
          Choose tutor model, voice model, speech tier, fonts, dictionary, and shortcuts.
        </div>
      </button>
    </div>
  )
}
