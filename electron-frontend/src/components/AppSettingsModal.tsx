// Extracted verbatim from App.tsx (issue #69). Presentational only -- all settings
// state stays owned by App and is passed in; this renders the modal shell and
// delegates each tab to its existing feature component.
import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  Activity, ArrowRight, BookText, BrainCircuit, CheckCircle2, Circle, Download, Flame,
  Keyboard, Languages, MessageCircle, Minimize2, Minus, PlayCircle, Power,
  RefreshCw, RotateCcw, Trash2, Upload, X,
} from 'lucide-react'
import type { AppSettings, SettingsTabKey } from '../types'
import type { useTheme } from '../features/theme'
import type { useVoice } from '../features/voice'
import type { useCursor } from '../features/cursor'
import type { useModels } from '../features/models'
import { ThemeSettingsTab } from '../features/theme/components/ThemeSettingsTab'
import { VoiceSettingsTab, type VoiceSettingsFields } from '../features/voice'
import { CursorSettingsTab } from '../features/cursor'
import { PomodoroSettingsTab, type PomodoroSettingsFields } from '../features/pomodoro'
import { TutorSettingsTab, clampAssistantChatOcrMinConfidence, type TutorSettingsFields } from '../features/tutor'
import { SettingsCollapsibleSection } from './SettingsCollapsibleSection'
import {
  SETTINGS_TABS, APP_FONT_OPTIONS, FONT_SIZE_ICON, FONT_SIZE_LABEL, MOTION_STYLE_OPTIONS, MOTION_STYLE_LABEL,
} from '../constants'

export interface AppSettingsModalProps {
  closeSettings: () => void
  activeSettingsTab: SettingsTabKey
  setActiveSettingsTab: Dispatch<SetStateAction<SettingsTabKey>>
  settings: AppSettings
  setSettings: Dispatch<SetStateAction<AppSettings>>
  collapsedSettingsSections: Partial<Record<string, boolean>>
  shortcutsSectionRef: RefObject<HTMLDivElement | null>
  advanceFontSize: () => void
  reloadLocalFonts: () => void
  theme: ReturnType<typeof useTheme>
  voice: ReturnType<typeof useVoice>
  cursor: ReturnType<typeof useCursor>
  models: ReturnType<typeof useModels>
  resetConfirmStep: 0 | 1 | 2
  setResetConfirmStep: Dispatch<SetStateAction<0 | 1 | 2>>
  resettingDb: boolean
  resetStudyDb: () => void | Promise<void>
  backupLoading: boolean
  backupMessage: string | null
  exportBackup: () => void | Promise<void>
  importBackup: () => void | Promise<void>
  optimizingFSRS: boolean
  optimizeFSRSWeights: () => void | Promise<void>
  resetFSRSWeights: () => void | Promise<void>
  fsrsCustom: boolean
  fsrsResult: { ok: boolean; error?: string; loss_before?: number; loss_after?: number; card_count?: number; log_count?: number } | null
  closeBehavior: 'ask' | 'tray' | 'quit'
  setCloseBehavior: Dispatch<SetStateAction<'ask' | 'tray' | 'quit'>>
  autoStartOnLogin: boolean
  setAutoStartOnLogin: Dispatch<SetStateAction<boolean>>
}

export function AppSettingsModal({
  closeSettings,
  activeSettingsTab,
  setActiveSettingsTab,
  settings,
  setSettings,
  collapsedSettingsSections,
  shortcutsSectionRef,
  advanceFontSize,
  reloadLocalFonts,
  theme,
  voice,
  cursor,
  models,
  resetConfirmStep,
  setResetConfirmStep,
  resettingDb,
  resetStudyDb,
  backupLoading,
  backupMessage,
  exportBackup,
  importBackup,
  optimizingFSRS,
  optimizeFSRSWeights,
  resetFSRSWeights,
  fsrsCustom,
  fsrsResult,
  closeBehavior,
  setCloseBehavior,
  autoStartOnLogin,
  setAutoStartOnLogin,
}: AppSettingsModalProps) {
  const { toggleThemeSectionCollapsed } = theme

  return (
          <div
            className="modal-backdrop settings-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeSettings()
            }}
          >
            <div
              className="modal-panel settings-panel settings-sheet crt-scanlines"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              <div className="crt-vhs-line" />
              <div className="settings-sheet-grabber" aria-hidden="true" />
              <div className="settings-modal-header cassette-panel-header">
                <div />
                <div className="cassette-panel-header-center">
                  <span className="cassette-panel-header-catalog">QUICK APP CONTROLS</span>
                  <h2 id="settings-title" className="cassette-panel-header-title">Control Panel</h2>
                </div>
                <button
                  type="button"
                  className="panel-close-button"
                  onClick={closeSettings}
                  aria-label="Close settings"
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>

              <div className="settings-sheet-body">
                <div className="settings-tab-list" role="tablist" aria-label="Settings sections">
                  {SETTINGS_TABS.map((tab) => {
                    const TabIcon = tab.icon
                    const isActive = activeSettingsTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`settings-panel-${tab.key}`}
                        id={`settings-tab-${tab.key}`}
                        className={`settings-tab-button ${isActive ? 'is-active' : ''}`}
                        onClick={() => setActiveSettingsTab(tab.key)}
                      >
                        <TabIcon size={15} strokeWidth={2.2} aria-hidden="true" />
                        <span>{tab.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="settings-control-grid">
                  <div style={{ display: activeSettingsTab === 'appearance' ? undefined : 'none' }}>
                  <SettingsCollapsibleSection
                    id="theme"
                    title="Theme"
                    description="Customize colors, presets, and accent tones."
                    collapsed={Boolean(collapsedSettingsSections['theme'])}
                    onToggle={() => toggleThemeSectionCollapsed('theme')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <ThemeSettingsTab
                      {...theme}
                      settings={settings}
                      collapsedSettingsSections={collapsedSettingsSections}
                    />
                  </SettingsCollapsibleSection>


                  <SettingsCollapsibleSection
                    id="typography"
                    title="Typography"
                    description="Font size, font family, and local fonts."
                    collapsed={Boolean(collapsedSettingsSections['typography'])}
                    onToggle={() => toggleThemeSectionCollapsed('typography')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <p className="settings-section-label">Font Size</p>
                    <button
                      type="button"
                      className="settings-icon-entry settings-icon-entry-button"
                      onClick={advanceFontSize}
                      aria-label={`Font size: ${FONT_SIZE_LABEL[settings.fontSize]}. Activate to cycle.`}
                      title={`Font size: ${FONT_SIZE_LABEL[settings.fontSize]}`}
                    >
                      <span className="settings-mode-icon-button" aria-hidden="true">
                        {(() => {
                          const Icon = FONT_SIZE_ICON[settings.fontSize]
                          return <Icon className="settings-option-glyph" size={18} strokeWidth={2.25} aria-hidden="true" />
                        })()}
                      </span>
                      <span className="settings-icon-entry-label">{FONT_SIZE_LABEL[settings.fontSize]}</span>
                    </button>

                    <p className="settings-section-label" style={{ marginTop: 12 }}>Font Family</p>
                    <div className="settings-animation-grid" role="radiogroup" aria-label="App font family">
                      {APP_FONT_OPTIONS.map((fontOption) => (
                        <button
                          key={fontOption.key}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.appFont === fontOption.key ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, appFont: fontOption.key }))}
                          aria-label={`Use ${fontOption.label} font`}
                          aria-pressed={settings.appFont === fontOption.key}
                          title={fontOption.label}
                        >
                          <span className={`settings-mode-icon-button ${settings.appFont === fontOption.key ? 'is-enabled' : ''}`} aria-hidden="true">
                            <BookText size={18} strokeWidth={2.25} aria-hidden="true" />
                          </span>
                          <span className="settings-icon-entry-label">{fontOption.label}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="settings-icon-entry settings-icon-entry-button"
                      onClick={reloadLocalFonts}
                      aria-label="Reload local font files"
                      title="Reload local fonts"
                      style={{ marginTop: 12 }}
                    >
                      <span className="settings-mode-icon-button" aria-hidden="true">
                        <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <span className="settings-icon-entry-label">Reload Local Fonts</span>
                    </button>
                    <p className="settings-help">Applies to interface text across the app.</p>
                  </SettingsCollapsibleSection>
              
                  <SettingsCollapsibleSection
                    id="animations"
                    title="Animations"
                    description="Motion style and reduced motion preferences."
                    collapsed={Boolean(collapsedSettingsSections['animations'])}
                    onToggle={() => toggleThemeSectionCollapsed('animations')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <p className="settings-section-label">Motion Style</p>
                    <div className="settings-animation-grid" role="radiogroup" aria-label="Animation style">
                      {MOTION_STYLE_OPTIONS.map((motionStyle) => (
                        <button
                          key={motionStyle.key}
                          type="button"
                          className={`settings-icon-entry settings-theme-entry ${settings.motionStyle === motionStyle.key ? 'is-active' : ''}`}
                          onClick={() => setSettings((prev) => ({ ...prev, motionStyle: motionStyle.key }))}
                          aria-label={`Use ${motionStyle.label} animation style`}
                          aria-pressed={settings.motionStyle === motionStyle.key}
                          title={motionStyle.label}
                        >
                          <span className={`settings-mode-icon-button ${settings.motionStyle === motionStyle.key ? 'is-enabled' : ''}`} aria-hidden="true">
                            {motionStyle.key === 'calm_fade' ? (
                              <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
                            ) : motionStyle.key === 'glide' ? (
                              <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
                            ) : (
                              <Flame size={18} strokeWidth={2.25} aria-hidden="true" />
                            )}
                          </span>
                          <span className="settings-icon-entry-label">{MOTION_STYLE_LABEL[motionStyle.key]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="settings-theme-card settings-collapsible-card-inline" style={{ marginTop: 10 }}>
                      <p className="settings-section-label" style={{ marginBottom: 8 }}>Reduce Motion</p>
                      <button
                        type="button"
                        className={`settings-toggle settings-reduced-motion-toggle ${settings.reducedMotion ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }))}
                        aria-label={settings.reducedMotion ? 'Reduce motion enabled. Activate to disable.' : 'Reduce motion disabled. Activate to enable.'}
                        aria-pressed={settings.reducedMotion}
                        title={settings.reducedMotion ? 'Reduce motion enabled' : 'Reduce motion disabled'}
                      >
                        <span className={`settings-mode-icon-button ${settings.reducedMotion ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Activity size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-toggle-copy">
                          <span className="settings-icon-entry-label">Reduce Motion</span>
                          <span className="settings-note">Minimize movement across the interface.</span>
                        </span>
                      </button>
                    </div>
                  </SettingsCollapsibleSection>
                  <SettingsCollapsibleSection
                    id="study-display"
                    title="Study Display"
                    description="Furigana reading aid and kanji display preferences."
                    collapsed={Boolean(collapsedSettingsSections['study-display'])}
                    onToggle={() => toggleThemeSectionCollapsed('study-display')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div className="settings-animation-grid" role="group" aria-label="Reading aid controls">
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.furiganaEnabled ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, furiganaEnabled: !prev.furiganaEnabled }))}
                        aria-label={settings.furiganaEnabled ? 'Furigana reading aid visible. Activate to hide.' : 'Furigana reading aid hidden. Activate to show.'}
                        aria-pressed={settings.furiganaEnabled}
                        title={settings.furiganaEnabled ? 'Furigana visible' : 'Furigana hidden'}
                      >
                        <span className={`settings-mode-icon-button ${settings.furiganaEnabled ? 'is-enabled' : ''}`} aria-hidden="true">
                          <Languages size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">Show furigana (kana above kanji)</span>
                      </button>
                      <button
                        type="button"
                        className={`settings-icon-entry settings-theme-entry ${settings.furiganaAutoHideMastered ? 'is-active' : ''}`}
                        onClick={() => setSettings((prev) => ({ ...prev, furiganaAutoHideMastered: !prev.furiganaAutoHideMastered }))}
                        aria-label={settings.furiganaAutoHideMastered ? 'Furigana auto-hide on mastered cards is enabled. Activate to disable.' : 'Furigana auto-hide on mastered cards is disabled. Activate to enable.'}
                        aria-pressed={settings.furiganaAutoHideMastered}
                        title={settings.furiganaAutoHideMastered ? 'Auto-hide enabled' : 'Auto-hide disabled'}
                      >
                        <span className={`settings-mode-icon-button ${settings.furiganaAutoHideMastered ? 'is-enabled' : ''}`} aria-hidden="true">
                          <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                        </span>
                        <span className="settings-icon-entry-label">Auto-hide furigana on mastered cards</span>
                      </button>
                    </div>
                    <p className="settings-help">When on, kana readings appear above kanji during review. When auto-hide is also enabled, cards you've mastered will hide furigana — helping you graduate from reading aids.</p>
                  </SettingsCollapsibleSection>
                  <SettingsCollapsibleSection
                    id="cursor"
                    title="Cursor"
                    description="Custom cursor style and appearance."
                    collapsed={Boolean(collapsedSettingsSections['cursor'])}
                    onToggle={() => toggleThemeSectionCollapsed('cursor')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <CursorSettingsTab cursor={cursor} />
                  </SettingsCollapsibleSection>
                </div>
                <div style={{ display: activeSettingsTab === 'assistant' ? undefined : 'none' }}>
                  <SettingsCollapsibleSection
                    id="tutor-assistant"
                    title="Tutor Assistant"
                    description="Chat behavior, toast limits, and audio prompts."
                    collapsed={Boolean(collapsedSettingsSections['tutor-assistant'])}
                    onToggle={() => toggleThemeSectionCollapsed('tutor-assistant')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <TutorSettingsTab settings={settings as TutorSettingsFields} setSettings={setSettings as unknown as Dispatch<SetStateAction<TutorSettingsFields>>} />
                  </SettingsCollapsibleSection>
              
                  <SettingsCollapsibleSection
                    id="tutor-models"
                    title="Tutor models"
                    description="Download or reinstall the local model tiers used by the Tutor runtime."
                    meta={(
                      <>
                        {models.tutorInstallInfo?.llamaCppInstalled ? 'llama.cpp installed' : 'llama.cpp not installed'}
                        {' '}· Recommended tier: <strong style={{ color: 'var(--text-main)' }}>{models.tutorInstallInfo?.models.find((model) => model.tier === models.tutorInstallInfo?.recommendedTier)?.label ?? '—'}</strong>
                      </>
                    )}
                    collapsed={Boolean(collapsedSettingsSections['tutor-models'])}
                    onToggle={() => toggleThemeSectionCollapsed('tutor-models')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                      {(models.tutorInstallInfo?.models ?? []).map((model) => {
                        const isDownloadingThis = models.tutorDownloadingTier === model.tier
                        const isActioningThis = models.tutorModelActionTier === model.tier
                        const isActiveTier = models.tutorInstallInfo?.activeModelTier === model.tier
                        const hardwareFit = models.getTutorModelHardwareFit(model.tier)
                        const showRecommendedBadge = model.tier === models.tutorInstallInfo?.recommendedTier
                          && hardwareFit.badge === 'Recommended fit'
                        const badges = [
                          showRecommendedBadge ? 'Recommended' : null,
                          isActiveTier ? 'Active' : null,
                          hardwareFit.badge,
                        ].filter(Boolean).join(' · ')

                        return (
                          <div
                            key={model.tier}
                            style={{
                              padding: '0.75rem 0.9rem',
                              borderRadius: '2px',
                              background: 'color-mix(in oklab, var(--panel-bg-alt) 60%, transparent)',
                              border: isActiveTier
                                ? '1px solid color-mix(in oklab, var(--accent) 62%, var(--panel-border))'
                                : showRecommendedBadge
                                  ? '1px solid color-mix(in oklab, var(--accent) 42%, var(--panel-border))'
                                  : '1px solid color-mix(in oklab, var(--panel-border) 86%, transparent)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 600 }}>
                                  {model.label}
                                  {badges ? ` · ${badges}` : ''}
                                </p>
                                <p className="settings-help" style={{ marginTop: '0.25rem' }}>
                                  {models.formatCombinedModelSize(model.sizeMb, model.embedderSizeMb)} · {models.formatMinutes(model.estimatedDownloadMinutes)}
                                </p>
                                <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                  {model.installed ? 'Installed' : model.description}
                                </p>
                                <p className="settings-help" style={{ marginTop: '0.2rem', color: hardwareFit.isOk ? 'rgba(242, 181, 111, 0.92)' : 'var(--status-error)' }}>
                                  {hardwareFit.detail}
                                </p>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                {model.installed ? (
                                  <button
                                    type="button"
                                    className={`settings-card-icon-button ${isActiveTier ? 'is-active' : ''}`}
                                    onClick={() => { void models.selectTutorModel(model.tier) }}
                                    disabled={isActiveTier || models.tutorModelActionTier !== null || models.tutorDownloadingTier !== null}
                                    aria-label={isActiveTier ? `${model.label} is the active Tutor model` : `Use ${model.label} for the Tutor`}
                                    title={isActiveTier ? 'Currently active' : 'Use this model'}
                                  >
                                    {isActiveTier ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" /> : <Circle size={18} strokeWidth={2.25} aria-hidden="true" />}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="settings-card-icon-button"
                                  onClick={() => { void models.downloadTutorModel(model.tier) }}
                                  disabled={models.tutorDownloadingTier !== null || models.tutorModelActionTier !== null}
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
                                    onClick={() => { void models.uninstallTutorModel(model.tier) }}
                                    disabled={models.tutorModelActionTier !== null || models.tutorDownloadingTier !== null}
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
                                  <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, models.tutorDownloadProgress?.percent ?? 0))}%` }} />
                                </div>
                                <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                  {models.tutorDownloadProgress?.mb != null && models.tutorDownloadProgress?.totalMb != null
                                    ? `${models.tutorDownloadProgress.mb.toFixed(0)} / ${models.tutorDownloadProgress.totalMb.toFixed(0)} MB · ${Math.round(models.tutorDownloadProgress.percent)}%${models.tutorDownloadMethod ? ` [${models.tutorDownloadMethod}]` : ''}`
                                    : `Downloading… ${Math.round(models.tutorDownloadProgress?.percent ?? 0)}%${models.tutorDownloadMethod ? ` [${models.tutorDownloadMethod}]` : ''}`}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                      {(() => {
                        const embedderLabel = models.tutorInstallInfo?.activeEmbedderLabel
                          ?? (models.tutorInstallInfo?.activeEmbedderTier ? models.tutorInstallInfo.activeEmbedderTier.replace('_', '-').toUpperCase() : null)
                        if (!embedderLabel) {
                          return 'Embedder: none active yet. Select a Tutor model to enable retrieval embeddings.'
                        }
                        const installState = models.tutorInstallInfo?.activeEmbedderInstalled ? 'installed' : 'not installed'
                        const enabledState = models.tutorInstallInfo?.activeEmbedderEnabled ? 'enabled' : 'disabled'
                        return `Embedder: ${embedderLabel} · ${installState} · ${enabledState}`
                      })()}
                    </p>
                    <p className="settings-help" style={{ marginTop: '0.45rem' }}>
                      Select the circle icon to switch the Tutor to that model. Changes apply automatically without restarting the app.
                    </p>
                  </SettingsCollapsibleSection>
              
                  <SettingsCollapsibleSection
                    id="offline-dictionary"
                    title="Offline Dictionary"
                    description="Provides offline Japanese↔English lookup with JMdict definitions and Kanjium pitch accent data."
                    meta={models.tutorInstallInfo?.dictionaryInstalled ? 'Installed' : `Not installed • ${models.formatMinutes(models.tutorInstallInfo?.dictionaryEstimatedDownloadMinutes)}`}
                    collapsed={Boolean(collapsedSettingsSections['offline-dictionary'])}
                    onToggle={() => toggleThemeSectionCollapsed('offline-dictionary')}
                    className="settings-theme-card"
                    hideChevron
                    actions={(
                      <button
                        type="button"
                        className="settings-card-icon-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void models.downloadOfflineDictionary()
                        }}
                        disabled={models.dictionaryDownloading || models.tutorInstallInfo?.dictionaryInstalled}
                        aria-label={models.tutorInstallInfo?.dictionaryInstalled ? 'Offline dictionary installed' : 'Download offline dictionary'}
                        title={models.tutorInstallInfo?.dictionaryInstalled ? 'Offline dictionary installed' : 'Download offline dictionary'}
                      >
                        {models.dictionaryDownloading
                          ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                          : models.tutorInstallInfo?.dictionaryInstalled
                            ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                            : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                      </button>
                    )}
                  >
                    {models.dictionaryDownloading ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div className="settings-progress-track">
                          <div
                            className="settings-progress-fill"
                            style={{ width: `${Math.min(100, Math.max(0, models.dictionaryProgress))}%` }}
                          />
                        </div>
                        <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                          Downloading… {Math.round(models.dictionaryProgress)}%{models.dictionaryDownloadMethod ? ` [${models.dictionaryDownloadMethod}]` : ''}
                        </p>
                      </div>
                    ) : null}
                  </SettingsCollapsibleSection>
              
                  <SettingsCollapsibleSection
                    id="image-ocr"
                    title="Image Translation"
                    description="Install the offline OCR extraction package (PaddleOCR) for imported Japanese text images."
                    meta={(models.tutorInstallInfo?.ocrModels ?? []).some((model) => model.installed) ? 'Installed' : 'Not installed'}
                    collapsed={Boolean(collapsedSettingsSections['image-ocr'])}
                    onToggle={() => toggleThemeSectionCollapsed('image-ocr')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                      {(models.tutorInstallInfo?.translationProfiles ?? []).map((model) => {
                        const isApplyingThis = models.translationProfileApplyingTier === model.tier
                        const isActiveTier = models.tutorInstallInfo?.activeTranslationProfileTier === model.tier

                        return (
                          <div
                            key={model.tier}
                            style={{
                              padding: '0.75rem 0.9rem',
                              borderRadius: '2px',
                              background: 'color-mix(in oklab, var(--panel-bg-alt) 60%, transparent)',
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
                                  {models.formatModelSize(model.sizeMb)} · {models.formatMinutes(model.estimatedDownloadMinutes)}
                                  {model.badge ? ` · ${model.badge}` : ''}
                                </p>
                                <p className="settings-help" style={{ marginTop: '0.2rem' }}>
                                  {model.installed ? 'Installed' : model.description}
                                </p>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <button
                                  type="button"
                                  className="settings-card-icon-button"
                                  onClick={() => { void models.applyTranslationProfile(model.tier) }}
                                  disabled={models.translationProfileApplyingTier !== null}
                                  aria-label={model.installed ? `Reapply ${model.label}` : `Apply ${model.label}`}
                                  title={model.installed ? `Reapply ${model.label}` : `Apply ${model.label}`}
                                >
                                  {isApplyingThis
                                    ? <RefreshCw size={18} strokeWidth={2.25} aria-hidden="true" className="spin-icon" />
                                    : isActiveTier
                                      ? <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                                      : <Download size={18} strokeWidth={2.25} aria-hidden="true" />}
                                </button>
                              </div>
                            </div>
                            {isApplyingThis ? (
                              <div>
                                <div className="settings-progress-track">
                                  <div className="settings-progress-fill" style={{ width: `${Math.min(100, Math.max(0, models.translationProfileProgress))}%` }} />
                                </div>
                                <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                                  Installing... {Math.round(models.translationProfileProgress)}%{models.translationProfileMethod ? ` [${models.translationProfileMethod}]` : ''}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    <p className="settings-help" style={{ marginTop: '0.75rem' }}>
                      OCR translation now uses a single profile: OCR extraction + Qwen3.5-0.8B-JP local translation.
                    </p>
                    <div style={{ marginTop: '0.75rem' }}>
                      <label className="settings-help" htmlFor="assistant-chat-ocr-confidence-slider" style={{ display: 'block', marginBottom: '0.35rem' }}>
                        OCR confidence filter: {Math.round(settings.assistantChatOcrMinConfidence * 100)}%
                      </label>
                      <input
                        id="assistant-chat-ocr-confidence-slider"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.assistantChatOcrMinConfidence}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value)
                          setSettings((prev) => ({
                            ...prev,
                            assistantChatOcrMinConfidence: clampAssistantChatOcrMinConfidence(value),
                          }))
                        }}
                        aria-label="OCR confidence filter"
                      />
                      <p className="settings-help" style={{ marginTop: '0.3rem' }}>
                        Higher values ignore uncertain OCR lines; lower values capture more text with more noise.
                      </p>
                    </div>
                  </SettingsCollapsibleSection>
              
                      <VoiceSettingsTab
                        voice={voice}
                        settings={settings as VoiceSettingsFields}
                        setSettings={setSettings as unknown as Dispatch<SetStateAction<VoiceSettingsFields>>}
                        collapsedSettingsSections={collapsedSettingsSections}
                        toggleThemeSectionCollapsed={toggleThemeSectionCollapsed}
                        formatModelSize={models.formatModelSize}
                        formatMinutes={models.formatMinutes}
                        tutorInstallInfo={models.tutorInstallInfo}
                      />
                </div>
                <div style={{ display: activeSettingsTab === 'system' ? undefined : 'none' }}>
                  <SettingsCollapsibleSection
                    id="keyboard-shortcuts"
                    title="Keyboard Shortcuts"
                    description="Key prompt visibility and shortcut reference."
                    collapsed={Boolean(collapsedSettingsSections['keyboard-shortcuts'])}
                    onToggle={() => toggleThemeSectionCollapsed('keyboard-shortcuts')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        className="settings-icon-tile"
                        onClick={() => shortcutsSectionRef.current?.focus()}
                        aria-label="Focus keyboard shortcuts"
                      >
                        <Keyboard size={18} strokeWidth={2.1} />
                      </button>
                      <div ref={shortcutsSectionRef} className="settings-control-content" tabIndex={-1}>
                        <p className="settings-section-label">Keyboard Shortcuts</p>
                        <div className="settings-animation-grid" role="group" aria-label="Keyboard prompt controls">
                          <button
                            type="button"
                            className={`settings-icon-entry settings-theme-entry ${settings.showKeyboardPrompts ? 'is-active' : ''}`}
                            onClick={() => setSettings((prev) => ({ ...prev, showKeyboardPrompts: !prev.showKeyboardPrompts }))}
                            aria-label={settings.showKeyboardPrompts ? 'Keyboard prompts visible. Activate to hide.' : 'Keyboard prompts hidden. Activate to show.'}
                            aria-pressed={settings.showKeyboardPrompts}
                            title={settings.showKeyboardPrompts ? 'Keyboard prompts visible' : 'Keyboard prompts hidden'}
                          >
                            <span className={`settings-mode-icon-button ${settings.showKeyboardPrompts ? 'is-enabled' : ''}`} aria-hidden="true">
                              <Keyboard size={18} strokeWidth={2.25} aria-hidden="true" />
                            </span>
                            <span className="settings-icon-entry-label">Show key prompts</span>
                          </button>
                        </div>
                        <div className="settings-shortcuts">
                          <code className="command-hint">Ctrl+,</code><span>Settings</span>
                          <code className="command-hint">Esc</code><span>Close modal / back</span>
                          <code className="command-hint">1 / 2 / 3 / 4 / 5</code><span>Learning tracks (home)</span>
                          <code className="command-hint">6</code><span>Study overview (home)</span>
                        </div>
                        <p className="settings-help">When off, shortcut keys still work but hint labels stay hidden in game rounds.</p>
                      </div>
                    </div>
                  </SettingsCollapsibleSection>

                  <PomodoroSettingsTab
                    settings={settings as PomodoroSettingsFields}
                    setSettings={setSettings as unknown as Dispatch<SetStateAction<PomodoroSettingsFields>>}
                    collapsed={Boolean(collapsedSettingsSections['pomodoro'])}
                    onToggle={() => toggleThemeSectionCollapsed('pomodoro')}
                  />

                  <SettingsCollapsibleSection
                    id="close-behavior"
                    title="Window Close Behavior"
                    description="Choose what happens when you click the close button."
                    collapsed={Boolean(collapsedSettingsSections['close-behavior'])}
                    onToggle={() => toggleThemeSectionCollapsed('close-behavior')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        className="settings-icon-tile"
                        aria-label="Close behavior setting"
                      >
                        <Power size={18} strokeWidth={2.1} />
                      </button>
                      <div className="settings-control-content">
                        <p className="settings-section-label">When closing the window</p>
                        <div className="settings-animation-grid" role="radiogroup" aria-label="Close behavior options">
                          {([
                            { key: 'ask' as const, label: 'Ask', desc: 'Show a dialog each time' },
                            { key: 'tray' as const, label: 'Minimize', desc: 'Hide to system tray' },
                            { key: 'quit' as const, label: 'Quit', desc: 'Fully exit the app' },
                          ]).map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              className={`settings-icon-entry settings-theme-entry ${closeBehavior === opt.key ? 'is-active' : ''}`}
                              onClick={() => {
                                setCloseBehavior(opt.key)
                                void window.jplearnDesktop?.setConfigValue?.('closeBehavior', opt.key)
                              }}
                              role="radio"
                              aria-checked={closeBehavior === opt.key}
                              aria-label={`${opt.label}: ${opt.desc}`}
                              title={opt.desc}
                            >
                              <span className={`settings-mode-icon-button ${closeBehavior === opt.key ? 'is-enabled' : ''}`} aria-hidden="true">
                                {opt.key === 'ask' ? <MessageCircle size={18} strokeWidth={2.25} /> : opt.key === 'tray' ? <Minimize2 size={18} strokeWidth={2.25} /> : <Power size={18} strokeWidth={2.25} />}
                              </span>
                              <span className="settings-icon-entry-label">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                        <p className="settings-help">
                          {closeBehavior === 'ask'
                            ? 'A dialog will appear each time you close the window.'
                            : closeBehavior === 'tray'
                              ? 'The window will hide to the system tray. The app keeps running.'
                              : 'The app will fully exit when you close the window.'}
                        </p>
                      </div>
                    </div>
                  </SettingsCollapsibleSection>

                  <SettingsCollapsibleSection
                    id="auto-start"
                    title="Startup"
                    description="Open JPLearn automatically when you log in to your computer."
                    collapsed={Boolean(collapsedSettingsSections['auto-start'])}
                    onToggle={() => toggleThemeSectionCollapsed('auto-start')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <button type="button" className="settings-icon-tile" aria-label="Startup setting">
                        <PlayCircle size={18} strokeWidth={2.1} />
                      </button>
                      <div className="settings-control-content">
                        <p className="settings-section-label">Auto-start on login</p>
                        <div className="settings-animation-grid" role="radiogroup" aria-label="Auto-start options">
                          {([
                            { key: true, label: 'On', desc: 'Start when you log in' },
                            { key: false, label: 'Off', desc: 'Start manually only' },
                          ]).map((opt) => (
                            <button
                              key={String(opt.key)}
                              type="button"
                              className={`settings-icon-entry settings-theme-entry ${autoStartOnLogin === opt.key ? 'is-active' : ''}`}
                              onClick={() => {
                                setAutoStartOnLogin(opt.key)
                                void window.jplearnDesktop?.setConfigValue?.('autoStartOnLogin', opt.key)
                              }}
                              role="radio"
                              aria-checked={autoStartOnLogin === opt.key}
                              aria-label={`${opt.label}: ${opt.desc}`}
                              title={opt.desc}
                            >
                              <span className={`settings-mode-icon-button ${autoStartOnLogin === opt.key ? 'is-enabled' : ''}`} aria-hidden="true">
                                {opt.key ? <CheckCircle2 size={18} strokeWidth={2.25} /> : <Circle size={18} strokeWidth={2.25} />}
                              </span>
                              <span className="settings-icon-entry-label">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                        <p className="settings-help">
                          {autoStartOnLogin
                            ? 'JPLearn will launch automatically when you log in to your computer.'
                            : 'JPLearn will only start when you open it manually.'}
                        </p>
                      </div>
                    </div>
                  </SettingsCollapsibleSection>

                  <SettingsCollapsibleSection
                    id="fsrs-optimization"
                    title="FSRS Optimization"
                    description="Personalize spaced-repetition weights from your review history."
                    collapsed={Boolean(collapsedSettingsSections['fsrs-optimization'])}
                    onToggle={() => toggleThemeSectionCollapsed('fsrs-optimization')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <button type="button" className="settings-icon-tile" aria-label="FSRS optimization">
                        <BrainCircuit size={18} strokeWidth={2.1} />
                      </button>
                      <div className="settings-control-content">
                        <p className="settings-section-label">Spaced Repetition Weights</p>
                        <p className="settings-help" style={{ marginBottom: 12 }}>
                          {fsrsCustom
                            ? 'Personalized weights are active based on your review patterns.'
                            : 'Using default FSRS v4.5 weights. Run optimization to personalize.'}
                        </p>
                        <div className="settings-animation-grid" role="group" aria-label="FSRS controls">
                          <button
                            type="button"
                            className={`settings-icon-entry settings-theme-entry`}
                            onClick={() => void optimizeFSRSWeights()}
                            disabled={optimizingFSRS}
                            aria-label="Optimize FSRS weights"
                          >
                            <span className={`settings-mode-icon-button ${fsrsCustom ? 'is-enabled' : ''}`} aria-hidden="true">
                              <RefreshCw size={18} strokeWidth={2.25} className={optimizingFSRS ? 'spin-icon' : ''} />
                            </span>
                            <span className="settings-icon-entry-label">
                              {optimizingFSRS ? 'Optimizing…' : 'Optimize'}
                            </span>
                          </button>
                          {fsrsCustom && (
                            <button
                              type="button"
                              className="settings-icon-entry settings-theme-entry"
                              onClick={() => void resetFSRSWeights()}
                              aria-label="Reset to default FSRS weights"
                            >
                              <span className="settings-mode-icon-button" aria-hidden="true">
                                <RotateCcw size={18} strokeWidth={2.25} />
                              </span>
                              <span className="settings-icon-entry-label">Reset to Defaults</span>
                            </button>
                          )}
                        </div>
                        {fsrsResult && (
                          <div style={{ marginTop: 12 }}>
                            {fsrsResult.ok ? (
                              <p className="settings-help" style={{ color: 'var(--green-11)' }}>
                                Optimized. Loss: {fsrsResult.loss_before?.toFixed(4)} → {fsrsResult.loss_after?.toFixed(4)}
                                {' '}({fsrsResult.card_count} cards, {fsrsResult.log_count} reviews)
                              </p>
                            ) : (
                              <p className="settings-help" style={{ color: 'var(--red-11)' }}>
                                {fsrsResult.error || 'Optimization failed'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </SettingsCollapsibleSection>

                  <SettingsCollapsibleSection
                    id="backup-restore"
                    title="Backup &amp; Restore"
                    description="Export or restore your full study progress — review history, streaks, leech data, and SRS state."
                    collapsed={Boolean(collapsedSettingsSections['backup-restore'])}
                    onToggle={() => toggleThemeSectionCollapsed('backup-restore')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    {window.jplearnDesktop.exportAnalyticsJSON ? (
                      <div className="settings-control-content" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="jlpt-action-btn"
                            onClick={() => { void exportBackup() }}
                            disabled={backupLoading}
                            aria-label="Export full backup as JSON"
                          >
                            <Download aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
                            Export Backup
                          </button>
                          {window.jplearnDesktop.importAnalyticsJSON ? (
                            <button
                              type="button"
                              className="jlpt-action-btn"
                              onClick={() => { void importBackup() }}
                              disabled={backupLoading}
                              aria-label="Import backup from JSON file"
                            >
                              <Upload aria-hidden="true" className="inline-button-icon" strokeWidth={2.2} />
                              Import Backup
                            </button>
                          ) : null}
                        </div>
                        {backupMessage ? (
                          <p className="status-line">{backupMessage}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="settings-help">Backup functionality is only available in the desktop app.</p>
                    )}
                  </SettingsCollapsibleSection>

                  <SettingsCollapsibleSection
                    id="data-management"
                    title="Data Management"
                    description="Reset all study progress — review history, streaks, leech data, and locally-tracked scores. This cannot be undone."
                    collapsed={Boolean(collapsedSettingsSections['data-management'])}
                    onToggle={() => toggleThemeSectionCollapsed('data-management')}
                    className="settings-theme-card"
                    hideChevron
                  >
                    {resetConfirmStep === 0 ? (
                      <button
                        type="button"
                        className="settings-reset-button"
                        onClick={() => setResetConfirmStep(1)}
                        disabled={resettingDb}
                      >
                        <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                        Reset all progress
                      </button>
                    ) : resetConfirmStep === 1 ? (
                      <div className="settings-reset-confirm">
                        <p className="settings-reset-warning">Are you sure? All progress will be permanently deleted.</p>
                        <div className="reset-confirm-actions">
                          <button
                            type="button"
                            className="danger-button"
                        onClick={() => setResetConfirmStep(2)}
                            disabled={resettingDb}
                          >
                            I understand — continue
                          </button>
                          <button type="button" onClick={() => setResetConfirmStep(0)} disabled={resettingDb}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="settings-reset-confirm">
                        <p className="settings-reset-warning"><strong>Final step:</strong> this will erase everything.</p>
                        <div className="reset-confirm-actions">
                          <button
                            type="button"
                            className="danger-button danger-button-final"
                            onClick={() => void resetStudyDb()}
                            disabled={resettingDb}
                          >
                            {resettingDb ? 'Resetting…' : '⚠ Yes, delete everything'}
                          </button>
                          <button type="button" onClick={() => setResetConfirmStep(0)} disabled={resettingDb}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </SettingsCollapsibleSection>
                </div>
                </div>
              </div>
            </div>
          </div>
  )
}
