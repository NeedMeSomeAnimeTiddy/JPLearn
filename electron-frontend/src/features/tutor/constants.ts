import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Info, Sparkles, Trophy } from 'lucide-react'
import type { AssistantToast } from './types'

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
