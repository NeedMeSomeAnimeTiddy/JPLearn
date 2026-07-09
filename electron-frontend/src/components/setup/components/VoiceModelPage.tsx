import type { SystemInfo, VoiceTier, SpeechTier, CompactDropdownOption } from '../types'
import { formatSize, formatDurationMinutes, getSpeechHardwareFit } from '../utils'
import { CompactDropdown } from './CompactDropdown'

interface VoiceModelPageProps {
  sysInfo: SystemInfo | null
  selectedVoiceTier: VoiceTier
  selectedSpeechTier: SpeechTier
  onVoiceChange: (tier: VoiceTier) => void
  onSpeechChange: (tier: SpeechTier) => void
}

export function VoiceModelPage({
  sysInfo,
  selectedVoiceTier,
  selectedSpeechTier,
  onVoiceChange,
  onSpeechChange,
}: VoiceModelPageProps) {
  const availableVoiceModels = sysInfo?.voiceModels ?? []
  const defaultVoiceModel = sysInfo?.voiceDefaultModel
  const voiceModelOptions: CompactDropdownOption[] = [
    ...(availableVoiceModels.map((model) => ({
      value: model.tier,
      label: model.label,
      meta: `${formatSize(model.combinedSizeMb)} • ${formatDurationMinutes(model.estimatedDownloadMinutes)}${model.installed ? ' • Installed' : ''}`,
      badge: model.tier === defaultVoiceModel ? 'Recommended' : undefined,
      badgeTone: model.tier === defaultVoiceModel ? ('recommended' as const) : undefined,
    })) ?? []),
    {
      value: 'skip',
      label: 'Skip Japanese voice install',
      meta: 'Install later from settings',
    },
  ]
  const selectedVoiceModel = availableVoiceModels.find((model) => model.tier === selectedVoiceTier)
  const selectedVoiceTierDescription = selectedVoiceTier === 'skip'
    ? 'Voice playback will be unavailable until you install a Japanese voice model later from Settings.'
    : selectedVoiceModel?.description

  const speechModelOptions: CompactDropdownOption[] = [
    ...(sysInfo?.speechModels.map((model) => ({
      value: model.tier,
      label: model.label,
      meta: `${formatSize(model.sizeMb)} • ${formatDurationMinutes(model.estimatedDownloadMinutes)}${model.installed ? ' • Installed' : ''}`,
      badge: model.tier === sysInfo?.recommendedSpeechTier
        ? 'Recommended'
        : getSpeechHardwareFit(sysInfo ?? null, model.tier).badge,
      badgeTone: model.tier === sysInfo?.recommendedSpeechTier
        ? ('recommended' as const)
        : getSpeechHardwareFit(sysInfo ?? null, model.tier).tone,
    })) ?? []),
    {
      value: 'skip',
      label: 'Skip speech recognition install',
      meta: 'Install later from settings',
    },
  ]
  const selectedSpeechModel = sysInfo?.speechModels.find((model) => model.tier === selectedSpeechTier)
  const selectedSpeechModelHardwareFit = selectedSpeechTier !== 'skip'
    ? getSpeechHardwareFit(sysInfo ?? null, selectedSpeechTier)
    : null
  const selectedSpeechTierDescription = selectedSpeechTier === 'skip'
    ? 'You can enable speech-based answers later from Settings.'
    : selectedSpeechModel?.description
  const selectedSpeechTierWarning = selectedSpeechTier === 'ultra'
    ? 'Large download and slower transcription speed, but highest recognition quality.'
    : (selectedSpeechModelHardwareFit && !selectedSpeechModelHardwareFit.isOk
      ? selectedSpeechModelHardwareFit.message
      : null)

  return (
    <>
      <p style={{ opacity: 0.75, lineHeight: 1.6, marginBottom: '1rem' }}>
        JPLearn's local Japanese text-to-speech uses VOICEVOX voices for prompt playback during
        study sessions.
      </p>
      {sysInfo?.voiceInstalled ? (
        <p style={{ color: 'var(--accent)' }}>✓ A Japanese voice engine is already installed.</p>
      ) : (
        <>
          <CompactDropdown
            ariaLabel="Japanese voice model"
            options={voiceModelOptions}
            value={selectedVoiceTier}
            onChange={(value) => onVoiceChange(value as VoiceTier)}
          />
          {selectedVoiceTierDescription ? (
            <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: '0.6rem 0 0' }}>
              {selectedVoiceTierDescription}
            </p>
          ) : null}
        </>
      )}

      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Speech Recognition (optional)</p>
        <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
          Lets you answer minigame questions by speaking into your microphone. Runs entirely on
          your device using a local offline speech model — no internet connection needed once
          installed.
        </p>
        <CompactDropdown
          ariaLabel="Speech recognition model"
          options={speechModelOptions}
          value={selectedSpeechTier}
          onChange={(value) => onSpeechChange(value as SpeechTier)}
        />
        {selectedSpeechTierDescription ? (
          <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: '0.6rem 0 0' }}>
            {selectedSpeechTierDescription}
          </p>
        ) : null}
        {selectedSpeechModelHardwareFit && selectedSpeechModelHardwareFit.isOk ? (
          <p style={{ color: 'rgba(242, 181, 111, 0.92)', fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
            {selectedSpeechModelHardwareFit.message}
          </p>
        ) : null}
        {selectedSpeechTierWarning ? (
          <p style={{ color: 'var(--tone-amber)', fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
            {selectedSpeechTierWarning}
          </p>
        ) : null}
      </div>
    </>
  )
}
