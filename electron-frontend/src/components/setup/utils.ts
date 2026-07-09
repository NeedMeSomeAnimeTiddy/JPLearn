import type { SystemInfo, ModelTier, VoiceTier, SpeechTier, TranslationProfileTier } from './types'

export interface HardwareFit { badge: string; detail: string; isOk: boolean }

export interface NeedsAnyDownloadProps {
  sysInfo: SystemInfo | null
  selectedTier: ModelTier | null
  selectedVoiceTier: VoiceTier
  installFonts: boolean
  installDictionary: boolean
  selectedSpeechTier: SpeechTier
  selectedTranslationProfileTier: TranslationProfileTier
}

export function needsAnyDownload(props: NeedsAnyDownloadProps): boolean {
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

// ── Utility functions ──

export function formatEta(sec: number | null): string {
  if (sec === null || sec <= 0) return ''
  if (sec < 60) return `~${sec}s remaining`
  const m = Math.round(sec / 60)
  return `~${m} min remaining`
}

export function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`
  return `${mb} MB`
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return 'est. unavailable'
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) return `~${hours} h`
  return `~${hours} h ${rem} min`
}

export function parseProgressMethod(logMessage: string | null | undefined): string | null {
  if (!logMessage) return null
  const match = logMessage.match(/downloading:\s*\d+%\s*\[([^\]]+)\]/i)
  if (!match) return null
  const method = match[1].trim()
  return method || null
}

export function getModelHardwareFit(systemInfo: SystemInfo | null, tier: 'low' | 'medium' | 'high' | 'ultra') {
  const totalRamGb = systemInfo?.totalRamGb ?? 0
  const gpuVramGb = systemInfo?.gpuVramGb ?? 0
  const minRequirements: Record<'low' | 'medium' | 'high' | 'ultra', { ram: number; vram: number }> = {
    low: { ram: 2, vram: 1 },
    medium: { ram: 4, vram: 2 },
    high: { ram: 3, vram: 4 },
    ultra: { ram: 8, vram: 11 },
  }
  const makeFit = (
    badge: string,
    message: string,
    isOk: boolean,
    tone: 'soft' | 'warning' = isOk ? 'soft' : 'warning',
  ) => ({ badge, tone, message, isOk })

  const mins = minRequirements[tier]
  const ramOnlyFit = totalRamGb >= mins.ram && gpuVramGb < mins.vram
  if (ramOnlyFit) {
    return makeFit(
      'Usable (slower)',
      `This tier can still run because your RAM meets the minimum (${mins.ram} GB), but GPU VRAM is below the ${mins.vram} GB target. Expect slower performance.`,
      true,
      'warning',
    )
  }

  if (tier === 'low') {
    if (totalRamGb >= 8 || gpuVramGb >= 4) {
      return makeFit(
        'Recommended fit',
        'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 6 || gpuVramGb >= 4) {
      return makeFit(
        'Comfortable fit',
        'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 2 || gpuVramGb >= 1) {
      return makeFit(
        'Minimum fit',
        'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
        true,
        'warning',
      )
    }
    return makeFit(
      'Too heavy',
      'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.',
      false,
    )
  }

  if (tier === 'medium') {
    if (totalRamGb >= 10 || gpuVramGb >= 6) {
      return makeFit(
        'Recommended fit',
        'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 8 || gpuVramGb >= 4) {
      return makeFit(
        'Comfortable fit',
        'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 4 || gpuVramGb >= 2) {
      return makeFit(
        'Minimum fit',
        'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
        true,
        'warning',
      )
    }
    return makeFit(
      'Too heavy',
      'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.',
      false,
    )
  }

  if (tier === 'high') {
    if (totalRamGb >= 12 || gpuVramGb >= 8) {
      return makeFit(
        'Recommended fit',
        'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 8 || gpuVramGb >= 6) {
      return makeFit(
        'Comfortable fit',
        'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 3 || gpuVramGb >= 4) {
      return makeFit(
        'Minimum fit',
        'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
        true,
        'warning',
      )
    }
    return makeFit(
      'Too heavy',
      'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.',
      false,
    )
  }

  if (tier === 'ultra') {
    if (totalRamGb >= 24 || gpuVramGb >= 24) {
      return makeFit(
        'Recommended fit',
        'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 16 || gpuVramGb >= 16) {
      return makeFit(
        'Comfortable fit',
        'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
        true,
      )
    }
    if (totalRamGb >= 8 || gpuVramGb >= 11) {
      return makeFit(
        'Minimum fit',
        'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
        true,
        'warning',
      )
    }
    return makeFit(
      'Too heavy',
      'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.',
      false,
    )
  }

  return makeFit('Unsupported tier', 'Unable to evaluate this tier on the current setup screen.', false)
}

export function getSpeechHardwareFit(systemInfo: SystemInfo | null, tier: 'fast' | 'balanced' | 'high' | 'ultra') {
  const totalRamGb = systemInfo?.totalRamGb ?? 0
  const gpuVramGb = systemInfo?.gpuVramGb ?? 0
  const makeFit = (
    badge: string,
    message: string,
    isOk: boolean,
    tone: 'soft' | 'warning' = isOk ? 'soft' : 'warning',
  ) => ({ badge, tone, message, isOk })

  if (tier === 'fast') {
    if (totalRamGb >= 6 || gpuVramGb >= 2) {
      return makeFit('Recommended fit', 'Best on lower-spec systems and for the quickest response.', true)
    }
    if (totalRamGb >= 4 || gpuVramGb >= 1) {
      return makeFit('Comfortable fit', 'Best on lower-spec systems and for the quickest response.', true)
    }
    return makeFit('Minimum fit', 'Best on lower-spec systems and for the quickest response.', true, 'warning')
  }
  if (tier === 'balanced') {
    if (totalRamGb >= 12 || gpuVramGb >= 4) {
      return makeFit('Recommended fit', 'Good balance of speed and accuracy for most PCs.', true)
    }
    if (totalRamGb >= 10 || gpuVramGb >= 2) {
      return makeFit('Comfortable fit', 'Good balance of speed and accuracy for most PCs.', true)
    }
    if (totalRamGb >= 6) {
      return makeFit('Minimum fit', 'Good balance of speed and accuracy for most PCs.', true, 'warning')
    }
    return makeFit('Too heavy', 'Works best with about 10 GB RAM or more.', false)
  }
  if (tier === 'high') {
    if (totalRamGb >= 24 || gpuVramGb >= 12) {
      return makeFit('Recommended fit', 'Strong quality with lower latency than Ultra on capable hardware.', true)
    }
    if (totalRamGb >= 16 || gpuVramGb >= 8) {
      return makeFit('Comfortable fit', 'Strong quality with lower latency than Ultra on capable hardware.', true)
    }
    if (totalRamGb >= 8 || gpuVramGb >= 4) {
      return makeFit('Minimum fit', 'Strong quality with lower latency than Ultra on capable hardware.', true, 'warning')
    }
    return makeFit('Too heavy', 'Best with around 16 GB RAM or 8 GB GPU VRAM.', false)
  }

  if (totalRamGb >= 32 || gpuVramGb >= 16) {
    return makeFit('Recommended fit', 'Best recognition quality when your system can handle a heavier model.', true)
  }
  if (totalRamGb >= 24 || gpuVramGb >= 12) {
    return makeFit('Comfortable fit', 'Best recognition quality when your system can handle a heavier model.', true)
  }
  if (totalRamGb >= 12 || gpuVramGb >= 8) {
    return makeFit('Minimum fit', 'Best recognition quality when your system can handle a heavier model.', true, 'warning')
  }
  return makeFit('Too heavy', 'Best with around 24 GB RAM or 12 GB GPU VRAM.', false)
}
