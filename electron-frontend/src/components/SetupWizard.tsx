import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

import { clsx } from 'clsx'

import type { SystemInfo, Props, ModelTier, SpeechTier, TranslationProfileTier, LlamaBackend, VoiceTier, SetupMode, Page, CompactDropdownOption, ProgressEvent } from './setup/types'
import { LLAMA_BACKEND_OPTIONS } from './setup/types'
import { formatEta, formatSize, formatDurationMinutes, parseProgressMethod, getModelHardwareFit, getSpeechHardwareFit } from './setup/utils'
import { PageLayout } from './setup/components/PageLayout'
import { CheckboxOption } from './setup/components/CheckboxOption'
import { InfoRow } from './setup/components/InfoRow'
import { SummaryRow } from './setup/components/SummaryRow'
import { CompactDropdown } from './setup/components/CompactDropdown'
import { StepDots } from './setup/components/StepDots'
import { overlayStyle, cardStyle, dragBarStyle, dragBarTitleStyle, cardViewportStyle, stepDotsRowStyle, cardBodyStyle, btnClass } from './setup/styles'


// ── Component ─────────────────────────────────────────────────────────────────

export function SetupWizard({ onComplete }: Props) {
  const [page, setPage] = useState<Page>(1)
  const [setupMode, setSetupMode] = useState<SetupMode>('advanced')
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [systemInfoLoading, setSystemInfoLoading] = useState(false)
  const [selectedTier, setSelectedTier] = useState<ModelTier | null>(null)
  const [selectedLlamaBackend, setSelectedLlamaBackend] = useState<LlamaBackend>('cpu')
  const [selectedVoiceTier, setSelectedVoiceTier] = useState<VoiceTier>('0.6b')
  const [modelProgress, setModelProgress] = useState(0)
  const [llamaProgress, setLlamaProgress] = useState(0)
  const [voiceProgress, setVoiceProgress] = useState(0)
  const [modelMb, setModelMb] = useState<{ done: number; total: number } | null>(null)
  const [llamaMb, setLlamaMb] = useState<{ done: number; total: number } | null>(null)
  const [voiceMb, setVoiceMb] = useState<{ done: number; total: number } | null>(null)
  const [modelEta, setModelEta] = useState<number | null>(null)
  const [installFonts, setInstallFonts] = useState(true)
  const [fontsProgress, setFontsProgress] = useState(0)
  const [fontsFiles, setFontsFiles] = useState<{ done: number; total: number } | null>(null)
  const [fontsMb, setFontsMb] = useState<{ done: number; total: number } | null>(null)
  const [installDictionary, setInstallDictionary] = useState(true)
  const [dictionaryProgress, setDictionaryProgress] = useState(0)
  const [selectedSpeechTier, setSelectedSpeechTier] = useState<SpeechTier>('fast')
  const [speechProgress, setSpeechProgress] = useState(0)
  const [selectedTranslationProfileTier, setSelectedTranslationProfileTier] = useState<TranslationProfileTier>('skip')
  const [translationProfileProgress, setTranslationProfileProgress] = useState(0)
  const [downloadMethods, setDownloadMethods] = useState<Partial<Record<ProgressEvent['id'], string>>>({})
  const [createDesktop, setCreateDesktop] = useState(true)
  const [createStartMenu, setCreateStartMenu] = useState(true)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadDone, setDownloadDone] = useState(false)
  const [progressLogs, setProgressLogs] = useState<string[]>([])
  const unsubRef = useRef<(() => void) | null>(null)

  const appendProgressLog = useCallback((message: string) => {
    const trimmed = message.trim()
    if (!trimmed) return
    setProgressLogs((prev) => {
      const timestamp = new Date().toLocaleTimeString()
      const next = [...prev, `[${timestamp}] ${trimmed}`]
      return next.slice(-120)
    })
  }, [])

  const refreshSystemInfo = useCallback(async () => {
    const api = window.jplearnDesktop
    if (!api?.getSetupSystemInfo) return
    setSystemInfoLoading(true)
    try {
      const info = await api.getSetupSystemInfo()
      setSysInfo(info)
      setSelectedTier((prev) => {
        if (prev && prev !== 'skip' && info.models.some((model) => model.tier === prev)) {
          return prev
        }
        return info.recommendedTier
      })
      setSelectedLlamaBackend(info.llamaCppBackend ?? 'cpu')
      if (info.fontsInstalled) setInstallFonts(false)
      if (info.dictionaryInstalled) setInstallDictionary(false)
      const voiceModels = info.voiceModels ?? []
      const activeVoiceModel = info.activeVoiceModel ?? null
      const voiceDefaultModel = info.voiceDefaultModel ?? '0.6b'
      setSelectedVoiceTier((prev) => {
        if (prev !== 'skip' && voiceModels.some((model) => model.tier === prev)) {
          return prev
        }
        return activeVoiceModel ?? voiceDefaultModel
      })
      setSelectedSpeechTier((prev) => {
        if (prev !== 'skip' && info.speechModels?.some((model) => model.tier === prev)) {
          return prev
        }
        return info.activeSpeechModelTier ?? info.recommendedSpeechTier ?? 'fast'
      })
      setSelectedTranslationProfileTier((prev) => {
        if (prev !== 'skip' && info.translationProfiles?.some((model) => model.tier === prev)) {
          return prev
        }
        return info.activeTranslationProfileTier ?? 'skip'
      })
    } catch {
      setSysInfo((prev) => prev ?? {
        totalRamGb: 0,
        recommendedTier: 'low',
        models: [],
        llamaCppInstalled: false,
        gpuAdapters: [],
        llamaCppBackend: 'cpu',
        llamaCppBackendLabel: 'CPU',
        fontsInstalled: false,
        dictionaryInstalled: false,
        speechModels: [],
        recommendedSpeechTier: 'fast',
        activeSpeechModelTier: null,
        ocrModels: [],
        recommendedOcrTier: 'standard',
        activeOcrModelTier: null,
        ocrInstalled: false,
        translationModels: [],
        recommendedTranslationTier: 'qwen_ja_en',
        activeTranslationModelTier: null,
        translationInstalled: false,
        translationProfiles: [],
        activeTranslationProfileTier: null,
        isPackaged: false,
        voiceInstalled: false,
        voiceModels: [],
        voiceDefaultModel: '0.6b',
        activeVoiceModel: null,
      })
      setSelectedTier('low')
      setSelectedLlamaBackend('cpu')
    } finally {
      setSystemInfoLoading(false)
    }
  }, [])

  const applySimpleSetupDefaults = useCallback(() => {
    setSelectedTier('skip')
    setSelectedVoiceTier('skip')
    setInstallFonts(false)
    setInstallDictionary(true)
    setSelectedSpeechTier('fast')
    setSelectedTranslationProfileTier('skip')
  }, [])

  // Fetch system info once we enter the setup flow beyond mode selection.
  useEffect(() => {
    if (page < 3 || sysInfo) return
    void refreshSystemInfo()
  }, [page, refreshSystemInfo, sysInfo])

  // Subscribe to download progress events
  useEffect(() => {
    const api = window.jplearnDesktop
    if (!api?.onSetupProgress) return
    const unsub = api.onSetupProgress((evt: ProgressEvent) => {
      if (evt.id === 'model') {
        setModelProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) {
          setModelMb({ done: evt.mb, total: evt.totalMb })
        }
        setModelEta(evt.etaSec)
      } else if (evt.id === 'llama') {
        setLlamaProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) {
          setLlamaMb({ done: evt.mb, total: evt.totalMb })
        }
      } else if (evt.id === 'voice') {
        setVoiceProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) {
          setVoiceMb({ done: evt.mb, total: evt.totalMb })
        }
      } else if (evt.id === 'fonts') {
        setFontsProgress(evt.percent)
        if (evt.totalMb !== null) {
          setFontsMb({
            done: Math.max(0, Math.min(evt.totalMb, Math.round((evt.percent / 100) * evt.totalMb))),
            total: evt.totalMb,
          })
        }
        if (evt.filesDone !== null && evt.filesDone !== undefined && evt.filesTotal !== null && evt.filesTotal !== undefined) {
          setFontsFiles({ done: evt.filesDone, total: evt.filesTotal })
        }
      } else if (evt.id === 'dictionary') {
        setDictionaryProgress(evt.percent)
      } else if (evt.id === 'speech') {
        setSpeechProgress(evt.percent)
      } else if (evt.id === 'translation') {
        setTranslationProfileProgress((prev) => Math.max(prev, evt.percent))
      } else if (evt.id === 'ocr') {
        setTranslationProfileProgress((prev) => Math.max(prev, evt.percent))
      }
      const method = parseProgressMethod(evt.logMessage)
      if (method) {
        setDownloadMethods((prev) => ({ ...prev, [evt.id]: method }))
      }
      if (evt.logMessage) {
        appendProgressLog(evt.logMessage)
      }
    })
    unsubRef.current = unsub
    return () => unsub()
  }, [appendProgressLog])

  const startDownloads = useCallback(async () => {
    const api = window.jplearnDesktop

    let effectiveSysInfo = sysInfo
    if (api?.getSetupSystemInfo) {
      try {
        const latestInfo = await api.getSetupSystemInfo()
        setSysInfo(latestInfo)
        effectiveSysInfo = latestInfo
      } catch {
        // Keep the most recent known system snapshot.
      }
    }

    const needsModel = selectedTier && selectedTier !== 'skip' && !effectiveSysInfo?.models.find((m) => m.tier === selectedTier)?.installed
    const needsLlama = selectedTier && selectedTier !== 'skip' && !effectiveSysInfo?.llamaCppInstalled
    const voiceModels = effectiveSysInfo?.voiceModels ?? []
    const needsVoice = selectedVoiceTier !== 'skip' && !voiceModels.find((m) => m.tier === selectedVoiceTier)?.installed
    const needsFonts = installFonts && !effectiveSysInfo?.fontsInstalled
    const needsDictionary = installDictionary && !effectiveSysInfo?.dictionaryInstalled
    const needsSpeech = selectedSpeechTier !== 'skip' && !effectiveSysInfo?.speechModels.find((m) => m.tier === selectedSpeechTier)?.installed
    const needsTranslationProfile = selectedTranslationProfileTier !== 'skip'
      && !effectiveSysInfo?.translationProfiles?.find((m) => m.tier === selectedTranslationProfileTier)?.installed

    setDownloadError(null)
    setProgressLogs([])
    setModelProgress(needsModel ? 0 : 100)
    setModelMb(null)
    setModelEta(null)
    setLlamaProgress(needsLlama ? 0 : 100)
    setLlamaMb(null)
    setVoiceProgress(needsVoice ? 0 : 100)
    setVoiceMb(null)
    setFontsProgress(needsFonts ? 0 : 100)
    setFontsFiles(null)
    setFontsMb(null)
    setDictionaryProgress(needsDictionary ? 0 : 100)
    setSpeechProgress(needsSpeech ? 0 : 100)
    setTranslationProfileProgress(needsTranslationProfile ? 0 : 100)
    setDownloadMethods({})
    appendProgressLog('Starting setup tasks…')
    setPage(8)

    try {
      const downloadTasks: Array<{ name: string; promise: Promise<unknown> }> = []
      const markDone = async <T,>(p: Promise<T>, setter: () => void): Promise<T> => {
        const result = await p
        setter()
        return result
      }

      if (needsModel && selectedTier) {
        appendProgressLog(`Starting model download (${selectedTier})…`)
        const task = api.downloadModel?.(selectedTier)
        if (task) {
          downloadTasks.push({
            name: 'model',
            promise: markDone(task, () => setModelProgress(100)),
          })
        }
      }
      if (needsLlama && selectedTier) {
        const backendLabel = LLAMA_BACKEND_OPTIONS.find((option) => option.key === selectedLlamaBackend)?.label ?? selectedLlamaBackend
        appendProgressLog(`Starting llama.cpp runtime download (${backendLabel})…`)
        const task = api.downloadLlama?.(selectedLlamaBackend)
        if (task) {
          downloadTasks.push({
            name: 'llama',
            promise: markDone(task, () => setLlamaProgress(100)),
          })
        }
      }
      if (needsVoice) {
        appendProgressLog(`Starting Japanese voice model download (${selectedVoiceTier})…`)
        const task = api.downloadVoiceEngine?.(selectedVoiceTier)
        if (task) {
          downloadTasks.push({
            name: 'voice',
            promise: markDone(task, () => setVoiceProgress(100)),
          })
        }
      }
      if (needsFonts) {
        appendProgressLog('Starting fonts download…')
        const task = api.downloadFonts?.()
        if (task) {
          downloadTasks.push({
            name: 'fonts',
            promise: markDone(task, () => setFontsProgress(100)),
          })
        }
      }
      if (needsDictionary) {
        appendProgressLog('Starting offline dictionary download…')
        const task = api.downloadDictionary?.()
        if (task) {
          downloadTasks.push({
            name: 'dictionary',
            promise: markDone(task, () => setDictionaryProgress(100)),
          })
        }
      }
      if (needsSpeech) {
        appendProgressLog(`Starting speech recognition model download (${selectedSpeechTier})…`)
        const task = api.downloadSpeechModel?.(selectedSpeechTier)
        if (task) {
          downloadTasks.push({
            name: 'speech',
            promise: markDone(task, () => setSpeechProgress(100)),
          })
        }
      }
      if (needsTranslationProfile) {
        appendProgressLog(`Starting translation profile setup (${selectedTranslationProfileTier})…`)
        const task = api.applyTranslationProfile?.(selectedTranslationProfileTier)
        if (task) {
          downloadTasks.push({
            name: 'translation-profile',
            promise: markDone(task, () => setTranslationProfileProgress(100)),
          })
        }
      }

      if (downloadTasks.length > 0) {
        const results = await Promise.allSettled(downloadTasks.map((task) => task.promise))
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failure) {
          throw failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason))
        }
      }
      if (needsFonts) {
        await api.reloadLocalFonts?.().catch(() => undefined)
      }
      appendProgressLog('Creating shortcuts…')
      await api.createShortcuts?.({ desktop: createDesktop, startMenu: createStartMenu })
      await api.completeSetup?.()
      appendProgressLog('Setup complete.')
      setDownloadDone(true)
      setPage(9)
    } catch (err) {
      appendProgressLog(`Setup failed: ${err instanceof Error ? err.message : String(err)}`)
      setDownloadError(err instanceof Error ? err.message : String(err))
    }
  }, [selectedTier, selectedLlamaBackend, selectedVoiceTier, installFonts, installDictionary, selectedSpeechTier, selectedTranslationProfileTier, sysInfo, createDesktop, createStartMenu, appendProgressLog])

  const handleFinish = useCallback(async () => {
    if (!downloadDone) {
      await window.jplearnDesktop.skipSetup?.()
    }
    onComplete()
  }, [downloadDone, onComplete])

  // ── Render helpers ─────────────────────────────────────────────────────────

  function ProgressBar({ value, label, method }: { value: number; label: string; method?: string | null }) {
    return (
      <div className="sw-progress-bar">
        <div className="sw-progress-bar-header">
          <span>{label}</span>
          <span>{value}%{method ? ` [${method}]` : ''}</span>
        </div>
        <div className="sw-progress-bar-track">
          <div className="sw-progress-bar-fill" style={{ width: `${value}%` }} />
        </div>
      </div>
    )
  }

  // ── Page renders ───────────────────────────────────────────────────────────

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
      label: "Skip tutor install",
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

  const translationProfileOptions: CompactDropdownOption[] = [
    ...(sysInfo?.translationProfiles?.map((profile) => ({
      value: profile.tier,
      label: profile.label,
      meta: `${formatSize(profile.sizeMb)} • ${formatDurationMinutes(profile.estimatedDownloadMinutes)}${profile.installed ? ' • Installed' : ''}`,
      badge: profile.badge,
      badgeTone: 'recommended' as const,
    })) ?? []),
    {
      value: 'skip',
      label: 'Skip OCR translation install',
      meta: 'Install later from settings',
    },
  ]
  const selectedTranslationProfile = sysInfo?.translationProfiles?.find((profile) => profile.tier === selectedTranslationProfileTier)
  const selectedTranslationProfileDescription = selectedTranslationProfileTier === 'skip'
    ? 'You can install OCR translation profiles later from Settings.'
    : selectedTranslationProfile?.description

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

  const pages: Record<Page, ReactNode> = {
    1: (
      <PageLayout
        title="Welcome to JPLearn"
        subtitle="Let's get everything set up in a few steps."
        onNext={() => setPage(2)}
        onSkip={() => handleFinish()}
        nextLabel="Get Started"
        skipLabel="Skip setup"
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          JPLearn is a desktop Japanese learning app with spaced-repetition flashcards, game-like
          practice modes, and an optional AI tutor that runs privately on your device.
        </p>
        <p style={{ opacity: 0.75, lineHeight: 1.6, marginTop: '0.75rem' }}>
          This wizard will help you download the AI tutor model and Japanese voice engine.
          Both are optional — the core learning features work without them.
        </p>
      </PageLayout>
    ),

    2: (
      <PageLayout
        title="Setup style"
        subtitle="Choose a quick setup or configure everything in detail."
        onNext={() => {
          if (setupMode === 'simple') {
            applySimpleSetupDefaults()
            setPage(7)
            return
          }
          setPage(3)
        }}
        onBack={() => setPage(1)}
        nextLabel={setupMode === 'simple' ? 'Continue (Simple)' : 'Continue (Advanced)'}
      >
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          <button
            type="button"
            onClick={() => setSetupMode('simple')}
            style={{
              textAlign: 'left',
              padding: '0.9rem',
              borderRadius: '10px',
              border: setupMode === 'simple' ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.14)',
              background: setupMode === 'simple' ? 'rgba(126,184,234,0.14)' : 'rgba(255,255,255,0.05)',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Simple setup</div>
            <div style={{ opacity: 0.75, fontSize: '0.9rem', lineHeight: 1.45 }}>
              Downloads only offline dictionary + fastest speech recognition model.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setSetupMode('advanced')}
            style={{
              textAlign: 'left',
              padding: '0.9rem',
              borderRadius: '10px',
              border: setupMode === 'advanced' ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.14)',
              background: setupMode === 'advanced' ? 'rgba(126,184,234,0.14)' : 'rgba(255,255,255,0.05)',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Advanced setup</div>
            <div style={{ opacity: 0.75, fontSize: '0.9rem', lineHeight: 1.45 }}>
              Choose tutor model, voice model, speech tier, fonts, dictionary, and shortcuts.
            </div>
          </button>
        </div>
      </PageLayout>
    ),

    3: (
      <PageLayout
        title="System Check"
        subtitle="Checking your hardware to recommend the best settings."
        onNext={() => setPage(4)}
        onBack={() => setPage(2)}
        nextLabel="Continue"
        nextDisabled={!sysInfo}
      >
        {!sysInfo ? (
          <p style={{ opacity: 0.6 }}>Detecting system…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="RAM" value={`${sysInfo.totalRamGb.toFixed(1)} GB`} />
            <InfoRow label="GPU" value={sysInfo.gpuAdapters && sysInfo.gpuAdapters.length > 0 ? sysInfo.gpuAdapters.join(', ') : 'Not detected'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}>
              <span style={{ opacity: 0.7 }}>Network</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  {sysInfo.networkMbps ? `${sysInfo.networkMbps.toFixed(1)} Mbps` : 'Speed test unavailable'}
                </span>
                <button
                  type="button"
                  onClick={() => { void refreshSystemInfo() }}
                  disabled={systemInfoLoading}
                  style={{
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'inherit',
                    borderRadius: '999px',
                    width: '2rem',
                    height: '2rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: systemInfoLoading ? 'wait' : 'pointer',
                  }}
                  aria-label="Retest network speed"
                  title="Retest network speed"
                >
                  <RefreshCw size={16} strokeWidth={2.25} aria-hidden="true" style={{ animation: systemInfoLoading ? 'spin 0.9s linear infinite' : 'none' }} />
                </button>
              </span>
            </div>
          </div>
        )}
      </PageLayout>
    ),

    4: (
      <PageLayout
        title="AI Tutor (optional)"
        subtitle="Select a model or skip — you can always add one later."
        onNext={() => setPage(5)}
        onBack={() => setPage(3)}
        nextLabel="Continue"
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6, marginBottom: '1rem' }}>
          JPLearn includes an AI tutor you can chat with about Japanese grammar, vocabulary, and
          pronunciation — running privately on your device, no internet required once set up.
        </p>
        <CompactDropdown
          ariaLabel="Tutor model"
          options={tutorModelOptions}
          value={selectedTier ?? 'skip'}
          onChange={(value) => setSelectedTier(value as ModelTier)}
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
              onChange={(value) => setSelectedLlamaBackend(value as LlamaBackend)}
            />
            <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: 0 }}>
              {selectedBackendDescription}
            </p>
            <p style={{ opacity: 0.55, fontSize: '0.82rem', lineHeight: 1.4, margin: 0 }}>
              Defaulted to the detected best match for this device: {sysInfo?.llamaCppBackendLabel ?? 'CPU'}.
            </p>
          </div>
        )}
      </PageLayout>
    ),

    5: (
      <PageLayout
        title="Japanese Voice (optional)"
        subtitle="Install voice synthesis and optional speech recognition."
        onNext={() => setPage(6)}
        onBack={() => setPage(4)}
        nextLabel="Continue"
      >
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
              onChange={(value) => setSelectedVoiceTier(value as VoiceTier)}
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
            onChange={(value) => setSelectedSpeechTier(value as SpeechTier)}
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
      </PageLayout>
    ),

    6: (
      <PageLayout
        title="Reading Assets (optional)"
        subtitle="Install optional fonts, offline dictionary, and OCR assets."
        onNext={() => setPage(7)}
        onBack={() => setPage(5)}
        nextLabel="Continue"
      >
        <div>
          <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Japanese Fonts (optional)</p>
          <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
            Custom display fonts for a better look. Without them the app uses system fonts
            (e.g. Yu Gothic on Windows), which work fine.
          </p>
          {sysInfo?.fontsInstalled ? (
            <p style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>✓ Fonts are already installed.</p>
          ) : (
            <CheckboxOption
              label={`Download Japanese fonts (~100 MB)  •  ${formatDurationMinutes(sysInfo?.fontsEstimatedDownloadMinutes)}`}
              checked={installFonts}
              onChange={setInstallFonts}
            />
          )}
        </div>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Offline Dictionary (optional)</p>
          <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
            Lets the Tutor chat look up Japanese↔English word translations without an internet
            connection. Downloaded from the open-source jmdict-simplified project.
          </p>
          {sysInfo?.dictionaryInstalled ? (
            <p style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>✓ Offline dictionary is already installed.</p>
          ) : (
            <CheckboxOption
              label={`Download offline dictionary (~30 MB)  •  ${formatDurationMinutes(sysInfo?.dictionaryEstimatedDownloadMinutes)}`}
              checked={installDictionary}
              onChange={setInstallDictionary}
            />
          )}
        </div>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.4rem', fontSize: '0.95rem' }}>OCR Translation Profile (optional)</p>
          <p style={{ opacity: 0.7, lineHeight: 1.5, marginBottom: '0.75rem', fontSize: '0.88rem' }}>
            Installs the OCR translation bundle: OCR Standard + Qwen3.5-0.8B-JP local translation model.
          </p>
          <CompactDropdown
            ariaLabel="OCR translation profile"
            options={translationProfileOptions}
            value={selectedTranslationProfileTier}
            onChange={(value) => setSelectedTranslationProfileTier(value as TranslationProfileTier)}
          />
          {selectedTranslationProfileDescription ? (
            <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: '0.6rem 0 0' }}>
              {selectedTranslationProfileDescription}
            </p>
          ) : null}
        </div>
      </PageLayout>
    ),

    7: (() => {
      const needsModel = selectedTier && selectedTier !== 'skip' && !sysInfo?.models.find(m => m.tier === selectedTier)?.installed
      const needsLlama = selectedTier && selectedTier !== 'skip' && !sysInfo?.llamaCppInstalled
      const availableVoiceModels = sysInfo?.voiceModels ?? []
      const needsVoice = selectedVoiceTier !== 'skip' && !availableVoiceModels.find(m => m.tier === selectedVoiceTier)?.installed
      const needsFonts = installFonts && !sysInfo?.fontsInstalled
      const needsDictionary = installDictionary && !sysInfo?.dictionaryInstalled
      const needsSpeech = selectedSpeechTier !== 'skip' && !sysInfo?.speechModels.find(m => m.tier === selectedSpeechTier)?.installed
      const needsTranslationProfile = selectedTranslationProfileTier !== 'skip'
        && !sysInfo?.translationProfiles?.find(m => m.tier === selectedTranslationProfileTier)?.installed
      const modelInfo = sysInfo?.models.find(m => m.tier === selectedTier)
      const speechModelInfo = sysInfo?.speechModels.find(m => m.tier === selectedSpeechTier)
      const voiceModelInfo = availableVoiceModels.find(m => m.tier === selectedVoiceTier)
      const translationProfileInfo = sysInfo?.translationProfiles?.find(m => m.tier === selectedTranslationProfileTier)
      return (
        <PageLayout
          title="Ready to download"
          subtitle="Review what will be downloaded, then click Start Setup."
          onNext={startDownloads}
          onBack={() => setPage(setupMode === 'simple' ? 2 : 6)}
          nextLabel={needsModel || needsLlama || needsVoice || needsFonts || needsDictionary || needsSpeech || needsTranslationProfile ? 'Start Setup' : 'Finish'}
        >
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
              <CheckboxOption label="Create desktop shortcut" checked={createDesktop} onChange={setCreateDesktop} />
              <div style={{ marginTop: '0.4rem' }}>
                <CheckboxOption label="Add to Start Menu" checked={createStartMenu} onChange={setCreateStartMenu} />
              </div>
            </div>
          )}
          <p style={{ opacity: 0.55, fontSize: '0.85rem', marginTop: '1.25rem', lineHeight: 1.5 }}>
            ℹ Your downloads and progress are saved to <strong>Documents\JPLearn\</strong> — they will
            NOT be deleted if you uninstall or reinstall JPLearn.
          </p>
        </PageLayout>
      )
    })(),

    8: (
      <PageLayout title="Setting up…" subtitle="Please wait while files are downloaded." hideNav>
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
        {selectedVoiceTier !== 'skip' && !(sysInfo?.voiceModels ?? []).find(m => m.tier === selectedVoiceTier)?.installed && (
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
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <span style={{ color: 'var(--status-error)', lineHeight: 1.5, fontSize: '0.88rem', minWidth: 0 }}>Download failed: {downloadError}</span>
            <button
              type="button"
              onClick={() => { void startDownloads() }}
              className={clsx(btnClass('secondary'), 'sw-btn-retry')}
            >
              Retry
            </button>
          </div>
        )}

        <div style={{ marginTop: '0.75rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.82rem', fontWeight: 600, opacity: 0.85, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            Activity Log
          </div>
          <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '0.55rem 0.7rem', fontSize: '0.78rem', lineHeight: 1.5, opacity: 0.85, fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)' }}>
            {progressLogs.length === 0 ? (
              <div style={{ opacity: 0.6 }}>Waiting for download activity…</div>
            ) : (
              progressLogs.map((line, idx) => (
                <div key={`${idx}-${line}`}>{line}</div>
              ))
            )}
          </div>
        </div>
      </PageLayout>
    ),

    9: (
      <PageLayout
        title="Setup complete"
        subtitle="Everything is ready. Enjoy learning Japanese!"
        onNext={handleFinish}
        nextLabel="Launch JPLearn"
        hideBack
      >
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          Your AI tutor and voice engine are installed. You can adjust settings at any time from the
          app&apos;s Settings panel.
        </p>
      </PageLayout>
    ),
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={dragBarStyle} aria-label="Move setup window">
          <span style={dragBarTitleStyle}>JPLearn Setup</span>
        </div>
        <div style={stepDotsRowStyle}>
          <StepDots total={9} current={page} />
        </div>
        <div className="setup-wizard-scroll-area" style={cardViewportStyle}>
          <div style={cardBodyStyle}>
            {pages[page]}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────