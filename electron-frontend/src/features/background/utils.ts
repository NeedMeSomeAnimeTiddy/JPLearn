import type { BackgroundStyle } from './types'
import {
  BACKGROUND_BLUR_MIN,
  BACKGROUND_BLUR_MAX,
  CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH,
  CUSTOM_BACKGROUND_MAX_EDGE,
} from './constants'

export function isBackgroundStyle(value: unknown): value is BackgroundStyle {
  return (
    value === 'classic_scene' ||
    value === 'fuji_view' ||
    value === 'torii_gate' ||
    value === 'temple_reflection' ||
    value === 'garden_bridge' ||
    value === 'autumn_pond' ||
    value === 'custom_upload'
  )
}

export function clampBackgroundBlur(value: number): number {
  return Math.max(BACKGROUND_BLUR_MIN, Math.min(BACKGROUND_BLUR_MAX, Math.round(value)))
}

export function resolveBackgroundImageUrl(imagePath: string): string {
  if (typeof window === 'undefined') return imagePath
  try {
    return new URL(imagePath, window.location.href).toString()
  } catch {
    return imagePath
  }
}

export function createBackgroundPreviewDataUrl(source: HTMLImageElement, width: number, height: number): string | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return null

  const targetRatio = width / height
  const sourceRatio = sourceWidth / sourceHeight

  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = Math.round(sourceHeight * targetRatio)
    sx = Math.round((sourceWidth - sw) / 2)
  } else if (sourceRatio < targetRatio) {
    sh = Math.round(sourceWidth / targetRatio)
    sy = Math.round((sourceHeight - sh) / 2)
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)

  try {
    return canvas.toDataURL('image/webp', 0.72)
  } catch {
    return canvas.toDataURL('image/jpeg', 0.78)
  }
}

export function normalizeCustomBackgroundDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized.startsWith('data:image/')) return null
  if (normalized.length > CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH) return null
  return normalized
}

export function hasSupportedImageExtension(fileName: string): boolean {
  const normalizedName = fileName.trim().toLowerCase()
  return normalizedName.endsWith('.png')
    || normalizedName.endsWith('.jpg')
    || normalizedName.endsWith('.jpeg')
    || normalizedName.endsWith('.webp')
    || normalizedName.endsWith('.avif')
    || normalizedName.endsWith('.gif')
    || normalizedName.endsWith('.bmp')
}

export function isSupportedBackgroundImageFile(file: File): boolean {
  const mimeType = (file.type || '').trim().toLowerCase()
  if (mimeType.startsWith('image/')) {
    return true
  }
  return hasSupportedImageExtension(file.name)
}

export async function optimizeBackgroundFileToDataUrl(file: File): Promise<string> {
  let bitmap: ImageBitmap | null = null
  let objectUrl: string | null = null

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas context unavailable.')
    }

    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file)
      } catch {
        bitmap = null
      }
    }

    if (bitmap) {
      const sourceWidth = bitmap.width
      const sourceHeight = bitmap.height
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Invalid image dimensions.')
      }

      const scale = Math.min(1, CUSTOM_BACKGROUND_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
      const width = Math.max(1, Math.round(sourceWidth * scale))
      const height = Math.max(1, Math.round(sourceHeight * scale))

      canvas.width = width
      canvas.height = height
      context.drawImage(bitmap, 0, 0, width, height)

      try {
        return canvas.toDataURL('image/webp', 0.8)
      } catch {
        return canvas.toDataURL('image/jpeg', 0.86)
      }
    }

    objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl

    try {
      await image.decode()
    } catch {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Unable to decode image file.'))
      })
    }

    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error('Invalid image dimensions.')
    }

    const scale = Math.min(1, CUSTOM_BACKGROUND_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    canvas.width = width
    canvas.height = height

    context.drawImage(image, 0, 0, width, height)

    try {
      return canvas.toDataURL('image/webp', 0.8)
    } catch {
      return canvas.toDataURL('image/jpeg', 0.86)
    }
  } finally {
    if (bitmap) {
      bitmap.close()
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  }
}
