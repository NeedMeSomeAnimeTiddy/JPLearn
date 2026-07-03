import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelOption {
  tier: 'low' | 'medium' | 'high' | 'ultra'
  filename: string
  sizeMb: number
  label: string
  description: string
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface SystemInfo {
  totalRamGb: number
  recommendedTier: 'low' | 'medium' | 'high' | 'ultra'
  models: ModelOption[]
  llamaCppInstalled: boolean
  gpuAdapters?: string[]
  gpuVramGb?: number | null
  llamaCppBackend?: 'cuda' | 'hip' | 'vulkan' | 'cpu'
  llamaCppBackendLabel?: string
  fontsInstalled: boolean
  dictionaryInstalled: boolean
  speechModels: SpeechModelOption[]
  recommendedSpeechTier?: 'fast' | 'balanced' | 'high' | 'ultra'
  activeSpeechModelTier?: 'fast' | 'balanced' | 'high' | 'ultra' | null
  isPackaged: boolean
  networkMbps?: number | null
  llamaCppEstimatedDownloadMinutes?: number | null
  fontsEstimatedDownloadMinutes?: number | null
  dictionaryEstimatedDownloadMinutes?: number | null
  qwenttsInstalled: boolean
  qwenttsModels: QwenttsModelOption[]
  qwenttsDefaultTier: '0.6b'
  activeQwenttsTier?: '0.6b' | null
}

interface SpeechModelOption {
  tier: 'fast' | 'balanced' | 'high' | 'ultra'
  label: string
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface QwenttsModelOption {
  tier: '0.6b'
  filename: string
  sizeMb: number
  combinedSizeMb: number
  label: string
  description: string
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

interface ProgressEvent {
  id: 'model' | 'llama' | 'qwentts' | 'fonts' | 'dictionary' | 'speech'
  percent: number
  mb: number | null
  totalMb: number | null
  etaSec: number | null
  filesDone?: number | null
  filesTotal?: number | null
  logMessage?: string
}

interface Props {
  onComplete: () => void
}

interface CompactDropdownOption {
  value: string
  label: string
  meta?: string
  badge?: string
  badgeTone?: 'recommended' | 'soft' | 'warning'
}

type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag'
}

type ModelTier = 'low' | 'medium' | 'high' | 'ultra' | 'skip'
type SpeechTier = 'fast' | 'balanced' | 'high' | 'ultra' | 'skip'
type LlamaBackend = 'cuda' | 'hip' | 'vulkan' | 'cpu'
type QwenttsTier = '0.6b' | 'skip'
type SetupMode = 'advanced' | 'simple'
type Page = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

const LLAMA_BACKEND_OPTIONS: Array<{ key: LlamaBackend; label: string; description: string }> = [
  { key: 'cuda', label: 'NVIDIA GPU', description: 'Uses CUDA. Usually the fastest option for NVIDIA graphics cards.' },
  { key: 'hip', label: 'AMD GPU', description: 'Uses ROCm/HIP. Choose this for AMD graphics cards when GPU acceleration is available.' },
  { key: 'vulkan', label: 'Intel / Vulkan', description: 'Uses Vulkan. A good fallback for Intel graphics and other systems with Vulkan support.' },
  { key: 'cpu', label: 'CPU Only', description: 'No GPU acceleration. Best for maximum compatibility and the safest fallback.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEta(sec: number | null): string {
  if (sec === null || sec <= 0) return ''
  if (sec < 60) return `~${sec}s remaining`
  const m = Math.round(sec / 60)
  return `~${m} min remaining`
}

function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`
  return `${mb} MB`
}

function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return 'est. unavailable'
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) return `~${hours} h`
  return `~${hours} h ${rem} min`
}

function getModelHardwareFit(systemInfo: SystemInfo | null, tier: 'low' | 'medium' | 'high' | 'ultra') {
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

function getSpeechHardwareFit(systemInfo: SystemInfo | null, tier: 'fast' | 'balanced' | 'high' | 'ultra') {
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

// ── Component ─────────────────────────────────────────────────────────────────

export function SetupWizard({ onComplete }: Props) {
  const [page, setPage] = useState<Page>(1)
  const [setupMode, setSetupMode] = useState<SetupMode>('advanced')
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [systemInfoLoading, setSystemInfoLoading] = useState(false)
  const [selectedTier, setSelectedTier] = useState<ModelTier | null>(null)
  const [selectedLlamaBackend, setSelectedLlamaBackend] = useState<LlamaBackend>('cpu')
  const [selectedQwenttsTier, setSelectedQwenttsTier] = useState<QwenttsTier>('0.6b')
  const [modelProgress, setModelProgress] = useState(0)
  const [llamaProgress, setLlamaProgress] = useState(0)
  const [qwenttsProgress, setQwenttsProgress] = useState(0)
  const [modelMb, setModelMb] = useState<{ done: number; total: number } | null>(null)
  const [llamaMb, setLlamaMb] = useState<{ done: number; total: number } | null>(null)
  const [qwenttsMb, setQwenttsMb] = useState<{ done: number; total: number } | null>(null)
  const [modelEta, setModelEta] = useState<number | null>(null)
  const [installFonts, setInstallFonts] = useState(true)
  const [fontsProgress, setFontsProgress] = useState(0)
  const [fontsFiles, setFontsFiles] = useState<{ done: number; total: number } | null>(null)
  const [fontsMb, setFontsMb] = useState<{ done: number; total: number } | null>(null)
  const [installDictionary, setInstallDictionary] = useState(true)
  const [dictionaryProgress, setDictionaryProgress] = useState(0)
  const [selectedSpeechTier, setSelectedSpeechTier] = useState<SpeechTier>('fast')
  const [speechProgress, setSpeechProgress] = useState(0)
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
      setSelectedQwenttsTier((prev) => {
        if (prev !== 'skip' && info.qwenttsModels?.some((model) => model.tier === prev)) {
          return prev
        }
        return info.activeQwenttsTier ?? info.qwenttsDefaultTier ?? '0.6b'
      })
      setSelectedSpeechTier((prev) => {
        if (prev !== 'skip' && info.speechModels?.some((model) => model.tier === prev)) {
          return prev
        }
        return info.activeSpeechModelTier ?? info.recommendedSpeechTier ?? 'fast'
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
        isPackaged: false,
        qwenttsInstalled: false,
        qwenttsModels: [],
        qwenttsDefaultTier: '0.6b',
        activeQwenttsTier: null,
      })
      setSelectedTier('low')
      setSelectedLlamaBackend('cpu')
    } finally {
      setSystemInfoLoading(false)
    }
  }, [])

  const applySimpleSetupDefaults = useCallback(() => {
    setSelectedTier('skip')
    setSelectedQwenttsTier('skip')
    setInstallFonts(false)
    setInstallDictionary(true)
    setSelectedSpeechTier('fast')
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
      } else if (evt.id === 'qwentts') {
        setQwenttsProgress(evt.percent)
        if (evt.mb !== null && evt.totalMb !== null) {
          setQwenttsMb({ done: evt.mb, total: evt.totalMb })
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
    const needsVoice = selectedQwenttsTier !== 'skip' && !effectiveSysInfo?.qwenttsModels.find((m) => m.tier === selectedQwenttsTier)?.installed
    const needsFonts = installFonts && !effectiveSysInfo?.fontsInstalled
    const needsDictionary = installDictionary && !effectiveSysInfo?.dictionaryInstalled
    const needsSpeech = selectedSpeechTier !== 'skip' && !effectiveSysInfo?.speechModels.find((m) => m.tier === selectedSpeechTier)?.installed

    setDownloadError(null)
    setProgressLogs([])
    setModelProgress(needsModel ? 0 : 100)
    setModelMb(null)
    setModelEta(null)
    setLlamaProgress(needsLlama ? 0 : 100)
    setLlamaMb(null)
    setQwenttsProgress(needsVoice ? 0 : 100)
    setQwenttsMb(null)
    setFontsProgress(needsFonts ? 0 : 100)
    setFontsFiles(null)
    setFontsMb(null)
    setDictionaryProgress(needsDictionary ? 0 : 100)
    setSpeechProgress(needsSpeech ? 0 : 100)
    appendProgressLog('Starting setup tasks…')
    setPage(8)

    try {
      const downloadTasks: Array<{ name: string; promise: Promise<unknown> }> = []

      if (needsModel && selectedTier) {
        appendProgressLog(`Starting model download (${selectedTier})…`)
        const task = api.downloadModel?.(selectedTier)
        if (task) {
          downloadTasks.push({
            name: 'model',
            promise: task.then((result) => {
              setModelProgress(100)
              return result
            }),
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
            promise: task.then((result) => {
              setLlamaProgress(100)
              return result
            }),
          })
        }
      }
      if (needsVoice) {
        appendProgressLog(`Starting Japanese voice model download (${selectedQwenttsTier})…`)
        const task = api.downloadQwentts?.(selectedQwenttsTier)
        if (task) {
          downloadTasks.push({
            name: 'qwentts',
            promise: task.then((result) => {
              setQwenttsProgress(100)
              return result
            }),
          })
        }
      }
      if (needsFonts) {
        appendProgressLog('Starting fonts download…')
        const task = api.downloadFonts?.()
        if (task) {
          downloadTasks.push({
            name: 'fonts',
            promise: task.then((result) => {
              setFontsProgress(100)
              return result
            }),
          })
        }
      }
      if (needsDictionary) {
        appendProgressLog('Starting offline dictionary download…')
        const task = api.downloadDictionary?.()
        if (task) {
          downloadTasks.push({
            name: 'dictionary',
            promise: task.then((result) => {
              setDictionaryProgress(100)
              return result
            }),
          })
        }
      }
      if (needsSpeech) {
        appendProgressLog(`Starting speech recognition model download (${selectedSpeechTier})…`)
        const task = api.downloadSpeechModel?.(selectedSpeechTier)
        if (task) {
          downloadTasks.push({
            name: 'speech',
            promise: task.then((result) => {
              setSpeechProgress(100)
              return result
            }),
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
  }, [selectedTier, selectedLlamaBackend, selectedQwenttsTier, installFonts, installDictionary, selectedSpeechTier, sysInfo, createDesktop, createStartMenu, appendProgressLog])

  const handleFinish = useCallback(async () => {
    if (!downloadDone) {
      await window.jplearnDesktop.skipSetup?.()
    }
    onComplete()
  }, [downloadDone, onComplete])

  // ── Render helpers ─────────────────────────────────────────────────────────

  function ProgressBar({ value, label }: { value: number; label: string }) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem', opacity: 0.8 }}>
          <span>{label}</span>
          <span>{value}%</span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            borderRadius: '4px',
            background: 'var(--accent, #7eb8ea)',
            width: `${value}%`,
            transition: 'width 0.3s ease',
          }} />
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

  const qwenttsModelOptions: CompactDropdownOption[] = [
    ...(sysInfo?.qwenttsModels.map((model) => ({
      value: model.tier,
      label: model.label,
      meta: `${formatSize(model.combinedSizeMb)} • ${formatDurationMinutes(model.estimatedDownloadMinutes)}${model.installed ? ' • Installed' : ''}`,
      badge: model.tier === sysInfo?.qwenttsDefaultTier ? 'Recommended' : undefined,
      badgeTone: model.tier === sysInfo?.qwenttsDefaultTier ? ('recommended' as const) : undefined,
    })) ?? []),
    {
      value: 'skip',
      label: 'Skip Japanese voice install',
      meta: 'Install later from settings',
    },
  ]
  const selectedQwenttsModel = sysInfo?.qwenttsModels.find((model) => model.tier === selectedQwenttsTier)
  const selectedQwenttsTierDescription = selectedQwenttsTier === 'skip'
    ? 'Voice playback will be unavailable until you install a Japanese voice model later from Settings.'
    : selectedQwenttsModel?.description

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
              border: setupMode === 'simple' ? '1px solid var(--accent, #7eb8ea)' : '1px solid rgba(255,255,255,0.14)',
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
              border: setupMode === 'advanced' ? '1px solid var(--accent, #7eb8ea)' : '1px solid rgba(255,255,255,0.14)',
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
                <span style={{ fontWeight: 600, color: 'var(--accent, #7eb8ea)' }}>
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
          <p style={{ color: '#ffc107', fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
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
          JPLearn's local Japanese text-to-speech runs entirely on your device using a curated bank of
          preset voices — useful for hearing correct readings of new words during study sessions.
        </p>
        {sysInfo?.qwenttsInstalled ? (
          <p style={{ color: 'var(--accent, #7eb8ea)' }}>✓ A Japanese voice model is already installed.</p>
        ) : (
          <>
            <CompactDropdown
              ariaLabel="Japanese voice model"
              options={qwenttsModelOptions}
              value={selectedQwenttsTier}
              onChange={(value) => setSelectedQwenttsTier(value as QwenttsTier)}
            />
            {selectedQwenttsTierDescription ? (
              <p style={{ opacity: 0.65, fontSize: '0.84rem', lineHeight: 1.45, margin: '0.6rem 0 0' }}>
                {selectedQwenttsTierDescription}
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
            <p style={{ color: '#ffc107', fontSize: '0.82rem', lineHeight: 1.4, margin: '0.35rem 0 0' }}>
              {selectedSpeechTierWarning}
            </p>
          ) : null}
        </div>
      </PageLayout>
    ),

    6: (
      <PageLayout
        title="Reading Assets (optional)"
        subtitle="Install optional Japanese fonts and offline dictionary data."
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
            <p style={{ color: 'var(--accent, #7eb8ea)', fontSize: '0.9rem' }}>✓ Fonts are already installed.</p>
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
            <p style={{ color: 'var(--accent, #7eb8ea)', fontSize: '0.9rem' }}>✓ Offline dictionary is already installed.</p>
          ) : (
            <CheckboxOption
              label={`Download offline dictionary (~30 MB)  •  ${formatDurationMinutes(sysInfo?.dictionaryEstimatedDownloadMinutes)}`}
              checked={installDictionary}
              onChange={setInstallDictionary}
            />
          )}
        </div>
      </PageLayout>
    ),

    7: (() => {
      const needsModel = selectedTier && selectedTier !== 'skip' && !sysInfo?.models.find(m => m.tier === selectedTier)?.installed
      const needsLlama = selectedTier && selectedTier !== 'skip' && !sysInfo?.llamaCppInstalled
      const needsVoice = selectedQwenttsTier !== 'skip' && !sysInfo?.qwenttsModels.find(m => m.tier === selectedQwenttsTier)?.installed
      const needsFonts = installFonts && !sysInfo?.fontsInstalled
      const needsDictionary = installDictionary && !sysInfo?.dictionaryInstalled
      const needsSpeech = selectedSpeechTier !== 'skip' && !sysInfo?.speechModels.find(m => m.tier === selectedSpeechTier)?.installed
      const modelInfo = sysInfo?.models.find(m => m.tier === selectedTier)
      const speechModelInfo = sysInfo?.speechModels.find(m => m.tier === selectedSpeechTier)
      const qwenttsModelInfo = sysInfo?.qwenttsModels.find(m => m.tier === selectedQwenttsTier)
      return (
        <PageLayout
          title="Ready to download"
          subtitle="Review what will be downloaded, then click Start Setup."
          onNext={startDownloads}
          onBack={() => setPage(setupMode === 'simple' ? 2 : 6)}
          nextLabel={needsModel || needsLlama || needsVoice || needsFonts || needsDictionary || needsSpeech ? 'Start Setup' : 'Finish'}
        >
          {needsModel && modelInfo && (
            <SummaryRow label="AI Tutor model" detail={`${modelInfo.label} — ${formatSize(modelInfo.sizeMb)}`} />
          )}
          {needsLlama && (
            <SummaryRow label="llama.cpp runtime" detail={`Local tutor server binary (${LLAMA_BACKEND_OPTIONS.find((option) => option.key === selectedLlamaBackend)?.label ?? selectedLlamaBackend})`} />
          )}
          {needsVoice && (
            <SummaryRow label="Japanese voice model" detail={qwenttsModelInfo ? `${qwenttsModelInfo.label} — ${formatSize(qwenttsModelInfo.combinedSizeMb)}` : 'Japanese voice model'} />
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
          {!needsModel && !needsVoice && !needsFonts && !needsDictionary && !needsSpeech && (
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
              />
            )}
            <ProgressBar
              value={modelProgress}
              label={`AI Tutor model${modelMb ? ` (${modelMb.done} / ${modelMb.total} MB)` : ''}`}
            />
            {modelEta !== null && modelProgress > 0 && modelProgress < 100 && (
              <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                {formatEta(modelEta)}
              </p>
            )}
          </>
        )}
        {selectedQwenttsTier !== 'skip' && !sysInfo?.qwenttsModels.find(m => m.tier === selectedQwenttsTier)?.installed && (
          <ProgressBar
            value={qwenttsProgress}
            label={`Japanese voice model${qwenttsMb ? ` (${qwenttsMb.done} / ${qwenttsMb.total} MB)` : ''}`}
          />
        )}
        {installFonts && !sysInfo?.fontsInstalled && (
          <>
            <ProgressBar
              value={fontsProgress}
              label={`Japanese fonts${fontsMb ? ` (${fontsMb.done} / ${fontsMb.total} MB)` : ''}`}
            />
            {fontsFiles && fontsProgress > 0 && fontsProgress < 100 && (
              <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                Downloading files {fontsFiles.done}/{fontsFiles.total}
              </p>
            )}
          </>
        )}
        {installDictionary && !sysInfo?.dictionaryInstalled && (
          <ProgressBar value={dictionaryProgress} label="Offline dictionary" />
        )}
        {selectedSpeechTier !== 'skip' && !sysInfo?.speechModels.find((model) => model.tier === selectedSpeechTier)?.installed && (
          <ProgressBar value={speechProgress} label="Speech recognition model" />
        )}
        {downloadError && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(255,80,80,0.12)', border: '1px solid rgba(255,80,80,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <span style={{ color: '#ff7b7b', lineHeight: 1.5, fontSize: '0.88rem', minWidth: 0 }}>Download failed: {downloadError}</span>
            <button
              type="button"
              onClick={() => { void startDownloads() }}
              style={{ ...btnStyle('secondary'), flexShrink: 0 }}
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

function PageLayout({
  title,
  subtitle,
  children,
  onNext,
  onBack,
  onSkip,
  nextLabel = 'Next',
  skipLabel,
  nextDisabled = false,
  hideNav = false,
  hideBack = false,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
  onNext?: () => void
  onBack?: () => void
  onSkip?: () => void
  nextLabel?: string
  skipLabel?: string
  nextDisabled?: boolean
  hideNav?: boolean
  hideBack?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{title}</h1>
        {subtitle && <p style={{ margin: '0.4rem 0 0', opacity: 0.65, fontSize: '0.95rem' }}>{subtitle}</p>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {!hideNav && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.5rem' }}>
          {skipLabel && onSkip && (
            <button type="button" onClick={onSkip} style={btnStyle('ghost')}>{skipLabel}</button>
          )}
          {!hideBack && onBack && (
            <button type="button" onClick={onBack} style={btnStyle('secondary')}>Back</button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} disabled={nextDisabled} style={btnStyle('primary', nextDisabled)}>
              {nextLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CheckboxOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer', padding: '0.65rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'transparent'}` }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent, #7eb8ea)', width: '1rem', height: '1rem', flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>{label}</span>
    </label>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ? 'var(--accent, #7eb8ea)' : undefined }}>{value}</span>
    </div>
  )
}

function SummaryRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', marginBottom: '0.4rem' }}>
      <span>{label}</span>
      <span style={{ opacity: 0.65, fontSize: '0.9rem' }}>{detail}</span>
    </div>
  )
}

function CompactDropdown({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string
  options: CompactDropdownOption[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0] ?? null

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.75rem',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        position: 'relative',
      }}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.16)',
          background: 'rgba(255,255,255,0.06)',
          color: 'inherit',
          padding: '0.7rem 0.8rem',
          fontSize: '0.92rem',
          fontWeight: 600,
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label ?? 'Choose an option'}</span>
          {selected?.badge ? (
            <DropdownBadge tone={selected.badgeTone}>{selected.badge}</DropdownBadge>
          ) : null}
          {selected?.meta ? (
            <span style={{ opacity: 0.58, fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.meta}
            </span>
          ) : null}
        </span>
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" style={{ opacity: 0.72, flexShrink: 0 }} />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            left: '0.75rem',
            right: '0.75rem',
            top: 'calc(100% - 0.15rem)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            padding: '0.4rem',
            borderRadius: '10px',
            background: 'rgba(18, 27, 37, 0.98)',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 18px 38px rgba(0,0,0,0.34)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {options.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                style={{
                  borderRadius: '8px',
                  border: isActive ? '1px solid rgba(255,255,255,0.18)' : '1px solid transparent',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  padding: '0.58rem 0.68rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{option.label}</span>
                  {option.badge ? <DropdownBadge tone={option.badgeTone}>{option.badge}</DropdownBadge> : null}
                </span>
                {option.meta ? (
                  <span style={{ fontSize: '0.76rem', opacity: 0.6, whiteSpace: 'nowrap' }}>{option.meta}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function DropdownBadge({ children, tone = 'recommended' }: { children: React.ReactNode; tone?: 'recommended' | 'soft' | 'warning' }) {
  const isSoft = tone === 'soft'
  const isWarning = tone === 'warning'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.12rem 0.42rem',
        borderRadius: '999px',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: isWarning ? '#ffd4cc' : isSoft ? '#f5ddb8' : '#0b1620',
        background: isWarning ? 'rgba(199, 77, 57, 0.18)' : isSoft ? 'rgba(242, 181, 111, 0.16)' : 'var(--accent, #7eb8ea)',
        border: isWarning ? '1px solid rgba(199, 77, 57, 0.3)' : isSoft ? '1px solid rgba(242, 181, 111, 0.24)' : '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  )
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '1.5rem' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? '20px' : '8px',
            height: '8px',
            borderRadius: '4px',
            background: i + 1 === current ? 'var(--accent, #7eb8ea)' : 'rgba(255,255,255,0.25)',
            transition: 'width 0.25s, background 0.25s',
          }}
        />
      ))}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'block',
  background: 'transparent',
  zIndex: 9999,
}

const cardStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  borderRadius: 0,
  background: 'rgba(25, 35, 48, 0.86)',
  border: 'none',
  boxShadow: 'none',
  color: '#e8f0fa',
  fontFamily: 'inherit',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  backdropFilter: 'blur(4px)',
}

const dragBarStyle: AppRegionStyle = {
  height: '34px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 0.9rem',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))',
  WebkitAppRegion: 'drag',
}

const dragBarTitleStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.68,
  fontWeight: 700,
  userSelect: 'none',
  pointerEvents: 'none',
}

const cardViewportStyle: AppRegionStyle = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '0.4rem 1.25rem 1.4rem',
  WebkitAppRegion: 'no-drag',
}

const stepDotsRowStyle: AppRegionStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '0.75rem 1.25rem 0.2rem',
  WebkitAppRegion: 'no-drag',
}

const cardBodyStyle: AppRegionStyle = {
  padding: '2rem',
  width: '100%',
  maxWidth: '760px',
  margin: 0,
  WebkitAppRegion: 'no-drag',
}

function btnStyle(variant: 'primary' | 'secondary' | 'ghost', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    borderRadius: '7px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'opacity 0.15s',
    opacity: disabled ? 0.45 : 1,
  }
  if (variant === 'primary') return { ...base, background: 'var(--accent, #7eb8ea)', color: '#0b1620' }
  if (variant === 'secondary') return { ...base, background: 'rgba(255,255,255,0.1)', color: '#e8f0fa' }
  return { ...base, background: 'transparent', color: 'rgba(255,255,255,0.5)', padding: '0.5rem 0.75rem' }
}


