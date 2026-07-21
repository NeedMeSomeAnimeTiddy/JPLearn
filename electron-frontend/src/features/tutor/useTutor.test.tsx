import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTutor } from './useTutor'
import type { TutorDeps, TutorSettingsFields } from './types'

// Only the image-decoding step is stubbed: it needs FileReader + Image +
// canvas, none of which jsdom provides. Everything else in utils stays real.
vi.mock('./utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./utils')>()),
  prepareAssistantChatImagePayload: vi.fn(async () => ({ mimeType: 'image/png' as const, imageBase64: 'AAAA' })),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function baseSettings(overrides: Partial<TutorSettingsFields> = {}): TutorSettingsFields {
  return {
    assistantToastLimit: 0,
    assistantChatEnabled: true,
    assistantChatAudioEnabled: false,
    assistantChatOcrMinConfidence: 0.5,
    scenarioAiEvaluationEnabled: true,
    romajiConversionEnabled: true,
    ...overrides,
  }
}

function baseDeps(overrides: Partial<TutorDeps> = {}): TutorDeps {
  return {
    voice: {
      playVoiceRuntimeAudio: vi.fn(async () => true),
      cancelAssistantSpeech: vi.fn(),
      assistantSpeechRunIdRef: { current: 0 },
      splitSpeechSegments: () => [],
    },
    isInMinigameSession: false,
    activeSessionId: null,
    activeScript: 'hiragana',
    ocrInstalled: true,
    onToastNavigate: vi.fn(),
    ...overrides,
  }
}

function installDesktopApi(overrides: Partial<Window['jplearnDesktop']> = {}) {
  window.jplearnDesktop = {
    getAssistantChatHistory: vi.fn(async () => ({ ok: true, turns: [] })),
    getPreloadedAssistantChatHistory: vi.fn(async () => ({ ok: false, runtimeActive: false, turns: [] })),
    getAssistantChatRuntimeStatus: vi.fn(async () => ({ loaded: false, loadedAtUtc: null, lastUsedAtUtc: null, inactivityUnloadMs: 0 })),
    getAssistantEvents: vi.fn(async () => ({ ok: true, events: [] })),
    consumeAssistantEvents: vi.fn(async () => ({ ok: true })),
    getAssistantSnapshot: vi.fn(async () => ({ ok: true })),
    ...overrides,
  } as unknown as Window['jplearnDesktop']
}

describe('useTutor — shared popup mode navigation', () => {
  beforeEach(() => {
    installDesktopApi()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('opens at the menu by default', () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    expect(result.current.tutorPanelOpen).toBe(false)
    act(() => result.current.openTutorPanel())
    expect(result.current.tutorPanelOpen).toBe(true)
    expect(result.current.tutorPanelMode).toBe('menu')
  })

  it.each(['chat', 'scenarios', 'ocr'] as const)('openTutorPanel(%s) opens directly into that mode', (mode) => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel(mode))
    expect(result.current.tutorPanelOpen).toBe(true)
    expect(result.current.tutorPanelMode).toBe(mode)
    // A specific-mode entry still records a return-focus target for Back.
    expect(result.current.tutorPanelReturnFocusMode).toBe(mode)
  })

  it('setTutorPanelMode switches activity without closing the popup', () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel())
    act(() => result.current.setTutorPanelMode('scenarios'))
    expect(result.current.tutorPanelOpen).toBe(true)
    expect(result.current.tutorPanelMode).toBe('scenarios')
  })

  it('returnToTutorMenu goes back to the menu without closing the popup', () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('chat'))
    act(() => result.current.returnToTutorMenu())
    expect(result.current.tutorPanelOpen).toBe(true)
    expect(result.current.tutorPanelMode).toBe('menu')
  })

  it('closeTutorPanel hides the popup but remembers the last mode', () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('ocr'))
    act(() => result.current.closeTutorPanel())
    expect(result.current.tutorPanelOpen).toBe(false)
    expect(result.current.tutorPanelMode).toBe('ocr')
  })

  it('assistantChatOpen and ocrWorkbenchOpen are derived from tutorPanelOpen + tutorPanelMode', () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('chat'))
    expect(result.current.assistantChatOpen).toBe(true)
    expect(result.current.ocrWorkbenchOpen).toBe(false)

    act(() => result.current.setTutorPanelMode('ocr'))
    expect(result.current.assistantChatOpen).toBe(false)
    expect(result.current.ocrWorkbenchOpen).toBe(true)

    act(() => result.current.closeTutorPanel())
    expect(result.current.assistantChatOpen).toBe(false)
    expect(result.current.ocrWorkbenchOpen).toBe(false)
  })

  it('chat draft input and messages survive a mode switch and a full close+reopen cycle', async () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('chat'))
    act(() => result.current.setAssistantChatInput('こんにちは'))
    expect(result.current.assistantChatInput).toBe('こんにちは')

    act(() => result.current.setTutorPanelMode('ocr'))
    expect(result.current.assistantChatInput).toBe('こんにちは')

    act(() => result.current.closeTutorPanel())
    act(() => result.current.openTutorPanel('chat'))
    expect(result.current.assistantChatInput).toBe('こんにちは')
  })

  it('closeTutorPanel does not clear an OCR error — only explicit Clear does', async () => {
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('ocr'))

    // An oversized file is rejected synchronously, before any image decoding,
    // so this exercises the real error-setting path without needing canvas/Image.
    const oversizedFile = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(oversizedFile, 'size', { value: 100 * 1024 * 1024 })
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(oversizedFile)
    })
    await waitFor(() => expect(result.current.ocrWorkbenchError).toContain('limited to'))

    act(() => result.current.setTutorPanelMode('chat'))
    expect(result.current.ocrWorkbenchError).toContain('limited to')

    act(() => result.current.closeTutorPanel())
    act(() => result.current.openTutorPanel('ocr'))
    expect(result.current.ocrWorkbenchError).toContain('limited to')

    act(() => result.current.clearOcrWorkbenchResult())
    expect(result.current.ocrWorkbenchError).toBeNull()
  })

  it('keeps an OCR result across Back, mode switches, and close+reopen until Clear', async () => {
    installDesktopApi({
      extractAssistantChatImageText: vi.fn(async () => ({ text: '日本語', lineCount: 1 })),
      translateAssistantChatOcrText: vi.fn(async () => ({ text: 'Japanese' })),
    } as unknown as Partial<Window['jplearnDesktop']>)

    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('ocr'))
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' }))
    })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.englishText).toBe('Japanese'))

    act(() => result.current.returnToTutorMenu())
    expect(result.current.ocrWorkbenchResult?.fileName).toBe('sign.png')

    act(() => result.current.setTutorPanelMode('scenarios'))
    expect(result.current.ocrWorkbenchResult?.fileName).toBe('sign.png')

    act(() => result.current.closeTutorPanel())
    act(() => result.current.openTutorPanel('ocr'))
    expect(result.current.ocrWorkbenchResult?.fileName).toBe('sign.png')
    expect(result.current.ocrWorkbenchResult?.japaneseText).toBe('日本語')

    // Only the explicit Clear action discards it.
    act(() => result.current.clearOcrWorkbenchResult())
    expect(result.current.ocrWorkbenchResult).toBeNull()
  })

  it('lets only the most recently selected image update the OCR result', async () => {
    const firstExtract = deferred<{ text: string; lineCount: number }>()
    const secondExtract = deferred<{ text: string; lineCount: number }>()
    const extractAssistantChatImageText = vi.fn()
      .mockReturnValueOnce(firstExtract.promise)
      .mockReturnValueOnce(secondExtract.promise)
    installDesktopApi({
      extractAssistantChatImageText,
      translateAssistantChatOcrText: vi.fn(async (payload: { text: string }) => ({ text: `EN(${payload.text})` })),
    } as unknown as Partial<Window['jplearnDesktop']>)

    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('ocr'))

    // Two images in flight; the learner picked the second one last.
    act(() => { void result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'first.png', { type: 'image/png' })) })
    await waitFor(() => expect(extractAssistantChatImageText).toHaveBeenCalledTimes(1))
    act(() => { void result.current.handleOcrWorkbenchImageSelected(new File(['b'], 'second.png', { type: 'image/png' })) })
    await waitFor(() => expect(extractAssistantChatImageText).toHaveBeenCalledTimes(2))

    // The superseded request resolves last and must be ignored entirely.
    await act(async () => { secondExtract.resolve({ text: '二番目', lineCount: 1 }) })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.fileName).toBe('second.png'))
    await act(async () => { firstExtract.resolve({ text: '一番目', lineCount: 1 }) })

    expect(result.current.ocrWorkbenchResult?.fileName).toBe('second.png')
    expect(result.current.ocrWorkbenchResult?.japaneseText).toBe('二番目')
    expect(result.current.ocrWorkbenchBusy).toBe(false)
    expect(result.current.ocrWorkbenchError).toBeNull()
  })

  it('ignores a failure from a superseded OCR request', async () => {
    const firstExtract = deferred<{ text: string; lineCount: number }>()
    const secondExtract = deferred<{ text: string; lineCount: number }>()
    const extractAssistantChatImageText = vi.fn()
      .mockReturnValueOnce(firstExtract.promise)
      .mockReturnValueOnce(secondExtract.promise)
    installDesktopApi({
      extractAssistantChatImageText,
      translateAssistantChatOcrText: vi.fn(async (payload: { text: string }) => ({ text: `EN(${payload.text})` })),
    } as unknown as Partial<Window['jplearnDesktop']>)

    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => result.current.openTutorPanel('ocr'))
    act(() => { void result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'first.png', { type: 'image/png' })) })
    await waitFor(() => expect(extractAssistantChatImageText).toHaveBeenCalledTimes(1))
    act(() => { void result.current.handleOcrWorkbenchImageSelected(new File(['b'], 'second.png', { type: 'image/png' })) })
    await waitFor(() => expect(extractAssistantChatImageText).toHaveBeenCalledTimes(2))

    await act(async () => { secondExtract.resolve({ text: '二番目', lineCount: 1 }) })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.fileName).toBe('second.png'))

    firstExtract.reject(new Error('stale OCR failed'))
    await act(async () => { await Promise.resolve() })

    expect(result.current.ocrWorkbenchError).toBeNull()
    expect(result.current.ocrWorkbenchResult?.fileName).toBe('second.png')
  })

  it('disabling chat in settings redirects out of chat mode back to the menu', () => {
    const { result, rerender } = renderHook(
      ({ settings }) => useTutor(settings, baseDeps()),
      { initialProps: { settings: baseSettings({ assistantChatEnabled: true }) } },
    )
    act(() => result.current.openTutorPanel('chat'))
    expect(result.current.tutorPanelMode).toBe('chat')

    rerender({ settings: baseSettings({ assistantChatEnabled: false }) })
    expect(result.current.tutorPanelMode).toBe('menu')
    // The popup itself is not force-closed — only chat mode is redirected away from.
    expect(result.current.tutorPanelOpen).toBe(true)
  })
})
