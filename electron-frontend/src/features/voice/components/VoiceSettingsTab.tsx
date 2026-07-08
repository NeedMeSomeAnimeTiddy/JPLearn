import { useCallback } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Volume2, ChevronDown, Download, RefreshCw, RotateCcw, Trash2, CheckCircle2, Circle } from 'lucide-react'
import type { UseVoiceReturn } from '../useVoice'
import type { VoiceSettingsFields } from '../types'
import type { Dispatch, SetStateAction } from 'react'
import { VOICE_SAMPLE_LINE } from '../constants'

interface VoiceSettingsTabProps {
  voice: UseVoiceReturn
  settings: VoiceSettingsFields
  setSettings: Dispatch<SetStateAction<VoiceSettingsFields>>
  collapsedSettingsSections: Partial<Record<string, boolean>>
  toggleThemeSectionCollapsed: (sectionId: string) => void
  formatModelSize: (sizeMb: number) => string
  formatMinutes: (minutes?: number | null) => string
  tutorInstallInfo: {
    speechModels?: Array<{ tier: string; label: string; description: string; sizeMb: number; installed: boolean; estimatedDownloadMinutes?: number | null }>
    activeSpeechModelTier?: string | null
    recommendedSpeechTier?: string
    voiceInstalled?: boolean
    voiceModels?: Array<{ tier: string; label: string; description: string; installed: boolean; estimatedDownloadMinutes?: number | null }>
    activeVoiceModel?: string | null
  } | null
}

function SettingsCollapsibleSection({
  id,
  title,
  description,
  meta,
  collapsed,
  onToggle,
  className,
  actions,
  children,
}: {
  id: string
  title: string
  description?: string
  meta?: React.ReactNode
  collapsed: boolean
  onToggle: () => void
  className?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
    }
  }, [onToggle])

  return (
    <section className={`settings-collapsible-card${className ? ` ${className}` : ''}`}>
      <div
        className="settings-collapsible-head"
        role="button"
        tabIndex={0}
        aria-controls={`${id}-body`}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-collapsible-copy">
          <p className="settings-collapsible-title">{title}</p>
          {description ? <p className="settings-collapsible-description">{description}</p> : null}
          {meta ? <p className="settings-collapsible-meta">{meta}</p> : null}
        </div>
        <div className="settings-collapsible-actions">
          {actions ? <div className="settings-collapsible-action-group">{actions}</div> : null}
          <span className={`settings-collapsible-chevron${collapsed ? '' : ' is-open'}`} aria-hidden="true">
            <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
        </div>
      </div>
      <div id={`${id}-body`} className={`settings-collapsible-body${collapsed ? '' : ' is-open'}`}>
        {!collapsed ? children : null}
      </div>
    </section>
  )
}

export function VoiceSettingsTab({
  voice,
  settings,
  setSettings,
  collapsedSettingsSections,
  toggleThemeSectionCollapsed,
  formatModelSize,
  formatMinutes,
  tutorInstallInfo,
}: VoiceSettingsTabProps) {
  const {
    voiceOptions,
    voiceBusy,
    voiceUnavailable,
    voiceRuntimeRunning,
    lastVoiceSynthesis,
    voiceStatusChecked,
    playQuestionAudio,
    speechDownloadingTier,
    speechDownloadProgress,
    speechDownloadMethod,
    speechModelActionTier,
    downloadSpeechModel,
    selectSpeechModel,
    uninstallSpeechModel,
    getSpeechModelHardwareFit,
    voiceEngineDownloadingTier,
    voiceEngineDownloadProgress,
    voiceEngineDownloadMethod,
    downloadVoiceEngineModel,
  } = voice

  const voiceStatus = voice.lastVoiceSynthesis ? { lastError: undefined as string | undefined } : null

  return (
    <>
      <SettingsCollapsibleSection
        id="speech-recognition"
        title="Speech Recognition"
        description="Local offline speech-to-text used to answer minigame questions by speaking. Runs entirely on your device."
        meta={(tutorInstallInfo?.speechModels ?? []).some((model) => model.installed) ? 'Installed' : 'Not installed'}
        collapsed={Boolean(collapsedSettingsSections['speech-recognition'])}
        onToggle={() => toggleThemeSectionCollapsed('speech-recognition')}
        className="settings-theme-card"
      >
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {(tutorInstallInfo?.speechModels ?? []).map((model) => {
            const isDownloadingThis = speechDownloadingTier === model.tier
            const isActioningThis = speechModelActionTier === model.tier
            const isActiveTier = tutorInstallInfo?.activeSpeechModelTier === model.tier
            const speechHardwareFit = getSpeechModelHardwareFit(model.tier as any)

            return (
              <div
                key={model.tier}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: '2px',
                  background: 'color-mix(in oklab, var(--panel-bg-alt) 58%, transparent)',
                  border: isActiveTier
                    ? '1px solid color-mix(in oklab, var(--accent) 62%, var(--panel-border))'
                    : '1px solid color-mix(in oklab, var(--panel-border) 86%, transparent)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {model.label}
                      {isActiveTier ? ' · Active' : ''}
                    </p>
                    <p className="settings-help" style={{ marginTop: '0.25rem' }}>
                      {formatModelSize(model.sizeMb)} · {formatMinutes(model.estimatedDownloadMinutes)}
                    </p>
                    <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                      {model.installed ? 'Installed' : model.description}
                    </p>
                    <p
                      className="settings-help"
                      style={{
                        marginTop: '0.2rem',
                        color: speechHardwareFit.tone === 'warning'
                          ? 'rgba(242, 181, 111, 0.92)'
                          : 'var(--text-soft)',
                      }}
                    >
                      {speechHardwareFit.badge} · {speechHardwareFit.detail}
                    </p>
                    {tutorInstallInfo?.recommendedSpeechTier === model.tier ? (
                      <p className="settings-help" style={{ marginTop: '0.2rem', color: 'var(--accent)' }}>
                        Recommended for this hardware
                      </p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {model.installed ? (
                      <button
                        type="button"
                        className={`settings-card-icon-button ${isActiveTier ? 'is-active' : ''}`}
                        onClick={() => { void (selectSpeechModel as any)(model.tier) }}
                        disabled={isActiveTier || speechModelActionTier !== null || speechDownloadingTier !== null}
                        aria-label={isActiveTier ? `${model.label} is the active speech model` : `Use ${model.label} for speech recognition`}
                        title={isActiveTier ? 'Currently active' : 'Use this model'}
                      >
                        {isActiveTier ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" /> : <Circle size={18} strokeWidth={2.25} aria-hidden="true" />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="settings-card-icon-button"
                      onClick={() => { void (downloadSpeechModel as any)(model.tier, model.installed ? { force: true } : undefined) }}
                      disabled={speechDownloadingTier !== null || speechModelActionTier !== null}
                      aria-label={model.installed ? `Reinstall ${model.label}` : `Download ${model.label}`}
                      title={model.installed ? `Reinstall ${model.label}` : `Download ${model.label}`}
                    >
                      {isDownloadingThis
                        ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                        : model.installed
                          ? <RotateCcw size={18} strokeWidth={2.25} aria-hidden="true" />
                          : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                    </button>
                    {model.installed ? (
                      <button
                        type="button"
                        className="settings-inline-icon-button"
                        onClick={() => { void (uninstallSpeechModel as any)(model.tier) }}
                        disabled={speechModelActionTier !== null || speechDownloadingTier !== null}
                        aria-label={`Uninstall ${model.label}`}
                        title={`Uninstall ${model.label}`}
                      >
                        {isActioningThis
                          ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                          : <Trash2 size={18} strokeWidth={2.25} aria-hidden="true" />}
                      </button>
                    ) : null}
                  </div>
                </div>
                {isDownloadingThis ? (
                  <div>
                    <div className="settings-progress-track">
                      <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, speechDownloadProgress))}%` }} />
                    </div>
                    <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                      Downloading… {Math.round(speechDownloadProgress)}%{speechDownloadMethod ? ` [${speechDownloadMethod}]` : ''}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <p className="settings-help" style={{ marginTop: '0.75rem' }}>
          Select the circle icon to switch the active speech recognition model. If no model is
          installed, speech-answer minigame rounds fall back to typed answers.
        </p>
      </SettingsCollapsibleSection>

      <div
        className="settings-section settings-control-row settings-control-row-no-icon"
        role="tabpanel"
        id="settings-panel-voice"
        aria-labelledby="settings-tab-voice"
      >
        <div className="settings-control-content">
          <p className="settings-section-label">Voice</p>
          <div className="settings-animation-grid" role="group" aria-label="Japanese voice controls">
            <button
              type="button"
              className={`settings-icon-entry settings-theme-entry ${settings.voiceEnabled ? 'is-active' : ''}`}
              onClick={() => setSettings((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))}
              aria-label={settings.voiceEnabled ? 'Spoken prompts enabled. Activate to disable.' : 'Spoken prompts disabled. Activate to enable.'}
              aria-pressed={settings.voiceEnabled}
              title={settings.voiceEnabled ? 'Spoken prompts enabled' : 'Spoken prompts disabled'}
            >
              <span className={`settings-mode-icon-button ${settings.voiceEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <span className="settings-icon-entry-label">{settings.voiceEnabled ? 'Voice On' : 'Voice Off'}</span>
            </button>

            {settings.ambientAudioEnabled !== undefined ? (
              <button
                type="button"
                className={`settings-icon-entry settings-theme-entry ${settings.ambientAudioEnabled ? 'is-active' : ''}`}
                onClick={() => setSettings((prev) => ({ ...prev, ambientAudioEnabled: !prev.ambientAudioEnabled }))}
                aria-label={settings.ambientAudioEnabled ? 'Ambient audio enabled. Activate to disable.' : 'Ambient audio disabled. Activate to enable.'}
                aria-pressed={settings.ambientAudioEnabled}
                title={settings.ambientAudioEnabled ? 'Ambient audio on' : 'Ambient audio off'}
              >
                <span className={`settings-mode-icon-button ${settings.ambientAudioEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                  <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
                </span>
                <span className="settings-icon-entry-label">{settings.ambientAudioEnabled ? 'Ambience On' : 'Ambience Off'}</span>
              </button>
            ) : null}

            {settings.voiceEnabled
              ? voiceOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`settings-icon-entry settings-theme-entry ${settings.voiceSpeaker === option.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, voiceSpeaker: option.id }))
                    void playQuestionAudio(VOICE_SAMPLE_LINE, option.id)
                  }}
                  disabled={voiceBusy}
                  aria-label={`Use voice ${option.name} (${option.search}) and hear a sample`}
                  aria-pressed={settings.voiceSpeaker === option.id}
                  title={`${option.name} · ${option.search} — click to hear a sample`}
                >
                  <span className={`settings-mode-icon-button ${settings.voiceSpeaker === option.id ? 'is-enabled' : ''}`} aria-hidden="true">
                    <Volume2 size={18} strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span className="settings-icon-entry-label">{option.name}</span>
                </button>
              ))
              : null}

          </div>

          <p className="settings-help" style={{ marginTop: '0.65rem' }}>
            {settings.voiceEnabled
              ? 'Click a voice to hear a sample. The speaker button in games reads prompts aloud.'
              : 'Turn Voice on to read prompts aloud with the speaker button in games.'}
            {voiceUnavailable ? ' (Voice runtime unavailable right now.)' : ''}
          </p>
          <p className="settings-help">
            VOICEVOX runtime: {
              !voiceStatusChecked
                ? 'Checking status…'
                : voiceRuntimeRunning
                  ? 'Running'
                  : 'Not running'
            }
            {!voiceRuntimeRunning && voiceStatus?.lastError
              ? ` (${voiceStatus.lastError})`
              : ''}
          </p>
          <p className="settings-help">
            Synthesis debug: {lastVoiceSynthesis
              ? `${lastVoiceSynthesis.mode}, ${lastVoiceSynthesis.profile}, ${Math.max(0, Math.round(lastVoiceSynthesis.elapsedMs))}ms`
              : 'No playback yet.'}
          </p>

          <SettingsCollapsibleSection
            id="voicevox-runtime"
            title="VOICEVOX Runtime"
            description="Install VOICEVOX from Settings and use it for local Japanese speech playback."
            meta={tutorInstallInfo?.voiceInstalled ? 'Already installed' : 'Not installed'}
            collapsed={Boolean(collapsedSettingsSections['voicevox-runtime'])}
            onToggle={() => toggleThemeSectionCollapsed('voicevox-runtime')}
            className="settings-theme-card"
          >
            <div style={{ display: 'grid', gap: '0.65rem' }}>
              {(tutorInstallInfo?.voiceModels ?? []).map((model) => {
                const isDownloadingThis = voiceEngineDownloadingTier === model.tier
                const isActiveTier = tutorInstallInfo?.activeVoiceModel === model.tier

                return (
                  <div
                    key={model.tier}
                    style={{
                      padding: '0.75rem 0.9rem',
                      borderRadius: '2px',
                      background: 'color-mix(in oklab, var(--panel-bg-alt) 58%, transparent)',
                      border: isActiveTier
                        ? '1px solid color-mix(in oklab, var(--accent) 62%, var(--panel-border))'
                        : '1px solid color-mix(in oklab, var(--panel-border) 86%, transparent)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>
                          {model.label}
                          {isActiveTier ? ' · Active' : ''}
                        </p>
                        <p className="settings-help" style={{ marginTop: '0.25rem' }}>
                          {model.installed ? 'Installed' : model.description}
                        </p>
                        <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                          {formatMinutes(model.estimatedDownloadMinutes)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="settings-card-icon-button"
                          onClick={() => { void (downloadVoiceEngineModel as any)(model.tier) }}
                          disabled={voiceEngineDownloadingTier !== null}
                          aria-label={model.installed ? `Reinstall ${model.label}` : `Install ${model.label}`}
                          title={model.installed ? `Reinstall ${model.label}` : `Install ${model.label}`}
                        >
                          {isDownloadingThis
                            ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                            : model.installed
                              ? <RotateCcw size={18} strokeWidth={2.25} aria-hidden="true" />
                              : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    {isDownloadingThis ? (
                      <div>
                        <div className="settings-progress-track">
                          <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, voiceEngineDownloadProgress))}%` }} />
                        </div>
                        <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                          Installing… {Math.round(voiceEngineDownloadProgress)}%{voiceEngineDownloadMethod ? ` [${voiceEngineDownloadMethod}]` : ''}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <p className="settings-help" style={{ marginTop: '0.75rem' }}>
              Installing from this section will also warm up the voice runtime so playback can start immediately.
            </p>
          </SettingsCollapsibleSection>
        </div>
      </div>
    </>
  )
}
