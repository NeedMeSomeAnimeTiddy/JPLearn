import { useCallback, useEffect, useRef, useState } from 'react'
import type { SystemInfo, Props, ModelTier, SpeechTier, TranslationProfileTier, LlamaBackend, VoiceTier, SetupMode, Page, ProgressEvent } from './setup/types'
import { LLAMA_BACKEND_OPTIONS } from './setup/types'
import { parseProgressMethod } from './setup/utils'
import { WizardShell, StepLayout } from './wizard'
import { WelcomePage } from './setup/components/WelcomePage'
import { SetupModePage } from './setup/components/SetupModePage'
import './setup/setup.css'
import { SystemCheckPage } from './setup/components/SystemCheckPage'
import { TutorModelPage } from './setup/components/TutorModelPage'
import { VoiceModelPage } from './setup/components/VoiceModelPage'
import { ReadingAssetsPage } from './setup/components/ReadingAssetsPage'
import { DownloadSummaryPage, needsAnyDownload } from './setup/components/DownloadSummaryPage'
import { DownloadProgressPage } from './setup/components/DownloadProgressPage'
import { SetupCompletePage } from './setup/components/SetupCompletePage'

const PAGE_TITLES: Record<Page, string> = {
  1: 'Welcome to JPLearn',
  2: 'Setup style',
  3: 'System Check',
  4: 'AI Tutor (optional)',
  5: 'Japanese Voice (optional)',
  6: 'Reading Assets (optional)',
  7: 'Ready to download',
  8: 'Setting up…',
  9: 'Setup complete',
}

const PAGE_SUBTITLES: Record<Page, string | undefined> = {
  1: "Let's get everything set up in a few steps.",
  2: 'Choose a quick setup or configure everything in detail.',
  3: 'Checking your hardware to recommend the best settings.',
  4: 'Select a model or skip — you can always add one later.',
  5: 'Install voice synthesis and optional speech recognition.',
  6: 'Install optional fonts, offline dictionary, and OCR assets.',
  7: 'Review what will be downloaded, then click Start Setup.',
  8: 'Please wait while files are downloaded.',
  9: 'Everything is ready. Enjoy learning Japanese!',
}

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
        if (prev && prev !== 'skip' && info.models.some((model) => model.tier === prev)) return prev
        return info.recommendedTier
      })
      setSelectedLlamaBackend(info.llamaCppBackend ?? 'cpu')
      if (info.fontsInstalled) setInstallFonts(false)
      if (info.dictionaryInstalled) setInstallDictionary(false)
      const voiceModels = info.voiceModels ?? []
      const activeVoiceModel = info.activeVoiceModel ?? null
      const voiceDefaultModel = info.voiceDefaultModel ?? '0.6b'
      setSelectedVoiceTier((prev) => {
        if (prev !== 'skip' && voiceModels.some((model) => model.tier === prev)) return prev
        return activeVoiceModel ?? voiceDefaultModel
      })
      setSelectedSpeechTier((prev) => {
        if (prev !== 'skip' && info.speechModels?.some((model) => model.tier === prev)) return prev
        return info.activeSpeechModelTier ?? info.recommendedSpeechTier ?? 'fast'
      })
      setSelectedTranslationProfileTier((prev) => {
        if (prev !== 'skip' && info.translationProfiles?.some((model) => model.tier === prev)) return prev
        return info.activeTranslationProfileTier ?? 'skip'
      })
    } catch {
      setSysInfo((prev) => prev ?? {
        totalRamGb: 0, recommendedTier: 'low', models: [], llamaCppInstalled: false,
        gpuAdapters: [], llamaCppBackend: 'cpu', llamaCppBackendLabel: 'CPU',
        fontsInstalled: false, dictionaryInstalled: false, speechModels: [],
        recommendedSpeechTier: 'fast', activeSpeechModelTier: null, ocrModels: [],
        recommendedOcrTier: 'standard', activeOcrModelTier: null, ocrInstalled: false,
        translationModels: [], recommendedTranslationTier: 'qwen_ja_en',
        activeTranslationModelTier: null, translationInstalled: false,
        translationProfiles: [], activeTranslationProfileTier: null, isPackaged: false,
        voiceInstalled: false, voiceModels: [], voiceDefaultModel: '0.6b', activeVoiceModel: null,
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

  useEffect(() => {
    if (page < 3 || sysInfo) return
    void refreshSystemInfo()
  }, [page, refreshSystemInfo, sysInfo])

  useEffect(() => {
    const api = window.jplearnDesktop
    if (!api?.onSetupProgress) return
    const unsub = api.onSetupProgress((evt: ProgressEvent) => {
      if (evt.id === 'model') {
        setModelProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) setModelMb({ done: evt.mb, total: evt.totalMb })
        setModelEta(evt.etaSec)
      } else if (evt.id === 'llama') {
        setLlamaProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) setLlamaMb({ done: evt.mb, total: evt.totalMb })
      } else if (evt.id === 'voice') {
        setVoiceProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) setVoiceMb({ done: evt.mb, total: evt.totalMb })
      } else if (evt.id === 'fonts') {
        setFontsProgress(evt.percent)
        if (evt.totalMb !== null) setFontsMb({ done: Math.round((evt.percent / 100) * evt.totalMb), total: evt.totalMb })
        if (evt.filesDone != null && evt.filesTotal != null) setFontsFiles({ done: evt.filesDone, total: evt.filesTotal })
      } else if (evt.id === 'dictionary') {
        setDictionaryProgress(evt.percent)
      } else if (evt.id === 'speech') {
        setSpeechProgress(evt.percent)
      } else if (evt.id === 'translation' || evt.id === 'ocr') {
        setTranslationProfileProgress((prev) => Math.max(prev, evt.percent))
      }
      const method = parseProgressMethod(evt.logMessage)
      if (method) setDownloadMethods((prev) => ({ ...prev, [evt.id]: method }))
      if (evt.logMessage) appendProgressLog(evt.logMessage)
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
      } catch { /* keep snapshot */ }
    }

    const needsModel = selectedTier && selectedTier !== 'skip' && !effectiveSysInfo?.models.find((m) => m.tier === selectedTier)?.installed
    const needsLlama = selectedTier && selectedTier !== 'skip' && !effectiveSysInfo?.llamaCppInstalled
    const voiceModels = effectiveSysInfo?.voiceModels ?? []
    const needsVoice = selectedVoiceTier !== 'skip' && !voiceModels.find((m) => m.tier === selectedVoiceTier)?.installed
    const needsFonts = installFonts && !effectiveSysInfo?.fontsInstalled
    const needsDictionary = installDictionary && !effectiveSysInfo?.dictionaryInstalled
    const needsSpeech = selectedSpeechTier !== 'skip' && !effectiveSysInfo?.speechModels.find((m) => m.tier === selectedSpeechTier)?.installed
    const needsTranslationProfile = selectedTranslationProfileTier !== 'skip' && !effectiveSysInfo?.translationProfiles?.find((m) => m.tier === selectedTranslationProfileTier)?.installed

    setDownloadError(null)
    setProgressLogs([])
    setModelProgress(needsModel ? 0 : 100)
    setModelMb(null); setModelEta(null)
    setLlamaProgress(needsLlama ? 0 : 100)
    setLlamaMb(null)
    setVoiceProgress(needsVoice ? 0 : 100)
    setVoiceMb(null)
    setFontsProgress(needsFonts ? 0 : 100)
    setFontsFiles(null); setFontsMb(null)
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
        if (task) downloadTasks.push({ name: 'model', promise: markDone(task, () => setModelProgress(100)) })
      }
      if (needsLlama && selectedTier) {
        const backendLabel = LLAMA_BACKEND_OPTIONS.find((o) => o.key === selectedLlamaBackend)?.label ?? selectedLlamaBackend
        appendProgressLog(`Starting llama.cpp runtime download (${backendLabel})…`)
        const task = api.downloadLlama?.(selectedLlamaBackend)
        if (task) downloadTasks.push({ name: 'llama', promise: markDone(task, () => setLlamaProgress(100)) })
      }
      if (needsVoice) {
        appendProgressLog(`Starting Japanese voice model download (${selectedVoiceTier})…`)
        const task = api.downloadVoiceEngine?.(selectedVoiceTier)
        if (task) downloadTasks.push({ name: 'voice', promise: markDone(task, () => setVoiceProgress(100)) })
      }
      if (needsFonts) {
        appendProgressLog('Starting fonts download…')
        const task = api.downloadFonts?.()
        if (task) downloadTasks.push({ name: 'fonts', promise: markDone(task, () => setFontsProgress(100)) })
      }
      if (needsDictionary) {
        appendProgressLog('Starting offline dictionary download…')
        const task = api.downloadDictionary?.()
        if (task) downloadTasks.push({ name: 'dictionary', promise: markDone(task, () => setDictionaryProgress(100)) })
      }
      if (needsSpeech) {
        appendProgressLog(`Starting speech recognition model download (${selectedSpeechTier})…`)
        const task = api.downloadSpeechModel?.(selectedSpeechTier)
        if (task) downloadTasks.push({ name: 'speech', promise: markDone(task, () => setSpeechProgress(100)) })
      }
      if (needsTranslationProfile) {
        appendProgressLog(`Starting translation profile setup (${selectedTranslationProfileTier})…`)
        const task = api.applyTranslationProfile?.(selectedTranslationProfileTier)
        if (task) downloadTasks.push({ name: 'translation-profile', promise: markDone(task, () => setTranslationProfileProgress(100)) })
      }

      if (downloadTasks.length > 0) {
        const results = await Promise.allSettled(downloadTasks.map((t) => t.promise))
        const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        if (failure) throw failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason))
      }
      if (needsFonts) await api.reloadLocalFonts?.().catch(() => undefined)
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
    if (!downloadDone) await window.jplearnDesktop.skipSetup?.()
    onComplete()
  }, [downloadDone, onComplete])

  const handleSetupModeContinue = useCallback(() => {
    if (setupMode === 'simple') {
      applySimpleSetupDefaults()
      setPage(7)
    } else {
      setPage(3)
    }
  }, [setupMode, applySimpleSetupDefaults])

  const summaryProps = { sysInfo, selectedTier, selectedLlamaBackend, selectedVoiceTier, installFonts, installDictionary, selectedSpeechTier, selectedTranslationProfileTier, createDesktop, createStartMenu, onCreateDesktop: setCreateDesktop, onCreateStartMenu: setCreateStartMenu }

  return (
    <WizardShell
      title="Setup"
      totalSteps={9}
      currentStep={page}
      onMinimize={() => void window.jplearnDesktop?.minimizeWindow()}
      onMaximize={() => void window.jplearnDesktop?.toggleMaximizeWindow()}
      onClose={() => void window.jplearnDesktop?.closeWindow()}
    >
      <StepLayout
        title={PAGE_TITLES[page]}
        subtitle={PAGE_SUBTITLES[page]}
        onNext={
          page === 1 ? () => setPage(2)
          : page === 2 ? handleSetupModeContinue
          : page === 3 ? () => setPage(4)
          : page === 4 ? () => setPage(5)
          : page === 5 ? () => setPage(6)
          : page === 6 ? () => setPage(7)
          : page === 7 ? startDownloads
          : page === 9 ? handleFinish
          : undefined
        }
        onBack={
          page === 2 ? () => setPage(1)
          : page === 3 ? () => setPage(2)
          : page === 4 ? () => setPage(3)
          : page === 5 ? () => setPage(4)
          : page === 6 ? () => setPage(5)
          : page === 7 ? () => setPage(setupMode === 'simple' ? 2 : 6)
          : undefined
        }
        onSkip={page === 1 ? () => handleFinish() : undefined}
        nextLabel={
          page === 1 ? 'Get Started'
          : setupMode === 'simple' ? 'Continue'
          : page === 7 ? (needsAnyDownload(summaryProps) ? 'Start Setup' : 'Finish')
          : page === 9 ? 'Launch JPLearn'
          : 'Next'
        }
        skipLabel="Skip setup"
        nextDisabled={page === 3 ? !sysInfo : false}
        hideNav={page === 8}
        hideBack={page === 1 || page === 8 || page === 9}
      >
        {page === 1 && <WelcomePage />}
        {page === 2 && <SetupModePage mode={setupMode} onChange={setSetupMode} />}
        {page === 3 && <SystemCheckPage sysInfo={sysInfo} loading={systemInfoLoading} onRefresh={refreshSystemInfo} />}
        {page === 4 && <TutorModelPage sysInfo={sysInfo} selectedTier={selectedTier} selectedLlamaBackend={selectedLlamaBackend} onTierChange={setSelectedTier} onBackendChange={setSelectedLlamaBackend} />}
        {page === 5 && <VoiceModelPage sysInfo={sysInfo} selectedVoiceTier={selectedVoiceTier} selectedSpeechTier={selectedSpeechTier} onVoiceChange={setSelectedVoiceTier} onSpeechChange={setSelectedSpeechTier} />}
        {page === 6 && <ReadingAssetsPage sysInfo={sysInfo} installFonts={installFonts} installDictionary={installDictionary} selectedTranslationProfileTier={selectedTranslationProfileTier} onFontsChange={setInstallFonts} onDictionaryChange={setInstallDictionary} onTranslationChange={setSelectedTranslationProfileTier} />}
        {page === 7 && <DownloadSummaryPage {...summaryProps} />}
        {page === 8 && <DownloadProgressPage sysInfo={sysInfo} selectedTier={selectedTier} selectedVoiceTier={selectedVoiceTier} installFonts={installFonts} installDictionary={installDictionary} selectedSpeechTier={selectedSpeechTier} selectedTranslationProfileTier={selectedTranslationProfileTier} modelProgress={modelProgress} llamaProgress={llamaProgress} voiceProgress={voiceProgress} fontsProgress={fontsProgress} dictionaryProgress={dictionaryProgress} speechProgress={speechProgress} translationProfileProgress={translationProfileProgress} modelMb={modelMb} llamaMb={llamaMb} voiceMb={voiceMb} fontsMb={fontsMb} fontsFiles={fontsFiles} modelEta={modelEta} downloadMethods={downloadMethods} downloadError={downloadError} progressLogs={progressLogs} onRetry={() => { void startDownloads() }} />}
        {page === 9 && <SetupCompletePage />}
      </StepLayout>
    </WizardShell>
  )
}
