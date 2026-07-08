import { useCallback, useRef, useState } from 'react'
import type { TutorInstallInfo, TutorModelTier, TranslationProfileTier } from './types'

export interface UseModelsReturn {
  tutorInstallInfo: TutorInstallInfo | null
  tutorDownloadingTier: TutorModelTier | null
  tutorDownloadProgress: { percent: number; mb: number | null; totalMb: number | null } | null
  tutorDownloadMethod: string | null
  tutorModelActionTier: TutorModelTier | null
  dictionaryDownloading: boolean
  dictionaryProgress: number
  dictionaryDownloadMethod: string | null
  translationProfileApplyingTier: TranslationProfileTier | null
  translationProfileProgress: number
  translationProfileMethod: string | null
  formatModelSize: (sizeMb: number) => string
  formatCombinedModelSize: (sizeMb: number, embedderSizeMb?: number) => string
  formatMinutes: (minutes?: number | null) => string
  getTutorModelHardwareFit: (tier: TutorModelTier) => { badge: string; detail: string; isOk: boolean; tone: 'soft' | 'warning' }
  refreshTutorInstallInfo: () => Promise<void>
  downloadTutorModel: (tier: TutorModelTier) => Promise<void>
  selectTutorModel: (tier: TutorModelTier) => Promise<void>
  uninstallTutorModel: (tier: TutorModelTier) => Promise<void>
  downloadOfflineDictionary: () => Promise<void>
  applyTranslationProfile: (tier: TranslationProfileTier) => Promise<void>
}

export function useModels(): UseModelsReturn {
  const [tutorInstallInfo, setTutorInstallInfo] = useState<TutorInstallInfo | null>(null)
  const [tutorDownloadingTier, setTutorDownloadingTier] = useState<TutorModelTier | null>(null)
  const [tutorDownloadProgress, setTutorDownloadProgress] = useState<{ percent: number; mb: number | null; totalMb: number | null } | null>(null)
  const [tutorDownloadMethod, setTutorDownloadMethod] = useState<string | null>(null)
  const [tutorModelActionTier, setTutorModelActionTier] = useState<TutorModelTier | null>(null)
  const [dictionaryDownloading, setDictionaryDownloading] = useState(false)
  const [dictionaryProgress, setDictionaryProgress] = useState<number>(0)
  const [dictionaryDownloadMethod, setDictionaryDownloadMethod] = useState<string | null>(null)
  const [translationProfileApplyingTier, setTranslationProfileApplyingTier] = useState<TranslationProfileTier | null>(null)
  const [translationProfileProgress, setTranslationProfileProgress] = useState<number>(0)
  const [translationProfileMethod, setTranslationProfileMethod] = useState<string | null>(null)
  const translationProfileTierRef = useRef<TranslationProfileTier | null>(null)

  const formatModelSize = useCallback((sizeMb: number) => {
    if (!Number.isFinite(sizeMb)) {
      return '—'
    }
    if (sizeMb >= 1000) {
      return `${(sizeMb / 1000).toFixed(1)} GB`
    }
    return `${Math.round(sizeMb)} MB`
  }, [])

  const formatCombinedModelSize = useCallback((sizeMb: number, embedderSizeMb?: number) => {
    if (!Number.isFinite(sizeMb)) {
      return '—'
    }
    if (!embedderSizeMb || !Number.isFinite(embedderSizeMb) || embedderSizeMb <= 0) {
      return formatModelSize(sizeMb)
    }
    return `${formatModelSize(sizeMb)} + ${formatModelSize(embedderSizeMb)}`
  }, [formatModelSize])

  const formatMinutes = useCallback((minutes?: number | null) => {
    if (!Number.isFinite(minutes ?? Number.NaN) || !minutes || minutes <= 0) {
      return 'time unknown'
    }
    return `${minutes} min`
  }, [])

  const getTutorModelHardwareFit = useCallback((tier: TutorModelTier) => {
    const totalRamGb = tutorInstallInfo?.totalRamGb ?? 0
    const gpuVramGb = tutorInstallInfo?.gpuVramGb ?? 0
    const minRequirements: Record<TutorModelTier, { ram: number; vram: number }> = {
      low: { ram: 2, vram: 1 },
      medium: { ram: 4, vram: 2 },
      high: { ram: 3, vram: 4 },
      ultra: { ram: 8, vram: 11 },
    }
    const makeFit = (
      badge: string,
      detail: string,
      isOk: boolean,
      tone: 'soft' | 'warning' = isOk ? 'soft' : 'warning',
    ) => ({ badge, detail, isOk, tone })

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
        return makeFit('Recommended fit', 'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.', true)
      }
      if (totalRamGb >= 6 || gpuVramGb >= 4) {
        return makeFit('Comfortable fit', 'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.', true)
      }
      if (totalRamGb >= 2 || gpuVramGb >= 1) {
        return makeFit('Minimum fit', 'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.', true, 'warning')
      }
      return makeFit('Too heavy', 'Minimum: about 2 GB RAM and 1 GB VRAM. Comfortable on 6 GB RAM or 4 GB VRAM. Recommended on 8 GB RAM or 4 GB VRAM.', false)
    }
    if (tier === 'medium') {
      if (totalRamGb >= 10 || gpuVramGb >= 6) {
        return makeFit('Recommended fit', 'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.', true)
      }
      if (totalRamGb >= 8 || gpuVramGb >= 4) {
        return makeFit('Comfortable fit', 'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.', true)
      }
      if (totalRamGb >= 4 || gpuVramGb >= 2) {
        return makeFit('Minimum fit', 'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.', true, 'warning')
      }
      return makeFit('Too heavy', 'Minimum: about 4 GB RAM and 2 GB VRAM. Comfortable on 8 GB RAM or 4 GB VRAM. Recommended on 10 GB RAM or 6 GB VRAM.', false)
    }
    if (tier === 'high') {
      if (totalRamGb >= 12 || gpuVramGb >= 8) {
        return makeFit('Recommended fit', 'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.', true)
      }
      if (totalRamGb >= 8 || gpuVramGb >= 6) {
        return makeFit('Comfortable fit', 'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.', true)
      }
      if (totalRamGb >= 3 || gpuVramGb >= 4) {
        return makeFit('Minimum fit', 'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.', true, 'warning')
      }
      return makeFit('Too heavy', 'Minimum: about 3 GB RAM and 4 GB VRAM. Comfortable on 8 GB RAM or 6 GB VRAM. Recommended on 12 GB RAM or 8 GB VRAM.', false)
    }
    if (totalRamGb >= 24 || gpuVramGb >= 24) {
      return makeFit('Recommended fit', 'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.', true)
    }
    if (totalRamGb >= 16 || gpuVramGb >= 16) {
      return makeFit('Comfortable fit', 'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.', true)
    }
    if (totalRamGb >= 8 || gpuVramGb >= 11) {
      return makeFit('Minimum fit', 'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.', true, 'warning')
    }
    return makeFit('Too heavy', 'Minimum: about 8 GB RAM and 11 GB VRAM. Comfortable on 16 GB RAM or 16 GB VRAM. Recommended on 24 GB RAM or 24 GB VRAM.', false)
  }, [tutorInstallInfo?.gpuVramGb, tutorInstallInfo?.totalRamGb])

  const refreshTutorInstallInfo = useCallback(async () => {
    const getSetupSystemInfo = window.jplearnDesktop?.getSetupSystemInfo
    if (!getSetupSystemInfo) {
      return
    }
    try {
      const setupInfo = await getSetupSystemInfo()
      setTutorInstallInfo({
        totalRamGb: setupInfo.totalRamGb,
        models: setupInfo.models ?? [],
        recommendedTier: setupInfo.recommendedTier,
        activeModelTier: setupInfo.activeModelTier ?? null,
        activeEmbedderTier: setupInfo.activeEmbedderTier ?? null,
        activeEmbedderLabel: setupInfo.activeEmbedderLabel ?? null,
        activeEmbedderInstalled: setupInfo.activeEmbedderInstalled ?? false,
        activeEmbedderEnabled: setupInfo.activeEmbedderEnabled ?? false,
        llamaCppInstalled: setupInfo.llamaCppInstalled,
        gpuVramGb: setupInfo.gpuVramGb ?? null,
        voiceInstalled: setupInfo.voiceInstalled ?? false,
        voiceModels: setupInfo.voiceModels ?? [],
        activeVoiceModel: setupInfo.activeVoiceModel ?? null,
        fontsInstalled: setupInfo.fontsInstalled,
        dictionaryInstalled: setupInfo.dictionaryInstalled,
        llamaCppEstimatedDownloadMinutes: setupInfo.llamaCppEstimatedDownloadMinutes ?? null,
        dictionaryEstimatedDownloadMinutes: setupInfo.dictionaryEstimatedDownloadMinutes ?? null,
        speechModels: setupInfo.speechModels ?? [],
        recommendedSpeechTier: setupInfo.recommendedSpeechTier,
        activeSpeechModelTier: setupInfo.activeSpeechModelTier ?? null,
        ocrModels: setupInfo.ocrModels ?? [],
        recommendedOcrTier: setupInfo.recommendedOcrTier,
        activeOcrModelTier: setupInfo.activeOcrModelTier ?? null,
        ocrInstalled: setupInfo.ocrInstalled ?? false,
        translationModels: setupInfo.translationModels ?? [],
        recommendedTranslationTier: setupInfo.recommendedTranslationTier,
        activeTranslationModelTier: setupInfo.activeTranslationModelTier ?? null,
        translationInstalled: setupInfo.translationInstalled ?? false,
        translationProfiles: setupInfo.translationProfiles ?? [],
        activeTranslationProfileTier: setupInfo.activeTranslationProfileTier ?? null,
      })
    } catch {
      // Best effort only.
    }
  }, [])

  const downloadTutorModel = useCallback(async (tier: TutorModelTier) => {
    const downloadModel = window.jplearnDesktop?.downloadModel
    if (!downloadModel || tutorDownloadingTier) {
      return
    }
    setTutorDownloadingTier(tier)
    setTutorDownloadProgress({ percent: 0, mb: null, totalMb: null })
    setTutorDownloadMethod(null)
    try {
      await downloadModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setTutorDownloadingTier(null)
      setTutorDownloadProgress(null)
    }
  }, [refreshTutorInstallInfo, tutorDownloadingTier])

  const selectTutorModel = useCallback(async (tier: TutorModelTier) => {
    const setActiveTutorModel = window.jplearnDesktop?.setActiveTutorModel
    if (!setActiveTutorModel || tutorModelActionTier) {
      return
    }
    setTutorModelActionTier(tier)
    try {
      await setActiveTutorModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setTutorModelActionTier(null)
    }
  }, [refreshTutorInstallInfo, tutorModelActionTier])

  const uninstallTutorModel = useCallback(async (tier: TutorModelTier) => {
    const uninstallModel = window.jplearnDesktop?.uninstallTutorModel
    if (!uninstallModel || tutorModelActionTier) {
      return
    }
    setTutorModelActionTier(tier)
    try {
      await uninstallModel(tier)
      await refreshTutorInstallInfo()
    } finally {
      setTutorModelActionTier(null)
    }
  }, [refreshTutorInstallInfo, tutorModelActionTier])

  const downloadOfflineDictionary = useCallback(async () => {
    const downloadDictionary = window.jplearnDesktop?.downloadDictionary
    if (!downloadDictionary || dictionaryDownloading) {
      return
    }
    setDictionaryDownloading(true)
    setDictionaryProgress(0)
    setDictionaryDownloadMethod(null)
    try {
      await downloadDictionary()
      await refreshTutorInstallInfo()
    } finally {
      setDictionaryDownloading(false)
      setDictionaryProgress(0)
    }
  }, [dictionaryDownloading, refreshTutorInstallInfo])

  const applyTranslationProfile = useCallback(async (tier: TranslationProfileTier) => {
    const applyProfile = window.jplearnDesktop?.applyTranslationProfile
    if (!applyProfile || translationProfileApplyingTier) {
      return
    }
    translationProfileTierRef.current = tier
    setTranslationProfileApplyingTier(tier)
    setTranslationProfileProgress(0)
    setTranslationProfileMethod(null)
    try {
      await applyProfile(tier, { force: true })
      await refreshTutorInstallInfo()
    } finally {
      translationProfileTierRef.current = null
      setTranslationProfileApplyingTier(null)
      setTranslationProfileProgress(0)
    }
  }, [refreshTutorInstallInfo, translationProfileApplyingTier])

  return {
    tutorInstallInfo,
    tutorDownloadingTier,
    tutorDownloadProgress,
    tutorDownloadMethod,
    tutorModelActionTier,
    dictionaryDownloading,
    dictionaryProgress,
    dictionaryDownloadMethod,
    translationProfileApplyingTier,
    translationProfileProgress,
    translationProfileMethod,
    formatModelSize,
    formatCombinedModelSize,
    formatMinutes,
    getTutorModelHardwareFit,
    refreshTutorInstallInfo,
    downloadTutorModel,
    selectTutorModel,
    uninstallTutorModel,
    downloadOfflineDictionary,
    applyTranslationProfile,
  }
}
