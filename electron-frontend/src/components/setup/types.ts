export interface ModelOption {
  tier: 'low' | 'medium' | 'high' | 'ultra'
  filename: string
  sizeMb: number
  label: string
  description: string
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

export interface SystemInfo {
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
  ocrModels?: OcrModelOption[]
  recommendedOcrTier?: 'standard'
  activeOcrModelTier?: 'standard' | null
  ocrInstalled?: boolean
  translationModels?: TranslationModelOption[]
  recommendedTranslationTier?: 'qwen_ja_en'
  activeTranslationModelTier?: 'qwen_ja_en' | null
  translationInstalled?: boolean
  translationProfiles?: TranslationProfileOption[]
  activeTranslationProfileTier?: 'ocr_qwen_local' | null
  isPackaged: boolean
  networkMbps?: number | null
  llamaCppEstimatedDownloadMinutes?: number | null
  fontsEstimatedDownloadMinutes?: number | null
  dictionaryEstimatedDownloadMinutes?: number | null
  voiceInstalled?: boolean
  voiceModels?: VoiceModelOption[]
  voiceDefaultModel?: '0.6b'
  activeVoiceModel?: '0.6b' | null
}

export interface SpeechModelOption {
  tier: 'fast' | 'balanced' | 'high' | 'ultra'
  label: string
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

export interface OcrModelOption {
  tier: 'standard'
  label: string
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

export interface TranslationModelOption {
  tier: 'qwen_ja_en'
  label: string
  badge?: 'Qwen Translation'
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

export interface TranslationProfileOption {
  tier: 'ocr_qwen_local'
  label: string
  badge?: 'Recommended'
  description: string
  sizeMb: number
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

export interface VoiceModelOption {
  tier: '0.6b'
  filename: string
  sizeMb: number
  combinedSizeMb: number
  label: string
  description: string
  installed: boolean
  estimatedDownloadMinutes?: number | null
}

export interface ProgressEvent {
  id: 'model' | 'llama' | 'voice' | 'fonts' | 'dictionary' | 'speech' | 'ocr' | 'translation'
  percent: number
  mb: number | null
  totalMb: number | null
  etaSec: number | null
  filesDone?: number | null
  filesTotal?: number | null
  logMessage?: string
}

export interface Props {
  onComplete: () => void
}

export interface CompactDropdownOption {
  value: string
  label: string
  meta?: string
  badge?: string
  badgeTone?: 'recommended' | 'soft' | 'warning'
}

export type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag'
}

export type ModelTier = 'low' | 'medium' | 'high' | 'ultra' | 'skip'
export type SpeechTier = 'fast' | 'balanced' | 'high' | 'ultra' | 'skip'
export type TranslationProfileTier = 'ocr_qwen_local' | 'skip'
export type LlamaBackend = 'cuda' | 'hip' | 'vulkan' | 'cpu'
export type VoiceTier = '0.6b' | 'skip'
export type SetupMode = 'advanced' | 'simple'
export type Page = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export const LLAMA_BACKEND_OPTIONS: Array<{ key: LlamaBackend; label: string; description: string }> = [
  { key: 'cuda', label: 'NVIDIA GPU', description: 'Uses CUDA. Usually the fastest option for NVIDIA graphics cards.' },
  { key: 'hip', label: 'AMD GPU', description: 'Uses ROCm/HIP. Choose this for AMD graphics cards when GPU acceleration is available.' },
  { key: 'vulkan', label: 'Intel / Vulkan', description: 'Uses Vulkan. A good fallback for Intel graphics and other systems with Vulkan support.' },
  { key: 'cpu', label: 'CPU Only', description: 'No GPU acceleration. Best for maximum compatibility and the safest fallback.' },
]
