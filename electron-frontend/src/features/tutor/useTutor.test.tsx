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
    translationReady: true,
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

/* THE POP-UP'S MODES RETIRED WITH IT: chat is Look it up's A QUESTION and image translation its A
   SCREENSHOT. What these tests held about the pop-up -- that the chat's effects run only while it
   is showing, and that nothing a learner made is thrown away by moving around -- is held here
   against Look it up's routes instead. */
describe('useTutor — the two routes it serves in Look it up', () => {
  beforeEach(() => {
    installDesktopApi()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('counts the chat as showing exactly while Look it up stands on A QUESTION', () => {
    const { result, rerender } = renderHook(
      ({ visible }) => useTutor(baseSettings(), baseDeps({ lookupChatVisible: visible })),
      { initialProps: { visible: false } },
    )
    expect(result.current.assistantChatOpen).toBe(false)
    rerender({ visible: true })
    expect(result.current.assistantChatOpen).toBe(true)
    rerender({ visible: false })
    expect(result.current.assistantChatOpen).toBe(false)
  })

  it('reads the chat history in only while A QUESTION is showing', async () => {
    const getAssistantChatHistory = vi.fn(async () => ({ ok: true, turns: [] }))
    installDesktopApi({ getAssistantChatHistory } as unknown as Partial<Window['jplearnDesktop']>)
    const { rerender } = renderHook(
      ({ visible }) => useTutor(baseSettings(), baseDeps({ lookupChatVisible: visible })),
      { initialProps: { visible: false } },
    )
    const before = getAssistantChatHistory.mock.calls.length
    rerender({ visible: true })
    await waitFor(() => expect(getAssistantChatHistory.mock.calls.length).toBeGreaterThan(before))
  })

  it('keeps the conversation when A QUESTION is left and come back to', async () => {
    const sendAssistantChatMessage = vi.fn(async () => ({ text: 'Both are し plus a small kana.', provider: 'llama' }))
    const turns = [
      { role: 'user', content: 'why しゃ?', created_at_utc: '2026-10-26T00:00:00Z' },
      { role: 'assistant', content: 'Both are し plus a small kana.', created_at_utc: '2026-10-26T00:00:01Z' },
    ]
    installDesktopApi({
      sendAssistantChatMessage,
      getAssistantChatHistory: vi.fn(async () => ({ ok: true, turns })),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result, rerender } = renderHook(
      ({ visible }) => useTutor(baseSettings(), baseDeps({ lookupChatVisible: visible })),
      { initialProps: { visible: true } },
    )
    await act(async () => { await result.current.sendAssistantChat('why しゃ?') })
    expect(sendAssistantChatMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'why しゃ?' }))
    await waitFor(() => expect(result.current.assistantChatMessages).toHaveLength(2))

    rerender({ visible: false })
    rerender({ visible: true })
    expect(result.current.assistantChatMessages).toHaveLength(2)
  })

  it('refuses an empty question and one over the length limit without calling the model', async () => {
    const sendAssistantChatMessage = vi.fn(async () => ({ text: 'x' }))
    installDesktopApi({ sendAssistantChatMessage } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps({ lookupChatVisible: true })))
    await act(async () => { await result.current.sendAssistantChat('   ') })
    await act(async () => { await result.current.sendAssistantChat('あ'.repeat(5000)) })
    expect(sendAssistantChatMessage).not.toHaveBeenCalled()
    expect(result.current.assistantChatError).toContain('limited to')
  })

  it('keeps an OCR error through the lookup closing and opening -- only Clear removes it', async () => {
    const { result, rerender } = renderHook(
      ({ visible }) => useTutor(baseSettings(), baseDeps({ lookupChatVisible: visible })),
      { initialProps: { visible: false } },
    )

    // An oversized file is rejected synchronously, before any image decoding,
    // so this exercises the real error-setting path without needing canvas/Image.
    const oversizedFile = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(oversizedFile, 'size', { value: 100 * 1024 * 1024 })
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(oversizedFile)
    })
    await waitFor(() => expect(result.current.ocrWorkbenchError).toContain('limited to'))

    rerender({ visible: true })
    rerender({ visible: false })
    expect(result.current.ocrWorkbenchError).toContain('limited to')

    act(() => result.current.clearOcrWorkbenchResult())
    expect(result.current.ocrWorkbenchError).toBeNull()
  })

  it('keeps an OCR result, with its lines and the image, until Clear', async () => {
    installDesktopApi({
      extractAssistantChatImageText: vi.fn(async () => ({
        text: '日本語', lineCount: 1, lines: [{ text: '日本語', confidence: 0.97 }],
      })),
      translateAssistantChatOcrText: vi.fn(async () => ({ text: 'Japanese' })),
    } as unknown as Partial<Window['jplearnDesktop']>)

    const { result, rerender } = renderHook(
      ({ visible }) => useTutor(baseSettings(), baseDeps({ lookupChatVisible: visible })),
      { initialProps: { visible: false } },
    )
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' }))
    })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.englishText).toBe('Japanese'))
    expect(result.current.ocrWorkbenchResult?.lines).toEqual([{ text: '日本語', confidence: 0.97 }])
    expect(result.current.ocrWorkbenchResult?.imageUrl).toBe('data:image/png;base64,AAAA')
    expect(result.current.ocrWorkbenchResult?.minConfidence).toBe(0.5)

    rerender({ visible: true })
    rerender({ visible: false })
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
    // a line count with no per-line detail still gives the lines, with no confidence claimed
    expect(result.current.ocrWorkbenchResult?.lines.map((line) => line.text)).toEqual(['二番目'])
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

  it('refuses an image while translation is not ready, with the not-installed sentence', async () => {
    const extractAssistantChatImageText = vi.fn()
    installDesktopApi({
      extractAssistantChatImageText,
      translateAssistantChatOcrText: vi.fn(),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps({ translationReady: false })))
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' }))
    })
    expect(result.current.ocrWorkbenchError).toBe('Image Translation is not installed. Install it in Settings › Assistant › Image Translation.')
    expect(extractAssistantChatImageText).not.toHaveBeenCalled()
  })

  it('publishes the lines read before the translation answers', async () => {
    const translation = deferred<{ text: string; clipped?: boolean }>()
    installDesktopApi({
      extractAssistantChatImageText: vi.fn(async () => ({
        text: '本日休業', lineCount: 1, lines: [{ text: '本日休業', confidence: 0.98 }],
      })),
      translateAssistantChatOcrText: vi.fn(() => translation.promise),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => { void result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' })) })

    await waitFor(() => expect(result.current.ocrWorkbenchResult?.japaneseText).toBe('本日休業'))
    expect(result.current.ocrWorkbenchResult?.englishText).toBe('')
    expect(result.current.ocrWorkbenchBusy).toBe(true)

    await act(async () => { translation.resolve({ text: 'Closed today.', clipped: true }) })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.englishText).toBe('Closed today.'))
    expect(result.current.ocrWorkbenchResult?.clipped).toBe(true)
    expect(result.current.ocrWorkbenchBusy).toBe(false)
  })

  it('reads a translation result with no clipped field as not clipped', async () => {
    installDesktopApi({
      extractAssistantChatImageText: vi.fn(async () => ({ text: '日本語', lineCount: 1 })),
      translateAssistantChatOcrText: vi.fn(async () => ({ text: 'Japanese' })),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' }))
    })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.englishText).toBe('Japanese'))
    expect(result.current.ocrWorkbenchResult?.clipped).toBe(false)
  })

  it('keeps the lines when the translation fails, and says why in its first line', async () => {
    installDesktopApi({
      extractAssistantChatImageText: vi.fn(async () => ({
        text: '本日休業', lineCount: 1, lines: [{ text: '本日休業', confidence: 0.98 }],
      })),
      translateAssistantChatOcrText: vi.fn(async () => {
        throw new Error("Error invoking remote method 'assistant-chat:translate-ocr-text': Error: llama.cpp exited early\n  at runner.cjs:12")
      }),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' }))
    })

    await waitFor(() => expect(result.current.ocrWorkbenchBusy).toBe(false))
    expect(result.current.ocrWorkbenchError).toBe("Read the text, but couldn't translate it: llama.cpp exited early")
    expect(result.current.ocrWorkbenchResult?.lines).toEqual([{ text: '本日休業', confidence: 0.98 }])
    expect(result.current.ocrWorkbenchResult?.japaneseText).toBe('本日休業')
    expect(result.current.ocrWorkbenchResult?.englishText).toBe('')
  })

  it('keeps the lines when the translation comes back empty', async () => {
    installDesktopApi({
      extractAssistantChatImageText: vi.fn(async () => ({ text: '本日休業', lineCount: 1 })),
      translateAssistantChatOcrText: vi.fn(async () => ({ text: '   ' })),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'sign.png', { type: 'image/png' }))
    })

    await waitFor(() => expect(result.current.ocrWorkbenchBusy).toBe(false))
    expect(result.current.ocrWorkbenchError).toBe("Read the text, but couldn't translate it: no translation came back")
    expect(result.current.ocrWorkbenchResult?.lines.map((line) => line.text)).toEqual(['本日休業'])
  })

  it('drops a superseded translation failure', async () => {
    const firstTranslation = deferred<{ text: string }>()
    const extractAssistantChatImageText = vi.fn()
      .mockResolvedValueOnce({ text: '一番目', lineCount: 1 })
      .mockResolvedValueOnce({ text: '二番目', lineCount: 1 })
    installDesktopApi({
      extractAssistantChatImageText,
      translateAssistantChatOcrText: vi.fn()
        .mockReturnValueOnce(firstTranslation.promise)
        .mockResolvedValueOnce({ text: 'Second' }),
    } as unknown as Partial<Window['jplearnDesktop']>)
    const { result } = renderHook(() => useTutor(baseSettings(), baseDeps()))
    act(() => { void result.current.handleOcrWorkbenchImageSelected(new File(['a'], 'first.png', { type: 'image/png' })) })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.fileName).toBe('first.png'))
    await act(async () => {
      await result.current.handleOcrWorkbenchImageSelected(new File(['b'], 'second.png', { type: 'image/png' }))
    })
    await waitFor(() => expect(result.current.ocrWorkbenchResult?.englishText).toBe('Second'))

    await act(async () => { firstTranslation.reject(new Error('stale translation failed')) })
    expect(result.current.ocrWorkbenchError).toBeNull()
    expect(result.current.ocrWorkbenchResult?.fileName).toBe('second.png')
  })

  it('disabling chat in settings stops the chat and unloads its runtime, wherever it was showing', async () => {
    const unloadAssistantChatRuntime = vi.fn(async () => ({ ok: true }))
    installDesktopApi({ unloadAssistantChatRuntime } as unknown as Partial<Window['jplearnDesktop']>)
    const { result, rerender } = renderHook(
      ({ settings }) => useTutor(settings, baseDeps({ lookupChatVisible: true })),
      { initialProps: { settings: baseSettings({ assistantChatEnabled: true }) } },
    )
    rerender({ settings: baseSettings({ assistantChatEnabled: false }) })
    await waitFor(() => expect(unloadAssistantChatRuntime).toHaveBeenCalled())
    expect(result.current.assistantChatLoading).toBe(false)
    expect(result.current.assistantChatError).toBeNull()
  })
})
