export interface TutorInstallInfo {
  totalRamGb: number
  models: Array<{
    tier: 'low' | 'medium' | 'high' | 'ultra'
    filename: string
    sizeMb: number
    embedderSizeMb?: number
    combinedSizeMb?: number
    label: string
    description: string
    installed: boolean
    estimatedDownloadMinutes?: number | null
  }>
  recommendedTier: 'low' | 'medium' | 'high' | 'ultra'
  activeModelTier?: 'low' | 'medium' | 'high' | 'ultra' | null
  activeEmbedderTier?: 'e5_small' | 'e5_base' | 'e5_large' | null
  activeEmbedderLabel?: string | null
  activeEmbedderInstalled?: boolean
  activeEmbedderEnabled?: boolean
  llamaCppInstalled: boolean
  gpuVramGb?: number | null
  voiceInstalled: boolean
  voiceModels: Array<{
    tier: '0.6b'
    filename: string
    sizeMb: number
    combinedSizeMb: number
    label: string
    description: string
    installed: boolean
    estimatedDownloadMinutes?: number | null
  }>
  activeVoiceModel?: '0.6b' | null
  fontsInstalled: boolean
  dictionaryInstalled: boolean
  llamaCppEstimatedDownloadMinutes?: number | null
  dictionaryEstimatedDownloadMinutes?: number | null
  speechModels: Array<{
    tier: 'fast' | 'balanced' | 'high' | 'ultra'
    label: string
    description: string
    sizeMb: number
    installed: boolean
    estimatedDownloadMinutes?: number | null
  }>
  recommendedSpeechTier?: 'fast' | 'balanced' | 'high' | 'ultra'
  activeSpeechModelTier?: 'fast' | 'balanced' | 'high' | 'ultra' | null
  ocrModels?: Array<{
    tier: 'standard'
    label: string
    description: string
    sizeMb: number
    installed: boolean
    estimatedDownloadMinutes?: number | null
  }>
  recommendedOcrTier?: 'standard'
  activeOcrModelTier?: 'standard' | null
  ocrInstalled?: boolean
  translationModels?: Array<{
    tier: 'qwen_ja_en'
    label: string
    badge?: 'Qwen Translation'
    description: string
    sizeMb: number
    installed: boolean
    estimatedDownloadMinutes?: number | null
  }>
  recommendedTranslationTier?: 'qwen_ja_en'
  activeTranslationModelTier?: 'qwen_ja_en' | null
  translationInstalled?: boolean
  translationProfiles?: Array<{
    tier: 'ocr_qwen_local'
    label: string
    badge?: 'Recommended'
    description: string
    sizeMb: number
    installed: boolean
    estimatedDownloadMinutes?: number | null
  }>
  activeTranslationProfileTier?: 'ocr_qwen_local' | null
}

export type TutorModelTier = 'low' | 'medium' | 'high' | 'ultra'
export type TranslationProfileTier = 'ocr_qwen_local'
