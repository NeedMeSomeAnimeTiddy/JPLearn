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

/* the image was read but not translated: the lines stay on screen and this sits above them */
export const OCR_TRANSLATION_FAILED_PREFIX = "Read the text, but couldn't translate it: "
export const OCR_NO_TRANSLATION_REASON = 'no translation came back'

/* a chat turn failed: shown where the reply would be, never kept in the history (audit 15, F2) */
export const TUTOR_FAILED_PREFIX = "The tutor couldn't answer: "
/* an error with no message of its own; one of the main process's own reasons (audit 15, r2 change 5) */
export const TUTOR_NO_REASON = 'the model stopped with an error'

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
