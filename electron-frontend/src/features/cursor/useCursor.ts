import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CursorMode, CursorTheme, CursorSettings } from './types'
import {
  CURSOR_MODE_OPTIONS,
  CURSOR_THEME_OPTIONS,
  CURSOR_SIZE_OPTIONS,
  CURSOR_SIZE_MAP,
  CURSOR_THEME_DOT_COLORS,
  CURSOR_THEME_RING_BORDERS,
} from './constants'
import {
  getCursorAccentColor,
  getCachedCursorUri,
  getCursorHotspot,
  isPointerFine,
  prefersReducedMotion,
  lerp,
  isInteractiveElement,
} from './utils'

const STYLE_ID = 'jplearn-cursor-override'

function injectCursorStyle(mode: string, theme: CursorTheme): void {
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()

  if (mode === 'system') return

  const style = document.createElement('style')
  style.id = STYLE_ID

  if (mode === 'custom') {
    const accent = getCursorAccentColor()
    const uri = getCachedCursorUri(theme, accent)
    const hotspot = getCursorHotspot(theme)
    style.textContent = `*{cursor:url(${uri}) ${hotspot.x} ${hotspot.y},auto!important}`
  } else if (mode === 'animated') {
    style.textContent = '*{cursor:none!important}'
  }

  document.head.appendChild(style)
}

function removeCursorStyle(): void {
  const el = document.getElementById(STYLE_ID)
  if (el) el.remove()
}

export interface UseCursorReturn {
  cursorMode: CursorMode
  cursorTheme: CursorTheme
  cursorSize: number
  cursorColor: string | null
  cursorPos: { x: number; y: number }
  ringPos: { x: number; y: number }
  ringScale: number
  isHoveringInteractive: boolean
  isPointerDown: boolean
  setCursorMode: (mode: CursorMode) => void
  setCursorTheme: (theme: CursorTheme) => void
  setCursorSize: (size: number) => void
  setCursorColor: (color: string | null) => void
  cursorModeOptions: typeof CURSOR_MODE_OPTIONS
  cursorThemeOptions: typeof CURSOR_THEME_OPTIONS
  cursorSizeOptions: typeof CURSOR_SIZE_OPTIONS
  cursorSizeMap: typeof CURSOR_SIZE_MAP
  dotColor: string
  ringBorderColor: string
}

export function useCursor(
  settings: { cursor: CursorSettings },
  setSettings: Dispatch<SetStateAction<{ cursor: CursorSettings }>>,
): UseCursorReturn {
  const { mode, theme, size, color: cursorColor } = settings.cursor
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 })
  const [ringPos, setRingPos] = useState({ x: -100, y: -100 })
  const [ringScale, setRingScale] = useState(1)
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false)
  const [isPointerDown, setIsPointerDown] = useState(false)

  const posRef = useRef(cursorPos)
  const ringPosRef = useRef(ringPos)
  const isPointerDownRef = useRef(false)
  const rafRef = useRef<number>(0)
  const animationActiveRef = useRef(false)

  const setCursorMode = useCallback((nextMode: CursorMode) => {
    setSettings((prev) => ({
      ...prev,
      cursor: { ...prev.cursor, mode: nextMode },
    }))
  }, [setSettings])

  const setCursorTheme = useCallback((nextTheme: CursorTheme) => {
    setSettings((prev) => ({
      ...prev,
      cursor: { ...prev.cursor, theme: nextTheme },
    }))
  }, [setSettings])

  const setCursorSize = useCallback((nextSize: number) => {
    setSettings((prev) => ({
      ...prev,
      cursor: { ...prev.cursor, size: nextSize },
    }))
  }, [setSettings])

  const setCursorColor = useCallback((nextColor: string | null) => {
    setSettings((prev) => ({
      ...prev,
      cursor: { ...prev.cursor, color: nextColor },
    }))
  }, [setSettings])

  const effectiveMode = useCallback((): CursorMode => {
    if (mode === 'animated') {
      if (prefersReducedMotion() || !isPointerFine()) {
        return 'custom'
      }
    }
    if (mode === 'custom' && !isPointerFine()) {
      return 'system'
    }
    return mode
  }, [mode])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const currentMode = effectiveMode()
    injectCursorStyle(currentMode, theme)

    if (currentMode !== 'animated') return

    function handleMouseMove(event: MouseEvent): void {
      posRef.current = { x: event.clientX, y: event.clientY }
    }

    function handleMouseDown(): void {
      isPointerDownRef.current = true
      setIsPointerDown(true)
      setRingScale(0.7)
    }

    function handleMouseUp(): void {
      isPointerDownRef.current = false
      setIsPointerDown(false)
      setRingScale(1)
    }

    let hoverDebounce = 0
    function handleMouseOver(event: MouseEvent): void {
      if (hoverDebounce) return
      hoverDebounce = window.requestAnimationFrame(() => {
        const interactive = isInteractiveElement(event.target as Element | null)
        setIsHoveringInteractive(interactive)
        if (interactive) {
          setRingScale((prev) => (prev < 1.2 ? 1.4 : prev))
        } else if (!isPointerDownRef.current) {
          setRingScale(1)
        }
        hoverDebounce = 0
      })
    }

    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('pointermove', handleMouseMove, { passive: true })
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mouseover', handleMouseOver, { passive: true })

    const loop = (): void => {
      const targetX = posRef.current.x
      const targetY = posRef.current.y

      ringPosRef.current = {
        x: lerp(ringPosRef.current.x, targetX, 0.18),
        y: lerp(ringPosRef.current.y, targetY, 0.18),
      }

      if (animationActiveRef.current) {
        setCursorPos({ x: targetX, y: targetY })
        setRingPos({ x: ringPosRef.current.x, y: ringPosRef.current.y })
      } else {
        animationActiveRef.current = true
        setCursorPos({ x: targetX, y: targetY })
        setRingPos({ x: targetX, y: targetY })
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      removeCursorStyle()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointermove', handleMouseMove)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mouseover', handleMouseOver)
      cancelAnimationFrame(rafRef.current)
      animationActiveRef.current = false
      setIsPointerDown(false)
      setIsHoveringInteractive(false)
      setRingScale(1)
    }
  }, [mode, theme, effectiveMode])

  useEffect(() => {
    return () => {
      removeCursorStyle()
    }
  }, [])

  const resolvedDotColor = useMemo(() => {
    if (cursorColor) return cursorColor
    return CURSOR_THEME_DOT_COLORS[theme]
  }, [cursorColor, theme])

  const resolvedRingBorder = useMemo(() => {
    if (cursorColor) {
      const r = parseInt(cursorColor.slice(1, 3), 16) || 0
      const g = parseInt(cursorColor.slice(3, 5), 16) || 0
      const b = parseInt(cursorColor.slice(5, 7), 16) || 0
      return `rgba(${r}, ${g}, ${b}, 0.62)`
    }
    return CURSOR_THEME_RING_BORDERS[theme]
  }, [cursorColor, theme])

  return {
    cursorMode: mode,
    cursorTheme: theme,
    cursorSize: size,
    cursorColor,
    cursorPos,
    ringPos,
    ringScale,
    isHoveringInteractive,
    isPointerDown,
    setCursorMode,
    setCursorTheme,
    setCursorSize,
    setCursorColor,
    cursorModeOptions: CURSOR_MODE_OPTIONS,
    cursorThemeOptions: CURSOR_THEME_OPTIONS,
    cursorSizeOptions: CURSOR_SIZE_OPTIONS,
    cursorSizeMap: CURSOR_SIZE_MAP,
    dotColor: resolvedDotColor,
    ringBorderColor: resolvedRingBorder,
  }
}
