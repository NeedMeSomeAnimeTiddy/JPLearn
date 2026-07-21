import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScenarioTutor } from './useScenarioTutor'
import type { ScenarioVoiceDeps } from './types'

/** Stand-in for useMicRecorder: the real one needs MediaRecorder and
 * getUserMedia, which jsdom does not provide. Tests deliver a recorded buffer
 * by invoking the onComplete the hook registered, exactly as the recorder
 * would once the learner stops speaking. */
const mic = vi.hoisted(() => ({
  onComplete: null as null | ((result: { blob: Blob; mimeType: string }) => void),
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('../../hooks/useMicRecorder', () => ({
  useMicRecorder: (options: { onComplete: (result: { blob: Blob; mimeType: string }) => void }) => {
    mic.onComplete = options.onComplete
    return { state: 'idle', errorReason: null, elapsedMs: 0, start: mic.start, stop: mic.stop, reset: mic.reset }
  },
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

type Transcription = { text: string; confidence: number; durationMs: number }

/** jsdom's Blob has no arrayBuffer(), which the base64 encoder needs; the
 * Chromium runtime the app actually ships on does. */
function recordedBlob(): Blob {
  return {
    type: 'audio/webm',
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  } as unknown as Blob
}

async function deliverRecording() {
  await act(async () => {
    mic.onComplete?.({ blob: recordedBlob(), mimeType: 'audio/webm' })
  })
}

function makeVoice({ voiceUnavailable = false, playbackFails = false } = {}) {
  const playVoiceRuntimeAudio = vi.fn(async (_text: string, _runId: number, _speedScale?: number) => {
    if (playbackFails) throw new Error('no audio device')
    return true
  })
  const cancelAssistantSpeech = vi.fn()
  const assistantSpeechRunIdRef = { current: 0 }
  const voice: ScenarioVoiceDeps = {
    playVoiceRuntimeAudio,
    cancelAssistantSpeech,
    assistantSpeechRunIdRef,
    voiceUnavailable,
  }
  return { voice, playVoiceRuntimeAudio, cancelAssistantSpeech, assistantSpeechRunIdRef }
}

function speechApi(overrides: Record<string, unknown> = {}) {
  return {
    getSpeechStatus: vi.fn(async () => ({ available: true, running: true, lastError: null })),
    transcribeSpeech: vi.fn(async (): Promise<Transcription> => ({ text: 'こんにちは', confidence: 0.9, durationMs: 900 })),
    ...overrides,
  }
}

function startCafeOrder(
  result: { current: ReturnType<typeof useScenarioTutor> },
  level: 'beginner' | 'intermediate' = 'beginner',
) {
  act(() => result.current.selectScenario('cafe-order'))
  act(() => result.current.selectLevel(level))
  act(() => result.current.startScenario())
}

beforeEach(() => {
  mic.onComplete = null
  mic.start.mockClear()
  mic.stop.mockClear()
  mic.reset.mockClear()
})

afterEach(() => {
  cleanup()
  delete (window as { jplearnDesktop?: unknown }).jplearnDesktop
})

describe('useScenarioTutor — NPC audio playback', () => {
  it('speaks the opening NPC line on the shared audio channel, slowed for beginners', async () => {
    const { voice, playVoiceRuntimeAudio, assistantSpeechRunIdRef } = makeVoice()
    const { result } = renderHook(() => useScenarioTutor({ voice }))
    startCafeOrder(result)

    await waitFor(() => expect(playVoiceRuntimeAudio).toHaveBeenCalled())
    // Taking the shared run id is what cuts off a chat reply mid-sentence.
    expect(assistantSpeechRunIdRef.current).toBe(1)
    const [spokenText, runId, speedScale] = playVoiceRuntimeAudio.mock.calls[0]
    expect(typeof spokenText).toBe('string')
    expect(runId).toBe(1)
    expect(speedScale).toBe(0.85)
    expect(result.current.npcAudioAvailable).toBe(true)
  })

  it('plays NPC lines at the learner-set speed for intermediate learners', async () => {
    const { voice, playVoiceRuntimeAudio } = makeVoice()
    const { result } = renderHook(() => useScenarioTutor({ voice }))
    startCafeOrder(result, 'intermediate')

    await waitFor(() => expect(playVoiceRuntimeAudio).toHaveBeenCalled())
    expect(playVoiceRuntimeAudio.mock.calls[0][2]).toBe(1)
  })

  it('stays silent when coach audio is off or the voice runtime is unavailable', () => {
    const off = makeVoice()
    const { result: offResult } = renderHook(() => useScenarioTutor({ voice: off.voice, audioEnabled: false }))
    startCafeOrder(offResult)
    expect(off.playVoiceRuntimeAudio).not.toHaveBeenCalled()
    expect(offResult.current.npcAudioAvailable).toBe(false)

    const dead = makeVoice({ voiceUnavailable: true })
    const { result: deadResult } = renderHook(() => useScenarioTutor({ voice: dead.voice }))
    startCafeOrder(deadResult)
    expect(dead.playVoiceRuntimeAudio).not.toHaveBeenCalled()
    expect(deadResult.current.npcAudioAvailable).toBe(false)
    // The conversation itself is unaffected — the NPC line is on screen.
    expect(deadResult.current.session?.transcript.some((turn) => turn.npcLine !== null)).toBe(true)
  })

  it('completes the scenario even when every playback attempt fails', async () => {
    const { voice } = makeVoice({ playbackFails: true })
    const { result } = renderHook(() => useScenarioTutor({ voice }))

    startCafeOrder(result)
    const respond = (text: string) => {
      act(() => result.current.setLearnerInputValue(text))
      act(() => result.current.submitResponse())
    }
    respond('こんにちは')
    respond('コーヒーをください')
    respond('レギュラーでお願いします')
    respond('ここで食べます')
    respond('はい、お願いします')
    respond('ありがとうございます')

    expect(result.current.screen).toBe('summary')
    expect(result.current.session?.status).toBe('success')
    await waitFor(() => expect(result.current.npcSpeaking).toBe(false))
  })

  it('replays a single line on request, and offers no audio at all without voice deps', () => {
    const { voice, playVoiceRuntimeAudio } = makeVoice()
    const { result } = renderHook(() => useScenarioTutor({ voice }))
    startCafeOrder(result)
    playVoiceRuntimeAudio.mockClear()

    act(() => result.current.replayNpcLine({ ja: 'いらっしゃいませ', reading: 'いらっしゃいませ', en: 'Welcome' }))
    expect(playVoiceRuntimeAudio).toHaveBeenCalledWith('いらっしゃいませ', expect.any(Number), 0.85)

    const { result: silent } = renderHook(() => useScenarioTutor())
    startCafeOrder(silent)
    expect(silent.current.npcAudioAvailable).toBe(false)
  })
})

describe('useScenarioTutor — speech input', () => {
  it('offers speech input only when the local speech runtime reports available', async () => {
    window.jplearnDesktop = speechApi() as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    await waitFor(() => expect(result.current.speechInputAvailable).toBe(true))

    cleanup()
    window.jplearnDesktop = speechApi({
      getSpeechStatus: vi.fn(async () => ({ available: false, running: false, lastError: 'model missing' })),
    }) as unknown as Window['jplearnDesktop']
    const { result: unavailable } = renderHook(() => useScenarioTutor())
    await waitFor(() => expect(unavailable.current.speechInputAvailable).toBe(false))

    cleanup()
    window.jplearnDesktop = speechApi({
      getSpeechStatus: vi.fn(async () => { throw new Error('runtime down') }),
    }) as unknown as Window['jplearnDesktop']
    const { result: broken } = renderHook(() => useScenarioTutor())
    await waitFor(() => expect(broken.current.speechInputAvailable).toBe(false))

    cleanup()
    // No transcribe bridge at all in this build.
    window.jplearnDesktop = {} as unknown as Window['jplearnDesktop']
    const { result: missing } = renderHook(() => useScenarioTutor())
    await waitFor(() => expect(missing.current.speechInputAvailable).toBe(false))
  })

  it('places a confident transcription in the input for confirmation and grades it as speech', async () => {
    const api = speechApi()
    window.jplearnDesktop = api as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    expect(mic.start).toHaveBeenCalledOnce()
    await deliverRecording()

    await waitFor(() => expect(result.current.learnerInputValue).toBe('こんにちは'))
    expect(result.current.heardTranscript).toBe('こんにちは')
    expect(result.current.sttError).toBeNull()
    expect(api.transcribeSpeech).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'audio/webm', language: 'ja' }))

    act(() => result.current.submitResponse())
    const learnerTurn = result.current.session?.transcript.find((turn) => turn.learnerInput === 'こんにちは')
    expect(learnerTurn?.inputSource).toBe('stt')
    expect(result.current.heardTranscript).toBeNull()
  })

  it('grades an edited transcription as typed input', async () => {
    window.jplearnDesktop = speechApi() as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()
    await waitFor(() => expect(result.current.learnerInputValue).toBe('こんにちは'))

    act(() => result.current.setLearnerInputValue('こんにちは！'))
    act(() => result.current.submitResponse())
    const learnerTurn = result.current.session?.transcript.find((turn) => turn.learnerInput === 'こんにちは！')
    expect(learnerTurn?.inputSource).toBe('typed')
  })

  it('rejects an unusable transcription without grading it or consuming an attempt', async () => {
    window.jplearnDesktop = speechApi({
      transcribeSpeech: vi.fn(async (): Promise<Transcription> => ({ text: 'こんにちは', confidence: 0.2, durationMs: 400 })),
    }) as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)
    const nodeBefore = result.current.session?.currentNodeId
    const attemptsBefore = { ...result.current.session?.attempts }

    act(() => result.current.startRecording())
    await deliverRecording()

    await waitFor(() => expect(result.current.sttError).toContain("Didn't catch that"))
    expect(result.current.learnerInputValue).toBe('')
    expect(result.current.heardTranscript).toBeNull()
    expect(result.current.session?.currentNodeId).toBe(nodeBefore)
    expect(result.current.session?.attempts).toEqual(attemptsBefore)
  })

  it('rejects an empty transcription the same way', async () => {
    window.jplearnDesktop = speechApi({
      transcribeSpeech: vi.fn(async (): Promise<Transcription> => ({ text: '   ', confidence: 0.99, durationMs: 400 })),
    }) as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()

    await waitFor(() => expect(result.current.sttError).toContain("Didn't catch that"))
    expect(result.current.learnerInputValue).toBe('')
  })

  it('surfaces a transcription failure and keeps the typed path open', async () => {
    window.jplearnDesktop = speechApi({
      transcribeSpeech: vi.fn(async (): Promise<Transcription> => { throw new Error('whisper crashed') }),
    }) as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()

    await waitFor(() => expect(result.current.sttError).toContain('whisper crashed'))
    expect(result.current.sttError).toContain('type your response')

    act(() => result.current.setLearnerInputValue('こんにちは'))
    act(() => result.current.submitResponse())
    expect(result.current.session?.currentNodeId).toBe('n-order')
  })

  it('reports a missing speech bridge instead of throwing', async () => {
    window.jplearnDesktop = {} as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()

    await waitFor(() => expect(result.current.sttError).toContain('unavailable'))
  })

  it('discards a cancelled recording without transcribing it', async () => {
    const api = speechApi()
    window.jplearnDesktop = api as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    act(() => result.current.cancelRecording())
    expect(mic.reset).toHaveBeenCalled()
    await deliverRecording()

    expect(api.transcribeSpeech).not.toHaveBeenCalled()
    expect(result.current.learnerInputValue).toBe('')
  })

  it('stops NPC playback as soon as the learner starts recording', () => {
    const { voice, cancelAssistantSpeech } = makeVoice()
    window.jplearnDesktop = speechApi() as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor({ voice }))
    startCafeOrder(result)
    cancelAssistantSpeech.mockClear()

    act(() => result.current.startRecording())
    expect(cancelAssistantSpeech).toHaveBeenCalledOnce()
    expect(result.current.npcSpeaking).toBe(false)
  })
})

describe('useScenarioTutor — speech race safety', () => {
  it('drops a transcription that resolves after the session was abandoned', async () => {
    const pending = deferred<Transcription>()
    const api = speechApi({ transcribeSpeech: vi.fn(() => pending.promise) })
    window.jplearnDesktop = api as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()
    await waitFor(() => expect(api.transcribeSpeech).toHaveBeenCalledOnce())

    act(() => result.current.requestAbandon())
    act(() => result.current.confirmPendingAction())
    await act(async () => { pending.resolve({ text: 'コーヒーをください', confidence: 0.95, durationMs: 900 }) })

    expect(result.current.learnerInputValue).toBe('')
    expect(result.current.heardTranscript).toBeNull()
    expect(result.current.session).toBeNull()
  })

  it('drops a transcription that resolves after the learner already took the turn', async () => {
    const pending = deferred<Transcription>()
    const api = speechApi({ transcribeSpeech: vi.fn(() => pending.promise) })
    window.jplearnDesktop = api as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()
    await waitFor(() => expect(api.transcribeSpeech).toHaveBeenCalledOnce())

    // The learner gives up on the mic and types the answer instead.
    act(() => result.current.setLearnerInputValue('こんにちは'))
    act(() => result.current.submitResponse())
    expect(result.current.session?.currentNodeId).toBe('n-order')

    await act(async () => { pending.resolve({ text: 'こんばんは', confidence: 0.95, durationMs: 900 }) })

    // The stale transcript must not land in the box for the new turn.
    expect(result.current.learnerInputValue).toBe('')
    expect(result.current.heardTranscript).toBeNull()
  })

  it('keeps a transcription that resolves while the popup was closed or switched away', async () => {
    const pending = deferred<Transcription>()
    const api = speechApi({ transcribeSpeech: vi.fn(() => pending.promise) })
    window.jplearnDesktop = api as unknown as Window['jplearnDesktop']
    const { result } = renderHook(() => useScenarioTutor())
    startCafeOrder(result)

    act(() => result.current.startRecording())
    await deliverRecording()
    await waitFor(() => expect(api.transcribeSpeech).toHaveBeenCalledOnce())

    // Closing the popup or switching modes is presentation only: neither the
    // session token nor the turn epoch moves, so the result still applies.
    await act(async () => { pending.resolve({ text: 'こんにちは', confidence: 0.95, durationMs: 900 }) })

    await waitFor(() => expect(result.current.learnerInputValue).toBe('こんにちは'))
  })

  it('cancels playback and resets the recorder when a session is abandoned or restarted', () => {
    const { voice, cancelAssistantSpeech } = makeVoice()
    const { result } = renderHook(() => useScenarioTutor({ voice }))
    startCafeOrder(result)
    cancelAssistantSpeech.mockClear()
    mic.reset.mockClear()

    act(() => result.current.requestAbandon())
    act(() => result.current.confirmPendingAction())
    expect(cancelAssistantSpeech).toHaveBeenCalled()
    expect(mic.reset).toHaveBeenCalled()

    startCafeOrder(result)
    cancelAssistantSpeech.mockClear()
    act(() => result.current.requestRestart())
    act(() => result.current.confirmPendingAction())
    expect(cancelAssistantSpeech).toHaveBeenCalled()
  })
})
