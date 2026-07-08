export { useTutor } from './useTutor'
export type { UseTutorReturn } from './useTutor'
export { TutorChatPanel } from './components/TutorChatPanel'
export { OcrWorkbench } from './components/OcrWorkbench'
export { TutorToast } from './components/TutorToast'
export { TutorSettingsTab } from './components/TutorSettingsTab'
export { TutorTitlebarButton } from './components/TutorTitlebarButton'
export * from './types'
export * from './constants'
export {
  clampAssistantChatOcrMinConfidence,
  isAssistantToastLimit,
  normalizeTrackTerms,
  formatAssistantEventTitle,
  formatAssistantEventBody,
  fileToDataUrl,
  loadImageElement,
  parseDataUrl,
  prepareAssistantChatImagePayload,
  sanitizeOcrTranslationText,
  normalizeTranslationWhitespace,
  parseProgressMethod,
  inferScriptFromFocusArea,
} from './utils'
