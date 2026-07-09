import type { ModelTier, VoiceTier, SpeechTier, TranslationProfileTier, SystemInfo } from '../types'
import { formatEta } from '../utils'

interface DownloadProgressPageProps {
  sysInfo: SystemInfo | null
  selectedTier: ModelTier | null
  selectedVoiceTier: VoiceTier
  installFonts: boolean
  installDictionary: boolean
  selectedSpeechTier: SpeechTier
  selectedTranslationProfileTier: TranslationProfileTier
  modelProgress: number
  llamaProgress: number
  voiceProgress: number
  fontsProgress: number
  dictionaryProgress: number
  speechProgress: number
  translationProfileProgress: number
  modelMb: { done: number; total: number } | null
  llamaMb: { done: number; total: number } | null
  voiceMb: { done: number; total: number } | null
  fontsMb: { done: number; total: number } | null
  fontsFiles: { done: number; total: number } | null
  modelEta: number | null
  downloadMethods: Partial<Record<string, string>>
  downloadError: string | null
  progressLogs: string[]
  onRetry: () => void
}

function ProgressBar({ value, label, method }: { value: number; label: string; method?: string | null }) {
  return (
    <div className="setup-progress">
      <div className="setup-progress-header">
        <span>{label}</span>
        <span>{value}%{method ? ` [${method}]` : ''}</span>
      </div>
      <div className="setup-progress-track">
        <div className="setup-progress-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function DownloadProgressPage({
  sysInfo,
  selectedTier,
  selectedVoiceTier,
  installFonts,
  installDictionary,
  selectedSpeechTier,
  selectedTranslationProfileTier,
  modelProgress,
  llamaProgress,
  voiceProgress,
  fontsProgress,
  dictionaryProgress,
  speechProgress,
  translationProfileProgress,
  modelMb,
  llamaMb,
  voiceMb,
  fontsMb,
  fontsFiles,
  modelEta,
  downloadMethods,
  downloadError,
  progressLogs,
  onRetry,
}: DownloadProgressPageProps) {
  return (
    <>
      {selectedTier && selectedTier !== 'skip' && (
        <>
          {!sysInfo?.llamaCppInstalled && (
            <ProgressBar
              value={llamaProgress}
              label={`llama.cpp runtime${llamaMb ? ` (${llamaMb.done} / ${llamaMb.total} MB)` : ''}`}
              method={downloadMethods.llama}
            />
          )}
          <ProgressBar
            value={modelProgress}
            label={`AI Tutor model${modelMb ? ` (${modelMb.done} / ${modelMb.total} MB)` : ''}`}
            method={downloadMethods.model}
          />
          {modelEta !== null && modelProgress > 0 && modelProgress < 100 && (
            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
              {formatEta(modelEta)}
            </p>
          )}
        </>
      )}
      {selectedVoiceTier !== 'skip' && !(sysInfo?.voiceModels ?? []).find((m) => m.tier === selectedVoiceTier)?.installed && (
        <ProgressBar
          value={voiceProgress}
          label={`Japanese voice model${voiceMb ? ` (${voiceMb.done} / ${voiceMb.total} MB)` : ''}`}
          method={downloadMethods.voice}
        />
      )}
      {installFonts && !sysInfo?.fontsInstalled && (
        <>
          <ProgressBar
            value={fontsProgress}
            label={`Japanese fonts${fontsMb ? ` (${fontsMb.done} / ${fontsMb.total} MB)` : ''}`}
            method={downloadMethods.fonts}
          />
          {fontsFiles && fontsProgress > 0 && fontsProgress < 100 && (
            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
              Downloading files {fontsFiles.done}/{fontsFiles.total}
            </p>
          )}
        </>
      )}
      {installDictionary && !sysInfo?.dictionaryInstalled && (
        <ProgressBar value={dictionaryProgress} label="Offline dictionary" method={downloadMethods.dictionary} />
      )}
      {selectedSpeechTier !== 'skip' && !sysInfo?.speechModels.find((model) => model.tier === selectedSpeechTier)?.installed && (
        <ProgressBar value={speechProgress} label="Speech recognition model" method={downloadMethods.speech} />
      )}
      {selectedTranslationProfileTier !== 'skip' && !sysInfo?.translationProfiles?.find((model) => model.tier === selectedTranslationProfileTier)?.installed && (
        <ProgressBar value={translationProfileProgress} label="OCR translation profile" method={downloadMethods.translation ?? downloadMethods.ocr} />
      )}
      {downloadError && (
        <div className="setup-error">
          <span className="setup-error-text">Download failed: {downloadError}</span>
          <button type="button" onClick={onRetry} className="wiz-btn wiz-btn-secondary">
            Retry
          </button>
        </div>
      )}

      <div className="setup-log">
        <div className="setup-log-header">Activity Log</div>
        <div className="setup-log-body">
          {progressLogs.length === 0 ? (
            <div style={{ opacity: 0.6 }}>Waiting for download activity…</div>
          ) : (
            progressLogs.map((line, idx) => (
              <div key={`${idx}-${line}`}>{line}</div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
