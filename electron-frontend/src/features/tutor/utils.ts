import type { AssistantEventPayload, ScriptKey } from './types'
import {
  ASSISTANT_CHAT_IMAGE_MAX_DIMENSION,
  ASSISTANT_CHAT_IMAGE_JPEG_QUALITY,
} from './constants'

export function clampAssistantChatOcrMinConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.3
  }
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100))
}

export function isAssistantToastLimit(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) {
        reject(new Error('Failed to read image file.'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

export async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unsupported image format.'))
    image.src = dataUrl
  })
}

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid image data. Please try another file.')
  }
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2],
  }
}

export async function prepareAssistantChatImagePayload(file: File): Promise<{
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  imageBase64: string
}> {
  const originalDataUrl = await fileToDataUrl(file)
  const originalParsed = parseDataUrl(originalDataUrl)
  const acceptedMime = new Set(['image/png', 'image/jpeg', 'image/webp'])

  const sourceImage = await loadImageElement(originalDataUrl)
  const maxSide = Math.max(sourceImage.width, sourceImage.height, 1)
  const scale = Math.min(1, ASSISTANT_CHAT_IMAGE_MAX_DIMENSION / maxSide)
  const targetWidth = Math.max(1, Math.round(sourceImage.width * scale))
  const targetHeight = Math.max(1, Math.round(sourceImage.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Image processing is unavailable in this environment.')
  }
  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)

  const compressedDataUrl = canvas.toDataURL('image/jpeg', ASSISTANT_CHAT_IMAGE_JPEG_QUALITY)
  const compressedParsed = parseDataUrl(compressedDataUrl)

  const useOriginal = acceptedMime.has(originalParsed.mimeType) && originalParsed.base64.length <= compressedParsed.base64.length
  if (useOriginal) {
    return {
      mimeType: originalParsed.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
      imageBase64: originalParsed.base64,
    }
  }

  return {
    mimeType: 'image/jpeg',
    imageBase64: compressedParsed.base64,
  }
}

export function formatAssistantEventTitle(event: AssistantEventPayload): string {
  if (event.event_type === 'session_goal_met') return 'You did it'
  if (event.event_type === 'streak_milestone') return 'Streak glow'
  if (event.event_type === 'leech_intervention') return 'Keep going'
  if (event.event_type === 'weakness_spike') return 'You are improving'
  if (event.event_type === 'curriculum_stall') return 'Progress takes time'
  if (event.event_type === 'activity_nudge') return 'Small steps count'
  if (event.event_type === 'session_recovery') return 'Fresh start'
  if (event.event_type === 'momentum_encouragement') return 'Nice momentum'
  return 'You are doing great'
}

export function formatAssistantEventBody(event: AssistantEventPayload): string {
  if (event.message_key === 'coach.goal_met') {
    return 'Great focus. Keep that same calm pace on the next card.'
  }
  if (event.message_key === 'coach.streak_milestone') {
    const days = event.metadata.days ?? '0'
    return `${days}-day streak. Your consistency is paying off.`
  }
  if (event.message_key === 'coach.leech_intervention') {
    return 'Tough cards happen. You are still moving forward.'
  }
  if (event.message_key === 'coach.weakness_focus') {
    return 'This is a growth zone, not a setback. Keep practicing.'
  }
  if (event.message_key === 'coach.curriculum_stall') {
    return 'Learning curves are normal. Your next clean answer matters most.'
  }
  if (event.message_key === 'coach.activity_nudge') {
    return 'Even short sessions build real progress. Nice effort today.'
  }
  if (event.message_key === 'coach.session_recovery') {
    return 'New round, new chance. You have got this.'
  }
  if (event.message_key === 'coach.momentum_encouragement') {
    return 'You are in a good flow right now. Keep riding it.'
  }
  return 'Nice work showing up and practicing. Keep going.'
}

export function normalizeTrackTerms(text: string): string {
  return text
    .replace(/Vocabulary\s*N5/gi, 'Vocabulary (N5)')
    .replace(/Grammar\s*N5/gi, 'Grammar (N5)')
}

export function inferScriptFromFocusArea(focusArea: string | null): ScriptKey | null {
  if (!focusArea) return null
  const normalized = focusArea.trim().toLowerCase()
  if (normalized === 'hiragana') return 'hiragana'
  if (normalized === 'katakana') return 'katakana'
  if (normalized.includes('kanji')) return 'kanji_n5'
  if (normalized.includes('vocab')) return 'vocab_n5'
  if (normalized.includes('grammar') || normalized.includes('conversational')) return 'grammar_patterns'
  return null
}

export function sanitizeOcrTranslationText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const leadingBoilerplate = [
    /^\*{0,2}English Translation\*{0,2}:?\s*$/i,
    /^English:\s*Here's the translation and explanation:?\s*$/i,
    /^English:?\s*$/i,
    /^Here's the translation and explanation:?\s*$/i,
    /^Translation:?\s*$/i,
    /^Translated Text:?\s*$/i,
  ]

  const trailingBoilerplate = [
    /^notes?:?$/i,
    /^vocabulary notes?:?$/i,
    /^explanation:?$/i,
    /^clarification:?$/i,
    /^context:?$/i,
    /^literal translation:?$/i,
    /^alternative translation:?$/i,
    /^if you want/i,
    /^let me know/i,
  ]

  while (lines.length > 0) {
    const first = lines[0]?.trim() ?? ''
    if (!first) {
      lines.shift()
      continue
    }
    if (leadingBoilerplate.some((pattern) => pattern.test(first))) {
      lines.shift()
      continue
    }
    break
  }

  if (lines.length === 0) {
    return ''
  }

  lines[0] = (lines[0] ?? '')
    .replace(/^\*{0,2}English Translation\*{0,2}\s*:?\s*/i, '')
    .replace(/^English:\s*Here's the translation and explanation:?\s*/i, '')
    .replace(/^English:\s*/i, '')
    .replace(/^Here's the translation and explanation:?\s*/i, '')

  const cleanedLines: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && trailingBoilerplate.some((pattern) => pattern.test(trimmed))) {
      break
    }
    cleanedLines.push(line)
  }

  return cleanedLines.join('\n').trim()
}

export function normalizeTranslationWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseProgressMethod(logMessage: string | null | undefined): string | null {
  if (!logMessage) return null
  const match = logMessage.match(/downloading:\s*\d+%\s*\[([^\]]+)\]/i)
  if (!match) return null
  const method = match[1]?.trim()
  return method ? method : null
}
