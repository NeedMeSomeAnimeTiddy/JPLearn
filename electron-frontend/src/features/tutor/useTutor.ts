import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AssistantChatTurn,
  AssistantEventPayload,
  AssistantToast,
  OcrWorkbenchResult,
  TutorDeps,
  TutorSettingsFields,
} from './types'
import {
  ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_BYTES,
  ASSISTANT_CHAT_MAX_IMAGE_UPLOAD_MB,
  ASSISTANT_CHAT_USER_MEDIUM_CHAR_LIMIT,
  ASSISTANT_EVENT_POLL_MS,
  ASSISTANT_TOAST_TTL_MS,
  OCR_NO_TRANSLATION_REASON,
  OCR_TRANSLATION_FAILED_PREFIX,
  TUTOR_FAILED_PREFIX,
  TUTOR_NO_REASON,
} from './constants'
import {
  formatAssistantEventBody,
  formatAssistantEventTitle,
  inferScriptFromFocusArea,
  normalizeTranslationWhitespace,
  prepareAssistantChatImagePayload,
  sanitizeOcrTranslationText,
} from './utils'
import { ipcErrorReason } from '../../lib/ipcErrorReason'

export interface UseTutorReturn {
  /* THE CHAT AND THE IMAGE TRANSLATION ARE LOOK IT UP'S TWO MODEL ROUTES now (A QUESTION and A
     SCREENSHOT); the pop-up that held them is retired. This hook keeps their state and their calls,
     and "the chat is showing" is whether Look it up is standing on A QUESTION (`lookupChatVisible`). */
  assistantChatOpen: boolean
  assistantChatMessages: AssistantChatTurn[]
  assistantChatLoading: boolean
  assistantChatError: string | null
  assistantSpeakingTurnKey: string | null
  clearAssistantChat: () => Promise<void>
  sendAssistantChat: (message: string) => Promise<void>
  replayAssistantTurn: (content: string, turnKey: string) => void
  ocrWorkbenchBusy: boolean
  ocrWorkbenchError: string | null
  ocrWorkbenchResult: OcrWorkbenchResult | null
  handleOcrWorkbenchImageSelected: (file: File) => Promise<void>
  clearOcrWorkbenchResult: () => void
  activeAssistantToast: AssistantToast | null
  dismissAssistantToast: (id: number) => void
  launchAssistantToastAction: (toast: AssistantToast) => void
  queueAssistantToast: (toast: AssistantToast | null) => void
  /** the main process has been told the window is up: warm the tutor now if the chat is on */
  notifyTutorStartupReady: () => void
}

/* splitSpeechSegments files a run of digits or punctuation under Japanese; it is not Japanese to speak */
const JAPANESE_SPEECH_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/

export function useTutor(
  settings: TutorSettingsFields,
  deps: TutorDeps,
): UseTutorReturn {
  const [assistantToasts, setAssistantToasts] = useState<AssistantToast[]>([])
  const [assistantChatMessages, setAssistantChatMessages] = useState<AssistantChatTurn[]>([])
  const [assistantChatLoading, setAssistantChatLoading] = useState(false)
  const [assistantChatError, setAssistantChatError] = useState<string | null>(null)
  const [assistantSpeakingTurnKey, setAssistantSpeakingTurnKey] = useState<string | null>(null)
  const [ocrWorkbenchBusy, setOcrWorkbenchBusy] = useState(false)
  const [ocrWorkbenchError, setOcrWorkbenchError] = useState<string | null>(null)
  const [ocrWorkbenchResult, setOcrWorkbenchResult] = useState<OcrWorkbenchResult | null>(null)

  // Derived, not independent state: the chat is showing exactly when Look it
  // up stands on A QUESTION.
  const assistantChatOpen = Boolean(deps.lookupChatVisible)

  /* bumped by every send and every CLEAR: a history read that started before one of them is stale
     (it lacks the turn just sent, or still has the turns just cleared) and is dropped */
  const assistantChatHistoryTokenRef = useRef(0)
  /* a reply is on its way: the main process has not yet appended this exchange, so a history read
     now would wipe the optimistic user turn (audit 15, r2 change 8) */
  const assistantChatPendingRef = useRef(false)
  const assistantSeenEventIdsRef = useRef<Set<number>>(new Set())
  const ocrRequestTokenRef = useRef(0)

  const { voice } = deps

  const speakAssistantReply = useCallback(async (text: string, turnKey?: string): Promise<void> => {
    if (!settings.assistantChatAudioEnabled) {
      return
    }
    /* ONLY THE JAPANESE IS SPOKEN (Robbie, audit 15): the voice is a Japanese voice, and a reply that
       explains in English would be read out badly. A reply with no Japanese stays silent. */
    const segments = voice.splitSpeechSegments(text)
      .filter((segment) => segment.language === 'ja' && JAPANESE_SPEECH_CHAR.test(segment.text))
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

  /* THE HISTORY IS THE MAIN PROCESS'S SESSION ARRAY (audit 15, D5), read when the chat is switched
     on and when it is opened, never while a reply is pending. */
  const refreshAssistantChatHistory = useCallback(async (): Promise<void> => {
    const getAssistantChatHistory = window.jplearnDesktop?.getAssistantChatHistory
    if (!getAssistantChatHistory || assistantChatPendingRef.current) {
      return
    }
    const tokenAtStart = assistantChatHistoryTokenRef.current
    try {
      const response = await getAssistantChatHistory(20)
      if (assistantChatHistoryTokenRef.current !== tokenAtStart || assistantChatPendingRef.current) {
        return
      }
      if (response.ok) {
        setAssistantChatMessages(response.turns)
      }
    } catch {
      // The history shown stays as it was.
    }
  }, [])

  const clearAssistantChat = useCallback(async () => {
    assistantChatHistoryTokenRef.current += 1
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

  const sendAssistantChat = useCallback(async (text: string) => {
    if (!settings.assistantChatEnabled) {
      setAssistantChatError('Chatbot is disabled in settings.')
      return
    }

    const sendAssistantChatMessage = window.jplearnDesktop?.sendAssistantChatMessage
    if (!sendAssistantChatMessage) {
      setAssistantChatError('Assistant chat runtime is unavailable in this build.')
      return
    }

    const message = text.trim()
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
    assistantChatHistoryTokenRef.current += 1
    assistantChatPendingRef.current = true
    setAssistantChatMessages((previous) => [...previous, optimisticTurn])
    setAssistantChatLoading(true)
    setAssistantChatError(null)
    try {
      let response: Awaited<ReturnType<typeof sendAssistantChatMessage>>
      try {
        response = await sendAssistantChatMessage({
          message,
          context: {
            session_id: deps.activeSessionId ?? '',
          },
        })
      } catch (error: unknown) {
        /* A FAILED TURN IS AN ERROR, NOT A REPLY (audit 15, D2): the question leaves the chat (the
           main process kept neither half) and the reason stands where the reply would be. A cancel
           arrives here too, as "the request was stopped". */
        setAssistantChatMessages((previous) => previous.filter((turn) => turn !== optimisticTurn))
        const reason = ipcErrorReason(error).split(/\r?\n/)[0].trim()
        setAssistantChatError(`${TUTOR_FAILED_PREFIX}${reason || TUTOR_NO_REASON}`)
        return
      }
      // the exchange is in the main process's array now, so the read that shows it may run
      assistantChatPendingRef.current = false
      await refreshAssistantChatHistory()
      if (response.text) {
        void speakAssistantReply(response.text)
      }
    } finally {
      assistantChatPendingRef.current = false
      setAssistantChatLoading(false)
    }
  }, [deps.activeSessionId, refreshAssistantChatHistory, settings.assistantChatEnabled, speakAssistantReply])

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
    if (!deps.ocrInstalled || !deps.translationReady) {
      setOcrWorkbenchError('Image Translation is not installed. Install it in Settings › Assistant › Image Translation.')
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
    /* the last image's lines go now: they are published before its translation ends, so leaving
       them would put this image's error beside that image's text (review, finding 5) */
    setOcrWorkbenchResult(null)
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

      const lineCount = Number.isFinite(ocrResponse?.lineCount)
        ? Math.max(0, Math.trunc(ocrResponse.lineCount))
        : extractedText.split(/\n+/).filter(Boolean).length
      /* THE PER-LINE CONFIDENCE WAS ALWAYS IN THE PAYLOAD and the renderer used to drop it. Kept, so
         a line read at 22% can be marked as the one worth checking. Falls back to the text's own
         lines (at no stated confidence) for a runtime that does not send them. */
      const lines = Array.isArray(ocrResponse?.lines) && ocrResponse.lines.length > 0
        ? ocrResponse.lines
          .filter((line) => typeof line?.text === 'string' && line.text.trim())
          .map((line) => ({
            text: line.text.trim(),
            confidence: typeof line.confidence === 'number' ? line.confidence : 0,
          }))
        : extractedText.split(/\n+/).filter(Boolean).map((text) => ({ text, confidence: Number.NaN }))

      /* THE TEXT THAT WAS READ IS KEPT WHATEVER THE TRANSLATION DOES. It is published before the
         translation is asked for, so a translation that fails leaves the Japanese on screen with the
         reason above it rather than throwing away what the reader already got. */
      const readResult: OcrWorkbenchResult = {
        fileName: file.name,
        lineCount,
        japaneseText: extractedText,
        englishText: '',
        lines,
        imageUrl: `data:${payload.mimeType};base64,${payload.imageBase64}`,
        minConfidence: settings.assistantChatOcrMinConfidence,
        clipped: false,
      }
      setOcrWorkbenchResult(readResult)

      let translationResponse: Awaited<ReturnType<typeof translateAssistantChatOcrText>>
      try {
        translationResponse = await translateAssistantChatOcrText({
          text: extractedText,
          sourceLang: 'ja',
          targetLang: 'en',
          fastMode: true,
        })
      } catch (error: unknown) {
        if (isStale()) return
        const firstLine = ipcErrorReason(error).split(/\r?\n/)[0].trim()
        setOcrWorkbenchError(`${OCR_TRANSLATION_FAILED_PREFIX}${firstLine || OCR_NO_TRANSLATION_REASON}`)
        return
      }
      if (isStale()) return
      const rawEnglishText = (translationResponse?.text ?? '').trim()
      const finalEnglishText = normalizeTranslationWhitespace(sanitizeOcrTranslationText(rawEnglishText))

      if (!finalEnglishText) {
        setOcrWorkbenchError(`${OCR_TRANSLATION_FAILED_PREFIX}${OCR_NO_TRANSLATION_REASON}`)
        return
      }

      setOcrWorkbenchResult({
        ...readResult,
        englishText: finalEnglishText,
        clipped: translationResponse?.clipped === true,
      })
    } catch (error: unknown) {
      if (isStale()) return
      const detail = error instanceof Error && error.message ? error.message : 'Unable to extract text from this image.'
      setOcrWorkbenchError(detail)
    } finally {
      if (!isStale()) setOcrWorkbenchBusy(false)
    }
  }, [deps.ocrInstalled, deps.translationReady, settings.assistantChatOcrMinConfidence])

  useEffect(() => {
    if (!settings.assistantChatEnabled) {
      return
    }
    void refreshAssistantChatHistory()
  }, [refreshAssistantChatHistory, settings.assistantChatEnabled])

  // oxlint-disable react-hooks/exhaustive-deps — voice is injected via VoiceDeps, not a stable ref
  useEffect(() => {
    if (settings.assistantChatAudioEnabled && assistantChatOpen) {
      return
    }
    voice.cancelAssistantSpeech()
  }, [assistantChatOpen, settings.assistantChatAudioEnabled, voice.cancelAssistantSpeech])

  // Clears transient chat feedback (the error line) whenever
  // chat stops being the visible activity, for any reason — popup closed,
  // switched to another mode, or back to the menu. Chat messages and the
  // draft input are NOT cleared here; they persist across all of these.
  useEffect(() => {
    if (assistantChatOpen) return
    setAssistantChatError(null)
  }, [assistantChatOpen])

  useEffect(() => {
    if (!settings.assistantChatEnabled || !assistantChatOpen) {
      return
    }
    void refreshAssistantChatHistory()
  }, [assistantChatOpen, refreshAssistantChatHistory, settings.assistantChatEnabled])

  useEffect(() => {
    if (settings.assistantChatEnabled) {
      return
    }

    // Chat was just disabled in settings: A QUESTION dims to its no-model
    // state, and nothing it was doing is left running.
    setAssistantChatLoading(false)
    setAssistantChatError(null)

    const unloadAssistantChatRuntime = window.jplearnDesktop?.unloadAssistantChatRuntime
    if (!unloadAssistantChatRuntime) {
      return
    }
    void unloadAssistantChatRuntime().catch(() => undefined)
  }, [settings.assistantChatEnabled])

  /* THE TUTOR WARMS ONLY WHILE THE CHAT IS ON (audit 11, F3; Robbie: "Only if chat is on"). The
     main process no longer loads the model at launch. Once the window is up, and once more each
     time the chat is switched back on, it is asked to; never while the chat is off. */
  /* Refs rather than state: startup-ready is a signal, and re-rendering the whole app for it at
     launch would buy nothing. */
  const startupReadyRef = useRef(false)
  const assistantChatEnabledRef = useRef(settings.assistantChatEnabled)
  const assistantChatWarmedRef = useRef(false)
  const warmAssistantChat = useCallback(() => {
    if (!startupReadyRef.current || assistantChatWarmedRef.current) return
    assistantChatWarmedRef.current = true
    void window.jplearnDesktop?.preloadAssistantChatRuntime?.().catch(() => undefined)
  }, [])
  useEffect(() => {
    assistantChatEnabledRef.current = settings.assistantChatEnabled
    if (!settings.assistantChatEnabled) {
      assistantChatWarmedRef.current = false
      return
    }
    warmAssistantChat()
  }, [settings.assistantChatEnabled, warmAssistantChat])
  const notifyTutorStartupReady = useCallback(() => {
    startupReadyRef.current = true
    if (assistantChatEnabledRef.current) warmAssistantChat()
  }, [warmAssistantChat])

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

  const activeAssistantToast = useMemo(() => assistantToasts[0] ?? null, [assistantToasts])

  return {
    assistantChatOpen,
    assistantChatMessages,
    assistantChatLoading,
    assistantChatError,
    assistantSpeakingTurnKey,
    clearAssistantChat,
    sendAssistantChat,
    replayAssistantTurn,
    ocrWorkbenchBusy,
    ocrWorkbenchError,
    ocrWorkbenchResult,
    handleOcrWorkbenchImageSelected,
    clearOcrWorkbenchResult,
    activeAssistantToast,
    dismissAssistantToast,
    launchAssistantToastAction,
    queueAssistantToast,
    notifyTutorStartupReady,
  }
}
