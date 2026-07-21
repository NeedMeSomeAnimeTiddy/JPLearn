import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject, SetStateAction, Dispatch } from 'react'
import type {
  AssistantChatRuntimeStatus,
  AssistantChatTurn,
  AssistantEventPayload,
  AssistantToast,
  OcrWorkbenchResult,
  TutorDeps,
  TutorPanelMode,
  TutorSettingsFields,
} from './types'
import {
  ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_BYTES,
  ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB,
  ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT,
  ASSISTANT_EVENT_POLL_MS,
  ASSISTANT_TOAST_TTL_MS,
} from './constants'
import {
  formatAssistantEventBody,
  formatAssistantEventTitle,
  inferScriptFromFocusArea,
  normalizeTranslationWhitespace,
  prepareAssistantChatImagePayload,
  sanitizeOcrTranslationText,
} from './utils'

export interface UseTutorReturn {
  // Shared Tutor popup: open/closed + active mode. Replaces the old
  // independent assistantChatOpen/ocrWorkbenchOpen booleans and their manual
  // mutual exclusion — there is exactly one popup with one active mode.
  tutorPanelOpen: boolean
  tutorPanelMode: TutorPanelMode
  /** Which menu item to restore focus to when navigating back to 'menu'. */
  tutorPanelReturnFocusMode: TutorPanelMode | null
  /** Opens the popup. Omit `mode` (or pass 'menu') to land on the menu; a
   * specific mode opens that activity directly, with Back still available. */
  openTutorPanel: (mode?: TutorPanelMode) => void
  /** Hides the popup. Chat/OCR/scenario state is preserved, not reset. */
  closeTutorPanel: () => void
  /** Switches the visible activity without closing the popup. */
  setTutorPanelMode: (mode: TutorPanelMode) => void
  /** Convenience for setTutorPanelMode('menu'). */
  returnToTutorMenu: () => void

  assistantChatOpen: boolean
  assistantChatMessages: AssistantChatTurn[]
  assistantChatLoading: boolean
  assistantChatError: string | null
  assistantChatInput: string
  setAssistantChatInput: Dispatch<SetStateAction<string>>
  assistantSpeakingTurnKey: string | null
  assistantChatStatus: AssistantChatRuntimeStatus | null
  clearAssistantChat: () => Promise<void>
  sendAssistantChat: (forcedMessage?: string) => Promise<void>
  replayAssistantTurn: (content: string, turnKey: string) => void
  ocrWorkbenchOpen: boolean
  ocrWorkbenchBusy: boolean
  ocrWorkbenchError: string | null
  ocrWorkbenchResult: OcrWorkbenchResult | null
  handleOcrWorkbenchImageSelected: (file: File) => Promise<void>
  clearOcrWorkbenchResult: () => void
  ocrWorkbenchImageInputRef: RefObject<HTMLInputElement | null>
  activeAssistantToast: AssistantToast | null
  dismissAssistantToast: (id: number) => void
  launchAssistantToastAction: (toast: AssistantToast) => void
  assistantChatLogRef: RefObject<HTMLDivElement | null>
  queueAssistantToast: (toast: AssistantToast | null) => void
}

export function useTutor(
  settings: TutorSettingsFields,
  deps: TutorDeps,
): UseTutorReturn {
  const [assistantToasts, setAssistantToasts] = useState<AssistantToast[]>([])
  const [tutorPanelOpen, setTutorPanelOpenState] = useState(false)
  const [tutorPanelMode, setTutorPanelModeState] = useState<TutorPanelMode>('menu')
  const [tutorPanelReturnFocusMode, setTutorPanelReturnFocusMode] = useState<TutorPanelMode | null>(null)
  const [assistantChatInput, setAssistantChatInput] = useState('')
  const [assistantChatMessages, setAssistantChatMessages] = useState<AssistantChatTurn[]>([])
  const [assistantChatLoading, setAssistantChatLoading] = useState(false)
  const [assistantChatError, setAssistantChatError] = useState<string | null>(null)
  const [assistantSpeakingTurnKey, setAssistantSpeakingTurnKey] = useState<string | null>(null)
  const [assistantChatStatus, setAssistantChatStatus] = useState<AssistantChatRuntimeStatus | null>(null)
  const [, setAssistantChatWarmup] = useState(false)
  const [, setAssistantChatFallbackNote] = useState<string | null>(null)
  const [ocrWorkbenchBusy, setOcrWorkbenchBusy] = useState(false)
  const [ocrWorkbenchError, setOcrWorkbenchError] = useState<string | null>(null)
  const [ocrWorkbenchResult, setOcrWorkbenchResult] = useState<OcrWorkbenchResult | null>(null)

  // Derived, not independent state: the popup has exactly one active mode,
  // so "is chat/OCR visible" is simply "is the popup open at that mode" —
  // this replaces the old independently-toggled booleans and their manual
  // mutual exclusion in App.tsx.
  const assistantChatOpen = tutorPanelOpen && tutorPanelMode === 'chat'
  const ocrWorkbenchOpen = tutorPanelOpen && tutorPanelMode === 'ocr'

  const assistantChatHistoryHydratedRef = useRef(false)
  const assistantChatLogRef = useRef<HTMLDivElement | null>(null)
  const ocrWorkbenchImageInputRef = useRef<HTMLInputElement | null>(null)
  const assistantChatClearTokenRef = useRef(0)
  const assistantSeenEventIdsRef = useRef<Set<number>>(new Set())
  const ocrRequestTokenRef = useRef(0)

  const { voice } = deps

  const openTutorPanel = useCallback((mode: TutorPanelMode = 'menu') => {
    setTutorPanelOpenState(true)
    setTutorPanelModeState(mode)
    if (mode !== 'menu') setTutorPanelReturnFocusMode(mode)
  }, [])

  const setTutorPanelMode = useCallback((mode: TutorPanelMode) => {
    setTutorPanelModeState(mode)
    if (mode !== 'menu') setTutorPanelReturnFocusMode(mode)
  }, [])

  const returnToTutorMenu = useCallback(() => {
    setTutorPanelModeState('menu')
  }, [])

  const closeTutorPanel = useCallback(() => {
    // Hides the popup only. Chat messages/input, OCR result/error, and any
    // active scenario session are preserved — nothing here resets them.
    setTutorPanelOpenState(false)
  }, [])

  const speakAssistantReply = useCallback(async (text: string, turnKey?: string): Promise<void> => {
    if (!settings.assistantChatAudioEnabled) {
      return
    }
    const segments = voice.splitSpeechSegments(text)
    if (segments.length <= 0) {
      return
    }

    const runId = voice.assistantSpeechRunIdRef.current + 1
    voice.assistantSpeechRunIdRef.current = runId
    setAssistantSpeakingTurnKey(turnKey ?? null)

    try {
      for (const segment of segments) {
        if (voice.assistantSpeechRunIdRef.current !== runId) {
          return
        }
        await voice.playVoiceRuntimeAudio(segment.text, runId)
      }
    } finally {
      if (voice.assistantSpeechRunIdRef.current === runId) {
        setAssistantSpeakingTurnKey(null)
      }
    }
  }, [settings.assistantChatAudioEnabled, voice])

  const replayAssistantTurn = useCallback((content: string, turnKey: string) => {
    void speakAssistantReply(content, turnKey)
  }, [speakAssistantReply])

  const trackAssistantToastInteraction = useCallback(
    (toast: AssistantToast, actionKind: string, extra?: Record<string, string>) => {
      try {
        const metadata: Record<string, string> = { ...extra }
        ;window.jplearnDesktop?.trackAssistantToastInteraction?.({
          id: toast.id,
          priority: toast.priority,
          messageKey: toast.messageKey,
          eventType: toast.eventType,
          targetMode: toast.targetMode ?? '',
          focusArea: toast.focusArea ?? '',
          actionKind,
          metadata,
        })
      } catch {
        // Telemetry path is best-effort only.
      }
    },
    [],
  )

  const queueAssistantToast = useCallback((toast: AssistantToast | null) => {
    if (!toast || settings.assistantToastLimit <= 0) {
      return
    }
    setAssistantToasts([toast])
  }, [settings.assistantToastLimit])

  const dismissAssistantToast = useCallback((id: number) => {
    setAssistantToasts((previous) => previous.filter((t) => t.id !== id))
  }, [])

  const launchAssistantToastAction = useCallback((toast: AssistantToast) => {
    void trackAssistantToastInteraction(toast, 'clicked', { reason: 'cta-click' })
    const suggestedScript = inferScriptFromFocusArea(toast.focusArea) ?? deps.activeScript
    const suggestedGame = toast.targetMode ?? ('interleave_mix' as import('./types').MinigameKey)
    setAssistantToasts((previous) => previous.filter((item) => item.id !== toast.id))
    deps.onToastNavigate(suggestedScript, suggestedGame, suggestedScript !== deps.activeScript)
  }, [deps, trackAssistantToastInteraction])

  const refreshAssistantChatHistory = useCallback(async (): Promise<boolean> => {
    const getAssistantChatHistory = window.jplearnDesktop?.getAssistantChatHistory
    if (!getAssistantChatHistory) {
      return false
    }
    const clearTokenAtStart = assistantChatClearTokenRef.current
    try {
      const response = await getAssistantChatHistory(20)
      if (assistantChatClearTokenRef.current !== clearTokenAtStart) {
        return false
      }
      if (response.ok) {
        setAssistantChatMessages(response.turns)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  const refreshAssistantChatStatus = useCallback(async (): Promise<AssistantChatRuntimeStatus | null> => {
    const getAssistantChatRuntimeStatus = window.jplearnDesktop?.getAssistantChatRuntimeStatus
    if (!getAssistantChatRuntimeStatus) {
      return null
    }
    try {
      const status = await getAssistantChatRuntimeStatus()
      setAssistantChatStatus(status)
      return status
    } catch {
      return null
    }
  }, [])

  const hydrateAssistantChatFromPreloaded = useCallback(async (): Promise<boolean> => {
    const getPreloadedAssistantChatHistory = window.jplearnDesktop?.getPreloadedAssistantChatHistory
    if (!getPreloadedAssistantChatHistory) {
      return false
    }
    const clearTokenAtStart = assistantChatClearTokenRef.current
    try {
      const response = await getPreloadedAssistantChatHistory()
      if (assistantChatClearTokenRef.current !== clearTokenAtStart) {
        return false
      }
      if (!response.ok || !response.runtimeActive) {
        return false
      }
      setAssistantChatMessages(response.turns)
      assistantChatHistoryHydratedRef.current = true
      return true
    } catch {
      return false
    }
  }, [])

  const isAssistantServerActive = useCallback((status: AssistantChatRuntimeStatus | null): boolean => {
    if (!status?.loaded) {
      return false
    }
    return String(status.activeProvider || '').trim().toLowerCase() === 'llama.cpp'
  }, [])

  const hydrateAssistantChatFromRuntime = useCallback(async (): Promise<boolean> => {
    const status = await refreshAssistantChatStatus()
    if (!isAssistantServerActive(status)) {
      return false
    }
    const hydrated = await refreshAssistantChatHistory()
    if (hydrated) {
      assistantChatHistoryHydratedRef.current = true
    }
    return hydrated
  }, [isAssistantServerActive, refreshAssistantChatHistory, refreshAssistantChatStatus])

  const clearAssistantChat = useCallback(async () => {
    assistantChatClearTokenRef.current += 1
    assistantChatHistoryHydratedRef.current = true
    setAssistantChatMessages([])
    setAssistantChatError(null)
    const clearHistory = window.jplearnDesktop?.clearAssistantChatHistory
    if (!clearHistory) {
      return
    }
    try {
      await clearHistory()
    } catch {
      // Clearing persisted history is best effort.
    }
  }, [])

  const sendAssistantChat = useCallback(async (forcedMessage?: string) => {
    if (!settings.assistantChatEnabled) {
      setAssistantChatError('Chatbot is disabled in settings.')
      return
    }

    const sendAssistantChatMessage = window.jplearnDesktop?.sendAssistantChatMessage
    if (!sendAssistantChatMessage) {
      setAssistantChatError('Assistant chat runtime is unavailable in this build.')
      return
    }

    const message = (forcedMessage ?? assistantChatInput).trim()
    if (!message) {
      return
    }
    if (message.length > ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT) {
      setAssistantChatError(`User chat is limited to ${ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT} characters.`)
      return
    }

    const optimisticTurn: AssistantChatTurn = {
      role: 'user',
      content: message,
      created_at_utc: new Date().toISOString(),
    }
    setAssistantChatMessages((previous) => [...previous, optimisticTurn])
    setAssistantChatInput('')
    setAssistantChatLoading(true)
    setAssistantChatError(null)
    setAssistantChatWarmup(!assistantChatStatus?.loaded)
    try {
      const response = await sendAssistantChatMessage({
        message,
        context: {
          session_id: deps.activeSessionId ?? '',
        },
      })
      if (response.provider === 'scripted-fallback' || response.provider === 'stub-fallback') {
        setAssistantChatFallbackNote('Local model unavailable. Scripted coach mode is active for this chat turn.')
      } else {
        setAssistantChatFallbackNote(null)
      }
      await refreshAssistantChatStatus()
      await refreshAssistantChatHistory()
      if (response.text) {
        void speakAssistantReply(response.text)
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'Unable to send assistant chat message.'
      if (/llama\.cpp exited with code 130/i.test(detail) || /inference cancelled/i.test(detail)) {
        setAssistantChatError('Chat inference cancelled.')
      } else {
        setAssistantChatError(detail)
      }
    } finally {
      setAssistantChatLoading(false)
    }
  }, [assistantChatInput, assistantChatStatus?.loaded, deps.activeSessionId, refreshAssistantChatHistory, refreshAssistantChatStatus, settings.assistantChatEnabled, speakAssistantReply])

  const clearOcrWorkbenchResult = useCallback(() => {
    setOcrWorkbenchResult(null)
    setOcrWorkbenchError(null)
  }, [])

  const handleOcrWorkbenchImageSelected = useCallback(async (file: File) => {
    if (file.size > ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_BYTES) {
      setOcrWorkbenchError(`Image uploads are limited to ${ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB} MB.`)
      return
    }
    if (!file.type.startsWith('image/')) {
      setOcrWorkbenchError('Please choose a PNG, JPEG, or WEBP image.')
      return
    }

    const extractAssistantChatImageText = window.jplearnDesktop?.extractAssistantChatImageText
    if (!extractAssistantChatImageText) {
      setOcrWorkbenchError('Image Translation is unavailable in this build.')
      return
    }
    if (!deps.ocrInstalled) {
      setOcrWorkbenchError('Image Translation is not installed. Install it in Settings > Tutor > Image Translation.')
      return
    }
    const translateAssistantChatOcrText = window.jplearnDesktop?.translateAssistantChatOcrText
    if (!translateAssistantChatOcrText) {
      setOcrWorkbenchError('Offline OCR translation runtime is unavailable in this build.')
      return
    }

    // Guards against an older in-flight OCR request (multi-step: extract then
    // translate) resolving after a newer one has already been started —
    // whichever image was selected most recently is the only one allowed to
    // update ocrWorkbenchResult/Error/Busy.
    const requestToken = ++ocrRequestTokenRef.current
    const isStale = () => ocrRequestTokenRef.current !== requestToken

    setOcrWorkbenchBusy(true)
    setOcrWorkbenchError(null)
    try {
      const payload = await prepareAssistantChatImagePayload(file)
      if (isStale()) return
      const ocrResponse = await extractAssistantChatImageText({
        ...payload,
        minConfidence: settings.assistantChatOcrMinConfidence,
      })
      if (isStale()) return
      const extractedText = typeof ocrResponse?.text === 'string' ? ocrResponse.text.trim() : ''
      if (!extractedText) {
        setOcrWorkbenchError('No readable text was found in that image.')
        return
      }

      const translationResponse = await translateAssistantChatOcrText({
        text: extractedText,
        sourceLang: 'ja',
        targetLang: 'en',
        fastMode: true,
      })
      if (isStale()) return
      const rawEnglishText = (translationResponse?.text ?? '').trim()
      const finalEnglishText = normalizeTranslationWhitespace(sanitizeOcrTranslationText(rawEnglishText))

      if (!finalEnglishText) {
        setOcrWorkbenchError('No translation text returned.')
        return
      }

      const lineCount = Number.isFinite(ocrResponse?.lineCount)
        ? Math.max(0, Math.trunc(ocrResponse.lineCount))
        : extractedText.split(/\n+/).filter(Boolean).length

      setOcrWorkbenchResult({
        fileName: file.name,
        lineCount,
        japaneseText: extractedText,
        englishText: finalEnglishText,
      })
    } catch (error: unknown) {
      if (isStale()) return
      const detail = error instanceof Error && error.message ? error.message : 'Unable to extract text from this image.'
      setOcrWorkbenchError(detail)
    } finally {
      if (!isStale()) setOcrWorkbenchBusy(false)
    }
  }, [deps.ocrInstalled, settings.assistantChatOcrMinConfidence])

  useEffect(() => {
    if (!settings.assistantChatEnabled) {
      return
    }

    let disposed = false

    const tryHydrate = async (): Promise<void> => {
      if (assistantChatHistoryHydratedRef.current || disposed) {
        return
      }
      const hydratedFromPreload = await hydrateAssistantChatFromPreloaded()
      if (hydratedFromPreload || assistantChatHistoryHydratedRef.current) {
        return
      }
      const hydratedFromRuntime = await hydrateAssistantChatFromRuntime()
      if (hydratedFromRuntime || assistantChatHistoryHydratedRef.current || disposed) {
        return
      }
      const loadedFromStore = await refreshAssistantChatHistory()
      if (loadedFromStore) {
        assistantChatHistoryHydratedRef.current = true
      }
    }

    void tryHydrate()

    const startupHydrationPollHandle = window.setInterval(() => {
      void tryHydrate()
    }, 2000)

    return () => {
      disposed = true
      window.clearInterval(startupHydrationPollHandle)
    }
  }, [hydrateAssistantChatFromPreloaded, hydrateAssistantChatFromRuntime, refreshAssistantChatHistory, settings.assistantChatEnabled])

  // oxlint-disable react-hooks/exhaustive-deps — voice is injected via VoiceDeps, not a stable ref
  useEffect(() => {
    if (settings.assistantChatAudioEnabled && assistantChatOpen) {
      return
    }
    voice.cancelAssistantSpeech()
  }, [assistantChatOpen, settings.assistantChatAudioEnabled, voice.cancelAssistantSpeech])

  // Clears transient chat feedback (error/warmup/fallback banners) whenever
  // chat stops being the visible activity, for any reason — popup closed,
  // switched to another mode, or back to the menu. Chat messages and the
  // draft input are NOT cleared here; they persist across all of these.
  useEffect(() => {
    if (assistantChatOpen) return
    setAssistantChatError(null)
    setAssistantChatWarmup(false)
    setAssistantChatFallbackNote(null)
  }, [assistantChatOpen])

  useEffect(() => {
    if (!settings.assistantChatEnabled || !assistantChatOpen) {
      return
    }

    let disposed = false

    async function hydrateAssistantChatPanel(): Promise<void> {
      await refreshAssistantChatHistory()
      if (disposed) return
      await hydrateAssistantChatFromRuntime()
      if (disposed) return
    }

    void hydrateAssistantChatPanel()

    const statusPollHandle = window.setInterval(() => {
      void hydrateAssistantChatFromRuntime()
    }, 10000)

    return () => {
      disposed = true
      window.clearInterval(statusPollHandle)
    }
  }, [assistantChatOpen, hydrateAssistantChatFromRuntime, refreshAssistantChatHistory, refreshAssistantChatStatus, settings.assistantChatEnabled])

  useEffect(() => {
    if (settings.assistantChatEnabled) {
      return
    }

    assistantChatHistoryHydratedRef.current = false
    // Chat was just disabled in settings — if it's the visible activity,
    // fall back to the menu (where the now-hidden Chat item won't reopen it).
    setTutorPanelModeState((currentMode) => (currentMode === 'chat' ? 'menu' : currentMode))
    setAssistantChatLoading(false)
    setAssistantChatWarmup(false)
    setAssistantChatError(null)
    setAssistantChatFallbackNote(null)

    const unloadAssistantChatRuntime = window.jplearnDesktop?.unloadAssistantChatRuntime
    if (!unloadAssistantChatRuntime) {
      return
    }
    void unloadAssistantChatRuntime().catch(() => undefined)
  }, [settings.assistantChatEnabled])

  useEffect(() => {
    const getAssistantSnapshotFn = window.jplearnDesktop?.getAssistantSnapshot
    if (!getAssistantSnapshotFn) {
      return
    }

    let cancelled = false

    async function refreshAssistantSnapshot(): Promise<void> {
      try {
        const response = await getAssistantSnapshotFn!(deps.activeSessionId ?? undefined)
        if (!response.ok || cancelled) return
        // Snapshot data is supplementary; profile/state are consumed by other parts of the app.
      } catch {
        // Snapshot is supplementary; keep study loop uninterrupted.
      }
    }

    void refreshAssistantSnapshot()

    return () => {
      cancelled = true
    }
  }, [deps.activeSessionId])

  useEffect(() => {
    const getAssistantEventsFn = window.jplearnDesktop?.getAssistantEvents
    const consumeAssistantEventsFn = window.jplearnDesktop?.consumeAssistantEvents
    if (!getAssistantEventsFn || !consumeAssistantEventsFn) {
      return
    }

    let disposed = false

    async function pullAssistantEvents(): Promise<void> {
      try {
        const response = await getAssistantEventsFn!(8)
        if (!response.ok || disposed || response.events.length === 0) {
          return
        }

        const fresh = response.events.filter((event) => !assistantSeenEventIdsRef.current.has(event.id))
        for (const event of fresh) {
          assistantSeenEventIdsRef.current.add(event.id)
        }

        const canShowToast = deps.isInMinigameSession
        if (fresh.length > 0 && settings.assistantToastLimit > 0 && canShowToast) {
          const priorityWeight: Record<AssistantEventPayload['priority'], number> = {
            critical: 4,
            coaching: 3,
            celebration: 2,
            info: 1,
          }
          const selectedEvent = fresh.reduce((best, candidate) => (
            priorityWeight[candidate.priority] >= priorityWeight[best.priority] ? candidate : best
          ))
          queueAssistantToast({
            id: selectedEvent.id,
            priority: selectedEvent.priority,
            eventType: selectedEvent.event_type,
            messageKey: selectedEvent.message_key,
            title: formatAssistantEventTitle(selectedEvent),
            body: formatAssistantEventBody(selectedEvent),
            targetMode: null,
            focusArea: selectedEvent.metadata.focus_area ?? null,
            actionType: null,
            actionLabel: 'Got it',
          })
        }

        await consumeAssistantEventsFn!(response.events.map((event) => event.id))
      } catch {
        // Non-blocking polling path.
      }
    }

    void pullAssistantEvents()
    const pollHandle = window.setInterval(() => {
      void pullAssistantEvents()
    }, ASSISTANT_EVENT_POLL_MS)

    return () => {
      disposed = true
      window.clearInterval(pollHandle)
    }
  }, [deps.isInMinigameSession, queueAssistantToast, settings.assistantToastLimit])

  useEffect(() => {
    if (settings.assistantToastLimit <= 0) {
      setAssistantToasts([])
      return
    }
    setAssistantToasts((previous) => previous.slice(-settings.assistantToastLimit))
  }, [settings.assistantToastLimit])

  useEffect(() => {
    if (deps.isInMinigameSession) {
      return
    }
    setAssistantToasts([])
  }, [deps.isInMinigameSession])

  useEffect(() => {
    if (assistantToasts.length <= 0) {
      return
    }

    const timeoutHandle = window.setTimeout(() => {
      const expiredToast = assistantToasts[0]
      void trackAssistantToastInteraction(expiredToast, 'expired', { reason: 'ttl' })
      setAssistantToasts((previous) => previous.slice(1))
    }, ASSISTANT_TOAST_TTL_MS)

    return () => {
      window.clearTimeout(timeoutHandle)
    }
  }, [assistantToasts, trackAssistantToastInteraction])

  useEffect(() => {
    if (!assistantChatOpen) {
      return
    }
    const log = assistantChatLogRef.current
    if (!log) {
      return
    }
    log.scrollTop = log.scrollHeight
  }, [assistantChatOpen, assistantChatMessages, assistantChatLoading])

  const activeAssistantToast = useMemo(() => assistantToasts[0] ?? null, [assistantToasts])

  return {
    tutorPanelOpen,
    tutorPanelMode,
    tutorPanelReturnFocusMode,
    openTutorPanel,
    closeTutorPanel,
    setTutorPanelMode,
    returnToTutorMenu,

    assistantChatOpen,
    assistantChatMessages,
    assistantChatLoading,
    assistantChatError,
    assistantChatInput,
    setAssistantChatInput,
    assistantSpeakingTurnKey,
    assistantChatStatus,
    clearAssistantChat,
    sendAssistantChat,
    replayAssistantTurn,
    ocrWorkbenchOpen,
    ocrWorkbenchBusy,
    ocrWorkbenchError,
    ocrWorkbenchResult,
    handleOcrWorkbenchImageSelected,
    clearOcrWorkbenchResult,
    ocrWorkbenchImageInputRef,
    activeAssistantToast,
    dismissAssistantToast,
    launchAssistantToastAction,
    assistantChatLogRef,
    queueAssistantToast,
  }
}
