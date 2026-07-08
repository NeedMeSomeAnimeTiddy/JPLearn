import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react'
import type { BackgroundStyle, BackgroundSettingsFields } from './types'
import {
  BACKGROUND_OPTIONS,
  CUSTOM_BACKGROUND_MAX_BYTES,
  CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH,
} from './constants'
import {
  clampBackgroundBlur,
  createBackgroundPreviewDataUrl,
  isSupportedBackgroundImageFile,
  optimizeBackgroundFileToDataUrl,
  resolveBackgroundImageUrl,
} from './utils'

export interface UseBackgroundReturn {
  backgroundOptions: typeof BACKGROUND_OPTIONS
  backgroundPreviewUrls: Partial<Record<BackgroundStyle, string>>
  appShellStyle: CSSProperties
  selectedBackgroundOption: (typeof BACKGROUND_OPTIONS)[number]
  selectedBackgroundUrl: string | undefined
  backgroundBlur: number
  customBackgroundDataUrl: string | null
  customBackgroundActionMessage: string | null
  selectBackground: (key: BackgroundStyle) => void
  setBackgroundBlur: (value: number) => void
  openCustomBackgroundPicker: () => void
  clearCustomBackground: () => void
  handleCustomBackgroundFileImport: (event: ChangeEvent<HTMLInputElement>) => void
  customBackgroundImportInputRef: RefObject<HTMLInputElement | null>
}

export function useBackground(
  settings: BackgroundSettingsFields,
  setSettings: Dispatch<SetStateAction<BackgroundSettingsFields>>,
): UseBackgroundReturn {
  const [customBackgroundActionMessage, setCustomBackgroundActionMessage] = useState<string | null>(null)
  const [backgroundPreviewUrls, setBackgroundPreviewUrls] = useState<Partial<Record<BackgroundStyle, string>>>({})
  const backgroundImageCacheRef = useRef<Partial<Record<BackgroundStyle, HTMLImageElement>>>({})
  const customBackgroundImportInputRef = useRef<HTMLInputElement | null>(null)

  const backgroundOptions = BACKGROUND_OPTIONS

  const resolvedBackgroundUrls = useMemo(() => {
    const next: Partial<Record<BackgroundStyle, string>> = {}
    BACKGROUND_OPTIONS.forEach((option) => {
      if (!option.imagePath) return
      next[option.key] = resolveBackgroundImageUrl(option.imagePath)
    })
    return next
  }, [])

  useEffect(() => {
    let cancelled = false

    async function preloadBackgroundAssets(): Promise<void> {
      const photoOptions = BACKGROUND_OPTIONS.filter(
        (option): option is (typeof BACKGROUND_OPTIONS)[number] & { imagePath: string } => Boolean(option.imagePath),
      )

      const previewMap: Partial<Record<BackgroundStyle, string>> = {}

      await Promise.all(
        photoOptions.map(async (option) => {
          const src = resolvedBackgroundUrls[option.key]
          if (!src) return

          const image = new Image()
          image.decoding = 'async'
          image.src = src

          try {
            await image.decode()
          } catch {
            await new Promise<void>((resolve) => {
              image.onload = () => resolve()
              image.onerror = () => resolve()
            })
          }

          if (cancelled) return
          backgroundImageCacheRef.current[option.key] = image

          const previewDataUrl = createBackgroundPreviewDataUrl(image, 272, 112)
          if (previewDataUrl) {
            previewMap[option.key] = previewDataUrl
          }
        }),
      )

      if (!cancelled) {
        setBackgroundPreviewUrls((previous) => ({
          ...previous,
          ...previewMap,
        }))
      }
    }

    void preloadBackgroundAssets()

    return () => {
      cancelled = true
    }
  }, [resolvedBackgroundUrls])

  const selectedBackgroundOption = useMemo(
    () => BACKGROUND_OPTIONS.find((option) => option.key === settings.backgroundStyle) ?? BACKGROUND_OPTIONS[0],
    [settings.backgroundStyle],
  )

  const selectedBackgroundUrl = selectedBackgroundOption.key === 'custom_upload'
    ? settings.customBackgroundDataUrl ?? undefined
    : (selectedBackgroundOption.imagePath
      ? resolvedBackgroundUrls[selectedBackgroundOption.key]
      : undefined)

  const appShellStyle = useMemo(() => ({
    '--background-image': selectedBackgroundUrl ? `url("${selectedBackgroundUrl}")` : 'none',
    '--background-blur': `${clampBackgroundBlur(settings.backgroundBlur)}px`,
  } as CSSProperties), [selectedBackgroundUrl, settings.backgroundBlur])

  const openCustomBackgroundPicker = useCallback(() => {
    customBackgroundImportInputRef.current?.click()
  }, [])

  const selectBackground = useCallback((key: BackgroundStyle) => {
    setSettings((previous) => ({ ...previous, backgroundStyle: key }))
  }, [setSettings])

  const setBackgroundBlur = useCallback((value: number) => {
    setSettings((previous) => ({ ...previous, backgroundBlur: clampBackgroundBlur(value) }))
  }, [setSettings])

  const clearCustomBackground = useCallback(() => {
    setSettings((previous) => ({
      ...previous,
      customBackgroundDataUrl: null,
      customBackgroundName: null,
      backgroundStyle: previous.backgroundStyle === 'custom_upload' ? 'classic_scene' : previous.backgroundStyle,
    }))
    setCustomBackgroundActionMessage('Custom background removed.')
  }, [setSettings])

  const handleCustomBackgroundFileImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) {
      return
    }
    if (!isSupportedBackgroundImageFile(file)) {
      setCustomBackgroundActionMessage('Please choose an image file.')
      return
    }
    if (file.size > CUSTOM_BACKGROUND_MAX_BYTES) {
      setCustomBackgroundActionMessage('Image is too large. Choose a file under 15 MB.')
      return
    }

    try {
      const dataUrl = await optimizeBackgroundFileToDataUrl(file)
      if (dataUrl.length > CUSTOM_BACKGROUND_MAX_DATA_URL_LENGTH) {
        setCustomBackgroundActionMessage('Image is still too large after compression. Choose a smaller image.')
        return
      }
      setSettings((previous) => ({
        ...previous,
        backgroundStyle: 'custom_upload',
        customBackgroundDataUrl: dataUrl,
        customBackgroundName: file.name,
      }))
      setCustomBackgroundActionMessage(`Custom background set: ${file.name}`)
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
      setCustomBackgroundActionMessage(`Could not process selected image${detail}`)
    }
  }, [setSettings])

  return {
    backgroundOptions,
    backgroundPreviewUrls,
    appShellStyle,
    selectedBackgroundOption,
    selectedBackgroundUrl,
    backgroundBlur: settings.backgroundBlur,
    customBackgroundDataUrl: settings.customBackgroundDataUrl,
    customBackgroundActionMessage,
    selectBackground,
    setBackgroundBlur,
    openCustomBackgroundPicker,
    clearCustomBackground,
    handleCustomBackgroundFileImport,
    customBackgroundImportInputRef,
  }
}
