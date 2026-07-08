export interface OnboardingAnswers {
  goal?: string
  dailyMinutes?: number
  targetLevel?: string
}

export interface VoiceOption {
  id: string
  name: string
  jp: string
}

export interface OnboardingWizardProps {
  showChatbotSection: boolean
  assistantChatEnabled: boolean
  onAssistantChatToggle: () => void
  showVoiceSection: boolean
  voiceOptions: VoiceOption[]
  voiceEnabled: boolean
  voiceSpeaker: string
  voiceBusy: boolean
  onVoiceToggle: () => void
  onVoiceSelect: (id: string) => void
  showFontSection: boolean
  appFont: string
  fontOptions: Array<{ key: string; label: string }>
  onAppFontSelect: (key: string) => void
  fontSize: 'small' | 'medium' | 'large'
  fontSizeOptions: Array<{ key: 'small' | 'medium' | 'large'; label: string }>
  onFontSizeSelect: (key: 'small' | 'medium' | 'large') => void
  onComplete: (pathId: string, checkedItems: Set<string>, answers: OnboardingAnswers) => void
  onSkip: (checkedItems: Set<string>, answers: OnboardingAnswers) => void
}

export type Page = 1 | 2 | 3 | 4 | 5 | 6

export const ALL_PAGES: Page[] = [1, 2, 3, 4, 5, 6]
export const ALL_PAGES_NO_FEATURES: Page[] = [1, 2, 3, 4, 6]
