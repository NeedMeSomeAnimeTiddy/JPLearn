import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { VoiceSettingsFields, VoiceOptionEntry, VoiceSynthesisMeta } from './types'
import { FIXED_JAPANESE_VOICE_OPTIONS } from './constants'
import { splitSpeechSegments } from './utils'
import { AmbientAudioController } from '../../lib/ambientAudio'
import { parseProgressMethod } from '../tutor'

type SpeechTier = 'fast' | 'balanced' | 'high' | 'ultra'
type VoiceEngineTier = '0.6b'

interface TutorInstallInfo {
  totalRamGb: number
  gpuVramGb: number | null
  voiceInstalled: boolean
  voiceModels: Array<{
    tier: VoiceEngineTier
    label: string
    description: string
    installed: boolean
    estimatedDownloadMinutes: number | null
    sizeMb: number
  }>
  activeVoiceModel: VoiceEngineTier | null
  speechModels: Array<{
    tier: SpeechTier
    label: string
    description: string
    sizeMb: number
    installed: boolean
    estimatedDownloadMinutes: number | null
  }>
  recommendedSpeechTier?: SpeechTier
  activeSpeechModelTier?: SpeechTier | null
}

interface VoiceDeps {
  tutorInstallInfo: TutorInstallInfo | null
  refreshTutorInstallInfo: () => Promise<void>
}

interface HardwareFit {
  badge: string
  detail: string
  isOk: boolean
  tone: 'soft' | 'warning'
}

export interface UseVoiceReturn {
  voiceBusy: boolean
  voiceUnavailable: boolean
  lastVoiceSynthesis: VoiceSynthesisMeta | null
  voiceOptions: VoiceOptionEntry[]
  voiceRuntimeRunning: boolean
  listeningLockReason: string | null
  speechRecognitionModelEnabled: boolean
  speechRecognitionLockReason: string
  voiceStatusChecked: boolean
  speechModelActionTier: SpeechTier | null
  refreshVoiceStatus: () => Promise<{ available: boolean; modelReady: boolean; downloading: boolean; lastError?: string } | null>
  playQuestionAudio: (text: string, speaker?: string) => Promise<void>
  playVoiceRuntimeAudio: (text: string, runId: number) => Promise<boolean>
  cancelAssistantSpeech: () => void
  assistantSpeechRunIdRef: RefObject<number>
  speechDownloadingTier: SpeechTier | null
  speechDownloadProgress: number
  speechDownloadMethod: string | null
  downloadSpeechModel: (tier: SpeechTier, options?: { force?: boolean }) => Promise<void>
  selectSpeechModel: (tier: SpeechTier) => Promise<void>
  uninstallSpeechModel: (tier: SpeechTier) => Promise<void>
  getSpeechModelHardwareFit: (tier: SpeechTier) => HardwareFit
  voiceEngineDownloadingTier: VoiceEngineTier | null
  voiceEngineDownloadProgress: number
  voiceEngineDownloadMethod: string | null
  downloadVoiceEngineModel: (tier: VoiceEngineTier) => Promise<void>
}

export function useVoice(
  settings: VoiceSettingsFields,
  _setSettings: Dispatch<SetStateAction<VoiceSettingsFields>>,
  deps: VoiceDeps,
): UseVoiceReturn {
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceUnavailable, setVoiceUnavailable] = useState(false)
  const [lastVoiceSynthesis, setLastVoiceSynthesis] = useState<VoiceSynthesisMeta | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<{ available: boolean; modelReady: boolean; downloading: boolean; lastError?: string } | null>(null)
  const [voiceStatusChecked, setVoiceStatusChecked] = useState(false)
  const [voiceOptions] = useState<VoiceOptionEntry[]>(FIXED_JAPANESE_VOICE_OPTIONS)
  const [speechDownloadingTier, setSpeechDownloadingTier] = useState<SpeechTier | null>(null)
  const [speechDownloadProgress, setSpeechDownloadProgress] = useState(0)
  const [speechDownloadMethod, setSpeechDownloadMethod] = useState<string | null>(null)
  const [speechModelActionTier, setSpeechModelActionTier] = useState<SpeechTier | null>(null)
  const [voiceEngineDownloadingTier, setVoiceEngineDownloadingTier] = useState<VoiceEngineTier | null>(null)
  const [voiceEngineDownloadProgress, setVoiceEngineDownloadProgress] = useState(0)
  const [voiceEngineDownloadMethod, setVoiceEngineDownloadMethod] = useState<string | null>(null)

  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const ambientAudioRef = useRef<AmbientAudioController | null>(null)
  const assistantSpeechRunIdRef = useRef(0)
  const voiceSpeedRef = useRef(settings.voiceSpeed)
  voiceSpeedRef.current = settings.voiceSpeed

  const playQuestionAudio = useCallback(async (text: string, speaker?: string) => {
    const spoken = typeof text === 'string' ? text.trim() : ''
    if (!spoken || voiceBusy) {
      return
    }
    const speak = window.jplearnDesktop?.speakText
    if (!speak) {
      setVoiceUnavailable(true)
      return
    }
    setVoiceBusy(true)
    try {
      const result = await speak({
        text: spoken,
        speaker: speaker ?? settings.voiceSpeaker,
        speed: voiceSpeedRef.current,
      })
      if (result?.audioBase64) {
        setLastVoiceSynthesis((result.synthesis as VoiceSynthesisMeta | undefined) ?? null)
        if (voiceAudioRef.current) {
          voiceAudioRef.current.pause()
          voiceAudioRef.current = null
        }
        const audio = new Audio(`data:audio/wav;base64,${result.audioBase64}`)
        voiceAudioRef.current = audio
        audio.play().then(() => {
          setVoiceUnavailable(false)
        }).catch(() => {})
        setVoiceUnavailable(false)
      } else {
        setVoiceUnavailable(true)
      }
    } catch {
      setVoiceUnavailable(true)
    } finally {
      setVoiceBusy(false)
    }
  }, [voiceBusy, settings.voiceSpeaker])

  const cancelAssistantSpeech = useCallback(() => {
    assistantSpeechRunIdRef.current += 1
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current = null
    }
  }, [])

  const playVoiceRuntimeAudio = useCallback(async (
    text: string,
    runId: number,
  ): Promise<boolean> => {
    const speak = window.jplearnDesktop?.speakText
    if (!speak) {
      return false
    }
    try {
      const result = await speak({
        text,
        speaker: settings.voiceSpeaker,
        speed: voiceSpeedRef.current,
      })
      if (!result?.audioBase64 || assistantSpeechRunIdRef.current !== runId) {
        return false
      }
      setLastVoiceSynthesis((result.synthesis as VoiceSynthesisMeta | undefined) ?? null)
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(`data:audio/wav;base64,${result.audioBase64}`)
        if (voiceAudioRef.current) {
          voiceAudioRef.current.pause()
        }
        voiceAudioRef.current = audio
        audio.onended = () => resolve()
        audio.onerror = () => reject(new Error('Unable to play voice runtime audio.'))
        void audio.play().catch(reject)
      })
      return true
    } catch {
      return false
    }
  }, [settings.voiceSpeaker])

  const refreshVoiceStatus = useCallback(async () => {
    const getVoiceStatus = window.jplearnDesktop?.getVoiceStatus
    if (!getVoiceStatus) {
      setVoiceStatusChecked(true)
      return null
    }
    try {
      const status = await getVoiceStatus() as { available: boolean; modelReady: boolean; downloading: boolean; lastError?: string }
      setVoiceStatus(status)
      setVoiceStatusChecked(true)
      return status
    } catch {
      setVoiceStatusChecked(true)
      return null
    }
  }, [])

  const getSpeechModelHardwareFit = useCallback((tier: SpeechTier): HardwareFit => {
    const totalRamGb = deps.tutorInstallInfo?.totalRamGb ?? 0
    const gpuVramGb = deps.tutorInstallInfo?.gpuVramGb ?? 0
    const makeFit = (
      badge: string,
      detail: string,
      isOk: boolean,
      tone: 'soft' | 'warning' = isOk ? 'soft' : 'warning',
    ) => ({ badge, detail, isOk, tone })

    if (tier === 'fast') {
      if (totalRamGb >= 6 || gpuVramGb >= 2) {
        return makeFit('Recommended fit', 'Fastest option. Comfortable on most systems.', true)
      }
      if (totalRamGb >= 4 || gpuVramGb >= 1) {
        return makeFit('Comfortable fit', 'Fastest option. Comfortable on most systems.', true)
      }
      return makeFit('Minimum fit', 'Fastest option. Comfortable on most systems.', true, 'warning')
    }

    if (tier === 'balanced') {
      if (totalRamGb >= 12 || gpuVramGb >= 4) {
        return makeFit('Recommended fit', 'Good balance of speed and recognition quality.', true)
      }
      if (totalRamGb >= 10 || gpuVramGb >= 2) {
        return makeFit('Comfortable fit', 'Good balance of speed and recognition quality.', true)
      }
      if (totalRamGb >= 6) {
        return makeFit('Minimum fit', 'Good balance of speed and recognition quality.', true, 'warning')
      }
      return makeFit('Too heavy', 'Works best with around 10 GB RAM or more.', false)
    }

    if (tier === 'high') {
      if (totalRamGb >= 24 || gpuVramGb >= 12) {
        return makeFit('Recommended fit', 'Strong quality with lower latency than Ultra.', true)
      }
      if (totalRamGb >= 16 || gpuVramGb >= 8) {
        return makeFit('Comfortable fit', 'Strong quality with lower latency than Ultra.', true)
      }
      if (totalRamGb >= 8 || gpuVramGb >= 4) {
        return makeFit('Minimum fit', 'Strong quality with lower latency than Ultra.', true, 'warning')
      }
      return makeFit('Too heavy', 'Best with around 16 GB RAM or 8 GB GPU VRAM.', false)
    }

    if (totalRamGb >= 32 || gpuVramGb >= 16) {
      return makeFit('Recommended fit', 'Highest recognition quality; heaviest tier.', true)
    }
    if (totalRamGb >= 24 || gpuVramGb >= 12) {
      return makeFit('Comfortable fit', 'Highest recognition quality; heaviest tier.', true)
    }
    if (totalRamGb >= 12 || gpuVramGb >= 8) {
      return makeFit('Minimum fit', 'Highest recognition quality; heaviest tier.', true, 'warning')
    }
    return makeFit('Too heavy', 'Best with around 24 GB RAM or 12 GB GPU VRAM.', false)
  }, [deps.tutorInstallInfo?.gpuVramGb, deps.tutorInstallInfo?.totalRamGb])

  const downloadSpeechModel = useCallback(async (tier: SpeechTier, options?: { force?: boolean }) => {
    const downloadModel = window.jplearnDesktop?.downloadSpeechModel
    if (!downloadModel || speechDownloadingTier) {
      return
    }
    setSpeechDownloadingTier(tier)
    setSpeechDownloadProgress(0)
    setSpeechDownloadMethod(null)
    try {
      await downloadModel(tier, options)
      await deps.refreshTutorInstallInfo()
    } finally {
      setSpeechDownloadingTier(null)
      setSpeechDownloadProgress(0)
    }
  }, [deps, speechDownloadingTier])

  const selectSpeechModel = useCallback(async (tier: SpeechTier) => {
    const setActiveSpeechModel = window.jplearnDesktop?.setActiveSpeechModel
    if (!setActiveSpeechModel || speechModelActionTier) {
      return
    }
    setSpeechModelActionTier(tier)
    try {
      await setActiveSpeechModel(tier)
      await deps.refreshTutorInstallInfo()
    } finally {
      setSpeechModelActionTier(null)
    }
  }, [deps, speechModelActionTier])

  const uninstallSpeechModel = useCallback(async (tier: SpeechTier) => {
    const uninstallModel = window.jplearnDesktop?.uninstallSpeechModel
    if (!uninstallModel || speechModelActionTier) {
      return
    }
    setSpeechModelActionTier(tier)
    try {
      await uninstallModel(tier)
      await deps.refreshTutorInstallInfo()
    } finally {
      setSpeechModelActionTier(null)
    }
  }, [deps, speechModelActionTier])

  const downloadVoiceEngineModel = useCallback(async (tier: VoiceEngineTier) => {
    const downloadVoiceEngine = window.jplearnDesktop?.downloadVoiceEngine
    if (!downloadVoiceEngine || voiceEngineDownloadingTier) {
      return
    }
    setVoiceEngineDownloadingTier(tier)
    setVoiceEngineDownloadProgress(0)
    setVoiceEngineDownloadMethod(null)
    try {
      await downloadVoiceEngine(tier)
      await deps.refreshTutorInstallInfo()
      const preloadVoice = window.jplearnDesktop?.preloadVoice
      if (preloadVoice) {
        await preloadVoice(settings.voiceSpeaker)
      }
    } finally {
      setVoiceEngineDownloadingTier(null)
      setVoiceEngineDownloadProgress(0)
    }
  }, [deps, settings.voiceSpeaker, voiceEngineDownloadingTier])

  useEffect(() => {
    void refreshVoiceStatus()
  }, [refreshVoiceStatus])

  useEffect(() => {
    const onSetupProgress = window.jplearnDesktop?.onSetupProgress
    if (!onSetupProgress) {
      return
    }
    const unsubscribe = onSetupProgress((evt) => {
      const method = parseProgressMethod(evt.logMessage)
      if (evt.id === 'voice') {
        setVoiceEngineDownloadProgress(evt.percent)
        if (method) setVoiceEngineDownloadMethod(method)
        return
      }
      if (evt.id === 'speech') {
        setSpeechDownloadProgress(evt.percent)
        if (method) setSpeechDownloadMethod(method)
        return
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (settings.ambientAudioEnabled) {
      if (!ambientAudioRef.current) {
        ambientAudioRef.current = new AmbientAudioController({
          sources: ['/audio/lofi-loop.mp3', '/audio/lofi-loop.ogg'],
          volume: 0.35,
          fadeMs: 1200,
        })
      }
      ambientAudioRef.current.start()
    } else {
      ambientAudioRef.current?.stop()
    }

    return () => ambientAudioRef.current?.dispose()
  }, [settings.ambientAudioEnabled])

  const speechRecognitionModelEnabled = useMemo(() => {
    if (!deps.tutorInstallInfo) {
      return true
    }
    const activeTier = deps.tutorInstallInfo.activeSpeechModelTier
    if (!activeTier) {
      return false
    }
    return deps.tutorInstallInfo.speechModels.some((model) => model.tier === activeTier && model.installed)
  }, [deps.tutorInstallInfo])

  const speechRecognitionLockReason = 'Install and enable a speech recognition model in Settings > Voice to use Speech Recall.'

  const voiceRuntimeRunning = useMemo(() => {
    const hasVoiceStatusApi = typeof window.jplearnDesktop?.getVoiceStatus === 'function'
    if (!hasVoiceStatusApi || !voiceStatusChecked) {
      return true
    }
    if (!voiceStatus) {
      return false
    }
    return voiceStatus.available && voiceStatus.modelReady && !voiceStatus.downloading
  }, [voiceStatus, voiceStatusChecked])

  const listeningLockReason = useMemo(() => {
    if (voiceRuntimeRunning) {
      return null
    }
    const detail = voiceStatus?.lastError?.trim()
    if (detail) {
      return `VOICEVOX runtime is not running (${detail}). Start it in Settings > Voice.`
    }
    return 'VOICEVOX runtime is not running. Start it in Settings > Voice.'
  }, [voiceRuntimeRunning, voiceStatus?.lastError])

  return {
    voiceBusy,
    voiceUnavailable,
    lastVoiceSynthesis,
    voiceOptions,
    voiceRuntimeRunning,
    listeningLockReason,
    speechRecognitionModelEnabled,
    speechRecognitionLockReason,
    voiceStatusChecked,
    speechModelActionTier,
    refreshVoiceStatus,
    playQuestionAudio,
    playVoiceRuntimeAudio,
    cancelAssistantSpeech,
    assistantSpeechRunIdRef,
    speechDownloadingTier,
    speechDownloadProgress,
    speechDownloadMethod,
    downloadSpeechModel,
    selectSpeechModel,
    uninstallSpeechModel,
    getSpeechModelHardwareFit,
    voiceEngineDownloadingTier,
    voiceEngineDownloadProgress,
    voiceEngineDownloadMethod,
    downloadVoiceEngineModel,
  }
}

export { splitSpeechSegments }
