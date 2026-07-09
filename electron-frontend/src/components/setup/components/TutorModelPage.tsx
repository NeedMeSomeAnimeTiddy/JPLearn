import type { SystemInfo, ModelTier, LlamaBackend, CompactDropdownOption } from '../types'
import { LLAMA_BACKEND_OPTIONS } from '../types'
import { formatSize, formatDurationMinutes, getModelHardwareFit } from '../utils'
import { CompactDropdown } from './CompactDropdown'

interface TutorModelPageProps {
  sysInfo: SystemInfo | null
  selectedTier: ModelTier | null
  selectedLlamaBackend: LlamaBackend
  onTierChange: (tier: ModelTier) => void
  onBackendChange: (backend: LlamaBackend) => void
}

export function TutorModelPage({
  sysInfo,
  selectedTier,
  selectedLlamaBackend,
  onTierChange,
  onBackendChange,
}: TutorModelPageProps) {
  const tutorModelOptions: CompactDropdownOption[] = [
    ...(sysInfo?.models.map((model) => {
      const hardwareFit = getModelHardwareFit(sysInfo, model.tier)
      return {
        value: model.tier,
        label: model.label,
        meta: `${formatSize(model.sizeMb)} • ${formatDurationMinutes(model.estimatedDownloadMinutes)}${model.installed ? ' • Installed' : ''}`,
        badge: model.tier === sysInfo?.recommendedTier ? 'Recommended' : hardwareFit.badge,
        badgeTone: model.tier === sysInfo?.recommendedTier ? ('recommended' as const) : hardwareFit.tone,
      }
    }) ?? []),
    {
      value: 'skip',
      label: 'Skip tutor install',
      meta: 'Install later from settings or scripts',
    },
  ]

  const selectedModel = sysInfo?.models.find((model) => model.tier === selectedTier)
  const selectedModelHardwareFit = selectedTier && selectedTier !== 'skip'
    ? getModelHardwareFit(sysInfo ?? null, selectedTier)
    : null
  const selectedModelDescription = selectedTier === 'skip'
    ? 'You can install the tutor later if you change your mind.'
    : selectedModel?.description
  const selectedModelWarning = [
    selectedModelHardwareFit && !selectedModelHardwareFit.isOk ? selectedModelHardwareFit.message : null,
    selectedTier === 'ultra' ? 'Large download. Expect a longer setup time on slower connections.' : null,
  ].filter(Boolean).join(' ')

  const llamaBackendOptions: CompactDropdownOption[] = LLAMA_BACKEND_OPTIONS.map((option) => ({
    value: option.key,
    label: option.label,
  }))
  const selectedBackendDescription = LLAMA_BACKEND_OPTIONS.find((option) => option.key === selectedLlamaBackend)?.description

  return (
    <>
      <p style={{ opacity: 0.75, lineHeight: 1.6, marginBottom: '1rem' }}>
        JPLearn includes an AI tutor you can chat with about Japanese grammar, vocabulary, and
        pronunciation — running privately on your device, no internet required once set up.
      </p>
      <CompactDropdown
        ariaLabel="Tutor model"
        options={tutorModelOptions}
        value={selectedTier ?? 'skip'}
        onChange={(value) => onTierChange(value as ModelTier)}
      />
      {sysInfo?.gpuVramGb && sysInfo.gpuVramGb >= 12 ? (
        <p style={{ opacity: 0.55, fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
          Ultra is marked as VRAM Ready because this system reports {sysInfo.gpuVramGb.toFixed(1)} GB of GPU memory.
        </p>
      ) : null}
      {selectedModelHardwareFit && selectedModelHardwareFit.isOk && selectedTier !== 'skip' ? (
        <p style={{ color: 'rgba(242, 181, 111, 0.92)', fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
          {selectedModelHardwareFit.message}
        </p>
      ) : null}
      {selectedModelDescription ? (
        <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: '0.6rem 0 0' }}>
          {selectedModelDescription}
        </p>
      ) : null}
      {selectedModelWarning ? (
        <p style={{ color: 'var(--tone-amber)', fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
          {selectedModelWarning}
        </p>
      ) : null}
      {selectedTier && selectedTier !== 'skip' && !sysInfo?.llamaCppInstalled && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <p style={{ fontSize: '0.92rem', fontWeight: 600, margin: 0 }}>
            llama.cpp runtime type
          </p>
          <CompactDropdown
            ariaLabel="llama.cpp runtime type"
            options={llamaBackendOptions}
            value={selectedLlamaBackend}
            onChange={(value) => onBackendChange(value as LlamaBackend)}
          />
          <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: 0 }}>
            {selectedBackendDescription}
          </p>
          <p style={{ opacity: 0.55, fontSize: '0.82rem', lineHeight: 1.4, margin: 0 }}>
            Defaulted to the detected best match for this device: {sysInfo?.llamaCppBackendLabel ?? 'CPU'}.
          </p>
        </div>
      )}
    </>
  )
}
