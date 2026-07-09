import type { SystemInfo, ModelTier, VoiceTier, SpeechTier, TranslationProfileTier, LlamaBackend } from '../types'
import { LLAMA_BACKEND_OPTIONS } from '../types'
import { formatSize } from '../utils'
import { SummaryRow } from './SummaryRow'
import { CheckboxOption } from './CheckboxOption'

interface DownloadSummaryPageProps {
  sysInfo: SystemInfo | null
  selectedTier: ModelTier | null
  selectedLlamaBackend: LlamaBackend
  selectedVoiceTier: VoiceTier
  installFonts: boolean
  installDictionary: boolean
  selectedSpeechTier: SpeechTier
  selectedTranslationProfileTier: TranslationProfileTier
  createDesktop: boolean
  createStartMenu: boolean
  onCreateDesktop: (value: boolean) => void
  onCreateStartMenu: (value: boolean) => void
}

export function DownloadSummaryPage({
  sysInfo,
  selectedTier,
  selectedLlamaBackend,
  selectedVoiceTier,
  installFonts,
  installDictionary,
  selectedSpeechTier,
  selectedTranslationProfileTier,
  createDesktop,
  createStartMenu,
  onCreateDesktop,
  onCreateStartMenu,
}: DownloadSummaryPageProps) {
  const needsModel = selectedTier && selectedTier !== 'skip' && !sysInfo?.models.find((m) => m.tier === selectedTier)?.installed
  const needsLlama = selectedTier && selectedTier !== 'skip' && !sysInfo?.llamaCppInstalled
  const availableVoiceModels = sysInfo?.voiceModels ?? []
  const needsVoice = selectedVoiceTier !== 'skip' && !availableVoiceModels.find((m) => m.tier === selectedVoiceTier)?.installed
  const needsFonts = installFonts && !sysInfo?.fontsInstalled
  const needsDictionary = installDictionary && !sysInfo?.dictionaryInstalled
  const needsSpeech = selectedSpeechTier !== 'skip' && !sysInfo?.speechModels.find((m) => m.tier === selectedSpeechTier)?.installed
  const needsTranslationProfile = selectedTranslationProfileTier !== 'skip'
    && !sysInfo?.translationProfiles?.find((m) => m.tier === selectedTranslationProfileTier)?.installed
  const modelInfo = sysInfo?.models.find((m) => m.tier === selectedTier)
  const speechModelInfo = sysInfo?.speechModels.find((m) => m.tier === selectedSpeechTier)
  const voiceModelInfo = availableVoiceModels.find((m) => m.tier === selectedVoiceTier)
  const translationProfileInfo = sysInfo?.translationProfiles?.find((m) => m.tier === selectedTranslationProfileTier)

  return (
    <>
      {needsModel && modelInfo && (
        <SummaryRow label="AI Tutor model" detail={`${modelInfo.label} — ${formatSize(modelInfo.sizeMb)}`} />
      )}
      {needsLlama && (
        <SummaryRow label="llama.cpp runtime" detail={`Local tutor server binary (${LLAMA_BACKEND_OPTIONS.find((option) => option.key === selectedLlamaBackend)?.label ?? selectedLlamaBackend})`} />
      )}
      {needsVoice && (
        <SummaryRow label="Japanese voice model" detail={voiceModelInfo ? `${voiceModelInfo.label} — ${formatSize(voiceModelInfo.combinedSizeMb)}` : 'Japanese voice model'} />
      )}
      {needsFonts && (
        <SummaryRow label="Japanese fonts" detail="~100 MB" />
      )}
      {needsDictionary && (
        <SummaryRow label="Offline dictionary" detail="~30 MB" />
      )}
      {needsSpeech && speechModelInfo && (
        <SummaryRow label="Speech recognition model" detail={`${speechModelInfo.label} — ${formatSize(speechModelInfo.sizeMb)}`} />
      )}
      {needsTranslationProfile && translationProfileInfo && (
        <SummaryRow label="OCR translation profile" detail={`${translationProfileInfo.label} — ${formatSize(translationProfileInfo.sizeMb)}`} />
      )}
      {!needsModel && !needsVoice && !needsFonts && !needsDictionary && !needsSpeech && !needsTranslationProfile && (
        <p style={{ opacity: 0.7 }}>Nothing to download — all selected components are already installed.</p>
      )}
      {sysInfo?.isPackaged && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Shortcuts</p>
          <CheckboxOption label="Create desktop shortcut" checked={createDesktop} onChange={onCreateDesktop} />
          <div style={{ marginTop: '0.4rem' }}>
            <CheckboxOption label="Add to Start Menu" checked={createStartMenu} onChange={onCreateStartMenu} />
          </div>
        </div>
      )}
      <p style={{ opacity: 0.55, fontSize: '0.85rem', marginTop: '1.25rem', lineHeight: 1.5 }}>
        ℹ Your downloads and progress are saved to <strong>Documents\JPLearn\</strong> — they will
        NOT be deleted if you uninstall or reinstall JPLearn.
      </p>
    </>
  )
}

export function needsAnyDownload(props: DownloadSummaryPageProps): boolean {
  const { sysInfo, selectedTier, selectedVoiceTier, installFonts, installDictionary, selectedSpeechTier, selectedTranslationProfileTier } = props
  const needsModel = selectedTier && selectedTier !== 'skip' && !sysInfo?.models.find((m) => m.tier === selectedTier)?.installed
  const needsLlama = selectedTier && selectedTier !== 'skip' && !sysInfo?.llamaCppInstalled
  const availableVoiceModels = sysInfo?.voiceModels ?? []
  const needsVoice = selectedVoiceTier !== 'skip' && !availableVoiceModels.find((m) => m.tier === selectedVoiceTier)?.installed
  const needsFonts = installFonts && !sysInfo?.fontsInstalled
  const needsDictionary = installDictionary && !sysInfo?.dictionaryInstalled
  const needsSpeech = selectedSpeechTier !== 'skip' && !sysInfo?.speechModels.find((m) => m.tier === selectedSpeechTier)?.installed
  const needsTranslationProfile = selectedTranslationProfileTier !== 'skip'
    && !sysInfo?.translationProfiles?.find((m) => m.tier === selectedTranslationProfileTier)?.installed
  return !!(needsModel || needsLlama || needsVoice || needsFonts || needsDictionary || needsSpeech || needsTranslationProfile)
}
