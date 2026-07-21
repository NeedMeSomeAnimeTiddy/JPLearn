import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Drama, ImagePlus, Info, MessageCircle, Sparkles, Trophy } from 'lucide-react'
import type { AssistantToast, TutorMenuItem, TutorPanelHeaderCopy, TutorPanelMode } from './types'

export const ASSISTANT_EVENT_POLL_MS = 15000
export const ASSISTANT_TOAST_TTL_MS = 3800
export const ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT = 600
export const ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB = 30
export const ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_BYTES = ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB * 1024 * 1024
export const ASSISTANT_CHAT_IMAGE_MAX_DIMENSION = 2200
export const ASSISTANT_CHAT_IMAGE_JPEG_QUALITY = 0.62
export const ASSISTANT_MAX_TOASTS = 1

export const ASSISTANT_TOAST_LIMIT_OPTIONS: Array<{ value: 0 | 1; label: string }> = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' },
]

export const ASSISTANT_TOAST_ICONS: Record<AssistantToast['priority'], LucideIcon> = {
  info: Info,
  coaching: Sparkles,
  critical: AlertTriangle,
  celebration: Trophy,
}

// --- Shared Tutor popup: menu + mode navigation ------------------------------

export const TUTOR_MENU_ITEMS: TutorMenuItem[] = [
  {
    mode: 'chat',
    label: 'Chat with Tutor',
    description: 'Ask your coach for strategy help or encouragement.',
    icon: MessageCircle,
  },
  {
    mode: 'scenarios',
    label: 'Scenario Practice',
    description: 'Practice a scripted Japanese conversation, like ordering at a cafe.',
    icon: Drama,
  },
  {
    mode: 'ocr',
    label: 'Image Translation',
    description: 'Extract Japanese text from an image and get an English translation.',
    icon: ImagePlus,
  },
]

export const TUTOR_PANEL_HEADER_COPY: Record<TutorPanelMode, TutorPanelHeaderCopy> = {
  menu: { title: 'TUTOR', catalog: 'MENU' },
  chat: { title: 'SENSEI', catalog: 'STUDY COACH v4.2' },
  scenarios: { title: 'SCENARIO PRACTICE', catalog: 'ROLEPLAY' },
  ocr: { title: 'OCR', catalog: 'IMAGE TRANSLATOR' },
}
